@echo off
rem OhMyHome 로컬 실행 — 정적 파일 웹 서버
cd /d "%~dp0"
if "%PORT%"=="" set PORT=8190
start "" http://localhost:%PORT%
python serve.py %PORT%
