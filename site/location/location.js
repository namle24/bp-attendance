(function () {
  'use strict';
  var button = document.getElementById('locate'), status = document.getElementById('status');
  var params = new URLSearchParams(location.hash.slice(1)), target = params.get('origin'), state = params.get('state'), origin;
  try {
    var url = new URL(target), octets = url.hostname.split('.').map(Number);
    var privateIP = octets.length === 4 && octets.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 255; }) && (octets[0] === 10 || octets[0] === 127 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 192 && octets[1] === 168);
    if (!window.isSecureContext || !window.opener || !privateIP || !/^https?:$/.test(url.protocol) || url.origin !== target || !/^[a-f0-9]{32}$/.test(state)) throw Error();
    origin = url.origin;
  } catch (_) { document.getElementById('host').textContent = 'Chưa mở từ trang điểm danh'; status.textContent = 'Quay lại trang điểm danh và bấm Lấy vị trí để bắt đầu.'; return; }
  // Origin and random state stay in the fragment and are removed after reading.
  history.replaceState(null, '', location.pathname);
  document.getElementById('host').textContent = origin;
  button.disabled = false; status.textContent = 'Bấm nút bên trên và cho phép trình duyệt sử dụng vị trí.';
  var delivered = false, timer;
  function deliver(sample) {
    if (delivered) return; delivered = true;
    status.textContent = 'Đang chuyển kết quả về trang điểm danh…';
    window.opener.postMessage({type: 'bp-location-result', state: state, sample: sample}, origin);
    timer = setTimeout(function () { status.textContent = 'Chưa xác nhận được trang điểm danh đã nhận kết quả. Quay lại tab cũ và bấm Lấy vị trí lại.'; }, 5000);
  }
  window.addEventListener('message', function (event) {
    if (event.source !== window.opener || event.origin !== origin || !event.data || event.data.type !== 'bp-location-ack' || event.data.state !== state) return;
    clearTimeout(timer); status.textContent = 'Trang điểm danh đã nhận kết quả. Quay lại tab đó để gửi.';
    window.close();
  });
  button.addEventListener('click', function () {
    button.disabled = true; status.textContent = 'Đang lấy vị trí. Giữ trang mở trong lúc chờ…';
    if (!navigator.geolocation) { deliver({status: 'UNSUPPORTED'}); return; }
    navigator.geolocation.getCurrentPosition(function (position) {
      deliver({status: 'OK', latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, ageMs: Math.max(0, Date.now() - position.timestamp)});
    }, function (error) { deliver({status: error.code === 1 ? 'DENIED' : error.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE'}); }, {enableHighAccuracy: true, maximumAge: 0, timeout: 20000});
  });
}());
