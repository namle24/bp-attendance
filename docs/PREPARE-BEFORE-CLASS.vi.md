# Chuẩn bị trước buổi học

Luồng hiện tại: **Windows/macOS/Linux → tự nhận mạng → QR đổi mỗi 30 giây → MSSV, họ tên, ghế → đối chiếu trùng IP**.

## Chuẩn bị trước

1. Cài Node.js 24 trở lên, tải/clone repo.
2. Chạy `npm start` một lần khi có Internet. App tự cài thư viện, tạo dữ liệu và mở trang TA.
3. Nếu hiện màn chọn mạng, chọn Wi-Fi đang dùng. Xem trang TA trước; chưa bấm **Mở QR điểm danh** thì chưa mở phiên hoặc tạo điểm danh thử.
4. Thử điện thoại mở link IP Wi-Fi cổng 4180, rồi Ctrl+C dừng app.

Tại trường cũng dùng đúng `npm start`; không cần cấu hình Google đăng nhập sinh viên. Sheets là tùy chọn theo [hướng dẫn](WEB-SETUP.vi.md). Giữ máy thức, cắm sạc và giữ cửa sổ chạy app mở trong giờ học.

## Tại trường

- Laptop và ít nhất hai thiết bị thử kết nối USTH_CONNECT, hoàn tất captive portal.
- Chạy app, thử link từ điện thoại. Nếu không vào được, xử lý firewall/client isolation/VLAN với IT. Kết quả trên Wi-Fi ở nhà không chứng minh mạng trường cũng cho truy cập.
- Nếu thử gửi, dùng database riêng bên dưới. Kiểm tra QR/mã hết hạn, biên nhận, IP hai thiết bị và cờ trùng IP.
- Dừng bản thử, mở lại với database lớp. Kiểm tra đúng ngày và dữ liệu lớp trước khi mở phiên.

## Thử gửi bằng database riêng

Windows: dùng [CMD/PowerShell trong hướng dẫn Windows](WINDOWS.vi.md#thử-gửi-với-database-riêng).

macOS/Linux: dừng app rồi chạy trong Terminal:

```bash
BP_DATABASE=./data/campus-check.sqlite GOOGLE_SHEET_ID= npm start
```

Dùng Ctrl+C để dừng. Sau đó `npm start` trở về database lớp. Dữ liệu thử không đồng bộ Sheet. Không sao chép dữ liệu thử vào lớp, không xóa database lớp để mở phiên lại.

Giữ database qua các tuần, xuất riêng từng ngày hoặc toàn bộ trên trang **Lịch sử & xuất dữ liệu**. Các dòng cần đối chiếu nằm ở màn **Cần xử lý**. Xem [hướng dẫn TA](TA-GUIDE.vi.md).
