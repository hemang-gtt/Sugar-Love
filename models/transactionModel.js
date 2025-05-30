const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const { getModel } = require('../DB');

//Creating transaction schema
const transactionschema = new mongoose.Schema({
  userId: {
    type: ObjectId,
    required: true,
  },
  transactionId: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
  },
  transactionType: {
    type: String,
  },
  operation: {
    type: String,
  },
  // dateTime:{
  //     type:Date,
  // },
  status: {
    type: String,
  },
  balance: {
    type: Number,
  },
  createdDate: {
    type: Date,
    default: new Date(),
  },
  apiError: {
    type: Boolean,
    default: false,
  },
  apiStatus: {
    type: String,
  },
  apiResolvedTimestamp: {
    type: Number,
  },
  referenceTransactionId: {
    type: String,
  },
});

//Creating transaction model
module.exports = (dbname) => getModel(dbname, 'transaction', transactionschema);
