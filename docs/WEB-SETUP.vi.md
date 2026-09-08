# Cài web app QR động vào USTH

Người dùng chọn host laptop cùng Wi‑Fi với sinh viên: xem [LAPTOP-LAN.vi.md](LAPTOP-LAN.vi.md) trước. Các bước Google/Sheets dưới đây vẫn áp dụng; IP nguồn của mô hình LAN có thể là địa chỉ nội bộ.

Đã đọc tài liệu `USTH Wi-Fi Login Guide.docx`: CONNECT yêu cầu tài khoản trường, Guest không yêu cầu. Tài liệu chưa cung cấp CIDR hoặc tích hợp danh tính Wi‑Fi cho app. Xem [phân tích và hướng dẫn host bằng systemd/Caddy](USTH-HOSTING.vi.md), gồm backup, phục hồi và nghiệm thu tải.

## 1. Thông tin cần từ IT và giảng viên

- **IPv4/IPv6 CIDR nguồn** mà Wi‑Fi được phép sử dụng khi tới server, đủ các đường ra và mức ổn định. Một lần xem IP trên điện thoại chưa đủ làm cấu hình chính thức.
- Wi‑Fi có chung đường ra với mạng khách, mạng dây, khu khác hoặc VPN từ ngoài trường không? Nếu có, lọc IP chưa phân biệt được; cần IT tách đường ra/ACL hoặc chấp nhận phạm vi đó.
- Domain `hd` Google Workspace sinh viên, danh sách MSSV–email chính và email TA quản trị. Không suy domain sinh viên từ tên trường.
- Tên miền HTTPS, máy chủ Node 24 và ổ đĩa bền vững. Nếu IT đặt app trong mạng trường với ACL riêng, cấu hình CIDR theo nguồn thực tế server thấy; có thể là mạng nội bộ thay vì IP public.
- Cloud project được phép dùng Google Identity và Sheets API; service account có quyền sửa Sheet riêng cho môn.

Mẫu nội dung bạn có thể gửi IT (công cụ không tự gửi):

> Em cần triển khai BP điểm danh bằng Google USTH + QR 30 giây. Nhờ anh/chị xác nhận CIDR nguồn IPv4/IPv6 của Wi‑Fi khi tới server, VPN/mạng khách có dùng chung không, domain Google Workspace sinh viên và phương án đặt web app HTTPS. Công cụ kiểm tra mạng ở server và không thu mật khẩu Google.

## 2. Server và cấu hình

```bash
npm ci --omit=dev
cp .env.example .env
```

Điền `.env`, không commit hoặc gửi qua nhóm chat:

| Biến | Giá trị |
| --- | --- |
| BP_MODE | `live` |
| PUBLIC_ORIGIN | HTTPS origin thật, không có `/` cuối |
| PORT / BIND_HOST | `4180` / `127.0.0.1` khi dùng Caddy cùng máy |
| GOOGLE_CLIENT_ID | OAuth client Web application |
| GOOGLE_HOSTED_DOMAINS | Các giá trị `hd` được IT xác nhận, phân cách dấu phẩy |
| ADMIN_EMAILS | Email TA/giảng viên được quản trị |
| CAMPUS_CIDRS | CIDR nguồn được phép; IP v4 đơn dùng `/32`, v6 đơn dùng `/128`; không điền SSID |
| TRUSTED_PROXY_CIDRS | Chỉ proxy trước Node; mẫu Caddy cùng máy: `127.0.0.1/32,::1/128` |
| QR_SECRET | Bí mật ngẫu nhiên ít nhất 32 ký tự |
| GOOGLE_SHEET_ID | ID Sheet dành riêng cho bản web |
| GOOGLE_APPLICATION_CREDENTIALS | Đường dẫn service account ngoài repo, chỉ tài khoản app đọc được; hoặc dùng Application Default Credentials của hosting |
| BP_DATABASE | SQLite trên ổ bền vững, ví dụ `/var/lib/bp-attendance/attendance.sqlite` |

Tạo bí mật trên server, lưu vào cấu hình riêng:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

IP trong `TRUSTED_PROXY_CIDRS` là **proxy**, không phải mạng sinh viên. Không thêm localhost/IP proxy vào `CAMPUS_CIDRS` để bỏ lỗi. Code từ chối `/0`. Nếu không qua proxy, để proxy CIDR trống và dùng IP socket trực tiếp; môi trường thật vẫn cần HTTPS.

## 3. Đăng nhập Google

1. Trong Cloud project được trường cho phép, cấu hình OAuth consent/Google Auth Platform phù hợp tổ chức và tạo **OAuth Client ID → Web application**.
2. Thêm `PUBLIC_ORIGIN` chính xác vào **Authorized JavaScript origins**. Bản này dùng GIS callback JavaScript, không dùng redirect OAuth server riêng.
3. Điền client ID; không cần client secret cho luồng nhận ID token này.
4. Kiểm tra bằng tài khoản thật. Server dùng thư viện Google kiểm tra chữ ký, issuer, audience, expiry; thêm kiểm tra `email_verified`, `hd`, nonce và roster. [Tài liệu Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
5. Email roster được gắn Google `sub` ở lần đăng nhập đầu; lần sau khớp cả hai. Khi trường cấp lại tài khoản, quản trị phải xác minh rồi cập nhật liên kết có chủ đích; không tự chuyển danh tính theo MSSV.

Việc trường dùng Google cho Wi‑Fi không tự cấp OAuth cho web app này; vẫn cần client ID và chính sách Workspace cho phép.

## 4. Sheets

1. Bật **Google Sheets API** trong project của credentials server.
2. Tạo Sheet mới, chia sẻ **Editor** cho email service account; chỉ cho giảng viên/TA phù hợp xem/sửa, không công khai email cả lớp.
3. Worker tạo tab **BP_Web_Attendance**, gắn metadata sở hữu bằng ID lưu trong SQLite. Nếu tab cùng tên tồn tại nhưng không thuộc database này, worker từ chối ghi đè: dùng Sheet mới hoặc khôi phục đúng database.
4. Dữ liệu ghi bằng `RAW` để chuỗi không thành công thức. Không sửa trực tiếp bảng tổng hợp. Các tab khác không bị sửa.

Mỗi lượt sinh viên ghi SQLite trước; worker ghi snapshot theo lô, giữ thay đổi mới phát sinh trong khi đang ghi ở trạng thái chờ và retry khi lỗi. Cách này tránh gọi Sheets một lần cho mỗi sinh viên. [Hạn mức Sheets](https://developers.google.com/workspace/sheets/api/limits).

## 5. HTTPS và IP nguồn

Mẫu [Caddyfile](../deploy/Caddyfile) dành cho **một Caddy cùng máy Node, chưa có CDN/proxy phía trước**. Đặt `ATTENDANCE_HOST` bằng hostname thật. Caddy quản lý HTTPS, chuyển về localhost và ghi đè `X-Forwarded-For` bằng IP từ kết nối vào Caddy.

Chỉ mở HTTPS qua proxy, không mở cổng Node 4180 ra Internet. `TRUSTED_PROXY_CIDRS` phải đúng proxy đó; không đặt `trust proxy=true`. Nếu có CDN/load balancer, cần xác định nơi xóa header giả và chuỗi IP thực tế, rồi kiểm thử lại. [Express](https://expressjs.com/en/guide/behind-proxies/), [Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

Chạy một process dưới service manager của máy chủ:

```bash
npm start
```

Service cần tự restart, giữ SQLite và QR_SECRET qua restart. Không dùng serverless có filesystem tạm hoặc nhiều replica với database riêng. Nếu môi trường là mạng nội bộ USTH, IT cần đảm bảo HTTPS, DNS và đường ra tới Google hoạt động.

## 6. Thử nghiệm trước buổi thật

1. TA trên mạng trường đăng nhập, nhập roster và mở buổi thử; sinh viên trường xác nhận, kiểm tra MSSV, cột ngày và Sheets.
2. Dùng 4G/Wi‑Fi ngoài trường: trang/API phải trả `403 NETWORK_DENIED`.
3. Đăng nhập ở USTH rồi chuyển 4G: gửi điểm danh vẫn bị từ chối.
4. Thử IPv4, IPv6, các khu vực/đường ra; CIDR thiếu sẽ chặn nhầm, cần IT xác nhận rồi sửa.
5. Gửi `X-Forwarded-For` giả từ ngoài trường qua hostname thật: vẫn từ chối. Test repo chưa xác nhận proxy đã triển khai.
6. Giữ QR quá 30 giây: `QR_EXPIRED`; đóng phiên khi QR còn hạn: vẫn từ chối.
7. Tài khoản cá nhân, domain khác hoặc email ngoài roster không được nhận. MSSV gửi thêm từ client không thay đổi danh tính trong roster.
8. Trên Sheet thử, tạm ngắt quyền Sheets, điểm danh rồi khôi phục quyền: receipt vẫn có trong database, đồng bộ lại không mất/trùng.
9. Thử tải tăng dần trên Wi‑Fi thật, gồm đăng nhập và quét QR qua HTTPS. [Benchmark cục bộ](LOAD-TEST.vi.md) đã đo 700 lượt gửi dồn với SQLite trên filesystem và đồng hồ thật, nhưng tạo sẵn phiên đăng nhập và không qua Wi‑Fi/Google/TLS; chưa chứng minh năng lực toàn bộ hệ thống sản xuất.

Nếu thiếu CIDR/domain/quyền OAuth, chưa mở buổi thật; không dùng demo hoặc bỏ chặn mạng để thay thế cấu hình.
