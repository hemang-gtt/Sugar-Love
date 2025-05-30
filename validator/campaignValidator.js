const Joi = require('joi');
const campaignValidator = Joi.object({
  campaignId: Joi.string().max(255).required(),
  playerId: Joi.string().required(),
  spinsExpirationDuration: Joi.number().integer().min(0).required(),
  bonusId: Joi.string().required(),
  currency: Joi.string().required(),
});

module.exports = { campaignValidator };
