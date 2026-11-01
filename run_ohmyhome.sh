#!/usr/bin/env bash
# OhMyHome 로컬 실행 — 정적 파일만 내보내는 웹 서버를 띄운다 (ES 모듈은 file:// 로 열리지 않는다)
cd "$(dirname "$0")"
PORT="${PORT:-8190}"
echo "OhMyHome: http://localhost:${PORT}  (끄려면 Ctrl+C)"
( sleep 1; open "http://localhost:${PORT}" 2>/dev/null || xdg-open "http://localhost:${PORT}" 2>/dev/null ) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
