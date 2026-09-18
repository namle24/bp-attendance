# Validation scope · LAN attendance 0.8

Version 0.8 on 2026-09-18 adds optional per-round location evidence. **81/81 tests passed**, plus the existing full browser scenario and a new location scenario. The latter uses a real private-IP HTTP parent (verified insecure context), an intercepted copy of the actual static helper at its HTTPS URL (verified secure context), simulated geolocation permission/coordinates, origin/source/state validation, in-range/outside/uncertain/denied/missing results, and TA review. Screenshots contain synthetic data. This is not yet a physical iPhone/Android test of the published helper.

The server recomputes distance and combines class-center/device uncertainty, ignores client verdicts, freezes the center/radius per round, requires confirmation for a new date, preserves retries and historical records, and flags unresolved location evidence for TA review. Raw student coordinates are not persisted to SQLite/CSV/Sheets. QR/network/CSRF checks remain in force. See [TA instructions and deployment prerequisite](LOCATION-CHECK.vi.md).

With location checks enabled, three runs of two same-day rounds at 700 concurrent students passed **12,600/12,600 requests** (QR admission + initial submission + idempotent retry). Each database held exactly 1,400 records; evidence distribution was 468 inside, 466 outside, 466 uncertain. Submission bursts took **2.084–2.184 seconds** on this machine. These are synthetic positions over loopback, not physical GPS, helper hosting, classroom Wi-Fi or live Sheets. See [raw report](load-2026-09-18-location.json).

The GitHub Pages workflow is manual only and publishes just `site/`. Publishing the static helper and physically testing mobile geolocation are separate deployment steps; ordinary pushes do not publish it.

Version 0.7 on 2026-09-16: **76/76 tests passed**, syntax checks and the extended Chromium scenario passed. The original student page was reproduced failing before showing its form when `AbortSignal.timeout` was absent. The shared transport now uses XMLHttpRequest with bounded timeouts, and the student page avoids optional chaining, `URLSearchParams` and `replaceChildren`. QR admission happens before a session GET, using the session returned by admission; a transport failure preserves the QR fragment for retry. No QR expiry or network/admission checks were relaxed.

Browser checks remove fetch, AbortSignal, AbortController, URLSearchParams and replaceChildren and deny sessionStorage. A QR still opens its form even if the session GET is blocked. A committed submission with a lost response can be retried without duplication. An initially failed scan retains its link and succeeds on the retry button. Existing rotating-QR, expired-code, projection, multiple-round, review and export scenarios still pass. These tests simulate missing browser features on Chromium; the specific iPhone and Android devices reported by the user still need a physical retest. A page that cannot reach the laptop at all remains a network/browser connectivity issue outside this compatibility test.

Student history reads a separate TA-edited Google Sheet, stores only MSSV/date/result cells, and serves exact-ID requests from a local SQLite snapshot. Tests cover wide/long formats, numeric and alphanumeric IDs, blank results, no private-column disclosure, malformed sources/data, preserving stale data on refresh failure, atomic source changes, coalesced refreshes, restart persistence, TA-only CSRF-protected configuration, LAN/Origin gates and **700 simultaneous lookup requests**. Browser checks verify lookup, a changed Sheet result and the stale-data warning. The mobile screenshot contains synthetic data only.

The user-provided Sheet's `Offline` tab was read successfully using its existing link access on 2026-09-16; 158 MSSVs were parsed at verification time. The read-only source was configured locally without modifying attendance or the remote Sheet. Its link, database and real student rows are excluded from this repository. Reading the visualization query endpoint initially exposed type inference dropping mixed-format MSSVs; the reader uses CSV export of the exact gid instead, with response-size and row/column limits. This real read verifies lookup, not the optional Sheets writer.

Browser compatibility reference: [MDN on AbortSignal.timeout availability](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static). The repair retains 20-second GET and 45-second student POST deadlines and stable request IDs on retries.

Current runtime: direct student LAN HTTP listener plus a separate localhost-only TA listener. One lesson per date with multiple attendance rounds, reopening within the same day, rotating 30-second QR/room codes, IP-bound one-use admissions (up to three minutes), three student fields, no Google login, request-key idempotency, SQLite persistence, per-round duplicate-IP peer review and asynchronous Sheets snapshots.

Version 0.6 validation on 2026-09-16: **68/68 tests passed**, plus the full Chromium scenario. New checks cover multiple rounds sharing one date, repeated MSSV across rounds, reopening without duplicating previous receipts, rejection of stale QR/admissions even when reopened in the same millisecond, recovery of committed requests, one active round at a time, expired/past-date rules, online results plus daily round counts, read-only projection following a reopened older round, and TA-only CSRF-protected controls. A legacy disk database fixture is migrated and reopened with receipt IDs, reviews, signatures, used/unused scan grants and Sheet ownership preserved. The pre-migration backup is inspected independently; an injected failure after schema replacement proves transactional rollback restores the old schema and records.

The browser scenario reopens a closed round, starts a new named round and submits again from the same phone browser that holds an older receipt. It checks the new receipt's round, recall of the older receipt when that round is reopened, per-round exports and one daily summary column. Projection remains in its own fullscreen-capable tab. Screenshots use only isolated fixture data.

Load validation for 0.6: three runs of **two same-day rounds**, each round with 700 concurrent admissions + 700 submissions + 700 retries, all against a fresh temporary disk database per run. **12,600/12,600 requests passed**, with exactly 1,400 persisted attendance records per run after reopening SQLite. Submission bursts took **2.776–3.586 seconds** on this laptop. This uses loopback, not school Wi-Fi or real Sheets; see [raw metrics](load-2026-09-16-rounds.json).

Campus recheck on 2026-09-16: one real phone on USTH_CONNECT submitted to the laptop successfully; both the isolated database and the TA view showed the stored record. A separate repeat of the same two-round, three-run benchmark passed **12,600/12,600 requests**, with 1,400 records per database after reopening and submission bursts of **3.050–4.136 seconds**. This benchmark still uses loopback despite the laptop being connected to campus Wi-Fi; only the individual phone check traverses the school network. No class database or real Sheet received benchmark data. See [raw metrics](load-2026-09-16-campus.json).

Commands:

```bash
npm test
npm run check
BP_PLAYWRIGHT_MODULE=/path/to/playwright BP_CHROMIUM=/path/to/chromium node scripts/test-web-ui.cjs
BP_BENCH_COUNTS=700 node scripts/bench-web.cjs data/reports/load-lan.json
```

Validation run on Linux on 2026-09-09: **62 tests passed, 0 failed, 0 skipped**, plus the browser scenario and syntax check.

Revalidated on Linux on 2026-09-16 for the independent QR projection tab: **62/62 tests passed**, syntax check and the Chromium browser scenario passed. Opening attendance creates a separate projection tab while the original TA controls remain visible; the projection fits 1280×720, enters/exits native fullscreen and continues rotating codes after the TA tab closes. Browser checks also cover reusing the projection tab, live attendance counts, hiding QR/code on connection failure, automatic recovery and hiding the code after session closure. The projector page/assets and its read-only API are served only by the localhost TA listener; student-listener access is tested to return 404. Projection responses contain the current code and aggregate count, without student records or a CSRF token. The updated projection screenshot uses an isolated fixture database.

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

On 2026-09-14, the actual Linux laptop (Core i5-9300H, 8 GiB RAM, Node 24.19.0; code revision `801abd5`) passed three separate-process bursts, each with 700 QR admissions, 700 submissions and 700 idempotent retries. All 6,300 requests succeeded. Each submission burst finished in 4.238–4.399 seconds, with exactly 700 records after reopening SQLite and all shared-IP peers flagged. Sheets was held pending throughout the test. The class database and the separate campus phone-test record were unchanged. See [metrics and exclusions](LOAD-TEST.vi.md) and the [raw report](load-2026-09-14-laptop.json).

Also on 2026-09-14, one real phone on USTH_CONNECT reached the laptop's student listener, fetched HTML/CSS/JavaScript, obtained a QR admission and submitted attendance successfully. The user confirmed success, and the isolated campus-test database contained the record. Earlier phone requests stalled; a later QR attempt reached the app after the first test session expired and was rejected. A fresh isolated test session allowed the successful submission. The cause of the initial stall was not established; no firewall change or relaxation of IP/QR checks was needed for the successful attempt.

Not yet verified: observed IPs for multiple student devices, Wi-Fi under classroom load, and live Sheets credentials/write/format permissions. One successful phone check-in does not establish sustained connectivity for a full classroom. The 700-client benchmark uses loopback and does not measure Wi-Fi or browser asset loading. API request tests do not replace a live Google Sheet check. HTTP transport is unencrypted. No test proves attendance identity from IP.


Cross-platform startup uses one foreground launcher: automatic dependency/setup preparation, native Wi-Fi discovery on Windows/macOS/Linux, a localhost network picker when ambiguous, then the TA page. `tests/launcher.test.cjs` exercises an actual fresh directory with no `.env`, selects a current adapter through HTTP and verifies the production app starts with an empty session list. Picker tests reject cross-origin, missing CSRF, stale/forged interfaces and public IPs.

`tests/lan-qr.test.cjs` verifies exact QR/code expiry, admission expiry, signature tampering, binding to socket IP/session, one admission per MSSV, persistent use tracking after restart, no current QR on the public endpoint, and no public check-in without admission. A lost-response retry can recover an already committed, identical request after expiry/closure; it cannot write a second record or change identity/seat/IP.

The browser scenario checks actual QR rotation over 30 seconds, expired QR rejection, QR admission on mobile, manual room code on desktop, localhost network selection, and the existing recovery/review/export flows. Only synthetic data in temporary databases is used for screenshots.

[Desktop CI](https://github.com/namle24/bp-attendance/actions/workflows/windows.yml) runs on `windows-latest`, `macos-latest` and `ubuntu-latest`: bootstrap from missing dependencies, optional setup compatibility, launcher/QR/LAN/rounds/migration/reports/restart tests and three separate-process runs of two same-day rounds, each with 700 scans + 700 submissions + 700 idempotent retries. CI hardware is not the teacher's laptop or the USTH Wi-Fi. Native hardware discovery is checked with recorded output; real CI startup uses its available LAN and the picker/explicit interface.

The older Windows 0.4 and 0.5 measurements remain historical in the load report. Version 0.6 was also verified by [desktop CI on 2026-09-16](https://github.com/namle24/bp-attendance/actions/runs/35060878615): Windows, macOS and Linux passed bootstrap, checks and all three runs of two same-day 700-student rounds.

Verified [desktop run on 2026-09-09](https://github.com/namle24/bp-attendance/actions/runs/34318361647): Windows, macOS and Linux each passed **27/27 tests, no skips**, dependency bootstrap and all three scan/submission/retry bursts. Total benchmark requests: **18,900/18,900**. QR projection also fits a 1280×720 browser viewport without scrolling, verified by the browser scenario.
