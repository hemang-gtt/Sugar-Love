const Player = require('../models/playerModel');
const { redisClient: redis, redisDb } = require('../DB/redis');

const {
  isValidUserId,
  getTokenDetails,
  hasPreviousSession,
  isValidCurrencyProxy,
  currencyAPIProxy,
} = require('../utils/common');
const { apiLog } = require('../logs');

const authorizePlayer = async (userId, urlToken, consumerId) => {
  const playerInstance = await Player(process.env.DbName + `-${consumerId}`);

  const playerData = await playerInstance.findOne({ _id: userId }).lean();

  if (playerData?.token != urlToken) {
    return {
      status: 'UNAUTHORIZED',
      data: {},
      message: 'Unauthorized: You do not have permission to perform this action.',
    };
  }

  if (process.env.CHECK_VALID_CURRENCY_ON_LOGIN === 'true') {
    const checkValidCurrency = await isValidCurrencyProxy(playerData.currency);
    console.log('check valid currency output is -----', checkValidCurrency);
    if (!checkValidCurrency.isValid) {
      return {
        status: 'ERROR',
        message: 'Currency is invalid!',
      };
    }
  }

  const getCurrencyData = await currencyAPIProxy(
    playerData.currency,
    Number(process.env.MIN_STAKE),
    Number(process.env.MAX_STAKE),
    Number(process.env.STEP)
  );

  console.log('currency data api response is ----', getCurrencyData);
  let timestamp = Math.floor(new Date().getTime() / 1000);
  let username = playerData.consumerId;
  let lastBet = playerData.lastBet;
  let lastWin = playerData.lastWin;

  let response = {
    status: 'SUCCESS',
    username,
    userId,
    token: urlToken,
    timestamp,
    lastBet,
    lastWin,
    balance: playerData.balance,
    currencyPrefix: playerData.currency,
    minStake: getCurrencyData.min,
    maxStake: getCurrencyData.max,
    defaultStake: getCurrencyData.base,
    step: getCurrencyData.step,
  };

  console.log('response is ----', response);
  return response;
};

const loginHandler = async (req, res, next) => {
  try {
    // they are going to give us url and token

    console.log('data coming here -----------', req.body);
    const { userId, urlToken } = req.body;
    console.log('userID is -----', userId);
    console.log('url token is ----', urlToken);

    if (!userId || !urlToken) {
      return res.status(404).json({
        status: 'Error',
        message: 'Something went very wrong',
      });
    }
    if (!isValidUserId(userId, urlToken)) {
      return res.status(401).json({
        status: 'Error',
        message: 'userId is invalid',
      });
    }

    const previousSessionCheck = await hasPreviousSession(userId, urlToken);
    if (previousSessionCheck) {
      return res.status(401).json({
        status: 'UNAUTHORIZED',
        message: 'Previous session is opened. Please close the previous game or start the game from the lobby...',
      });
    }

    let data = getTokenDetails(urlToken);

    console.log('data fetched from token is -----', data);
    let consumerId = data?.providerName;

    console.log(`consumer id is ---${consumerId}`);

    let result = await authorizePlayer(userId, urlToken, consumerId);
    apiLog(`Result from login API ${result}`);
    if (result.status === 'SUCCESS') {
      await redis.set(`${redisDb}-token:${urlToken}`, result.timestamp, 'EX', 3600); // [redisDB-token-123880:  12/05/2025-1:00]
      await redis.set(`${redisDb}-user:${userId}`, urlToken, 'EX', 3600); // [redisDb-user-Hemang, SampleToken]

      return res.status(200).json(result);
    }
    return res.status(401).json(result);
  } catch (error) {
    console.log(error);
    throw error;
  }
};

module.exports = { loginHandler };
