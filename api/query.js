const crypto = require('crypto');
const XDD_APP_ID = '19997';
const XDD_APP_SECRET = process.env.XDD_APP_SECRET || 'c0b8284668a14262b4f57cb85dd635ac';
const XDD_GATEWAY = 'https://gateway.xddpay.com';

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex').toUpperCase();
}

module.exports = async function handler(req, res) {
  const { order_no } = req.query;
  if (!order_no) return res.status(400).json({ error: 'missing order_no' });
  try {
    const signStr = `app_id=${XDD_APP_ID}&order_no=${order_no}&${XDD_APP_SECRET}`;
    const sign = md5(signStr);
    const url = `${XDD_GATEWAY}/query.ashx?app_id=${XDD_APP_ID}&order_no=${order_no}&sign=${sign}`;
    const resp = await fetch(url);
    const data = await resp.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
