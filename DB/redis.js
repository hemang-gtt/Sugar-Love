const { Redis } = require('ioredis');
const logger = require('../utils/logger');
let redisClient;

if (process.env.IS_CLUSTER === 'true') {
  redisClient = new Redis.Cluster([{ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) }], {
    redisOptions: {
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
    },
  });
} else {
  redisClient = new Redis({
    username: process.env.REDIS_USERNAME,
    port: Number(process.env.REDIS_PORT),
    host: process.env.REDIS_HOST,
    password: process.env.REDIS_PASSWORD,
  });
}

redisClient.on('error', (err) => {
  logger.info('error while connecting redis');
});

const redisDb = process.env.DbName;

logger.info(`Connected to redis on the port ${process.env.REDIS_PORT} and database name is ${redisDb}`);

module.exports = { redisClient, redisDb };
