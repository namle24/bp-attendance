#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Cài Node.js 24 trở lên từ https://nodejs.org, sau đó mở lại file này.'
  read -r -p 'Nhấn Enter để đóng…' answer
  exit 1
fi
node scripts/start.cjs
