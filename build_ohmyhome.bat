@echo off
rem OhMyHome 배포 파일 만들기 — dist\OhMyHome-<날짜>.zip
rem 정해 둔 파일만 담는다: 화면(index.html·css·js), 실행 스크립트, sample\plan·sample\real의 json 전부, 사용 가이드 PDF, LICENSE.
rem 웹 사용 가이드(docs\OhMyHome_User_Guide.pdf)는 공지사항 창의 내려받기 링크가 가리키므로 같은 자리(docs\)에 담는다.
rem README(개발용 설명)와 sample의 png(sample\plan\png·sample\real\png의 그림)는 넣지 않는다. 가이드 PDF(docs\OhMyHome_Guide.pdf)는 미리 만들어 둔다.
rem 사용자가 작업한 도면·가구는 브라우저 localStorage에만 있으므로 담기지 않는다.
setlocal
cd /d "%~dp0"
if not exist docs\OhMyHome_Guide.pdf (
  echo docs\OhMyHome_Guide.pdf 이 없습니다. 먼저 가이드 PDF를 만들어 주세요.
  exit /b 1
)
if not exist docs\OhMyHome_User_Guide.pdf (
  echo docs\OhMyHome_User_Guide.pdf 이 없습니다. 먼저 가이드 PDF를 만들어 주세요.
  exit /b 1
)
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set TODAY=%%d
set NAME=OhMyHome-%TODAY%
set STAGE=%TEMP%\ohmyhome-build-%RANDOM%
set DEST=%STAGE%\OhMyHome
mkdir "%DEST%\sample\plan"
mkdir "%DEST%\sample\real"
mkdir "%DEST%\docs"
mkdir "%DEST%\measure"

for %%f in (index.html serve.py run_ohmyhome.sh run_ohmyhome.bat LICENSE docs\OhMyHome_Guide.pdf) do copy /y %%f "%DEST%\" >nul
xcopy /e /i /q css "%DEST%\css" >nul
xcopy /e /i /q js "%DEST%\js" >nul
copy /y sample\plan\*.json "%DEST%\sample\plan\" >nul
copy /y sample\real\*.json "%DEST%\sample\real\" >nul
copy /y docs\OhMyHome_User_Guide.pdf "%DEST%\docs\" >nul
copy /y measure\55A1_measured.pdf "%DEST%\measure\" >nul
copy /y measure\55A2_measured.pdf "%DEST%\measure\" >nul
copy /y measure\55B1_measured.pdf "%DEST%\measure\" >nul
copy /y measure\55B2_measured.pdf "%DEST%\measure\" >nul

if not exist dist mkdir dist
if exist "dist\%NAME%.zip" del "dist\%NAME%.zip"
powershell -NoProfile -Command "Compress-Archive -Path '%DEST%' -DestinationPath 'dist\%NAME%.zip'"
rmdir /s /q "%STAGE%"
echo 만들었습니다: dist\%NAME%.zip
endlocal
