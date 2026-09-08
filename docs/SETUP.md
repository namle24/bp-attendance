# Cài vào tài khoản USTH

## 1. Tạo Sheet và script gắn với Sheet

Dùng một tài khoản giảng viên/TA được trường cho phép làm **chủ vận hành**. Tạo Google Sheet mới, ví dụ `BP Attendance 2026`. Chỉ chia sẻ quyền sửa cho giảng viên và các TA thực sự cần; sinh viên nhận link Form, không nhận quyền xem Sheet chứa danh sách cả lớp.

Trong Sheet: **Extensions → Apps Script**. Tạo các file và chép nội dung tương ứng từ thư mục `apps-script/`:

| Loại trong trình soạn thảo | Tên | Nguồn |
| --- | --- | --- |
| Script | Code | `Code.gs` |
| Script | Core | `Core.gs` |
| HTML | Panel | `Panel.html` |
| HTML | Qr | `Qr.html` |

Trong **Project Settings**, bật hiện `appsscript.json` và chép manifest của repo. Múi giờ là `Asia/Ho_Chi_Minh`. Đây là [script gắn với Sheet](https://developers.google.com/apps-script/guides/bound); không cần Deploy web app.

Nếu đã dùng `clasp`: tạo script gắn Sheet qua trình duyệt trước, lấy Script ID, sao chép `.clasp.example.json` thành `.clasp.json`, điền ID rồi đẩy các file bằng `clasp push` sau khi đăng nhập đúng tài khoản. `clasp` là tùy chọn, không cần cài để chép mã thủ công.

## 2. Bật Google Forms API

Code dùng Google Forms API để đặt và kiểm tra `emailCollectionType = VERIFIED`. Apps Script `setCollectEmail(true)` chỉ cho biết thu email; chương trình không dựa riêng vào cờ đó để kết luận danh tính đã xác thực. Google mô tả `VERIFIED` là lấy email tự động từ tài khoản đăng nhập, khác với `RESPONDER_INPUT`. [Tài liệu FormSettings](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms#FormSettings).

1. Trong Google Cloud Console bằng tài khoản chủ vận hành, tạo hoặc chọn **standard Cloud project** do trường cho phép. Cấu hình Google Auth Platform/OAuth consent theo tổ chức; nếu phù hợp, chọn audience Internal. Không dùng cấu hình Test giới hạn ngắn hạn cho công cụ chạy cả kỳ mà chưa kiểm tra thời hạn cấp quyền.
2. Trong Cloud project đó, **APIs & Services → Library → Google Forms API → Enable**.
3. Lấy **Project number** (số, không phải Project ID). Trong Apps Script → Project Settings → Google Cloud Platform Project → Change project, liên kết đúng project đó. Xem [hướng dẫn Google về Cloud project của Apps Script](https://developers.google.com/apps-script/guides/cloud-platform-projects).
4. Chạy `setupAttendance` từ trình soạn thảo một lần và cấp các quyền được khai báo. Công cụ dùng quyền Sheet hiện tại, tạo/đọc Form, đọc/sửa cấu hình Form qua API, chạy trigger, hiển thị bảng điều khiển và lấy email người thao tác cho nhật ký. Sinh viên chỉ đăng nhập Google Forms, không cấp quyền script đọc Sheets của họ.
5. Tải lại Google Sheet. Menu **BP Điểm danh** sẽ xuất hiện.

Nếu tài khoản trường không cho tạo Cloud project hoặc cấp quyền Forms API, cần IT/chủ vận hành cấu hình. Không bỏ bước xác minh email trong code để chạy tạm. Có phương án Forms thủ công ở cuối tài liệu.

## 3. Nhập danh sách lớp chính thức

Trong `BP_Roster`, giữ nguyên hàng tiêu đề; dán dữ liệu từ dòng 2:

| MSSV | Họ tên | Email trường |
| --- | --- | --- |
| 001 | Sinh viên minh họa A | a@school.example |
| 002 | Sinh viên minh họa B | b@school.example |

Các email trên là giả. Thay bằng email Google chính thức; không giả định đuôi `@usth.edu.vn` là đuôi của sinh viên. Mỗi MSSV và email chỉ được xuất hiện một lần. Tài khoản alias cần đối chiếu với email chính mà Google Forms thực sự trả về. Định dạng cột MSSV là **Plain text** trước khi dán để giữ số 0 đầu; nếu Sheets/Excel đã làm mất số 0 thì code không thể đoán lại.

Đừng tự xóa người đã có lịch sử điểm danh khi cập nhật roster. Công cụ dựng lại bảng theo roster hiện hành; log vẫn còn nhưng hàng sinh viên đã xóa sẽ không còn trong báo cáo.

## 4. Cài đồng bộ và thử một phiên

1. Tài khoản **chủ vận hành** chọn menu **3. Cài đồng bộ tự động**. Chỉ một tài khoản cài trigger `syncTick`; các TA khác không tạo trigger riêng. Chủ vận hành nên là người tạo Form; nếu TA khác tạo Form thì phải chia sẻ quyền sửa Form cho tài khoản chạy trigger.
2. Mở **Bảng điều khiển → Chuẩn bị buổi mới**, chọn ngày, tạo phiên nháp. Có thể chuẩn bị trước ngày học; chỉ mở được phiên có ngày hôm nay theo giờ Việt Nam.
3. Bấm **Mở Form để kiểm tra quyền Responders**. Trong Forms, xác nhận thu email **Verified**; tắt cho sửa câu trả lời và tắt công khai thống kê. Trong phần Publish/Responders, giới hạn người trả lời vào domain/nhóm của USTH nếu tài khoản có lựa chọn này; Google có [hướng dẫn phân quyền người trả lời](https://support.google.com/docs/answer/2839588?hl=en).
4. Duyệt quyền trên từng Form mới. Các tùy chọn audience có thể phụ thuộc chính sách Workspace của trường; công cụ không tự đoán domain và không tự sửa quyền chia sẻ của tổ chức. Nếu tạm cho mọi tài khoản Google truy cập, **chỉ email nằm đúng dòng MSSV trong roster mới được tính**, nhưng người ngoài vẫn có thể gửi câu trả lời bị loại.
5. Chọn thời gian 5–8 phút, bấm **Mở điểm danh**, kiểm tra bằng một tài khoản sinh viên. Nếu cần thay đổi audience sau khi mở, đóng phiên và làm buổi thử riêng; không thử lẫn với dữ liệu buổi thật.
6. Bấm **Chiếu QR** để chỉ hiển thị nội dung cho sinh viên. Đăng nhập Google, nhập MSSV và mã, gửi thử. Bấm **Đồng bộ ngay** hoặc chờ khoảng một vài phút, kiểm tra `BP_Log` và `BP_Attendance`.
7. Bấm **Đóng phiên**. Kiểm tra phản hồi quá hạn không được tính. Thử lại vào ngày khác để xác nhận có cột mới và dữ liệu cũ còn nguyên.

Form cho phép gửi lại khi nhập nhầm MSSV. Script tự gộp các lượt hợp lệ trùng MSSV trong một phiên; không cần bật Limit to 1 response. Nếu bật giới hạn này thủ công, người đã gửi nhầm phải nhờ TA điều chỉnh.

## 5. Thử nghiệm trước khi dùng thật

- Thử bằng email chính thức của sinh viên và email cá nhân; email cá nhân không được ghi OFF.
- Dùng email của A nhập MSSV của B; phải có `EMAIL_MISMATCH` trong `BP_Log`.
- Gửi hai lần hợp lệ; chỉ một lượt `ACCEPTED`.
- Gửi sai mã, thử sửa rồi gửi lại; xem phản hồi lỗi của Form.
- Đóng phiên và thử gửi từ tab đã mở sẵn; log quá hạn không được tính nếu Google vẫn nhận.
- Đổi thứ tự danh sách lớp rồi đồng bộ lại; kết quả phải theo MSSV.
- Dùng 10–20 người thử trên Wi‑Fi phòng học, sau đó tăng quy mô nếu có điều kiện. Quan sát thời gian Forms phản hồi, Google Sheets và Executions của Apps Script. Chưa có số đo tải thực tế cho repo này.
- Thử tải Excel, xác nhận MSSV có số 0 đầu và ngày đúng.

Nên dùng một Sheet **thử riêng** để tránh dữ liệu thử trong bảng lớp thật. Mỗi bản sao Sheet cần chủ vận hành kiểm tra quyền và cài trigger của chính bản đó.

## Nếu chưa kịp cài trước buổi đầu

Tạo Google Form thủ công dưới tài khoản trường, đặt **Verified**, giới hạn domain/nhóm, câu hỏi MSSV + mã buổi, tắt sửa câu trả lời và công khai thống kê. Liên kết Responses sang một Google Sheet; dùng chức năng tạo QR của trình duyệt cho link Form. Mở/đóng thủ công trong 5–8 phút, lưu nguyên phản hồi gốc và đối chiếu với danh sách email–MSSV trước khi tính. Chuẩn bị giấy/check thẻ cho người gặp lỗi. Cách này nhận dữ liệu ngay nhưng **chưa tự tổng hợp thành cột ngày**; bản tool làm phần đó sau khi được cấu hình.
