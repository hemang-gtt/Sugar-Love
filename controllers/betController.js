const { postReq } = require('../api');
const { logErrorMessage, dbLog } = require('../logs');
const Bet = require('../models/betModel');
const masterController = require('../controllers/masterController');

const betRequest = async (transactionId, player, amount, gameDataResult, activeCampaign) => {
  console.log('hi----inside the bet controller --');

  console.log('game result is ------', gameDataResult);

  let bet = {
    sessionToken: player.sessionToken,
    playerId: player.playerId,
    productId: player.productId,
    txId: transactionId, // our side unique id is this --------------
    roundId: gameDataResult.data._id.toString(), // convert it into string
    roundClosed: false, // need to check this
    amount,
    currency: player.currency,
  };

  // ! Will check in the case of feature and campaign what to do
  if (activeCampaign && amount === 0) {
    bet.freespinCampaignId = activeCampaign.campaignId;
  }
  console.log('bet object send to there api is  ------', bet);
  /*
   ----------------------------------SAMPLE BET OBJECT------------------------------
  {
  sessionToken: '645Od5gapQh7HFQBlLjIa4pPUNbeZGrRZAQKM3g5efcn5RQ6xP0v8uMdVFc_949__nlf',
  playerId: 'mvp_691099364_nlf',
  productId: 'mahjong-fortune',
  txId: 'T3849452515571372',
  roundId: '6835a3213a19445f3881023b',
  roundClosed: false,
  amount: 1,
  currency: 'UAH'
}

  */

  try {
    const res = await postReq(player, bet, 'bet', player._id);

    /*

    -------------------------------SAMPLE RESPONSE OF BET ------------------------
    let a = {
      createdAt: '2025-05-27T11:33:54.755767Z',
      balance: 1000047,
      txId: 'T3849452515571372',
      processedTxId: 'T3849452515571372',
      alreadyProcessed: false,
    };
    */

    console.log('res is ----', res);

    bet.responseTransactionId = res.processedTxId; // there transaction Id(Eva Platform side)
    bet.responseBalance = res.balance;
    bet.balanceDetails = res.balanceDetails;
    bet.txDetails = res.txDetails;

    dbLog(`SET, req: BET, playerId: ${player._id}, data: ${JSON.stringify(bet)}`);

    // now save the data to bet model and then master collection

    const betInstance = await Bet(process.env.DbName + `-${player?.consumerId}`);
    const newBet = new betInstance(bet);
    const betSavedData = await newBet.save();
    console.log('bet data saved is ----', betSavedData);
    // now save to master
    await masterController.saveToMaster(player._id, 'BET', bet, res, player, player?.consumerId);

    return res;
  } catch (error) {
    // ! Will handle the cancel api here ----------------
    console.log('error came is- ----', error);
    logErrorMessage(error);
    return error;
  }
};

module.exports = { betRequest };
