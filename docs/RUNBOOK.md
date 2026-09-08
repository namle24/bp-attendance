# Vận hành hàng tuần

Quy trình bên dưới áp dụng cho bản Form + kiểm tra mẫu. Nếu môn yêu cầu xác minh sự có mặt của từng sinh viên, cần quy trình TA đối chiếu ảnh thẻ trong [ANTI-PROXY.vi.md](ANTI-PROXY.vi.md); Form hợp lệ hoặc ô `OFF` tự động chưa thay thế bước đó.

Lịch theo thông tin giảng viên: thứ Tư, 13:00–15:45. Nếu bắt đầu ngày mai tính từ 08/09/2026, buổi đầu là **09/09/2026**. Chọn ngày thực tế nếu lịch thay đổi; ứng dụng không khóa cứng chỉ cho thứ Tư.

## Trước lớp

1. Dùng tài khoản chủ vận hành mở Sheet → menu BP → Bảng điều khiển. Kiểm tra số sinh viên trong roster và tình trạng trigger.
2. Tạo phiên nháp cho ngày học. Kiểm tra quyền Responders của Form mới; sinh viên phải đăng nhập tài khoản USTH nằm trong danh sách.
3. Kiểm tra QR bằng điện thoại/tài khoản thử trong buổi thử riêng. Đảm bảo Wi‑Fi hoặc mạng dự phòng dùng được. Chuẩn bị giấy cho ngoại lệ.

## Trong lớp

1. Mở phiên 5–8 phút khi lớp ổn định; bấm Chiếu QR. Chỉ đưa màn QR lên máy chiếu trong phòng.
2. TA offline hỗ trợ đăng nhập, kiểm tra thẻ ngẫu nhiên và ghi ngoại lệ. TA online xử lý tên đăng nhập theo `MSSV - Họ tên` và theo dõi tham dự.
3. Khi hết giờ, QR tự ẩn theo đồng hồ trình duyệt. Timestamp từ Google Forms quyết định hợp lệ; đồng hồ trên màn hình chỉ hỗ trợ hiển thị. TA có thể bấm Đóng phiên sớm.
4. Trước khi ngừng trình chiếu, thông báo sinh viên gặp lỗi đến gặp TA để được kiểm tra thẻ; không yêu cầu cung cấp mật khẩu.

## Sau lớp

1. Đồng bộ ngay. Xem `BP_Log`: `ACCEPTED`, `DUPLICATE`, `EMAIL_MISMATCH`, `UNKNOWN_STUDENT`, `WRONG_CODE`, `OUTSIDE_WINDOW`.
2. Với ngoại lệ đã kiểm tra, dùng **Bổ sung / điều chỉnh có lý do**. Không sửa trực tiếp `BP_Attendance` hoặc thay kết quả trong log. Muốn sửa một điều chỉnh cũ, thêm điều chỉnh mới; bản mới nhất được dùng.
3. TA online nhập danh sách MSSV đã đối chiếu báo cáo tham dự, ghi nguồn và tiêu chí; bấm Kiểm tra MSSV trước khi ghi. Mỗi dòng là MSSV hoặc `MSSV - Họ tên`; không dán CSV Zoom thô chưa chọn cột.
4. Kiểm tra `BOTH` và các ô trống. Nếu xác nhận vắng, điều chỉnh `V`; nếu có phép, `EXCUSED`. Không coi ô trống tự động là vắng.
5. Tải Excel nếu thầy cần: File → Download → Microsoft Excel (.xlsx). Google Sheets là bản đang cập nhật; file Excel tải xuống là bản chụp tại thời điểm xuất.

## Các tab

| Tab | Ai/cách ghi |
| --- | --- |
| BP_Roster | TA nhập và quản lý danh sách chính thức |
| BP_Sessions | Công cụ quản lý từng phiên và mốc mở/đóng; không sửa tay |
| BP_Log | Công cụ thêm nhật ký; không xóa/sửa để giữ khả năng đối chiếu |
| BP_Overrides | Công cụ ghi điều chỉnh qua bảng điều khiển |
| BP_Attendance | Công cụ dựng bảng theo MSSV và ngày; có thể tái tạo từ log/điều chỉnh |

Đây là nhật ký trong Google Sheet, **không phải nhật ký chống sửa bởi quản trị viên**. Người có quyền sửa Sheet có thể sửa code/dữ liệu. Chỉ cấp quyền sửa cho người vận hành đáng tin; giữ lịch sử phiên bản và bản xuất theo quy trình của môn. Không công khai email/danh sách lớp.

## Lỗi thường gặp

| Hiện tượng | Xử lý |
| --- | --- |
| API 403 | Kiểm tra Forms API đã bật ở đúng Cloud project, quyền OAuth và tài khoản được trường cho phép |
| Sinh viên không mở được Form | Kiểm tra đã mở phiên, đã publish, tài khoản Google đang đăng nhập và quyền Responders/domain |
| `EMAIL_MISMATCH` | So email Google thực tế với roster; không suy email từ MSSV; kiểm tra alias và tài khoản cá nhân |
| Có lỗi mã số hoặc trùng roster | Sửa danh sách chính thức; người đã bị loại cần gửi lại trong giờ hoặc TA điều chỉnh có lý do |
| Form nhận nhưng Sheet chưa có | Xem thông báo lỗi bảng điều khiển, Apps Script → Executions; thử Đồng bộ ngay |
| Chủ file tạo trigger nhưng TA khác tạo Form | Chia sẻ quyền sửa Form cho tài khoản chạy trigger; nên dùng một chủ vận hành tạo các Form |
| Hai TA bấm cùng lúc, báo bận | Chờ vài giây rồi thử lại; khóa ngăn ghi trùng |
| Form còn nhận sau giờ | Trigger có thể trễ; code loại timestamp quá hạn. Bấm Đóng phiên để đóng giao diện ngay |
| Trigger hỏng hoặc mạng Google lỗi lâu | Phản hồi vẫn ở Forms; sau khi khắc phục chọn menu Đồng bộ lại toàn bộ |
| Phiên hết hạn hơn 15 phút không tự đọc nữa | Cơ chế nghỉ để tiết kiệm quota; dùng Đồng bộ lại toàn bộ để lấy bù dữ liệu cũ |
| Muốn mở lại phiên đóng | Bản này giữ nguyên mốc lịch sử; xử lý bổ sung qua điều chỉnh, không mở lại |
| Đã đổi Form sang email tự nhập trong buổi | Đóng phiên, kiểm tra thủ công phản hồi khoảng đó; kiểm tra mode hiện tại không chứng minh được mode trong quá khứ |

Không xóa phản hồi gốc trong Forms. Đồng bộ lại chỉ đọc phản hồi chưa có trong log; không tự đánh giá lại phản hồi cũ hoặc hủy điểm danh khi xóa phản hồi gốc. Các thay đổi kết quả phải qua điều chỉnh có lý do.

## Khi mất mạng cả phòng

TA ghi MSSV vào danh sách giấy sau khi xem thẻ; thầy xác nhận cách xử lý của buổi. Sau lớp, nhập từng ngoại lệ `OFF` với lý do ghi rõ xác nhận qua thẻ/phiếu. Nếu số lượng lớn, giữ danh sách giấy để đối chiếu và thống nhất cách nhập theo quy trình của thầy; bản này chưa có nhập hàng loạt ngoại lệ offline.

## Kỹ thuật vận hành

Một trigger mỗi phút, chỉ gọi Forms trong thời gian phiên hoạt động và 15 phút sau khi đóng. Khi không có phiên, trigger thoát ngay. Thời gian này và độ trễ đồng bộ là lựa chọn triển khai, không phải cam kết SLA. Apps Script có hạn mức runtime/quota; theo dõi Executions trong buổi thử.

Ghi `BP_Log` trước, rồi dựng lại `BP_Attendance`. Nếu ghi bảng tổng hợp thất bại, nhật ký đã ghi được dùng lại khi retry. Khóa toàn script phối hợp thao tác giữa TA và trigger; nó không ngăn người dùng sửa ô trực tiếp trong Sheets. Trong khi đồng bộ, tránh sửa tay các tab quản lý.
