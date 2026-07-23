const https = require('https');

function readBody(req) {
  return new Promise(function(resolve) {
    var c = [];
    req.on('data', function(d) { c.push(d); });
    req.on('end', function() { resolve(Buffer.concat(c)); });
  });
}

module.exports = async function handler(req, res) {
  try {
    var body = await readBody(req);
    var result = await new Promise(function(resolve, reject) {
      var opts = {
        hostname: 'dash.hfd.fund', port: 443, path: '/api/login', method: 'POST',
        headers: {'Content-Type': 'application/json', 'Content-Length': body.length},
        timeout: 15000
      };
      var rq = https.request(opts, function(rs) {
        var c = [];
        rs.on('data', function(d) { c.push(d); });
        rs.on('end', function() { resolve({status: rs.statusCode, body: Buffer.concat(c)}); });
        rs.on('error', reject);
      });
      rq.on('error', reject);
      rq.on('timeout', function() { rq.destroy(); });
      rq.write(body);
      rq.end();
    });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(result.status).send(result.body);
  } catch(e) {
    res.status(502).send(JSON.stringify({error: e.message}));
  }
};
