#!/usr/bin/env bash
# OhMyHome 배포 파일 만들기 — dist/OhMyHome-<날짜>.zip
# 정해 둔 파일만 담는다: 화면(index.html·css·js), 실행 스크립트, sample/plan·sample/real의 json 전부, 사용 가이드 PDF, LICENSE.
# 웹 사용 가이드(docs/OhMyHome_User_Guide.pdf)는 공지사항 창의 내려받기 링크가 가리키므로 같은 자리(docs/)에 담는다.
# A1-real·A2-real·B1-real·B2-real 실측 기록지(measure/55A1_measured.pdf · 55A2_measured.pdf · 55B1_measured.pdf · 55B2_measured.pdf)도 위례자이더파크 창의 링크가 가리키므로 measure/에 담는다.
# README(개발용 설명)와 sample의 png(sample/plan/png·sample/real/png의 그림)는 넣지 않는다. 가이드 PDF는 docs/guide/make_pdf.sh로 미리 만들어 둔다.
# 사용자가 작업한 도면·가구는 브라우저 localStorage에만 있으므로 담기지 않는다.
set -euo pipefail
cd "$(dirname "$0")"
GUIDE=docs/OhMyHome_Guide.pdf
USER_GUIDE=docs/OhMyHome_User_Guide.pdf
for f in "$GUIDE" "$USER_GUIDE"; do
  [ -f "$f" ] || { echo "$f 이 없습니다. docs/guide/make_pdf.sh 로 먼저 만들어 주세요." >&2; exit 1; }
done

NAME="OhMyHome-$(date +%Y%m%d)"
OUT="dist/$NAME.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
DEST="$STAGE/OhMyHome"
mkdir -p "$DEST/sample/plan" "$DEST/sample/real" "$DEST/docs" "$DEST/measure"

cp index.html serve.py run_ohmyhome.sh run_ohmyhome.bat LICENSE "$GUIDE" "$DEST/"
cp -R css js "$DEST/"
cp sample/plan/*.json "$DEST/sample/plan/"
cp sample/real/*.json "$DEST/sample/real/"
cp "$USER_GUIDE" "$DEST/docs/"
cp measure/55A1_measured.pdf measure/55A2_measured.pdf measure/55B1_measured.pdf measure/55B2_measured.pdf "$DEST/measure/"   # 위례자이더파크 창의 A1-real·A2-real·B1-real·B2-real 실측 기록지 링크
chmod +x "$DEST/run_ohmyhome.sh"
find "$DEST" -name '.DS_Store' -delete

mkdir -p dist
rm -f "$OUT"
(cd "$STAGE" && zip -qr -X - OhMyHome) > "$OUT"
echo "만들었습니다: $OUT ($(du -h "$OUT" | cut -f1))"
unzip -Z1 "$OUT" | grep -v '/$' | sed 's/^/  /'
