const crypto = require('crypto');

const XDD_APP_ID = '19997';
const XDD_APP_SECRET = process.env.XDD_APP_SECRET;
const XDD_GATEWAY = 'https://gateway.xddpay.com';

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex').toUpperCase();
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'method not allowed' });
  }
  try {
    const body = await parseJsonBody(req);
    const { order_no, subject, pay_type, money, user_id } = body;
    if (!order_no || !pay_type || !money) return res.status(400).json({ error: 'missing params' });
    const extra = JSON.stringify({ user_id: user_id || '', days: 30 });
    const signStr = `order_no=${order_no}&subject=${subject || ''}&pay_type=${pay_type}&money=${Number(money).toFixed(2)}&app_id=${XDD_APP_ID}&extra=${encodeURIComponent(extra)}&${XDD_APP_SECRET}`;
    const sign = md5(signStr);
    const params = new URLSearchParams({ order_no, subject: subject || '', pay_type: String(pay_type), money: Number(money).toFixed(2), app_id: XDD_APP_ID, extra: encodeURIComponent(extra), sign });
    const resp = await fetch(`${XDD_GATEWAY}?format=json`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
    });
    const data = await resp.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
