const https = require("https");
const http = require("http");

function request(url, method, headers, body) {
  return new Promise(function(resolve, reject) {
    var u = new URL(url);
    var mod = u.protocol === "https:" ? https : http;
    var opts = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: method, headers: headers || {},
      rejectUnauthorized: false, timeout: 30000
    };
    var req = mod.request(opts, function(r) {
      var chunks = [];
      r.on("data", function(c) { chunks.push(c); });
      r.on("end", function() {
        resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) });
      });
    });
    req.on("error", reject);
    req.on("timeout", function() { req.destroy(); reject(new Error("timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

export default async function handler(req, res) {
  var pp = req.query.path || [];
  var subPath = pp.join("/") || "";
  var targetUrl = "https://dash.hfd.fund/" + subPath;
  
  try {
    var headers = {};
    ["content-type", "accept", "accept-encoding", "accept-language", "cookie", "authorization"]
      .forEach(function(k) { if (req.headers[k]) headers[k] = req.headers[k]; });
    
    var body = null;
    if (req.body) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      headers["content-type"] = headers["content-type"] || "application/json";
    }
    
    var result = await request(targetUrl, req.method, headers, body);
    
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    
    var skip = ["content-encoding", "transfer-encoding", "content-length"];
    Object.keys(result.headers).forEach(function(k) {
      if (skip.indexOf(k.toLowerCase()) < 0) {
        res.setHeader(k, result.headers[k]);
      }
    });
    
    res.status(result.status).send(result.body);
  } catch(e) {
    res.status(502).send("Proxy error: " + e.message);
  }
}