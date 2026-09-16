(function () {
  'use strict';
  function byId(id) { return document.getElementById(id); }
  function notice(text, error) { byId('lookup-notice').textContent = text; byId('lookup-notice').className = error ? 'notice error' : 'notice'; }
  byId('lookup-form').addEventListener('submit', function (event) {
    event.preventDefault();
    if (byId('lookup-submit').disabled) return;
    byId('lookup-submit').disabled = true; byId('lookup-result').hidden = true;
    notice('Đang tra cứu…', false);
    BPClient.request('/api/student-history', {studentId: byId('lookup-id').value.trim()}).then(function (result) {
      byId('lookup-title').textContent = 'MSSV ' + result.studentId;
      byId('lookup-count').textContent = result.days.length + ' ngày học';
      byId('lookup-updated').textContent = 'Lần đọc Google Sheet: ' + BPClient.time(result.updatedAt) + ' (giờ Việt Nam).';
      var rows = byId('lookup-rows'); rows.textContent = '';
      result.days.forEach(function (day) {
        var tr = document.createElement('tr'), date = document.createElement('td'), mark = document.createElement('td');
        date.textContent = day.date.split('-').reverse().join('/'); mark.textContent = day.result || 'Chưa có kết quả';
        if (!day.result) mark.className = 'muted'; tr.appendChild(date); tr.appendChild(mark); rows.appendChild(tr);
      });
      byId('lookup-result').hidden = false;
      if (result.stale) notice('Chưa lấy được bản cập nhật mới từ Sheet. Đây là dữ liệu ở thời điểm ghi bên dưới; hãy thử lại sau hoặc báo TA.', true);
      else notice(result.found ? 'Đã tìm thấy kết quả trên bảng của TA.' : 'Chưa tìm thấy MSSV trong bản Sheet đã tải. Kiểm tra lại MSSV hoặc báo TA; chưa kết luận vắng.', false);
    }).catch(function (error) { notice(error.message || 'Chưa tra cứu được. Kiểm tra Wi-Fi và thử lại.', true); }).then(function () { byId('lookup-submit').disabled = false; });
  });
}());
