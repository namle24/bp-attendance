// One precompressed response contains everything needed to render and submit.
// A stalled optional image/script must never hold up admission to a 30 s QR.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{gzipSync}=require('node:zlib');
const root=path.join(__dirname,'lan-public');
const hash=text=>"'sha256-"+createHash('sha256').update(text).digest('base64')+"'";
function page(filename,scripts){
  let html=fs.readFileSync(path.join(root,filename),'utf8');
  const css=['style.css','student-theme.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
  const js=scripts.map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n;\n');
  html=html.replace(/<link rel="stylesheet"[^>]+>/g,'').replace(/<script src="[^"]+" defer><\/script>/g,'');
  html=html.replace('</head>','<style>'+css+'</style></head>').replace('</body>','<script>'+js+'</script></body>');
  html=html.replace('src="/study-buddy.svg"','src="data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'study-buddy.svg')).toString('base64')+'"');
  html=html.replace('src="/assets/usth-logo.png"','src="data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'public/assets/usth-logo.png')).toString('base64')+'"');
  const plain=Buffer.from(html),gzip=gzipSync(plain);
  const csp="default-src 'self'; script-src "+hash(js)+"; style-src "+hash(css)+"; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
  return (req,res)=>{
    res.set('Content-Security-Policy',csp);
    res.vary('Accept-Encoding');res.type('html');
    if(req.headers['accept-encoding']&&req.acceptsEncodings('gzip')){res.set('Content-Encoding','gzip');res.send(gzip);}else res.send(plain);
  };
}
module.exports={page};
