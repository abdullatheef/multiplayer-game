const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');  // Required for reading SSL certificates
const { Server } = require('socket.io');
const app = express();
const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/archive/headvstail.com/privkey1.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/archive/headvstail.com/cert1.pem'),
    ca: fs.readFileSync('/etc/letsencrypt/archive/headvstail.com/chain1.pem')  // If needed
};


//const server = http.createServer(app);
const server = https.createServer(sslOptions, app);


const jwt = require('jsonwebtoken'); // JWT library

const redis = require('redis'); // Redis client

const redisPublisher = redis.createClient(); 
const redisSubscriber = redis.createClient(); // Create a separate client for subscribing
const channelName = 'match_requests'; // Replace with your channel name


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
      if (message.event == 'matchReady'){
          io.to(`MATCH_${message.matchId}`).emit('matchReady', {
              user_id: decoded.user_id
          });
      }
      if (message.event == 'startMatch'){
        io.to(`MATCH_${message.matchId}`).emit('startMatch', {
            user_id: decoded.user_id,
            image: message.image
        });
      }
      if (message.event == 'cellClick'){
        io.to(`MATCH_${message.matchId}`).emit('tic-tac-toe', {
            user_id: decoded.user_id,
            cell: message.cell,
            action: message.event
        });
      }
      if (message.event == 'matchDisconnect'){
        io.to(`MATCH_${message.matchId}`).emit('matchDisconnect', {
            user_id: decoded.user_id,
            action: message.event
        });
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





//const allowedOrigins = ["http://localhost:8000", "http://example.com", "https://pipes-deep-childrens-tire.trycloudflare.com"];
const allowedOrigins = ["http://localhost:8000", "http://example.com", "https://pipes-deep-childrens-tire.trycloudflare.com", "https://api.headvstail.com", "https://auth.headvstail.com", "https://headvstail.com", "https://sock1.headvstail.com"];
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Allow these multiple origins
    methods: ["GET", "POST"], // Allowed methods
    credentials: true // Allow credentials if you're using cookies
  }
});


const PORT = 3003; // Your server port

// Serve static files (if any)
app.use(express.static('public'));

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


// Socket.IO connection
io.use(authenticateSocket).on('connection', (socket, next) => {
  console.log('A user connected with session key:', socket.sessionKey);
  jwt.verify(socket.sessionKey, 'your_jwt_secret', (err, decoded) => {
      if (err) {
          console.log(err)
          socket.disconnect()
      }
  });
  const { matchId } = socket.handshake.query;
  socket.matchId = matchId
  console.log('Match ID:', matchId);
  socket.join(`MATCH_${matchId}`);


  socket.on('matchReady', async (offer) => {
    const message = {
      token: socket.sessionKey,
      matchId: socket.matchId,
      event: 'matchReady'
    }
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

  // Handling signaling
  socket.on('offer', (offer) => {
    socket.broadcast.emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    socket.broadcast.emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate) => {
    socket.broadcast.emit('ice-candidate', candidate);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id, socket.matchId);
    const message = {
      token: socket.sessionKey,
      matchId: socket.matchId,
      event: 'matchDisconnect'
    }
    redisPublisher.publish(channelName, JSON.stringify(message), (err) => {
        if (err) {
            console.error('Error publishing to Redis:', err);
        } else {
            console.log(`Published message to Redis channel: game_updates`, message);
        }
    });
  });



  socket.on('tic-tac-toe', async (data) => {
    const message = {
      token: socket.sessionKey,
      matchId: socket.matchId,
      event: data.action,
      evtName: data.action,
      cell: data.cell
    }
    console.log('tic-tac-toe:', socket.matchId);
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


});





const { Kafka } = require('kafkajs');

// KafkaJS setup
const kafka = new Kafka({
    clientId: 'game-server',
    brokers: ['172.31.11.175:9092']  // Replace with your Kafka broker
});

const producer = kafka.producer();

// Function to produce a "GameConnected" event
const sendToKafka = async (event) => {
    await producer.connect();
    await producer.send({
        topic: 'MatchEvents',
        messages: [
            { value: JSON.stringify(event) }
        ]
    });
    console.log('sendToKafka event sent to Kafka:', event);
};


// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
