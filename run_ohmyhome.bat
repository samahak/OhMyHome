@echo off
rem OhMyHome 로컬 실행 — 정적 파일 웹 서버
cd /d "%~dp0"
if "%PORT%"=="" set PORT=8190
echo OhMyHome: http://localhost:%PORT%  (끄려면 Ctrl+C)
start "" http://localhost:%PORT%
python -m http.server %PORT% --bind 127.0.0.1
