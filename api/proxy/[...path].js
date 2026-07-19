const TARGET_URL = 'https://dash.hfd.fund';

module.exports = async function handler(req, res) {
  const pathParts = req.query.path || [];
  const path = pathParts.join('/');
  const query = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
  const targetUrl = TARGET_URL + '/' + path + query;

  try {
    const fetchHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === 'host') fetchHeaders[k] = new URL(TARGET_URL).host;
      else if (k !== 'origin' && k !== 'referer') fetchHeaders[k] = v;
    }

    const fetchOptions = { method: req.method, headers: fetchHeaders, redirect: 'follow' };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
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

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html') || contentType.includes('text/css') || contentType.includes('javascript')) {
      const text = await response.text();
      res.send(text);
    } else {
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (e) {
    res.status(502).send('Proxy error: ' + e.message);
  }
};
