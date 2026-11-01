#!/usr/bin/env bash
# 사용 가이드 PDF 만들기 — docs/guide/guide.html → docs/OhMyHome_Guide.pdf (Chrome 헤드리스 인쇄)
# 가이드 내용을 고친 뒤 실행하고, 만들어진 PDF를 함께 커밋한다. build_ohmyhome.sh는 이 PDF를 배포 zip에 담는다.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
command -v "$CHROME" >/dev/null 2>&1 || [ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] || { echo "Chrome을 찾지 못했습니다. CHROME=<경로> ./make_pdf.sh 로 알려 주세요." >&2; exit 1; }
OUT="$(cd .. && pwd)/OhMyHome_Guide.pdf"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$OUT" "file://$(pwd)/guide.html" 2>/dev/null
echo "만들었습니다: $OUT"
