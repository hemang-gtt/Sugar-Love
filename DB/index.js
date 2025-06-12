const mongoose = require('mongoose');
const { LRUCache } = require('lru-cache');
const logger = require('../utils/logger');
const LINK = process.env.DB_URL;

const connectionCache = new LRUCache({
  max: 40,
  ttl: 1000 * 60 * 60,
  dispose: async (connection, dbName) => {
    if (connection && typeof connection.close === 'function') {
      await connection.close();
    } else {
      console.warn(`Wrong dbName ${dbName}`);
    }
  },
});

const getDatabaseConnection = async (dbName) => {
  try {
    if (connectionCache.has(dbName)) {
      return connectionCache.get(dbName);
    }
    const connection = await mongoose
      .createConnection(LINK, {
        dbName,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })
      .asPromise();
    logger.info(`Connected to database ---------${dbName}`);
    connectionCache.set(dbName, connection);
    return connection;
  } catch (error) {
    logger.info(error);
    throw error;
  }
};

// responsible for establishing db connection with the model
const getModel = async (DbName, modelName, schema) => {
  const db = await getDatabaseConnection(DbName);
  return db.model(modelName, schema);
};

module.exports = { getDatabaseConnection, getModel };
