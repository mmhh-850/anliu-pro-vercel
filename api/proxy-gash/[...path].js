const https = require('https');

const TARGET = 'gash.hz.fundsol';

function readBody(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(chunk) { chunks.push(chunk); });
    req.on('end', function() { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  var pathParts = req.query.path || [];
  var path = pathParts.join('/');
  var query = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
  var targetUrl = 'https://' + TARGET + '/' + path + query;

  try {
    var rawBody = await readBody(req);
    var parsed = new URL(targetUrl);

    var options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: req.method,
      headers: {},
      timeout: 30000,
    };

    for (var k in req.headers) {
      if (k === 'host') options.headers[k] = TARGET;
      else if (k !== 'origin' && k !== 'referer') options.headers[k] = req.headers[k];
    }

    var proxyResult = await new Promise(function(resolve, reject) {
      var proxyReq = https.request(options, function(proxyRes) {
        var chunks = [];
        proxyRes.on('data', function(chunk) { chunks.push(chunk); });
        proxyRes.on('end', function() {
          resolve({ status: proxyRes.statusCode, headers: proxyRes.headers, body: Buffer.concat(chunks) });
        });
        proxyRes.on('error', reject);
      });
      proxyReq.on('error', reject);
      proxyReq.on('timeout', function() { proxyReq.destroy(); reject(new Error('Upstream timeout')); });
      if (req.method !== 'GET' && req.method !== 'HEAD' && rawBody.length > 0) {
        proxyReq.write(rawBody);
      }
      proxyReq.end();
    });

    var skipHeaders = ['x-frame-options', 'content-security-policy', 'transfer-encoding'];
    for (var hk in proxyResult.headers) {
      if (hk && proxyResult.headers[hk] && skipHeaders.indexOf(hk.toLowerCase()) === -1) {
        res.setHeader(hk, proxyResult.headers[hk]);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.status(proxyResult.status);
    if (proxyResult.body.length > 0) {
      res.send(proxyResult.body);
    } else {
      res.send('');
    }
  } catch (e) {
    res.status(502).send('Gash proxy error: ' + e.message);
  }
};
