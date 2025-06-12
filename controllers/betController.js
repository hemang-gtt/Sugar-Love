const { postReq } = require('../api');
const { logErrorMessage, dbLog, apiLog } = require('../logs');
const Bet = require('../models/betModel');

const Refund = require('../models/refundModel');
const masterController = require('../controllers/masterController');
const { saveWalletTransaction } = require('../controllers/transactionController');
const { getRandomNumber } = require('../utils/common');
const logger = require('../utils/logger');
const betRequest = async (transactionId, player, amount, gameDataResult, activeCampaign) => {
  logger.info(`Inside the bet controller ::::::::::::::::::::::::::::::::::::::::::::::::::::::`);

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

  logger.info(`Bet object send to them ::::::::::::::::::${JSON.stringify(bet)}`);
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

    bet.responseTransactionId = res.processedTxId; // there transaction Id(Eva Platform side)
    bet.responseBalance = res.balance;
    bet.balanceDetails = res.balanceDetails;
    bet.txDetails = res.txDetails;

    dbLog(`SET, req: BET, playerId: ${player._id}, data: ${JSON.stringify(bet)}`);

    // now save the data to bet model and then master collection

    const betInstance = await Bet(process.env.DB_NAME + `-${player?.consumerId}`);
    const newBet = new betInstance(bet);
    await newBet.save();
    await masterController.saveToMaster(player._id, 'BET', bet, res, player, player?.consumerId);

    return res;
  } catch (error) {
    // ! Will handle the cancel api here ----------------

    let finalError;
    logger.info(`Error came in bet controller ---------------${JSON.stringify(error)}`);
    if (error?.response?.data?.code === 'locked.player') {
      finalError = {
        status: error?.response?.data?.code,
        message: error?.response?.data?.message,
      };
      throw finalError;
    } else {
      logger.info(`Refund controller getting called ------------------`);
      await cancelRequest(player, bet);
    }

    logErrorMessage(error);
    finalError = {
      status: error?.response?.data.code || 'Internal Error',
      message: error?.response?.data?.message || 'Some Issue Occured while Placing the bet',
    };
    return finalError;
  }
};

const cancelRequest = async (player, bet) => {
  let transactionId = 'T' + getRandomNumber(16);
  let refund = {
    playerId: player.playerId,
    productId: player.productId,
    txId: transactionId, // transaction id at our end
    roundId: bet.roundId,
    roundClosed: bet.roundClosed,
    amount: bet.amount,
    sideSplit: bet?.sideSplit, // only send in the case if it exists
    currency: player.currency,
  };

  logger.info(`Refund object is ----------${JSON.stringify(refund)}`);

  // let saveTransaction = {
  //   amount: bet.amount,
  //   transactionType: 'refund',
  //   operation: 'REFUND',
  //   status: 'SUCCESS',
  //   id: player._id,
  //   transactionId,
  //   referenceTransactionId: bet.txId,
  // };
  try {
    const res = await postReq(player, refund, 'cancel', player._id);

    logger.info(`RESPONSE after refund ----------------${JSON.stringify(res)}`);
    apiLog(`POST req : REFUND -----------------Response is ${JSON.stringify(res)}`);

    refund.createdAt = res.createdAt;
    refund.responseTransactionId = res.processedTxId;
    refund.responseBalance = res.balance;
    refund.alreadyProcessed = res.alreadyProcessed;
    refund.balanceDetails = res.balanceDetails;
    refund.txDetails = res.txDetails;
    dbLog(`SET, req: Cancel, playerId: ${player._id}, data: ${JSON.stringify(refund)}`);

    const refundInstance = await Refund(process.env.DB_NAME + `-${player?.consumerId}`);
    const newRefund = new refundInstance(refund);
    await newRefund.save();

    await masterController.saveToMaster(player._id, 'REFUND', refund, res.data, player, player.consumerId);
    return res;
  } catch (error) {
    // if here the issue came then we save it to wallet transaction and will run later with cron
    logErrorMessage(error);
    // saveTransaction.apiError = true;
    // await saveWalletTransaction(saveTransaction, player); // ! we don't need it may be will check

    logger.info(`Error in refund request is ------------`, error);

    return error;
  }
};

module.exports = { betRequest };
