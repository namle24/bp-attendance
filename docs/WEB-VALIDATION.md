# Validation scope · LAN attendance 0.5

Current runtime: direct student LAN HTTP listener plus a separate localhost-only TA listener. Rotating 30-second QR/room codes, IP-bound one-use admissions (up to three minutes), three student fields, no Google login, request-key idempotency, SQLite persistence, duplicate-IP peer review and asynchronous Sheets snapshots.

Commands:

```bash
npm test
npm run check
BP_PLAYWRIGHT_MODULE=/path/to/playwright BP_CHROMIUM=/path/to/chromium node scripts/test-web-ui.cjs
BP_BENCH_COUNTS=700 node scripts/bench-web.cjs data/reports/load-lan.json
```

Validation run on Linux on 2026-09-09: **62 tests passed, 0 failed, 0 skipped**, plus the browser scenario and syntax check.

LAN-specific checks cover:

- Exact per-session MSSV deduplication, normalized socket IPs, both first and subsequent IP peers flagged, separation between weeks.
- Missing/oversized/invalid fields, formula-safe CSV, immutable submitted identity/seat/IP, retry recovery after window closure, no receipt disclosure by guessing an MSSV.
- TA decisions, audit entries, notes required, stale group confirmation rejected, confirmed records flagged again when a new peer arrives, rejected decisions retained.
- HTTP Host, Origin and TA CSRF gates; forwarded/client-supplied IPs ignored; student listener has no TA API.
- 700 anonymous submissions from one IP plus 700 retries, all accepted exactly once with all 700 peers flagged.
- Sheets RAW writes into two owned tabs, red formatting on both summary and details, color removal after review, error retries and consistent revision snapshots during concurrent arrivals.
- Production `web/server.cjs` terminated by SIGKILL and restarted against a temporary on-disk database: receipts, seats, IPs, reviews and flags survive; TA port cannot be reached using the laptop LAN address.
- Daily/all reports: exact date boundaries, leading-zero MSSV, rejection notes and CSV escaping, unknown/malformed date/status queries rejected, empty-day headers, student access blocked, read-only exports and persistence after reopening the database.
- Case lists: pending versus rejected filters by day/all dates, reasons and counts, confirmation removes only the relevant case while retaining history.
- Browser: phone and laptop forms, QR projection, lost request before commit, lost response after commit, reload/retry recovery, both IP peers red, TA dialog, closed session, multi-day history, real daily/all CSV downloads, case filters and review, navigation/reload, responsive layout and screenshots.

Tests also retain coverage of historical Google/rotating-code data paths, Caddy forwarding and SQLite backup. Those modules do not expose student login in the current production entry point. Fixture identity/data is confined to temporary test databases.

The load report records three successful bursts of 700 requests plus retries with disk WAL/FULL while Sheets is held pending. See [metrics and exclusions](LOAD-TEST.vi.md).

Not yet verified: actual USTH device-to-laptop routing, observed IPs for different student devices, Wi-Fi under classroom load, and live Sheets credentials/write/format permissions. API request tests do not replace a live Google Sheet check. HTTP transport is unencrypted. No test proves attendance identity from IP.


Cross-platform startup uses one foreground launcher: automatic dependency/setup preparation, native Wi-Fi discovery on Windows/macOS/Linux, a localhost network picker when ambiguous, then the TA page. `tests/launcher.test.cjs` exercises an actual fresh directory with no `.env`, selects a current adapter through HTTP and verifies the production app starts with an empty session list. Picker tests reject cross-origin, missing CSRF, stale/forged interfaces and public IPs.

`tests/lan-qr.test.cjs` verifies exact QR/code expiry, admission expiry, signature tampering, binding to socket IP/session, one admission per MSSV, persistent use tracking after restart, no current QR on the public endpoint, and no public check-in without admission. A lost-response retry can recover an already committed, identical request after expiry/closure; it cannot write a second record or change identity/seat/IP.

The browser scenario checks actual QR rotation over 30 seconds, expired QR rejection, QR admission on mobile, manual room code on desktop, localhost network selection, and the existing recovery/review/export flows. Only synthetic data in temporary databases is used for screenshots.

[Desktop CI](https://github.com/namle24/bp-attendance/actions/workflows/windows.yml) runs on `windows-latest`, `macos-latest` and `ubuntu-latest`: bootstrap from missing dependencies, optional setup compatibility, launcher/QR/LAN/reports/restart tests and three separate-process 700-scan + 700-submission + 700-idempotency-retry bursts. CI hardware is not the teacher's laptop or the USTH Wi-Fi. Native hardware discovery is checked with recorded output; real CI startup uses its available LAN and the picker/explicit interface.

The older Windows 0.4 measurements remain historical in the load report. Current 0.5 scan/submission measurements and CI evidence are recorded separately there.
