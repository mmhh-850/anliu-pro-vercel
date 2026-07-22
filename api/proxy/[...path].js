const https = require('https');

const TARGET_URL = 'https://dash.hfd.fund';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  const pathParts = req.query.path || [];
  const path = pathParts.join('/');
  const query = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
  const targetUrl = TARGET_URL + '/' + path + query;

  try {
    const rawBody = await readBody(req);
    const parsed = new URL(targetUrl);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: req.method,
      headers: {},
      timeout: 30000,
    };

    for (const [k, v] of Object.entries(req.headers)) {
      if (k === 'host') options.headers[k] = parsed.hostname;
      else if (k !== 'origin' && k !== 'referer') options.headers[k] = v;
    }

    const proxyResult = await new Promise((resolve, reject) => {
      const proxyReq = https.request(options, (proxyRes) => {
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          resolve({ status: proxyRes.statusCode, headers: proxyRes.headers, body: Buffer.concat(chunks) });
        });
        proxyRes.on('error', reject);
      });
      proxyReq.on('error', reject);
      proxyReq.on('timeout', () => { proxyReq.destroy(); reject(new Error('Upstream timeout')); });
      if (req.method !== 'GET' && req.method !== 'HEAD' && rawBody.length > 0) {
        proxyReq.write(rawBody);
      }
      proxyReq.end();
    });

    // Inject base tag for HTML to fix relative asset paths
    var sendBody = proxyResult.body;
    var ct = (proxyResult.headers['content-type'] || '').toLowerCase();
    if (sendBody.length > 0 && ct.indexOf('text/html') !== -1) {
      var html = sendBody.toString('utf-8');
      html = html.replace('<head>', '<head><base href="https://dash.hfd.fund/">');
      sendBody = Buffer.from(html, 'utf-8');
    }

    var skipHeaders = ['x-frame-options', 'content-security-policy', 'transfer-encoding', 'content-length'];
    for (var i = 0; i < Object.keys(proxyResult.headers).length; i++) {
      var k = Object.keys(proxyResult.headers)[i];
      var v = proxyResult.headers[k];
      if (k && v && skipHeaders.indexOf(k.toLowerCase()) === -1) {
        res.setHeader(k, v);
      }
    }

    res.status(proxyResult.status);
    if (sendBody.length > 0) {
      res.send(sendBody);
    } else {
      res.send(sendBody.toString('utf-8'));
    }
  } catch (e) {
    res.status(502).send('Proxy error: ' + e.message);
  }
};
