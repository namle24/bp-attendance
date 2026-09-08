/* Pure attendance rules used by the web store and unit tests. */
var BP = (function () {
  'use strict';
  function str(v) { return String(v == null ? '' : v).trim(); }
  function id(v) { return str(v).toUpperCase(); }
  function email(v) { return str(v).toLowerCase(); }
  function date(v) {
    var s = str(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) ||
        new Date(s).toISOString().slice(0, 10) !== s) throw new Error('Ngày phải là YYYY-MM-DD hợp lệ.');
    return s;
  }
  function roster(rows) {
    var ids = Object.create(null), emails = Object.create(null);
    var students = rows.filter(function (r) { return r.some(function (v) { return str(v); }); }).map(function (r) {
      var s = { id: id(r[0]), name: str(r[1]), email: email(r[2]) };
      if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(s.id) || !s.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) {
        throw new Error('Danh sách lớp: cần MSSV, họ tên và email trường hợp lệ cho mỗi dòng.');
      }
      if (ids[s.id]) throw new Error('MSSV trùng trong danh sách: ' + s.id);
      if (emails[s.email]) throw new Error('Email trùng trong danh sách: ' + s.email);
      ids[s.id] = s; emails[s.email] = s;
      return s;
    });
    if (!students.length) throw new Error('Hãy nhập danh sách MSSV – họ tên – email trường vào BP_Roster.');
    return { students: students, ids: ids, emails: emails };
  }
  // Timestamps are server timestamps, never browser timestamps.
  function assess(response, session, list, seen) {
    var studentId = id(response.studentId), account = email(response.email);
    var time = Date.parse(response.timestamp), start = Date.parse(session.openedAt), end = Date.parse(session.closesAt);
    if (session.state === 'DRAFT' || !Number.isFinite(start) || !Number.isFinite(end) ||
        !Number.isFinite(time) || time < start || time > end) return 'OUTSIDE_WINDOW';
    if (str(response.code).toUpperCase() !== str(session.code).toUpperCase()) return 'WRONG_CODE';
    if (!list.ids[studentId]) return 'UNKNOWN_STUDENT';
    if (list.ids[studentId].email !== account) return 'EMAIL_MISMATCH';
    var key = session.id + '|' + studentId;
    if (seen.has(key)) return 'DUPLICATE';
    seen.add(key);
    return 'ACCEPTED';
  }
  function matrix(list, sessions, logs, overrides) {
    var dates = Array.from(new Set(sessions.filter(function (s) { return s.state !== 'DRAFT'; })
      .map(function (s) { return date(s.date); }))).sort();
    var present = Object.create(null), corrected = Object.create(null);
    logs.forEach(function (l) {
      if (l.result !== 'ACCEPTED') return;
      var key = l.date + '|' + id(l.studentId);
      if (!present[key]) present[key] = new Set();
      present[key].add(l.mode);
    });
    overrides.forEach(function (o) {
      if (!list.ids[id(o.studentId)]) throw new Error('Điều chỉnh có MSSV ngoài lớp: ' + o.studentId);
      if (dates.indexOf(date(o.date)) < 0) throw new Error('Điều chỉnh chưa có buổi học: ' + o.date);
      if (['OFF', 'ON', 'BOTH', 'V', 'EXCUSED'].indexOf(o.mark) < 0 || !str(o.reason)) {
        throw new Error('Điều chỉnh cần ký hiệu OFF/ON/BOTH/V/EXCUSED và lý do.');
      }
      corrected[o.date + '|' + id(o.studentId)] = o.mark;
    });
    return [['MSSV', 'Họ tên', 'Email trường'].concat(dates)].concat(list.students.map(function (s) {
      return [s.id, s.name, s.email].concat(dates.map(function (d) {
        var key = d + '|' + s.id, p = present[key];
        if (corrected[key]) return corrected[key];
        if (!p) return ''; // Unrecorded does NOT automatically mean absent.
        return p.has('OFFLINE') && p.has('ONLINE') ? 'BOTH' : (p.has('OFFLINE') ? 'OFF' : 'ON');
      }));
    }));
  }
  // A reviewed list of exact IDs, optionally "MSSV - Họ tên". No fuzzy matching.
  function parseOnline(text, list) {
    var seen = new Set(), accepted = [], invalid = [];
    str(text).split(/\r?\n/).filter(function (line) { return str(line); }).forEach(function (line, i) {
      var studentId = id(str(line).split(/\s+-\s+|\t/)[0]);
      if (!list.ids[studentId]) invalid.push({ line: i + 1, value: line });
      else if (!seen.has(studentId)) { seen.add(studentId); accepted.push(studentId); }
    });
    return { accepted: accepted, invalid: invalid };
  }
  function safeCell(value) {
    var s = String(value == null ? '' : value);
    return /^[\s\uFEFF]*[=+@-]/.test(s) ? "'" + s : s;
  }
  return { str: str, id: id, email: email, date: date, roster: roster, assess: assess,
    matrix: matrix, parseOnline: parseOnline, safeCell: safeCell };
})();
if (typeof module !== 'undefined') module.exports = BP;
