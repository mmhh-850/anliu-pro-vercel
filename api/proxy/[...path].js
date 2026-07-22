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

    const skipHeaders = ['x-frame-options', 'content-security-policy', 'transfer-encoding'];
    for (const [k, v] of Object.entries(proxyResult.headers)) {
      if (k && v && !skipHeaders.includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    }

    const contentType = (proxyResult.headers['content-type'] || '').toLowerCase();
    let body = proxyResult.body.length > 0 ? proxyResult.body : Buffer.from('');

    // Inject base tag to fix relative asset URLs
    if (contentType.indexOf('text/html') !== -1 && body.length > 0) {
      let html = body.toString('utf-8');
      html = html.replace('<head>', '<head><base href="' + TARGET_URL + '/">');
      body = Buffer.from(html, 'utf-8');
    }

    res.status(proxyResult.status);
    if (body.length > 0) {
      res.send(body);
    } else {
      res.send(body.toString('utf-8'));
    }
  } catch (e) {
    res.status(502).send('Proxy error: ' + e.message);
  }
};
