# Đo tải luồng LAN · 08/09/2026

700 biểu mẫu MSSV/họ tên/ghế gửi gần đồng thời tới server trong tiến trình riêng. SQLite nằm trên đĩa, WAL, `synchronous=FULL`. Tất cả kết nối có cùng IP socket loopback; cả 700 MSSV phải được gắn cờ trùng IP. Writer Sheets bị giữ chờ suốt đợt gửi để kiểm tra việc nhận điểm danh không phụ thuộc Google.

| Lần chạy | Gửi thành công | Hoàn thành cả đợt | p95 từng request | Gửi lại | Bản ghi sau mở lại DB |
| --- | --- | --- | --- | --- | --- |
| 1 | 700/700 | 2.073 s | 1.911 s | 700/700 | 700 |
| 2 | 700/700 | 2.067 s | 1.923 s | 700/700 | 700 |
| 3 | 700/700 | 2.057 s | 1.915 s | 700/700 | 700 |

Tổng **4.200/4.200 request** kể cả gửi lại, không tăng số bản ghi khi retry. Mỗi lần chạy dùng database riêng và kiểm tra lại đủ 700 bản ghi sau khi đóng/mở. RAM RSS tiến trình server cuối đợt: 128–141 MiB. Chi tiết CPU, Node và các thời gian: [báo cáo JSON](load-2026-09-08-lan.json).

```bash
npm run bench:web
BP_BENCH_COUNTS=700 node scripts/bench-web.cjs data/reports/load-lan.json
```

Mặc định đo 100, 300, 700, mỗi mức 3 lần. Script chỉ dùng database tạm, không gọi Google, không dùng dữ liệu lớp.

**Giới hạn:** phép đo HTTP loopback chưa gồm tải trang/ảnh trên điện thoại, Wi-Fi/captive portal USTH, AP đông người hoặc Sheets API thật. Đây là bằng chứng server xử lý được đợt đo trên laptop này, không phải cam kết website không bao giờ sập. Vẫn cần nghiệm thu mạng trường và giữ máy hoạt động.

Các file báo cáo trước `load-2026-09-08.json`, `-hardened.json`, `-code.json` là phép đo luồng Google/QR trước thay đổi, chỉ giữ làm lịch sử. Không dùng chúng thay cho kết quả LAN trên đây.
