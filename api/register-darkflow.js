/**
 * 同步注册暗流 dash.hfd.fund 账户
 * 通过已有代理转发请求到暗流后端
 */
const DARKFLOW_BASE = process.env.DARKFLOW_API_BASE || 'https://dash.hfd.fund';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ error: 'missing email or password' });
    }

    // 尝试暗流注册端点（可通过 DARKFLOW_REGISTER_PATH 环境变量配置）
    const registerPath = process.env.DARKFLOW_REGISTER_PATH || '/api/auth/register';

    const resp = await fetch(`${DARKFLOW_BASE}${registerPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
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
