const Joi = require('joi');

const freeSpinsCampaignMasterValidationSchema = Joi.object({
  gameIds: Joi.array().items(Joi.string().max(255)).min(1).required(),

  campaignId: Joi.string().max(255).required(),

  spins: Joi.number().integer().min(1).required(),

  campaignStartDate: Joi.string().isoDate().required(),

  campaignEndDate: Joi.string().isoDate().required(),

  spinsExpirationDuration: Joi.number().integer().min(0).required(),

  betAmounts: Joi.object().pattern(Joi.string().min(3).max(4), Joi.number().integer().min(0)).required(),
});

module.exports = { freeSpinsCampaignMasterValidationSchema };
