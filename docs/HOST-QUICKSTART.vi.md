# Host trên laptop · Thứ tự thao tác

Dành cho **một TA phụ trách laptop host** của lớp. Các TA còn lại chỉ cần URL HTTPS và email quản trị. Hướng dẫn service hiện dành cho Linux/systemd.

Xem bản hướng dẫn ngắn: **[Chuẩn bị ở nhà và kiểm tra tại trường](PREPARE-BEFORE-CLASS.vi.md)**.

## A. Làm ở nhà trước khi mang máy tới trường

### 1. Tải mã nguồn và cài thư viện

Cài Git, Node.js 24+, Python 3 (backup/kiểm thử). Trong terminal:

```bash
git clone https://github.com/namle24/bp-attendance.git
cd bp-attendance
npm ci
npm run caddy:install
npm run laptop:setup
npm run host:install
```

### 2. Chuẩn bị các thông tin chạy thật

| Cần chuẩn bị | Người xác nhận |
| --- | --- |
| Danh sách MSSV–email chính, email các TA quản trị | Giảng viên/TA quản lý lớp |
| Domain Google Workspace `hd`, OAuth client được phép sử dụng | IT/người quản lý Google của trường |
| IP laptop ổn định, thiết bị sinh viên truy cập được, CIDR CONNECT đủ IPv4/IPv6 cần dùng | IT mạng |
| Hostname trỏ về laptop trong LAN, HTTPS được điện thoại tin cậy | IT/người quản lý DNS/chứng chỉ |
| Sheet riêng, service account có quyền sửa, đường dẫn credentials trên laptop | Người quản lý công cụ/Sheet |

Đăng nhập Wi‑Fi không tự cấp cấu hình Google cho app. Cùng SSID chưa chắc điện thoại truy cập được laptop. Không tự điền IP/domain phỏng đoán để làm app khởi động.

### 3. Tạo `.env`

```bash
npm run laptop:setup
```

Mở `.env` bằng trình soạn thảo, điền đầy đủ theo [WEB-SETUP.vi.md](WEB-SETUP.vi.md). Giữ:

```dotenv
BIND_HOST=127.0.0.1
PORT=4180
BP_DATABASE=./data/web-live.sqlite
TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128
```

`PUBLIC_ORIGIN` là URL HTTPS thật, gồm cổng `:8443`; `CAMPUS_CIDRS` là nguồn nội bộ IT xác nhận; `ADMIN_EMAILS` gồm các TA, ngăn cách dấu phẩy. Tạo QR secret ngẫu nhiên theo hướng dẫn rồi giữ ổn định qua restart. `.env`, database và credentials không đưa lên GitHub.

Kiểm tra cấu hình trước khi khởi động:

```bash
npm run host:check
```

Lệnh này kiểm tra các trường bắt buộc và file service account; chưa kiểm tra Google/HTTPS/mạng trường. Nếu cần chạy trong terminal để xem log sau khi cấu hình hoàn chỉnh, dùng `npm start`, dừng bằng Ctrl+C trước khi chuyển sang service.

### 4. Chuẩn bị HTTPS

Caddy đã được `caddy:install` đặt trong `data/bin` và service đã được `host:install` liên kết. Điền `data/caddy.env`: hostname, cổng `8443`, IP laptop tại trường và đường dẫn fullchain/private key được cấp. Dịch vụ tự đọc file này; `.env` của Node là file riêng.

`host:check` kiểm tra chứng chỉ/key/hostname và chạy Caddy validate khi đủ các trường. Chứng chỉ phải được điện thoại tin cậy; cần IT xác nhận DNS và mạng. Node 4180 chỉ ở localhost; Caddy nhận TCP 8443.

### 5. Bật/dừng dịch vụ

Khi đủ Google/HTTPS và đã cấu hình mạng tại trường:

```bash
npm run host:check -- --campus
npm run host:start
npm run host:status
systemd-inhibit --list
```

App và Caddy dùng service user, tự restart khi process lỗi. App giữ inhibitor trong khi chạy. Cắm sạc, mở nắp, giữ phiên đăng nhập hệ điều hành, kiểm tra máy không sleep. Không chạy thêm `npm start` song song. Các file service nằm trong `data/systemd`; nếu đổi đường dẫn repo/Node, chạy lại `laptop:setup` và `host:install` khi không thu điểm danh.

## B. Đến trường: kiểm tra trước khi thu điểm danh

1. Laptop và vài điện thoại vào **USTH_CONNECT**, hoàn tất đăng nhập Wi‑Fi.
2. Tìm IPv4 của card Wi‑Fi và thử đường kết nối:

```bash
npm run campus:test
```

Lệnh tự nhận IP Wi-Fi và mở QR trên laptop; dùng điện thoại quét QR. Trang chỉ kiểm tra kết nối, tự đóng sau 5 phút. Nếu không vào được, kiểm tra firewall/client isolation/VLAN cùng IT. Probe thành công chưa thay cho thử HTTPS/Google.

3. Mở `https://HOSTNAME_THAT:8443/readyz` từ điện thoại, phải nhận `{"ok":true}`. Sau đó mở trang chính, thử Google TA và sinh viên, kiểm tra MSSV/QR/mã nhập trên laptop/receipt/Sheet.
4. Dùng mạng khách/4G: phải bị chặn theo tiêu chí đã chốt. Kiểm tra cả nguồn IPv4/IPv6 thực tế nếu có.
5. Thử nhiều điện thoại, rồi tăng tải trên môi trường thử. Benchmark local không chứng minh độ ổn định Wi‑Fi thật. Không đo tải tổng hợp cạnh buổi đang điểm danh chính thức.

Chỉ chia sẻ **URL HTTPS chung** cho các TA/sinh viên sau khi nghiệm thu. `localhost` trên điện thoại là điện thoại, không phải laptop host.

## C. Mỗi buổi học

| Thời điểm | Người host làm |
| --- | --- |
| Trước giờ học | Cắm sạc, giữ nắp mở; kiểm tra IP/DNS/chứng chỉ, app/Caddy, `/readyz`, Sheets; backup và roster |
| Trước khi quét | Nhắc sinh viên đăng nhập sớm; TA bấm **Mở QR điểm danh**, mặc định 8 phút, chiếu trong phòng |
| Trong phiên | Giữ laptop/Wi‑Fi hoạt động; không reboot, cập nhật, đổi config hoặc chạy benchmark; theo dõi lỗi và hỗ trợ TA |
| Sau buổi | Đối chiếu kết quả/Sheets, backup; dừng app khi đã hoàn tất |

```bash
python3 scripts/backup-db.py data/web-live.sqlite data/backups
npm run host:stop
```

Backup trên cùng laptop cần được chép sang nơi lưu riêng được trường cho phép. Khi đổi laptop/khôi phục, giữ database và cấu hình đúng; không tạo database mới để cùng ghi vào Sheet hiện tại. [Backup và phục hồi](USTH-HOSTING.vi.md#backup-và-phục-hồi).

## Xem lỗi khi app không chạy

```bash
npm run host:status
journalctl --user -u bp-attendance-laptop.service -n 50 --no-pager
curl --fail http://127.0.0.1:4180/readyz
```

Nếu localhost hoạt động nhưng điện thoại không vào được, kiểm tra Caddy, DNS, chứng chỉ, firewall và đường mạng. Nếu app báo thiếu biến, sửa `.env` rồi restart service khi không có buổi đang thu. Giữ database; không xóa để thử sửa lỗi.

Thao tác giao diện: **[Hướng dẫn TA có ảnh](TA-GUIDE.vi.md)**. Giới hạn và số liệu thực đo: [LOAD-TEST.vi.md](LOAD-TEST.vi.md), [WEB-VALIDATION.md](WEB-VALIDATION.md).
