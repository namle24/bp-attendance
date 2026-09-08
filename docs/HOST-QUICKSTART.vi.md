# Chạy BP Attendance trên laptop

Cần Node.js 24+, npm, Git và Python 3. Dịch vụ dưới đây dành cho Linux/systemd, chạy theo user hiện tại và không tự bật khi đăng nhập.

## Cài lần đầu hoặc cập nhật từ bản Google/QR cũ

Nếu đã dùng bản trước, **dừng app và backup database trước khi cập nhật**. Migration chỉ thêm bảng LAN, giữ roster, dữ liệu điểm danh cũ và định danh tab Sheet.

```bash
cd ~/Projects/bp-attendance
npm run host:stop
python3 scripts/backup-db.py data/web-live.sqlite data/backups
```

Với repo mới:

```bash
git clone https://github.com/namle24/bp-attendance.git
cd bp-attendance
npm ci
npm run laptop:setup
npm run host:install
```

Với repo đã có, cập nhật mã từ GitHub rồi chạy lại `npm ci`, `npm run laptop:setup`, `npm run host:install`. Setup giữ nguyên `.env` và database đã tồn tại. Các biến Google login/Caddy cũ không còn là điều kiện chạy LAN. Khi bật dịch vụ mới, Caddy cũ đang chạy sẽ được dừng để IP được lấy trực tiếp từ kết nối sinh viên.

## Bật mỗi buổi

Kết nối **USTH_CONNECT**, cắm sạc. Chạy:

```bash
npm run host:check
npm run host:start
```

Mở **http://127.0.0.1:4181** trên laptop host. Sinh viên dùng IP Wi-Fi được in ra, cổng 4180; không dùng `localhost` trên điện thoại.

App tự tìm một card Wi-Fi có IPv4 và chỉ nghe tại địa chỉ đó. Mạng mặc định là subnet hiện tại của card. Nếu không chọn được một card duy nhất, xem `ip -br addr` và điền `LAN_INTERFACE` trong `.env`. Không dùng card Docker/VPN để phục vụ lớp.

Nếu sinh viên ở subnet khác, cần IT xác nhận routing và dải IP trước khi điền thêm `CAMPUS_CIDRS`. Không mở `/0`, không đưa proxy/VPN Internet vào đường truy cập này. Port TA 4181 chỉ nghe localhost.

`host:start` kiểm tra cả cổng sinh viên lẫn TA trả lời. Lệnh không tự mở phiên điểm danh. Nếu chuyển Wi-Fi hoặc DHCP đổi IP, chạy `host:stop` rồi `host:start`, mở lại trang TA và chiếu link mới. Phiên và bản ghi vẫn giữ trong database.

Không dùng systemd thì chạy `npm start` ở foreground. Giữ terminal, laptop và Wi-Fi hoạt động; Ctrl+C để dừng. Với service, tiến trình được khởi động lại khi lỗi và yêu cầu hệ điều hành chặn sleep/idle/lid sleep. Vẫn cắm sạc và kiểm tra máy không ngủ thực tế.

## Tình trạng, log, dừng và backup

```bash
npm run host:status
journalctl --user -u bp-attendance-laptop.service -n 50 --no-pager
python3 scripts/backup-db.py data/web-live.sqlite data/backups
npm run host:stop
```

Nếu `BP_DATABASE` trỏ chỗ khác, thay đường dẫn backup bằng đúng file đó. Script backup SQLite đang chạy, bao gồm dữ liệu đã commit trong WAL; kiểm tra integrity trước khi xuất file. Không chỉ copy riêng `.sqlite` khi server đang chạy.

Giữ database qua các tuần để tạo cột ngày mới trong cùng bảng tổng. Backup cũng giữ metadata sở hữu Sheet; dùng database khác cho một tab đã được database cũ quản lý sẽ bị từ chối, tránh ghi đè nhầm.

## Chưa cấu hình Sheet

App vẫn ghi thật vào SQLite, có CSV bảng tổng và CSV chi tiết. TA nhìn thấy rõ **Sheet chưa cấu hình**. Để bật tự động đồng bộ, làm theo [cấu hình Sheets](WEB-SETUP.vi.md), khởi động lại service rồi bấm đồng bộ. Không cần Google OAuth, email TA, DNS hay chứng chỉ để chạy bản LAN HTTP này.
