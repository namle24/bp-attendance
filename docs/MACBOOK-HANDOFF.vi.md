# Bàn giao BP Attendance sang MacBook

Cập nhật ngày **17/10/2026**, múi giờ **Asia/Ho_Chi_Minh**. Tài liệu này tóm tắt
code và các quyết định trong cuộc chat để tiếp tục làm việc; không phải transcript
nguyên văn. Đọc cùng [README](../README.md) và [AGENTS.md](../AGENTS.md).

## Trạng thái code

- Repo: <https://github.com/namle24/bp-attendance>, nhánh `main`, công khai.
- Trước lần bàn giao này, máy Linux và `origin/main` cùng ở
  `b27fb4ef622a5640b2111be31a59c4198f5c25bd`; không có code chưa commit.
- Bản sửa gần nhất giữ form điểm danh hiển thị trong lúc kiểm tra QR. Các bản
  trước đó giữ giao diện đầy đủ làm mặc định và xử lý việc tải/gửi chậm trên host.
- Lần bàn giao chỉ bổ sung tài liệu, hướng dẫn cho agent và gói dữ liệu riêng;
  không đổi hành vi ứng dụng.
- Đã chạy trên Linux, Node **24.19.0**, npm **11.17.0**:
  `npm run check` pass, `npm test` **90/90 pass** ngày 17/10/2026.
- Workflow `.github/workflows/windows.yml` kiểm tra Windows, macOS và Linux.
  Kết quả chạy trên MacBook thật cần được xác nhận trên máy mới.

## Lấy code và bắt đầu trên MacBook

Cài Git và Node.js **24+**; phiên bản yêu cầu được ghi trong `package.json`.
Lần clone đầu:

```bash
git clone https://github.com/namle24/bp-attendance.git
cd bp-attendance
npm ci
npm run check
npm test
```

Nếu đã clone, dừng app rồi dùng `git pull --ff-only` và `npm ci`.
Không chép `node_modules` hoặc các binary Linux sang macOS.

Nếu muốn tiếp tục dữ liệu lớp hiện có, khôi phục gói riêng theo phần dưới **trước
khi chạy app lần đầu**. Sau đó:

```bash
npm start
```

Có thể dùng `Start-macOS.command`. Trang TA mặc định ở
`http://127.0.0.1:4181`; sinh viên dùng IP Wi-Fi/cổng 4180 được app hiển thị.
Chọn mạng của lớp khi app hỏi, giữ Terminal mở, Ctrl+C để dừng. Không mặc định
interface macOS là `en0`. Xem [hướng dẫn host](HOST-QUICKSTART.vi.md).

## Gói dữ liệu riêng đi kèm

Trên máy Linux, gói đã chuẩn bị nằm tại
`data/macbook-handoff-2026-10-17.zip`. Gói này không nằm trên GitHub; chuyển riêng
sang MacBook bằng phương thức chuyển file của bạn. Nó chứa:

- `macbook-handoff/PRIVATE-CONTEXT.vi.md`: link Sheet thực tế, các quyết định,
  các ca cần kiểm tra và kết quả từng lần nhập trong chat.
- `macbook-handoff/csv/`: ba file CSV nguồn đã dùng ngày 07/10 và 14/10.
- `macbook-handoff/runtime/web-live.sqlite`: snapshot database hiện tại, tạo bằng
  SQLite backup API, gồm dữ liệu WAL đã commit và đã kiểm tra tính toàn vẹn.
- `macbook-handoff/config/macbook.env`: cấu hình LAN dùng đường dẫn tương đối
  và tự chọn Wi-Fi; `config/linux.env` giữ nguyên cấu hình cũ để tham khảo.
- `macbook-handoff/MANIFEST.json`: thời điểm, nguồn và SHA-256 của các file.
- `macbook-handoff/RESTORE.vi.md`: chi tiết khôi phục và các giới hạn của snapshot.

Trong clone **mới**, chưa chạy app và chưa có database/cấu hình riêng, giải nén
gói từ Downloads vào `data/`, rồi kiểm tra manifest:

```bash
mkdir -p data
unzip ~/Downloads/macbook-handoff-2026-10-17.zip -d data
python3 data/macbook-handoff/verify.py
```

Đọc `data/macbook-handoff/RESTORE.vi.md` rồi sao chép snapshot và cấu hình vào
đúng vị trí. Hướng dẫn riêng có kiểm tra để không ghi đè dữ liệu mới. Python 3
chỉ dùng để kiểm tra/khôi phục và backup, không cần để chạy app.

Đây là snapshot tại lúc tạo gói. Nếu máy Linux còn nhận thêm điểm danh hoặc TA
còn sửa dữ liệu sau đó, cần lấy snapshot mới trước khi chuyển host. Chạy một host
cho dữ liệu lớp; giữ nguyên bản gốc trên máy cũ đến khi đã kiểm tra máy mới.

Không mang `data/bin/caddy`, `data/systemd/`, cache hay `node_modules` của Linux
sang làm runtime macOS. Khóa Google không có trong repo. Nếu tiếp tục dùng công
cụ Google Drive để chỉnh Sheet, kết nối tài khoản có quyền với Sheet trên máy
mới. Tài khoản dịch vụ cho chức năng app là cấu hình riêng, xem
[cấu hình Sheets](WEB-SETUP.vi.md) và [tra cứu MSSV](STUDENT-LOOKUP.vi.md).

## Context công việc từ cuộc chat

Công việc gần nhất là tổng hợp các file check-in vào tab kết quả TA quản lý.
Người dùng đã yêu cầu tự bổ sung sinh viên còn thiếu và đã chọn rõ:
**các lượt cần xác nhận/thiếu đối chiếu phải ghi `Cần đối chiếu` để TA kiểm tra tay**.
Không cần hỏi lại lựa chọn này cho mỗi file.

| Nguồn | Phần đã hoàn thành tại lần kiểm tra trong chat |
| --- | --- |
| Online 07/10/2026 | 151 bạn `Có mặt`, gồm một bạn được thêm mới vào danh sách |
| Offline 07/10/2026 | 121 bạn `Có mặt`, 20 bạn `Cần đối chiếu`; bỏ bản ghi thử, gộp lượt trùng |
| Lecture 6, 14/10/2026 | 335 lượt nguồn được gộp thành 332 danh tính: 331 `Có mặt`, 1 `Cần đối chiếu` do tên/MSSV mâu thuẫn |

Các số trên là **kết quả của từng đợt nhập**, không luôn bằng tổng của cột vì
người dùng cũng tự điền điểm danh. Không nhập lại những đợt đã hoàn thành hoặc
thay đổi kết quả rà soát tay dựa trên số liệu cũ. Cần đọc Sheet hiện tại khi có
yêu cầu tiếp theo. Các chỉnh sửa qua Google Drive trong chat diễn ra trực tiếp
trên Sheet, không tự ghi lại vào database của app.

Tên file nguồn, link đích, lỗi nhập cụ thể và một ca chưa xử lý của 14/10 nằm
trong context riêng. Chưa có yêu cầu tính vắng cho những ô trống, đổi lịch sử các
ngày khác, hoặc tự xác nhận các ca chờ TA.

## Bản đồ code và cách tiếp tục

| Phần | Điểm bắt đầu |
| --- | --- |
| Khởi động đa nền tảng | `scripts/start.cjs`, `scripts/portable-host.cjs`, `scripts/laptop-setup.cjs` |
| Server LAN và luật điểm danh | `web/server.cjs`, `web/lan-app.cjs`, `web/lan-store.cjs`, `web/lan-rounds.cjs` |
| QR, chọn mạng, IP | `web/lan-qr.cjs`, `web/lan-config.cjs`, `web/network-discovery.cjs` |
| Giao diện sinh viên/TA | `web/lan-public/`, `web/projector/` |
| Tra cứu Sheet và đồng bộ | `web/student-lookup.cjs`, `web/sheets.cjs` |
| Kiểm thử | `tests/`, `npm test`, `npm run check` |

SQLite giữ lịch sử, phiên, bí mật và cấu hình của host. Các module Google-login
cũ vẫn có kiểm thử, nhưng không phải luồng sinh viên mặc định hiện tại. Giữ form
đầy đủ dùng được khi JavaScript hoặc host phản hồi chậm; không vô tình đưa giao
diện đơn giản trở lại làm mặc định.

Có thể dùng lời nhắn sau để mở công việc trên máy mới:

> Đọc AGENTS.md và docs/MACBOOK-HANDOFF.vi.md. Nếu có, đọc thêm
> data/macbook-handoff/PRIVATE-CONTEXT.vi.md để nắm context điểm danh. Kiểm tra
> trạng thái repo hiện tại và tiếp tục theo yêu cầu mới; các file 07/10 và 14/10
> đã được nhập, không chạy lại hoặc ghi đè các ca tôi đã kiểm tra tay.
