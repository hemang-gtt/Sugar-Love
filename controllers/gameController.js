const { gameLaunchValidationSchema } = require('../validator/gameLaunchValidator');
const { playerInfoFinder } = require('../controllers/apiController');
const { gameLaunch } = require('../services/playerService');

const gameModel = require('../models/gameModel');

const { redisClient: redis, redisDb } = require('../DB/redis');
const { logErrorMessage, apiLog } = require('../logs');

const gameLauncher = async (req, res, next) => {
  try {
    console.log('doing the game launch --');

    const { error, value } = gameLaunchValidationSchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        code: 'invalid.request.data',
        message: 'Invalid request ',
      });
    }

    console.log('value is----------', value);
    console.log('validation completed ----------');

    let playerInfo = await playerInfoFinder(req.query);
    console.log('player info recieved are -------', playerInfo);

    let response = await gameLaunch(req.query, playerInfo);

    console.log('response is -----', response);

    // store this data in redis
    const params = new URLSearchParams(response.url.split('?')[1]);
    const userId = params.get('userId');
    const token = params.get('token');

    console.log('user id and token is ------', userId, token);

    let existingToken = await redis.get(`${redisDb}-user:${userId}`);

    console.log('existing token present in redis is ----', existingToken);

    if (existingToken) {
      await redis.del(`${redisDb}-user:${userId}`);
    }

    // key value stored are ----[redisDb-user:123]
    await redis.set(`${redisDb}-user:${userId}`, token, 'EX', 3600); // 1hr window size

    apiLog(`url generated from the  Game launch Api${response}`);
    return res.status(200).json({ response });
  } catch (error) {
    const axiosError = error?.response ? error : error?.error; // handles nested errors
    const errorData = axiosError?.response?.data;

    if (errorData) {
      console.log('output is -----------', JSON.stringify(errorData));
      logErrorMessage(JSON.stringify(errorData));
    } else {
      console.error('Unexpected error structure', JSON.stringify(error));
    }

    return res.status(422).json({ error: errorData || 'Unknown error' });
  }
};

const saveGamePlay = async (userId, betAmount, slotResult, user, isFeatureBuy, maxWinningExceeded) => {
  /* 
  {
  totalWin: 0.7,
  scatters: [ 27 ],
  freeSpins: 0,
  response: { g: [ [Object], [Object], [Object], [Object] ] },
  maxWinningExceeded: false
  }
  */

  console.log(`slot result is --during saving the game --`, slotResult); // i think it will have the value in case of feature buy
  if (userId && user.currency) {
    const gameInstace = await gameModel(process.env.DbName + `-${user?.consumerId}`);

    let gamePlayData = {
      userId,
      totalBet: betAmount,
      totalWin: Number(parseFloat(slotResult.totalWin).toFixed(2)),
      createdDate: new Date(),
      isPlay: true,
      isWin: slotResult?.totalWin > 0 ? true : false, // ! Not need further
      isFreeSpin: slotResult?.freeSpins > 0 ? true : false,
      randSlotNumber: slotResult?.slotNumber, // ! Not need further
      currency: user.currency,
      freeSpinCount: slotResult?.freeSpins,
      freeSpinRoundId: Number(betAmount) === 0 ? user.freeSpinRoundId : '',
      isFeatureBuy: isFeatureBuy,
      maxWinningExceeded,
    };
    console.log('gamePlaye data is ----', gamePlayData);
    const gamePlay = new gameInstace(gamePlayData);
    let savedGame = await gamePlay.save();
    console.log('saved game is ----', savedGame);

    return {
      status: 'SUCCESS',
      data: savedGame,
      message: 'game mode is saved',
    };
  } else {
    return {
      status: 'PLEASE_ENTER_ALL_FIELDS',
      data: {},
      message: 'please enter all fields',
    };
  }
};

module.exports = { gameLauncher, saveGamePlay };
