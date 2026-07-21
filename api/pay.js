const crypto = require('crypto');

const XDD_APP_ID = '19997';
const XDD_APP_SECRET = process.env.XDD_APP_SECRET;
const XDD_GATEWAY = 'https://gateway.xddpay.com';

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex').toUpperCase();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const body = typeof req.body === 'object' ? req.body : {};
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
    const extra = JSON.stringify({ user_id, days: 30 });
    const amount = Number(finalMoney).toFixed(2);

    const signStr = `order_no=${orderNo}&subject=anliupro&pay_type=${xddPayType}&money=${amount}&app_id=${XDD_APP_ID}&extra=${encodeURIComponent(extra)}&${XDD_APP_SECRET}`;
    const sign = md5(signStr);

    const params = new URLSearchParams({
      order_no: orderNo,
      subject: 'anliupro',
      pay_type: String(xddPayType),
      money: amount,
      app_id: XDD_APP_ID,
      extra: encodeURIComponent(extra),
      sign
    });

    console.log(`[pay] user_id=${user_id} pay_type=${finalPayType}->xdd=${xddPayType} money=${amount}`);

    const xddUrl = `${XDD_GATEWAY}?format=json`;
    const resp = await fetch(xddUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(502).json({ error: 'XDD non-JSON response', raw: text.substring(0, 500) });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ order_no: orderNo, ...data });
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: e.message });
  }
};
