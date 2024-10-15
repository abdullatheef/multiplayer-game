const { Kafka } = require('kafkajs');
const redis = require('redis');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');  // PostgreSQL client
const matchChannelName = 'match_requests'
// PostgreSQL client setup
const dbClient = new Client({
    user: 'abc',
    host: 'localhost',
    database: 'headvstail',
    password: '123',
    port: 5432,  // PostgreSQL port
});

// Function to connect or reconnect PostgreSQL
const connectDb = async () => {
    try {
        await dbClient.connect();
        console.log('Connected to PostgreSQL');
    } catch (err) {
        console.error('Error connecting to PostgreSQL:', err);
        setTimeout(connectDb, 5000);  // Retry connection after 5 seconds
    }
};

// Connect initially
connectDb();

// KafkaJS setup
const kafka = new Kafka({
    clientId: 'game-consumer',
    brokers: ['192.168.1.13:9092']  // Replace with your Kafka broker
});

const kafka2 = new Kafka({
    clientId: 'game-consumer2',
    brokers: ['192.168.1.13:9092']  // Replace with your Kafka broker
});

const consumer = kafka.consumer({ groupId: 'game-group' });
const consumer2 = kafka2.consumer({ groupId: 'match-group' });

// Redis client setup with error handling
const redisClient = redis.createClient();

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

redisClient.on('connect', () => {
    console.log('Connected to Redis');
});

// Connect to Redis
redisClient.connect().catch(console.error);  // Ensure Redis client is connected

const getUserIdByEmail = async (email) => {
    const query = 'SELECT id, username FROM auth_user WHERE email = $1';
    try {
        const result = await dbClient.query(query, [email]);
        if (result.rows.length > 0) {
            return result.rows[0];  // { id, name }
        } else {
            throw new Error(`User with email ${email} not found`);
        }
    } catch (err) {
        console.error('Error querying user:', err);
        throw err;
    }
};

const createMatchRequest = async (gameId, matchType, sourceUserId, targetUserId, uuid) => {
    const query = `
        INSERT INTO main_matchrequest (game_id, match_type, source_id, target_id, uuid, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id;
    `;

    const values = [gameId, matchType, sourceUserId, targetUserId, uuid];

    try {
        const res = await dbClient.query(query, values);
        console.log('Match request created with ID:', res.rows[0].id);
    } catch (err) {
        console.error('Error inserting match request:', err.stack);
    }
};


// Kafka consumer for GameConnected events
const consumeGameEvents = async () => {
    await consumer.connect();
    await consumer.subscribe({ topic: 'GameEvents', fromBeginning: true });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            const gameEvent = JSON.parse(message.value);
            console.log(gameEvent)
            const { gameId, token, evtName } = gameEvent;

            // Decode JWT token
            jwt.verify(token, 'your_jwt_secret', async (err, decoded) => {
                if (err) {
                    console.error('Invalid token in GameConnected event:', err);
                    return;
                }

                const { email, user_id } = decoded;

                try {
                    // Query the database to get user ID and name
                    const user = await getUserIdByEmail(email);

                    // Add or remove the user from Redis based on the event type
                    const redisKey = `GAME_${gameId}_CONNECTED_USERS`;
                    const userInfo = `${user.id}---${user.username}`;

                    if (evtName === 'connect') {
                        // Add the user to the Redis set (using Redis v4+ API)
                        await redisClient.sAdd(redisKey, userInfo);
                        await redisClient.expire(redisKey, 3600);
                        console.log(`User ${user.username} (ID: ${user.id}) connected and added to Redis for game ${gameId}`);
                    } else if (evtName === 'disconnect') {
                        // Remove the user from the Redis set (using Redis v4+ API)
                        await redisClient.sRem(redisKey, userInfo);
                        console.log(`User ${user.username} (ID: ${user.id}) disconnected and removed from Redis for game ${gameId}`);
                    } else if (evtName === 'requestGame') {
                        // Remove the user from the Redis set (using Redis v4+ API)
                        await createMatchRequest(gameId, '1v1', user_id, gameEvent.targetUserId, gameEvent.uuid)
                    } else if (evtName === 'randomConnect') {
                        // Remove the user from the Redis set (using Redis v4+ API)
                        await createMatchRequest(gameId, 'random', user_id, null, gameEvent.uuid)
                    }
                    
                } catch (dbError) {
                    console.error(`Error querying user for email ${email}:`, dbError);
                }
            });
        }
    });
};


const axios = require('axios');

// Data to be sent in the POST request



async function setUserReady(matchRequestId, userId, token) {
    console.log(">>>", matchRequestId, userId)
    try {
      // Start a transaction
      await dbClient.query('BEGIN');
  
      // Step 1: Check if the user is the source or target in main_matchrequest
      const res = await dbClient.query(
        `SELECT source_id, target_id, id FROM main_matchrequest WHERE uuid = $1`,
        [matchRequestId]
      );
  
      if (res.rows.length === 0) {
        throw new Error('Match request not found');
      }
  
      const { source_id, target_id, id} = res.rows[0];
      let updateField = '';
  
      // Determine if the user is the source or target
      if (userId === source_id) {
        updateField = 'source_ready';
      } else if (userId === target_id) {
        updateField = 'target_ready';
      } else {
        throw new Error('User is not associated with this match request');
      }
  
      // Step 2: Update the corresponding field in main_imagetotextmatch
      await dbClient.query(
        `UPDATE main_imagetotextmatch
         SET ${updateField} = TRUE
         WHERE match_request_id = $1`,
        [id]
      );
  
      // Step 3: Check if both source_ready and target_ready are TRUE
      const readinessCheck = await dbClient.query(
        `SELECT source_ready, target_ready, imagetotext_id
         FROM main_imagetotextmatch
         WHERE match_request_id = $1`,
        [id]
      );
      console.log(readinessCheck.rows[0], ">>>")
      const { source_ready, target_ready, imagetotext_id } = readinessCheck.rows[0];
      if (source_ready && target_ready) {
        console.log('Both players are ready!');
        const imagetotextmatch = await dbClient.query(
            `SELECT image
             FROM main_imagetotext
             WHERE id = $1`,
            [imagetotext_id]
        );
        const { image } = imagetotextmatch.rows[0];  
        redisClient.publish(matchChannelName, JSON.stringify({matchId: matchRequestId, event: 'startMatch', image: image, token: token}), (err) => {
            if (err) {
                console.error('Error publishing to Redis:', err);
            } else {
                console.log(`Published message to Redis channel: game_updates`, message);
            }
        });
      }
  
      // Commit the transaction
      await dbClient.query('COMMIT');
      console.log('User readiness set successfully');
    } catch (err) {
      // Roll back the transaction in case of an error
      await dbClient.query('ROLLBACK');
      console.error('Error setting user readiness:', err.message);
    }
  }
  
const consumeMatchEvents = async () => {
    await consumer2.connect();
    await consumer2.subscribe({ topic: 'MatchEvents', fromBeginning: true });

    await consumer2.run({
        eachMessage: async ({ topic, partition, message }) => {
            const matchEvent = JSON.parse(message.value);
            console.log(matchEvent)
            const { matchId, token, evtName } = matchEvent;

            // Decode JWT token
            jwt.verify(token, 'your_jwt_secret', async (err, decoded) => {
                if (err) {
                    console.error('Invalid token in GameConnected event:', err);
                    return;
                }

                const { email, user_id } = decoded;
                await setUserReady(matchId, user_id, token)

                try {
                    // Query the database to get user ID and nam
                    
                } catch (dbError) {
                    console.error(`Error querying user for email ${email}:`, dbError);
                }
            });
        }
    });
};

// Start the consumer
consumeGameEvents().catch(console.error);
consumeMatchEvents().catch(console.error);



