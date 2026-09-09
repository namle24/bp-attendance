#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Cài Node.js 24 trở lên từ https://nodejs.org, sau đó chạy lại.'
  exit 1
fi
exec node scripts/start.cjs
