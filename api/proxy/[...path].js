const https = require("https");
const http = require("http");

const INJECT_SCRIPT = `
<script><!-- Marvis Inject -->
(function(){
  var FW=window.fetch,XH=window.XMLHttpRequest,B=location.origin;
  function via(u){
    var s=typeof u=="string"?u:(u.url||u.toString());
    var m=s.match(/^https?:\\/\\/dash\\.hfd\\.fund\\/(.*)/);
    if(m)s=m[1];
    else if(s.startsWith("/"))s=s.slice(1);
    if(s.startsWith("api/proxy-api"))return u;
    return B+"/api/proxy-api?p="+encodeURIComponent(s);
  }
  window.fetch=function(u,o){return FW(via(u),o||{});};
  var O=XH.prototype.open;
  XH.prototype.open=function(m,u){arguments[1]=via(u);return O.apply(this,arguments);};
  if(!localStorage.getItem("hfd_authed")){
    FW(B+"/api/proxy-api?p=api%2Flogin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"mm",password:"5467942qw"})})
    .then(function(r){return r.json()}).then(function(d){
      var t=d.access_token||d.token||"";
      if(t){localStorage.setItem("hfd_authed","1");localStorage.setItem("hfd_access_token",t);localStorage.setItem("hfd_username","mm");}
      location.reload();
    }).catch(function(){});
  }
})();
</script>
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

function isHtml(ct) {
  if (!ct) return false;
  return ct.indexOf("text/html") >= 0 || ct.indexOf("application/xhtml") >= 0;
}

module.exports = async function handler(req, res) {
  var pp = req.query.path || [];
  var subPath = decodeURIComponent(pp.join("/") || "");
  
  var targetUrl = "https://dash.hfd.fund/" + subPath;
  
  try {
    var fwd = {};
    ["content-type", "accept", "cookie", "authorization"].forEach(function(k) {
      if (req.headers[k]) fwd[k] = req.headers[k];
    });
    
    var body = null;
    if (req.body) {
      body = JSON.stringify(req.body);
    } else if (req.method !== "GET" && req.method !== "HEAD") {
      body = await new Promise(function(resolve) {
        var chunks = [];
        req.on("data", function(c) { chunks.push(c); });
        req.on("end", function() { resolve(Buffer.concat(chunks).toString()); });
      });
    }
    
    var result = await doReq(targetUrl, req.method, fwd, body);
    
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    
    var skip = ["content-encoding", "transfer-encoding", "content-length"];
    Object.keys(result.headers).forEach(function(k) {
      if (skip.indexOf(k.toLowerCase()) < 0) {
        res.setHeader(k, result.headers[k]);
      }
    });
    
    // Inject interceptor into HTML responses
    var ct = result.headers["content-type"] || "";
    var respBody = result.body;
    if (isHtml(ct) && Buffer.isBuffer(respBody)) {
      var html = respBody.toString("utf-8");
      html = html.replace("<head>", "<head>" + INJECT_SCRIPT);
      respBody = Buffer.from(html, "utf-8");
    }
    
    res.status(result.status).send(respBody);
  } catch(e) {
    res.status(502).send("Proxy error: " + e.message);
  }
};