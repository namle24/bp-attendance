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
  button.disabled = false; status.textContent = 'Bấm Lấy vị trí, sau đó chọn Cho phép trong hộp thoại quyền của Safari/Chrome. Nút trên trang chưa cấp quyền cho trình duyệt.';
  var delivered = false, timer, lastFailure;
  var help = document.getElementById('permission-help'), continueButton = document.getElementById('continue-review');
  function deliver(sample) {
    if (delivered) return; delivered = true; button.disabled = true; continueButton.hidden = true;
    status.textContent = 'Đang chuyển kết quả về trang điểm danh…';
    window.opener.postMessage({type: 'bp-location-result', state: state, sample: sample}, origin);
    timer = setTimeout(function () { status.textContent = 'Chưa xác nhận được trang điểm danh đã nhận kết quả. Quay lại tab cũ và bấm Lấy vị trí lại.'; }, 5000);
  }
  window.addEventListener('message', function (event) {
    if (!delivered || event.source !== window.opener || event.origin !== origin || !event.data || event.data.type !== 'bp-location-ack' || event.data.state !== state) return;
    clearTimeout(timer); status.textContent = 'Trang điểm danh đã nhận kết quả. Quay lại tab đó để gửi.';
    window.close();
  });
  function failed(kind, error) {
    lastFailure = {status: kind};
    status.textContent = kind === 'DENIED' ? 'Trình duyệt hoặc thiết bị đang chặn quyền vị trí. Kiểm tra cài đặt bên dưới rồi thử lại; lỗi này không xác định được bạn đã bấm Cho phép hay Từ chối.' : kind === 'TIMEOUT' ? 'Chưa lấy được vị trí trong 20 giây. Giữ tab mở rồi thử lại.' : kind === 'UNSUPPORTED' ? 'Trình duyệt này không hỗ trợ lấy vị trí. Mở trang điểm danh bằng Safari hoặc Chrome.' : 'Thiết bị chưa lấy được vị trí. Kiểm tra Dịch vụ định vị rồi thử lại.';
    help.hidden = false; continueButton.hidden = false; button.disabled = false; button.textContent = 'Thử lấy vị trí lại';
    // Diagnostic text stays on this device; it is never posted to the host.
    document.getElementById('error-detail').textContent = 'Mã lỗi: ' + (error && error.code || kind) + (error && error.message ? ' · ' + String(error.message).slice(0, 240) : '');
  }
  continueButton.addEventListener('click', function () { if (lastFailure) deliver(lastFailure); });
  button.addEventListener('click', function () {
    if (delivered || button.disabled) return;
    lastFailure = null; help.hidden = true; continueButton.hidden = true; button.disabled = true;
    status.textContent = 'Đang lấy vị trí. Nếu trình duyệt hỏi quyền, chọn Cho phép; giữ tab mở trong lúc chờ…';
    if (!navigator.geolocation) { failed('UNSUPPORTED'); return; }
    try {
      navigator.geolocation.getCurrentPosition(function (position) {
        deliver({status: 'OK', latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, ageMs: Math.max(0, Date.now() - position.timestamp)});
      }, function (error) { failed(error.code === 1 ? 'DENIED' : error.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE', error); }, {enableHighAccuracy: true, maximumAge: 0, timeout: 20000});
    } catch (error) { failed(error.name === 'SecurityError' || error.name === 'NotAllowedError' ? 'DENIED' : 'UNAVAILABLE', error); }
  });
}());
