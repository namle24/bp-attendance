# Kết quả kiểm tra cục bộ · 08/09/2026

Đã chạy 17 kiểm thử Node: 9 kiểm thử luật điểm danh và 8 kiểm thử điều phối với dịch vụ Google giả lập. Đã kiểm tra cú pháp Apps Script, JavaScript giao diện và manifest. Tất cả đạt.

Các tình huống chính: 700 sinh viên × 2 buổi × 2 lượt gửi; 1.400 lượt hợp lệ được giữ đúng hai cột ngày. Sai email/MSSV, sai mã, trước giờ mở, quá giờ, gửi trùng, đổi thứ tự roster, nhập online lặp lại, điều chỉnh kết quả, lỗi ghi bảng sau khi đã lưu log, đóng Form thất bại và khóa đồng bộ đều đã được kiểm tra. Đây là mô phỏng logic, **không phải thử tải 700 kết nối đến Google**.

Đã chạy Chromium kiểm tra demo: mở phiên, sinh QR, đồng bộ mô phỏng, chiếu QR, đóng phiên, ẩn QR sau đóng, giao diện 390 px, mã buổi hiển thị trong cửa sổ 1.000 × 780 px và hiển thị thông báo lỗi dưới dạng văn bản. Không có lỗi JavaScript; không có yêu cầu gửi link ra dịch vụ QR ngoài.

Chạy lại:

```bash
npm test
npm run check
```

Kiểm tra trình duyệt tùy chọn: chạy `npm run demo`, chuẩn bị `playwright-core` và Chromium, sau đó chạy `node scripts/test-ui.cjs`. Có thể chỉ định đường dẫn module qua `BP_PLAYWRIGHT_MODULE` và trình duyệt qua `BP_CHROMIUM`. Script sẽ cập nhật hai ảnh demo trong `docs/`.

Chưa kiểm tra được ở môi trường thật: quyền tài khoản Google Workspace USTH, OAuth/Forms API, publish/audience của Form mới, trigger thực tế, độ trễ Sheets, sức tải Wi‑Fi và số người gửi đồng thời. Cần thực hiện bước thử nghiệm trong [SETUP.md](SETUP.md) trước buổi sử dụng chính thức.
