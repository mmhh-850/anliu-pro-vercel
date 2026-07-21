const crypto = require('crypto');

const XDD_APP_ID = '19997';
const XDD_APP_SECRET = process.env.XDD_APP_SECRET;
const XDD_GATEWAY = 'https://gateway.xddpay.com';

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex').toUpperCase();
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve({}); }
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
    const body = typeof req.body === 'object' && req.body && Object.keys(req.body).length > 0
      ? req.body
      : await readBody(req);

    const { user_id, pay_type, money } = body;

    if (!user_id) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ error: 'missing user_id' });
    }

    const finalPayType = pay_type || 1;
    const finalMoney = money || '9.90';

    // pay_type 映射：前端 1=微信 → XDD 2（微信固定），前端 2=支付宝 → XDD 43（支付宝任意）
    const xddPayType = finalPayType === 1 ? 2 : 43;

    const orderNo = 'DP' + Date.now().toString() + Math.random().toString(36).substring(2, 8);

    const signStr = `order_no=${orderNo}&subject=anliupro&pay_type=${xddPayType}&money=${finalMoney}&app_id=${XDD_APP_ID}&extra=${user_id}&${XDD_APP_SECRET}`;
    const sign = md5(signStr);

    const url = `${XDD_GATEWAY}/mapi.ashx?order_no=${orderNo}&subject=anliupro&pay_type=${xddPayType}&money=${finalMoney}&app_id=${XDD_APP_ID}&extra=${user_id}&sign=${sign}`;

    console.log(`[pay] user_id=${user_id} pay_type=${finalPayType}->xdd=${xddPayType} money=${finalMoney}`);

    const resp = await fetch(url);
    const data = await resp.json();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ order_no: orderNo, ...data });
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: e.message });
  }
};
