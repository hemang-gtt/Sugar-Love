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
  let balance = Number(user.balance);

  console.log('bet amount is ------line 47 HEMANG====================== ', betAmount);
  const game = playGame(
    balance,
    betAmount,
    user.upgradeSpin,
    freeSpin,
    isFeatureBuy,
    isActiveCampaign,
    isUpgradeSpinBuy
  );

  console.log('output after game play --------', game);
  let maxWinningExceeded = game.maxWinningExceeded;
  console.log('max winning exceeded is ----', maxWinningExceeded);

  console.log('balance before deduction ----------------------', balance);
  if (isFeatureBuy || isUpgradeSpinBuy) {
    balance = gameutils.decimalMultiplier(
      balance - reqBetAmount * Number(process.env.FEATURE_BUY_MULTIPLIER) + game.totalWin
    );
  } else {
    balance = gameutils.decimalMultiplier(balance - reqBetAmount + game.totalWin);
  }

  console.log('balance after deduction is ---- -----', balance);

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

  // ! what are we doing here and why ?

  [freeSpin, maxWinningExceeded] = checkFreeSpin(
    game,
    freeSpin,
    res,
    reqBetAmount,
    isFeatureBuy,
    isActiveCampaign,
    maxWinningExceeded
  );

  console.log(`free spin is ---${JSON.stringify(freeSpin, null, 4)} ---maxWining Exceeded ----${maxWinningExceeded}`);

  if (!isFeatureBuy && !isActiveCampaign && (!freeSpin.isActive || isLastFreeSpin)) {
    checkUpgradeSpin(user, res, betAmount, freeSpin, maxWinningExceeded);
  } else if ((!res?.fs?.a || res?.fs?.a == 0) && user.upgradeSpin.activeCount > 0 && !isFeatureBuy) {
    res.us = { a: true, c: user.upgradeSpin.activeCount, tw: 0 };
  }
  console.log('res is ------', res);
  console.log('game is ----', game);

  let savedGame = await saveGamePlay(userId, reqBetAmount, game, user, isFeatureBuy, maxWinningExceeded);

  console.log('game got saved is ---============-', savedGame);
  let winData = {
    betAmount: isFeatureBuy ? reqBetAmount * Number(process.env.FEATURE_BUY_MULTIPLIER) : reqBetAmount,
    winAmount: savedGame.data.totalWin,
    isFreeSpin: savedGame.data.isFreeSpin === 1 ? true : false,
    currency: savedGame.data.currency,
    isFeatureBuy: isFeatureBuy,
  };

  console.log('win data pushed in redis -----', winData);

  // !NEED to check the datatype in redis why are we doing lpush here
  redis.lpush(`${redisDb}:queue`, JSON.stringify(winData));

  if (maxWinningExceeded) {
    res.maxWinningExceeded = true;
  }

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
  console.log('hi------inside bet API-');

  betAmount = isFeatureBuy || isUpgradeSpinBuy ? betAmount * Number(process.env.FEATURE_BUY_MULTIPLIER) : betAmount;

  // in case of feature buy betAmount will be increase * Multiplier
  console.log('bet amount is ----', betAmount);

  console.log('line number 151 -----------------', slotResult);
  let transactionId = 'T' + getRandomNumber(16);

  let saveTransaction = {
    amount: betAmount,
    transactionType: 'debit',
    operation: 'GAME_PLAY',
    status: 'SUCCESS',
    id: userId,
    transactionId: transactionId,
  };

  console.log('save transaction is ----', saveTransaction);

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

  // now save this in transaction model

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
    console.log('transaction save line 197 output is ---------', transactionSave);
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
    // return bet error
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
  console.log('win api in game player controller ----', userId, gamePlay, gameId);
  let winAmount = isFreeSpinWin ? freeSpin.totalWin + upgradeSpinTotalWin : gamePlay.res.tw;

  console.log('win amount is --------', winAmount);
  let transactionId = 'T' + getRandomNumber(16);

  let saveTransaction = {
    amount: winAmount,
    transactionType: 'credit',
    operation: 'TOTAL_WIN',
    status: 'SUCCESS',
    id: userId,
    transactionId: transactionId,
  };

  console.log('save transaction object is -----', saveTransaction);

  let win = await winRequest(transactionId, user, winAmount, gameId, gamePlay, betAmount, activeCampaign);

  console.log('output from win controler is -----', win);
  if (!win || win?.hasOwnProperty('transactionId') || win?.hasOwnProperty('balance')) {
    saveTransaction.apiError = true;
  }

  let transactionSaved = await saveWalletTransaction(saveTransaction, user);

  console.log('saved transaction -----', transactionSaved);

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
  console.log('inside the user bet function ------');

  console.log('is upgrade spin buy-----', isUpgradeSpinBuy);
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
          break; // ! why are we breaking it here
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

  console.log('is feature buy ---------', isFeatureBuy);

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

  console.log('freespin are --line 318--- ', freeSpin);

  let walletBalance = 0;
  let win = null;

  // this case will handle bet only can placed if betAmount >0 || or any active campaign is present
  console.log('req bet amount before placing the bet---- ', reqBetAmount);
  if (reqBetAmount > 0 || (reqBetAmount === 0 && isActiveCampaign && freeSpin.count === 0)) {
    let bet = await betAPI(
      userId,
      reqBetAmount,
      user,
      gameResult.savedGame,
      gameResult.res,
      isFeatureBuy,
      activeCampaign,
      freeSpin,
      isUpgradeSpinBuy
    );

    if (bet.status !== 'SUCCESS') return bet;

    // now we will call win API
    gameResult.res.tw = 5; // making it static for now
    console.log('bet line 239 is -----', bet);
    console.log('game play line 294 ----', gameResult);

    // if free spin are available it will not go here , only for active campagin and normal bet where bet amount > 0
    if ((gameResult.res.tw > 0 || (activeCampaign && reqBetAmount === 0)) && !gameResult.res.fs && !gameResult.res.us) {
      console.log('we will call the win api -----because the total win > 0');
      win = await winAPI(userId, gameResult, bet.gameId, bet.user, reqBetAmount, activeCampaign);

      console.log('win is ------', win);
      if (win) {
        // update the balance in  gameResult
        gameResult.res.b = win.balance;
      }

      console.log('win line number 346 ---------------', win);
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
      console.log('free spins are present --------------', gameResult.res.fs);
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
    console.log('walletBalance: ' + walletBalance);

    // create a campaign model if there is active campaign then save it

    if (isActiveCampaign && activeCampaign && reqBetAmount === 0) {
      // now if it comes here then it means the campaign is active and bet amount
      let userUpdate = {};
      userUpdate.campaigns = user.campaigns.map((campaign) => {
        if (campaign && campaign.campaignId === activeCampaign.campaignId) {
          return {
            ...campaign,
            playedSpinCount: campaign.playedSpinCount + 1,
          };
        }
        return campaign;
      });

      // now update the player model
      const playerInstance = await Player(process.env.DbName + `-${user.consumerId}`);

      const campaignInstance = await Campaign(process.env.DbName + `-${user.consumerId}`);

      const updatedPlayer = playerInstance
        .findOneAndUpdate({ _id: userId }, { $set: userUpdate }, { upsert: true, new: true })
        .lean();

      // upsert will create a new document if it's not present in db ---
      const updatedCampaign = campaignInstance.findOneAndUpdate(
        { campaignId: activeCampaign.campaignId },
        { $set: { playedSpinCount: activeCampaign.playedSpinCount + 1 } },
        { upsert: true, new: true }
      );
      gameResult.res.campaign = {
        left: campaignFreeSpin.count - 1,
        betAmount: campaignFreeSpin.betAmount,
        vaildBefore: campaignFreeSpin.vaildBefore,
      };

      console.log('game result campaign is ---------', gameResult.res.campaign);
      console.log('updated campaign are -------', updatedCampaign);

      console.log('player got updated -----', updatedPlayer);

      //
    }
  } else {
    console.log('inside the else part-------');

    let userUpdate = { freeSpin, upgradeSpin: user.upgradeSpin };
    console.log('user update are ------', userUpdate);

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

      console.log('win is ----------line 432------', win);
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
    }

    const playerInstance = await Player(process.env.DbName + `-${user.consumerId}`);
    const updatedPlayer = await playerInstance
      .findOneAndUpdate({ _id: userId }, { $set: userUpdate }, { upsert: true, new: true })
      .lean();

    console.log('updated player line 456 ------------------', updatedPlayer);
    walletBalance = win && win.status === 'SUCCESS' ? win.balance : user.balance;
    console.log('walletBalance: ' + walletBalance);
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
    console.log('bet api is --------');
    let { userId, token, timeStamp, betAmount } = req?.body?.data !== undefined ? JSON.parse(req.body.data) : req.body;
    console.log('user id is ----', userId, token, timeStamp, betAmount);

    if (!userId || !token || !timeStamp || !isValidTwoDecimalNumber(betAmount)) {
      return res.status(401).json({ status: 'ERROR', message: 'something went wrong!' });
    }
    // check that userId is valid or not
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
    betAmount = Number(parseFloat(betAmount).toFixed(2));
    let data = getTokenDetails(token);

    console.log('data fetched from token is -----', data);
    let consumerId = data?.providerName;

    let playerVerify = await verifyPlayer(userId, betAmount, false, consumerId);

    console.log('playerVerify is -----', playerVerify);
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

    console.log('bet amount line 536 going in game Bet function is -----------', betAmount);
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

      console.log('result is ----', result);
      if (result.status === 'SUCCESS') {
        await redis.set(`${redisDb}-token:${token}`, timeStamp, 'EX', 3600);
        await redis.set(`${redisDb}-user:${userId}`, token, 'EX', 3600);

        return res.status(200).json(result);
      }
      return res.status(401).json(result);
    }
    return res.status(401).json(playerVerify);
  } catch (error) {
    logErrorMessage(error);
    console.log('error is ----', error);
    throw error;
  }
};

const closeGame = async (req, res, next) => {
  logger.info(`closing the game ----------`);
  let userId = req.params.userId.toString();
  let token = req.params.urlToken.toString();
  let timeStamp = req.params.timeStamp.toString();

  console.log('going to close the current session ----');
  if (!isValidUserId(userId, token)) {
    return res.status(401).json({
      status: 'Error',
      message: 'Token is invalid',
    });
  } else {
    const isCurrenSession = await verifyCurrentSession(token, timeStamp);
    console.log('current session is ----------', isCurrenSession);
    if (isCurrenSession) {
      return res.status(401).json({
        status: 'UNAUTHORIZED',
        message: 'Previous session is opened. Please close the previous game or start the game from the lobby...',
      });
    }
  }

  await redis.del(`${redisDb}-token:${token}`);

  console.log('going to close the game ----');
  res.status(200).json({});
};

module.exports = { gameBet, closeGame, userBet };
