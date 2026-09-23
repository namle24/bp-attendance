/* ES5 syntax: the basic form also works with JavaScript disabled. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function notice(message, error) { $('notice').textContent = message; $('notice').className = error ? 'notice error' : 'notice'; }
  if (!window.Promise || !window.BPClient) { notice('Mở biểu mẫu tối giản bên trên để tiếp tục điểm danh.'); return; }
  var session, pending, busy = false, booting = false, scanGrant, scanAt = 0, currentReceipt = null, receiptTimer, refreshing = false, viewGeneration = 0, popupKey = '', emailBusy = false;
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
    return BPClient.request(url, body, {timeout: url === '/api/check-in' ? 45000 : 7000}).catch(function (error) {
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
  function hideReview() { $('duplicate-popup').hidden = true; }
  function openReview() {
    if (!currentReceipt || !currentReceipt.duplicateReview) return;
    var email = currentReceipt.schoolEmail || '';
    if (!$('duplicate-popup').hidden && emailBusy) return;
    if ($('duplicate-popup').hidden || email) $('school-email').value = email;
    $('review-email-form').hidden = !!email; $('review-ack').hidden = !email;
    $('review-email-status').textContent = email ? 'Đã lưu ' + email + '. Mang thẻ sinh viên xuống bàn TA để hoàn tất đối chiếu.' : '';
    var wasHidden = $('duplicate-popup').hidden; $('duplicate-popup').hidden = false;
    if (wasHidden) $('duplicate-popup').querySelector('.review-panel').focus();
  }
  function scheduleReceipt() {
    clearTimeout(receiptTimer);
    if (currentReceipt) receiptTimer = setTimeout(refreshReceipt, 25000 + Math.floor(Math.random() * 10000));
  }
  function refreshReceipt() {
    if (!currentReceipt || $('receipt').hidden || document.hidden || busy || booting || refreshing || emailBusy) { scheduleReceipt(); return; }
    var sid = currentReceipt.sessionId, generation = viewGeneration; refreshing = true;
    request('/api/receipt?round=' + encodeURIComponent(sid), undefined, false).then(function (data) {
      if (data.receipt && generation === viewGeneration && currentReceipt && currentReceipt.sessionId === sid && !busy && !booting && !emailBusy) receipt(data.receipt);
    }).catch(function () { /* Keep the saved receipt available during Wi-Fi interruptions. */ }).then(function () { refreshing = false; scheduleReceipt(); });
  }
  function receipt(row) {
    currentReceipt = row;
    if (!pending || pending.sessionId !== row.sessionId) pending = {sessionId: row.sessionId, studentId: row.studentId, name: row.name};
    pending.receipt = row; savePending();

    $('receipt').setAttribute('data-status', row.status);
    $('receipt-mark').textContent = row.status === 'PENDING' ? '…' : row.status === 'REJECTED' ? '!' : '✓';
    $('receipt-title').textContent = row.duplicateReview ? 'Thiếu đối chiếu — trùng MSSV' : row.status === 'PENDING' ? 'Đã lưu, chờ TA đối chiếu' : row.status === 'REJECTED' ? 'TA không xác nhận điểm danh' : row.duplicateAttempt ? 'TA đã đối chiếu MSSV này' : 'Đã ghi nhận điểm danh';
    $('receipt-fields').textContent = '';
    [['Đợt', 'Đợt ' + (row.roundNumber || 1) + (row.roundLabel ? ' · ' + row.roundLabel : '')], ['MSSV', row.studentId], ['Họ tên', row.name], ['Thời gian', BPClient.time(row.at)]].forEach(function (field) {
      var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = field[0]; dd.textContent = field[1]; $('receipt-fields').appendChild(dt); $('receipt-fields').appendChild(dd);
    });
    $('attendance-form').hidden = true; $('scan-form').hidden = true; $('scan-time').textContent = ''; $('receipt').hidden = false;
    $('reload').hidden = false; $('reload').textContent = 'Kiểm tra đợt điểm danh tiếp theo';
    $('review-warning').hidden = !row.duplicateReview;
    var key = row.sessionId + ':' + (row.duplicateCount || 0);
    if (row.duplicateReview) { if (popupKey !== key || ($('duplicate-popup').hidden && !row.schoolEmail)) { popupKey = key; openReview(); } } else { hideReview(); popupKey = ''; }
    scheduleReceipt();
    notice(row.duplicateReview ? 'Bổ sung email trường và mang thẻ sinh viên xuống bàn TA. Chưa đối chiếu thì tính là thiếu xác nhận.' : row.duplicateAttempt && row.status !== 'REJECTED' ? 'Lượt gửi trùng không được tính thêm. TA đã đối chiếu hồ sơ của MSSV này.' : row.status === 'REJECTED' ? 'TA đã đối chiếu và không xác nhận. Liên hệ TA nếu cần làm rõ.' : row.status === 'PENDING' ? 'Đã lưu. TA sẽ đối chiếu thông tin tại lớp.' : row.duplicate ? 'Lượt gửi này đã được lưu trước đó.' : 'Điểm danh đã được lưu.');
  }
  function admit(input) {
    return request('/api/scan', input, true).then(function (grant) {
      viewGeneration++; currentReceipt = null; hideReview();
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
    viewGeneration++; hideReview(); booting = true; $('reload').disabled = true;
    var token = BPClient.fragment('qr'), code = BPClient.fragment('code');
    var task;
    if (token || code) {
      task = admit(token ? {token: token} : {code: code}).then(function () { clearLink(); $('connection-help').open = false; }).catch(function (error) {
        if (error.code) clearLink();
        currentReceipt = null;
        $('receipt').hidden = true; $('attendance-form').hidden = true; $('scan-form').hidden = false;
        notice(error.message || 'Chưa xác nhận được QR. Quét lại mã đang chiếu.', true); $('connection-help').open = true;
      });
    } else {
      task = request('/api/session', undefined, true).then(function (data) {
        currentReceipt = null; var previous = pending || loadPending(); session = data.session;
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
    var waitingNotice = setTimeout(function () {
      if (busy) notice('Máy đang xử lý nhiều lượt điểm danh. Giữ trang này và chờ kết quả; đừng gửi lại từ máy khác nhé.');
    }, 8000);
    Promise.resolve().then(function () {
      if (!pending) {
        if (!session) throw Error('Chưa mở điểm danh.');
        if (remaining() <= 0) { $('scan-form').hidden = false; throw Error('Quét QR hoặc nhập mã đang chiếu để tiếp tục.'); }
        pending = {sessionId: session.id, studentId: $('student-id').value.trim().toUpperCase(), name: $('full-name').value.trim().replace(/\s+/g, ' '), requestId: scanGrant.requestId || BPClient.randomId(), scanTicket: scanGrant.scanTicket};
      }
      savePending(); notice('Đang gửi điểm danh…');
      return request('/api/check-in', pending, false);
    }).then(function (result) { pending.receipt = result.receipt; delete pending.location; savePending(); receipt(result.receipt); }).catch(function (error) {
      if (error.code === 'DUPLICATE_REVIEW' && error.receipt) { receipt(error.receipt); }
      else if (['INPUT_INVALID', 'ID_INVALID', 'REQUEST_INVALID', 'ALREADY_RECORDED'].indexOf(error.code) !== -1) { pending = null; savePending(); notice(error.message, true); }
      else if (error.code) {
        if (['SCAN_REQUIRED', 'SCAN_INVALID', 'SCAN_EXPIRED', 'DEVICE_CHANGED', 'COOKIES_REQUIRED'].indexOf(error.code) !== -1) { $('scan-form').hidden = false; scanGrant = null; saveGrant(); }
        if (error.code === 'DEVICE_RECORDED') { $('attendance-form').hidden = true; $('scan-form').hidden = true; }
        notice(error.message, true);
      } else notice(pending ? 'Chưa xác nhận được kết quả. Giữ trang này và bấm gửi lại; hệ thống sẽ kiểm tra lượt gửi trước.' : error.message, true);
    }).then(function () { clearTimeout(waitingNotice); busy = false; $('submit').disabled = false; });
  });
  $('scan-form').addEventListener('submit', function (event) {
    event.preventDefault(); if (busy || booting) return; booting = true; $('scan-submit').disabled = true;
    admit({code: $('room-code').value}).catch(function (error) { notice(error.message || 'Chưa xác nhận được mã. Kiểm tra Wi-Fi rồi thử lại.', true); }).then(function () { booting = false; $('scan-submit').disabled = false; });
  });
  $('review-open').addEventListener('click', openReview);
  $('review-ack').addEventListener('click', function () { hideReview(); $('review-open').focus(); });
  $('review-email-form').addEventListener('submit', function (event) {
    event.preventDefault(); if (emailBusy || !currentReceipt || !currentReceipt.duplicateReview) return;
    emailBusy = true; $('save-email').disabled = true; $('review-email-status').textContent = 'Đang lưu email…';
    var sid = currentReceipt.sessionId;
    request('/api/review-email', {sessionId: sid, email: $('school-email').value}, false).then(function (data) {
      if (currentReceipt && currentReceipt.sessionId === sid) { receipt(data.receipt); emailBusy = false; openReview(); }
    }).catch(function (error) { $('review-email-status').textContent = error.message || 'Chưa xác nhận được email đã lưu. Giữ trang và bấm lưu lại.'; }).then(function () { emailBusy = false; $('save-email').disabled = false; });
  });
  $('duplicate-popup').addEventListener('keydown', function (event) {
    if (event.key !== 'Tab' && event.keyCode !== 9) return;
    var first = $('review-email-form').hidden ? $('review-ack') : $('school-email');
    var last = $('review-email-form').hidden ? $('review-ack') : $('save-email');
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('duplicate-popup').querySelector('.review-panel'))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshReceipt(); });
  $('reload').addEventListener('click', boot); window.addEventListener('hashchange', boot);
  window.addEventListener('online', function () { if (!pending && $('receipt').hidden && !document.hidden) boot(); });
  setInterval(scanClock, 1000); boot();
}());
