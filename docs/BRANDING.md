# Giao diện và tài nguyên USTH

Giao diện bản web dùng xanh `#293896`, đỏ `#ED1D24`, nền trắng và xám xanh nhạt. Hai màu chính được lấy từ các màu xuất hiện nhiều nhất trong logo đi kèm tài liệu `USTH Wi-Fi Login Guide.docx` do người dùng cung cấp; chưa đối chiếu một bộ quy chuẩn thương hiệu chính thức.

Logo tại `web/public/assets/usth-logo.png` được trích xuất nguyên ảnh từ tài liệu đó, giữ tỷ lệ và màu gốc. Repo không kèm bản DOCX hoặc ảnh hướng dẫn nội bộ khác. Tên/logo USTH thuộc tổ chức tương ứng; việc dùng để nhận diện môn học không thể hiện USTH đã công bố hoặc bảo chứng công cụ này. Thư viện QR có [giấy phép riêng](QR-LICENSE.txt).

QR vẫn đen trên nền trắng; đỏ dùng cho điểm nhấn và trạng thái cần chú ý, xanh là màu nút chính. Giao diện dùng font hệ thống, không tải font từ dịch vụ bên ngoài.

Ảnh trong README và hướng dẫn TA được chụp từ app đang chạy với hai sinh viên hư cấu trong database tạm, bằng `scripts/test-web-ui.cjs`. Script kiểm tra biểu mẫu điện thoại/laptop, màn chiếu QR, mất mạng trước/sau khi lưu, khôi phục khi tải lại trang, cờ trùng IP và thao tác đối chiếu của TA.

Chuẩn bị `playwright` hoặc `playwright-core` và Chromium; đặt đường dẫn module và binary:

```bash
BP_PLAYWRIGHT_MODULE=/path/to/playwright BP_CHROMIUM=/path/to/chromium node scripts/test-web-ui.cjs
```

Script dùng HTTP localhost trên hai cổng ngẫu nhiên và database tạm, tự dọn sau khi xong. Các ảnh hiện tại: `web-projector.png`, `web-admin.png`, `web-student-ready.png`, `web-student.png`, `web-student-desktop.png`, `web-review.png`, `web-history.png`, `web-cases.png`.

Không dùng QR/URL trong ảnh cho lớp: đó là địa chỉ kiểm thử localhost. App tại trường hiển thị IP Wi-Fi thật của laptop. Ảnh kiểm thử không chứng minh kết nối USTH hoặc đồng bộ Sheet thật. Database lớp không được điền dữ liệu thử.
