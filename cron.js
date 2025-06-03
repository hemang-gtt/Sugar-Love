const { CronJob } = require('cron');
const { redisClient: redis, redisDb } = require('./DB/redis');

const { logError } = require('./logs/index');
const { resolvePending } = require('./controllers/pendingController');

let cronList = [];
const startCron = async (isRestarting) => {
  try {
    console.log('starting the cron -------------------');
    let isCronRunning = false;
    if (!isRestarting) {
      isCronRunning = await redis.get(`${redisDb}:isCronRunning`);
      isCronRunning = isCronRunning === 'true' ? true : false;
    }
    if (!isCronRunning && cronList.length === 0) {
      await redis.set(`${redisDb}:isCronRunning`, true);
      cronList.push(new CronJob('*/10 * * * * *', runCronJob, null, true));
    } else {
      console.log('cron is already running ----------');
    }
  } catch (error) {
    logError(error);
    console.log('error while starting the cron -----------', error);
    throw error;
  }
};

const runCronJob = async () => {
  let lockKey = `${redisDb}:cron-lock`;
  let lockValue = Date.now().toString();
  try {
    console.log('running the cron items ---------');

    console.log(`lock key is -------${lockKey} and lock value is ---${lockValue}`);
    const acquired = await redis.set(lockKey, lockValue, 'NX', 'EX', 55);
    if (!acquired) {
      console.log('another instance running --------');
      return;
    } else {
      let isAllResolved = await resolvePending();
      if (isAllResolved) {
        console.log('all task resolved -----');
        await stopCron();
      }
    }
  } catch (error) {
    // if there any error come in this case then we need to remove few keys from redis , set isCronRunning as false

    const currentLockValue = await redis.get(lockKey);
    if (currentLockValue === lockValue) {
      await redis.del(lockKey);
      console.log('Lock released after error');
    }
    await redis.set(`${redisDb}:isCronRunning`, false);
    console.log('Error in cron job ---------', error);
  }
};

const stopCron = async () => {
  try {
    // set the key value in redis to be false
    await redis.set(`${redisDb}:isCronRunning`, false);

    cronList.forEach((cron) => cron.stop());
    cronList = [];

    console.log(`deleting the key -----`);
    await redis.del(`${redisDb}:cron-lock`);

    console.log('key removed -----------');
  } catch (error) {
    console.log('Error while stoppping the cron -----------');
  }
};

module.exports = { startCron };
