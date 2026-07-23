const https = require('https');
const DASH = 'dash.hfd.fund';
const GASH = 'gash.hz.fundsol';

function postJSON(host, path, data) {
  var body = JSON.stringify(data);
  return new Promise(function(resolve, reject) {
    var req = https.request({hostname:host,port:443,path:path,method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:15000},
      function(res){var c=[];res.on('data',function(d){c.push(d)});res.on('end',function(){
        try{resolve(JSON.parse(Buffer.concat(c).toString()))}catch(e){resolve(null)}});res.on('error',reject)});
    req.on('error',reject);req.on('timeout',function(){req.destroy()});req.write(body);req.end();
  });
}

function proxyTo(targetUrl, method, hdrs, body) {
  return new Promise(function(resolve, reject) {
    var u = new URL(targetUrl);
    var opts = {hostname:u.hostname,port:u.port||443,path:u.pathname+u.search,method:method,headers:{},timeout:30000};
    for(var k in hdrs){if(k==='host')opts.headers[k]=u.hostname;else if(k!=='origin'&&k!=='referer')opts.headers[k]=hdrs[k]}
    var rq = https.request(opts, function(rs) {
      var c=[];rs.on('data',function(d){c.push(d)});rs.on('end',function(){resolve({status:rs.statusCode,headers:rs.headers,body:Buffer.concat(c)})});rs.on('error',reject)});
    rq.on('error',reject);rq.on('timeout',function(){rq.destroy();reject(new Error('timeout'))});
    if(body&&body.length>0)rq.write(body);rq.end();
  });
}

module.exports = async function handler(req, res) {
  var pp = req.query.path || [];
  var base = 'https://' + ((pp[0]==='_gash')?(pp.shift(),GASH):DASH);
  var path = pp.join('/');
  var qs = req.url.includes('?')?'?'+req.url.split('?').slice(1).join('?'):'';
  try {
    var rb=[];req.on('data',function(c){rb.push(c)});await new Promise(function(r){req.on('end',r)});rb=Buffer.concat(rb);
    var result = await proxyTo(base+'/'+path+qs, req.method, req.headers, rb);
    var skips = ['x-frame-options','content-security-policy','transfer-encoding'];
    for(var h in result.headers){if(h&&result.headers[h]&&skips.indexOf(h.toLowerCase())===-1)res.setHeader(h,result.headers[h])}
    var body = result.body;
    if(path==='pro'&&body.length>0&&(result.headers['content-type']||'').indexOf('text/html')!==-1){
      try{
        var auth = await postJSON(DASH, '/api/login', {username:'mm',password:'5467942qw'});
        if(auth&&auth.access_token){
          var scr = '<script>localStorage.setItem("hfd_access_token","'+auth.access_token+'");localStorage.setItem("hfd_username","mm");</script>';
          var s = body.toString('utf-8');var idx = s.indexOf('<head');
          if(idx!==-1){var he=s.indexOf('>',idx)+1;body=Buffer.concat([body.slice(0,he),Buffer.from(scr),body.slice(he)])}
        }
      }catch(e){console.log('auth inject failed:',e.message)}
    }
    res.status(result.status);body.length>0?res.send(body):res.send('');
  } catch(e) {res.status(502).send('Proxy error: '+e.message)}
};
