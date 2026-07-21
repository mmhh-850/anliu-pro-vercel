const crypto = require('crypto');

const XDD_APP_ID = '19997';
const XDD_APP_SECRET = process.env.XDD_APP_SECRET;
const XDD_GATEWAY = 'https://gateway.xddpay.com';

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex').toUpperCase();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const body = (typeof req.body === 'object' && req.body) ? req.body : {};
    const { user_id, pay_type, money } = body;

    if (!user_id) {
      return res.status(400).json({ error: 'missing user_id' });
    }

    const finalPayType = pay_type || 1;
    const finalMoney = money || '9.90';
    const xddPayType = finalPayType === 1 ? 2 : 43;
    const orderNo = 'DP' + Date.now().toString() + Math.random().toString(36).substring(2, 8);
    const amount = Number(finalMoney).toFixed(2);
    const extra = JSON.stringify({ user_id, days: 30 });

    const signStr = `order_no=${orderNo}&subject=anliupro&pay_type=${xddPayType}&money=${amount}&app_id=${XDD_APP_ID}&extra=${encodeURIComponent(extra)}&${XDD_APP_SECRET || ''}`;
    const sign = md5(signStr);

    const url = `${XDD_GATEWAY}?format=json`;
    const bodyParams = new URLSearchParams({
      order_no: orderNo,
      subject: 'anliupro',
      pay_type: String(xddPayType),
      money: amount,
      app_id: XDD_APP_ID,
      extra: encodeURIComponent(extra),
      sign
    }).toString();

    console.log('[pay] calling XDD:', url);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: 'XDD non-JSON', raw: text.substring(0, 500) });
    }

    return res.json({ order_no: orderNo, ...data });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack ? e.stack.substring(0, 300) : '' });
  }
};
