# Vận hành QR động + mạng USTH

## Trước buổi

- Kiểm tra server, backup database, roster và trạng thái Sheets. TA cũng phải truy cập từ mạng được phép.
- Nhắc sinh viên kết nối Wi‑Fi, đăng nhập email trường trước giờ quét. Đăng nhập lần đầu có thể lâu hơn 30 giây; khi đó quét lại QR đang chiếu.
- Chỉ TA có email trong `ADMIN_EMAILS` được mở/đóng phiên và lấy QR mới.

## Trong buổi

1. Chọn ngày hôm nay (giờ Việt Nam), mở phiên khoảng 5–8 phút. Mỗi ngày một phiên offline; phiên đóng không mở lại.
2. Bấm **Chiếu QR**, không đưa màn này vào luồng học online. QR đổi mỗi 30 giây tính từ khi mở; không cộng thời gian dùng mã cũ.
3. Sinh viên quét bằng camera, bấm **Xác nhận điểm danh**. Mã nằm trong fragment URL để không gửi vào access log/referrer; vẫn không nên chia sẻ mã.
4. **Đã ghi nhận** nghĩa là đã lưu SQLite. Gửi lại cùng tài khoản/MSSV/phiên trả lại bản ghi có sẵn, không nhân đôi.
5. Hết giờ, server chặn ngay kể cả khi trình chiếu treo. Có thể đóng phiên sớm.

## Sau buổi

- Kiểm tra Sheets; nếu lỗi, sửa quyền/kết nối và đồng bộ lại. Bản ghi mới vẫn nằm trong SQLite.
- TA online đối chiếu báo cáo theo tiêu chí thầy chốt rồi nhập MSSV kèm nguồn. Chưa có kết nối Zoom/Meet tự động.
- Điều chỉnh qua app với lý do; lần mới nhất có hiệu lực, giữ người sửa và thời gian. Không sửa tay bảng tổng hợp.
- `BOTH` cần đối chiếu hình thức; ô trống chưa là vắng. `OFF` từ QR không có nghĩa TA đã trực tiếp nhìn thấy sinh viên.
- Tải CSV từ app hoặc `.xlsx` trong Sheets. Khi nhập CSV vào Excel, chọn MSSV là **Text** để giữ số 0 đầu. File tải xuống là bản chụp, không tự cập nhật.

## Lỗi thường gặp

| Thông báo | Xử lý |
| --- | --- |
| NETWORK_DENIED | Kiểm tra Wi‑Fi, 4G/VPN. Nếu nhiều người trên USTH cùng lỗi, nhờ IT kiểm tra CIDR IPv4/IPv6; không mở toàn Internet |
| GOOGLE_IDENTITY_INVALID | Kiểm tra tài khoản, domain `hd`, OAuth client và thời hạn đăng nhập |
| NOT_ENROLLED | Đối chiếu email chính/alias và roster; TA cập nhật khi có căn cứ |
| IDENTITY_CHANGED / IDENTITY_CONFLICT | Liên kết Google `sub` khác; cần quản trị xác minh trước khi sửa |
| QR_EXPIRED | Quét mã mới đang chiếu; phiên đăng nhập vẫn còn |
| SESSION_CLOSED | TA xác minh trường hợp đi muộn/lỗi máy và điều chỉnh nếu thầy cho phép |
| Lỗi Sheets | Kiểm tra API, credentials, quyền Editor và metadata tab; receipt đã cấp vẫn có trong SQLite |
| LOGIN_CHALLENGE / LOGIN_EXPIRED | Tải lại trang lấy nonce mới, không dùng lại ID token/cookie cũ |

## Dữ liệu và bảo trì

Có [hướng dẫn triển khai service tự khởi động lại, giám sát và backup](USTH-HOSTING.vi.md). Khi phản hồi điểm danh bị mất, app kiểm tra lịch sử của chính sinh viên; kết nối hết chờ sẽ báo rõ cách thử lại, không tự coi đã thành công.

SQLite là nguồn gốc của bản web, chứa roster, Google `sub`, phiên học, IP của lượt hợp lệ, dữ liệu online, điều chỉnh và phiên đăng nhập đã băm. Không lưu mật khẩu Google, ID token hoặc ảnh khuôn mặt. Giới hạn quyền đọc database/credentials cho người vận hành.

Nhập roster đầy đủ mới sẽ ngừng quyền tự điểm danh của người bị loại khỏi roster nhưng vẫn giữ hàng/lịch sử báo cáo. Không có xóa lịch sử hàng loạt qua giao diện. Email đã liên kết Google không tự đổi; cần quy trình quản trị xác minh.

Backup bằng công cụ backup SQLite khi đang chạy hoặc dừng service trước khi sao chép và kiểm tra WAL. Không chỉ chép file `.sqlite` đang chạy mà bỏ qua WAL. Thử khôi phục; giữ cấu hình, QR_SECRET, credentials và metadata sở hữu tab tương ứng. Không chạy bản khôi phục đồng thời với server đang phục vụ cùng Sheet.

Google Sheet do app dựng lại, nhật ký không phải hệ thống chống sửa bởi quản trị viên. Lưu dữ liệu, quyền xem và xử lý theo quy trình môn/trường đã thông báo. Không công khai roster/log cả lớp.

Khi mạng cả phòng lỗi: TA ghi ngoại lệ sau đối chiếu thẻ rồi bổ sung có lý do. Không mở Form công khai song song và coi các lượt đó đã qua cổng kiểm tra mạng/QR này.
