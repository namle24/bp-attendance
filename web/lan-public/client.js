/* Shared browser transport: works without fetch, AbortController or AbortSignal.timeout. */
(function (root) {
  'use strict';
  function request(url, data, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(data === undefined ? 'GET' : 'POST', url, true);
      xhr.timeout = options.timeout || (data === undefined ? 20000 : 45000);
      if (data !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
      Object.keys(options.headers || {}).forEach(function (key) { xhr.setRequestHeader(key, options.headers[key]); });
      xhr.onload = function () {
        var body;
        try { body = JSON.parse(xhr.responseText); }
        catch (_) { reject(new Error('Máy chưa trả về dữ liệu điểm danh. Hoàn tất đăng nhập Wi-Fi rồi mở lại bằng Chrome hoặc Safari.')); return; }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          reject(new Error('Phản hồi không hợp lệ. Kiểm tra kết nối Wi-Fi và thử lại.')); return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          var error = new Error(body.message || 'Không xử lý được yêu cầu. Vui lòng thử lại.');
          if (body.code === 'DUPLICATE_REVIEW') error.receipt = body.receipt;
          error.code = body.code; error.status = xhr.status; reject(error); return;
        }
        resolve(body);
      };
      xhr.onerror = function () { reject(new Error('Chưa kết nối được máy host. Giữ Wi-Fi của lớp, mở link bằng Chrome hoặc Safari và thử lại.')); };
      xhr.ontimeout = function () { reject(new Error('Máy host chưa trả lời kịp. Kiểm tra Wi-Fi rồi thử lại.')); };
      xhr.onabort = function () { reject(new Error('Kết nối vừa bị ngắt. Vui lòng thử lại.')); };
      xhr.send(data === undefined ? null : JSON.stringify(data));
    });
  }
  function randomId() {
    var crypto = root.crypto || root.msCrypto;
    if (!crypto || !crypto.getRandomValues) throw new Error('Trình duyệt này chưa hỗ trợ gửi an toàn. Mở link bằng Chrome hoặc Safari.');
    var bytes = new Uint8Array(16), result = '';
    crypto.getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) result += ('0' + bytes[i].toString(16)).slice(-2);
    return result;
  }
  function fragment(key) {
    var parts = root.location.hash.slice(1).split('&');
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split('=');
      if (pair[0] === key) { try { return decodeURIComponent(pair.slice(1).join('=')); } catch (_) { return ''; } }
    }
    return '';
  }
  function time(at) {
    var date = new Date(at + 7 * 3600000);
    function pad(n) { return ('0' + n).slice(-2); }
    return pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds()) + ' ' + pad(date.getUTCDate()) + '/' + pad(date.getUTCMonth() + 1) + '/' + date.getUTCFullYear();
  }
  root.BPClient = {request: request, randomId: randomId, fragment: fragment, time: time};
}(window));
