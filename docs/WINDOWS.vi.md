# Hướng dẫn chạy trên laptop Windows · Giảng viên và TA

Laptop host và sinh viên cùng kết nối Wi-Fi của lớp. App lưu điểm danh trên laptop, chiếu QR động và xuất CSV để mở bằng Excel. Bản 0.8 hỗ trợ nhiều đợt trong một ngày, mở lại đợt, chiếu QR trong tab riêng và tra cứu kết quả từ Google Sheet. Không cần cấu hình Google Sheets để bắt đầu điểm danh.

## 1. Máy đã có thư mục bp-attendance

Máy đã có Node.js 24.x có thể dùng ngay. Nếu app đang chạy, nhấn **Ctrl+C** trong cửa sổ đang chạy app để dừng trước khi cập nhật.

1. Mở thư mục `bp-attendance` bằng File Explorer.
2. Bấm thanh địa chỉ của thư mục, gõ `cmd`, nhấn Enter. Cửa sổ CMD mở đúng thư mục.
3. Chạy lần lượt:

```bat
node --version
git pull --ff-only
npm start
```

`node --version` cần hiện `v24.x.x` hoặc mới hơn; bản 24 LTS được kiểm thử tự động. Nếu `git pull` báo lỗi, giữ nguyên thư mục và gửi lại thông báo lỗi để xử lý trước khi tiếp tục.

App tự cài thư viện còn thiếu, giữ cấu hình và dữ liệu đã có, rồi mở trình duyệt. Sau lần cập nhật, các buổi tiếp theo chỉ cần nhấp đúp **Start-Windows.bat** hoặc chạy `npm start`.

Lỗi cũ **“Không liên kết được service”** đã được xử lý. Luồng hiện tại dùng `npm start`; không cần chạy `host:install` hoặc cài service Windows.

## 2. Máy cài lần đầu

1. Cài **Node.js 24 LTS** từ [trang tải chính thức](https://nodejs.org/en/download): chọn Windows và bộ cài `.msi` phù hợp với máy. Cài xong mở lại CMD nếu đang mở.
2. Vào [repo BP Attendance](https://github.com/namle24/bp-attendance), chọn **Code → Download ZIP**.
3. Chọn **Extract All / Giải nén tất cả**, lưu thư mục vào vị trí sẽ dùng lâu dài. Mở thư mục đã giải nén có `package.json` và `Start-Windows.bat`.
4. Kết nối Internet cho lần chạy đầu, rồi nhấp đúp **Start-Windows.bat**. Chờ app cài thư viện và mở trang TA.

Cách tải ZIP không cần Git. Nếu máy đã cài Git, có thể lấy mã bằng CMD:

```bat
cd /d "%USERPROFILE%"
git clone https://github.com/namle24/bp-attendance.git
cd bp-attendance
npm start
```

Thư mục tải ZIP không dùng được `git pull`. Khi cập nhật bản ZIP: dừng app, sao lưu `data` và `.env`, giải nén bản mới ở nơi khác rồi chép nội dung mã nguồn vào **đúng thư mục app đang dùng**, cho phép thay thế file mã nguồn. Giữ nguyên `data` và `.env` để giữ lịch sử và cấu hình. Không mở app trực tiếp bên trong file ZIP.

## 3. Bắt đầu điểm danh tại trường

1. Laptop kết nối **USTH_CONNECT**, hoàn tất đăng nhập mạng trường. Điện thoại/máy tính sinh viên cũng cần hoàn tất đăng nhập mạng.
2. Nhấp đúp **Start-Windows.bat**. Nếu hiện **Chọn mạng của lớp**, chọn card Wi-Fi đang dùng.
3. Trang TA tự mở. Nếu chưa mở, vào **http://127.0.0.1:4181** trên chính laptop host.
4. Kiểm tra ngày, chọn thời lượng, nhập tên đợt nếu muốn (ví dụ `Đầu giờ`), rồi bấm **Mở QR điểm danh**.
5. Tab chiếu QR mở riêng. QR và mã 8 ký tự đổi mỗi **30 giây**.
6. Sinh viên quét QR bằng điện thoại, hoặc mở địa chỉ và nhập mã đang chiếu trên máy tính; điền **MSSV, họ tên, vị trí ngồi**, rồi gửi.
7. Kiểm tra biên nhận có đúng ngày/đợt và bản ghi xuất hiện trong bảng TA. Bảng TA cập nhật khoảng mỗi 10 giây.

**Giữ cửa sổ CMD mở, cắm sạc và giữ laptop thức suốt buổi.** App không tự ngăn Windows sleep. Đổi Wi-Fi hoặc IP thì Ctrl+C, mở app lại và dùng QR mới.

Địa chỉ sinh viên do **laptop đang host** hiển thị, gồm `http://` và cổng `:4180`. Không dùng IP của laptop khác hoặc đường dẫn localhost cho điện thoại. Google Sheets chưa cấu hình vẫn lưu được dữ liệu và tải CSV.

## 4. Chiếu QR qua HDMI

1. Cắm HDMI, chọn đúng nguồn HDMI trên máy chiếu.
2. Nhấn **Windows + P → Extend** để dùng máy chiếu làm màn hình riêng. [Hướng dẫn màn hình của Microsoft](https://support.microsoft.com/en-us/windows/hardware/display-graphics/how-to-use-multiple-monitors-in-windows).
3. Kéo tab QR ra khỏi thanh tab để thành **cửa sổ riêng**, rồi kéo cửa sổ đó sang màn hình máy chiếu. Giữ bảng TA ở màn hình laptop để theo dõi.
4. Trên cửa sổ QR, bấm **Toàn màn hình**; nhấn Esc để thoát. Có thể dùng F11 nếu trình duyệt không cho bật bằng nút.

Nếu trình duyệt chặn tab mới, bấm **Mở tab chiếu QR**. Nếu đã đóng cửa sổ QR, bấm **Chiếu QR** trên bảng TA để mở lại.

Nếu Windows chưa nhận máy chiếu, kiểm tra dây/nguồn HDMI và vào **Settings → System → Display → Multiple displays → Detect**. Có thể quét QR trực tiếp trên màn hình laptop để thử kết nối Wi-Fi trước khi xử lý máy chiếu. Các thao tác màn hình theo [hướng dẫn Microsoft](https://support.microsoft.com/en-us/windows/hardware/display-graphics/how-to-use-multiple-monitors-in-windows).

## 5. Điểm danh giữa giờ, cuối giờ và xuất Excel

| Việc cần làm | Thao tác trên bảng TA |
| --- | --- |
| Nhận một đợt mới, mọi sinh viên phải gửi lại | **Đóng đợt** đang nhận → nhập tên như `Giữa giờ` → **Mở đợt mới** |
| Nhận bổ sung vào đợt đã đóng của hôm nay | Đóng đợt đang nhận nếu có → chọn đợt trong **Xem đợt điểm danh** → chọn thời lượng → **Mở lại đợt đang xem** |
| Xem các dòng trùng IP | Mở **Cần xử lý**, đối chiếu tại ghế và lưu quyết định TA |
| Xuất một ngày hoặc toàn bộ | **Lịch sử & xuất dữ liệu** → chọn ngày hoặc **Tất cả các ngày** → tải bảng tổng/chi tiết CSV |
| Kết thúc | **Đóng đợt**, tải báo cáo cần dùng, rồi Ctrl+C trong CMD |

Chỉ một đợt nhận điểm danh tại một thời điểm. Mở lại giữ những lượt đã gửi; mở đợt mới yêu cầu quét mã và gửi lại. Bảng tổng vẫn một cột/ngày, ghi **Đã gửi 2/3 đợt**, kèm trạng thái cần đối chiếu. **TA quyết định kết quả cuối buổi.**

CSV mở được bằng Excel, gồm các cột trạng thái và ghi chú; CSV không giữ màu. Dữ liệu các ngày giữ trong `data/web-live.sqlite` theo cấu hình mặc định. Giữ nguyên thư mục app qua các buổi; không xóa database để mở đợt mới. Xem [hướng dẫn TA có ảnh](TA-GUIDE.vi.md).

## 6. Xử lý nhanh khi không mở được

Bản mới gửi yêu cầu tương thích với trình duyệt thiếu `AbortSignal.timeout()` và xác nhận QR ngay khi mở link. Nếu quét lần đầu chưa vào nhưng quét lại được, mở link trực tiếp trong Chrome/Safari, giữ nguyên Wi-Fi và thử mã đang chiếu. Nút thử lại giữ lượt gửi để tránh tạo bản ghi trùng. Lỗi trước khi tải được trang vẫn cần kiểm tra kết nối mạng trên thiết bị thực tế.

| Hiện tượng | Cách xử lý |
| --- | --- |
| `node` không được nhận diện hoặc yêu cầu Node 24 | Cài Node.js 24 LTS, đóng và mở lại CMD hoặc `Start-Windows.bat` |
| PowerShell báo `npm.ps1 ... running scripts is disabled` | Dùng CMD như bước 1, nhấp đúp `Start-Windows.bat`, hoặc dùng `npm.cmd start` trong PowerShell |
| `git` không được nhận diện / `not a git repository` | Dùng hướng dẫn cài/cập nhật ZIP ở bước 2; lệnh `git pull` chỉ dùng cho bản đã clone bằng Git |
| Cổng đang được sử dụng | Tìm cửa sổ app cũ, Ctrl+C để dừng rồi mở lại; chỉ chạy một app trên laptop |
| Laptop mở được, điện thoại tải mãi | Kiểm tra cùng Wi-Fi, hoàn tất đăng nhập mạng, mở đúng URL sinh viên bằng Chrome/Safari, có `http://` và `:4180` |
| Điện thoại vẫn không truy cập được | Kiểm tra Windows Firewall cho phép TCP 4180 từ subnet lớp trên mạng đang dùng; nhờ IT kiểm tra nếu trường chặn kết nối giữa thiết bị |
| Đổi mạng rồi QR không mở được | Ctrl+C, mở app lại để lấy IP mới và chiếu QR mới |

App không tự sửa Windows Firewall. Chỉ cổng sinh viên 4180 cần nhận kết nối từ mạng lớp; cổng TA 4181 dùng riêng trên laptop. Không tắt toàn bộ firewall để thử.

## 7. Thử trước buổi học bằng database riêng

Để thử quét/gửi mà không lẫn vào điểm danh thật, dừng app, mở một **cửa sổ CMD mới** trong thư mục app và chạy:

```bat
set "BP_DATABASE=./data/campus-check.sqlite"
node --env-file-if-exists=.env -e "process.env.GOOGLE_SHEET_ID='';require('./scripts/start.cjs').start().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Nếu dùng PowerShell:

```powershell
$env:BP_DATABASE='./data/campus-check.sqlite'
node --env-file-if-exists=.env -e "process.env.GOOGLE_SHEET_ID='';require('./scripts/start.cjs').start().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Lệnh dùng database thử và tắt đồng bộ Sheets. Mở QR, gửi một lượt bằng điện thoại thật, kiểm tra biên nhận đúng ngày/đợt và lượt đó xuất hiện trong bảng TA.

Thử xong **Ctrl+C và đóng cửa sổ thử**. Nhấp đúp `Start-Windows.bat` để chạy với database lớp. Dữ liệu thử vẫn được giữ ở file riêng.

Kiểm thử tự động trên [Windows, macOS và Linux](https://github.com/namle24/bp-attendance/actions/workflows/windows.yml) bao gồm khởi động, QR, lưu dữ liệu và tải 700 sinh viên qua hai đợt. Cần thử thêm điện thoại trên chính laptop Windows và Wi-Fi phòng học; kết quả CI không đo đường truyền của phòng. Xem [kết quả tại trường và phép đo tải](LOAD-TEST.vi.md), [backup dữ liệu](HOST-QUICKSTART.vi.md) và [Sheets tùy chọn](WEB-SETUP.vi.md).

## 8. Bật tra cứu kết quả cho sinh viên

Trong **Lịch sử & xuất dữ liệu**, dán link Google Sheet của tab TA sửa, giữ phần `gid`, nhập tên tab rồi **Lưu nguồn tra cứu**. Với link đã có quyền xem, app đọc được ngay. Sinh viên mở **Tra cứu MSSV** trên trang điểm danh; kết quả lấy từ Sheet, có thời gian cập nhật. Xem [hướng dẫn tra cứu](STUDENT-LOOKUP.vi.md). Mỗi laptop host lưu cấu hình nguồn riêng.

## 9. Đối chiếu vị trí lớp (tùy chọn)

Mặc định sinh viên quét QR, nhập MSSV, họ tên và ghế rồi gửi; không xin quyền GPS. Chỉ khi TA bật và lưu **Kiểm tra vị trí lớp**, sinh viên mới có nút mở tab HTTPS để lấy vị trí. Để tắt cho đợt mới, đóng đợt đang mở, bỏ chọn đối chiếu vị trí, lưu rồi mở đợt mới. Mở lại đợt giữ nguyên thiết lập cũ. Máy host vẫn chạy bằng `npm start`, không cần mua tên miền/cài chứng chỉ. Xem [hướng dẫn đầy đủ](LOCATION-CHECK.vi.md).

## 10. Tìm và lọc danh sách

Bản 0.8.1 thêm tìm MSSV/họ tên/ghế/IP và lọc theo trạng thái, trùng IP, vị trí, ngày/đợt trên trang TA. CSV danh sách/chi tiết/cần xử lý áp dụng bộ lọc đang chọn; bảng tổng CSV giữ đủ kết quả của ngày. Xem [hướng dẫn có ảnh](TA-FILTERS.vi.md).
