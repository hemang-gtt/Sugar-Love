const express = require('express');
const { manualExpressJson, manualUrlEncoded } = require('./express-middleware');
const { healthCheck } = require('./controllers/healthController');
const { gameLauncher } = require('./controllers/gameController');
const { loginHandler } = require('./controllers/playerController');
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

app.get(`${base_path}/health`, healthCheck);
app.post(`${base_path}/game/launch`, gameLauncher);
app.post(`${base_path}/login`, loginHandler);

// we have to start the bet now , first check what are the apis and other various term

module.exports = app;

// game launch
// login
