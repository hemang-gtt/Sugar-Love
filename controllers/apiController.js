const { postReq } = require('../api');

const playerInfoFinder = async (payload) => {
  logger.info(`payload is -----------${JSON.stringify(payload)}`);

  const { consumerId, sessionToken } = payload;
  let player = { consumerId };
  let data = { sessionToken };

  const playerData = await postReq(player, data, 'playerInfo', '');
  return playerData;
};

module.exports = { playerInfoFinder };
