# Đo tải luồng LAN

## Lịch sử 0.4 · Laptop Linux · 08/09/2026

700 biểu mẫu MSSV/họ tên/ghế gửi gần đồng thời tới server trong tiến trình riêng. SQLite nằm trên đĩa, WAL, `synchronous=FULL`. Tất cả kết nối có cùng IP socket loopback; cả 700 MSSV phải được gắn cờ trùng IP. Writer Sheets bị giữ chờ suốt đợt gửi để kiểm tra việc nhận điểm danh không phụ thuộc Google.

| Lần chạy | Gửi thành công | Hoàn thành cả đợt | p95 từng request | Gửi lại | Bản ghi sau mở lại DB |
| --- | --- | --- | --- | --- | --- |
| 1 | 700/700 | 2.073 s | 1.911 s | 700/700 | 700 |
| 2 | 700/700 | 2.067 s | 1.923 s | 700/700 | 700 |
| 3 | 700/700 | 2.057 s | 1.915 s | 700/700 | 700 |

Tổng **4.200/4.200 request** kể cả gửi lại, không tăng số bản ghi khi retry. Mỗi lần chạy dùng database riêng và kiểm tra lại đủ 700 bản ghi sau khi đóng/mở. RAM RSS tiến trình server cuối đợt: 128–141 MiB. Chi tiết CPU, Node và các thời gian: [báo cáo JSON](load-2026-09-08-lan.json).

## Lịch sử 0.4 · Windows CI · 09/09/2026

Windows Server 2025, Node 24.19.0, chạy cùng script với server và bộ phát tải trong hai tiến trình riêng, SQLite trên đĩa WAL/FULL, Sheets giữ chờ. Không giãn các lượt gửi hoặc tự thử lại lỗi kết nối.

| Lần chạy | Gửi thành công | Hoàn thành cả đợt | p95 từng request | Gửi lại | Bản ghi sau mở lại DB |
| --- | --- | --- | --- | --- | --- |
| 1 | 700/700 | 18.224 s | 17.067 s | 700/700 | 700 |
| 2 | 700/700 | 5.173 s | 4.908 s | 700/700 | 700 |
| 3 | 700/700 | 3.831 s | 3.624 s | 700/700 | 700 |

Tổng **4.200/4.200 request** được nhận, đủ bản ghi sau mở lại database. Cả 700 bản ghi được gắn cờ cùng IP. Cùng lần CI, **21/21 kiểm thử** khởi động Windows, lưu/khôi phục, API và báo cáo đạt. Xem [lần chạy thực tế](https://github.com/namle24/bp-attendance/actions/runs/34315646676) và [số liệu JSON](load-2026-09-09-windows.json).

Thời gian dao động đáng kể; lần đầu gần ngưỡng chờ 20 giây của giao diện sinh viên bản 0.4. Bản 0.5 dùng tối đa 45 giây cho thao tác gửi. Script tải dùng timeout 45 giây. Kết quả không bảo đảm cùng tốc độ trên laptop Windows 10/11 của giảng viên. Cần đo trên máy host và Wi-Fi thật; khi chưa nhận được biên nhận, giao diện giữ lượt gửi để gửi lại an toàn.

## Chạy lại phép đo

```bash
npm run bench:web
BP_BENCH_COUNTS=700 node scripts/bench-web.cjs data/reports/load-lan.json
```

Mặc định đo 100, 300, 700, mỗi mức 3 lần. Script chỉ dùng database tạm, không gọi Google, không dùng dữ liệu lớp.

**Giới hạn:** phép đo HTTP loopback chưa gồm tải trang/ảnh trên điện thoại, Wi-Fi/captive portal USTH, AP đông người hoặc Sheets API thật. Đây là bằng chứng server xử lý được đợt đo trên laptop này, không phải cam kết website không bao giờ sập. Vẫn cần nghiệm thu mạng trường và giữ máy hoạt động.

Các file báo cáo trước `load-2026-09-08.json`, `-hardened.json`, `-code.json` là phép đo luồng Google/QR trước thay đổi, chỉ giữ làm lịch sử. Không dùng chúng thay cho kết quả LAN trên đây.
