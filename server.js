const http = require('http');
const cors = require('cors');

global.logger = require('./utils/logger');

require('dotenv').config();
const { getDatabaseConnection } = require('./DB/index');

const app = require('./app');

let server;
if (process.env.NODE_ENV === 'production') {
  app.use(cors(corsOptions));
  // SERVER OPTIONS
  const options = {
    key: fs.readFileSync('/home/ec2-user/gametimetec_ssl/private.key'),
    cert: fs.readFileSync('/home/ec2-user/gametimetec_ssl/combined.pem'),
  };
  server = http.createServer(options, app);
} else {
  app.use(cors());
  server = http.createServer(app);
}

const port = process.env.PORT;
const DbName = process.env.DbName;

getDatabaseConnection(DbName);

server.listen(port, () => {
  logger.info(`Listening on the port ${port}`);
});
