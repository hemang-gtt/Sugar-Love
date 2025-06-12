const http = require('http');

global.logger = require('./utils/logger');

require('dotenv').config();
const { getDatabaseConnection } = require('./DB/index');

const app = require('./app');

let server;
if (process.env.NODE_ENV === 'production') {
  // ! NO more needed this code
  app.use(cors(corsOptions));
  // SERVER OPTIONS
  const options = {
    key: fs.readFileSync('/home/ec2-user/gametimetec_ssl/private.key'),
    cert: fs.readFileSync('/home/ec2-user/gametimetec_ssl/combined.pem'),
  };
  server = http.createServer(options, app);
} else {
  server = http.createServer(app);
}

const port = process.env.PORT;
const DbName = process.env.DB_NAME;

getDatabaseConnection(DbName);

server.listen(port, () => {
  logger.info(`Listening on the port ${port}`);
});
