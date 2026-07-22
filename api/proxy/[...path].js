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

    const fetchHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === 'host') fetchHeaders[k] = new URL(TARGET_URL).host;
      else if (k !== 'origin' && k !== 'referer') fetchHeaders[k] = v;
    }

    const fetchOptions = { method: req.method, headers: fetchHeaders, redirect: 'follow' };
    if (req.method !== 'GET' && req.method !== 'HEAD' && rawBody.length > 0) {
      fetchOptions.body = rawBody;
    }

    const response = await fetch(targetUrl, fetchOptions);

    const skipHeaders = ['x-frame-options', 'content-security-policy', 'transfer-encoding'];
    for (const [k, v] of response.headers.entries()) {
      if (!skipHeaders.includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status);

    // Use arrayBuffer + Buffer for all responses to handle Cloudflare chunked encoding on Vercel
    const buf = await response.arrayBuffer();
    const text = Buffer.from(buf).toString('utf-8');
    res.send(text);
  } catch (e) {
    res.status(502).send('Proxy error: ' + e.message);
  }
};
