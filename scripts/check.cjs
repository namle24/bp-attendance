const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
for(const folder of ['web','web/public','scripts','tests','tests/helpers']){
  if(!fs.existsSync(path.join(root,folder)))continue;
  for(const name of fs.readdirSync(path.join(root,folder)).filter(n=>/\.(cjs|js)$/.test(n)))
    new vm.Script(fs.readFileSync(path.join(root,folder,name),'utf8'),{filename:folder+'/'+name});
}
console.log('Server, browser UI, scripts and tests: syntax OK.');
