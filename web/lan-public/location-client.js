/* One position per click; HTTPS helper uses postMessage, never an HTTP fetch. */
(function (root) {
  'use strict';
  function request(helperUrl, callback) {
    var finished = false, popup, timeout, closedTimer, state = BPClient.randomId(), helperOrigin;
    function finish(sample) {
      if (finished) return;
      finished = true; clearTimeout(timeout); clearInterval(closedTimer);
      root.removeEventListener('message', receive);
      callback(sample);
    }
    function receive(event) {
      if (finished || event.source !== popup || event.origin !== helperOrigin) return;
      var data = event.data;
      if (!data || data.type !== 'bp-location-result' || data.state !== state || !data.sample) return;
      popup.postMessage({type: 'bp-location-ack', state: state}, helperOrigin);
      finish(data.sample);
    }
    if (!helperUrl) {
      if (!root.isSecureContext || !navigator.geolocation) { finish({status: 'UNSUPPORTED'}); return function () {}; }
      navigator.geolocation.getCurrentPosition(function (position) {
        finish({status: 'OK', latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, ageMs: Math.max(0, Date.now() - position.timestamp)});
      }, function (error) { finish({status: error.code === 1 ? 'DENIED' : error.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE'}); }, {enableHighAccuracy: true, maximumAge: 0, timeout: 20000});
    } else {
      var link = document.createElement('a'); link.href = helperUrl;
      if (link.protocol !== 'https:') { finish({status: 'UNSUPPORTED'}); return function () {}; }
      helperOrigin = link.protocol + '//' + link.host;
      root.addEventListener('message', receive);
      popup = root.open(helperUrl + '#origin=' + encodeURIComponent(location.origin) + '&state=' + state, '_blank');
      if (!popup) { finish({status: 'UNAVAILABLE'}); return function () {}; }
      closedTimer = setInterval(function () { if (popup.closed) finish({status: 'UNAVAILABLE'}); }, 500);
    }
    timeout = setTimeout(function () { finish({status: 'TIMEOUT'}); }, 120000);
    return function () { finished = true; clearTimeout(timeout); clearInterval(closedTimer); root.removeEventListener('message', receive); };
  }
  function failure(status) { return ({DENIED: 'Không cấp quyền vị trí',TIMEOUT: 'Lấy vị trí quá thời gian',UNAVAILABLE: 'Không lấy được vị trí hoặc tab mới bị chặn',UNSUPPORTED: 'Trình duyệt không hỗ trợ lấy vị trí'})[status] || 'Chưa xác minh được vị trí'; }
  root.BPGeo = {request: request, failure: failure};
}(window));
