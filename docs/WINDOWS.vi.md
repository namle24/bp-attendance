# Chạy trên Windows

Bản 0.5 dùng cùng launcher với macOS/Linux. Lỗi “Không liên kết được service” của bản cũ đã được xử lý; không cần cài systemd trên Windows. Cần Node.js 24 trở lên.

## Cập nhật và mở

Dừng cửa sổ app đang chạy bằng Ctrl+C. Mở CMD/PowerShell tại thư mục `bp-attendance`:

```text
git pull --ff-only
npm start
```

Hoặc nhấp đúp **Start-Windows.bat**. App tự cài thư viện nếu thiếu (lần đầu cần Internet), chuẩn bị dữ liệu và mở trang TA. Không cần chạy riêng `laptop:setup` hoặc `host:install`.

Nếu có nhiều kết nối hoặc tên card chưa nhận diện được, chọn Wi-Fi trên trang **Chọn mạng của lớp**. Không phải mở `.env` để chọn mạng. Wi-Fi đổi tên vẫn được tìm qua loại phần cứng của Windows; khi Windows chặn truy vấn này, màn chọn mạng vẫn dùng được.

Mở **http://127.0.0.1:4181** trên laptop nếu trình duyệt chưa tự bật. Bấm **Mở QR điểm danh** khi lớp sẵn sàng. QR và mã cho sinh viên dùng máy tính đổi mỗi 30 giây.

**Giữ CMD mở, cắm sạc, giữ máy thức. Ctrl+C để dừng.** App chạy trực tiếp, không cài Windows service hoặc tự chặn sleep.

## Điện thoại không mở được link

Laptop và điện thoại dùng cùng Wi-Fi, đăng nhập captive portal của trường. Link sinh viên phải là IP Wi-Fi cổng 4180 trên màn chiếu, không phải localhost.

Nếu laptop vào được nhưng điện thoại không vào được, kiểm tra Windows Firewall cho phép TCP 4180 từ subnet lớp tới laptop; kiểm tra client isolation/VLAN với IT nếu cần. Không tắt toàn bộ firewall hoặc mở cổng TA 4181 ra mạng. Sau khi đổi Wi-Fi/IP, Ctrl+C rồi mở app lại.

## Thử gửi với database riêng

Dừng app, mở cửa sổ CMD thử:

```bat
set "BP_DATABASE=./data/campus-check.sqlite"
node --env-file-if-exists=.env -e "process.env.GOOGLE_SHEET_ID='';require('./scripts/start.cjs').start().catch(e=>{console.error(e.message);process.exitCode=1})"
```

PowerShell:

```powershell
$env:BP_DATABASE='./data/campus-check.sqlite'
node --env-file-if-exists=.env -e "process.env.GOOGLE_SHEET_ID='';require('./scripts/start.cjs').start().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Lệnh tắt sync để dữ liệu thử không vào Sheet lớp. Thử xong Ctrl+C và **đóng cửa sổ thử**; mở cửa sổ mới rồi `npm start` để trở về database lớp. Không xóa database lớp để thử mở lại phiên trong ngày.

Xem [hướng dẫn host chung](HOST-QUICKSTART.vi.md), [thao tác TA có ảnh](TA-GUIDE.vi.md) và [Sheets tùy chọn](WEB-SETUP.vi.md).
