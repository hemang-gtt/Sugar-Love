const { freeSpinsCampaignMasterValidationSchema } = require('../validator/campaignMasterValidator');
const { campaignValidator } = require('../validator/campaignValidator');
const CampaignMaster = require('../models/campaignMasterModel');
const Campaign = require('../models/campaignModel');
const Player = require('../models/playerModel');
const { logErrorMessage } = require('../logs');
const logger = require('../utils/logger');

const createMasterCampaign = async (req, res) => {
  try {
    logger.info(`Creating master campaign ----------------`);
    const consumerId = req.headers['x-hub-consumer'];
    const campaignMasterInstance = await CampaignMaster(process.env.DbName + `-${consumerId}`);

    if (!consumerId) {
      return res.status(404).json({
        message: 'Something went wrong',
      });
    }

    const data = req.body;
    const { error, value } = freeSpinsCampaignMasterValidationSchema.validate(data);

    if (error) {
      return res.status(401).json({
        message: 'Something went wrong!',
      });
    }

    logger.info(`Master campaign data got validated --------------`);
    const existingMasterCampaign = await campaignMasterInstance.findOne({ campaignId: data.campaignId }).lean();

    logger.info(`Master campaign exists --------------${JSON.stringify(existingMasterCampaign)}`);

    if (existingMasterCampaign) {
      await campaignMasterInstance.findOneAndUpdate({ campaignId: data.campaignId }, { $set: value }, { new: true });
    } else {
      const newMasterCampaign = new campaignMasterInstance(value);
      await newMasterCampaign.save();
    }

    return res.status(200).json({
      campaignId: data.campaignId,
    });
  } catch (error) {
    logErrorMessage(error);
    throw error;
  }
};

const createCampaign = async (req, res) => {
  try {
    // we will create a campagin, fetch detail of this from campaign master , and going to save (either update or create player)in the  collection
    const consumerId = req.headers['x-hub-consumer'];
    logger.info(`Creating a campaign ----------`);
    if (!consumerId) {
      return res.status(404).json({
        message: 'Something went wrong',
      });
    }
    const campaignInstance = await Campaign(process.env.DbName + `-${consumerId}`);
    const campaignMasterInstance = await CampaignMaster(process.env.DbName + `-${consumerId}`);
    const playerInstance = await Player(process.env.DbName + `-${consumerId}`);

    const data = req.body;
    let { error, value } = campaignValidator.validate(data);
    if (error) {
      return res.status(401).json({
        message: 'Something went wrong',
      });
    }
    const campaignMasterData = await campaignMasterInstance
      .findOne({ campaignId: data.campaignId, isActive: true, campaignEndDate: { $gt: new Date() } })
      .lean();
    const existingCampaign = await campaignInstance.findOne({
      campaignId: data.campaignId,
    });

    // we need to update the playerCampaign array in case if that campaign is existing in player
    const existingPlayer = await playerInstance.findOne({ playerId: data.playerId }).lean();

    let campaignExists = false;

    let existingPlayedSpinCount = 0;
    if (existingPlayer?.campaigns?.length) {
      existingPlayer.campaigns.forEach((camp) => {
        if (camp.campaignId === data.campaignId) {
          existingPlayedSpinCount = camp.playedSpinCount;
          campaignExists = true;
        }
      });
    }

    logger.info(`Campaign exist ----------${campaignExists}`);
    const betAmountForCurrency = campaignMasterData?.betAmounts[data.currency];
    let campaignData;
    if (!campaignMasterData || betAmountForCurrency === undefined) {
      campaignData = {
        campaignId: data.campaignId,
        spinsExpirationDuration: data.spinsExpirationDuration,
        bonusId: data.bonusId,
        currency: data.currency,
        playerId: data.playerId,
      };
    } else {
      // means master campaign exist and there is some bet amount there as well
      campaignData = {
        campaignId: data.campaignId,
        validFrom: campaignMasterData.campaignStartDate,
        validBefore: campaignMasterData.campaignEndDate,
        spinCount: campaignMasterData.spins,
        currency: data.currency,
        totalBetAmount: betAmountForCurrency,
        playedSpinCount: campaignExists === true ? existingPlayedSpinCount : 0, // playedSpinCount can not be changed
        status: 'ACTIVE',
        isCancelled: false,
        playerId: data.playerId,
      };
    }

    // push the campaign if it doesn't exist in player else update it
    logger.info(`Campaign data is ----${JSON.stringify(campaignData)}`);
    if (campaignExists) {
      await playerInstance.updateOne(
        { playerId: data.playerId, 'campaigns.campaignId': data.campaignId },
        {
          $set: {
            'campaigns.$': campaignData, // update only the matched array element
          },
        },
        {
          new: true,
        }
      );
    } else {
      await playerInstance.updateOne(
        { playerId: data.playerId },
        {
          $push: {
            campaigns: campaignData,
          },
        },
        { upsert: true, new: true }
      );
    }

    if (existingCampaign) {
      await campaignInstance.findOneAndUpdate(
        {
          campaignId: data.campaignId,
        },
        {
          $set: campaignData,
        },
        {
          new: true,
        }
      );
    } else {
      const newCampaign = new campaignInstance(campaignData);
      await newCampaign.save();
    }

    logger.info(`Existing campaign -----------${JSON.stringify(existingCampaign)}`);
    return res.status(200).json({
      bonusId: data.bonusId,
      playerId: data.playerId,
    });
  } catch (error) {
    logger.info(`Error came is ---------${error}`);
    logErrorMessage(error);
    return res.status(500).json({
      message: 'Something went wrong',
    });
  }
};

const cancelCampaign = async (req, res) => {
  // we will cancel the campaign

  // find the campaign from the player id and mark it as inactive
  // find that is this campaign exist for this player , if yes then remove it from campaigs

  try {
    const consumerId = req.headers['x-hub-consumer'];
    const data = req.body;
    logger.info(`Cancelling the campaign -----------------------`);
    if (!consumerId) {
      return res.status(404).json({
        message: 'Something went wrong',
      });
    }
    const campaignInstance = await Campaign(process.env.DbName + `-${consumerId}`);
    const playerInstance = await Player(process.env.DbName + `-${consumerId}`);
    const existingCampaign = await campaignInstance.findOne({
      campaignId: data.campaignId,
    });

    const existingPlayer = await playerInstance.find({ playerId: data.playerId }).lean();

    if (!existingPlayer || existingPlayer.length === 0) {
      return res.status(404).json({
        message: 'Invalid player id ',
      });
    }
    if (!existingCampaign) {
      return res.status(404).json({
        message: 'Campaign does not exist',
      });
    }

    const updatedCampaign = await campaignInstance.updateOne(
      {
        campaignId: data.campaignId,
      },
      {
        $set: {
          isCanceled: true,
        },
      },
      {
        new: true,
      }
    );

    logger.info(`Updated campaign is ---------------${JSON.stringify(updatedCampaign)}`);

    // remove it from campaign array of player
    await playerInstance.updateOne(
      { playerId: data.playerId },
      {
        $pull: {
          campaigns: { campaignId: data.campaignId },
        },
      }
    );

    return res.status(200).json({
      bonusId: data.bonusId,
      playerId: data.playerId,
    });
  } catch (error) {
    logger.info(`Error is ----------${JSON.stringify(error)}`);
    return res.status(500).json({
      message: 'Internal Error',
    });
  }
};

module.exports = { createMasterCampaign, createCampaign, cancelCampaign };
