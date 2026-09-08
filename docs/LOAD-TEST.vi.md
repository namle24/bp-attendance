# Đo tải điểm danh · 08/09/2026

Bản web sau tối ưu nhận đủ **700 lượt gửi dồn trong 1,96–1,98 giây** ở cả ba lần đo cục bộ. Tuy nhiên một lần đo 300 lượt mất **7,88 giây**; chưa xác định nguyên nhân của độ trễ bất thường này. Không dùng kết quả trung bình để cam kết độ trễ tối đa hoặc khả năng không gián đoạn trên hosting thật.

Đây là kết quả API khi sinh viên đã đăng nhập, chưa bao gồm Google login, HTTPS hoặc Wi‑Fi tại USTH.

## Luồng nhập mã trên máy tính

Sau khi bổ sung mã nhập 8 ký tự, chạy riêng mức **700 lượt nhập mã**, ba lần, ngày 08/09/2026. Lượt đầu hoàn tất trong **3,48 / 3,29 / 3,28 giây**, p95 **3,26 / 3,07 / 3,08 giây**. Gửi lại 700 lượt trong **2,11 / 2,00 / 2,02 giây**; tất cả trả bản ghi đã tồn tại. Đủ **4.200/4.200 yêu cầu**, mở lại SQLite vẫn đúng 700 sinh viên mỗi lần.

Luồng này ghi thêm quota nhập mã theo Google subject vào SQLite, vẫn giữ WAL/FULL và Sheets writer ở trạng thái chờ. Máy đo dùng chung với kiểm tra trình duyệt trong một phần thời gian, nên không dùng chênh lệch này để kết luận hiệu năng tương đối với QR. Đây vẫn là HTTP localhost với phiên đăng nhập tạo trước, chưa đo Wi‑Fi/Google/HTTPS của lớp. Báo cáo: [load-2026-09-08-code.json](load-2026-09-08-code.json).

Chạy lại riêng luồng mã:

```bash
BP_BENCH_METHOD=code BP_BENCH_COUNTS=700 npm run bench:web -- /tmp/bp-code-load.json
```

## Kết quả QR sau tối ưu

Tra danh tính theo chỉ mục thay vì đọc cả roster, dọn bảng quota theo chu kỳ, chỉ cấp quota riêng cho phiên đăng nhập hợp lệ. Giữ SQLite WAL/FULL, điều kiện xác thực và kiểm tra QR.

| Sinh viên gửi dồn | Thời gian nhận đủ phản hồi của từng lần | Thành công |
| --- | --- | --- |
| 100 | 0,36 / 0,34 / 0,35 giây | 100/100 cả 3 lần |
| 300 | 0,88 / 1,10 / **7,88 giây** | 300/300 cả 3 lần |
| 700 | 1,97 / 1,96 / 1,98 giây | 700/700 cả 3 lần |

Ở mức 700, p95 là 1,83–1,86 giây; gửi lại đủ 700 lượt trong 0,63–0,66 giây, không tạo bản ghi trùng. Cả 9 đợt và lượt gửi lại (6.600 request) thành công, mở lại database vẫn đủ dữ liệu. Báo cáo thô: [load-2026-09-08-hardened.json](load-2026-09-08-hardened.json).

Lần 300 lượt chậm vẫn giữ nguyên trong báo cáo. Máy đo dùng chung tài nguyên với môi trường làm việc; phép đo chưa thu đủ chỉ số CPU/ổ đĩa để quy nguyên nhân cho hạ tầng hay mã nguồn. Mục tiêu phản hồi trong 5 giây chưa đạt ở mọi đợt trên máy đo. Khi nghiệm thu cần ghi nhận cả độ trễ bất thường, theo dõi I/O/CPU và tải kéo dài trên máy chủ dự kiến; không chỉ kiểm tra một đợt 700 lượt.

## Kết quả trước tối ưu

Mỗi mức tải chạy ba lần, mỗi lần dùng database mới. Thời gian tính từ lúc phát yêu cầu đầu tiên đến lúc nhận đủ phản hồi, bao gồm tạo kết nối HTTP và lưu SQLite.

| Sinh viên gửi dồn | Thành công mỗi lần | Thời gian nhận đủ phản hồi | p95 độ trễ mỗi yêu cầu |
| --- | --- | --- | --- |
| 100 | 100/100 | 0,38–0,42 giây | 0,35–0,38 giây |
| 300 | 300/300 | 1,26–1,33 giây | 1,18–1,24 giây |
| 700 | 700/700 | 3,38–3,59 giây | 3,18–3,34 giây |

Ngay sau mỗi đợt, gửi lại toàn bộ lượt điểm danh: tất cả trả thành công với cờ bản ghi đã tồn tại, không nhân đôi. Với mức 700, lượt gửi lại hoàn thành trong 1,95–2,06 giây. Sau khi đóng rồi mở lại SQLite vẫn đủ đúng số sinh viên của mỗi lần đo. Tổng cộng 6.600 yêu cầu, gồm 3.300 lượt đầu và 3.300 lượt gửi lại, không có lỗi HTTP hoặc thiếu bản ghi.

## Cách đo và phạm vi

- Máy đo: Intel Core i5-9300H 2,40 GHz, RAM hệ thống 8 GiB, Node.js v24.19.0. Server chạy một process; bộ phát tải chạy ở process riêng trên cùng máy.
- HTTP chỉ tới `127.0.0.1`, không qua TLS, reverse proxy, Internet hay Wi‑Fi. Các yêu cầu được phát cùng một đợt, không chia nhóm 100. Với 700 yêu cầu, thời gian phát cả đợt là 41–71 ms; hệ điều hành vẫn có thể xếp hàng kết nối.
- SQLite nằm trong thư mục tạm trên filesystem, dùng WAL và `synchronous=2` (FULL), không dùng database `:memory:`. Không đo độ bền khi mất điện hoặc hiệu năng ổ đĩa máy chủ khác.
- Tài khoản, roster và phiên đăng nhập được tạo trước khi bấm giờ. **Không đo đăng nhập Google**, tải trang, camera hoặc JavaScript của 700 trình duyệt.
- Dùng middleware kiểm tra mạng, cookie, CSRF, danh sách lớp, chữ ký QR và ghi điểm danh của ứng dụng. Mọi yêu cầu mô phỏng cùng một IP campus sau proxy tin cậy, để kiểm tra việc nhiều người dùng chung đường ra mạng.
- Đồng hồ chạy thật, dùng cùng mã QR mới phát với hạn tối đa 30 giây cho lượt đầu và lượt gửi lại. Chưa đo trường hợp nhiều người gửi sát thời điểm mã hết hạn; những lượt đó có thể cần quét lại.
- Giữ hàm ghi Sheets ở trạng thái chờ suốt các đợt gửi. Trạng thái `busy` và `pending` vẫn đúng trong khi đủ receipt được trả; Sheets không nằm trên đường xử lý mỗi lượt điểm danh. Không gọi hoặc đo Google Sheets thật. Dữ liệu vẫn còn chờ sau khi snapshot cũ được giải phóng.
- Roster của mỗi lượt đo bằng số người gửi. Chưa đo dữ liệu nhiều học kỳ, tải kéo dài, khởi động lại khi đang gửi hoặc khả năng chịu lỗi của hosting.

Kết quả thô: [load-2026-09-08.json](load-2026-09-08.json). Không chứa tài khoản, cookie hoặc dữ liệu sinh viên thật.

## Chạy lại

```bash
npm run bench:web
# Ghi báo cáo JSON ra đường dẫn lựa chọn:
npm run bench:web -- /tmp/bp-attendance-load.json
```

Script chỉ mở cổng ngẫu nhiên trên localhost, tự tạo/xóa SQLite tạm, không dùng `.env` hoặc database đang vận hành. Mỗi lần chạy mất khoảng một đến vài phút tùy máy. Không chạy phép đo cạnh lớp đang điểm danh vì hai process dùng chung tài nguyên máy. Script không nhận URL đích; muốn đo qua mạng trường cần một kế hoạch thử trên môi trường riêng.

## Vận hành lớp đông

Cho sinh viên kết nối Wi‑Fi và đăng nhập trước; mở phiên điểm danh 5–8 phút. **30 giây là tuổi mã QR, không phải thời hạn để cả lớp hoàn tất**: màn chiếu liên tục đổi mã trong phiên. Nếu 700 lượt phân bố trong 5 phút thì trung bình khoảng 2,33 lượt/giây; vẫn cần chuẩn bị cho đợt gửi dồn như phép đo trên.

Ứng dụng lưu vào SQLite trước rồi đồng bộ Sheets khoảng 15 giây/lần khi có thay đổi. Bình thường tương đương khoảng 4 lần ghi bảng mỗi phút, cộng các yêu cầu tạo/mở rộng tab hoặc đồng bộ thủ công. Google công bố hạn mức mặc định 60 yêu cầu ghi/phút/người dùng/project và 300/phút/project; service account được tính là một người dùng. Ghi theo lô giúp tránh 700 lệnh ghi Sheets riêng. [Nguồn Google Sheets](https://developers.google.com/workspace/sheets/api/limits).

Trước buổi thật, IT cần kiểm tra số thiết bị Wi‑Fi hoạt động đồng thời trong phòng; thử Google USTH và luồng đầy đủ qua HTTPS trên hosting dự kiến. Tăng số người thử dần, kiểm tra độ trễ, lỗi và số bản ghi/Sheet. Các bước nghiệm thu còn lại ở [WEB-SETUP.vi.md](WEB-SETUP.vi.md). Kết quả trên đủ cho thấy API có thể xử lý đợt 700 lượt trên máy đo, chưa kết luận Wi‑Fi, Google login và hosting thật cũng đạt cùng kết quả.
