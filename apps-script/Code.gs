/* Spreadsheet-bound script. No public web app and no per-student trigger. */
var BP_TZ = 'Asia/Ho_Chi_Minh';
var BP_HEADERS = {
  BP_Roster: ['MSSV', 'Họ tên', 'Email trường'],
  BP_Sessions: ['id', 'date', 'state', 'formId', 'url', 'editUrl', 'code', 'studentItemId', 'codeItemId', 'openedAt', 'closesAt', 'lastSyncAt', 'accepted', 'rejected'],
  BP_Log: ['responseId', 'sessionId', 'date', 'mode', 'timestamp', 'studentId', 'email', 'result', 'actor', 'note', 'syncedAt'],
  BP_Overrides: ['date', 'studentId', 'mark', 'reason', 'actor', 'timestamp'],
  BP_Attendance: ['MSSV', 'Họ tên', 'Email trường']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('BP Điểm danh')
    .addItem('1. Khởi tạo các tab', 'setupAttendance')
    .addItem('2. Bảng điều khiển', 'showPanel')
    .addItem('3. Cài đồng bộ tự động (chủ file)', 'installAutomation')
    .addItem('Đồng bộ lại toàn bộ', 'resyncAll')
    .addToUi();
}

function book_() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Mở công cụ từ Google Sheet đã gắn script.');
  return book;
}
function locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) throw new Error('Đang có một lần đồng bộ/thao tác khác. Vui lòng thử lại sau vài giây.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function table_(name) {
  var sheet = book_().getSheetByName(name);
  if (!sheet) throw new Error('Chưa khởi tạo công cụ: thiếu tab ' + name);
  var expected = BP_HEADERS[name];
  var headers = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(expected)) throw new Error('Không sửa tiêu đề tab ' + name);
  return sheet;
}
function grid_(name) {
  var sheet = table_(name), count = sheet.getLastRow() - 1;
  return count > 0 ? sheet.getRange(2, 1, count, BP_HEADERS[name].length).getDisplayValues() : [];
}
function objects_(name) {
  var headers = BP_HEADERS[name];
  return grid_(name).map(function (row, i) {
      var obj = { _row: i + 2 };
      headers.forEach(function (key, j) { obj[key] = row[j]; });
      return obj;
    }).filter(function (obj) { return headers.some(function (key) { return BP.str(obj[key]); }); });
}
function cells_(obj, headers) { return headers.map(function (key) { return BP.safeCell(obj[key]); }); }
function grow_(sheet, rows, columns) {
  if (rows > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  if (columns > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
}
function append_(name, items) {
  if (!items.length) return;
  var sheet = table_(name), row = sheet.getLastRow() + 1, width = BP_HEADERS[name].length;
  grow_(sheet, row + items.length - 1, width);
  sheet.getRange(row, 1, items.length, width).setNumberFormat('@')
    .setValues(items.map(function (o) { return cells_(o, BP_HEADERS[name]); }));
}
function saveSession_(s) {
  table_('BP_Sessions').getRange(s._row, 1, 1, BP_HEADERS.BP_Sessions.length)
    .setNumberFormat('@').setValues([cells_(s, BP_HEADERS.BP_Sessions)]);
  SpreadsheetApp.flush();
}
function session_(id) {
  var found = objects_('BP_Sessions').filter(function (s) { return s.id === id; });
  if (found.length !== 1) throw new Error('Không tìm thấy phiên duy nhất: ' + id);
  return found[0];
}
function list_() { return BP.roster(grid_('BP_Roster')); }
function now_() { return new Date().toISOString(); }
function today_() { return Utilities.formatDate(new Date(), BP_TZ, 'yyyy-MM-dd'); }
function actor_() { return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'sheet-editor'; }
function property_(key, value) {
  var props = PropertiesService.getScriptProperties();
  if (value !== undefined) props.setProperty(key, String(value));
  return props.getProperty(key);
}

function setupAttendance() {
  return locked_(function () {
    var book = book_();
    // Preflight all collisions before creating anything.
    Object.keys(BP_HEADERS).forEach(function (name) {
      var sheet = book.getSheetByName(name);
      if (sheet && sheet.getLastRow() > 0) table_(name);
    });
    Object.keys(BP_HEADERS).forEach(function (name) {
      var sheet = book.getSheetByName(name) || book.insertSheet(name);
      if (!sheet.getLastRow()) {
        sheet.getRange(1, 1, 1, BP_HEADERS[name].length).setValues([BP_HEADERS[name]])
          .setBackground('#133e35').setFontColor('#ffffff').setFontWeight('bold');
        sheet.setFrozenRows(1);
        sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), BP_HEADERS[name].length).setNumberFormat('@');
      }
    });
    book.toast('Đã tạo tab. Nhập danh sách thật vào BP_Roster rồi mở bảng điều khiển.', 'BP Điểm danh');
    return { message: 'Đã khởi tạo. Nhập BP_Roster trước khi tạo phiên.' };
  });
}

function showPanel() {
  var html = HtmlService.createTemplateFromFile('Panel').evaluate().setWidth(1000).setHeight(780);
  SpreadsheetApp.getUi().showModelessDialog(html, 'BP · Điểm danh');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function getDashboard() {
  var sessions = objects_('BP_Sessions');
  return {
    today: today_(), students: grid_('BP_Roster').filter(function (r) { return BP.str(r[0]); }).length,
    sessions: sessions.reverse(),
    automation: property_('BP_AUTOMATION_OWNER') || '',
    lastSync: property_('BP_LAST_SYNC') || '', error: property_('BP_LAST_ERROR') || ''
  };
}

// Verified is checked through Forms API: setCollectEmail(true) alone is insufficient evidence.
function formsApi_(formId, method, body) {
  var endpoint = 'https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId);
  if (method === 'post') endpoint += ':batchUpdate';
  var options = { method: method, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  var response = UrlFetchApp.fetch(endpoint, options), status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Google Forms API trả mã ' + status + '. Kiểm tra đã bật Forms API trong Cloud project gắn với Apps Script và cấp quyền forms.body; xem docs/SETUP.md.');
  }
  return JSON.parse(response.getContentText());
}
function verifyEmailMode_(formId) {
  var settings = formsApi_(formId, 'get').settings || {};
  if (settings.emailCollectionType !== 'VERIFIED') {
    throw new Error('Form không ở chế độ email VERIFIED. Đã dừng ghi nhận; kiểm tra Settings → Responses.');
  }
}

function createOfflineSession(date) {
  return locked_(function () {
    date = BP.date(date); list_();
    var id = date + '|OFFLINE';
    if (objects_('BP_Sessions').some(function (s) { return s.id === id; })) {
      throw new Error('Ngày này đã có phiên offline. Chọn phiên hiện có.');
    }
    var form = FormApp.create('BP · Điểm danh offline · ' + date);
    form.setAcceptingResponses(false);
    if (form.supportsAdvancedResponderPermissions()) form.setPublished(false);
    try {
      form.setDescription('Đăng nhập email trường khớp với MSSV trong danh sách lớp. Chỉ gửi khi đang ở phòng học. Nếu sai tài khoản hoặc gặp lỗi, báo trợ giảng trước khi đóng phiên.')
        .setCollectEmail(true).setLimitOneResponsePerUser(false).setAllowResponseEdits(false)
        .setPublishingSummary(false).setShowLinkToRespondAgain(false)
        .setConfirmationMessage('Đã lưu câu trả lời. Điểm danh chỉ hợp lệ nếu email trường khớp MSSV, mã buổi đúng và gửi trong giờ mở phiên. Nếu nhập sai, gửi lại trong thời gian mở hoặc báo trợ giảng.')
        .setCustomClosedFormMessage('Phiên chưa mở hoặc đã hết giờ. Vui lòng gặp trợ giảng để xử lý trường hợp đặc biệt.');
      var mssv = form.addTextItem().setTitle('MSSV').setRequired(true)
        .setHelpText('Mã số sinh viên đúng như danh sách lớp; không nhập họ tên vào ô này.');
      var codeItem = form.addTextItem().setTitle('Mã buổi học').setRequired(true)
        .setHelpText('Nhập mã trợ giảng đang chiếu tại phòng học.');
      // Do not publish until this succeeds. No domain is guessed: exact roster email is authoritative.
      formsApi_(form.getId(), 'post', { requests: [{ updateSettings: {
        settings: { emailCollectionType: 'VERIFIED' }, updateMask: 'emailCollectionType'
      } }] });
      verifyEmailMode_(form.getId());
      var code = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
      codeItem.setValidation(FormApp.createTextValidation().requireTextMatchesPattern('(?i)^\\s*' + code + '\\s*$')
        .setHelpText('Mã chưa đúng. Xem mã đang chiếu trong phòng học.').build());
      var entry = { id: id, date: date, state: 'DRAFT', formId: form.getId(), url: form.getPublishedUrl(),
        editUrl: form.getEditUrl(), code: code, studentItemId: String(mssv.getId()), codeItemId: String(codeItem.getId()),
        openedAt: '', closesAt: '', lastSyncAt: '', accepted: '0', rejected: '0' };
      append_('BP_Sessions', [entry]);
      return getDashboard();
    } catch (error) {
      form.setAcceptingResponses(false);
      throw new Error(error.message + ' Form nháp được giữ tại ' + form.getEditUrl());
    }
  });
}

function installAutomation() {
  return locked_(function () {
    table_('BP_Sessions');
    var owner = actor_(), previous = property_('BP_AUTOMATION_OWNER');
    if (previous && previous !== owner) throw new Error('Tự động hóa đã được cài bởi ' + previous + '. Dùng tài khoản đó để quản lý trigger.');
    var existing = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'syncTick'; });
    if (!existing.length) ScriptApp.newTrigger('syncTick').timeBased().everyMinutes(1).create();
    property_('BP_AUTOMATION_OWNER', owner);
    return { message: 'Đã cài đồng bộ mỗi phút; không cần giữ máy tính mở.' };
  });
}
function pollUntil_(iso) {
  var end = Date.parse(iso) + 15 * 60000;
  property_('BP_POLL_UNTIL', Math.max(Number(property_('BP_POLL_UNTIL') || 0), end));
}
function openOfflineSession(id, minutes) {
  return locked_(function () {
    list_();
    var s = session_(id), duration = Number(minutes);
    if (s.state !== 'DRAFT') throw new Error('Chỉ mở phiên nháp. Phiên đã đóng không được mở lại để tránh đổi mốc thời gian.');
    if (s.date !== today_()) throw new Error('Chỉ mở phiên có ngày hôm nay theo giờ Việt Nam.');
    if (!Number.isInteger(duration) || duration < 2 || duration > 30) throw new Error('Chọn thời gian từ 2 đến 30 phút.');
    if (!property_('BP_AUTOMATION_OWNER')) throw new Error('Chủ file cần cài đồng bộ tự động từ menu trước.');
    verifyEmailMode_(s.formId);
    var form = FormApp.openById(s.formId);
    // Publishing may change acceptingResponses; close it immediately before recording the window.
    if (form.supportsAdvancedResponderPermissions()) form.setPublished(true);
    form.setAcceptingResponses(false);
    s.openedAt = now_(); s.closesAt = new Date(Date.now() + duration * 60000).toISOString(); s.state = 'OPEN';
    saveSession_(s); pollUntil_(s.closesAt);
    try { form.setAcceptingResponses(true); }
    catch (error) {
      s.state = 'CLOSED'; s.closesAt = now_(); saveSession_(s);
      throw new Error('Không mở được Form. Kiểm tra quyền Responders trong Forms; phiên đã đóng an toàn. ' + error.message);
    }
    rebuild_();
    return getDashboard();
  });
}
function closeOfflineSession(id) {
  return locked_(function () {
    var s = session_(id);
    if (s.state !== 'OPEN' && s.state !== 'CLOSED') throw new Error('Phiên chưa mở.');
    // Commit cutoff first; a network failure cannot cause later responses to become valid.
    if (s.state === 'OPEN') {
      s.closesAt = new Date(Math.min(Date.now(), Date.parse(s.closesAt))).toISOString();
      s.state = 'CLOSED'; saveSession_(s); pollUntil_(s.closesAt);
    }
    FormApp.openById(s.formId).setAcceptingResponses(false);
    syncSession_(s, list_()); rebuild_();
    return getDashboard();
  });
}

function syncSession_(s, list) {
  var form = FormApp.openById(s.formId);
  if (s.state === 'OPEN' && Date.now() >= Date.parse(s.closesAt)) {
    s.state = 'CLOSED'; saveSession_(s);
  }
  if (s.state === 'CLOSED') form.setAcceptingResponses(false);
  verifyEmailMode_(s.formId);
  if (form.canEditResponse()) throw new Error('Hãy tắt sửa câu trả lời của Form trước khi đồng bộ.');
  var logs = objects_('BP_Log'), known = new Set(logs.map(function (l) { return l.responseId; }));
  var seen = new Set(logs.filter(function (l) { return l.result === 'ACCEPTED'; })
    .map(function (l) { return l.sessionId + '|' + BP.id(l.studentId); }));
  var added = [];
  form.getResponses().sort(function (a, b) { return a.getTimestamp() - b.getTimestamp(); }).forEach(function (r) {
    var key = s.formId + ':' + r.getId();
    if (known.has(key)) return;
    var answers = Object.create(null);
    r.getItemResponses().forEach(function (item) { answers[String(item.getItem().getId())] = item.getResponse(); });
    var response = { studentId: BP.id(answers[s.studentItemId]), email: BP.email(r.getRespondentEmail()),
      code: answers[s.codeItemId], timestamp: r.getTimestamp().toISOString() };
    var result = BP.assess(response, s, list, seen);
    added.push({ responseId: key, sessionId: s.id, date: s.date, mode: 'OFFLINE', timestamp: response.timestamp,
      studentId: response.studentId, email: response.email, result: result, actor: 'google-forms',
      note: '', syncedAt: now_() });
    known.add(key);
  });
  // Durable log first. A failed matrix write can be rebuilt without losing responses.
  append_('BP_Log', added);
  var all = logs.concat(added).filter(function (l) { return l.sessionId === s.id; });
  s.accepted = all.filter(function (l) { return l.result === 'ACCEPTED'; }).length;
  s.rejected = all.length - s.accepted; s.lastSyncAt = now_(); saveSession_(s);
}
function rebuild_() {
  var values = BP.matrix(list_(), objects_('BP_Sessions'), objects_('BP_Log'), objects_('BP_Overrides'));
  var sheet = table_('BP_Attendance');
  var oldRows = sheet.getLastRow(), oldColumns = sheet.getLastColumn();
  grow_(sheet, values.length, values[0].length);
  sheet.getRange(1, 1, values.length, values[0].length).setNumberFormat('@')
    .setValues(values.map(function (r) { return r.map(BP.safeCell); }));
  // Only this dedicated, generated tab is trimmed. Inputs and log are never cleared.
  if (oldRows > values.length) sheet.getRange(values.length + 1, 1, oldRows - values.length, oldColumns).clearContent();
  if (oldColumns > values[0].length) sheet.getRange(1, values[0].length + 1, Math.max(oldRows, values.length), oldColumns - values[0].length).clearContent();
  sheet.getRange(1, 1, 1, values[0].length).setBackground('#133e35').setFontColor('white').setFontWeight('bold');
  sheet.setFrozenRows(1); sheet.setFrozenColumns(2);
}
function runSync_(all) {
  return locked_(function () {
    var list = list_(), errors = [];
    var sessions = objects_('BP_Sessions').filter(function (s) {
      return s.formId && s.state !== 'DRAFT' && (all || s.state === 'OPEN' || Date.now() <= Date.parse(s.closesAt) + 15 * 60000);
    });
    sessions.forEach(function (s) {
      try { syncSession_(s, list); } catch (e) { errors.push(s.id + ': ' + e.message); }
    });
    rebuild_();
    property_('BP_LAST_SYNC', now_()); property_('BP_LAST_ERROR', errors.join('\n'));
    if (errors.length) throw new Error(errors.join('\n'));
    return getDashboard();
  });
}
function syncTick() {
  if (Date.now() > Number(property_('BP_POLL_UNTIL') || 0)) return;
  try { runSync_(false); } catch (e) { property_('BP_LAST_ERROR', e.message); throw e; }
}
function syncNow() { return runSync_(false); }
function resyncAll() { return runSync_(true); }

function previewOnline(text) { return BP.parseOnline(text, list_()); }
function importOnline(date, text, evidence) {
  return locked_(function () {
    date = BP.date(date);
    if (date > today_()) throw new Error('Không nhập điểm danh cho ngày tương lai.');
    if (!BP.str(evidence)) throw new Error('Ghi nguồn và cách đã đối chiếu danh sách online.');
    var list = list_(), parsed = BP.parseOnline(text, list);
    if (parsed.invalid.length) throw new Error('Có MSSV không khớp danh sách. Sửa toàn bộ dòng báo lỗi rồi nhập lại.');
    if (!parsed.accepted.length) throw new Error('Danh sách online trống.');
    var sid = date + '|ONLINE', sessions = objects_('BP_Sessions');
    if (!sessions.some(function (s) { return s.id === sid; })) {
      append_('BP_Sessions', [{ id: sid, date: date, state: 'CLOSED', openedAt: now_(), closesAt: now_(), accepted: '0', rejected: '0' }]);
    }
    var existing = new Set(objects_('BP_Log').filter(function (l) { return l.sessionId === sid && l.result === 'ACCEPTED'; })
      .map(function (l) { return BP.id(l.studentId); }));
    var added = parsed.accepted.filter(function (id) { return !existing.has(id); }).map(function (id) {
      return { responseId: 'online:' + date + ':' + id, sessionId: sid, date: date, mode: 'ONLINE',
        timestamp: now_(), studentId: id, email: '', result: 'ACCEPTED', actor: actor_(),
        note: 'TA_REVIEWED: ' + BP.str(evidence), syncedAt: now_() };
    });
    append_('BP_Log', added);
    var s = session_(sid); s.accepted = existing.size + added.length; s.lastSyncAt = now_(); saveSession_(s);
    rebuild_(); return { message: 'Đã thêm ' + added.length + ' sinh viên online; đã bỏ qua dòng trùng.' };
  });
}
function addOverride(date, studentId, mark, reason) {
  return locked_(function () {
    var entry = { date: BP.date(date), studentId: BP.id(studentId), mark: BP.str(mark), reason: BP.str(reason),
      actor: actor_(), timestamp: now_() };
    // Validate before adding; history remains append-only and the latest correction wins.
    BP.matrix(list_(), objects_('BP_Sessions'), objects_('BP_Log'), objects_('BP_Overrides').concat([entry]));
    append_('BP_Overrides', [entry]); rebuild_();
    return { message: 'Đã lưu điều chỉnh kèm người sửa, thời gian và lý do.' };
  });
}
