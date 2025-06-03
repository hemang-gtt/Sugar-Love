const { infoLog, apiLog } = require('../logs/index');

const logger = require('../utils/logger');

const healthCheck = (req, res, next) => {
  logger.info(`Health route is running`);
  apiLog('Response from health api is OK  ');
  return res.status(200).json({
    message: 'Health is ok',
  });
};

module.exports = { healthCheck };
