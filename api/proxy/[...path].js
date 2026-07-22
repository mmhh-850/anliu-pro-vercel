const https = require('https');

const DASH_URL = 'https://dash.hfd.fund';
const GASH_URL = 'https://gash.hz.fundsol';
const PROXY_GASH_PREFIX = Buffer.from('/api/proxy-gash/');
const GASH_PATTERN = Buffer.from('https://gash.hz.fundsol/');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function findPattern(buf, pattern) {
  var blen = buf.length, plen = pattern.length;
  for (var i = 0; i <= blen - plen; i++) {
    var ok = true;
    for (var j = 0; j < plen && ok; j++) {
      if (buf[i + j] !== pattern[j]) ok = false;
    }
    if (ok) return i;
  }
  return -1;
}

function replaceAllPattern(buf, pattern, replacement) {
  var result = [];
  var pos = 0, idx;
  while ((idx = findPattern(buf.slice(pos), pattern)) !== -1) {
    result.push(buf.slice(pos, pos + idx));
    result.push(replacement);
    pos += idx + pattern.length;
  }
  result.push(buf.slice(pos));
  return Buffer.concat(result);
}

module.exports = async function handler(req, res) {
  var pathParts = req.query.path || [];
  var path = pathParts.join('/');
  var query = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
  var targetUrl = DASH_URL + '/' + path + query;

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
      if (k === 'host') options.headers[k] = parsed.hostname;
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

    var body = proxyResult.body;
    var ct = (proxyResult.headers['content-type'] || '').toLowerCase();
    if (body.length > 0 && ct.indexOf('text/html') !== -1) {
      body = replaceAllPattern(body, GASH_PATTERN, PROXY_GASH_PREFIX);
    }

    res.status(proxyResult.status);
    if (body.length > 0) {
      res.send(body);
    } else {
      res.send('');
    }
  } catch (e) {
    res.status(502).send('Proxy error: ' + e.message);
  }
};
