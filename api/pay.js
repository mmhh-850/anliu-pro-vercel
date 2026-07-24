const crypto = require("crypto");
const XDD_APP_ID = "19997";
const XDD_APP_SECRET = process.env.XDD_APP_SECRET;
const XDD_GATEWAY = "https://gateway.xddpay.com";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function md5(text) { return crypto.createHash("md5").update(text).digest("hex").toUpperCase(); }

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    let body;
    try { body = JSON.parse(raw); } catch (e) { body = {}; }
    const { user_id, pay_type, money } = body;
    if (!user_id || !pay_type) return res.status(400).json({ error: "missing user_id or pay_type" });

    const xddPayType = pay_type === 1 ? 44 : 43;
    const orderNo = "DP" + Date.now() + Math.floor(Math.random() * 9000 + 1000);
    const orderMoney = money || "9.90";
    const subject = "anliupro";
    const extra = user_id;

    const notifyUrl = "https://www.anliupro.top/api/notify";
    const returnUrl = "https://www.anliupro.top";

    // sign: only core params, NOT notify_url/return_url
    const signStr = "order_no=" + orderNo + "&subject=" + subject + "&pay_type=" + xddPayType + "&money=" + orderMoney + "&app_id=" + XDD_APP_ID + "&extra=" + extra + "&" + XDD_APP_SECRET;
    const sign = md5(signStr);
    const debugSignStr = "order_no=" + orderNo + "&subject=" + subject + "&pay_type=" + xddPayType + "&money=" + orderMoney + "&app_id=" + XDD_APP_ID + "&extra=" + extra + "&SECRET";

    const params = new URLSearchParams();
    params.append("order_no", orderNo);
    params.append("subject", subject);
    params.append("pay_type", String(xddPayType));
    params.append("money", orderMoney);
    params.append("app_id", XDD_APP_ID);
    params.append("extra", extra);
    params.append("notify_url", notifyUrl);
    params.append("return_url", returnUrl);
    params.append("sign", sign);

    const resp = await fetch(XDD_GATEWAY + "?format=json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    const respText = await resp.text();
    let data;
    try { data = JSON.parse(respText); } catch (e) {
      return res.status(502).json({ error: "支付网关异常", detail: respText.substring(0, 200) });
    }

    if (!data.xddpay_order && data.msg && data.msg.includes("余额不足")) {
      return res.json({ order_no: orderNo, error: "商户余额不足", xdd_msg: data.msg, debug_signStr: debugSignStr });
    }
    if (!data.xddpay_order && data.msg && data.msg.includes("签名")) {
      return res.json({ order_no: orderNo, error: "签名错误", xdd_msg: data.msg, debug_signStr: debugSignStr });
    }

    // 异步存 Supabase
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      (async () => {
        try {
          const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" };
          await fetch(SUPABASE_URL + "/rest/v1/pay_orders", {
            method: "POST", headers,
            body: JSON.stringify({ user_id, order_no: orderNo, xddpay_order: data.xddpay_order, money: orderMoney, pay_type: pay_type, status: "pending", created_at: new Date().toISOString() })
          });
        } catch (e) { console.error("[pay] Supabase save failed:", e.message); }
      })();
    }

    return res.json({
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
    return res.status(500).json({ error: e.message, stack: e.stack ? e.stack.substring(0, 500) : "" });
  }
};