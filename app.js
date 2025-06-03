const express = require('express');
const { manualExpressJson, manualUrlEncoded } = require('./express-middleware');
const { healthCheck } = require('./controllers/healthController');
const { gameLauncher } = require('./controllers/gameController');
const { loginHandler } = require('./controllers/playerController');

const { createMasterCampaign, createCampaign, cancelCampaign } = require('./controllers/campaignController');
const { gameBet, closeGame } = require('./controllers/gamePlayController');

const { freeSpin, upgradeSpin } = require('./controllers/spinController');
const { startCron } = require('./cron');
const app = express();

const base_path = process.env.BASE_PATH;

app.use((req, res, next) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(manualExpressJson);
app.use(manualUrlEncoded);

startCron(true);

app.get(`${base_path}/health`, healthCheck);
app.post(`${base_path}/game/launch`, gameLauncher);
app.post(`${base_path}/login`, loginHandler);

app.post(`${base_path}/bet`, gameBet);

app.post(`${base_path}/feature-buy`, freeSpin);
app.post(`${base_path}/upgrade-spin-buy`, upgradeSpin);

// Create campaign --

app.post(`${base_path}/bonus/campaigns/freeSpins`, createMasterCampaign);
app.post(`${base_path}/bonus/campaigns/freeSpins/grant`, createCampaign);
app.post(`${base_path}/bonus/campaigns/freeSpins/cancel`, cancelCampaign);
// need to integrate these endpoints Campaign
// 1> creating free spin -> to create a free spin campaign. It enables the configuration of free spins available for players within specified games.

// 2> freeSpins/grant -> This endpoint must be implemented on your side to add free spins for a player within a specific campaign.

// 3> campaigns/freeSpins/cancel -> we have to implement on your side to reject free spins for a player.

// 4> /freeSpins/win -> The request which provider sends when a player won from a free spin campaign. that how much free spin he won

// if there is free spin then the bet amount will be 0

console.log(`base path is -----------=> ${base_path}`);

app.post(`${base_path}/close/:userId/:urlToken/:timeStamp`, closeGame);
// we have to start the bet now , first check what are the apis and other various term

module.exports = app;

// game launch
// login
