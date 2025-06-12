const { logError } = require('../logs');
const Player = require('../models/playerModel');
const Transaction = require('../models/transactionModel');
const logger = require('../utils/logger');

// here amount refered to bet amount in bet case
const saveWalletTransaction = async (
  { id, transactionId, amount, transactionType, operation, status },
  user,
  betDetails,
  slotResult,
  roundId,
  isFeatureBuy,
  freeSpin
) => {
  try {
    logger.info(`Transaction amount is ------------${amount} and type is ----------${transactionType}`);
    if (id && typeof amount === 'number' && transactionType && operation && status && transactionId) {
      if (!user) {
        return {
          status: 'USER_NOT_FOUND',
          data: {},
          message: 'user not found',
        };
      }
      if (status === 'SUCCESS') {
        const amountDecimal = amount;
        let userUpdate = {};
        if (transactionType === 'debit') {
          if (user.balance < amountDecimal) {
            // if debit is the case and the bet amount is greater thn player balance send error
            return {
              status: 'INSUFFICIENT_FUNDS',
              data: {},
              message: 'insufficient funds',
            };
          }
          user.balance = Number(betDetails.balance);

          if (amount > 0) {
            // betAmount
            userUpdate = {
              balance: user.balance.toString(),
              upgradeSpin: user.upgradeSpin,
              lastBet: Number(amount),
              lastWin: Number(parseFloat(slotResult.tw).toFixed(2)),
            };
            if (slotResult?.fs?.c > 0) {
              freeSpin.totalWin = slotResult.tw;
              userUpdate = {
                ...userUpdate,
                freeSpin,
                freeSpinRoundId: roundId,
                lastBet: Number(amount),
                lastWin: Number(parseFloat(slotResult.tw).toFixed(2)),
              };
            }
            if (Number(amount) > 0 && !isFeatureBuy && slotResult.us?.c > 0) {
              userUpdate = {
                ...userUpdate,
                freeSpinRoundId: roundId,
                lastBet: Number(amount),
                lastWin: Number(parseFloat(slotResult.tw).toFixed(2)),
              };
            }
          } else if (amount > 0 && slotResult?.fs?.c === 0) {
            userUpdate = {
              balance: user.balance.toString(),
              freeSpin: {},
              lastBet: Number(amount),
              lastWin: Number(parseFloat(slotResult.tw).toFixed(2)),
            };
          } else {
            userUpdate = {
              balance: user.balance.toString(),
              lastBet: Number(amount),
              lastWin: Number(parseFloat(slotResult.tw).toFixed(2)),
            };
          }
        } else if (transactionType === 'credit') {
          // win request
          logger.info('BALANCE:: ' + user.balance + ', amount : ' + amount);

          user.balance = Number(parseFloat((user.balance * 100 + amountDecimal * 100) / 100).toFixed(2));
          logger.info('balance after win is ----', user.balance);
          userUpdate = {
            balance: user.balance.toString(),
            freeSpinRoundId: '',
            // lastBet: Number(amount),
            lastWin: Number(parseFloat(amount).toFixed(2)),
          };
        } else {
          return {
            status: 'INVALID_TRANSACTION_MODE',
            data: {},
            message: 'invalid transaction mode',
          };
        }

        // now save the win amount in db ----
        const playerInstance = await Player(process.env.DB_NAME + `-${user.consumerId}`);

        const savePlayer = await playerInstance
          .findOneAndUpdate({ _id: user._id }, { $set: userUpdate }, { new: true })
          .lean();

        const transactionInstance = await Transaction(process.env.DB_NAME + `-${user.consumerId}`);

        let transactionData = {
          userId: id,
          amount,
          transactionType,
          operation,
          status,
          balance: savePlayer.balance,
          transactionId,
          createdDate: new Date(),
        };

        logger.info('data going to save in transaction model ------', JSON.stringify(transactionData));
        const newTransaction = new transactionInstance(transactionData);
        let savedTransaction = await newTransaction.save();
        let savedObj = {
          _id: savedTransaction.transactionId,
          walletBalance: savePlayer.balance,
          user: savePlayer,
        };
        return {
          status: 'SUCCESS',
          data: savedObj,
          message: 'transaction is saved !',
        };
      }
    }
  } catch (err) {
    logError(err);
    return {
      status: 'ERROR',
      data: err,
      message: 'something went wrong on server',
    };
  }
};

module.exports = { saveWalletTransaction };
