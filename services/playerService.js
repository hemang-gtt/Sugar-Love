const masterController = require('../controllers/masterController');
const Player = require('../models/playerModel');
const { dbLog } = require('../logs');
const jwt = require('jsonwebtoken');

const { hasDateChanged } = require('../utils/common');
const gameUtils = require('../gamePlay/gameUtils');
const { table1 } = require('../weights/tables');

const gameLaunch = async (payload, playerInfo) => {
  console.log('payload is ---------', payload);
  console.log('player infor is -----', playerInfo);
  console.log('hello from game launch');

  const playerInstance = await Player(process.env.DbName + `-${payload?.consumerId}`);

  const player = await playerInstance
    .findOne({
      playerId: playerInfo.playerId,
    })
    .lean();

  dbLog(`GET, req: GAME_LAUNCH, data: ${JSON.stringify(player)}`);

  console.log('player present in model is ---------', player);

  if (!player) {
    console.log('registering the player------');
    return await registerPlayer(payload, playerInfo, playerInstance);
  } else {
    console.log('player is already register going to update it ---');
    return await updatePlayer(payload, playerInfo, playerInstance, player);
  }
};

const registerPlayer = async (payload, playerInfo, playerInstance) => {
  let playerData = {
    productId: payload.productId,
    lang: payload.lang,
    targetChannel: payload.targetChannel,
    consumerId: payload.consumerId,
    lobbyUrl: payload.lobbyUrl,
    sessionToken: payload.sessionToken,
    token: '',
    country: playerInfo.country,
    balance: playerInfo.balance,
    displayName: playerInfo.displayName,
    currency: playerInfo.currency,
    playerId: playerInfo.playerId,
    balanceDetails: playerInfo?.balanceDetails,
    totalGameCount: 0,
    todayGameCount: 0,
    isBanned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    upgradeSpin: {
      required:
        process.env.DUMMY_DATA_TESTING === 'true'
          ? Number(process.env.DUMMY_UPGRADE_SPIN_COUNT)
          : gameUtils.getKeyBasedOnWeights(table1, 'wins'),

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
  };
  console.log('player data is -----', playerData);

  dbLog(`Set, req: REGISTER, data:${JSON.stringify(playerData)}`);

  console.log('player data is ----', playerData);
  const newPlayer = new playerInstance(playerData);
  let savedPlayer = await newPlayer.save();
  console.log('player saved -------', savedPlayer);

  // now create the token and return it
  console.log('jwt secret key ------', process.env.JWT_SECRET_KEY);
  const token = jwt.sign(
    {
      userId: savedPlayer._id,
      providerName: payload?.consumerId,
    },
    process.env.JWT_SECRET_KEY
  );

  console.log('generated token is-----', token);

  await playerInstance.findOneAndUpdate({ _id: savedPlayer._id }, { $set: { token: token } }, { new: true }).lean();

  dbLog(`SET, req: REGISTER, data: ${JSON.stringify(playerData)}`);

  console.log('game base url is-------', process.env.GAME_BASE_URL);
  let response = {
    url: `${process.env.GAME_BASE_URL}?userId=${savedPlayer._id}&token=${token}&locale=${playerData.lang}&api=true&base=${process.env.BASE}&type=${process.env.TYPE}&path=${process.env.BASE_PATH}/`,
  };

  console.log('response is ---------', response);

  // save this data to master controller
  await masterController.saveToMaster(savedPlayer._id, 'REGISTER', payload, response);

  return response;
};
const updatePlayer = async (payload, playerInfo, playerInstance, existingPlayer) => {
  const token = jwt.sign({ userId: existingPlayer._id, providerName: payload?.consumerId }, process.env.JWT_SECRET_KEY);

  console.log('token is ------', token);
  let currentDateAndTime = Math.floor(new Date().getTime() / 1000);

  console.log('current date and time is ----', currentDateAndTime);

  let isDateChanged = hasDateChanged(currentDateAndTime, existingPlayer.updatedAt);

  console.log('is date changed -----', isDateChanged);

  // get the active campaign
  let spinCount = 0;
  let activeCampaigns = [];
  const currentTime = new Date();

  for (const campaign of existingPlayer.campaigns) {
    if (campaign) {
      const validFrom = new Date(campaign.validFrom);
      console.log('valid from-----', validFrom);

      const validBefore = new Date(campaign.validBefore);
      if (campaign.playedSpinCount < campaign.spinCount && currentTime <= validBefore) {
        activeCampaigns.push(campaign);
      }

      if (currentTime >= validFrom && currentTime <= validBefore) {
        spinCount +=
          campaign.spinCount - campaign.playedSpinCount > 0 ? campaign.spinCount - campaign.playedSpinCount : 0;
      }
    }
  }

  let playerData = {
    productId: payload.productId,
    lang: payload.lang,
    targetChannel: payload.targetChannel,
    consumerId: payload.consumerId,
    lobbyUrl: payload.lobbyUrl,
    sessionToken: payload.sessionToken,
    token: token,
    country: playerInfo.country,
    balance: playerInfo.balance,
    displayName: playerInfo.displayName,
    currency: playerInfo.currency,
    playerId: playerInfo.playerId,
    balanceDetails: playerInfo?.balanceDetails,
    totalGameCount: isDateChanged ? 0 : existingPlayer.todayGameCount,
    todayGameCount: isDateChanged ? 0 : existingPlayer.todayGameCount,
    isBanned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    campaigns: activeCampaigns,
  };

  if (
    (spinCount > 0 || existingPlayer.freeSpin.count > 0 || existingPlayer.upgradeSpin.activeCount > 0) &&
    existingPlayer.resumedGameCurrency === ''
  ) {
    if (existingPlayer.currency !== playerData.currency) {
      playerData.resumedGameCurrency = existingPlayer.currency;
    } else if (existingPlayer.resumedGameCurrency === playerData.currency) {
      playerData.resumedGameCurrency = '';
    }
  }

  dbLog(`SET, req: LOGIN, playerId: ${existingPlayer._id}, data: ${JSON.stringify(playerData)}`);

  console.log('player data is ----', playerData);

  const updatedPlayer = await playerInstance
    .findOneAndUpdate({ _id: existingPlayer._id }, { $set: playerData }, { new: true })
    .lean();

  dbLog(`SET, req: LOGIN, playerId: ${existingPlayer._id}, data: ${JSON.stringify(playerData)}`);

  let response = {
    url: `${process.env.GAME_BASE_URL}?userId=${updatedPlayer._id}&token=${token}&locale=${playerData.lang}&api=true&base=${process.env.BASE}&type=${process.env.TYPE}&path=${process.env.BASE_PATH}/`,
  };

  console.log('response is -----', response);

  await masterController.saveToMaster(updatedPlayer._id, 'LOGIN', payload, response, existingPlayer);
  return response;
};

module.exports = { gameLaunch };
