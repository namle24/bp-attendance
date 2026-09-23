/* ES5 syntax: the basic form also works with JavaScript disabled. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function notice(message, error) { $('notice').textContent = message; $('notice').className = error ? 'notice error' : 'notice'; }
  if (!window.Promise || !window.BPClient) { notice('Mở biểu mẫu tối giản bên trên để tiếp tục điểm danh.'); return; }
  var session, pending, busy = false, booting = false, scanGrant, scanAt = 0;
  function clock() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function loadPending(sid) {
    try {
      var current = JSON.parse(sessionStorage.getItem('bp-lan-pending') || 'null');
      if (current) sessionStorage.setItem('bp-lan-pending:' + current.sessionId, JSON.stringify(current));
      return !sid || (current && current.sessionId === sid) ? current : JSON.parse(sessionStorage.getItem('bp-lan-pending:' + sid) || 'null');
    } catch (_) { return null; }
  }
  function loadGrant() { try { return JSON.parse(sessionStorage.getItem('bp-lan-scan') || 'null'); } catch (_) { return null; } }
  function saveGrant() { try { sessionStorage.setItem('bp-lan-scan', JSON.stringify(scanGrant)); } catch (_) {} }
  function remaining() { return scanGrant ? scanGrant.expiresAt - scanGrant.serverTime - (clock() - scanAt) : 0; }
  function scanClock() {
    if (!$('receipt').hidden) { $('scan-time').textContent = ''; return; }
    var left = remaining(); $('scan-time').textContent = left > 0 ? 'Thời gian nhập còn ' + Math.ceil(left / 1000) + ' giây. Giữ nguyên Wi-Fi.' : '';
    if (left <= 0 && session) $('scan-form').hidden = false;
  }
  function request(url, body, retry) {
    return BPClient.request(url, body, {timeout: url === '/api/check-in' ? 20000 : 7000}).catch(function (error) {
      // Only admission/read requests retry automatically, once with jitter.
      if (!retry || error.code || error.status) throw error;
      notice('Kết nối vừa gián đoạn. Đang thử lại…');
      return new Promise(function (resolve) { setTimeout(resolve, 300 + Math.floor(Math.random() * 500)); }).then(function () { return request(url, body, false); });
    });
  }
  function lockFields() { ['student-id', 'full-name'].forEach(function (id) { $(id).readOnly = !!pending; }); }
  function savePending() { lockFields(); try { sessionStorage.setItem('bp-lan-pending', JSON.stringify(pending)); if (pending) sessionStorage.setItem('bp-lan-pending:' + pending.sessionId, JSON.stringify(pending)); } catch (_) {} }
  function fill(previous) { if (previous) { $('student-id').value = previous.studentId; $('full-name').value = previous.name; } }
  function showRound() { $('date').textContent = session ? session.date + ' · Đợt ' + session.number + (session.label ? ' · ' + session.label : '') : ''; }
  function receipt(row) {
    $('receipt').setAttribute('data-status', row.status);
    $('receipt-mark').textContent = row.status === 'PENDING' ? '…' : row.status === 'REJECTED' ? '!' : '✓';
    $('receipt-title').textContent = row.status === 'PENDING' ? 'Đã lưu, chờ TA đối chiếu' : row.status === 'REJECTED' ? 'TA không xác nhận điểm danh' : 'Đã ghi nhận điểm danh';
    $('receipt-fields').textContent = '';
    [['Đợt', 'Đợt ' + (row.roundNumber || 1) + (row.roundLabel ? ' · ' + row.roundLabel : '')], ['MSSV', row.studentId], ['Họ tên', row.name], ['Thời gian', BPClient.time(row.at)]].forEach(function (field) {
      var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = field[0]; dd.textContent = field[1]; $('receipt-fields').appendChild(dt); $('receipt-fields').appendChild(dd);
    });
    $('attendance-form').hidden = true; $('scan-form').hidden = true; $('scan-time').textContent = ''; $('receipt').hidden = false;
    $('reload').hidden = false; $('reload').textContent = 'Kiểm tra đợt điểm danh tiếp theo';
    notice(row.status === 'REJECTED' ? 'TA đã đối chiếu và không xác nhận. Liên hệ TA nếu cần làm rõ.' : row.status === 'PENDING' ? 'Đã lưu. TA sẽ đối chiếu thông tin tại lớp.' : row.duplicate ? 'Lượt gửi này đã được lưu trước đó.' : 'Điểm danh đã được lưu.');
  }
  function admit(input) {
    return request('/api/scan', input, true).then(function (grant) {
      scanGrant = grant; scanAt = clock(); saveGrant();
      var previous = pending || loadPending(); session = grant.session;
      pending = previous && previous.sessionId === session.id ? previous : loadPending(session.id);
      if (!pending) fill(previous);
      lockFields(); $('receipt').hidden = true; $('reload').hidden = false; showRound();
      if (grant.receipt) { receipt(grant.receipt); return; }
      if (pending) { pending.scanTicket = grant.scanTicket; savePending(); }
      $('scan-form').hidden = true; $('attendance-form').hidden = false;
      notice('Đã xác nhận mã trong phòng. Nhập MSSV và họ tên của bạn rồi gửi.'); scanClock();
    });
  }
  function clearLink() { try { history.replaceState(null, '', location.pathname); } catch (_) {} }
  function boot() {
    if (booting || busy) return;
    booting = true; $('reload').disabled = true;
    var token = BPClient.fragment('qr'), code = BPClient.fragment('code');
    var task;
    if (token || code) {
      task = admit(token ? {token: token} : {code: code}).then(function () { clearLink(); $('connection-help').open = false; }).catch(function (error) {
        if (error.code) clearLink();
        $('receipt').hidden = true; $('attendance-form').hidden = true; $('scan-form').hidden = false;
        notice(error.message || 'Chưa xác nhận được QR. Quét lại mã đang chiếu.', true); $('connection-help').open = true;
      });
    } else {
      task = request('/api/session', undefined, true).then(function (data) {
        var previous = pending || loadPending(); session = data.session;
        pending = previous && (!session || previous.sessionId === session.id) ? previous : loadPending(session && session.id);
        $('receipt').hidden = true; $('reload').hidden = false; $('reload').textContent = 'Kiểm tra đợt điểm danh';
        if (!pending) fill(previous);
        lockFields(); showRound();
        if (data.receipt) { receipt(data.receipt); return; }
        scanGrant = loadGrant();
        if (scanGrant) { scanGrant.serverTime = data.serverTime; scanAt = clock(); if (!session || scanGrant.sessionId !== session.id || ((scanGrant.session && scanGrant.session.generation) || 0) !== (session.generation || 0)) scanGrant = null; }
        if (pending && (!session || pending.sessionId === session.id)) {
          fill(pending); lockFields(); $('attendance-form').hidden = false;
          notice('Bạn đã gửi trên trang này. Bấm gửi lại để kiểm tra kết quả đã lưu.');
          if (pending.receipt) receipt(pending.receipt);
        } else if (session) {
          pending = null; savePending(); $('attendance-form').hidden = remaining() <= 0; $('scan-form').hidden = remaining() > 0;
          notice(remaining() > 0 ? 'Nhập thông tin và gửi trước khi hết thời gian.' : 'Quét QR hoặc nhập mã đang chiếu trong phòng để điểm danh.');
        } else { $('attendance-form').hidden = true; $('scan-form').hidden = true; notice('Chưa mở điểm danh hoặc đã hết giờ. Chờ hướng dẫn của TA.'); }
        scanClock();
      }).catch(function (error) { notice(error.message || 'Chưa kết nối được máy host. Kiểm tra Wi-Fi và thử lại.', true); $('connection-help').open = true; $('scan-form').hidden = false; });
    }
    task.then(function () { booting = false; $('reload').disabled = false; });
  }
  $('attendance-form').addEventListener('submit', function (event) {
    event.preventDefault(); if (busy || booting) return; busy = true; $('submit').disabled = true;
    Promise.resolve().then(function () {
      if (!pending) {
        if (!session) throw Error('Chưa mở điểm danh.');
        if (remaining() <= 0) { $('scan-form').hidden = false; throw Error('Quét QR hoặc nhập mã đang chiếu để tiếp tục.'); }
        pending = {sessionId: session.id, studentId: $('student-id').value.trim().toUpperCase(), name: $('full-name').value.trim().replace(/\s+/g, ' '), requestId: scanGrant.requestId || BPClient.randomId(), scanTicket: scanGrant.scanTicket};
      }
      savePending(); notice('Đang gửi điểm danh…');
      return request('/api/check-in', pending, false);
    }).then(function (result) { pending.receipt = result.receipt; delete pending.location; savePending(); receipt(result.receipt); }).catch(function (error) {
      if (['INPUT_INVALID', 'ID_INVALID', 'REQUEST_INVALID', 'ALREADY_RECORDED'].indexOf(error.code) !== -1) { pending = null; savePending(); notice(error.message, true); }
      else if (error.code) {
        if (['SCAN_REQUIRED', 'SCAN_INVALID', 'SCAN_EXPIRED', 'DEVICE_CHANGED', 'COOKIES_REQUIRED'].indexOf(error.code) !== -1) { $('scan-form').hidden = false; scanGrant = null; saveGrant(); }
        if (error.code === 'DEVICE_RECORDED') { $('attendance-form').hidden = true; $('scan-form').hidden = true; }
        notice(error.message, true);
      } else notice(pending ? 'Chưa xác nhận được kết quả. Giữ trang này và bấm gửi lại; hệ thống sẽ kiểm tra lượt gửi trước.' : error.message, true);
    }).then(function () { busy = false; $('submit').disabled = false; });
  });
  $('scan-form').addEventListener('submit', function (event) {
    event.preventDefault(); if (busy || booting) return; booting = true; $('scan-submit').disabled = true;
    admit({code: $('room-code').value}).catch(function (error) { notice(error.message || 'Chưa xác nhận được mã. Kiểm tra Wi-Fi rồi thử lại.', true); }).then(function () { booting = false; $('scan-submit').disabled = false; });
  });
  $('reload').addEventListener('click', boot); window.addEventListener('hashchange', boot);
  window.addEventListener('online', function () { if (!pending && $('receipt').hidden && !document.hidden) boot(); });
  setInterval(scanClock, 1000); boot();
}());
