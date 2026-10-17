# Working in BP Attendance

Read `README.md` and `docs/MACBOOK-HANDOFF.vi.md` when starting work in this repo.
For attendance import tasks, also read `data/macbook-handoff/PRIVATE-CONTEXT.vi.md`
if the user has restored the private transfer bundle. That file contains the
working Sheet URL, source files and unresolved cases; it is intentionally ignored
by Git. Current user instructions take precedence over the handoff.

## Code and checks

- Node.js 24+, CommonJS, SQLite. The normal entry point is `npm start`.
- Current runtime: `scripts/start.cjs` → `scripts/portable-host.cjs` →
  `web/server.cjs` → the `web/lan-*.cjs` modules and `web/lan-public/`.
- Older Google-login modules remain for compatibility and historical tests;
  do not assume they are the active student flow.
- Run `npm run check` and the relevant tests for code changes. `npm test` runs the
  complete test suite. Use temporary databases and synthetic students for tests.
- Preserve Windows, macOS and Linux support. Do not hard-code a Wi-Fi interface,
  a Linux home directory or systemd into the default launcher.

## Attendance workflow agreed with the user

- Re-read the live Sheet's metadata, date header, IDs, validation and target cells
  before writing. Do not rely on row numbers from old handoffs.
- Keep student IDs as strings. Match IDs first; normalize whitespace and case,
  detect swapped ID/name fields, and deduplicate identical identities.
- Correct a mistyped ID only when the full name and supporting ID evidence
  identify one roster entry. Conflicting identities require manual review.
- The user authorized adding students absent from the roster. Check for typos or
  existing matches first. Preserve row formatting, validation, formulas and filter
  coverage; leave unknown class/TA fields blank.
- Flagged or unresolved records use `Cần đối chiếu` with a useful source note so
  the user can check them manually. Do not silently turn them into `Có mặt`.
- For the requested date, mark matched, unflagged check-ins `Có mặt`. Preserve
  attendance already entered from other sources. Blank cells are not evidence
  of absence; do not fill them with `Vắng` without an explicit request.
- Exclude clearly identified test records, preserve other dates, and read back
  the result after each write. Never write to app-owned sync tabs when the user
  asked to edit the separate TA-maintained results tab.

## Repository and local data

This repository is public. Keep real student exports, private Sheet URLs,
credentials, `.env`, SQLite databases and personal chat details under ignored
local storage, not in commits. The checked-in handoff contains the general
workflow and aggregate progress; the private bundle contains the operational
details. Never force-add `data/` or `.env` to Git.
