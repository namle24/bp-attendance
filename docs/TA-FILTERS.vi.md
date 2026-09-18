# Điểm danh thông thường và bộ lọc TA

Sinh viên quét QR hoặc nhập mã đang chiếu, điền **MSSV, họ tên, ghế ngồi** rồi gửi. Mặc định không xin quyền vị trí và không mở trang HTTPS. Không cần GPS để dùng luồng thông thường.

## Vị trí là tùy chọn của TA

Trong **Kiểm tra vị trí lớp · Tùy chọn**, TA bật đối chiếu, đặt tâm/bán kính và bấm lưu trước khi mở đợt mới. Khi đó sinh viên mới thấy nút **Lấy vị trí**, mở tab HTTPS để xin quyền. Muốn dùng luồng thông thường, đóng đợt đang mở, bỏ chọn đối chiếu vị trí, lưu rồi mở đợt mới.

Dòng trạng thái cạnh điều khiển phiên cho biết **đợt đang xem** có kiểm tra vị trí hay không. Mở lại đợt giữ nguyên thiết lập và kết quả của đợt đó. App nhắc lưu nếu TA đã thay đổi tùy chọn vị trí trước khi bấm mở đợt mới. Xem [hướng dẫn vị trí](LOCATION-CHECK.vi.md).

## Lọc và xuất danh sách

Cả ba màn **Điểm danh tại lớp**, **Lịch sử & xuất dữ liệu**, **Cần xử lý** có:

- Tìm MSSV, họ tên, ghế hoặc IP. Tìm tên có hoặc không có dấu đều được; nhiều từ khóa phải cùng khớp một bản ghi.
- Trạng thái ghi nhận hoặc quyết định TA. Màn Cần xử lý chỉ gồm đang chờ và TA không xác nhận.
- IP trùng / không trùng trong cùng đợt.
- Vị trí: không kiểm tra, trong phạm vi, ngoài phạm vi hoặc chưa xác minh được. Mục cuối gồm sai số lớn, thiếu vị trí, lỗi quyền, quá hạn và lỗi thiết bị.
- Ngày/đợt: chọn đợt trên màn điểm danh; chọn ngày và đợt trong lịch sử hoặc danh sách cần xử lý.

Bấm **Xóa bộ lọc** để bỏ tìm kiếm và các tiêu chí trong màn đang xem; ngày đang chọn được giữ nguyên. App giữ bộ lọc trong lúc tự cập nhật danh sách.

**CSV danh sách đang lọc**, **CSV chi tiết offline** và **CSV cần xử lý** áp dụng đúng các tiêu chí đang chọn. **Bảng tổng CSV** giữ toàn bộ kết quả của ngày đã chọn, gồm online đã bổ sung, để TA xem đủ số đợt đã tham gia.

![Lọc danh sách TA](ta-filters.png)

Ảnh dùng dữ liệu kiểm thử. Lọc riêng một sinh viên vẫn hiển thị số MSSV dùng chung IP của cả đợt.

## Cơ chế chống gửi trùng

- Một MSSV chỉ có một bản ghi trong một đợt, kể cả đổi trình duyệt, mở tab mới hoặc quét lại QR.
- Gửi lại sau mất phản hồi lấy lại biên nhận đã lưu; không tạo thêm dòng.
- Mở lại đợt giữ nguyên quy tắc chống trùng. Mở đợt mới trong cùng buổi cho phép gửi thêm một lượt vào đợt mới.
- Nhiều MSSV dùng chung IP trong cùng đợt được đánh dấu đỏ để TA xác minh. Bộ lọc không làm thay đổi nhóm IP hay quyết định của TA. Trùng IP không tự chứng minh gian lận vì nhiều người có thể dùng chung đường mạng.

## Phạm vi tương thích

Luồng sinh viên được kiểm tra trên Chromium, Firefox và WebKit qua HTTP LAN, với GPS không khả dụng, script vị trí không tải được, storage bị chặn và mất phản hồi sau khi máy chủ đã lưu. Những kiểm tra này dùng dữ liệu riêng, không thay cho thử thiết bị thật hoặc mạng trường. Wi-Fi cần cho phép điện thoại truy cập laptop; bộ lọc hay tùy chọn GPS không thay đổi điều kiện mạng đó.
