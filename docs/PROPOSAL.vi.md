# Đề xuất điểm danh BP cho cuộc họp với giảng viên

**Phương án đã chọn:** QR động đổi mỗi 30 giây + đăng nhập Google USTH + chỉ truy cập qua dải mạng USTH được IT xác nhận. Server kiểm tra cả ba điều kiện lúc nhận điểm danh, lưu kết quả rồi đồng bộ sang Google Sheets theo ngày. Có thể kiểm tra thẻ chọn mẫu để hạn chế việc dùng tài khoản của người khác. Xem [giới hạn chống điểm danh hộ](ANTI-PROXY.vi.md).

Online do một trợ giảng đối chiếu báo cáo từ nền tảng học rồi nhập cùng bảng ngày. Gần 700 là tổng hybrid; cần chốt số offline và sức chứa Wi‑Fi. Bản web đã có mã nguồn và demo cục bộ, chưa cấu hình/triển khai tại USTH. Bản Forms ban đầu được giữ riêng, không có kiểm tra mạng/QR động.

## So sánh ba lựa chọn

| Cách làm | Điểm mạnh | Vấn đề với lớp đông | Vai trò đề xuất |
| --- | --- | --- | --- |
| Phát phiếu | Không cần điện thoại/mạng | Thu và nhập lại nhiều; có thể viết hộ | Dự phòng khi mạng lỗi |
| Check thẻ từng người, đối chiếu ảnh | Kiểm tra trực tiếp danh tính người có mặt | Dễ xếp hàng; một TA khó vừa kiểm tra vừa hỗ trợ học | Cách chính nếu yêu cầu xác minh từng người |
| QR động + Google + giới hạn mạng | Sinh viên gửi song song; hạn chế dùng QR cũ và gửi trực tiếp từ ngoài trường | Cần server/IT; vẫn có thể chia sẻ tài khoản cho người trong mạng | Cách chính đã chọn, thêm kiểm tra mẫu nếu cần |

Ví dụ lập kế hoạch: nếu có 300 người offline và mỗi lần check thẻ mất 3 giây, một hàng cần khoảng 15 phút, chưa tính vướng mắc. Đây chỉ là phép tính minh họa, không phải số đo thực tế của trường.

## Quy trình offline đã chọn

1. Trước giờ: thử mạng IPv4/IPv6, tài khoản Google trường, roster và Sheets. Sinh viên kết nối Wi‑Fi USTH, đăng nhập công cụ trước giờ quét.
2. Khi lớp ổn định, TA mở phiên 5–8 phút và chiếu QR đổi mỗi 30 giây. Không chia sẻ màn QR cho lớp online.
3. Sinh viên quét rồi bấm xác nhận; MSSV tự lấy từ roster. Nếu mã hết hạn trong lúc đăng nhập, quét mã mới đang chiếu.
4. Server kiểm tra mạng ở mỗi yêu cầu, Google identity, chữ ký/hạn QR và phiên. Một MSSV chỉ được tính một lần/buổi. Bản ghi lưu SQLite trước, đồng bộ Sheets theo lô; mạng ngoài trường bị chặn kể cả đã đăng nhập trước đó.
5. TA chọn ngẫu nhiên từ danh sách đã gửi sau khi cửa sổ đóng, đối chiếu ảnh thẻ với người xuất trình; ghi riêng người gặp lỗi mạng/điện thoại. Số mẫu cần chốt theo số offline và nhân lực. Mẫu nhỏ chỉ có tác dụng kiểm tra một phần, không xác minh tất cả người đã gửi.
6. Đóng phiên, kiểm tra số lượt và trạng thái Sheets, điều chỉnh ngoại lệ có lý do. Nếu muốn kiểm soát rời sớm, cần thầy thống nhất thêm cách kiểm tra; bản này hỗ trợ một phiên offline/ngày.

## Wi‑Fi USTH giúp gì?

Theo thông tin người dùng cung cấp, Wi‑Fi USTH yêu cầu đăng nhập tài khoản trường. Chưa đọc xác minh được toàn văn [bài thông báo Facebook](https://www.facebook.com/CTSV.USTH/posts/-th%C3%B4ng-b%C3%A1o-usth-ch%C3%ADnh-th%E1%BB%A9c-s%E1%BB%AD-d%E1%BB%A5ng-m%E1%BA%A1ng-wi-fi-usth_connect-t%E1%BB%AB-15082026-c%C3%A1c-b%E1%BA%A1n-t/122169669080644088/).

Đăng nhập Wi‑Fi và Google trong app là hai bước riêng. Bản web kiểm tra IP nguồn thuộc CIDR IT cung cấp; không đọc SSID hoặc GPS. IT cần làm rõ Wi‑Fi có chung đường ra với VPN/mạng khách không. Khi chung IP, server không phân biệt được các mạng đó bằng IP. Mạng campus cũng chưa chứng minh đúng người, đúng phòng.

## Quy trình online khi nền tảng chưa chốt

- Yêu cầu đổi tên thành `MSSV - Họ tên`. Tên hiển thị do người học tự đổi nên chỉ dùng để ghép danh sách, chưa đủ làm xác thực danh tính.
- TA online lấy báo cáo tham dự nếu nền tảng/tài khoản của thầy cho phép; ghép các lần vào lại cùng một MSSV, kiểm tra email và thời lượng theo quy định được thầy chốt. Chưa giả định Zoom hay Meet có sẵn báo cáo ở loại tài khoản đang dùng.
- Chỉ nhập danh sách đã kiểm tra vào công cụ; dòng không khớp MSSV được yêu cầu sửa. Ghi nguồn và tiêu chí đối chiếu, ví dụ “báo cáo buổi 09/09, đã ghép reconnect theo MSSV”.
- `BOTH` cảnh báo có hai hình thức trong cùng ngày; thầy/TA xác định chuyển hình thức hợp lệ hay cần kiểm tra thêm.

## Nội dung cần chốt lúc họp

1. Bao nhiêu sinh viên offline, bao nhiêu phòng và có chiếu QR được không?
2. Ai cung cấp danh sách MSSV + email Google chính thức? Email trường thuộc những domain/alias nào?
3. IT có thể cung cấp CIDR IPv4/IPv6, domain Google và server HTTPS không? Ai quản lý OAuth, service account, Sheet và backup SQLite?
4. Thời điểm và độ dài cửa sổ điểm danh; cách xử lý đi muộn, mất mạng và nghỉ có phép.
5. Nền tảng online, quyền xuất báo cáo, tiêu chí thời lượng và cách xử lý reconnect.
6. Thầy cần xác minh từng sinh viên hay chấp nhận kiểm tra chọn mẫu? Có thể bố trí thêm người/thời gian để check thẻ nếu số offline lớn không?

## Có thể trình bày với thầy

> Em đề xuất QR đổi mỗi 30 giây, sinh viên đăng nhập Google USTH và chỉ gửi được từ mạng trường được IT xác nhận. Mỗi buổi mở khoảng 5–8 phút, kết quả tự lên cột ngày trên Google Sheets. Em đã chuẩn bị web app và demo, cần IT xác nhận dải mạng/domain và thử nghiệm tài khoản thật. Hệ thống hạn chế gửi từ ngoài trường; người trong trường dùng tài khoản của bạn khác vẫn là giới hạn, nên có thể thêm kiểm tra thẻ mẫu. Online có một TA đối chiếu báo cáo rồi nhập cùng bảng.

Web app cần kiểm soát IP nguồn và thời hạn QR phía server. Dữ liệu lưu cục bộ trước, ghi Sheets theo lô để tránh một API call cho mỗi sinh viên. Xem [cài đặt](WEB-SETUP.vi.md) và [hạn mức Sheets](https://developers.google.com/workspace/sheets/api/limits). Chưa có thử tải thật tại USTH.
