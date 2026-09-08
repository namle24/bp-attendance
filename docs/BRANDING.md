# Giao diện và tài nguyên USTH

Giao diện bản web dùng xanh `#293896`, đỏ `#ED1D24`, nền trắng và xám xanh nhạt. Hai màu chính được lấy từ các màu xuất hiện nhiều nhất trong logo đi kèm tài liệu `USTH Wi-Fi Login Guide.docx` do người dùng cung cấp; chưa đối chiếu một bộ quy chuẩn thương hiệu chính thức.

Logo tại `web/public/assets/usth-logo.png` được trích xuất nguyên ảnh từ tài liệu đó, giữ tỷ lệ và màu gốc. Repo không kèm bản DOCX hoặc ảnh hướng dẫn nội bộ khác. Tên/logo USTH thuộc tổ chức tương ứng; việc dùng để nhận diện môn học không thể hiện USTH đã công bố hoặc bảo chứng công cụ này. Thư viện QR có [giấy phép riêng](QR-LICENSE.txt).

QR vẫn đen trên nền trắng; đỏ dùng cho điểm nhấn và trạng thái cần chú ý, xanh là màu nút chính. Giao diện dùng font hệ thống, không tải font từ dịch vụ bên ngoài.

Các ảnh trong README và hướng dẫn TA được chụp từ app đang chạy với database/tài khoản giả bằng `scripts/test-web-ui.cjs`. Script đồng thời kiểm tra đăng nhập demo, receipt, mất mạng trước/sau khi ghi, QR thay theo thời gian thật, đóng phiên và màn điện thoại/trình chiếu.

Muốn chụp lại, chuẩn bị `playwright-core` và Chromium; đặt `BP_PLAYWRIGHT_MODULE` và `BP_CHROMIUM` tới module/binary của máy rồi chạy:

```bash
node scripts/test-web-ui.cjs
```

Script dùng cổng localhost 4181 và database tạm, tự dọn sau khi xong; không cần Google thật. Ảnh thay đổi theo ngày/giờ chạy. Theme mới áp dụng cho bản web; bản Forms cũ trong `apps-script/` giữ giao diện lịch sử và không nằm trong luồng hướng dẫn TA mới.
