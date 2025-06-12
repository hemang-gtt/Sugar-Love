const Player = require('../models/playerModel');
const CampaignMaster = require('../models/campaignMasterModel');
const { redisClient: redis, redisDb } = require('../DB/redis');

const {
  isValidUserId,
  getTokenDetails,
  hasPreviousSession,
  isValidCurrencyProxy,
  currencyAPIProxy,
  CurrencyAPI,
} = require('../utils/common');
const { apiLog, logErrorMessage } = require('../logs');
const gameutils = require('../gamePlay/gameUtils');
const { table1 } = require('../weights/tables');
const logger = require('../utils/logger');

const authorizePlayer = async (userId, urlToken, consumerId) => {
  logger.info(`Authorizing the player ----------------`);
  const playerInstance = await Player(process.env.DB_NAME + `-${consumerId}`);
  const campaignMasterInstance = await CampaignMaster(process.env.DB_NAME + `-${consumerId}`);

  let playerData = await playerInstance.findOne({ _id: userId }).lean();

  if (playerData?.token != urlToken) {
    return {
      status: 'UNAUTHORIZED',
      data: {},
      message: 'Unauthorized: You do not have permission to perform this action.',
    };
  }
  let spinCount = 0; // contain the count of spin available
  let finalCampaigns = [];
  const currentTime = new Date();

  // calculating the number of spinCount at a stage
  for (const campaign of playerData.campaigns) {
    if (campaign) {
      const validFrom = new Date(campaign.validFrom);
      const validBefore = new Date(campaign.validBefore);

      if (campaign.playedSpinCount < campaign.spinCount) {
        finalCampaigns.push(campaign);
        if (currentTime >= validFrom && currentTime <= validBefore) {
          spinCount +=
            campaign.spinCount - campaign.playedSpinCount > 0 ? campaign.spinCount - campaign.playedSpinCount : 0;
        }
      }
    }
  }
  logger.info(
    `--player data campagin ----${JSON.stringify(playerData.campaigns)} ----final campaign ${JSON.stringify(
      finalCampaigns
    )}`
  );
  if (playerData.campaigns.length !== finalCampaigns.length) {
    playerData = await playerInstance
      .findOneAndUpdate({ _id: userId }, { $set: { campaigns: finalCampaigns } }, { upsert: true, new: true })
      .lean();
  }

  // now at this stage we need to set inactive the campaign from campaign master if they are not there
  const now = new Date();
  const activeMasterCamapign = await campaignMasterInstance.find({ isActive: true }).lean();

  const expiredIds = activeMasterCamapign.filter((c) => new Date(c.campaignEndDate) < now).map((c) => c._id);

  if (expiredIds.length > 0) {
    await campaignMasterInstance.updateMany({ _id: { $in: expiredIds } }, { $set: { isActive: false } });
  }

  // checking is currency valid and not change after game running
  if (process.env.CHECK_VALID_CURRENCY_ON_LOGIN === 'true') {
    const checkValidCurrency = await isValidCurrencyProxy(playerData.currency);
    logger.info(`Check valid currency output is -----------${JSON.stringify(checkValidCurrency)}`);
    if (!checkValidCurrency.isValid) {
      return {
        status: 'ERROR',
        message: 'Currency is invalid!',
      };
    }
    if (
      playerData.resumedGameCurrency &&
      playerData.resumedGameCurrency != '' &&
      playerData.resumedGameCurrency != playerData.currency
    ) {
      if (spinCount > 0 || playerData.freeSpin.count > 0 || playerData.upgradeSpin.activeCount > 0) {
        return {
          status: 'ERROR',
          message:
            'Currency has been changed in a running game! please change your currency to ' +
            playerData.resumedGameCurrency +
            ' to resume the game.',
        };
      }
    }
  }

  const getCurrencyData = await currencyAPIProxy(
    playerData.currency,
    Number(process.env.MIN_STAKE),
    Number(process.env.MAX_STAKE),
    Number(process.env.STEP)
  );
  const getFeatureBuyData = await currencyAPIProxy(
    playerData.currencyCode,
    Number(process.env.FEATURE_BUY_MIN),
    Number(process.env.FEATURE_BUY_MAX),
    Number(process.env.FEATURE_BUY_STEP),
    true
  );
  let timestamp = Math.floor(new Date().getTime() / 1000);
  let username = playerData.consumerId;
  let lastBet = playerData.lastBet;
  let lastWin = playerData.lastWin;

  if (
    (playerData?.freeSpin?.isActive && playerData?.upgradeSpin?.count < playerData.upgradeSpin?.required) ||
    (!playerData?.freeSpin?.isActive && playerData?.upgradeSpin?.activeCount == 0)
  ) {
    let newUpgradeSpin = {
      required:
        process.env.DUMMY_DATA_TESTING === 'true'
          ? Number(process.env.DUMMY_UPGRADE_SPIN_COUNT)
          : gameutils.getKeyBasedOnWeights(table1, 'wins'), // tumble count reduces the upgrade spin count
      count: 0,
      activeCount: 0,
      betAmount: -1,
      totalWin: 0,
    };
    playerData = await playerInstance
      .findOneAndUpdate({ _id: userId }, { $set: { upgradeSpin: newUpgradeSpin } }, { upsert: true, new: true })
      .lean();
  }

  logger.info(`player data is ----------${JSON.stringify(playerData)}`);

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
    fbArr: getFeatureBuyData.arr,
  };

  if (playerData?.freeSpin?.count > 0) {
    response.freeSpin = playerData.freeSpin;
  } else if (playerData.upgradeSpin?.activeCount > 0) {
    response.upgradeSpins = {
      left: playerData.upgradeSpin.activeCount,
      betAmount: playerData.upgradeSpin.betAmount,
      totalWin: playerData.upgradeSpin.totalWin,
    };
  } else if (spinCount > 0) {
    if (playerData.lastBet) {
      response.lastBet = playerData.lastBet;
      response.lastWin = playerData.lastWin;
    }
    response.campaign = {
      left: finalCampaigns[0].spinCount - finalCampaigns[0].playedSpinCount,
      betAmount: finalCampaigns[0].totalBetAmount,
      vaildBefore: new Date(finalCampaigns[0].validBefore).getTime() / 1000,
    };
  } else if (playerData.lastBet) {
    response.lastBet = playerData.lastBet;
    response.lastWin = playerData.lastWin;
  }

  return response;
};

const loginHandler = async (req, res, next) => {
  try {
    // they are going to give us url and token

    const { userId, urlToken } = req.body;
    logger.info(`Inside login handler ----------userId---${userId}--------and url token is --${urlToken}--------`);

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

    logger.info(`Data fetched from token is ---${JSON.stringify(data)}`);
    let consumerId = data?.providerName;

    let result = await authorizePlayer(userId, urlToken, consumerId);

    apiLog(`Result from login API ${result}`);

    if (result.status === 'SUCCESS') {
      await redis.set(`${redisDb}-token:${urlToken}`, result.timestamp, 'EX', 3600); // [redisDB-token-123880:  12/05/2025-1:00]
      await redis.set(`${redisDb}-user:${userId}`, urlToken, 'EX', 3600); // [redisDb-user-Hemang, SampleToken]

      return res.status(200).json(result);
    }
    return res.status(401).json(result);
  } catch (error) {
    logger.info(`Error in login handle --------${JSON.stringify(error)}`);
    logErrorMessage(error);
    throw error;
  }
};

const verifyPlayer = async (userId, betAmount, isFeatureBuy, consumerId) => {
  const playerInstance = await Player(process.env.DB_NAME + `-${consumerId}`);
  let playerData = await playerInstance.findOne({ _id: userId }).lean();
  if (!playerData) {
    return {
      status: 'Error',
      message: 'Something went wrong !!',
    };
  }

  if (playerData.isBanned) {
    return { status: 'ERROR', message: 'Banned player !!!' };
  }

  // Today's limit reached !!!
  let maxGamesAllowedInASingleDay = await redis.hget(`${redisDb}:admin`, 'maxGamesAllowedInASingleDay');

  logger.info(`maxGamesAllowedInASingleDay----${maxGamesAllowedInASingleDay}`);
  if (maxGamesAllowedInASingleDay && playerData.todayGameCount >= Number(maxGamesAllowedInASingleDay)) {
    return { status: 'ERROR', message: `Today's limit reached !!` };
  } else if (playerData.todayGameCount >= Number(process.env.SINGLE_DAY_MAX_GAMES_ALLOWED)) {
    return { status: 'ERROR', message: `Today's limit reached !!` };
  }

  // Balance is insufficient
  // 2 cases here ->
  // 1> Normal Bet -> Is player balance > betAmount
  // 2> Feature Buy -> if this is true then it have multiplier like bet placed of amount 2 rs but multiplier have the value
  // of 100 rs then we will check is user balance > 2*100
  if (
    playerData.balance < betAmount ||
    (isFeatureBuy && playerData.balance < betAmount * Number(process.env.FEATURE_BUY_MULTIPLIER))
  ) {
    return { status: 'ERROR', message: 'Insufficient balance!' };
  }

  // now check are there any spins available

  // 1> free spin , 2> upgrade spin , 3> campaign free spin
  const freeSpin = {
    isActive: false,
    count: 0,
    spotMultiplier: '',
    isFeatureBuyFs: false,
    totalWin: 0,
    betAmount: 0,
  };

  const campaignFreeSpin = { count: 0, betAmount: 0, validBefore: 0, totalWin: 0, totalCount: 0 };

  const upgradeSpin = { count: 0, betAmount: 0 };

  let finalCampaigns = [];
  let spinCount = 0; // will have the final spin count
  const currentTime = new Date();
  for (const campaign of playerData.campaigns) {
    // now we will validate each campaign
    const validFrom = new Date(campaign.validFrom);
    const validBefore = new Date(campaign.validBefore);

    if (currentTime >= validFrom && currentTime <= validBefore) {
      finalCampaigns.push(campaign);
      spinCount +=
        campaign.spinCount - campaign.playedSpinCount > 0 ? campaign.spinCount - campaign.playedSpinCount : 0;
    }
  }

  // if bet amount is zero then we check the free spins
  if (betAmount === 0) {
    // Check for active campaign
    if (spinCount > 0) {
      // are there any existing free spin from campaign
      (campaignFreeSpin.totalCount = finalCampaigns[0].spinCount), (campaignFreeSpin.count = spinCount);
      campaignFreeSpin.betAmount = finalCampaigns[0].totalBetAmount;
      campaignFreeSpin.validBefore = new Date(finalCampaigns[0].validBefore).getTime() / 1000;
      campaignFreeSpin.totalWin = finalCampaigns[0].totalWin ?? 0;
    }

    // Checking that are there any free spin available or not
    if (playerData.freeSpin.count > 0) {
      freeSpin.isActive = true;
      freeSpin.count = playerData.freeSpin.count;
      freeSpin.spotMultiplier = playerData.freeSpin.spotMultiplier;
      freeSpin.isFeatureBuyFs = playerData.freeSpin.isFeatureBuyFs;
      freeSpin.totalWin = playerData.freeSpin.totalWin;
      freeSpin.betAmount = playerData.freeSpin.betAmount;
    }
    // check for upgrade spin
    if (playerData.upgradeSpin.activeCount > 0) {
      upgradeSpin.count = playerData.upgradeSpin.activeCount;
      upgradeSpin.betAmount = playerData.upgradeSpin.betAmount;
    }

    //! if No free spin available and the betAmount is zero so we will return the error;

    if (playerData.freeSpin.count <= 0 && spinCount <= 0 && playerData.upgradeSpin.activeCount <= 0) {
      return { status: 'ERROR', message: 'No Free Spin Found!' };
    }
  }

  // if there are any type of spin availabe and bet amount > 0 - throw error
  else if (playerData.freeSpin.isActive || spinCount > 0 || playerData.upgradeSpin.activeCount > 0) {
    return { status: 'ERROR', message: 'Session is invalid!' };
  }
  const getCurrencyData = await CurrencyAPI(playerData.currency);

  // getCurrencyData.featureBuyRange.push(1); // ! remove this line later
  logger.info(`Currency data fetched from api is ----------${JSON.stringify(getCurrencyData)}`);
  if (isFeatureBuy) {
    if (!getCurrencyData.featureBuyRange.includes(betAmount)) {
      return { status: 'ERROR', message: `Bet Amount is invalid!` };
    }
  } else {
    if (betAmount > 0 && freeSpin.count == 0) {
      if (!getCurrencyData.range.includes(betAmount)) {
        return { status: 'ERROR', message: `Bet Amount is invalid!` };
      }
    }
  }
  return {
    status: 'SUCCESS',
    data: playerData,
    message: 'user is verified',
    freeSpin,
    campaignFreeSpin,
    upgradeSpin,
  };
};

module.exports = { loginHandler, verifyPlayer };
