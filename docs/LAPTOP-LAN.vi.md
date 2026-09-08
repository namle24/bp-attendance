# Kiểm tra mạng USTH và laptop host

App nghe trực tiếp trên IPv4 card Wi-Fi, cổng 4180. Trang TA nghe riêng `127.0.0.1:4181`. Sinh viên mở URL do máy host in ra, cùng Wi-Fi của lớp; không mở URL localhost của TA.

## Kiểm tra tại trường

- Kết nối laptop và điện thoại vào USTH_CONNECT, hoàn tất đăng nhập captive portal.
- Chạy `npm run campus:test`: app thử mạng cổng 4188, QR/link riêng, không ghi dữ liệu, tự hết hạn sau 5 phút.
- Tiếp tục `npm run host:start` và mở link cổng 4180 trên thiết bị sinh viên. Probe 4188 thành công chưa đủ nếu firewall chặn riêng 4180.
- Dùng hai thiết bị và database thử riêng theo [chuẩn bị buổi học](PREPARE-BEFORE-CLASS.vi.md), xem IP ở bảng TA.

Nếu không mở được link: kiểm tra IP hiện tại, cổng, Wi-Fi và firewall laptop; hỏi IT về client isolation/VLAN/routing. Cùng tên Wi-Fi không bảo đảm hai thiết bị được kết nối với nhau. Nếu sinh viên khác subnet, IT cần xác nhận dải nguồn rồi mới thêm `CAMPUS_CIDRS`.

Không tắt toàn bộ firewall để xử lý. Nếu cần mở, giới hạn **TCP 4180, card Wi-Fi, subnet sinh viên**; không mở cổng TA 4181. Không chuyển qua tunnel/public proxy vì sẽ thay đổi cách quan sát IP và phạm vi truy cập. Bản hiện tại dùng HTTP LAN, chưa mã hóa nội dung trên đường truyền. Nếu trường yêu cầu HTTPS, cần IT triển khai đường kết nối/chứng chỉ và kiểm tra lại IP trước khi sử dụng.

## IP có thể và không thể xác định

Server lấy `req.socket.remoteAddress`, chuẩn hóa IP và bỏ qua `X-Forwarded-For`, `X-Real-IP` hoặc trường `ip` từ biểu mẫu. [Express giải thích rủi ro khi tin các header proxy](https://expressjs.com/en/guide/behind-proxies/). Luồng LAN không bật trust proxy.

Web không đọc được SSID hoặc tài khoản dùng để đăng nhập Wi-Fi. Giới hạn subnet chỉ kiểm tra địa chỉ nguồn nhìn thấy, không chứng minh người gửi có mặt đúng phòng. Nếu mạng làm NAT trước laptop, nhiều thiết bị có thể dùng chung địa chỉ nguồn; xem [RFC 3022](https://www.rfc-editor.org/rfc/rfc3022). Đây là khả năng cần thử, chưa có bằng chứng USTH dùng cách đó trên đường kết nối này.

Nếu nhiều MSSV cùng IP, app vẫn nhận đủ lượt và gắn cờ để TA đối chiếu. Nên giải thích cho giảng viên nếu cả lớp bị gom thành một IP; không dùng số lượng dòng đỏ để kết luận gian lận.

## Laptop và Wi-Fi khi đông người

Cắm sạc, giữ Wi-Fi ổn định, không đóng terminal nếu chạy `npm start`. Service Linux có chặn sleep/idle/lid sleep và tự khởi động lại khi tiến trình lỗi; vẫn kiểm tra thực tế. DHCP đổi IP hoặc đổi mạng thì dừng/bật service và chiếu QR mới. Database/phiên còn nguyên.

Đo tải cục bộ chưa đo airtime, captive portal, số client/AP hoặc chất lượng sóng. [Số liệu server](LOAD-TEST.vi.md) không thay được thử với nhiều điện thoại tại trường. Nếu sự cố mạng, giữ bản ghi đã có và để TA đối chiếu ngoại lệ theo quy trình lớp.
