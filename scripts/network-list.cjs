const {networkAdapters}=require('../web/lan-config.cjs');
const adapters=networkAdapters();
for(const adapter of adapters)console.log(adapter.name+' · '+adapter.address+' · '+adapter.cidr+(adapter.wifi?' · ứng viên Wi-Fi':''));
if(!adapters.length)console.log('Chưa có card mạng với IPv4. Kết nối Wi-Fi rồi chạy lại.');
console.log('Điền LAN_INTERFACE=<tên card Wi-Fi> trong .env nếu app chưa tự chọn đúng một card. Không chọn card VPN hoặc máy ảo.');
