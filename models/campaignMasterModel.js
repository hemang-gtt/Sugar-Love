const mongoose = require('mongoose');
const { getModel } = require('../DB/index');

const campaignMasterSchema = new mongoose.Schema(
  {
    gameIds: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => arr.every((id) => typeof id === 'string' && id.length <= 255),
        message: 'Each gameId must be a string with max 255 characters.',
      },
    },

    campaignId: {
      type: String,
      required: true,
      maxlength: 255,
    },

    spins: {
      type: Number,
      required: true,
      min: 1,
    },

    campaignStartDate: {
      type: Date,
      required: true,
    },

    campaignEndDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return !this.campaignStartDate || value > this.campaignStartDate;
        },
        message: 'Campaign end date must be after start date.',
      },
    },

    spinsExpirationDuration: {
      type: Number,
      required: true,
      min: 0,
    },

    betAmounts: {
      type: Map,
      of: {
        type: Number,
        min: 0,
      },
      required: true,
      validate: {
        validator: (map) => {
          for (const key of map.keys()) {
            if (!/^[A-Z]{3,4}$/.test(key)) return false;
          }
          return true;
        },
        message: 'Each currency code in betAmounts must be a 3-4 uppercase letter string.',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'CampaignMaster',
  }
);

module.exports = (dbname) => getModel(dbname, 'CampaignMaster', campaignMasterSchema);
