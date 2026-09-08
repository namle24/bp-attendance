# Phạm vi kiểm tra bản web · 08/09/2026

33 kiểm thử tự động: 9 luật đối chiếu và bảng ngày, 10 bảo mật/lưu trữ/Sheets, 11 kiểm thử API HTTP, 1 backup, 1 phục hồi tiến trình và 1 tải khóa/xác minh JWT. Google Identity và Sheets dùng dữ liệu giả lập trong kiểm thử; JWT ở bài khóa Google có chữ ký RSA thật do bài test tự tạo, không phải token của tài khoản USTH.

Các tình huống đã kiểm tra:

- CIDR IPv4, IPv4-mapped IPv6, IPv6; IP ngoài danh sách; từ chối cấu hình `/0`.
- QR có chữ ký, thay mỗi 30 giây, từ chối mã sửa/giả, mã tương lai, mã hết hạn và phiên đã đóng.
- Mã 8 ký tự có cùng hạn với QR, kiểm tra danh tính/mạng/phân quyền, chuẩn hóa hoa/thường/khoảng trắng; không nhận cả token và mã trong một yêu cầu. Quota 10 lần/phút theo Google subject vẫn áp dụng khi đăng nhập nhiều phiên; QR còn dùng được khi hết quota nhập mã.
- Domain Google `hd`, email verified, audience/issuer/expiry/nonce; email ngoài roster và Google subject bị chuyển sang MSSV khác.
- Header IP giả từ nguồn không tin cậy; header chèn IP campus trước một IP ngoài trường trong chuỗi proxy.
- Đăng nhập ở mạng trường rồi đổi sang IP ngoài trường vẫn bị từ chối điểm danh. MSSV tự gửi từ client không thay đổi MSSV trong roster.
- Sinh viên không lấy QR từ API admin; CSRF/cross-origin không sửa được dữ liệu; ứng dụng chỉ đăng nhập bằng Google đã xác thực.
- Nonce đăng nhập chỉ được dùng một lần, gồm hai yêu cầu đồng thời.
- 700 tài khoản cùng IP campus qua HTTP localhost, nhóm 100 tài khoản thực hiện song song, một nửa gửi QR, một nửa nhập mã, tất cả gửi lại bằng QR: giữ đúng 700 bản ghi SQLite. Google/đồng hồ giả lập; đây **không phải benchmark OAuth, Wi‑Fi hoặc tải 700 kết nối đồng thời ở USTH**.
- Google Sheets lỗi vẫn giữ dữ liệu chờ; retry không mất bản ghi phát sinh trong lúc ghi; tab không đúng sở hữu bị từ chối; chuỗi ghi bằng RAW, tự tăng hàng/cột.
- Điểm danh và metadata sở hữu Sheet vẫn còn sau khi đóng/mở lại database; cấu hình ứng dụng không cho phép dùng localhost làm mạng sinh viên.
- Tắt tiến trình `web/server.cjs` bằng SIGKILL rồi khởi động lại cùng ổ đĩa/secret: cookie còn dùng được, QR còn hạn dùng được, điểm danh đã commit vẫn còn và retry không trùng. Chưa mô phỏng mất điện/mất ổ đĩa.
- Backup khi database nguồn còn mở và có WAL: snapshot giữ dữ liệu đã commit và owner của Sheet.
- Loại sinh viên khỏi roster thu hồi quyền ở phiên đang đăng nhập; endpoint readiness báo 503 khi đọc database lỗi; quota được reset theo phút và cookie giả dùng chung quota IP.
- 700 tác vụ kiểm tra JWT cùng lúc chỉ phát một yêu cầu lấy khóa khi cache lạnh; token sai chữ ký/audience vẫn bị từ chối, lỗi lấy khóa không làm kẹt các lần đăng nhập sau.

Kiểm tra trình duyệt chạy Chromium với HTTPS localhost và database tạm. Provider Google và writer Sheets được thay bằng fixture trong `tests/helpers/browser-fixture.cjs`; entry point ứng dụng không import fixture. Cookie Secure, nonce, đối chiếu Google claims/roster, CIDR và CSRF vẫn chạy. Kiểm tra TA mở một nút vào màn chiếu, điện thoại quét QR, máy tính nhập mã, mất mạng trước khi ghi không báo thành công, mất phản hồi sau khi ghi lấy lại được receipt, đổi QR sau 30 giây, đóng phiên và bố cục responsive. Không xác nhận đăng nhập hoặc ghi Sheets thật từ bài thử này.

Đã bổ sung [benchmark gửi dồn 100/300/700 lượt](LOAD-TEST.vi.md), mỗi mức ba lần, tách process phát tải/server, SQLite trên filesystem và đồng hồ thật. Xem báo cáo cho kết quả trước/sau tối ưu. Đây là phép đo riêng với 33 kiểm thử trên; chưa đo Google login, TLS, Wi‑Fi hay hosting thật.

```bash
npm test
npm run check
# Nếu đã chuẩn bị playwright-core và Chromium:
node scripts/test-web-ui.cjs
```

Có thể đặt `BP_PLAYWRIGHT_MODULE` và `BP_CHROMIUM` bằng đường dẫn module/trình duyệt; cần OpenSSL để tạo chứng chỉ HTTPS cục bộ. Browser test dùng cổng ngẫu nhiên, tự dọn database và chứng chỉ sau khi chạy; tạo các ảnh `web-*.png` cho hướng dẫn.

Chưa kiểm tra thực tế: dải mạng/SSID USTH, topology proxy/ACL sau triển khai, VPN/mạng khách, quyền Google Workspace, Google login thật, service account/Sheets thật, độ bền hosting và tải lớp thật. Cần các bước nghiệm thu ở [WEB-SETUP.vi.md](WEB-SETUP.vi.md).
