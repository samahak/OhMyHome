#!/usr/bin/env bash
# 사용 가이드 PDF 만들기 (Chrome 헤드리스 인쇄)
#   guide.html      → docs/OhMyHome_Guide.pdf       배포 zip용 — 설치·실행·사용법. build_ohmyhome.sh가 zip에 담는다
#   user_guide.html → docs/OhMyHome_User_Guide.pdf  웹(GitHub Pages) 사용자용 — 사용법만 (설치·파일·소스 이야기 없음)
# 가이드 내용을 고친 뒤 실행하고, 만들어진 PDF를 함께 커밋한다.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
command -v "$CHROME" >/dev/null 2>&1 || [ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] || { echo "Chrome을 찾지 못했습니다. CHROME=<경로> ./make_pdf.sh 로 알려 주세요." >&2; exit 1; }
DOCS="$(cd .. && pwd)"
for pair in "guide.html:OhMyHome_Guide.pdf" "user_guide.html:OhMyHome_User_Guide.pdf"; do
  src="${pair%%:*}" out="$DOCS/${pair##*:}"
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$out" "file://$(pwd)/$src" 2>/dev/null
  echo "만들었습니다: $out"
done
