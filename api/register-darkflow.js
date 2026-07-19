/**
 * 同步注册暗流 dash.hfd.fund 账户
 * POST https://dash.hfd.fund/api/register
 * 请求体: { username, password, security_question, security_answer }
 */
const DARKFLOW_API = 'https://dash.hfd.fund/api/register';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const { username, password, security_question, security_answer } = req.body;
    if (!username || !password) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ error: 'missing username or password' });
    }
    if (!security_question || !security_answer) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ error: 'missing security_question or security_answer' });
    }

    const resp = await fetch(DARKFLOW_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, security_question, security_answer })
    });

    const data = await resp.json().catch(() => ({ raw: await resp.text() }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(resp.status).json({
      success: resp.ok,
      status: resp.status,
      data
    });
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(502).json({ error: 'darkflow register failed: ' + e.message });
  }
};
