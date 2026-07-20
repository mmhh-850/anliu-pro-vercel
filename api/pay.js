module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'method not allowed' });
  }
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'missing user_id' });

    console.log(`[pay] user_id=${user_id} 发起支付，跳转暗流Pro`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ url: 'https://dash.hfd.fund/pro/?tf=1h&indicator=smart_money_cost&coin=BTC' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
