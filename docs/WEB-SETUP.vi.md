# Cấu hình LAN và Google Sheets

## `.env`

| Biến | Dùng để làm gì |
| --- | --- |
| `PORT=4180` | Cổng sinh viên trên IP Wi-Fi được chọn |
| `ADMIN_PORT=4181` | Cổng TA, chỉ nghe `127.0.0.1` |
| `LAN_INTERFACE=` | Bỏ trống: app tự nhận Wi-Fi hoặc hiện màn chọn mạng; tên card là tùy chọn nâng cao |
| `CAMPUS_CIDRS=` | Bỏ trống để dùng subnet hiện tại; chỉ điền dải khác khi đã xác nhận với IT |
| `BP_DATABASE=./data/web-live.sqlite` | File SQLite lưu chung qua các buổi |
| `GOOGLE_SHEET_ID=` | Để trống khi chưa cần đồng bộ; điền ID file Sheet khi đã chuẩn bị |
| `GOOGLE_APPLICATION_CREDENTIALS=` | Đường dẫn JSON service account, riêng tư, không commit |

Bí mật QR mới được tạo và lưu tự động trong SQLite, không cần điền khóa.

Luồng LAN không đọc `PUBLIC_ORIGIN`, `BIND_HOST`, `GOOGLE_CLIENT_ID`, `GOOGLE_HOSTED_DOMAINS`, `ADMIN_EMAILS`, `TRUSTED_PROXY_CIDRS` hoặc `QR_SECRET` cũ. Không dùng Caddy trong đường gửi điểm danh mới: app lấy IP từ socket trực tiếp và bỏ qua header IP.

Trên Windows, dùng `/` trong đường dẫn `.env`, ví dụ `C:/Users/ha/bp-attendance/data/secrets/google-service-account.json`. Tìm tên card bằng `npm run network:list`. Xem [hướng dẫn Windows](WINDOWS.vi.md).

## Bật Sheets

1. Trong Google Cloud của lớp, bật Google Sheets API và tạo service account được phép dùng cho công việc này.
2. Lưu file JSON key ở `data/secrets/google-service-account.json` trên laptop, giữ riêng.
3. Tạo một file Google Sheet cho lớp hoặc chọn file được giao. Chia sẻ quyền **Editor** của file đó cho email `client_email` trong service account.
4. Điền `GOOGLE_SHEET_ID` (đoạn giữa `/d/` và `/edit` trong URL) và đường dẫn tuyệt đối của `GOOGLE_APPLICATION_CREDENTIALS` vào `.env`.
5. Ctrl+C rồi chạy `npm start` lại. Bấm **Đồng bộ Sheet** trên trang TA, kiểm tra trạng thái và mở Sheet để nghiệm thu.

App sử dụng scope Sheets, không yêu cầu tài khoản Google của sinh viên. Không đưa key vào README, ảnh chụp, Git hoặc chat. Các bước service account theo [tài liệu xác thực server của Google](https://developers.google.com/identity/protocols/oauth2/service-account).

## Hai tab do app quản lý

**`BP_Web_Attendance`**: MSSV, họ tên, email trường nếu có roster, rồi một cột cho mỗi ngày học. MSSV được giữ dạng chuỗi, gồm số 0 đầu. Không có email vẫn ghi offline bình thường. Cột ngày được tạo khi TA mở buổi học, giữ các ngày trước.

**`BP_Offline_Check`**: ngày, MSSV, họ tên tự nhập, ghế, IP, số MSSV cùng IP, trạng thái, ghi chú TA, người xác nhận, giờ gửi và giờ xác nhận theo Việt Nam. Đây là nguồn chi tiết để giải thích ô đỏ trong bảng tổng.

Bản ghi `Cần TA xác nhận` được tô nền đỏ cả hàng chi tiết và ô ngày tương ứng ở bảng tổng. Xác nhận qua trang TA làm cập nhật trạng thái và bỏ màu đỏ ở lần đồng bộ kế tiếp. Việc định dạng dùng [Sheets batchUpdate / repeatCell](https://developers.google.com/workspace/sheets/api/samples/formatting), không tạo công thức từ nội dung sinh viên nhập.

Các bộ lọc ngày/trạng thái trong app chỉ dùng để xem và tải CSV. Đồng bộ Sheet luôn lấy đầy đủ dữ liệu các buổi đã lưu.

**Không sửa trực tiếp giá trị/màu trong hai tab này.** App ghi lại phần dữ liệu mình quản lý. Muốn ghi chú riêng hoặc hợp nhất Google Form online thủ công, tạo tab khác. Dùng nút **Đối chiếu** trong app để xác nhận và giữ lịch sử; không nhập xác nhận trực tiếp vào Sheet rồi chờ đồng bộ ngược.

App gắn metadata sở hữu tab theo database. Nếu tên tab trùng nhưng không có metadata đúng, app từ chối ghi đè. Dùng tab được app tạo, file Sheet khác, hoặc khôi phục đúng database sở hữu tab; không xóa dữ liệu có sẵn để vượt kiểm tra.

## Mất mạng hoặc lỗi API

Gửi điểm danh thành công nghĩa là SQLite đã commit, không có nghĩa Sheet đã xong. Sync chạy theo lô khoảng 15 giây, có backoff khi lỗi; không gọi Sheets cho từng sinh viên. Cả dữ liệu và màu phải gửi xong thì mới xác nhận revision đã đồng bộ. Lượt gửi mới trong lúc đang sync sẽ nằm ở đợt kế tiếp.

Quota theo tài liệu [Sheets API limits](https://developers.google.com/workspace/sheets/api/limits); gom lượt ghi thành lô giúp tránh 700 lượt API cùng lúc. Khi Sheet lỗi, TA tiếp tục xem bảng tại máy và xuất CSV; sửa cấu hình rồi đồng bộ lại. CSV không giữ định dạng màu.

Tính năng ghi giá trị/màu đã có kiểm thử API giả lập. Cần nghiệm thu với file Sheet và service account thật của lớp trước khi dựa vào đồng bộ; repo không chứa các thông tin truy cập đó.
