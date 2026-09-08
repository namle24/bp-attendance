# Giao diện và tài nguyên USTH

Giao diện bản web dùng xanh `#293896`, đỏ `#ED1D24`, nền trắng và xám xanh nhạt. Hai màu chính được lấy từ các màu xuất hiện nhiều nhất trong logo đi kèm tài liệu `USTH Wi-Fi Login Guide.docx` do người dùng cung cấp; chưa đối chiếu một bộ quy chuẩn thương hiệu chính thức.

Logo tại `web/public/assets/usth-logo.png` được trích xuất nguyên ảnh từ tài liệu đó, giữ tỷ lệ và màu gốc. Repo không kèm bản DOCX hoặc ảnh hướng dẫn nội bộ khác. Tên/logo USTH thuộc tổ chức tương ứng; việc dùng để nhận diện môn học không thể hiện USTH đã công bố hoặc bảo chứng công cụ này. Thư viện QR có [giấy phép riêng](QR-LICENSE.txt).

QR vẫn đen trên nền trắng; đỏ dùng cho điểm nhấn và trạng thái cần chú ý, xanh là màu nút chính. Giao diện dùng font hệ thống, không tải font từ dịch vụ bên ngoài.

Các ảnh trong README và hướng dẫn TA được chụp từ app đang chạy với database/tài khoản giả bằng `scripts/test-web-ui.cjs`. Script đồng thời kiểm tra luồng đăng nhập với provider Google cô lập, nhập mã trên laptop, receipt, mất mạng trước/sau khi ghi, QR thay theo thời gian thật, đóng phiên và màn điện thoại/trình chiếu.

Muốn chụp lại, chuẩn bị `playwright-core` và Chromium; đặt `BP_PLAYWRIGHT_MODULE` và `BP_CHROMIUM` tới module/binary của máy rồi chạy:

```bash
node scripts/test-web-ui.cjs
```

Script dùng HTTPS localhost trên cổng ngẫu nhiên và database tạm, tự dọn sau khi xong; cần OpenSSL, không cần tài khoản Google. Nút Google trong ảnh do fixture provider dựng để kiểm thử; khi triển khai, Google Identity Services tự dựng nút theo tài khoản/trình duyệt. Ảnh kiểm thử không chứng minh đã tích hợp tài khoản USTH hoặc ghi Sheet thật. Không có dữ liệu thử được tự thêm khi ứng dụng khởi động.
