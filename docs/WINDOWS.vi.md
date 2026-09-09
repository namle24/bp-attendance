# Chạy điểm danh trên Windows

Thông báo **“Không liên kết được service”** ở `npm run host:install` của bản cũ xảy ra vì lệnh gọi `systemctl`, chỉ có trong luồng Linux. Node.js 24.x đáp ứng yêu cầu; không cần cài lại Node vì lỗi này.

## Cập nhật và chạy ngay

Mở CMD hoặc PowerShell tại thư mục `bp-attendance` đã clone từ GitHub. Nếu app đang chạy, bấm Ctrl+C trong cửa sổ app trước khi cập nhật.

```text
git pull --ff-only
npm ci
npm run laptop:setup
npm run host:start
```

Bản mới chạy trực tiếp trong terminal trên Windows. `laptop:setup` chuẩn bị `.env` và SQLite, không gọi systemd. `host:install` nếu chạy cũng chỉ chuẩn bị cấu hình, không cài dịch vụ Windows; không bắt buộc chạy thêm lệnh này. Dữ liệu và cấu hình đang có được giữ nguyên.

Đợi terminal in hai địa chỉ:

- **TA trên laptop:** `http://127.0.0.1:4181`.
- **Sinh viên:** `http://IP_WIFI_CUA_LAPTOP:4180`.

Thầy/TA mở địa chỉ localhost trên máy đang host, bấm **Mở QR điểm danh** khi bắt đầu nhận điểm danh. Sinh viên dùng link IP Wi-Fi hoặc quét QR. Bật app không tự mở phiên và không thêm dữ liệu thử.

**Giữ cửa sổ terminal mở. Bấm Ctrl+C trong chính cửa sổ đó để dừng.** Bản Windows này không chạy nền, không tự khởi động lại khi app lỗi và không tự chặn sleep. Cắm sạc, giữ máy thức trong giờ điểm danh. `npm run host:status` ở cửa sổ khác kiểm tra hai cổng có trả lời không; `host:stop` chỉ nhắc cách dừng bằng Ctrl+C, không dừng cửa sổ khác.

## Nếu app chưa chọn được card Wi-Fi

```text
npm run network:list
```

Lệnh in các tên card và IPv4 mà Node nhìn thấy. Bản Windows tự chọn khi có đúng một IPv4 của card tên **Wi-Fi**, **Wi-Fi 2**, **WLAN** hoặc tên thông dụng tương đương. Đây là nhận diện theo tên, không phải kiểm chứng SSID. Card đổi tên hoặc nhiều card Wi-Fi thì chọn thủ công.

Mở `.env`, sửa **dòng đang có** `LAN_INTERFACE=` thành đúng tên được in ra, ví dụ:

```dotenv
LAN_INTERFACE=Wi-Fi
```

Không thêm dòng trùng, không chọn card VPN, Bluetooth hoặc máy ảo. Kết nối Wi-Fi rồi chạy lại `npm run host:start`. Không cần lấy lệnh `ip -br addr` của Linux để chạy trên CMD.

Với đường dẫn file trong `.env`, dùng dấu `/`, ví dụ `C:/Users/ha/bp-attendance/data/secrets/google-service-account.json`. Setup mới tạo đường dẫn theo dạng này để tránh dấu `\n` trong đường dẫn Windows bị hiểu thành xuống dòng.

## Thử điện thoại và firewall

Laptop và sinh viên kết nối cùng Wi-Fi. Có thể thử đường mạng trước bằng:

```text
npm run campus:test
```

Lệnh in URL probe và đường dẫn file `data/reports/wifi-test.html`. Mở file đó bằng trình duyệt trên laptop để điện thoại quét QR. Probe tự đóng sau 5 phút, không ghi điểm danh. Sau đó vẫn phải thử app thật cổng 4180.

Nếu laptop mở được trang nhưng điện thoại không vào được, kiểm tra Windows Firewall cho phép **TCP 4180** từ subnet sinh viên tới laptop, và nhờ IT kiểm tra client isolation/VLAN nếu cần. Không tắt toàn bộ firewall hoặc mở cổng TA 4181 ra mạng. HTTP LAN chưa mã hóa; cấu hình truy cập cần phù hợp mạng trường. Khi đổi Wi-Fi/IP, Ctrl+C rồi khởi động app lại và chiếu QR mới.

## Thử gửi với database riêng

Để không dùng lượt mở phiên của ngày hôm nay trong database lớp, dừng app trước rồi dùng một trong hai cách sau.

**CMD:**

```bat
set "BP_DATABASE=./data/campus-check.sqlite"
set "GOOGLE_SHEET_ID="
node --env-file-if-exists=.env -e "process.env.GOOGLE_SHEET_ID='';require('./web/server.cjs').main().catch(e=>{console.error(e.message);process.exitCode=1})"
```

**PowerShell:**

```powershell
$env:BP_DATABASE='./data/campus-check.sqlite'
node --env-file-if-exists=.env -e "process.env.GOOGLE_SHEET_ID='';require('./web/server.cjs').main().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Sau khi thử, Ctrl+C và **đóng cửa sổ thử**. Mở cửa sổ terminal mới trong repo, chạy `npm run host:start` để quay về database lớp trong `.env`. Lệnh thử buộc tắt sync để dữ liệu thử không đi vào Sheet lớp. Không xóa database lớp.

Dữ liệu vẫn lưu trên laptop nếu chưa cấu hình Sheets; dùng CSV ở màn **Lịch sử & xuất dữ liệu**. Xem [thao tác TA](TA-GUIDE.vi.md) và [cấu hình Sheets](WEB-SETUP.vi.md). Backup trên Windows có thể dùng `py -3 scripts/backup-db.py data/web-live.sqlite data/backups` nếu đã cài Python 3.
