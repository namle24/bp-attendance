# Căn cứ điểm danh và đối chiếu IP

Quy trình hiện tại thu **MSSV, họ tên tự khai, ghế tự khai, thời gian server và IP kết nối** trong phiên TA mở. Không có bước đăng nhập Google sinh viên, ràng buộc email–MSSV hoặc QR đổi mã. Đăng nhập captive portal của USTH không được app đọc hay dùng làm xác thực danh tính.

Cùng mạng, tên họ và ghế đủ để tạo **bản ghi điểm danh**, chưa tự chứng minh đúng người. Quy trình xác nhận có mặt và cách xử lý ngoại lệ cần do giảng viên thống nhất; app hỗ trợ bằng thông tin đối chiếu và lịch sử TA.

| Trường hợp | App xử lý | TA cần hiểu |
| --- | --- | --- |
| 1 MSSV gửi lại cùng lượt | Trả biên nhận cũ, không thêm dòng | Có thể do mất phản hồi mạng |
| Nhiều MSSV cùng IP, cùng phiên | Đỏ tất cả các bản ghi liên quan | Có thể là dùng chung thiết bị, NAT hoặc điểm danh hộ |
| Cùng MSSV gửi từ lượt khác | Chặn ghi đè, yêu cầu TA kiểm tra | Không tiết lộ biên nhận chỉ bằng cách nhập MSSV |
| Cùng IP vào tuần sau | Tính nhóm riêng cho buổi mới | Không gom các tuần thành một lỗi |
| Sinh viên đổi IP / dùng nhiều thiết bị | Có thể không trùng IP với người khác | Khác IP không chứng minh khác người |
| Sinh viên khai ghế tùy ý | Lưu nội dung khai báo | TA kiểm tra tại chỗ, app không tự biết người ngồi ghế |

TA kiểm tra thẻ/MSSV và người tại ghế; nhập ghi chú và xác nhận hoặc không xác nhận trên app. Kết quả có thời gian, lịch sử và đồng bộ vào Sheet. Người mới cùng IP sau khi đã đối chiếu làm những xác nhận cũ trong nhóm cần kiểm tra lại; quyết định từ chối đã lưu vẫn giữ.

Không tự đánh vắng vì trùng IP hoặc thiếu bản ghi. Không kết luận gian lận chỉ vì màu đỏ. Kiểm tra ngẫu nhiên tại chỗ vẫn hữu ích cho cả những bản ghi không có cờ IP.

IP lấy từ socket trực tiếp; cấu hình mạng và giới hạn HTTP được mô tả trong [LAN](LAPTOP-LAN.vi.md). Không có cam kết chống điểm danh hộ tuyệt đối.
