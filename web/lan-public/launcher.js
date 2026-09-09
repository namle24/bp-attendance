'use strict';
let busy=false,csrf='';
async function refresh(){
  try{
    const response=await fetch('/api/networks',{cache:'no-store'}),data=await response.json();csrf=data.csrf;
    if(data.target){location.replace(data.target);return;}
    if(data.error){document.getElementById('status').textContent=data.error;return;}
    if(busy)return;
    document.getElementById('status').textContent=data.networks.length?'Chọn một kết nối bên dưới.':'Chưa có kết nối LAN. Kết nối Wi-Fi trên laptop.';
    const list=document.getElementById('networks');list.replaceChildren();
    for(const network of data.networks){
      const button=document.createElement('button');button.className='network-option secondary';button.textContent=network.name;
      const detail=document.createElement('small');detail.textContent=network.address;button.append(detail);
      button.addEventListener('click',async()=>{
        busy=true;for(const b of list.querySelectorAll('button'))b.disabled=true;document.getElementById('status').textContent='Đang mở bảng TA…';
        try{const result=await fetch('/api/select',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(network)});if(!result.ok)throw Error((await result.json()).message);}
        catch(error){document.getElementById('status').textContent=error.message;busy=false;}
      });list.append(button);
    }
  }catch{document.getElementById('status').textContent='Chưa kết nối được app. Kiểm tra cửa sổ chạy app.';}
}
void refresh();setInterval(refresh,2000);
