const http = require('http');
require('dotenv').config();
const { getDatabaseConnection } = require('./DB/index');

const app = require('./app');

const server = http.createServer(app);

const port = process.env.PORT;
const DbName = process.env.DbName;

getDatabaseConnection(DbName);

server.listen(port, () => {
  console.log(`Listening on port number ${port}`);
});
