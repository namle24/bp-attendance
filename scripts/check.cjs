const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
for (const name of ['Code.gs', 'Core.gs']) {
  new vm.Script(fs.readFileSync(path.join(root, 'apps-script', name), 'utf8'), { filename: name });
}
for(const name of fs.readdirSync(path.join(root,'web')).filter(n=>n.endsWith('.cjs'))){
  new vm.Script(fs.readFileSync(path.join(root,'web',name),'utf8'),{filename:name});
}
new vm.Script(fs.readFileSync(path.join(root,'web/public/app.js'),'utf8'),{filename:'web/public/app.js'});
for (const name of ['Panel.html', 'Qr.html']) {
  const html = fs.readFileSync(path.join(root, 'apps-script', name), 'utf8');
  for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], { filename: name });
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps-script/appsscript.json')));
if (manifest.timeZone !== 'Asia/Ho_Chi_Minh') throw Error('Unexpected timezone');
console.log('Web server, UI, Apps Script and manifest: syntax OK.');
