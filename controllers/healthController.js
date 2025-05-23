const { infoLog, apiLog } = require('../logs/index');

const healthCheck = (req, res, next) => {
  apiLog('Response from health api is OK  ');
  return res.status(200).json({
    message: 'Health is ok',
  });
};

module.exports = { healthCheck };
