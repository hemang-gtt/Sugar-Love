const { postReq } = require('../api');

const playerInfoFinder = async (payload) => {
  console.log('payload is ------', payload);

  const { consumerId, sessionToken } = payload;
  let player = { consumerId };
  let data = { sessionToken };

  const playerData = await postReq(player, data, 'playerInfo', '');
  return playerData;
};

module.exports = { playerInfoFinder };
