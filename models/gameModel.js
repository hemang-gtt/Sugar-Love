const mongoose = require('mongoose');
const { getModel } = require('../DB/index');

const gameSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  totalBet: {
    type: Number,
    required: true,
  },
  totalWin: {
    type: Number,
    required: true,
  },
  createdDate: {
    type: Date,
    default: Date.now,
  },
  isPlay: {
    type: Boolean,
  },
  isWin: {
    type: Boolean,
  },
  isFreeSpin: {
    type: Number,
  },
  slotNumber: {
    type: Array,
  },
  currency: {
    type: String,
  },
  freeSpinCount: {
    type: Number,
    default: 0,
  },
  freeSpinRoundId: {
    type: String,
  },
  isFeatureBuy: {
    type: Boolean,
    default: false,
  },
  maxWinningExceeded: {
    type: Boolean,
    default: false,
  },
});

module.exports = (dbname) => getModel(dbname, 'game', gameSchema);
