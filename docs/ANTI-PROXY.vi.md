# Hạn chế điểm danh hộ: phải kiểm tra điều gì?

**Cập nhật phương án đã chọn:** bản `web/` đã có QR 30 giây, Google USTH và cổng kiểm tra CIDR phía server. Chưa triển khai trên mạng USTH; xem [WEB-SETUP.vi.md](WEB-SETUP.vi.md). Các phương án kiểm tra trực tiếp bên dưới là lớp bổ sung khi cần xác minh người thật. Bảng tình huống đầu tiên nói về email + QR chưa có lớp mạng.

**Đề xuất khi ưu tiên kiểm tra sự có mặt:** TA xác nhận trực tiếp sinh viên bằng ảnh trên thẻ trường, công cụ hỗ trợ tìm MSSV/quét mã và ghi vào Sheets. QR tự điền là bước thu thập thông tin, chưa thay thế xác nhận này.

Ứng dụng xác thực tài khoản Google rồi ghép email–MSSV. Tài khoản đăng nhập chưa chứng minh chính chủ đang ở phòng học. [Xác thực Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

Mã nhập 8 ký tự trên laptop đổi cùng QR mỗi 30 giây và dùng cùng các điều kiện danh tính/mạng. Giới hạn 10 lần nhập/phút/tài khoản hạn chế đoán mã; mã vẫn có thể bị chuyển tiếp trực tiếp như ảnh QR.

## Các tình huống phải phân biệt

| Tình huống | Email trường + QR ngắn hạn có ngăn được không? | Lớp kiểm tra cần thêm |
| --- | --- | --- |
| Sinh viên A nhập MSSV của B nhưng dùng email A | Có, nếu đối chiếu chính xác cặp email–MSSV | Đã có trong bản hiện tại |
| B ở nhà, A chuyển link/mã cho B | Không, B vẫn gửi bằng tài khoản thật | Kiểm tra tại phòng; giới hạn mạng có thể hỗ trợ |
| A ở lớp đăng nhập thêm tài khoản B | Không | Đối chiếu người thật với ảnh trên thẻ của MSSV được ghi nhận |
| A mang thẻ hoặc điện thoại của B đến điểm danh | Chỉ quét mã vẫn không đủ | TA nhìn ảnh thẻ và người xuất trình |
| Sinh viên điểm danh rồi rời lớp | Điểm danh một lần không phát hiện được | Nếu môn yêu cầu theo dõi thời lượng, thêm kiểm tra vào thời điểm khác theo quy trình đã thông báo |

## Phương án A: TA xác nhận từng sinh viên

Quy trình đề xuất cho phần offline:

1. Sinh viên chuẩn bị thẻ trường có ảnh, theo từng hàng/nhóm; có thể tổ chức lúc vào lớp hoặc lúc lớp làm bài tập để tránh dồn hàng ở cửa.
2. TA đối chiếu ảnh trên thẻ với người xuất trình và xem MSSV. Không chỉ nhận ảnh chụp màn hình một mã do người khác gửi.
3. Nếu thẻ có barcode/QR đọc được MSSV, TA dùng máy quét hoặc camera công cụ để nhập nhanh. Cần xem mẫu thẻ và định dạng mã trước khi triển khai; chưa giả định thẻ USTH có loại mã nào. Nếu không có mã phù hợp, tìm/nhập MSSV từ danh sách chính thức.
4. Công cụ hiển thị tên/MSSV tương ứng; TA xác nhận sau khi đối chiếu. Mỗi MSSV chỉ được ghi nhận một lần cho phiên, kèm người kiểm tra và thời gian. Người dùng sinh viên không có quyền tự gọi thao tác xác nhận.
5. Người không có thẻ hoặc gặp lỗi được chuyển sang danh sách cần kiểm tra, xác minh riêng theo cách thầy cho phép. Lỗi kỹ thuật hoặc thiếu thẻ chưa tự động đồng nghĩa gian lận.

Điểm ngăn điểm danh hộ là **TA đối chiếu người thật với danh tính của MSSV**, không phải bản thân QR trên thẻ. Cách này vẫn phụ thuộc chất lượng thẻ và việc kiểm tra của TA; không tuyên bố loại bỏ mọi gian lận.

Ước lượng nhân lực minh họa, giả định mỗi lượt mất **4–6 giây**, chưa tính người quên thẻ hoặc ùn tắc:

| Sinh viên offline | Một TA | Hai TA, chia đều và làm song song |
| --- | --- | --- |
| 100 | Khoảng 7–10 phút | Khoảng 3–5 phút |
| 300 | Khoảng 20–30 phút | Khoảng 10–15 phút |
| 500 | Khoảng 33–50 phút | Khoảng 17–25 phút |

Đây là phép tính lập kế hoạch, chưa phải số đo thực tế. Gần 700 là tổng hybrid, cần số offline để chốt. Một TA offline vừa xác minh vài trăm người trong vài phút vừa hỗ trợ debug là yêu cầu khó đáp ứng; cần thêm thời gian hoặc người kiểm tra.

**Trạng thái triển khai:** có điều chỉnh `OFF` kèm người sửa, thời gian và lý do cho trường hợp đã check thẻ. Chưa có camera/luồng kiểm tra thẻ hàng loạt. `OFF` tự gửi là kết quả kiểm tra Google + mạng + QR/mã nhập, chưa tự đồng nghĩa đã check thẻ.

## Phương án B: ít nhân lực, chấp nhận kiểm tra chọn mẫu

Giữ email trường + QR của phiên; sau khi hết cửa sổ gửi, chọn ngẫu nhiên trong danh sách đã gửi để yêu cầu xuất trình thẻ tại phòng. Không cho sinh viên tự biết trước ai được miễn kiểm tra. TA lưu kết quả kiểm tra và xử lý ngoại lệ theo quy trình của môn.

Đây là cơ chế phát hiện và răn đe, không xác minh từng người. Ví dụ chọn ngẫu nhiên 20 trong 300 người: với một trường hợp điểm danh hộ cụ thể, xác suất được chọn ở buổi đó chỉ là `20/300 ≈ 6,7%`. Không nên mô tả một mẫu 10–20 thẻ là bảo đảm chống điểm danh hộ cả lớp. Chọn thêm người có dấu hiệu bất thường có thể hỗ trợ, nhưng dấu hiệu kỹ thuật không tự chứng minh vi phạm.

## Các lớp kỹ thuật có thể bổ sung

| Lớp | Giá trị | Giới hạn |
| --- | --- | --- |
| QR đổi khoảng 20–30 giây trong một phiên vài phút | Hạn chế dùng lại ảnh/link cũ | Vẫn có thể chuyển tiếp tức thời; cần kiểm tra hạn ở server, không chỉ đổi ảnh trên màn hình |
| Chỉ chấp nhận yêu cầu qua mạng trường được IT xác nhận | Hạn chế gửi trực tiếp từ mạng ở nhà | Chưa chứng minh đúng phòng hoặc đúng người; cần làm rõ campus VPN và các đường truy cập từ xa |
| Dữ liệu xác thực/kết nối Wi‑Fi do IT cung cấp đúng phạm vi | Có thể bổ sung bằng chứng tài khoản/thiết bị kết nối ở thời điểm học | Khả năng thu thập và mức chi tiết chưa được xác minh tại USTH; thiết bị hiện diện chưa chắc chủ tài khoản hiện diện |
| GPS trình duyệt | Có thể dùng như một tín hiệu hỗ trợ | Không dùng làm bằng chứng quyết định: trình duyệt có khả năng mô phỏng tọa độ |
| Cookie “một thiết bị – một MSSV” | Có thể cảnh báo đổi tài khoản trên cùng trình duyệt | Đổi trình duyệt, xóa dữ liệu hoặc dùng máy khác có thể bỏ qua; không phải khóa theo thiết bị đáng tin |

Chrome cung cấp tính năng mô phỏng vị trí trong DevTools, nên tọa độ web không phải bằng chứng chống giả mạo. [Tài liệu Chrome](https://developer.chrome.com/docs/devtools/sensors).

Không dùng “một IP chỉ điểm danh một MSSV”: nhiều thiết bị có thể chung địa chỉ ra Internet qua NAT/NAPT. [RFC 3022](https://www.rfc-editor.org/rfc/rfc3022). Chưa xác minh thiết kế mạng cụ thể của USTH.

Bản web trong repo có kiểm tra CIDR, QR luân phiên và xác thực Google phía server; cần cấu hình/kiểm thử trên hạ tầng thật. Cách xác thực token dựa trên [hướng dẫn Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Ghi nhận rõ loại bằng chứng trong phiên bản nâng cấp

Nên giữ riêng `tự gửi hợp lệ` và `TA đã đối chiếu trực tiếp`, kèm người kiểm tra, thời gian, lý do bổ sung. Nếu môn yêu cầu xác minh tất cả sinh viên, chỉ đánh dấu có mặt chính thức sau bước TA xác nhận. Nếu môn chấp nhận chọn mẫu, báo cáo phải thể hiện rõ người được kiểm tra và người chưa được kiểm tra; không nâng độ tin cậy của cả lớp từ kết quả một mẫu.

Đây là đề xuất nâng cấp, chưa đổi cách tính điểm danh của bản code hiện tại. Các giới hạn của bản hiện tại vẫn được ghi trong README.

## Quy trình để có căn cứ khi đối chiếu

Nên để giảng viên thống nhất và thông báo trước: hình thức điểm danh, yêu cầu xuất trình thẻ, thời gian kiểm tra, xử lý lỗi mạng/thiết bị, cách xin sửa kết quả và người được quyết định. Nhật ký cần đủ để giải thích kết quả và sửa sai; không tự đặt mức phạt hoặc coi một cảnh báo tự động là kết luận điểm danh hộ.

Chưa có quy định hiện hành của USTH về chế tài điểm danh hộ trong nguồn được cung cấp. Tài liệu này là đề xuất vận hành, không xác nhận một quy trình cụ thể đã được trường phê duyệt hoặc đáp ứng mọi yêu cầu pháp lý.
