const { isValidTwoDecimalNumber, isValidUserId, hasPreviousSession, getTokenDetails } = require('../utils/common');
const { verifyPlayer } = require('./playerController');

const { userBet } = require('../controllers/gamePlayController');

const { redisClient: redis, redisDb } = require('../DB/redis');

const freeSpin = async (req, res) => {
  console.log('someone bought the free -----spins ----------');
  let { userId, token, timestamp, betAmount } = req.body.data !== undefined ? JSON.parse(req.body.data) : req.body;

  if (!userId || !token || !timestamp || !isValidTwoDecimalNumber(betAmount) || Number(betAmount) < 0) {
    return res.status(401).json({ status: 'ERROR', message: 'something went wrong!' });
  }

  // check that userId is valid or not !!!

  if (!isValidUserId(userId, token)) {
    return res.status(401).json({ status: 'Error', message: 'User id is invalid' });
  }

  const previousSessionCheck = await hasPreviousSession(userId, token);

  // ! For testing commenting it out
  if (!previousSessionCheck) {
    return res.status(401).json({
      status: 'UNAUTHORIZED',
      message: 'Previous session is opened. Please close the previous game or start the game from the lobby...',
    });
  }
  betAmount = parseFloat(betAmount);

  console.log('bet amount is ----', betAmount);
  let data = getTokenDetails(token);
  console.log('data recieved from token ------', data);

  let consumerId = data?.providerName;

  console.log('consumer id is ----', consumerId);

  let playerVerify = await verifyPlayer(userId, betAmount, true, consumerId);

  console.log('player verify is ---', playerVerify);

  const reqBetAmount = betAmount;
  if (playerVerify.status === 'SUCCESS') {
    // isFeatureBuy true -, isUpgrade False
    let result = await userBet(userId, betAmount, playerVerify.data, true, false, playerVerify.freeSpin, reqBetAmount);
    if (result.status === 'SUCCESS') {
      await redis.set(`${redisDb}-token:${token}`, timestamp, 'EX', 3600);
      await redis.set(`${redisDb}-user:${userId}`, token, 'EX', 3600);

      return res.status(200).json(result);
    } else return res.status(401).json(result);
  } else {
    return res.status(401).json(playerVerify);
  }
};

const upgradeSpin = async (req, res) => {
  console.log('sugar meter got fulled upgrade spin will get called ');
  let { userId, token, timestamp, betAmount } = req.body.data !== undefined ? JSON.parse(req.body.data) : req.body;

  console.log('user id is --------', userId, token, timestamp, betAmount);

  console.log('line number 9------', isValidTwoDecimalNumber(betAmount));
  if (!userId || !token || !timestamp || !isValidTwoDecimalNumber(betAmount) || Number(betAmount) < 0) {
    return res.status(401).json({ status: 'ERROR', message: 'something went wrong!' });
  }

  // check that userId is valid or not !!!

  if (!isValidUserId(userId, token)) {
    return res.status(401).json({ status: 'Error', message: 'User id is invalid' });
  }

  const previousSessionCheck = await hasPreviousSession(userId, token);
  if (!previousSessionCheck) {
    return res.status(401).json({
      status: 'UNAUTHORIZED',
      message: 'Previous session is opened. Please close the previous game or start the game from the lobby...',
    });
  }
  betAmount = parseFloat(betAmount);

  console.log('bet amount is ----', betAmount);
  let data = getTokenDetails(token);
  console.log('data recieved from token ------', data);

  let consumerId = data?.providerName;

  console.log('consumer id is ----', consumerId);

  let playerVerify = await verifyPlayer(userId, betAmount, true, consumerId);

  console.log('player verify is ---', playerVerify);

  const reqBetAmount = betAmount;
  if (playerVerify.status === 'SUCCESS') {
    // isFeatureBuy true -, isUpgrade False
    let result = await userBet(userId, betAmount, playerVerify.data, false, true, playerVerify.freeSpin, reqBetAmount);
    if (result.status === 'SUCCESS') {
      await redis.set(`${redisDb}-token:${token}`, timestamp, 'EX', 3600);
      await redis.set(`${redisDb}-user:${userId}`, token, 'EX', 3600);

      return res.status(200).json(result);
    }
    return res.status(401).json(result);
  }
  return res.status(401).json(playerVerify);
};
module.exports = { freeSpin, upgradeSpin };
