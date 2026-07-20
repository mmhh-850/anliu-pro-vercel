const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const { user_id } = await parseJsonBody(req);
    if (!user_id) return res.status(400).json({ error: 'missing user_id' });

    const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY };
    const subResp = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${user_id}&select=darkflow_token`, { headers });
    const subs = await subResp.json();
    const token = subs && subs.length > 0 ? subs[0].darkflow_token : null;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ token: token || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
