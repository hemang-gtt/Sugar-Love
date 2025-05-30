const mongoose = require('mongoose');
const { getModel } = require('../DB/index');

const campaignSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  playerId: {
    type: String,
    required: true,
  },
  campaignName: {
    type: String,
  },
  bonusId: {
    type: String,
  },
  validFrom: {
    type: Date,
  },
  validBefore: {
    type: Date,
  },
  spinCount: {
    type: Number,
  },
  currency: {
    type: String,
  },
  totalBetAmount: {
    type: Number,
  },
  playedSpinCount: {
    type: Number,
  },
  status: {
    type: String,
  },
  isCancelled: {
    type: Boolean,
    default: false,
  },
});

module.exports = (dbname) => getModel(dbname, 'Campaign', campaignSchema);
