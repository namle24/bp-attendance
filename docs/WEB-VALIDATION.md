# Validation scope · LAN attendance 0.4

Current runtime: direct student LAN HTTP listener plus a separate localhost-only TA listener. Three student fields, no Google login, request-key idempotency, SQLite persistence, duplicate-IP peer review and asynchronous Sheets snapshots.

Commands:

```bash
npm test
npm run check
BP_PLAYWRIGHT_MODULE=/path/to/playwright BP_CHROMIUM=/path/to/chromium node scripts/test-web-ui.cjs
BP_BENCH_COUNTS=700 node scripts/bench-web.cjs data/reports/load-lan.json
```

Validation run on Linux on 2026-09-09: **56 tests passed, 0 failed, 0 skipped**, plus the browser scenario and syntax check.

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


Windows startup coverage is in `tests/portable-host.test.cjs`: foreground dispatch without systemd, `.env` loading before server start, paths containing spaces/backslash-n, Wi-Fi/WLAN selection with explicit-interface fallback, and two-port readiness. The foreground server is exercised against a temporary database.

[Windows CI](https://github.com/namle24/bp-attendance/actions/workflows/windows.yml) runs actual `laptop:setup` and `host:install` on `windows-latest`, then portable-startup, LAN, reports and restart tests. This validates the Windows runtime; it cannot validate a teacher's Wi-Fi adapter name, firewall or USTH routing. Native Wi-Fi selection uses common adapter names, with `network:list` / `LAN_INTERFACE` for renamed or ambiguous adapters.

Windows Server 2025 / Node 24.19.0 [validation on 2026-09-09](https://github.com/namle24/bp-attendance/actions/runs/34315646676): **21 tests passed, 0 failed, 0 skipped**, and three successful disk-backed 700-request bursts plus 700 idempotency retries per burst. The integration load client runs in a worker so creating hundreds of client connections does not block the server event loop in the same process. All requests still launch concurrently with no automatic error retries. The separate-process benchmark uses the same listener as production. See the load report for timing variability and the browser timeout limitation.
