# BP Attendance · Phiên bản Forms ban đầu

Tài liệu lưu của phiên bản Forms. Bản QR động + chặn mạng hiện tại có hướng dẫn tại [README](../README.md).

Công cụ điểm danh cho lớp Basic Programming hybrid. Sinh viên offline quét QR mở Google Form, đăng nhập Google, nhập MSSV và mã buổi. Apps Script lấy email **đã xác thực** từ Google, so khớp chính xác với danh sách lớp rồi tổng hợp sang Google Sheets.

Mỗi ngày học là **một cột mới**, ví dụ `2026-09-09`, `2026-09-16`. Công cụ ghi kết quả ngay trong buổi, thường sau một vài phút; không cần đợi ngày hôm sau. Cột ngày chỉ xuất hiện khi mở phiên hoặc nhập điểm danh online, không tự tạo một cột mỗi ngày lịch.

## Bắt đầu

- [Phương án để họp với giảng viên](PROPOSAL.vi.md)
- [Chống điểm danh hộ: kiểm tra thẻ, giới hạn QR/Wi‑Fi và nhân lực](ANTI-PROXY.vi.md)
- [Cài vào tài khoản USTH và Google Sheet](SETUP.md)
- [Quy trình từng buổi và xử lý lỗi](RUNBOOK.md)
- [Mẫu danh sách lớp — toàn bộ là dữ liệu giả](../examples/roster.csv)

Xem giao diện bằng dữ liệu giả, không cần cài thư viện:

```bash
cd bp-attendance
npm run demo
```

Mở `http://127.0.0.1:4173`. Bấm **Mở điểm danh → Chiếu QR**; **Đồng bộ ngay** mô phỏng số người đã gửi. QR demo dùng `example.invalid`, không phải Form thật. Dừng bằng Ctrl+C.

Xem ảnh demo: [bảng điều khiển](demo-dashboard.png) · [màn chiếu QR](demo-projector.png). Kết quả và phạm vi kiểm tra: [VALIDATION.md](VALIDATION.md).

## Có trong bản này

- Tạo một Form offline mới cho mỗi ngày; chuẩn bị trước, mở trong ngày học, đóng sớm hoặc hết hạn sau 2–30 phút.
- QR tạo ngay trong trình duyệt từ thư viện được lưu trong repo. Không gửi link điểm danh sang dịch vụ QR khác.
- Google Forms `VERIFIED`; công cụ kiểm tra lại chế độ này khi mở và đồng bộ. Không chấp nhận email do sinh viên tự gõ làm bằng chứng danh tính.
- Đối chiếu cặp email–MSSV theo `BP_Roster`; không đoán đuôi email USTH hoặc suy MSSV từ email.
- Gửi lại để sửa MSSV trong cửa sổ mở; chỉ lần hợp lệ đầu tiên cho một MSSV/buổi được tính. Gửi trùng vẫn lưu nhật ký.
- Tự đồng bộ theo lô mỗi phút khi có phiên hoạt động; khóa ngăn hai lần đồng bộ cùng ghi; chạy lại không nhân bản kết quả.
- Nhập danh sách online đã được trợ giảng đối chiếu; gộp trùng, báo MSSV ngoài lớp, ghi nguồn kiểm tra. Chưa có kết nối Zoom/Meet hoặc tính thời lượng tự động.
- Điều chỉnh có lý do, người sửa và thời gian; dữ liệu điều chỉnh được giữ khi đồng bộ lại.
- Tải bảng qua Google Sheets → File → Download → Microsoft Excel (.xlsx).

| Ký hiệu | Ý nghĩa |
| --- | --- |
| OFF | Điểm danh offline hợp lệ hoặc trợ giảng đã xác nhận |
| ON | Có trong danh sách online trợ giảng đã kiểm tra |
| BOTH | Cùng ngày có cả online và offline; cần đối chiếu |
| V | Trợ giảng đã xác nhận vắng |
| EXCUSED | Nghỉ có phép theo xác nhận của trợ giảng |
| Ô trống | Chưa ghi nhận; chưa kết luận vắng |

## Giới hạn cần biết

Đây là mã nguồn và demo cục bộ. **Chưa triển khai trên tài khoản USTH, chưa chạy với Google Form/Sheet thật và chưa thử tải 700 người đồng thời.** Cần có danh sách chính thức, quyền tạo Form/Apps Script và bật Google Forms API trong Cloud project của trường. Hướng dẫn cài có phương án Forms thủ công nếu chưa kịp cấu hình.

QR + email chứng minh tài khoản gửi, không chứng minh vị trí trong phòng. Người ở xa vẫn có thể nhận link/mã do người trong lớp chuyển tiếp. Mã buổi là mã cố định cho phiên, không phải QR luân phiên. Khuyến nghị chỉ chiếu trong phòng, mở khoảng 5–8 phút, kiểm tra thẻ ngẫu nhiên và xử lý ngoại lệ riêng.

Nếu yêu cầu xác minh từng sinh viên, cần bổ sung TA đối chiếu trực tiếp với ảnh trên thẻ; kiểm tra mẫu không đáp ứng mức này. Bản hiện tại chưa có màn quét thẻ hoặc trạng thái riêng cho việc đã xác minh trực tiếp: `OFF` tự động từ Form **không có nghĩa TA đã nhìn thấy sinh viên tại lớp**. Xem đề xuất trong `docs/ANTI-PROXY.vi.md`.

Thời gian hết hạn được kiểm tra bằng timestamp phía Google Forms. Trigger có thể chạy trễ: Form đôi khi vẫn hiển thị đang nhận sau giờ đóng, nhưng bản ghi quá hạn không được tính. Thông báo gửi Form thành công chỉ xác nhận đã lưu câu trả lời; trợ giảng xem kết quả đối chiếu tại Sheets.

Không đổi chế độ email sang `Responder input`, bật sửa câu trả lời, sửa/xóa phản hồi gốc hoặc thay đổi mốc phiên đã mở. Việc kiểm tra cấu hình hiện tại không chứng minh cấu hình trong quá khứ; nếu Form từng bị đổi trong khi nhận, phải kiểm tra thủ công các phản hồi của khoảng đó.

## Cấu trúc và kiểm thử

```text
apps-script/Code.gs          Tạo Form, mở/đóng phiên, đồng bộ, menu Sheets
apps-script/Core.gs          Luật đối chiếu, chống trùng, ma trận ngày
apps-script/Panel.html       Bảng điều khiển và màn chiếu QR
apps-script/Qr.html          qrcode-generator 2.0.4 được lưu kèm
apps-script/appsscript.json  Múi giờ và quyền Google
tests/                      Kiểm thử cục bộ; không truy cập tài khoản thật
scripts/demo.cjs             Máy chủ demo chỉ nghe localhost
docs/                       Hướng dẫn triển khai và sử dụng
```

```bash
npm test
npm run check
```

Không có server riêng, cơ sở dữ liệu riêng hoặc mật khẩu sinh viên trong ứng dụng. Google Forms giữ phản hồi gốc; `BP_Log` giữ kết quả kiểm tra; `BP_Attendance` là bảng tổng hợp có thể dựng lại. Không sửa trực tiếp bảng tổng hợp vì sẽ được tạo lại ở lần đồng bộ sau.

Thư viện QR dùng giấy phép MIT, xem [thông tin bản quyền](QR-LICENSE.txt).
