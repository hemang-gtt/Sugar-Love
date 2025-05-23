const { gameLaunchValidationSchema } = require('../validator/gameLaunchValidator');
const { playerInfoFinder } = require('../controllers/apiController');
const { gameLaunch } = require('../services/playerService');

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

module.exports = { gameLauncher };
