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

    // For HTML responses: inject base tag (fix relative asset paths) and selling points banner
    if (contentType.includes('text/html')) {
      let html = body.toString('utf-8');

      // Inject <base> tag right after <head> to fix relative asset URLs
      html = html.replace('<head>', '<head><base href="' + TARGET_URL + '/">');

      // Inject metric selling points banner before </body>
      const banner = `
<div id="anliu-sale-banner" style="
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;
  background: linear-gradient(135deg, #0a0e27 0%, #1a1040 100%);
  border-top: 1px solid rgba(120,100,255,0.3);
  padding: 10px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  box-shadow: 0 -4px 24px rgba(80,60,200,0.2);
">
  <div style="display: flex; align-items: center; gap: 8px; min-width: 140px;">
    <span style="font-size: 20px; font-weight: 700; color: #fff;">暗流 Pro</span>
    <span style="background: rgba(120,100,255,0.2); color: #a78bfa; padding: 2px 8px; border-radius: 4px; font-size: 11px;">机构版</span>
  </div>
  <div style="flex: 1; display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: #c4b5fd;">
    <span>📊 <b style="color:#a78bfa">净流入/流出</b> 实时追踪机构资金动向</span>
    <span>🐋 <b style="color:#a78bfa">鲸鱼地址</b> 监控大额异动地址</span>
    <span>💡 <b style="color:#a78bfa">聪明钱</b> 识别主力建仓信号</span>
    <span>📈 <b style="color:#a78bfa">大单成交</b> 捕捉千万级买单</span>
    <span>🔄 <b style="color:#a78bfa">持仓变化</b> 追踪筹码集中度</span>
  </div>
  <div style="display: flex; align-items: center; gap: 8px;">
    <span style="font-size: 11px; color: #888;">7天体验</span>
    <span style="font-size: 16px; font-weight: 700; color: #f59e0b;">¥9.90</span>
    <span style="font-size: 11px; color: #888;">月卡</span>
    <span style="font-size: 16px; font-weight: 700; color: #22d3ee;">¥29.90</span>
    <a href="javascript:void(0)" onclick="parent.postMessage({type:'anliu:subscribe'},'*')" style="
      background: linear-gradient(135deg, #7c3aed, #6366f1);
      color: #fff; padding: 6px 16px; border-radius: 6px;
      font-size: 13px; font-weight: 600; text-decoration: none;
      white-space: nowrap;
    ">立即订阅</a>
  </div>
</div>
`;
      html = html.replace('</body>', banner + '\n</body>');
      body = Buffer.from(html, 'utf-8');
    }

    res.status(proxyResult.status);
    res.send(body);
  } catch (e) {
    res.status(502).send('Proxy error: ' + e.message);
  }
};
