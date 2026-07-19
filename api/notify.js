const crypto = require('crypto');

const XDD_APP_ID = '19997';
const XDD_APP_SECRET = process.env.XDD_APP_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!XDD_APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing required environment variables: XDD_APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY');
}

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex').toUpperCase();
}

async function getFormBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      const params = {};
      body.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
      resolve(params);
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('method not allowed');
  try {
    const params = await getFormBody(req);
    const signStr = `order_no=${params.order_no}&subject=${params.subject || ''}&pay_type=${params.pay_type}&money=${params.money}&realmoney=${params.realmoney}&result=${params.result}&xddpay_order=${params.xddpay_order}&app_id=${params.app_id}&extra=${params.extra || ''}&${XDD_APP_SECRET}`;
    const mySign = md5(signStr);
    if (mySign !== params.sign) return res.status(400).send('sign error');
    if (params.result !== 'success') return res.send('ok');

    let userId = null, days = 30;
    try { const extra = JSON.parse(params.extra || '{}'); userId = extra.user_id; days = extra.days || 30; } catch (e) { }
    if (!userId) return res.status(400).send('missing user_id');

    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    const amount = parseFloat(params.money);

    const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY };
    const subResp = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=*`, { headers });
    const subs = await subResp.json();
    const existingSub = subs && subs.length > 0 ? subs[0] : null;
    const method = existingSub ? 'PATCH' : 'POST';
    const upsertUrl = existingSub ? `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}` : `${SUPABASE_URL}/rest/v1/subscriptions`;
    await fetch(upsertUrl, {
      method, headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, plan: 'paid', amount, expires_at: expiresAt, paid_at: new Date().toISOString(), order_id: params.order_no })
    });

    try {
      const refResp = await fetch(`${SUPABASE_URL}/rest/v1/referrals?referred_id=eq.${userId}&select=referrer_id`, { headers });
      const refs = await refResp.json();
      if (refs && refs.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/commissions`, {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ referrer_id: refs[0].referrer_id, referred_id: userId, amount: amount * 0.3, order_id: params.order_no, status: 'pending' })
        });
      }
    } catch (e) { }

    res.send('success');
  } catch (e) {
    res.status(500).send('error: ' + e.message);
  }
};
