const qs = require('qs');

// exploring how express.json() and express.urlencoded({extended: true}) works

const manualExpressJson = (req, res, next) => {
  // data is coming in chunks of buffer
  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString(); // converting to string
  });
  req.on('end', () => {
    if (body.trim() === '') {
      req.body = undefined; // Empty body => undefined
      return next();
    }
    try {
      req.body = JSON.parse(body);
      next();
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
};

const manualUrlEncoded = (req, res, next) => {
  // use to parse form-urlencoded data in post request
  if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        req.body = qs.parse(body);

        // this is happened behind the scene when [express.json({urlencoded: true})] becomes true
        // qs.parse(foo[bar][baz]='foobarbaz')
        /*
        foo: {
          bar: {
              baz: 'foobarbaz'
          }
        }*/
        next();
      } catch (error) {
        // writting headers
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid urlencoded data' }));
      }
    });
  } else {
    next();
  }
};

module.exports = { manualExpressJson, manualUrlEncoded };
