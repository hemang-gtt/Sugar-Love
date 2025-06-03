const { logErrorMessage } = require('../logs');
const Win = require('../models/winModel');
const { postReq } = require('../api');
const masterController = require('../controllers/masterController');
const winRequest = async (transactionId, player, amount, gameId, gamePlay, betAmount, activeCampaign) => {
  let win = {
    type: 'REAL',
    playerId: player.playerId,
    productId: player.productId,
    txId: transactionId,
    roundId: gameId.toString(), // this should be the _id of game model
    roundClosed: true,
    amount: parseFloat(amount),
    currency: player.currency,
    // side split is optional
  };

  console.log('win object is ----', win);

  // NEED TO CHECK -> !aciveCampaign
  let isFreespinCampaignFinished = activeCampaign?.playedSpinCount + 1 >= activeCampaign?.totalSpinCount;
  if (activeCampaign && betAmount === 0) {
    win.type = 'Freespin';
    win.freespinCampaignId = activeCampaign.campaignId;
    win.isFreespinCampaignFinished = isFreespinCampaignFinished;
    win.isLast = isFreespinCampaignFinished;
  }

  // if(activeCampaign.freeSpins === 0){
  //
  // }

  try {
    let res;
    if (activeCampaign) {
      res = await postReq(player, win, 'campaignWin', player._id);
    } else {
      res = await postReq(player, win, 'win', player._id);
    }

    /* ------------SAMPLE RESPONSE FROM WIN API -------------
    let a = {
      createdAt: '2025-05-28T07:17:56.992497Z',
      balance: 1000043,
      txId: 'T5275521915871981',
      processedTxId: 'T5275521915871981',
      alreadyProcessed: false,
    };

    */

    console.log('response from win API is ----------', res);
    win.responseTransactionId = res.processedTxId;
    win.responseBalance = res.balance;
    win.balanceDetails = res.balanceDetails;
    win.alreadyProcessed = res.alreadyProcessed;
    win.createdAt = res.createdAt;
    win.txDetails = res.txDetails;

    console.log('win object which we are going to save in the model -----------', win);
    const winInstance = await Win(process.env.DbName + `-${player?.consumerId}`);
    const newWin = new winInstance(win);
    const savedWin = await newWin.save();
    console.log('saved win object is ---------', savedWin);
    await masterController.saveToMaster(player._id, 'WIN', win, res, player, player?.consumerId);

    return res;
  } catch (error) {
    console.log('error is ----', error);

    // we will do some thing here
    logErrorMessage(error);
    return error?.response?.data;
  }
};

module.exports = { winRequest };
