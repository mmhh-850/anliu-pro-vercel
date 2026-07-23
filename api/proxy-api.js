const https = require("https");
const http = require("http");

function doRequest(url, method, headers, body) {
  return new Promise(function(resolve, reject) {
    var u = new URL(url);
    var mod = u.protocol === "https:" ? https : http;
    var opts = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: method, headers: headers || {},
      rejectUnauthorized: false, timeout: 30000
    };
    var r = mod.request(opts, function(resp) {
      var chunks = [];
      resp.on("data", function(c) { chunks.push(c); });
      resp.on("end", function() {
        resolve({ status: resp.statusCode, headers: resp.headers, body: Buffer.concat(chunks) });
      });
    });
    r.on("error", reject);
    r.on("timeout", function() { r.destroy(); reject(new Error("timeout")); });
    if (body) r.write(body);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  var subPath = req.query.p || "";
  if (!subPath) { res.status(400).send("Missing ?p= parameter"); return; }
  
  var targetUrl = "https://dash.hfd.fund/" + subPath;
  
  try {
    var fwdHeaders = {};
    ["content-type", "accept", "accept-language", "cookie", "authorization"]
      .forEach(function(k) { if (req.headers[k]) fwdHeaders[k] = req.headers[k]; });
    
    var body = null;
    if (req.body) {
      body = JSON.stringify(req.body);
    } else if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      body = await new Promise(function(resolve) {
        var chunks = [];
        req.on("data", function(c) { chunks.push(c); });
        req.on("end", function() { resolve(Buffer.concat(chunks).toString()); });
      });
    }
    
    var result = await doRequest(targetUrl, req.method, fwdHeaders, body);
    
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    
    var skip = ["content-encoding", "transfer-encoding", "content-length", "content-disposition"];
    Object.keys(result.headers).forEach(function(k) {
      if (skip.indexOf(k.toLowerCase()) < 0) {
        res.setHeader(k, result.headers[k]);
      }
    });
    
    res.status(result.status).send(result.body);
  } catch(e) {
    res.status(502).send("Proxy error: " + e.message);
  }
};