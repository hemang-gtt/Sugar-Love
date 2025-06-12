const { logErrorMessage } = require('../logs');
const { isValidTwoDecimalNumber, isValidUserId, hasPreviousSession, getTokenDetails } = require('../utils/common');
const { redisClient: redis, redisDb } = require('../DB/redis');
const { verifyPlayer } = require('../controllers/playerController');
const { playGame, checkFreeSpin, checkUpgradeSpin } = require('../gamePlay/gamePlayMain');
const gameutils = require('../gamePlay/gameUtils');
const { betRequest } = require('../controllers/betController');
const { winRequest } = require('../controllers/winController');
const { getRandomNumber, verifyCurrentSession } = require('../utils/common');
const { saveGamePlay } = require('../controllers/gameController');
const { saveWalletTransaction } = require('../controllers/transactionController');
const Player = require('../models/playerModel');
const Campaign = require('../models/campaignModel');
const logger = require('../utils/logger');

/*
    upgradeSpin: {
      required:
      count: 0,
      activeCount: 0,
      betAmount: -1,
      totalWin: 0,
    },

    freeSpin: {
      isActive: false,
      isFeatureBuyFs: false,
      count: 0,
      betAmount: 0,
      spotMultiplier: '',
      totalWin: 0,
    },

*/
const gamePlay = async (
  userId,
  betAmount,
  user,
  isFeatureBuy,
  isActiveCampaign,
  activeCampaign,
  freeSpin,
  reqBetAmount,
  isUpgradeSpinBuy
) => {
  logger.info(`entered the game play function------------`);
  let balance = Number(user.balance);
  const game = playGame(
    balance,
    betAmount,
    user.upgradeSpin,
    freeSpin,
    isFeatureBuy,
    isActiveCampaign,
    isUpgradeSpinBuy
  );

  logger.info(`Output after game play --------${JSON.stringify(game)}`);
  let maxWinningExceeded = game.maxWinningExceeded;

  logger.info(`balance before deduction is -----------${balance}`);
  if (isFeatureBuy || isUpgradeSpinBuy) {
    balance = gameutils.decimalMultiplier(
      balance - reqBetAmount * Number(process.env.FEATURE_BUY_MULTIPLIER) + game.totalWin
    );
  } else {
    balance = gameutils.decimalMultiplier(balance - reqBetAmount + game.totalWin);
  }

  logger.info(`Balance after deduction is ------${balance}`);

  let resType;

  if (freeSpin?.isActive) {
    resType = 'fs'; // freeSpin
  } else if (isFeatureBuy) {
    resType = 'fb'; // featurebuy
  } else if (isActiveCampaign) {
    resType = 'pc'; //
  } else if (isUpgradeSpinBuy) {
    resType = 'usb'; // upgrade spin buy
  } else {
    resType = 'bg';
  }
  const res = { status: 'SUCCESS', ty: resType, b: balance, tw: game.totalWin, ...game.response };

  const isLastFreeSpin = freeSpin.count == 1 || maxWinningExceeded ? true : false;

  [freeSpin, maxWinningExceeded] = checkFreeSpin(
    game,
    freeSpin,
    res,
    reqBetAmount,
    isFeatureBuy,
    isActiveCampaign,
    maxWinningExceeded
  );

  logger.info(`free spin is ---${JSON.stringify(freeSpin)} ---maxWining Exceeded ----${maxWinningExceeded}--------
  isLastFreeSpin ouptut is -------${isLastFreeSpin}`);

  if (!isFeatureBuy && !isActiveCampaign && (!freeSpin.isActive || isLastFreeSpin)) {
    checkUpgradeSpin(user, res, betAmount, freeSpin, maxWinningExceeded);
  } else if ((!res?.fs?.a || res?.fs?.a == 0) && user.upgradeSpin.activeCount > 0 && !isFeatureBuy) {
    res.us = { a: true, c: user.upgradeSpin.activeCount, tw: 0 };
  }

  let savedGame = await saveGamePlay(userId, reqBetAmount, game, user, isFeatureBuy, maxWinningExceeded);
  let winData = {
    betAmount: isFeatureBuy ? reqBetAmount * Number(process.env.FEATURE_BUY_MULTIPLIER) : reqBetAmount,
    winAmount: savedGame.data.totalWin,
    isFreeSpin: savedGame.data.isFreeSpin === 1 ? true : false,
    currency: savedGame.data.currency,
    isFeatureBuy: isFeatureBuy,
  };

  logger.info(`Win data entered in redis is -------${JSON.stringify(winData)}`);

  // !NEED to check the datatype in redis why are we doing lpush here
  redis.lpush(`${redisDb}:queue`, JSON.stringify(winData));

  if (maxWinningExceeded) {
    res.maxWinningExceeded = true;
  }

  logger.info(`Exit the game play function------------`);
  return {
    savedGame,
    res,
    freeSpin,
  };
};

const betAPI = async (
  userId,
  betAmount,
  user,
  gameDataResult,
  slotResult,
  isFeatureBuy,
  activeCampaign,
  freeSpin,
  isUpgradeSpinBuy
) => {
  logger.info(`Inside the bet Api-function-------------`);

  betAmount = isFeatureBuy || isUpgradeSpinBuy ? betAmount * Number(process.env.FEATURE_BUY_MULTIPLIER) : betAmount;

  // in case of feature buy betAmount will be increase * Multiplier
  logger.info(`Bet placed of amount -----------=>${betAmount}`);
  let transactionId = 'T' + getRandomNumber(16);

  let saveTransaction = {
    amount: betAmount,
    transactionType: 'debit',
    operation: 'GAME_PLAY',
    status: 'SUCCESS',
    id: userId,
    transactionId: transactionId,
  };

  /*
    let a = {
      createdAt: '2025-05-27T11:33:54.755767Z',
      balance: 1000047,
      txId: 'T3849452515571372',
      processedTxId: 'T3849452515571372',
      alreadyProcessed: false,
      responseTransactionId: '10930',
      responseBalance: 901,
      balanceDetails: 231,
      txDetails: 9011,
    };
    */
  let bet = await betRequest(transactionId, user, betAmount, gameDataResult, activeCampaign);

  // now save this in transaction model that bet got placed

  let transactionSave;
  if (bet && bet.hasOwnProperty('txId') && bet.hasOwnProperty('balance')) {
    transactionSave = await saveWalletTransaction(
      saveTransaction,
      user,
      bet,
      slotResult,
      gameDataResult.data._id,
      isFeatureBuy,
      freeSpin
    );

    logger.info(`Transaction saved is -----------------${JSON.stringify(transactionSave)}`);
    // Check insufficient funds
    if (transactionSave.message == 'insufficient funds') {
      return {
        status: 'ERROR',
        message: 'insufficient funds',
      };
    }

    return {
      status: 'SUCCESS',
      user: transactionSave.data.user,
      gameId: gameDataResult.data._id,
      balance: bet.balance, // balance can be taken from bet object
    };
  } else {
    return bet;
  }
};

// ! Do we really need to pass user here, can't we make the DB call
const winAPI = async (
  userId,
  gamePlay,
  gameId, ///
  user,
  betAmount,
  activeCampaign,
  isFreeSpinWin,
  freeSpin,
  upgradeSpinTotalWin
) => {
  logger.info(
    `WinAPI --------userId is ${JSON.stringify(userId)} ------------gameId is --------${JSON.stringify(gameId)}`
  );
  // in the end we are deciding the win amount
  let winAmount = isFreeSpinWin ? freeSpin.totalWin + upgradeSpinTotalWin : gamePlay.res.tw;

  logger.info(`Win Amount is -------------------------${winAmount}`);
  let transactionId = 'T' + getRandomNumber(16);

  let saveTransaction = {
    amount: winAmount,
    transactionType: 'credit',
    operation: 'TOTAL_WIN',
    status: 'SUCCESS',
    id: userId,
    transactionId: transactionId,
  };

  logger.info(`transaction object is -----------${JSON.stringify(saveTransaction)}`);

  let win = await winRequest(transactionId, user, winAmount, gameId, gamePlay, betAmount, activeCampaign);

  const isValidWin = win && win.balance !== undefined && win.txId;

  if (!isValidWin) {
    saveTransaction.apiError = true;
    await saveWalletTransaction(saveTransaction, user);
    return {
      status: 'Failed',
      message: 'Issue while playing the game',
    };
  }

  await saveWalletTransaction(saveTransaction, user);
  return {
    status: 'SUCCESS',
    balance: win.balance,
  };
};
const userBet = async (
  userId,
  betAmount,
  user,
  isFeatureBuy,
  isUpgradeSpinBuy,
  freeSpin,
  reqBetAmount,
  campaignFreeSpin,
  upgradeSpin
) => {
  logger.info(`Inside the user bet function -------userId is ------${userId} ----------betAmount is -----${betAmount}--------isFeatureBuy---${isFeatureBuy}-
    --isUpgradedSpinBuy---${isUpgradeSpinBuy}-------free spins are -----${JSON.stringify(
    freeSpin
  )}----------campaign Free Spins are ---${JSON.stringify(campaignFreeSpin)}--
    upgrade Spins are -----${JSON.stringify(upgradeSpin)}-`);
  let activeCampaign = null;
  const currentTime = Date.now();

  // exist only for campaign
  if (!isFeatureBuy && !isUpgradeSpinBuy && freeSpin?.count === 0 && upgradeSpin?.count === 0) {
    for (const campaign of user.campaigns) {
      if (campaign) {
        const validFrom = new Date(campaign.validFrom);
        const validBefore = new Date(campaign.validBefore);

        if (currentTime >= validFrom && currentTime <= validBefore && campaign.playedSpinCount < campaign.spinCount) {
          activeCampaign = campaign;
          break; // ! why are we breaking it here -> because at one time one one campaign can exist
        }
      }
    }
  }

  const isActiveCampaign =
    !isFeatureBuy &&
    !isUpgradeSpinBuy &&
    freeSpin.count == 0 &&
    upgradeSpin.count == 0 &&
    activeCampaign &&
    activeCampaign.spinCount > 0
      ? true
      : false;

  logger.info(`Campagin status is ------------${isActiveCampaign}`);

  let gameResult = await gamePlay(
    userId,
    betAmount,
    user,
    isFeatureBuy,
    isActiveCampaign,
    activeCampaign,
    freeSpin,
    reqBetAmount,
    isUpgradeSpinBuy
  );

  freeSpin = gameResult.freeSpin;
  let walletBalance = 0;
  let win = null;

  // Handling the campaign OR bet Amount > 0
  if (reqBetAmount > 0 || (reqBetAmount === 0 && isActiveCampaign && freeSpin.count === 0)) {
    let bet = await betAPI(
      userId,
      reqBetAmount,
      user,
      gameResult.savedGame,
      gameResult.res, // slotResult -> it come from game play
      isFeatureBuy,
      activeCampaign,
      freeSpin,
      isUpgradeSpinBuy
    );

    logger.info(`Line 335 bet is -------------${JSON.stringify(bet)}`);
    if (bet.status !== 'SUCCESS') return bet;

    // Only for active campagin OR normal bet where bet amount > 0
    if ((gameResult.res.tw > 0 || (activeCampaign && reqBetAmount === 0)) && !gameResult.res.fs && !gameResult.res.us) {
      win = await winAPI(userId, gameResult, bet.gameId, bet.user, reqBetAmount, activeCampaign);

      if (win) {
        // update the balance in  gameResult
        gameResult.res.b = win.balance;
      }
      logger.info(`Result of win line 349----------------${JSON.stringify(win)}`);
    }
    // handling free spins here --
    else if (
      (gameResult.res.tw > 0 || (activeCampaign && reqBetAmount === 0)) &&
      gameResult.res.fs &&
      gameResult.res.fs?.c > 0
    ) {
      /*
      c-> count
      a-> amount,
      m-> matches
      tw-> total win 
      */
      logger.info('free spins are present --------------', gameResult.res.fs);
      gameResult.res.b = Number(bet.balance);
      gameResult.res.fs.tw = gameResult.res.tw;
      freeSpin.totalWin = gameResult.res.tw;
    }
    // handling win for upgraded spin
    else if (gameResult.res.tw > 0 && gameResult.res.us && gameResult.res.us?.c > 0) {
      gameResult.res.b = Number(bet.balance);
      gameResult.res.us.tw = gameResult.res.tw;
    }

    walletBalance = win && win.status === 'SUCCESS' ? win.balance : bet.balance;

    logger.info(`WalletBalance: ${walletBalance} `);

    // create a campaign model if there is active campaign then save it

    if (isActiveCampaign && activeCampaign && reqBetAmount === 0) {
      // now if it comes here then it means the campaign is active and bet amount
      let userUpdate = {};
      userUpdate.campaigns = user.campaigns.map((campaign) => {
        if (campaign && campaign.campaignId === activeCampaign.campaignId) {
          const campaignTotalWin = campaign?.totalWin ?? 0;
          return {
            ...campaign,
            playedSpinCount: campaign.playedSpinCount + 1,
            totalWin: campaignTotalWin + gameResult.res.tw,
          };
        }
        return campaign;
      });

      // now update the player model
      const playerInstance = await Player(process.env.DB_NAME + `-${user.consumerId}`);

      const campaignInstance = await Campaign(process.env.DB_NAME + `-${user.consumerId}`);

      const updatedPlayer = await playerInstance
        .findOneAndUpdate({ _id: userId }, { $set: userUpdate }, { upsert: true, new: true })
        .lean();

      // upsert will create a new document if it's not present in db ---
      const updatedCampaign = await campaignInstance.findOneAndUpdate(
        { campaignId: activeCampaign.campaignId },
        { $set: { playedSpinCount: activeCampaign.playedSpinCount + 1 } },
        { upsert: true, new: true }
      );

      gameResult.res.campaign = {
        totalCount: campaignFreeSpin.totalCount,
        left: campaignFreeSpin.count - 1,
        betAmount: campaignFreeSpin.betAmount,
        validBefore: campaignFreeSpin.validBefore,
        totalWin: Number((campaignFreeSpin.totalWin + gameResult.res.tw).toFixed(2)),
      };

      //
    }
  } else {
    logger.info('inside the else part------HANDLING FREE SPINS or UPGRADED Spins================-');

    let userUpdate = { freeSpin, upgradeSpin: user.upgradeSpin };
    logger.info('user update are ------', JSON.stringify(userUpdate, null, 4));

    // we will call the win in case of free spin count = 0 && upgrade spin active count =0
    if (freeSpin.count == 0 && user?.upgradeSpin?.activeCount == 0) {
      win = await winAPI(
        userId,
        gameResult,
        user.freeSpinRoundId, // need to check
        user,
        reqBetAmount,
        activeCampaign,
        true,
        freeSpin,
        gameResult.res?.us?.tw ?? 0
      );
      gameResult.res.b = win && !isNaN(Number(win.balance)) ? Number(win.balance) : Number(user.balance);

      logger.info(`win is -------------${JSON.stringify(win)}`);
      // if no freespin or upgradespin that check for active campaign
      if (activeCampaign && activeCampaign.spinCount > 0) {
        gameResult.res.campaign = {
          left: activeCampaign.spinCount,
          betAmount: activeCampaign.totalBetAmount,
          vaildBefore: new Date(activeCampaign.validBefore).getTime() / 1000,
        };
      }
    } else {
      gameResult.res.b = Number(user.balance);
      logger.info(`Balance now is ------------${gameResult.res.b}`);
    }

    const playerInstance = await Player(process.env.DB_NAME + `-${user.consumerId}`);
    await playerInstance.findOneAndUpdate({ _id: userId }, { $set: userUpdate }, { upsert: true, new: true }).lean();

    walletBalance = win && win.status === 'SUCCESS' ? win.balance : user.balance;
    logger.info(`Wallet balance is ----------${walletBalance}`);
  }

  if (win && win?.status !== 'SUCCESS') return win;
  else {
    let response = gameResult.res;

    return response;
  }

  // 1> bet 2. gameplay  3> win api
};

const gameBet = async (req, res) => {
  try {
    let { userId, token, timestamp, betAmount } = req?.body?.data !== undefined ? JSON.parse(req.body.data) : req.body;
    if (!userId || !token || !timestamp || !isValidTwoDecimalNumber(betAmount)) {
      return res.status(401).json({ status: 'ERROR', message: 'something went wrong!' });
    }
    // check that userId is valid or not
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
    betAmount = Number(parseFloat(betAmount).toFixed(2));
    let data = getTokenDetails(token);

    logger.info(`Data fetched from token --------------${JSON.stringify(data)}`);
    let consumerId = data?.providerName;

    let playerVerify = await verifyPlayer(userId, betAmount, false, consumerId);
    const reqBetAmount = betAmount;

    // if the bet amount is 0 and player got verified , in that case check the betAmount placed in freeSpin or upgradedSpin or campaignFreeSpin
    if (betAmount == 0 && playerVerify?.status != 'ERROR') {
      if (playerVerify.freeSpin.count > 0) {
        betAmount = playerVerify.freeSpin.betAmount;
      } else if (playerVerify.upgradeSpin.count > 0) {
        betAmount = playerVerify.upgradeSpin.betAmount;
      } else if (playerVerify.campaignFreeSpin.count > 0) {
        betAmount = playerVerify.campaignFreeSpin.betAmount;
      }
    }

    logger.info(`Player verification status ${playerVerify.status}:::::::::::::::::::::::`);

    if (playerVerify.status === 'SUCCESS') {
      let result = await userBet(
        userId,
        betAmount,
        playerVerify.data,
        false,
        false,
        playerVerify.freeSpin,
        reqBetAmount,
        playerVerify.campaignFreeSpin,
        playerVerify.upgradeSpin
      );
      logger.info(`output after user bet function ------${JSON.stringify(result)}`);
      if (result.status === 'SUCCESS') {
        await redis.set(`${redisDb}-token:${token}`, timestamp, 'EX', 3600);
        await redis.set(`${redisDb}-user:${userId}`, token, 'EX', 3600);

        return res.status(200).json(result);
      }
      return res.status(401).json(result);
    }
    return res.status(401).json(playerVerify);
  } catch (error) {
    logErrorMessage(error);

    logger.info(`Error is -----------${JSON.stringify(error)}`);
    throw error;
  }
};

const closeGame = async (req, res, next) => {
  logger.info(`closing the game ----------`);
  let userId = req.params.userId.toString();
  let token = req.params.urlToken.toString();
  let timeStamp = req.params.timeStamp.toString();

  logger.info(`Going to close the current sessionn for ${userId}`);
  if (!isValidUserId(userId, token)) {
    return res.status(401).json({
      status: 'Error',
      message: 'Token is invalid',
    });
  } else {
    const isCurrenSession = await verifyCurrentSession(token, timeStamp);
    logger.info(`Current session is ----${isCurrenSession}`);
    if (isCurrenSession) {
      return res.status(401).json({
        status: 'UNAUTHORIZED',
        message: 'Previous session is opened. Please close the previous game or start the game from the lobby...',
      });
    }
  }

  await redis.del(`${redisDb}-token:${token}`);

  logger.info(`Game got closed ------`);
  res.status(200).json({});
};

module.exports = { gameBet, closeGame, userBet };
