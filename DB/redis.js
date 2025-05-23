const { Redis } = require('ioredis');
let redisClient;

if (process.env.IS_CLUSTER === 'true') {
  redisClient = new Redis.Cluster([{ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) }], {
    redisOptions: {
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
    },
  });
} else {
  console.log('here ----------');

  redisClient = new Redis({
    username: process.env.REDIS_USERNAME,
    port: Number(process.env.REDIS_PORT),
    host: process.env.REDIS_HOST,
    password: process.env.REDIS_PASSWORD,
  });
}

redisClient.on('error', (err) => {
  console.log('error while connecting redis');
});

const redisDb = process.env.DbName;

console.log(`Connected to redis on the port ${process.env.REDIS_PORT} and database name is ${redisDb}`);

module.exports = { redisClient, redisDb };
