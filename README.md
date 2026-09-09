<p align="center"><img src="web/public/assets/usth-logo.png" alt="USTH — Vietnam France University" width="150"></p>

# BP Attendance · USTH

Điểm danh offline trên **Windows, macOS và Linux**, laptop host cùng Wi-Fi với sinh viên. Chạy `npm start`, app tự chuẩn bị dữ liệu và mở trang TA. TA bấm **Mở QR điểm danh**; QR và mã cho máy tính đổi mỗi **30 giây**. Sinh viên quét mã rồi nhập **MSSV, họ tên, vị trí ngồi**.

Kết quả được lưu vào SQLite trước khi trả thông báo thành công. Google Sheets đồng bộ sau, khoảng 15 giây mỗi đợt có thay đổi. Chưa cấu hình Sheets vẫn dùng được app và tải CSV để mở bằng Excel.

**Nhiều MSSV cùng IP trong một buổi:** tất cả bản ghi liên quan được tô đỏ trên bảng TA, tab chi tiết và ô ngày tương ứng của bảng tổng. TA kiểm tra người/thẻ tại ghế ngồi rồi lưu xác nhận trên app. Cùng IP chỉ là cờ đối chiếu; các thiết bị chung NAT có thể cùng IP và một người có thể dùng nhiều IP.

![Bảng TA: cả hai MSSV cùng IP đều cần đối chiếu](docs/web-admin.png)

## Chạy trên laptop

Cài **Node.js 24+** một lần. Trong thư mục repo, chạy:

```text
npm start
```

Lần đầu app tự cài thư viện nếu thiếu (cần Internet), tạo cấu hình và database. Các buổi sau dùng lại lệnh này. Không cần điền `.env`, cài service, Google OAuth hay chứng chỉ để điểm danh LAN.

| Hệ điều hành | Có thể mở bằng file |
| --- | --- |
| Windows | Nhấp đúp `Start-Windows.bat` |
| macOS | Mở `Start-macOS.command`, hoặc dùng `npm start` trong Terminal |
| Linux | Chạy `./start-linux.sh`, hoặc `npm start` |

App tự nhận card Wi-Fi bằng thông tin của hệ điều hành. Nếu chưa xác định được một kết nối duy nhất, trang **Chọn mạng của lớp** mở ra: bấm vào mạng đang dùng. Khi đổi mạng, app lấy IP hiện tại ở lần khởi động mới. Không phải sửa cấu hình thủ công cho luồng mặc định.

![Chọn mạng trên laptop](docs/web-network-picker.png)

- **TA:** trình duyệt tự mở `http://127.0.0.1:4181`; bấm **Mở QR điểm danh** khi lớp sẵn sàng. Bật app không tự tiêu tốn phiên trong ngày.
- **Sinh viên:** quét QR đang chiếu; máy tính mở URL được chiếu và nhập mã 8 ký tự hiện tại. Quét/nhập mã hợp lệ có tối đa 3 phút điền form, không vượt giờ đóng phiên.
- **Dừng:** Ctrl+C trong cửa sổ chạy app. Giữ cửa sổ mở, cắm sạc và giữ máy thức. Luồng chung chạy trực tiếp; dịch vụ Linux nâng cao nằm trong hướng dẫn host.

Cập nhật bản đã clone: dừng cửa sổ app, chạy `git pull --ff-only`, rồi `npm start`. Nếu đang dùng dịch vụ Linux của bản cũ, dừng bằng `npm run service:stop` sau khi cập nhật. Dữ liệu và `.env` cũ được giữ nguyên.

**Tại trường vẫn phải thử điện thoại thật.** Cùng Wi-Fi chưa bảo đảm thiết bị được kết nối tới laptop: client isolation, VLAN hoặc firewall có thể chặn. App không đọc được SSID hoặc tài khoản captive portal của sinh viên. Bản LAN dùng HTTP, dữ liệu truyền chưa mã hóa; cần sử dụng theo yêu cầu mạng của trường. Trang quản lý chỉ nghe trên localhost, không cung cấp qua Wi-Fi.

## Hướng dẫn TA và host

| Việc cần làm | Tài liệu |
| --- | --- |
| Chuẩn bị ở nhà và thử tại trường | [Chuẩn bị trước buổi học](docs/PREPARE-BEFORE-CLASS.vi.md) |
| Mở QR, xem bản ghi đỏ, xác nhận | [Hướng dẫn TA có ảnh](docs/TA-GUIDE.vi.md) |
| Máy Windows của giảng viên/TA | [Windows: sửa lỗi service và chạy app](docs/WINDOWS.vi.md) |
| Cài đặt, chạy, dừng, backup | [Hướng dẫn máy host](docs/HOST-QUICKSTART.vi.md) |
| Bật Google Sheets và hiểu các cột | [Cấu hình Sheets](docs/WEB-SETUP.vi.md) |
| Xử lý mạng trường | [Wi-Fi / LAN](docs/LAPTOP-LAN.vi.md) |
| Căn cứ ghi nhận và giới hạn IP | [Đối chiếu điểm danh](docs/ANTI-PROXY.vi.md) |
| Khả năng chịu tải | [Kết quả đo](docs/LOAD-TEST.vi.md) · [Phạm vi kiểm thử](docs/WEB-VALIDATION.md) |

![Màn chiếu QR và URL cho máy tính](docs/web-projector.png)

| Biểu mẫu sinh viên | Sau khi lưu thành công |
| --- | --- |
| ![Nhập MSSV, họ tên và ghế](docs/web-student-ready.png) | ![Biên nhận](docs/web-student.png) |

Ảnh chụp qua kiểm thử trình duyệt với dữ liệu hư cấu trong database tạm, không đưa vào database lớp. IP localhost/cổng ngẫu nhiên trong ảnh là địa chỉ của kiểm thử; sinh viên thật dùng IP Wi-Fi được máy host in ra.

## Lịch sử theo ngày và danh sách cần xử lý

Trang TA có ba màn: **Điểm danh tại lớp**, **Lịch sử & xuất dữ liệu**, **Cần xử lý**.

- **Lịch sử & xuất dữ liệu:** chọn một ngày hoặc **Tất cả các ngày**, xem các lượt gửi offline và tải bảng tổng/chi tiết CSV. Bảng tổng theo ngày chỉ có một cột ngày và các MSSV có kết quả ngày đó; bản toàn bộ giữ đủ cột của các buổi. Tên file chứa ngày hoặc `all`.
- **Cần xử lý:** danh sách các bản ghi chờ đối chiếu hoặc TA không xác nhận. Lọc theo ngày và trạng thái, xem ghế/IP/lý do, lưu đối chiếu trực tiếp hoặc tải danh sách CSV theo đúng bộ lọc.
- Dữ liệu các ngày cùng lưu trong SQLite trên laptop, giữ nguyên khi khởi động lại. Xem/xuất không sửa dữ liệu gốc hoặc phạm vi đồng bộ Sheet. Bản ghi đã được xác nhận có mặt rời danh sách cần xử lý và vẫn có trong lịch sử.

![Lịch sử và xuất dữ liệu theo ngày hoặc toàn bộ](docs/web-history.png)

![Danh sách chờ đối chiếu và các lượt TA không xác nhận](docs/web-cases.png)

CSV mở được bằng Excel nhưng không giữ màu; cột trạng thái, lý do và ghi chú vẫn được xuất đầy đủ trong báo cáo chi tiết/danh sách cần xử lý. Bảng tổng có cả kết quả online đã nhập; màn lịch sử và CSV chi tiết hiển thị lượt gửi offline của luồng LAN.

## Kết quả và xác nhận

| Kết quả tại một ngày học | Ý nghĩa |
| --- | --- |
| `OFF` | Đã ghi nhận offline; thông tin tự khai hoặc TA đã đối chiếu, xem tab chi tiết |
| `OFF cần xác nhận` + nền đỏ | Trùng IP trong cùng phiên, đang chờ TA đối chiếu |
| `OFF không được xác nhận` | TA đã kiểm tra và không xác nhận, có ghi chú |
| `ON` | Online đã được TA bổ sung sau đối chiếu |
| `BOTH` | Có offline và online cùng ngày, cần đối chiếu cách tính |
| `ON · OFF cần xác nhận` + nền đỏ | Online đã bổ sung; offline còn chờ TA |
| Ô trống | Chưa ghi nhận, chưa kết luận vắng |

`BP_Web_Attendance`: bảng tổng, mỗi ngày học một cột. `BP_Offline_Check`: họ tên đã nhập, ghế, IP, số MSSV cùng IP, trạng thái và ghi chú TA. Bấm **Đối chiếu** trên app để cập nhật; không sửa trực tiếp hai tab do app quản lý vì lần đồng bộ sau sẽ ghi lại dữ liệu. Sheet tổng do lớp tự quản lý có thể đặt ở tab khác.

Mỗi ngày mở một phiên offline, mặc định 8 phút, tùy chọn 5–30 phút; đóng sớm hoặc hết giờ thì không nhận thêm. Gửi lại cùng lượt được trả biên nhận cũ, kể cả sau khi đóng phiên. Cùng MSSV gửi từ lượt khác sẽ báo TA kiểm tra, không tiết lộ biên nhận của người khác. IP được lấy từ kết nối trực tiếp, bỏ qua IP tự khai và các header chuyển tiếp.

Nếu có người thứ ba dùng IP đã được đối chiếu, những bản ghi đã xác nhận trong nhóm sẽ trở lại trạng thái cần đối chiếu. Kết quả TA đã từ chối vẫn được giữ. Ghi chú và lịch sử xác nhận lưu trong database.

Online tiếp tục dùng Google Form riêng. Có thể tổng hợp thủ công ở tab khác; chức năng nhập online đã đối chiếu vẫn có trong mục mở rộng của trang TA. Không kết nối Zoom/Meet hoặc tự theo dõi sinh viên online.

## Kiểm tra mã nguồn

```bash
npm test
npm run check
npm run bench:web
```

Luồng hoạt động: `web/server.cjs` → `lan-config.cjs`, `lan-app.cjs`, `lan-store.cjs`, `lan-public/`. Module Google/QR cũ được giữ để kiểm thử và bảo toàn dữ liệu lịch sử; entry point hiện tại không phục vụ API đăng nhập Google.

`.env`, database, backup và credentials được Git bỏ qua. Giữ chung database qua các buổi; không xóa để mở buổi mới. [Logo và màu giao diện](docs/BRANDING.md).
