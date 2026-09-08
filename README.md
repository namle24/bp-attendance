<p align="center"><img src="web/public/assets/usth-logo.png" alt="USTH — Vietnam France University" width="150"></p>

# BP Attendance · USTH

Công cụ hỗ trợ trợ giảng môn **Basic Programming**: sinh viên đăng nhập Google của trường, quét QR thay mỗi 30 giây, nhận xác nhận điểm danh. Kết quả lưu trên laptop host rồi tự đồng bộ Google Sheets, mỗi ngày học một cột.

**Mô hình sử dụng:** một laptop host và sinh viên cùng kết nối `USTH_CONNECT`. Các TA dùng chung địa chỉ website của laptop đó.

**Trạng thái:** đã chạy và kiểm thử cục bộ; **chưa nghiệm thu trên Wi‑Fi USTH**. Có thể chạy demo ngay. Trước khi thu điểm danh thật cần cấu hình Google, tên miền/HTTPS và mạng trường. Đây là công cụ hỗ trợ môn học, chưa phải dịch vụ điểm danh chính thức do USTH công bố.

![Giao diện đăng nhập USTH](docs/web-login.png)

## Bắt đầu từ đâu?

| Bạn cần làm gì? | Đọc tài liệu |
| --- | --- |
| Thử giao diện ngay trên máy mình | [Chạy demo bên dưới](#chạy-demo-trong-vài-bước) |
| Là TA, cần biết bấm gì trước/trong/sau buổi | **[Hướng dẫn TA có ảnh](docs/TA-GUIDE.vi.md)** |
| Là người mang laptop tới lớp và host | **[Các bước host trên laptop](docs/HOST-QUICKSTART.vi.md)** |
| Cấu hình Google, roster và Sheets | [Thiết lập tài khoản và dữ liệu](docs/WEB-SETUP.vi.md) |
| Kiểm tra Wi‑Fi, HTTPS, service và không sleep | [Chi tiết laptop trong LAN](docs/LAPTOP-LAN.vi.md) |
| Xem khả năng chịu tải và giới hạn chống điểm danh hộ | [Đo tải](docs/LOAD-TEST.vi.md) · [Căn cứ điểm danh](docs/ANTI-PROXY.vi.md) |

## Chạy demo trong vài bước

Cài **Git và Node.js 24 trở lên**. Lệnh chạy demo dùng được trên Linux, macOS và Windows; hướng dẫn host với service hiện dành cho Linux.

```bash
git clone https://github.com/namle24/bp-attendance.git
cd bp-attendance
npm ci
npm run demo:web
```

Mở **http://127.0.0.1:4180** trên chính máy đang chạy app.

1. Chọn **Demo trợ giảng** → **Mở buổi mới** → **Mở điểm danh**.
2. Bấm **Sao chép link QR hiện tại**.
3. Mở link trong cửa sổ ẩn danh → **Demo sinh viên** → **Xác nhận điểm danh**.
4. Quay lại màn TA, đợi số sinh viên cập nhật. Bấm **Chiếu QR** để xem màn trình chiếu.

QR có hạn 30 giây: nếu thao tác chậm, lấy link mới. Demo dùng dữ liệu giả, chỉ mở trên localhost và không gọi Google hoặc ghi Sheets thật. Dừng bằng `Ctrl+C`. Chạy demo không cần tạo `.env`.

## Giao diện chính

| Màn trợ giảng | Sinh viên trên điện thoại |
| --- | --- |
| [![Điều khiển phiên và QR](docs/web-admin.png)](docs/web-admin.png) | [![Xác nhận điểm danh](docs/web-student.png)](docs/web-student.png) |

![Màn chiếu QR tại lớp](docs/web-projector.png)

Xem thêm: [nhập roster](docs/web-roster.png) · [sinh viên trước xác nhận](docs/web-student-ready.png) · [đăng nhập trên điện thoại](docs/web-login-mobile.png). Tất cả ảnh chụp từ demo, không có dữ liệu sinh viên thật.

## Thu điểm danh trong buổi thật

1. Người host khởi động **một bản live** đã cấu hình. Các TA khác mở cùng URL HTTPS và đăng nhập email có trong `ADMIN_EMAILS`.
2. TA nhập roster đầy đủ `MSSV,Họ tên,Email trường`; sinh viên đăng nhập Google USTH trước giờ quét.
3. Mở phiên 5–8 phút, chiếu QR **trong phòng học**. QR tự thay mỗi 30 giây trong suốt phiên.
4. Sinh viên quét và xác nhận. Server kiểm tra Google–MSSV, IP mạng được phép, chữ ký/hạn QR và phiên đang mở.
5. **Đã ghi nhận** nghĩa là đã lưu SQLite trên laptop. Gửi lại không tạo bản ghi trùng. Sheets được đồng bộ theo lô khoảng 15 giây khi có thay đổi; có thể chậm hơn nếu kết nối lỗi.
6. Cuối buổi, đóng phiên, đối chiếu ngoại lệ, kiểm tra Sheets và backup. Mỗi lớp dùng một laptop/database làm nguồn chung.

| Ký hiệu trên bảng | Ý nghĩa |
| --- | --- |
| `OFF` | Ghi nhận offline hoặc TA điều chỉnh |
| `ON` | TA nhập danh sách online đã đối chiếu |
| `BOTH` | Có cả offline và online trong cùng ngày; cần kiểm tra |
| `V` / `EXCUSED` | TA xác nhận vắng / có phép |
| Ô trống | Chưa ghi nhận; **không tự kết luận vắng** |

Mỗi ngày một phiên offline; phiên đã đóng không mở lại. Buổi sau có cột ngày mới khi TA mở buổi đó, không phải tự thêm cột mỗi ngày theo lịch. Chưa tự kết nối Zoom/Meet. Nút tải trong app xuất **CSV**; cần `.xlsx` thì xuất từ Google Sheets.

## Những điều cần xác nhận tại trường

- Cùng tên Wi‑Fi chưa chắc các thiết bị liên lạc được: dùng `npm run lan:probe` theo [hướng dẫn](docs/LAPTOP-LAN.vi.md).
- IT cần xác nhận IP laptop, CIDR nguồn CONNECT, cách loại Guest/VPN, hostname và HTTPS. App không đọc SSID hoặc nhận danh tính từ cổng Wi‑Fi.
- QR + Google + mạng trường hạn chế điểm danh hộ nhưng chưa xác minh đúng người/đúng phòng. Giảng viên chốt tiêu chí, đối chiếu thẻ và cách xử lý ngoại lệ.
- Một laptop có thể mất mạng/ngủ/hỏng; giữ máy hoạt động, có backup và quy trình TA ghi ngoại lệ. Không dùng demo để thu buổi thật.

## Kiểm tra và cấu trúc repo

```bash
npm test          # 39 kiểm thử, dữ liệu giả; cần Python 3 cho bài backup
npm run check    # kiểm tra cú pháp
npm run bench:web # đo tải local; chạy trước buổi, không chạy cạnh lớp đang điểm danh
```

Đã kiểm tra phục hồi sau SIGKILL, gửi lại không trùng, lỗi đồng bộ, mất phản hồi trình duyệt và 700 lượt gửi dồn. Có một đợt tải chậm 7,88 giây; xem [báo cáo đầy đủ](docs/LOAD-TEST.vi.md). Các kết quả này chưa chứng minh Wi‑Fi/Google/HTTPS thực tế tại trường.

```text
web/              Server, xác thực, QR, SQLite, đồng bộ Sheets
web/public/       Giao diện USTH và logo tham chiếu
deploy/           Caddyfile LAN và mẫu service
scripts/          Demo, chụp giao diện, thử LAN, service laptop, backup, đo tải
docs/             Hướng dẫn TA/host, ảnh giao diện và báo cáo
examples/         CSV roster và danh sách online giả
tests/            Kiểm thử với dữ liệu giả
apps-script/      Bản Forms cũ, chỉ lưu tham khảo
```

`.env`, database, backup và credentials được bỏ qua bởi Git. Roster trong repo chỉ là dữ liệu minh họa. Logo/màu được tham chiếu từ tài liệu USTH đã cung cấp; [ghi chú giao diện và tài nguyên](docs/BRANDING.md).

Bản Google Forms cũ ở [FORMS-VERSION.md](docs/FORMS-VERSION.md) không có cổng kiểm tra mạng/QR động như bản web; tài liệu TA mới dùng bản web làm mặc định.
