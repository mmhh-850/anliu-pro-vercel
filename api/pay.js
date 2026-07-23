const crypto = require('crypto');
const XDD_APP_ID = '19997';
const XDD_APP_SECRET = process.env.XDD_APP_SECRET;
const XDD_GATEWAY = 'https://gateway.xddpay.com';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function md5(text) { return crypto.createHash('md5').update(text).digest('hex').toUpperCase(); }

async function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  try {
    const { user_id, pay_type, money } = await parseJsonBody(req);
    if (!user_id || !pay_type) return res.status(400).json({ error: 'missing user_id or pay_type' });

    const xddPayType = pay_type === 1 ? 44 : 43;
    const orderNo = 'DP' + Date.now() + Math.floor(Math.random() * 9000 + 1000);
    const orderMoney = money || '9.90';
    const subject = 'anliupro';
    const extra = user_id;

    const notifyUrl = 'https://www.anliupro.top/api/notify';
    const returnUrl = 'https://www.anliupro.top';

    // URL-encode notify_url 鍜?return_url 鍚庡啀鎷煎叆绛惧悕瀛楃涓?    const notifyUrlEncoded = encodeURIComponent(notifyUrl);
    const returnUrlEncoded = encodeURIComponent(returnUrl);

    const signStr = `order_no=${orderNo}&subject=${subject}&pay_type=${xddPayType}&money=${orderMoney}&app_id=${XDD_APP_ID}&extra=${extra}&notify_url=${notifyUrlEncoded}&return_url=${returnUrlEncoded}&${XDD_APP_SECRET}`;
    const sign = md5(signStr);

    const debugSignStr = `order_no=${orderNo}&subject=${subject}&pay_type=${xddPayType}&money=${orderMoney}&app_id=${XDD_APP_ID}&extra=${extra}&notify_url=${notifyUrlEncoded}&return_url=${returnUrlEncoded}&SECRET`;

    const formData = new URLSearchParams();
    formData.append('order_no', orderNo);
    formData.append('subject', subject);
    formData.append('pay_type', String(xddPayType));
    formData.append('money', orderMoney);
    formData.append('app_id', XDD_APP_ID);
    formData.append('extra', extra);
    formData.append('notify_url', notifyUrl);
    formData.append('return_url', returnUrl);
    formData.append('sign', sign);

    const resp = await fetch(`${XDD_GATEWAY}?format=json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });
    const respText = await resp.text();
    let data;
    try {
      data = JSON.parse(respText);
    } catch (e) {
      console.error('[pay] XDD 杩斿洖闈?JSON:', respText.substring(0, 500));
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(502).json({
        error: '鏀粯缃戝叧寮傚父',
        detail: respText.includes('浣欓涓嶈冻') ? '鍟嗘埛浣欓涓嶈冻锛岃鑱旂郴绠＄悊鍛樺厖鍊? : '鏀粯缃戝叧杩斿洖寮傚父锛岃绋嶅悗閲嶈瘯',
        xdd_response_preview: respText.substring(0, 200)
      });
    }

    if (!data.xddpay_order && data.msg && data.msg.includes('浣欓涓嶈冻')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json({
        order_no: orderNo,
        error: '鍟嗘埛浣欓涓嶈冻锛屾棤娉曞垱寤鸿鍗?,
        xdd_msg: data.msg,
        debug_signStr: debugSignStr
      });
    }
    if (!data.xddpay_order && data.msg && data.msg.includes('绛惧悕')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json({
        order_no: orderNo,
        error: '绛惧悕閿欒',
        xdd_msg: data.msg,
        debug_signStr: debugSignStr
      });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
      order_no: orderNo,
      xddpay_order: data.xddpay_order,
      qr_img: data.qr_img,
      qr: data.qr,
      money: data.money,
      realmoney: data.realmoney,
      msg: data.msg,
      expires_in: data.expires_in,
      debug_signStr: debugSignStr
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
