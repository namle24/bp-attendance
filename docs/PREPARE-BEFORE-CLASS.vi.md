# Chuẩn bị ở nhà và kiểm tra tại trường

Mục tiêu: cài sẵn công cụ và dịch vụ trên laptop; khi tới USTH, tập trung kiểm tra đường mạng và luồng điểm danh. **Google/Sheets, tên miền và chứng chỉ cần được chuẩn bị trước**; kết nối Wi‑Fi trường không tự tạo các thông tin này.

## Chuẩn bị laptop một lần

Với Linux x64, Node.js 24+, Git, Python 3, OpenSSL và `tar`:

```bash
git clone https://github.com/namle24/bp-attendance.git
cd bp-attendance
npm ci
npm run caddy:install
npm run laptop:setup
npm run host:install
npm run host:check
```

Sau các bước trên, `host:check` liệt kê các mục còn thiếu cần tài khoản hoặc thông tin từ IT.

- `caddy:install` tải Caddy 2.11.4 từ bản phát hành chính thức, kiểm tra SHA-256, đặt trong `data/bin`; không sửa gói hệ thống.
- `laptop:setup` tạo `.env` riêng, khóa QR ngẫu nhiên, thư mục Google/chứng chỉ, SQLite và file service. Chạy lại giữ khóa QR, cấu hình và dữ liệu đã có.
- `host:install` liên kết app và Caddy vào systemd của tài khoản hiện tại, chưa bật dịch vụ hoặc đặt tự chạy khi đăng nhập.
- Dịch vụ HTTPS dùng **8443**, Node dùng **4180 trên localhost**. URL Google và sinh viên phải có đúng `:8443`.
- `host:check` ghi báo cáo chỉ gồm trạng thái vào `data/reports/host-check.json`; không xuất bí mật. Thiếu cấu hình thì dịch vụ không khởi động.

Cắm sạc, giữ nắp mở và giữ phiên đăng nhập hệ điều hành trong buổi. Service có cơ chế chặn sleep khi chạy; vẫn cần kiểm tra thực tế máy không ngủ.

## Việc làm ngay từ nhà

| Cần chuẩn bị | Điền / lưu ở đâu |
| --- | --- |
| Email USTH của TA có quyền quản trị | `ADMIN_EMAILS` trong `.env` |
| Domain Google Workspace của sinh viên được IT xác nhận | `GOOGLE_HOSTED_DOMAINS` trong `.env` |
| Hostname DNS dành cho laptop | `ATTENDANCE_HOST` trong `data/caddy.env` |
| URL HTTPS đầy đủ, gồm cổng 8443 | `PUBLIC_ORIGIN` trong `.env`, dạng `https://HOSTNAME:8443` |
| OAuth Client ID loại Web application | `GOOGLE_CLIENT_ID`; khai báo đúng PUBLIC_ORIGIN trong Authorized JavaScript origins |
| JSON service account được phép ghi Google Sheets | `data/secrets/google-service-account.json`, hoặc đổi đường dẫn tuyệt đối trong `.env` |
| Google Sheet riêng của lớp, đã chia sẻ Editor cho service account | `GOOGLE_SHEET_ID` trong `.env` |
| Full certificate chain và private key đúng hostname | `data/certs/fullchain.pem` và `data/certs/privkey.pem` |
| Danh sách chính thức MSSV–email | Chuẩn bị CSV theo `examples/roster.csv`, nhập trong màn TA khi app chạy |

Thực hiện Google/OAuth/Sheet theo [WEB-SETUP.vi.md](WEB-SETUP.vi.md). Không gửi mật khẩu Google cho công cụ. Không đưa `.env`, credentials, private key hoặc danh sách lớp lên GitHub.

Tên miền phải trỏ về IP nội bộ laptop trên mạng sinh viên. Chứng chỉ phải được thiết bị sinh viên tin cậy; chứng chỉ tự ký dùng trong kiểm thử phần mềm không phải chứng chỉ triển khai cho cả lớp. [Google: khai báo origin](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Caddy: điều kiện HTTPS](https://caddyserver.com/docs/automatic-https).

Có thể nhờ IT xác nhận trước bằng nội dung sau; bạn tự gửi tới người phù hợp:

> Em chuẩn bị laptop host web điểm danh BP, sinh viên truy cập trực tiếp trong USTH_CONNECT. Nhờ anh/chị xác nhận thiết bị Wi‑Fi có truy cập được laptop không, CIDR IPv4/IPv6 nguồn của sinh viên và cách loại Guest/VPN; cấp/giữ IP laptop, hostname DNS trỏ về IP này và chứng chỉ HTTPS được điện thoại tin cậy. App dùng TCP 8443; TCP 4188 chỉ mở 5 phút để kiểm tra kết nối. Phần Google cần domain Workspace hd và OAuth client được phép dùng cho sinh viên.

## Khi tới trường

### 1. Thử đường mạng

Laptop và 2–3 điện thoại kết nối **USTH_CONNECT**, hoàn tất đăng nhập Wi‑Fi. Trên laptop:

```bash
cd ~/Projects/bp-attendance
npm run campus:test
```

Lệnh nhận IP của card Wi‑Fi và mở trang QR trên laptop. Sinh viên/TA dùng điện thoại quét QR; phải thấy **Đã kết nối được tới laptop**. URL có thời hạn 5 phút; Ctrl+C để dừng sớm. Lệnh không sửa CIDR, không mở phiên hoặc ghi điểm danh. Nếu không tự chọn được card mạng, dùng `npm run campus:test -- IP_WIFI_CUA_LAPTOP`.

Thử vài thiết bị/vị trí trong phòng. Nếu không vào được, cùng IT kiểm tra firewall, client isolation hoặc VLAN. Không tắt toàn bộ firewall. Trang này chỉ xác nhận HTTP tới laptop, chưa chứng minh Google, HTTPS hoặc 700 thiết bị hoạt động đồng thời.

### 2. Điền các thông số mạng đã được xác nhận

- `data/caddy.env`: đặt `LAPTOP_LAN_IP` bằng IP Wi‑Fi của laptop được giữ ổn định trong buổi.
- `.env`: đặt `CAMPUS_CIDRS` bằng dải nguồn IT xác nhận. Không tự dùng subnet suy ra từ IP máy, không điền toàn bộ mạng private hoặc localhost.
- Kiểm tra DNS hostname đã trỏ tới IP laptop. Firewall/ACL cho phép TCP **8443** từ mạng sinh viên.

### 3. Bật ứng dụng và nghiệm thu

```bash
npm run host:check -- --campus
npm run host:start
npm run host:status
```

Trên điện thoại mở `https://HOSTNAME:8443/readyz`, sau đó trang chính. Thử Google của TA và sinh viên, nhập roster, mở QR, quét trên điện thoại và nhập mã trên máy tính. Kiểm tra receipt, số lượt và cột ngày trên Sheet. Thử Guest/4G phải không điểm danh được.

**Dùng database và Sheet nghiệm thu riêng nếu mở phiên thử trong cùng ngày học.** Mỗi database chỉ mở một phiên offline/ngày; không dùng phiên thử chiếm phiên chính thức. Dừng dịch vụ trước khi đổi `BP_DATABASE`/`GOOGLE_SHEET_ID`, giữ dữ liệu đã thu. Xem [WEB-SETUP.vi.md](WEB-SETUP.vi.md#6-thử-nghiệm-trước-buổi-thật).

Nếu Google/HTTPS chưa có từ nhà, ngày mai chỉ kiểm tra được phần mạng cho đến khi hoàn tất các mục đó.

## Kết thúc

```bash
python3 scripts/backup-db.py data/web-live.sqlite data/backups
npm run host:stop
```

Đợi đồng bộ hoặc xác nhận dữ liệu chờ đã lưu, backup trước khi dừng. Chép backup sang nơi riêng được trường cho phép. Hướng dẫn đứng lớp: [TA-GUIDE.vi.md](TA-GUIDE.vi.md).
