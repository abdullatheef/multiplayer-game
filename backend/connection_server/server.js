// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // JWT library
const redis = require('redis'); // Redis client

const redisPublisher = redis.createClient(); 
const redisSubscriber = redis.createClient(); // Create a separate client for subscribing
const channelName = 'game_requests'; // Replace with your channel name

// Connect to Redis for both clients
const connectRedisClients = async () => {
    try {
        await redisPublisher.connect();
        await redisSubscriber.connect();
        console.log('Connected to Redis');
    } catch (error) {
        console.error('Error connecting to Redis:', error);
    }
};

// Call the function to connect
connectRedisClients();


redisPublisher.on('error', (err) => {
    console.error('Redis Publisher Client Error', err);
});

redisSubscriber.on('error', (err) => {
    console.error('Redis Subscriber Client Error', err);
});

// Subscribe to the Redis channel if needed
redisSubscriber.subscribe(channelName, (message) => {
    message = JSON.parse(message)
    console.log('Received message from Redis SUBSCRIBER:', message);
    jwt.verify(message.token, 'your_jwt_secret', (err, decoded) => {
        if (err) {
            console.log(err)
            return false
        }
        if (message.event == 'randomConnect'){
            io.to(`GAME_${message.gameId}`).emit('requestGame', {
                gameId: message.gameId,
                userId: decoded.user_id,
                name: decoded.name,
                uuid: message.uuid
            });
        }
        if (message.event == 'requestGame'){
            const targetUserId = message.targetUserId
            io.to(`USER_${targetUserId}`).emit('requestGame', {
                gameId: message.gameId,
                userId: decoded.user_id,
                name: decoded.name,
                uuid: message.uuid
            });
        }
        if (message.event == 'cancelRequestGame'){
            const targetUserId = message.targetUserId
            io.to(`USER_${targetUserId}`).emit('cancelRequestGame', {
                gameId: message.gameId,
                userId: decoded.user_id,
                name: decoded.name
            });
        }
        if (message.event == 'redirect'){
            const targetUserId = message.targetUserId
            io.to(`USER_${targetUserId}`).emit('redirect', {
                url: message.url
            });
        }
        if (message.event == 'newUser'){
            const gameId = message.gameId
            io.to(`GAME_${gameId}`).emit('newUser', {action: message.action, userId: decoded.user_id});
        }
        
    });
});

// Don't forget to handle process exit
process.on('SIGINT', () => {
    redisSubscriber.quit(() => {
        console.log('Redis client disconnected');
        process.exit(0);
    });
});



const app = express();
const server = http.createServer(app);
const allowedOrigins = ["http://localhost:8000", "http://example.com", "https://pipes-deep-childrens-tire.trycloudflare.com"];

const io = socketIo(server, {
    cors: {
        origin: allowedOrigins, // Allow requests from this origin
        methods: ["GET", "POST"],
        credentials: true // Enable credentials (cookies, authorization headers, etc.)
    }
});

const PORT = 3000;

app.use(cookieParser());
app.use(cors({
    origin: allowedOrigins, // Allow requests from this origin
    credentials: true // Allow credentials (cookies, etc.)
}));


const { Kafka } = require('kafkajs');

// KafkaJS setup
const kafka = new Kafka({
    clientId: 'game-server',
    brokers: ['192.168.1.13:9092']  // Replace with your Kafka broker
});

const producer = kafka.producer();

// Function to produce a "GameConnected" event
const sendToKafka = async (event) => {
    await producer.connect();
    await producer.send({
        topic: 'GameEvents',
        messages: [
            { value: JSON.stringify(event) }
        ]
    });
    console.log('sendToKafka event sent to Kafka:', event);
};

const sendGameConnectedEvent = async (gameConnectedEvent) => {
    gameConnectedEvent.evtName = 'connect'
    await producer.connect();
    await producer.send({
        topic: 'GameEvents',
        messages: [
            { value: JSON.stringify(gameConnectedEvent) }
        ]
    });
    console.log('GameConnected event sent to Kafka:', gameConnectedEvent);
};
const sendGameDisConnectedEvent = async (gameDisConnectedEvent) => {
    gameDisConnectedEvent.evtName = 'disconnect'
    await producer.connect();
    await producer.send({
        topic: 'GameEvents',
        messages: [
            { value: JSON.stringify(gameDisConnectedEvent) }
        ]
    });
    console.log('GameDisConnected event sent to Kafka:', gameDisConnectedEvent);
};

// Middleware to check X-Session-Key during Socket.IO connection
const authenticateSocket = (socket, next) => {
    const cookies = socket.handshake.headers.cookie;

    if (!cookies) {
        return next(new Error('Authentication error: No cookies found'));
    }

    const sessionKey = cookies.split('; ').find(row => row.startsWith('X-Session-Key='));
    if (!sessionKey) {
        return next(new Error('Authentication error: No X-Session-Key cookie found'));
    }

    // Extract the value of the cookie
    const value = sessionKey.split('=')[1];

    // Here you can verify the session key if necessary
    // For example, you might want to check it against a database

    socket.sessionKey = value; // Attach to the socket for later use
    next();
};

// Set up Socket.IO with authentication
io.use(authenticateSocket).on('connection', (socket, next) => {
    console.log('A user connected with session key:', socket.sessionKey);
    if (!socket.sessionKey) {socket.disconnect(); return false; }
    jwt.verify(socket.sessionKey, 'your_jwt_secret', (err, decoded) => {
        if (err) {
            console.log(err)
            socket.disconnect()
        }
    });

    socket.on('disconnect', async () => {
        console.log('User disconnected');
        try {
            await sendGameDisConnectedEvent({gameId: socket.gameId, token: socket.sessionKey});
        } catch (error) {
            console.error('Error sending event to Kafka:', error);
        }
        if (socket.gameId){
            redisPublisher.publish(channelName, JSON.stringify({gameId: socket.gameId, token: socket.sessionKey, event: 'newUser', evtName: 'newUser', action: 'no'}), (err) => {
                if (err) {
                    console.error('Error publishing to Redis:', err);
                } else {
                    console.log(`Published message to Redis channel: game_updates`, message);
                }
            });
        }
    });
    socket.on('joinGame', async (data) => {
        console.log(data)
        socket.gameId = data.gameId
        socket.join(`GAME_${data.gameId}`);
        jwt.verify(socket.sessionKey, 'your_jwt_secret', (err, decoded) => {
            if (err) {
                console.log(err)
                socket.disconnect()
            }
            socket.join(`USER_${decoded.user_id}`);
        });

        try {
            await sendGameConnectedEvent(data);
        } catch (error) {
            console.error('Error sending event to Kafka:', error);
        }
        redisPublisher.publish(channelName, JSON.stringify({gameId: data.gameId, token: socket.sessionKey, event: 'newUser', evtName: 'newUser', action: 'yes'}), (err) => {
            if (err) {
                console.error('Error publishing to Redis:', err);
            } else {
                console.log(`Published message to Redis channel: game_updates`, message);
            }
        });

    });

    socket.on('randomConnect', async (data) => {
        console.log(data)
        const message = {
            gameId: data.gameId,
            event: 'randomConnect',
            evtName: 'randomConnect',
            token: socket.sessionKey, // Optionally send the user ID
            uuid: data.uuid
        };
        console.log(message, 'randomConnect')
        // Publish the message to the Redis channel
        redisPublisher.publish(channelName, JSON.stringify(message), (err) => {
            if (err) {
                console.error('Error publishing to Redis:', err);
            } else {
                console.log(`Published message to Redis channel: game_updates`, message);
            }
        });
        try {
            await sendToKafka(message);
        } catch (error) {
            console.error('Error sending event to Kafka:', error);
        }

    });

    socket.on('requestGame', async (data) => {
        console.log(data)
        const message = {
            gameId: data.gameId,
            event: 'requestGame',
            evtName: 'requestGame',
            token: socket.sessionKey, // Optionally send the user ID
            targetUserId: data.targetUserId,
            uuid: data.uuid
        };
        console.log(message, 'requestGame')
        // Publish the message to the Redis channel
        redisPublisher.publish(channelName, JSON.stringify(message), (err) => {
            if (err) {
                console.error('Error publishing to Redis:', err);
            } else {
                console.log(`Published message to Redis channel: game_updates`, message);
            }
        });
        try {
            await sendToKafka(message);
        } catch (error) {
            console.error('Error sending event to Kafka:', error);
        }
    });
    socket.on('cancelRequestGame', async (data) => {
        console.log(data)
        const message = {
            gameId: data.gameId,
            event: 'cancelRequestGame',
            token: socket.sessionKey, // Optionally send the user ID
            targetUserId: data.targetUserId
        };
        console.log(message, 'cancelRequestGame')
        // Publish the message to the Redis channel
        redisPublisher.publish(channelName, JSON.stringify(message), (err) => {
            if (err) {
                console.error('Error publishing to Redis:', err);
            } else {
                console.log(`Published message to Redis channel: game_updates`, message);
            }
        });
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
