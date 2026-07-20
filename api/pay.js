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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  try {
    const { user_id, pay_type, password, money } = await parseJsonBody(req);
    if (!user_id || !pay_type || !password) return res.status(400).json({ error: 'missing user_id, pay_type or password' });

    const xddPayType = pay_type === 1 ? 44 : 43;
    const orderNo = 'DP' + Date.now() + Math.floor(Math.random() * 9000 + 1000);
    const orderMoney = money || '9.90';

    // 纯英文 subject，避免中文编码问题
    const subject = 'anliupro';
    // fallback: const subject = '暗流Pro会员';

    // extra 直接用 user_id 字符串，不用 JSON 复杂格式
    const extra = user_id;

    const signStr = `order_no=${orderNo}&subject=${subject}&pay_type=${xddPayType}&money=${orderMoney}&app_id=${XDD_APP_ID}&extra=${extra}&${XDD_APP_SECRET}`;
    const sign = md5(signStr);

    // 调试用：隐藏 SECRET 的签名串
    const debugSignStr = `order_no=${orderNo}&subject=${subject}&pay_type=${xddPayType}&money=${orderMoney}&app_id=${XDD_APP_ID}&extra=${extra}&SECRET`;

    const formData = new URLSearchParams();
    formData.append('order_no', orderNo);
    formData.append('subject', subject);
    formData.append('pay_type', String(xddPayType));
    formData.append('money', orderMoney);
    formData.append('app_id', XDD_APP_ID);
    formData.append('extra', extra);
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
      // XDD 返回非 JSON（如余额不足 HTML 页面）
      console.error('[pay] XDD 返回非 JSON:', respText.substring(0, 500));
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(502).json({
        error: '支付网关异常',
        detail: respText.includes('余额不足') ? '商户余额不足，请联系管理员充值' : '支付网关返回异常，请稍后重试',
        xdd_response_preview: respText.substring(0, 200)
      });
    }

    // 检查 XDD 是否返回了错误
    if (!data.xddpay_order && data.msg && data.msg.includes('余额不足')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json({
        order_no: orderNo,
        error: '商户余额不足，无法创建订单',
        xdd_msg: data.msg,
        debug_signStr: signStr.replace(new RegExp(XDD_APP_SECRET + '$'), '***SECRET***')
      });
    }
    if (!data.xddpay_order && data.msg && data.msg.includes('签名')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json({
        order_no: orderNo,
        error: '签名错误',
        xdd_msg: data.msg,
        debug_signStr: signStr.replace(new RegExp(XDD_APP_SECRET + '$'), '***SECRET***')
      });
    }

    // 异步：暗流登录获取 token
    let darkflowLoginPromise = Promise.resolve();
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      darkflowLoginPromise = (async () => {
        try {
          // 获取用户 email
          const userResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
            headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY }
          });
          const userData = await userResp.json();
          const email = userData.email;
          if (!email) return;

          // 调用暗流登录
          const dfResp = await fetch('https://dash.hfd.fund/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: email, password })
          });
          const dfData = await dfResp.json();
          const darkflowToken = dfData.access_token;
          if (!darkflowToken) return;

          // 存到 Supabase subscriptions
          const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
          const subResp = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${user_id}&select=*`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } });
          const subs = await subResp.json();
          const existing = subs && subs.length > 0;
          const method = existing ? 'PATCH' : 'POST';
          const upsertUrl = existing ? `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${user_id}` : `${SUPABASE_URL}/rest/v1/subscriptions`;
          await fetch(upsertUrl, { method, headers, body: JSON.stringify({ user_id, darkflow_token: darkflowToken }) });
        } catch (e) { console.error('[pay] 暗流登录失败:', e.message); }
      })();
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

    // 不阻塞响应，让暗流登录异步完成
    await darkflowLoginPromise;
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
