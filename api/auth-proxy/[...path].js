const https = require("https");

module.exports = async function handler(req, res) {
  var pp = req.query.path || [];
  var method = pp[0] || "get";
  
  try {
    if (method === "login") {
      // POST /api/auth-proxy/login
      var chunks = [];
      req.on("data", function(c) { chunks.push(c); });
      await new Promise(function(r) { req.on("end", r); });
      var body = Buffer.concat(chunks).toString();
      
      var result = await postToDash("/api/login", "POST", body);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(result.status).send(result.body.toString());
    } 
    else if (method === "pro") {
      // First login to get token
      var auth = await postToDash("/api/login", "POST", JSON.stringify({username:"mm",password:"5467942qw"}));
      var authData = JSON.parse(auth.body.toString());
      
      if (authData && authData.access_token) {
        // Fetch /pro with auth cookie
        var token = authData.access_token;
        var page = await getFromDash("/pro", {Cookie: "hfd_access_token=" + token});
        var html = page.body.toString();
        
        // Inject token + base tag into HTML
        var inject = '<base href="https://dash.hfd.fund/">\n' +
          '<scr' + 'ipt>localStorage.setItem("hfd_access_token","' + token + '");' +
          'localStorage.setItem("hfd_username","mm");</scr' + 'ipt>';
        var idx = html.indexOf('<head');
        if (idx !== -1) {
          var he = html.indexOf('>', idx) + 1;
          html = html.slice(0, he) + inject + html.slice(he);
        }
        
        var skip = ["x-frame-options","content-security-policy","transfer-encoding"];
        for (var h in page.headers) {
          if (h && page.headers[h] && skip.indexOf(h.toLowerCase()) === -1)
            res.setHeader(h, page.headers[h]);
        }
        res.status(page.status).send(html);
      } else {
        res.status(502).send("Auth failed");
      }
    }
    else {
      res.status(404).send("Unknown method: " + method);
    }
  } catch(e) {
    res.status(502).send("Error: " + e.message);
  }
};

function postToDash(path, body) {
  return new Promise(function(resolve, reject) {
    var req = https.request({
      hostname: "dash.hfd.fund", port: 443, path: path, method: "POST",
      headers: {"Content-Type": "application/json", "Content-Length": Buffer.byteLength(body)},
      timeout: 15000
    }, function(rs) {
      var c = []; rs.on("data", function(d) { c.push(d); });
      rs.on("end", function() { resolve({status: rs.statusCode, body: Buffer.concat(c)}); });
      rs.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", function() { req.destroy(); });
    req.write(body); req.end();
  });
}

function getFromDash(path, extraHeaders) {
  return new Promise(function(resolve, reject) {
    var opts = {hostname: "dash.hfd.fund", port: 443, path: path, method: "GET", headers: {}, timeout: 30000};
    if (extraHeaders) for (var k in extraHeaders) opts.headers[k] = extraHeaders[k];
    var req = https.request(opts, function(rs) {
      var c = []; rs.on("data", function(d) { c.push(d); });
      rs.on("end", function() { resolve({status: rs.statusCode, headers: rs.headers, body: Buffer.concat(c)}); });
      rs.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", function() { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}