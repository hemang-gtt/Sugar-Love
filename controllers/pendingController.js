const axios = require('axios');
const Pending = require('../models/pendingModel');
const Win = require('../models/winModel');
const Refund = require('../models/refundModel');

const Transaction = require('../models/transactionModel');
const { saveToMaster } = require('../controllers/masterController');
const { logErrorMessage } = require('../logs');

const resolvePending = async () => {
  try {
    console.log('resolve the pending task ----------');
    let pendingInstance = await Pending(process.env.DbName);

    let data = await pendingInstance.find();

    console.log('data needs to be resolved ---------', data);
    let isAllResolved = true;
    for (let i = 0; i < data.length; i++) {
      let req = data[i];
      let resp = '';
      let parsedRequest = JSON.parse(req.request);

      let providerName = parsedRequest.consumerId;
      if (req.type === 'win') {
        resp = await pendingWinRequest(parsedRequest, req.type, 0, true, providerName);
      } else if (req.type === 'cancel') {
        resp = await pendingCancelRequest(parsedRequest, req.type, 0, true, providerName);
      }
      if (resp && resp.hasOwnProperty('balance')) {
        const updatedData = {
          apiStatus: 'completed',
          apiResolvedTimeStamp: Math.floor(new Date().getTime() / 1000),
        };

        const transactionInstance = await Transaction(process.env.DbName + `-${providerName}`);

        const pendingInstance = await Pending(process.env.DbName);

        const updatedTransaction = await transactionInstance.findOneAndUpdate(
          { userId: req.userId, transactionId: req.transactionId },
          { $set: updatedData },
          { new: true }
        );

        console.log('updated transaction is ---------', updatedTransaction);

        await pendingInstance.findByIdAndDelete(req._id).lean();
      } else {
        isAllResolved = false;
      }
    }
    return isAllResolved;
  } catch (error) {
    logErrorMessage(error);
    console.log('error in resolve pending is ---------', error);
  }
};

const pendingWinRequest = async (win, requestType, maxRetries, alreadyInPending, providerName) => {
  console.log('win object is -----------', win);
  console.log('provider name is ---------', providerName);

  const winDetails = await pendingPostReq(win, requestType, 0, alreadyInPending, providerName);
  win.responseTransactionId = winDetails.data.processedTxId;
  win.responseBalance = winDetails.data.balance;
  win.balanceDetails = winDetails.data.balanceDetails;
  win.alreadyProcessed = winDetails.data.alreadyProcessed;
  win.createdAt = winDetails.data.createdAt;
  win.txDetails = winDetails.data.txDetails;

  console.log('data going to save in the win is ---------', win);
  const winInstance = await Win(process.env.DbName + `-${providerName}`);
  const newWin = new winInstance(win);
  const winData = await newWin.save();
  console.log('data saved in win model is ---------', winData);
  await saveToMaster(win.playerId, 'WIN', win, winDetails.data, null, providerName);

  console.log('win details data is ----', winDetails.data);
  return winDetails.data;
};

const pendingCancelRequest = async (refund, requestType, maxRetries, alreadyInPending, providerName) => {
  console.log('refund object is- ----', refund);
  console.log('provider name is -----------', providerName);
  const res = await pendingPostReq(refund, requestType, maxRetries, alreadyInPending);

  console.log('refund object is -----------', refund);

  refund.createdAt = res.data.createdAt;
  refund.responseTransactionId = res.data.processedTxId;
  refund.responseBalance = res.data.balance;
  refund.alreadyProcessed = res.data.alreadyProcessed;
  refund.balanceDetails = res.data.balanceDetails;
  refund.txDetails = res.data.txDetails;

  console.log('refund is ----------', refund);
  const refundInstance = await Refund(process.env.DbName + `-${providerName}`);
  const newRefund = new refundInstance(refund);
  await newRefund.save();
  await saveToMaster(refund.playerId, 'REFUND', refund, res.data, null, providerName);
  return res.data;
};

const pendingPostReq = async (
  data,
  requestType,
  maxRetries = 0,
  alreadyInPending = false,
  delay = 2000,
  timeout = 10000
) => {
  let headers = {
    'Content-Type': 'application/json',
    'X-Hub-Consumer': data.consumerId,
  };

  let url = process.env.API_BASE_URL + requestType;
  console.log('url is ----------', url);

  try {
    const response = await axios.post(url, data, { headers, timeout });
    console.log('response data is --------------', response.data);
    return response;
  } catch (error) {
    console.log('error is --------', error);
    let res = error?.response?.data;
    let errorRes = {
      response: {
        data: {
          code: res === undefined ? 1 : res.errorCode,
          message: res === undefined ? 'Internal Error' : res.errorMessage,
        },
      },
    };
    throw errorRes;
  }
};

const saveToPending = async (data, requestType, playerId) => {
  try {
    console.log('i got called ----------save to pending schema------');
    const pendingInstance = await Pending(process.env.DbName);
    const pendingObject = {
      userId: playerId,
      type: requestType,
      clientId: data.consumerId, // consumer id is client id here
      transactionId: data.txId,
      request: JSON.stringify(data),
      timestamp: Math.floor(new Date().getTime() / 1000),
    };

    console.log('pending object is -------', pendingObject);
    const pendingTask = new pendingInstance(pendingObject);
    await pendingTask.save();
  } catch (error) {
    console.log('error is ----------', error);
  }
};

module.exports = { saveToPending, resolvePending };
