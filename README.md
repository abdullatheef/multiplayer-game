![alt text](https://github.com/abdullatheef/multiplayer-game/blob/main/arch.png?raw=true)




* Commands
* Install the requirements first
* create databases `auth`, `headvstail`


```
#frontend UI
cd frontend
python3 -m http.server

#auth server
cd backend/auth
python main.py

#django api server
cd backend/api_backend
python manage.py runserver 8005


# Game connection server
cd backend/connection_server
node server.js

#Kafka consumer
cd backend/connection_server
node kafka_consumer.js

#Signalling server + Game live interation server
cd backend/signalling_server
node signalling.js

# Postgres Container
docker run \
  --name postgres-container \
  -e POSTGRES_USER=abc \
  -e POSTGRES_PASSWORD=123 \
  -e POSTGRES_DB=mydb \
  -p 5432:5432 \
  postgres:latest

# Redis container
docker run --name my-redis -p 6379:6379 redis

# Run Zookeeper container
docker run -p 2181:2181 zookeeper


# Run Kafka container (Here use the internal ip of your system or else run the kafka + zookeeper service inside docker compose)
docker run -p 9092:9092 \
-e KAFKA_ZOOKEEPER_CONNECT=192.168.1.13:2181 \
-e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://192.168.1.13:9092 \
-e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
confluentinc/cp-kafka
```
