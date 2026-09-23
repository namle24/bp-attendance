# Đo tải luồng LAN

## Bản 0.9.1 · 23/09/2026

Đã đo lại sau khi bổ sung đối chiếu trùng MSSV và tự cập nhật biên nhận. Ba lần chạy riêng, mỗi lần **hai đợt × 700 trình duyệt mô phỏng đồng thời**. Cả **21.000/21.000 request** thành công: tải trang nén, quét, gửi, gửi lại và cập nhật biên nhận. Mỗi database giữ đủ **1.400 bản ghi** sau khi mở lại; retry không sinh thêm bản ghi.

| Nhóm 700 yêu cầu đồng thời | Thời gian hoàn thành cả nhóm |
| --- | --- |
| Tải giao diện | 0,507–1,109 giây |
| Lưu điểm danh | 4,306–4,578 giây |
| Đọc lại biên nhận | 0,605–0,874 giây |

Đây là phép đo HTTP loopback trên laptop, SQLite lưu đĩa WAL/FULL, cùng IP thật của socket, Google Sheets bị giữ chờ. Chưa đo Wi-Fi với 700 thiết bị thật. [Dữ liệu đo](load-2026-09-23-review.json) · [phạm vi kiểm thử](WEB-VALIDATION.md).

Các số liệu bên dưới là các lần đo trước, dùng để tham khảo lịch sử.


Bản **0.9.0 / 23-09-2026** thêm tải HTML nén và cookie riêng cho mỗi trình duyệt mô phỏng. Ba lần chạy, mỗi lần hai đợt × 700 sinh viên: **16.800/16.800 yêu cầu đạt**, không mất bản ghi hay tạo thêm dòng khi gửi lại. Tải 700 trang cùng lúc mất 0,518–0,870 giây; ghi 700 lượt mất 3,772–4,428 giây trên loopback của laptop này. Đây chưa phải phép đo Wi-Fi lớp. Xem [báo cáo mới](load-2026-09-23-mobile.json) và [phạm vi kiểm thử](WEB-VALIDATION.md). Các kết quả bên dưới là lịch sử của bản trước.


## Tại trường · Bản 0.6 · 16/09/2026

Laptop kết nối USTH_CONNECT; một điện thoại thật đã quét QR và gửi điểm danh thành công. Đã đối chiếu bản ghi trong database thử và số lượt trên trang TA. Dữ liệu thử được tách khỏi database lớp và không đồng bộ Google Sheets.

Chạy lại phép đo API trên laptop Linux i5-9300H/RAM 8 GiB, Node 24.19.0, mã nguồn `c90c42a`: 700 sinh viên mỗi đợt, hai đợt cùng ngày, lặp lại ba lần. Mỗi đợt gồm xác nhận QR, gửi điểm danh và gửi lại cùng yêu cầu.

| Lần chạy | Gửi 700 ở đợt 1 | Gửi 700 ở đợt 2 | Bản ghi sau mở lại database |
| --- | --- | --- | --- |
| 1 | 4,136 s | 3,373 s | 1.400/1.400 |
| 2 | 3,967 s | 3,865 s | 1.400/1.400 |
| 3 | 3,224 s | 3,050 s | 1.400/1.400 |

**12.600/12.600 request thành công**, không timeout hoặc lỗi HTTP; 4.200 lượt gửi lại không tạo bản ghi thêm. P95 của bước gửi điểm danh: 2,750–3,900 giây. RAM RSS cuối mỗi lần chạy: 192 / 224 / 233 MiB, không phải RAM đỉnh. SQLite trên đĩa dùng WAL/FULL; writer Sheets giữ chờ. [Số liệu đầy đủ](load-2026-09-16-campus.json).

**Phạm vi:** lượt điện thoại đi qua mạng trường; tải 700 sinh viên được phát từ chính laptop qua loopback. Phép đo chưa kiểm chứng Wi-Fi với 700 thiết bị thật, tải trang/ảnh trình duyệt hoặc Google Sheets thật. Kết quả trên laptop Linux không cam kết cùng tốc độ trên laptop Windows của giảng viên.

## Bản 0.6 · Hai đợt trong cùng ngày · 16/09/2026

700 sinh viên giả lập cùng gửi ở **hai đợt điểm danh liên tiếp trong cùng ngày**, lặp lại toàn bộ phép đo ba lần. Mỗi đợt gồm 700 lượt xác nhận QR → 700 lượt gửi → 700 lượt gửi lại. Cùng MSSV được ghi nhận một lần ở mỗi đợt; retry không tạo bản ghi thêm.

| Lần chạy | Gửi 700 ở đợt 1 | Gửi 700 ở đợt 2 | Bản ghi sau mở lại database |
| --- | --- | --- | --- |
| 1 | 2,776 s | 3,260 s | 1.400/1.400 |
| 2 | 2,978 s | 3,553 s | 1.400/1.400 |
| 3 | 3,586 s | 3,237 s | 1.400/1.400 |

Tổng **12.600/12.600 request thành công**; không timeout hoặc lỗi HTTP. Tất cả 1.400 bản ghi mỗi lần chạy được gắn cờ cùng IP trong đợt tương ứng. SQLite trên đĩa WAL/FULL, client/server khác tiến trình, writer Sheets giữ chờ. RAM RSS cuối lần chạy: 185 / 196 / 230 MiB, không phải RAM đỉnh. [Số liệu đầy đủ](load-2026-09-16-rounds.json).

Đây là tải API qua loopback trên laptop Linux i5-9300H/RAM 8 GiB, không đo Wi-Fi đông người, tải trang/ảnh trình duyệt hoặc Google Sheets thật. Lệnh chạy lại trên macOS/Linux:

```bash
BP_BENCH_COUNTS=700 BP_BENCH_ROUNDS=2 node scripts/bench-web.cjs data/reports/load-rounds.json
```

Script giữ giới hạn IP thật của app: tổng request mỗi server thử phải không vượt 6.000/phút. Mỗi lần chạy dùng database tạm; không thay đổi dữ liệu lớp.

## Laptop thực tế · 14/09/2026

Đo lại bản `0.5.0` tại commit `801abd5` trên laptop Linux, Intel Core i5-9300H, RAM 8 GiB, Node 24.19.0. Mỗi đợt phát đồng thời **700 lượt xác nhận QR → 700 lượt gửi điểm danh → 700 lượt gửi lại**. Server và bộ phát tải chạy trong hai tiến trình riêng, dùng database SQLite tạm trên đĩa với WAL/FULL; writer Sheets được giữ chờ.

| Lần chạy | Quét QR, cả đợt | Gửi điểm danh, cả đợt | p95 lượt gửi | Gửi lại, cả đợt | Bản ghi sau mở lại DB |
| --- | --- | --- | --- | --- | --- |
| 1 | 0,830 s | 4,326 s | 4,082 s | 0,509 s | 700/700 |
| 2 | 0,734 s | 4,238 s | 3,993 s | 0,489 s | 700/700 |
| 3 | 0,773 s | 4,399 s | 4,107 s | 0,520 s | 700/700 |

Tổng **6.300/6.300 request thành công**, không timeout hoặc lỗi HTTP. Mỗi database có đúng 700 bản ghi, các lượt gửi lại đều khôi phục biên nhận cũ. Cả 700 bản ghi được gắn cờ trùng IP vì bộ phát tải dùng chung IP loopback. RAM RSS của tiến trình server cuối mỗi đợt: **152 / 158 / 163 MiB**; đây không phải số đo RAM đỉnh. [Báo cáo JSON đầy đủ](load-2026-09-14-laptop.json).

Cùng ngày, một điện thoại thật trên **USTH_CONNECT** đã tải trang, quét QR và gửi điểm danh thành công tới laptop; người thử đã xác nhận kết quả. Phiên thử dùng database riêng, không đồng bộ Sheets. Lỗi quét sau khi phiên thử đầu tiên hết giờ được xử lý bằng một phiên ở database thử mới; không thay đổi firewall hay nới kiểm tra IP/QR để thực hiện lượt gửi thành công này.

**Phạm vi:** kết quả 700 sinh viên là tải API qua loopback trên laptop, không đi qua Wi-Fi trường và chưa gồm 700 trình duyệt tải trang/ảnh. Lượt thử điện thoại xác nhận kết nối tại thời điểm thử, chưa đo Wi-Fi với lớp đông người, nhiều thiết bị hoặc API Google Sheets thật. Database lớp và bản ghi thử trên điện thoại giữ nguyên sau benchmark.

## Lịch sử 0.5 · QR động trên ba hệ điều hành

[Lần CI ngày 09/09/2026](https://github.com/namle24/bp-attendance/actions/runs/34318361647) đã đạt trên Windows, macOS và Linux. Mỗi hệ điều hành chạy 3 đợt; mỗi đợt gồm **700 lượt xác nhận QR/mã đang chiếu → 700 lượt gửi điểm danh → 700 lượt gửi lại**. Mỗi nhóm phát đồng thời, không giãn lượt gửi hoặc tự bỏ qua/thử lại lỗi mạng.

| Máy CI | Kiểm thử | Request thành công | Quét mã, 3 lần (s) | Gửi điểm danh, 3 lần (s) |
| --- | --- | --- | --- | --- |
| macOS | 27/27 | 6.300/6.300 | 0.925 / 2.087 / 0.542 | 2.050 / 1.472 / 4.278 |
| Linux | 27/27 | 6.300/6.300 | 0.591 / 0.577 / 0.545 | 0.913 / 0.852 / 0.794 |
| Windows | 27/27 | 6.300/6.300 | 0.717 / 0.681 / 0.754 | 4.392 / 13.658 / 8.476 |

Tổng **18.900/18.900 request**, mỗi database có đúng 700 bản ghi sau khi đóng/mở lại; cả 700 được gắn cờ trùng IP và các lượt gửi lại không nhân đôi dữ liệu. Dùng SQLite trên đĩa WAL/FULL; giữ writer Sheets chờ trong suốt phép đo. Xem [số liệu đầy đủ](load-2026-09-09-desktop-0.5.json), gồm p95, RAM và thời gian gửi lại.

Đây là phép đo API HTTP loopback trên máy CI, không phải cam kết tải trên Wi-Fi USTH hoặc laptop của giảng viên. Chưa đo 700 trình duyệt tải ảnh/trang, AP của trường, firewall hay API Google Sheets thật. Giao diện sinh viên chờ tối đa 45 giây cho thao tác gửi và giữ khóa lượt gửi khi mất phản hồi để khôi phục biên nhận an toàn.

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
