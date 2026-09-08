# Chuẩn bị ở nhà, thử tại trường

Luồng hiện tại là **LAN + nhập MSSV, họ tên, ghế + đối chiếu trùng IP**. Không cần cấu hình tài khoản Google cho sinh viên hoặc QR động.

## Ở nhà

```bash
cd ~/Projects/bp-attendance
npm ci
npm run laptop:setup
npm run host:install
npm run host:check
```

Chuẩn bị service, dependencies và database thật trống. Setup không đưa sinh viên hoặc buổi học thử vào database lớp. Có thể chạy `npm test` để kiểm thử bằng database tạm và `npm run bench:web` để đo tải trên máy.

Nếu muốn thử điện thoại tại nhà, chạy `npm run campus:test`, quét QR kiểm tra trên điện thoại cùng Wi-Fi. Đây là endpoint thử kết nối, không ghi điểm danh, tự đóng sau 5 phút. Kết quả ở nhà không chứng minh Wi-Fi USTH cũng cho truy cập.

Muốn xem app trước: `npm run host:start`, mở trang TA và trang sinh viên; khi chưa bấm mở phiên sẽ không có điểm danh. Sau đó `npm run host:stop`. Không dùng MSSV thử trong database lớp. Ảnh thao tác nằm trong [hướng dẫn TA](TA-GUIDE.vi.md).

Có thể chuẩn bị Google Sheet và service account theo [hướng dẫn](WEB-SETUP.vi.md). Thiếu cấu hình này không chặn ghi điểm danh tại laptop.

## Khi đến trường

1. Laptop và ít nhất hai thiết bị thử kết nối USTH_CONNECT, hoàn tất captive portal.
2. Chạy `npm run campus:test`, cho hai thiết bị mở URL/QR. Nếu không vào được, xử lý client isolation/firewall/VLAN với IT trước. Lệnh thử dùng cổng 4188; app thật dùng 4180, cần thử cả app thật sau đó.
3. Bật app bằng `npm run host:start`. Mở trang TA trên laptop và link sinh viên trên điện thoại/máy tính. Xác nhận link không dùng IP cũ ở nhà.
4. **Thử gửi bằng database riêng** trước khi phục vụ lớp, xem hướng dẫn bên dưới. Kiểm tra IP của hai thiết bị có khác nhau không và xem cờ đỏ/ghi chú được đồng bộ sang Sheet thử nếu đã cấu hình.
5. Dừng bản thử, bật lại service với database lớp. Kiểm tra bảng TA trống hoặc đúng dữ liệu lớp, đúng ngày, đúng link rồi mới mở QR.

Thử server bằng database riêng, không làm mất lượt mở phiên trong database lớp:

```bash
npm run host:stop
BP_DATABASE=./data/campus-check.sqlite GOOGLE_SHEET_ID= npm start
```

Lệnh dùng cùng app thật nhưng file riêng, tắt đồng bộ Sheet cho dữ liệu thử. Dùng Ctrl+C để dừng. Sau đó `npm run host:start` quay về database lớp trong `.env`. Không sao chép dữ liệu thử vào lớp; không dùng chung tab Sheet cho hai database.

Nếu muốn kiểm tra ghi/màu trên **Sheet thử**, đặt `GOOGLE_SHEET_ID` bằng ID một file Sheet riêng trong lệnh thử, sau khi đã cấu hình service account. Không chạy thử trên Sheet tổng của lớp.

Thử mạng trường là việc còn phải làm tại trường. Từ laptop không thể suy ra SSID của người gửi, khả năng truy cập giữa thiết bị hoặc độ ổn định của Wi-Fi khi đông người.
