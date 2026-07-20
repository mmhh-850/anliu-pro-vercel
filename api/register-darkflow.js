/**
 * 同步注册暗流 dash.hfd.fund 账户（附属操作，不阻断主流程）
 * POST https://dash.hfd.fund/api/register
 * 请求体: { username, password, security_question, security_answer }
 */
const DARKFLOW_API = 'https://dash.hfd.fund/api/register';

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  try {
    const body = await parseJsonBody(req);
    const { username, password, security_question, security_answer } = body;

    if (!username || !password) {
      return res.status(400).json({ error: 'missing username or password' });
    }
    if (!security_question || !security_answer) {
      return res.status(400).json({ error: 'missing security_question or security_answer' });
    }

    // 向暗流 API 发起注册（附属操作，失败不影响 Supabase 已注册成功的结果）
    let darkflowResult;
    try {
      const resp = await fetch(DARKFLOW_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, security_question, security_answer })
      });

      let data;
      try {
        data = await resp.json();
      } catch {
        const text = await resp.text();
        data = { raw: text };
      }

      darkflowResult = {
        success: resp.ok,
        status: resp.status,
        data
      };

      if (!resp.ok) {
        console.error('[darkflow] 暗流注册 API 返回非成功状态:', resp.status, JSON.stringify(data).slice(0, 500));
      }
    } catch (e) {
      console.error('[darkflow] 暗流注册请求异常:', e.message);
      darkflowResult = {
        success: false,
        status: 0,
        error: e.message
      };
    }

    // 始终返回 200：Supabase 侧已在调用前注册成功，暗流同步为附属操作
    return res.status(200).json({
      supabase: 'ok',
      darkflow: darkflowResult
    });
  } catch (e) {
    console.error('[darkflow] 请求处理异常:', e.message);
    return res.status(200).json({
      supabase: 'ok',
      darkflow: { success: false, status: 0, error: e.message }
    });
  }
};
