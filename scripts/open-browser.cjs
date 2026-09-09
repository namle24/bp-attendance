const {spawn}=require('node:child_process');
function openBrowser(url,platform=process.platform){
  // Only locally constructed numeric loopback URLs may reach a shell on Windows.
  if(!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url))throw Error('Địa chỉ trang TA không hợp lệ.');
  const command=platform==='win32'?'cmd.exe':platform==='darwin'?'/usr/bin/open':'xdg-open';
  const args=platform==='win32'?['/d','/s','/c','start "" "'+url+'"']:[url];
  try{const child=spawn(command,args,{stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();}catch{}
}
module.exports={openBrowser};
