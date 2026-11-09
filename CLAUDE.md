# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 명령

```bash
# 실행 — 정적 파일 서버를 띄우고 브라우저를 연다 (기본 포트 8190)
./run_ohmyhome.sh           # macOS / Linux  (PORT=9000 ./run_ohmyhome.sh 로 변경)
run_ohmyhome.bat            # Windows
python3 serve.py 8190      # 직접 띄울 때 (no-cache 정적 서버 + /api/project 작업 저장, 기본 127.0.0.1만)
HOST=0.0.0.0 ./run_ohmyhome.sh   # 같은 네트워크의 다른 기기에서 접속 (serve.py가 내 PC IP 주소를 찍는다)

# 배포 파일 — dist/OhMyHome-<날짜>.zip (화면·실행 스크립트·sample/plan·sample/real의 json 전부·사용 가이드 PDF·docs/의 웹 사용 가이드 PDF·A1-real·A2-real·B1-real·B2-real 실측 기록지 PDF·LICENSE만.
#   README와 sample의 png는 넣지 않는다. 작업 데이터 ohmyhome-project.json과 localStorage는 넣지 않는다)
./build_ohmyhome.sh         # macOS / Linux
build_ohmyhome.bat          # Windows (PowerShell Compress-Archive)

# 사용 가이드 PDF — docs/guide/*.html(+ img/ 화면 캡처)을 Chrome으로 인쇄해 두 PDF를 만든다.
#   guide.html      → docs/OhMyHome_Guide.pdf       배포 zip용(설치·실행 포함). 빌드 스크립트는 이 PDF가 없으면 멈춘다
#   user_guide.html → docs/OhMyHome_User_Guide.pdf  웹(GitHub Pages) 사용자용. 파일 이름·명령·서버 등 소스 이야기는 넣지 않고,
#                     저장은 브라우저 저장 + 저장(.json)/도면 불러오기(json)로만 설명한다
# 화면·기능이 바뀌면 두 html을 함께 고치고 다시 만들어 커밋한다
docs/guide/make_pdf.sh

# 문법 검사 (Node 22+는 import 문을 보고 ES 모듈로 알아서 읽는다)
for f in js/*.js; do node --check "$f"; done
```

빌드 단계, package.json, 테스트 프레임워크, 린터, CI는 없다. three.js는 `index.html`의 importmap으로
CDN(`three@0.160.0`)에서 받으므로 실행에 인터넷이 필요하다. ES 모듈이라 `file://`로는 열리지 않는다.

### 검증 방법

- **DOM 없는 모듈은 Node에서 바로 import해 시험한다.** `js/geometry.js`, `js/wallDetect.js`, `js/catalog.js`는
  브라우저 API를 쓰지 않는다. 벽 인식은 `{ data: Uint8ClampedArray(RGBA), width, height }`만 넘기면 돈다.
- **화면은 헤드리스 Chrome으로 확인한다.** `--headless=new --remote-debugging-port=… --use-angle=swiftshader
  --enable-unsafe-swiftshader`로 띄우고 DevTools 프로토콜(Node 내장 `WebSocket`)로 조작·스크린숏을 찍는다.
  swiftshader 없이는 WebGL이 안 뜰 수 있다. `GPU stall due to ReadPixels` 경고는 무시해도 된다.
- 페이지는 점검용으로 `window.__ohmyhome = { state, editor, view, runDetect }`를 내놓는다.
- `window.prompt` / `confirm`(축척 길이·방 이름·새 도면)은 CDP의 `Page.javascriptDialogOpening` →
  `Page.handleJavaScriptDialog({ accept, promptText })`로 처리한다.
- 처음 접속하면 공지사항(`#notice-dialog`, 모달)이 뜬다 — 시험할 때는 그 `닫기` 버튼을 누르거나 localStorage에
  `ohmyhome.notice.hidden = '5'`(`main.js`의 `NOTICE_VER`)를 넣고 새로 고친다. 팝업(`dialog[open]`)이 열려 있으면 `main.js` 단축키는 쉰다.
- 깨끗한 상태에서 시작하려면 `localStorage.clear()` 후 새로 고친다(자동 저장 키 `ohmyhome.project.v1`). serve.py로 띄웠으면
  프로젝트 폴더의 `ohmyhome-project.json`도 지운다 — **이 폴더에서 시험하면 사용자 작업 파일을 덮어쓰므로**, 서버 저장을 시험할 때는
  작업 트리를 임시 폴더에 복사해 다른 포트로 띄운다.
- 2D 캔버스 좌표는 `editor.toScr({x, y})`(mm → 캔버스 px)에 캔버스의 `getBoundingClientRect()`를 더해 구한다.
  두 화면을 나란히 띄우면 2D 칸이 좁아서, 도면 바깥쪽 점은 3D 캔버스 위를 누르게 되니 조심한다.

## 아키텍처

```
index.html             화면 뼈대 + importmap (three.js CDN)
css/style.css
js/main.js             화면 조립 — 왼쪽 패널, 속성 패널, 상단 버튼, 단축키, 벽 인식 실행
js/store.js            상태 하나 + 이벤트 + 되돌리기 + 자동 저장(serve.py의 ohmyhome-project.json + localStorage) + 배치 안
js/geometry.js         평면 기하 — 꼭짓점, 겹침(SAT), 벽에 붙이기, 면적·무게중심   (DOM 없음)
js/wallDetect.js       도면 이미지 → 벽 사각형                                    (DOM 없음)
js/catalog.js          샘플 가구 목록·기본 크기·모양(SHAPES) (DOM 없음)
js/plan2d.js           2D 도면 편집기 (캔버스, 도구별 마우스 입력)
js/view3d.js           3D 보기 + 가구 끌기 (three.js, OrbitControls, CSS2DRenderer)
js/models3d.js         샘플 가구 3D 모양 (박스·원기둥 조합)
js/tour.js             둘러보기 — 현관문 열기 · 1인칭 카메라 · 자동 동선 · 직접 걷기 · 화면 안내판
js/walkGrid.js         둘러보기용 걸을 수 있는 칸 지도 · A* 길 찾기 · 들를 곳 고르기             (DOM 없음)
js/fixtures.js         현관·욕실·주방 설비 자동 배치 (신발장·변기·세면대·욕조·주방 싱크대)          (DOM 없음)
js/windows.js          창 자동 찾기 — 도면 이미지에서 벽 위의 연한 구간 + 바깥벽 틈                 (DOM 없음)
js/doors.js            문 자동 찾기 — 벽 틈 중 도면 이미지에 여닫이 문 기호(문짝 선 + 호)가 있는 곳 · 미닫이 문짝 자리 (DOM 없음)
js/scenery.js          둘러보기 창밖 풍경 — 층수 높이의 땅, 우리 동, 도로·차·가로수, 빌라, 아파트, 숲, 먼 산, 하늘
js/samplePlan.js       체험용 샘플 도면 (캔버스로 그림, 1px = 10mm)
js/xlsx.js             아주 작은 엑셀(.xlsx) 쓰기 — 시트 하나, 글자·숫자·수식 칸, 서식 몇 개, 무압축 zip     (DOM 없음)
js/pdf.js              아주 작은 PDF 쓰기 — 쪽마다 JPEG 한 장을 A4(가로·세로)에 꽉 차게 (2D·3D 캡처)          (DOM 없음)
docs/guide/            배포용 사용 가이드 원본(guide.html, img/) → docs/OhMyHome_Guide.pdf
measure/               실측 결과 PDF — 55A2_measured.pdf(현장 실측을 mm로 옮긴 A-2형 기록지) · 55A1_measured.pdf(A-2형 기록지를 좌우로 뒤집어 A-1형 실측값을 적은 기록지) · 55B1_measured.pdf(B-1형 현장 실측 사진의 값을 B-1형 도면에 옮긴 기록지 — 빨강 실측, 파랑은 재지 않아 분양 도면 값, ⓐ 나눠 잰 합이 전체와 다른 값) · 55B2_measured.pdf(B-2형 현장 실측 사진(cm)의 값을 B2-real 도면에 mm로 옮긴 기록지 — 파랑은 재지 않아 B1-real 값)
                       — 위례자이더파크 창 A2-real·A1-real·B1-real·B2-real 줄의 링크. 기록지마다 왼쪽 위에 자료 출처(제공한 세대)를 적는다
sample/                실제 세대 예시 (1px = 5mm) — plan/ 55㎡ A-2·A-1(좌우 반전)·B-1·B-2·C·D형 프로젝트 JSON(plan/png/ 그 2D·3D 이미지) ·
                       real/ A-2·A-1·B-1·B-2형 실측(A2-real·A1-real·B1-real·B2-real)의 JSON(real/png/ 그 2D·3D 이미지)
```

### 좌표와 단위

- **도면 상태는 모두 mm이고 y는 아래로 커진다**(도면 이미지와 같은 방향). 이미지는 원점 (0,0)에 놓이며
  이미지 1px = `plan.mmPerPx` mm다.
- 3D는 m 단위이고 **도면 x → 3D x, 도면 y → 3D z**다(`M = 0.001`).
- 가구 회전 `rot`(도)은 화면에서 시계 방향이고, 3D에서는 `rotation.y = -rot`이다.
  **가구의 앞면은 로컬 +y(= 3D +z)**다. 2D에서 두꺼운 변이 앞면이고, 3D 모양도 +z 쪽에 문·손잡이를 단다.
  `snapToWall()`도 이 약속에 기대어 등(-y)을 벽에 댄다.

### 상태 (`store.js`)

```
state.plan      { name, image:{src,width,height} | null, mmPerPx, scaleSet, scaleRef, entrance, walls[], rooms[], windows[], doors[], doorsRemoved[], blocked[], wallHeight, floor, fixtures[] }
  name          도면 이름('' 가능). 상단 되돌리기 왼쪽 입력칸 `#plan-name`(`renderPlanName`, 바꾸면 checkpoint + 'plan')에서 고치고, 저장(.json) 파일 이름
                `ohmyhome-{이름}-{날짜}.json`(`fileSafe`, 이름이 없으면 `ohmyhome-{날짜}.json`)과 창 제목에 쓴다. 위례자이더파크 창으로 열면 고른 이름,
                json 파일은 파일 안 이름 → 없으면 파일 이름에서 짐작(`nameFromFile`), 도면만 바꾸기도 같다. 샘플 도면은 '샘플 도면', 새 프로젝트는 ''.
                날짜뿐인 이름(`DATE_ONLY` — 연도 19xx·20xx + 월 + 일, 뒤 `(1)` 허용. 파일 이름 `ohmyhome-2026-11-08 (1).json` 등, 파일 안 이름, 직접 넣은 이름, 지난 작업)은
                `planNameOr()`가 'NewHome'으로 바꾼다. 동·호수(5206-1401) 같은 숫자 이름은 그대로 둔다
  scaleRef      { a, b, mm } | null — 축척을 맞춘 기준 치수선 (2D에 주황 점선으로 그린다)
  wall          { id, a:{x,y}, b:{x,y}, t(두께), cap, auto }
  room          { id, name, pts:[{x,y}], hidden? }
  window        { id, a, b, t, sill, h, auto } — a–b는 벽 중심선 위 창 양 끝, sill: 바닥~창 아래, h: 창 높이 (mm)
  door          { id, a, b, t, swing, auto, style? } — a: 경첩 끝, b: 반대 끝(벽 중심선 위), swing: 문짝이 a→b 왼쪽 법선 (-uy, ux) 쪽이면 1
                style: 'double'(양여닫이) | 'sliding'(미닫이) | 'bypass'(미서기) | 'middle'(현관 중문), 없으면 여닫이(`doorStyle(d)`). 미닫이·중문의 swing은 문짝이 붙는 벽 면, a는 열리는 쪽
state.furniture { id, type, name, w, d, h, x, y, rot, elev, color, libId, usePhoto, model?, price? }
  model, price   사용자가 넣은 모델명·가격(원, 정수). 없으면 키가 없다. 합계는 price 있는 것만 더한다
  builtin        '기본 포함 가구'(집에 딸려 오는 것)면 true, 아니면 키가 없다. 가격이 있어도 합계(`sumPrice`)에서 뺀다. 2D는 바닥 모양 안에 45° 빗금(`editor.hatch`)이고 다른 가구보다 먼저(맨 뒤에) 그린다.
                 겹친 곳을 누르면 기본 포함이 아닌 가구를 먼저 고른다(2D `editor.hitFurniture`, 3D `view.pickFurniture`)
  disabled       '비활성화'(지우지 않고 잠시 빼 둔 것)면 true. 2D 점선·연한 색, 3D `setGhost`, 겹침(`findCollisions`)·둘러보기 길(`buildGrid`)·
                 합계·개수(`excluded()`)에서 뺀다. 엑셀 '모든 가구'에서는 기본 가구와 함께 합계 아래에 모은다
  custom         '맞춤 제작'(기성품 아님 — 크기·비용이 다를 수 있음)이면 true. 합계에는 그대로 들고, 2D 치수 아래 `🛠️ 맞춤` 꼬리표(`editor.customTag`),
                 목록·묶음 패널 `CUSTOM_TAG`, 엑셀 '구분' '맞춤 제작'으로만 보인다
  문도 name·model·price·builtin을 가질 수 있다(속성 패널). 현관 중문은 늘, 다른 문은 price가 있을 때만 비용 항목이다(`costDoors()`)
state.library   예전 '가구 사진으로 크기 재기'로 만든 내 가구 { id, type, name, w, d, h, color, image(dataURL), usePhoto }
                사진 기능은 사용자 요청으로 없앴다(더하는 길 없음). 예전 프로젝트를 열면 '내 가구' 칸에 보이고 놓을 수 있다
state.layouts   배치 안 [{ id, name, furniture, locked? }], state.layoutId — 지금 안의 가구는 state.furniture에 있고 그 안의 furniture 칸은 비워 둔다
  locked        보호 중인 안이면 true(없으면 키가 없다) — 그 안의 가구를 바꾸지 못하고 안도 지우지 못한다
ui.selection    { kind: 'furniture'|'wall'|'room'|'window', id, ids? } | null   (저장하지 않는다)
  ids           가구를 2개 이상 골랐을 때만 있다. id는 마지막에 고른 가구
```

- 화면들은 `on('plan' | 'furniture' | 'library' | 'layouts' | 'selection')`을 듣고 다시 그린다. 상태를 바꾼 쪽이 `emit()`한다.
  `selection` 말고 다른 이벤트가 나면 600ms 뒤 자동 저장된다(`saveNow`): localStorage에 늘, 그리고 serve.py로 열었으면
  `PUT api/project`로 프로젝트 폴더의 `ohmyhome-project.json`에(차례대로 보내 늦은 요청이 새 내용을 덮지 않게).
  시작할 때(`main.js` 맨 위 top-level await) `loadFromServer()`가 그 파일을 먼저 읽는다 — 응답 머리글 `X-OhMyHome: 1`이 없으면
  저장 서버가 아닌 것으로 보고 localStorage만 쓴다. 폴더 파일로 열면 localStorage 예비본도 같게 맞추고, localStorage에만 있던 작업은
  바로 폴더에 써 둔다. 그래서 localhost·127.0.0.1·IP 어느 주소로 열어도 같은 작업이다(동시에 고치면 나중 저장이 남는다).
- **배치 안**: `store.addLayout()`(지금 안을 새 id로 복사해 맨 끝에 더하고 넘어감) · `switchLayout(id)` · `renameLayout` · `deleteLayout`
  (하나뿐이면 안 지움, 지금 안이면 옆 안으로). 부르는 쪽이 먼저 `checkpoint()` — 스냅숏에 안 목록과 지금 안이 들어가 Ctrl+Z로 안 바꾸기도
  돌아온다. 저장 데이터의 `furniture`는 지금 안(예전 앱도 연다), `layouts`는 모든 안(지금 안도 채워서), 안이 없는 예전 파일은 '1안' 하나.
  도면·문(중문 비용 포함)·내 가구는 모든 안이 함께 쓴다. 엑셀·캡처 파일 이름에 안 이름(`layoutTag()`, 안이 둘 이상일 때)을 붙인다.
  `setScale()`은 다른 안의 가구도 함께 옮긴다(보호 중인 안도 — 도면 위 자리를 지키는 것이다).
- **안 보호**(`setLayoutLocked`, 🔒 보호 버튼 — 부르는 쪽이 `checkpoint()`): 가구를 바꾸는 곳마다 먼저 `store.furnitureLocked()`를 부른다 —
  보호 중이면 `setLockedHandler`로 상태줄에 알리고 true. 가구 추가·속성 칸·식물/크기 빠른 선택·속성 버튼·회전·복제·방향키·삭제·지우개 도구가 쓰고,
  끌기는 `dragFurnitureTo()`가 처음 움직일 때 본다(누르면 고르기만 된다). 보호 중인 안의 가구 속성 패널은 칸을 모두 `disabled`로 그린다.
  둘러보기 시작 때 설비 자동 배치는 보호 중인 안에서 건너뛴다. 새로 가구를 바꾸는 길을 만들면 여기에도 `furnitureLocked()`를 넣는다.
- **상태를 바꾸기 전에 `checkpoint()`를 부른다**(되돌리기 기록). 끌기처럼 연속으로 바뀌는 것은 **처음 실제로 움직일 때 한 번만**
  부른다. 클릭만 하고 놓아도 기록이 쌓이지 않게 하려는 것이다(`drag.started`).
- 되돌리기 스냅숏은 도면 이미지 dataURL을 복사하지 않고 **참조만** 들고 있다. 이미지가 커서다.
- 저장 공간이 모자라면 `setSaveErrorHandler`로 상태줄에 알린다. 도면 이미지는 열 때 긴 변 2400px 이하로 줄인다.

### 벽

- `cap: true`(직접 그린 벽)는 양 끝을 두께 절반씩 늘려 모서리를 메운다. 중심선을 이어 그리기 때문이다.
  `cap: false`(자동 인식 벽)는 사각형 그대로다. 길이는 언제나 `G.wallLength()`로 구한다.
- **`setScale()`은 벽·방·가구 위치를 같은 비율로 옮긴다.** 이미지 위의 자리를 지키기 위해서다.
  가구 크기와 직접 그린 벽 두께는 실제 치수이므로 그대로 두고, 이미지에서 잰 자동 인식 벽 두께만 함께 늘린다.
- 축척을 맞추기 전에는 도면 가로를 12m로 가정한 `mmPerPx`를 쓰고 `scaleSet: false`로 둔다(화면에 경고가 뜬다).

### 기준 치수 — 한 곳의 크기를 고쳐 도면 전체를 맞춘다

축척을 맞추는 길은 모두 `store.applyScaleRef(a, b, mm)` 하나로 모인다. "도면 위 a–b 사이가 실제로 mm"라는 뜻이고,
`scaleRef`로 남겨 두었다가 왼쪽 패널의 '기준 치수' 값만 고쳐 다시 맞출 수 있다. 들어오는 길은 넷이다.

- **📏 치수 도구로 방 안을 한 번 클릭**: `editor.measureAt()`이 `hooks.spanAt()`으로 좌우·위아래 벽까지 재어
  지금 보이는 가로·세로를 띄운다(`#measure-pop`). 값을 고치고 Enter → `applyMeasure()`.
  벽이 있으면 `G.spanAt()`(벽 다각형에 반직선), 아직 없으면 도면 이미지에서 어두운 픽셀이 `minRun` 이상
  이어지는 곳을 벽으로 본다(얇은 글자·치수선은 지나친다). 문·창 틈으로 새는 축은 null이고 창에 안내가 뜬다.
  Shift+클릭이거나 벽 사이가 아니면 두 점 모드로 넘어간다.
- 자동 인식 벽 속성의 '길이', 방 속성의 '가로'·'세로': 도면 이미지가 있으면 그 길이로 **전체 크기**를 맞춘다
  (도면 없이 빈 모눈에 그린 벽과 **직접 그린 벽(`auto: false`)**은 끝점만 옮겨 그 벽만 바꾼다 — 사용자가 더한 벽은 도면 치수가 아니다).
- '도면 전체 가로': 이미지 윗변 전체를 기준선으로 쓴다.

길이 입력은 언제나 `G.parseLengthMM()`으로 읽는다. `3.8m` · `3.8` · `3800` · `3,800` · `380cm`를 모두 받고,
**단위가 없고 50보다 작으면 m로 본다**(국내 도면은 m 표기가 많아 3.8을 3.8mm로 읽으면 안 된다).

도면 그림이 표기 치수와 비율이 안 맞는 경우가 있다(설명용 그림·이미지 생성 도면). 이때는 어느 치수를 기준으로 해도
다른 방이 표기와 어긋난다. 앱은 그림 비율을 따르므로 사용자에게 그 사실을 알려 주는 것이 맞다.

### 벽 자동 인식 (`wallDetect.js`)

어두운 픽셀(또는 찍은 벽 색과 가까운 픽셀)로 마스크를 만든다. 다음으로 k×k **열림 연산**(침식 → 팽창)으로 k보다 얇은 것,
즉 글자·치수선·문 호·창 선을 지운다. 남은 덩어리는 축에 나란한 사각형으로 덮는다. 사각형 하나가 벽 하나이고,
긴 쪽이 벽 방향이 된다(`rectToWall`).

- k는 화면의 '최소 벽 두께(mm)'를 처리 해상도의 px로 바꾼 값이다. 처리할 때는 긴 변 1600px 이하로 줄인다.
- 열림 뒤에 `dropSmallPieces()`가 이어진 덩어리 중 가로·세로 모두 '작은 조각 무시(mm)'보다 작은 것을 지운다.
  제목 같은 **굵은 글씨는 두께만으로 걸러지지 않아서**(획이 얇은 벽보다 굵을 수 있다) 넣은 단계다.
  실제 벽은 서로 이어져 큰 덩어리가 된다.
- 침식·팽창은 가로·세로로 나눈 누적합 창 연산이다. **두 연산의 창 오프셋(lo/hi)은 서로 뒤집혀 있어야** 제자리로 돌아온다.
- 다시 인식하면 `auto: true` 벽만 바꾸고, 직접 그린 벽은 남긴다.
- 사선 벽은 찾지 못한다(사용자가 직접 그린다).

### 둘러보기 (`tour.js`, `walkGrid.js`)

출발점은 `state.plan.entrance`(현관문 틈 `{ a, b, t, out }`)다. 없으면 2D에서 `entrance` 도구로 문 자리를 누르게 하고,
`G.findDoorGap()`이 벽 끝에서 쏜 반직선으로 틈과 바깥 방향을 찾는다. `setScale()`은 entrance도 함께 옮긴다.

- `walkGrid.buildGrid()`: 100mm 칸, 벽·가구(높이 1.2m 아래)에서 몸 반지름 220mm 안쪽 칸을 막는다. **벽들의 바깥 사각형 밖은
  모두 막는다** — 이미지에서 인식한 벽은 창 자리가 틈이라 그대로 두면 창으로 걸어 나간다.
- 둘러보기 중에는 **현관문 틈을 벽으로 막은 지도**를 쓴다. 막지 않으면 들를 곳이 공용 홀(밖)까지 잡힌다.
  현관 앞 → 문 → 현관 안쪽 구간은 지도를 쓰지 않고 정해진 직선으로 걷는다.
- 현관 안쪽(`inside`)에 들어서면 먼저 현관을 한 바퀴 둘러본다(steps[3], 들를 곳 개수에는 안 든다).
- 들를 곳은 `Tour.planPlaces()`가 정한다. **방문(중문 포함 `plan.doors` 전부)을 벽으로 막은 가구 없는 지도**를 `zonesOf()`로 이어진 칸
  덩어리(구역)로 나눈다. 가장 넓은 구역이 거실·주방·복도가 트인 공간이고, 현관 안쪽 점의 구역(중문이 있으면 따로)은 현관이다.
  - 나머지 구역(방문 너머, 몸 반지름만큼 줄인 넓이 1㎡ 이상)은 **모두 들른다**. 설 자리는 구역 무게중심에 가장 가까운, 걸어서 닿고 벽·가구에서
    30cm 더 떨어진 칸(`clearance` ≥ 3칸, 없으면 가장 넉넉한 칸). 이름은 그 점이 든 방(`rooms`) 이름, 없으면 구역 안 가구로 짐작(`guessRoom`:
    변기·욕조 → 욕실, 침대 → 침실, 옷장 → 드레스룸, 실외기 → 실외기실, 김치냉장고·냉장고 → 펜트리 …, 없으면 '방').
  - 트인 공간에서는 거실(`findLiving`의 방·칸 가운데)과 주방(싱크대 앞 80cm, ㄱ자는 가운데. 없으면 냉장고)을 한 번씩. 그래도 두 곳이 안 되면
    빈 칸 봉우리(`roomCenters`)로 채운다.
  - **이름 붙은 방은 꼭 들른다**(`Tour.roomSpot` — 욕실은 설비가 차서 봉우리가 안 생긴다). 같은 이름이 여럿이면 '침실 1·침실 2'로 번호를 붙인다.
  - 방문이 하나도 없는 도면은 구역이 안 나뉘므로 예전처럼 봉우리로 고른다: `roomCenters`는 거리 변환의 봉우리이고, 벽만 있는 지도
    (`sightGrid`)에서 서로 보이고 3.2m 안이면 같은 방으로 묶는다.
  - 순서는 `orderByWalk`(걷는 칸 수 기준 욕심 순서 + 2-opt).
- 둘러보기를 시작할 때 `fixtures.autoFixtures()`가 설비를 놓는다(일반 가구로 들어가 되돌리기·삭제 가능). 그 방에 같은 종류가
  이미 있으면 건너뛰고, 벽·가구와 겹치는 설비(`findCollisions`)는 빼고 놓는다.
  - 신발장(`shoe_cabinet`): 방 이름 없이 `plan.entrance`만 본다. 현관문 안쪽 옆벽에 문틀부터 세우되, 문 폭 바깥이고
    통로 800mm가 남는 쪽, 벽이 곧게 이어지는 길이(최대 1,200)만큼. 3m 안에 신발장(종류 또는 이름 '신발')이 있으면 건너뛴다.
    현관문은 밖(공용 홀)으로 열리므로 신발장을 가리지 않는다 — 둘러보기 현관문의 경첩은 도면의 현관문(`plan.doors`, a = 경첩 끝)을 따른다(`buildScene`).
  - 욕실/화장실: 변기·세면대. 이름이 부부·안방·마스터·파우더가 아닌 욕실 가운데 **가장 큰 한 곳**에는 욕조를 문 없는 짧은 벽에
    벽 끝까지 대고, 맞닿은 막힌 옆벽에 욕조 쪽부터 세면대 → 변기 순으로 놓는다. 안 들어가면 변기·세면대만 안쪽 벽에.
  - 주방/부엌: 도면의 기본 싱크대(`plan.fixtures`)가 그 방에 있으면 그것(ㄱ자 등), 없으면 1자 주방 싱크대(개수대·인덕션 3구·상부장·후드).
    '이미 있다'는 가운데뿐 아니라 바닥 모양 꼭짓점 하나라도 방 안이면(`inRoom`) 본다.
  - 놓을 벽은 방 안쪽 상자(`innerBox`, 가운데에서 `spanAt`)의 네 변 가운데 **벽 면 25mm 바깥**이 가장 많이 비어 있는 변
    (=문 쪽)의 반대편이다. 25mm보다 멀리 재면 60mm 샤프트 벽을 넘어가 '열린 변'으로 잘못 읽는다.
  - 방 이름이 없는 도면은 욕실·주방을 알 수 없어 신발장만 놓고, 상태줄에 방 이름을 붙이라고 안내한다(`hasFixtureRooms`).
- 우물천장은 **거실만**: 안쪽 상자에서 450mm 들어온 자리를 천장 판에 구멍(`Shape.holes`)으로 뚫고,
  150mm 위에 판·옆면·간접조명 띠를 붙인다. 거실은 `Tour.findLiving()`이 고른다:
  이름이 '거실'인 방 → 없으면 **아래 바깥벽에 닿은 공간 가운데 가로가 가장 넓은 곳**(가로·세로 2.4m 미만 제외).
  방 영역이 있으면 방들 중에서(`innerBox`), 없으면 아래 바깥벽 80cm 안쪽 줄을 가로로 훑어 벽 사이 구간 중에서 고른다.
  방 가운데에서 좌우로 재면 문 틈으로 옆방까지 새므로 이렇게 한다. 깊이는 가로의 1.2배(최소 3m)까지(위가 주방으로 트인 경우).
  고른 칸 안의 들를 곳은 이름이 '공간 n'이면 '거실'로 바꾼다.
- 나머지 방(벽등 `wall_light`이 있는 방 빼고)은 천장 가운데 네모 LED 방등(`buildLeds`, 방 짧은 변 2.6m↑ 600 / 1.6m↑ 450 / 그 밖 300mm)과 그 아래 약한
  PointLight(열 개까지). 방이 없는 도면은 들를 곳 자리에 단다. 칸 크기(`spanBox`)는 창·현관문 틈을 막은 벽으로, 축마다
  **짧은 쪽 거리**로 잰다 — 반대쪽은 문 틈으로 새어 옆방 벽까지 잴 수 있다.
- 방 영역의 `hidden: true`는 "도면 이미지에 이미 그려진 방"이라 2D·3D에 색과 이름표를 그리지 않는다(이름·면적용).
- **현관·욕실 단차**: 둘러보기 중 `view3d.sunkenZones(plan)`(이름이 '현관'(창고·중문·팬트리 빼고)·'욕실'·'화장실'인 방, 현관 방이 없으면
  현관문 안쪽 문 폭 × 1.2m)을 나무 바닥에 구멍(`Shape.holes`)으로 뚫고 `SUNKEN`(현관 120 · 욕실 60mm)만큼 내린 회색 타일 바닥 + 가장자리 옆면을 깐다.
  그 안의 가구(`syncFurniture`)·방 색 바닥·둘러보기 눈높이(`tour.applyCamera`)는 `view.floorAt(p)`만큼 함께 내려간다. 문틀 자리(벽 두께)는 문턱으로 남는다.
- **둘러보기 중 편집 잠금**(`main.js` `lockForTour`): 시작 때 `TOUR_LOCK`(왼쪽 `.sidebar`·속성 `#props`·`#plan-name`·되돌리기·다시 하기·새 프로젝트·`.stage-bar`)에
  `inert`를 걸고 `body.touring`(흐리게) + `#tour-lock` 안내를 띄운다. 나가기(`onExit`)에서 푼다. 저장·캡처·공지는 잠그지 않는다. 편집 버튼을 새로 만들면 여기에도 넣는다.
- `view3d.setTourMode(true)`는 나무 바닥·천장 높이 벽·이름표 숨김으로 다시 그린다. 문짝·문 위 벽·천장·실내등은
  `Tour.group`에 따로 두고 나갈 때 치운다. 둘러보기 중 키 입력은 `tour.js`가 capture 단계에서 받고, `main.js` 단축키는 쉰다.
- **도면 편집 화면 전체 화면**(`#btn-full`, 둘러보기 버튼 왼쪽): 보기 칸 `#views`에 `requestFullscreen` — 지금 보기(2D·나란히·3D) 그대로이고,
  캔버스 크기는 ResizeObserver가 맞춘다. `⤢ 맞추기`(`#btn-full-fit` — `editor.fit()` + `view.resetCamera(view.camMode)`)·`📷 캡처`(`#btn-full-cap`)·`✕ 닫기`(`#btn-full-close`)는 `#views` 안 `.full-actions`(absolute)에 두고 CSS `.views:fullscreen`일 때만 보인다.
  캡처(`captureViews`)는 보이는 2D·3D 캔버스를 화면 자리 그대로 한 장에 그리고, DOM인 3D 이름표(`.label3d`)는 계산된 스타일로 다시 그려 PNG로 받는다
  (전체 화면에서는 상태줄이 안 보여 결과를 버튼 글자로 알린다).
- **둘러보기 전체 화면**(안내판 `⛶ 전체 화면`·F): `view.el`(#view3d)에 `requestFullscreen` — 안내판이 그 안에 있어 함께 보이고, 크기는 ResizeObserver가 맞춘다.
  전체 화면이면 Esc는 전체 화면만 끄고, 나가기(`exit`)는 전체 화면도 끈다. 버튼 글자는 fullscreenchange와 요청 뒤(`toggleFull`) 둘 다에서 고친다(헤드리스는 이벤트가 안 온다).

### 문 (`doors.js`)

- 후보 틈은 `doorGaps()`: 벽 끝에서 벽 방향으로 쏜 반직선이 **어느 벽이든** 500~1,300mm 안에서 닿는 곳(같은 줄 벽만 보는
  `findWindowGaps`로는 복도에서 방으로 꺾이는 문을 놓친다). 창 자리 틈은 뺀다.
- 틈마다 경첩(양 끝) × 여는 쪽(양쪽) 네 가지 기호를 가정해 이미지와 맞춰 본다. 경첩은 **벽 면 위**(중심선에서 t/2), 문짝은 문 폭 길이로
  벽에 수직, 호는 반대 끝까지. 호 10~80° 표본의 60%, 문짝 선 표본의 50% 이상이 어두우면(< 180, 법선 방향 ±25mm) 문이다.
  여닫이 기호가 없는 틈(600~2,400mm)에서는 **미서기 기호**를 본다(`bypassSymbol`): 벽 두께 안(±t/2+20mm)을 법선 방향으로 훑어,
  a 쪽 절반(8~40%)에만 있는 선과 다른 자리에서 b 쪽 절반(60~92%)에만 있는 선(75% 이상 어둡고 반대쪽 25% 이하)이 둘 다 있으면
  `style: 'bypass'`로 단다. 틈 전체를 가로지르는 창 기호는 이 엇갈림 조건에서 빠진다. 벽 면 밖에 붙는 미닫이는 찾지 않는다.
- 자동 문은 벽 인식·'문 기호 찾아 문 달기'·둘러보기 시작 때 다시 찾는다(`autoDoors`, 창과 같은 방식: `auto: false`는 그대로).
  문 목록이 없는 예전 프로젝트·저장본을 열면 한 번 찾아 단다(`doorsForOldProject`, 그래서 `loadSaved()`는 불러온 원본을 돌려준다).
- 자동 문을 지우면 그 가운데를 `plan.doorsRemoved`에 남기고(`store.removeItem`), 다시 찾을 때 300mm 안의 문은 달지 않는다.
  🚪 문 도구로 그 자리에 직접 달면 목록에서 빠진다. 새 도면 이미지를 넣으면(`setPlanImage`) 비운다. `setScale()`도 함께 옮긴다.
- 경첩·여는 쪽을 손으로 바꾸면 `auto: false`가 된다. 경첩을 반대로 하면 a↔b를 바꾸고 swing도 뒤집는다(법선이 뒤집히므로).
- 3D: 문 위 벽(`catalog.DOOR.h` ~ 천장, `wallPiece`) + 문틀 + 90° 열린 문짝(`models3d.buildDoorFrame/buildDoorLeaf`).
  둘러보기 중 현관 자리의 문은 그리지 않는다(`tour.js`가 여닫는 현관문을 따로 만든다). 문짝은 길 찾기 장애물에 넣지 않는다.
- **현관문은 두꺼운 철문이고 밖(공용 홀)으로 열린다.** 현관 자리(entrance에서 200mm 안)의 여닫이 문짝은 `models3d.buildSteelDoor`(강철 `STEEL_DOOR` —
  두께 75mm, 양면 판 무늬·레버·도어 렌즈·경첩, 바깥 면 번호 키 도어록, 안쪽 면 도어록 몸체·도어 클로저)로, 문틀도 강철 색으로 그린다(편집 3D·둘러보기 둘 다).
  바깥 면은 닫혔을 때 `entrance.out` 쪽 면이다. 둘러보기는 `Tour.doorOpen`을 `e.out` 쪽으로 돌린다. 샘플 도면의 현관문(swing)도 모두 밖으로 열린다.
- **양여닫이(`double`)**: 양 끝 경첩의 반쪽 짝 둘이 swing 쪽으로 열린다. `doors.swingLeaves(d)`가 짝마다 `{ door, g }`(b 쪽 짝은 a↔b·swing을
  뒤집은 반쪽 문)를 주고, 2D 기호·클릭·3D 문짝이 모두 이것을 돈다. 여닫이 계열인지는 `isHinged(d)`로 본다(경첩 반대로 버튼은 없다).
- **미닫이·미서기·중문(`style`)**: `doors.slidingPanels(d)`가 문짝 자리를 준다 — 짝마다 닫힌 자리 [s0, s1], 벽 중심선에서 떨어진 거리 `off`,
  열린 자리까지 밀 길이 `shift`(-면 a 쪽). 2D(닫힌 자리 + 화살표)·3D(shift만큼 민 자리)·클릭 범위(`reach`)가 모두 이것을 쓴다.
  - 미닫이: 틈이 `SLIDE.twoOver`(1,300)보다 넓으면 두 짝이 양쪽으로, 아니면 한 짝이 a 쪽으로 문짝 폭의 92%만큼 열린다
    (그래서 '여는 방향 반대로'는 경첩 반대로와 같은 a↔b + swing 뒤집기). 3D는 `models3d.buildSlidingLeaf` + 레일.
  - 미서기(`bypass`): 벽 중심선 양쪽 레일(±(T/2 + track/2))에 반씩, 가운데 `middleLap`만큼 겹친다. 3D는 b 쪽 짝을 a 쪽 짝 위로 밀어
    반쯤 열어 두고, 레일은 벽 두께 안에 놓는다.
  - 중문(`middle`): 유리 3연동. 세 짝이 레일 셋(`off`가 짝마다 `SLIDE.t + track`씩 바깥)에 `middleLap`씩 겹쳐 놓이고, a 끝 짝 위로 모여
    열린다. 3D는 `buildGlassLeaf`(짙은 회색 `MIDDLE_FRAME` 틀 + 유리), 문 위는 벽 대신 고정 유리 `buildTransom`.
  - '현관 중문' 버튼(`placeMiddleDoor`)은 `doors.findMiddleDoorGap(plan)`으로 자리를 찾는다: 현관문 바로 안쪽 점이 든 방 영역이 있으면 그 방
    가장자리(250mm 안)에 걸친 틈, 없으면 현관문과 나란하고 0.6~3.5m 안쪽인 가장 가까운 틈. 문짝은 현관 반대쪽 면에 붙인다. 그 틈에 문이 있으면
    중문으로 바꾼다.
  - 중문은 2D에서 끌거나(`editor.doorDrag`, 처음 움직일 때 checkpoint) 속성의 '현관문에서 (mm)'(`depthFromEntrance`)로 옮긴다. 둘 다
    `doors.moveDoorAlong(door, walls, dist)` — 문 폭에 수직으로만 옮기고, 새 가운데에서 양쪽으로 쏜 반직선이 닿는 벽까지로 a·b를 다시 잡는다.
    양옆 벽이 없거나(복도로 나감) 벽 속이면 null이라 그 자리로는 가지 않는다.
  - 속성에서 모양을 고르면 `editor.doorStyle`에 남아 🚪 문 도구로 새로 다는 문도 그 모양이 된다.
- 둘러보기에서 집 안에 있으면 문짝(`view.doorLeaves`, 현관문 `Tour.pivot`)을 `models3d.setGhost()`로
  거의 투명한 면 + 모서리 선으로 바꾼다(`Tour.updateDoorsGhost`, 바뀔 때만). 밖은 `Tour.isOutside`(벽·창·현관문·모든 틈을 막은 `G.outsideTester`)와
  현관문 문턱(줄에서 안쪽 300mm까지, 문 폭 안)만이다 — 현관문 줄만 보면 그보다 바깥쪽에 있는 실외기실·발코니에서 투명이 풀린다. 원래 재질은 `userData.solid`에 두고 되돌린다.
  `view.doorsGhost`는 도면을 다시 그려도 유지되고, `setTourMode(false)`에서 끈다.

### 창 (`windows.js`, `G.findWindowGaps`)

- 창은 벽과 따로 `plan.windows`에 둔다. 3D는 벽 상자를 창 자리만큼 잘라(`G.windowSpanOnWall`) 토막으로 세우고,
  창 쪽에서 창 아래·위 벽과 창틀·유리(`models3d.buildWindow`)를 채운다. 그래서 **창이 벽 위에 있든 벽 틈에 있든** 똑같이 그려진다.
- 자동 창(`auto: true`)은 벽 인식 뒤와 둘러보기 시작 때마다 `findWindows()`로 다시 찾는다. 지금 찾은 자리에 없는 예전 자동 창은
  지우고, `auto: false`(🪟 창문 도구로 낸 창, 샘플 JSON의 창)는 건드리지 않는다. `auto`가 없는 창도 자동 창으로 본다.
  - 이미지의 연한 구간: 벽 중심선을 20mm 간격으로 따라가며 벽 두께 안쪽 다섯 점 밝기의 중앙값을 재고, 전체 벽 밝기 중앙값보다
    45 이상(또는 남은 밝기의 30%) 밝은 구간을 창으로 본다. 벽 양 끝에 닿은 구간은 벽이 그림과 어긋난 것으로 보고 뺀다.
  - 바깥벽 틈: 벽 끝에서 쏜 반직선이 **같은 줄의 나란한 벽**에 닿는 틈.
  - 둘 다 **한쪽이 집 바깥이어야** 창이다. 바깥은 벽과 모든 틈을 막은 40mm 칸 지도에서 테두리부터 채워 구한다(`G.outsideTester`).
    반직선 한 줄로 재면 다른 문·창 틈으로 새어 나가 안쪽 문을 창으로 막는다 — 그러면 둘러보기가 그 방에 못 들어간다.
  - 현관문 가운데에서 300mm 안을 지나는 구간은 뺀다.
- 둘러보기 길 찾기·설비 배치는 창을 벽으로 친다(틈에 낸 창으로 걸어 나가지 않게).
- 둘러보기 지도는 둘이다. 자동 진행(`grid`)은 현관문을 막은 지도라 다시 밖으로 나가지 않고, 직접 걷기(`walkGrid`)는
  현관문이 열린 지도다 — 막힌 지도를 쓰면 현관 앞(벽 사각형 안의 빈 칸)에서 문으로 못 들어간다. 직접 걷기가 막히면
  ±15°씩 60°까지 비껴 그 방향 40cm 앞이 비었는지 보고 움직여서, 문을 정확히 겨누지 않아도 문 안으로 끌려 들어간다.
- `G.distToSegment()`는 숫자가 아니라 `{ dist, t, x, y }`를 돌려준다. 거리 비교는 `.dist`로 한다.
- 둘러보기 창밖은 `scenery.buildScenery()`가 만든다(`Tour.group`에 넣어 나갈 때 함께 치운다). 우리 층 바닥이 y=0이고 땅은
  `(plan.floor - 1) × 2.8m + 1m` 아래. 도면 아래쪽(+z)을 앞으로 보고 앞 30m에 4차로 도로, 길 건너 빌라, 사방에 아파트 동,
  반지름 320~900m 시가지, 1.5·2.3·3.2km에 산 능선 세 겹, 하늘 둥근 지붕을 놓는다. 고정 씨앗 난수라 늘 같은 풍경이다.
  나무는 약 2만 6천 그루: 가로수(도로 끝까지)·단지(230m)·시가지 숲 110곳과 흩어진 나무(~1.3km)·산 앞자락 숲 띠(1.25~1.5km)·
  가까운 산 두 겹의 비탈(능선 `height(a)`를 따라). 둥근 활엽수·뾰족한 침엽수 InstancedMesh 둘(+ 600m 안 줄기)로 그리고
  `setColorAt`으로 초록을 섞는다. `block()`이 남긴 건물 바닥(`taken`)과 도로에는 심지 않는다. 멀수록 크게 키운다(점으로라도 보이게).
  창 텍스처는 캔버스 한 장(8층 × 8칸)을 건물마다 `clone()`해 repeat만 바꾼다(같은 source라 GPU에는 한 번만 올라간다).
- 둘러보기 중에는 `camera.far = 6000`, `scene.fog`(500~4200m)를 쓰고 나갈 때 되돌린다. **`view3d`의 화면 크기 변경 처리는
  둘러보기 중 `resetCamera()`를 부르지 않는다** — 부르면 far가 500m로 돌아가 하늘·산이 잘리고 엉뚱한 삼각형이 보인다.

### 3D (`view3d.js`, `models3d.js`)

- **그릴 일이 있을 때만 그린다**(`view.invalidate(frames)` → `tick()`이 `dirty` 프레임만 렌더). 가만히 있을 때도 그림자·1,000번 넘는 그리기를 초당 60번 하면
  노트북이 계속 바빠져 화면이 가끔 버벅였다. `buildPlan`·`syncFurniture`·`resetCamera`·화면 크기·OrbitControls `change`·감속 중(`controls.update()`가 true)·
  텍스처 읽기 끝·문서의 입력 이벤트(누르기·키·휠·input/change)가 invalidate하고, 둘러보기 중에는 매 프레임 그린다. **장면을 바꾸는 새 코드는 끝에 `invalidate()`를 부른다.**
- 가구 메시는 `syncFurniture()`가 id별로 들고 있다. **크기·모양·색·사진·선택·겹침 여부를 이어 붙인 `key`가 바뀔 때만**
  다시 만들고, 위치·회전만 바뀌면 transform만 고친다. 선택 외곽선과 겹침 빨간 외곽선은 모양에 붙어 있어서 key에 들어간다.
- 새 샘플 모양을 더하려면 `catalog.js`의 `SHAPES`(+ 필요하면 `CATALOG`)와 `models3d.js`의 `BUILDERS`에 함께 넣는다.
  모양 함수는 m 단위 `(group, W, D, H, color)`를 받고, 바닥 가운데를 원점으로 앞면을 +z로 그린다.
- **숫자 하나로 크기를 정하는 가구**(TV 인치, 소파 인원, 식탁 인원)는 `catalog.SIZE_PRESETS` 한 표로 다룬다. 가구 항목에
  `f[key]`(`inch`, `seats`)를 남기고 `size(v)`로 크기를 바꾼다. 속성 패널의 입력칸·빠른 선택 버튼도 이 표를 보고 그린다.
  `affects`에 든 칸(가로 등)을 직접 고치면 `f[key]`를 지우고, 화면에는 `guess(f)`로 짐작한 값을 보여 준다.
  이름이 `namePattern`(예: `65인치 TV`, `3인 소파`) 꼴일 때만 이름도 따라 바꾼다. 새 항목은 이 표에만 더하면 된다.
- 모양 함수는 다섯째 인자로 가구 항목 `f`도 받는다(소파 쿠션 수 = `f.seats`). 모양에 영향을 주는 값을 새로 쓰면
  `view3d.syncFurniture()`의 `key`에도 넣어야 다시 그려진다.
- **ㄱ자 주방 싱크대(`kitchen_l`)**: `w` = 가로(뒤쪽), `d` = 세로(꺾인 쪽) 길이(세로가 더 길어도 된다), 상판 깊이 `f.counterD`(없으면 `catalog.L_COUNTER.depth`),
  꺾인 쪽 깊이 `f.legD`(없으면 상판 깊이 — `catalog.lLegDepth()`, 위 조리대 600 · 옆 선반 740처럼 다를 때),
  `f.mirror`면 꺾인 쪽이 왼쪽(기본은 앞에서 볼 때 오른쪽 +x). 바닥 모양은 `G.furnitureRects(f)`(사각형 둘)가 정하고,
  겹침(`findCollisions`)·클릭·길 찾기는 `G.furnitureParts()`, 2D 그리기는 `furnitureOutline`/`furnitureFront`를 쓴다 —
  `furnitureCorners()`(바깥 상자)로 재면 안쪽 빈 모서리까지 막힌다. 새로 사각형이 아닌 가구를 넣으면 `furnitureRects`에 더한다.
  3D는 `counterRun()`(싱크대 한 줄) 둘: 개수대와 인덕션·후드는 둘 다 가로 쪽, 모서리 칸(T)을 뺀 구간에서 꺾인 쪽 반대 끝이 개수대, 모서리 쪽이 인덕션
  (기본은 왼쪽 개수대 → 오른쪽 인덕션, `f.mirror`면 함께 뒤집힌다 — A2-real·A1-real 실측. `sinkAt`/`cookAt`). 꺾인 쪽은 상판·장만(주방 선반)이고 상부장은 모서리까지 늘려 가로 쪽 상부장에 붙인다.
  가로 쪽 남은 구간이 1.4m 미만이면 인덕션은 꺾인 쪽 끝에서 540mm에 놓는다.
  `SHAPES[type].dims`가 있으면 속성 패널의 가로·깊이 칸 이름을 바꾼다.
- **식물(`plant`)**: 종류는 `f.plant`(`catalog.PLANTS` 키, 없으면 몬스테라 — `plantOf()`). 종류를 바꾸면(`applyPlant`) 크기를 그 종류
  기본값으로 맞추고, 이름이 종류 이름이었으면 이름도 바꾼다. `f.color`는 화분 색(2D는 잎 색으로 칠한다). 3D는 `models3d.PLANT_SHAPES`의
  종류별 함수가 `leaf()`(납작한 타원)·`rod()`(줄기)로 그리고, 고정 씨앗 난수라 다시 그려도 모양이 같다. 스킨답서스 덩굴은 바닥을 뚫지 않게
  `f.elev`만큼만 늘어지므로 `syncFurniture()` key에 식물의 elev가 들어간다. 잎·줄기 지오메트리는 `sharedGeo()`로 함께 쓴다.
- **붙박이장/옷장(`wardrobe`)**: 모양은 `f.wstyle`(`catalog.WARDROBE_STYLES` 키 — `split` 상하 분리형, `drawer2`·`drawer3` 아래 서랍, 없으면 통 `tall`
  — `wardrobeStyle()`), `f.noDoor`면 문짝 없이 옆판·칸막이·뒤판 + 선반·옷걸이 봉·걸린 옷(오픈형, 서랍은 그대로).
  `mix` 믹스장은 가로를 `catalog.mixCount(w)`(약 900mm, 두 칸 이상) 칸으로 나눠 칸마다 `MIX_PARTS` 모양 — 칸별 모양은 `f.mix`(왼쪽부터, `mixStyles(f)`가
  모자란 칸을 기본 차례로 채운다). 3D는 칸마다 `closedSection`/`openSection`, 속성은 칸별 `mix-i` 선택(가로·모양을 바꾸면 `renderProps`).
  `fridge` 냉장고장은 `fridgeCabinet()` — 옆판 + 위 장(300~600mm, 냉장고 자리 1.89m — A1-real 실측)만, 아래는 바닥판·걸레받이·뒤판 없이 바닥까지 트인다.
  기본값(통·문 있음)은 키를 남기지 않는다.
- **정수기(`water_purifier`)**: 놓인 자리를 따른다 — `store.emit()`이 'furniture' 이벤트마다 `settlePurifiers()`를 불러, 가운데가 주방 싱크대
  바닥 모양 안이면(`G.counterUnder`) 소형(`catalog.PURIFIER.small`, `elev` = 싱크대 elev + `COUNTER_TOP`, 싱크대 rot, `f.onCounter = true`),
  아니면 바닥의 대형으로 바꾼다. 크기·띄움은 대형↔소형이 바뀔 때만, 이름은 기본 이름('정수기'·'대형 정수기'·'소형 정수기')일 때만 맞춘다.
  싱크대 위(`onCounter`) 정수기는 싱크대와 겹쳐도 된다. 상판 높이 `COUNTER_TOP`(850)은 3D 하부장(`counterRun`)도 쓴다.
- **벽등(`wall_light`)**: 벽에 다는 등(260×110×130, `elev` 1,900, 덮개가 은은히 빛난다 — `models3d.wallLight`). 둘러보기 `buildLeds`는 벽등이 든 방(`rooms`)에는
  천장 LED 방등을 달지 않고, 벽등마다 등 앞 30cm에 PointLight를 둔다(빛은 벽등이 먼저 — 합쳐 열 개까지). A-1·A-2형·A1-real·A2-real 실외기실은 문 들어가서 오른쪽 벽
  (A-1 계열 아래 벽, 좌우가 뒤집힌 A-2 계열 위 벽의 창과 문 사이)에 벽등이 기본 포함 가구로 있다.
- **전열교환기(`erv`)**: 천장에 매단 환기 장치(800×600×270, `elev` 2,030 — 위가 천장 2,300). 3D `models3d.erv`(본체 + 가로 양 끝 덕트 둘씩 + 매달기 쇠). 덕트는 본체 끝에서 벽 면까지
  (`f.ductL`·`f.ductR` mm — `store.settleRods`가 'furniture'·'plan' 때마다 `G.ductReach`로 잰다, 한쪽은 창 쪽 바깥벽으로 나간다) 이어 벽 관통 마감판을 단다.
  위례자이더파크 A-1·A-2형·A1-real·A2-real 샘플의 실외기실 천장 정중앙에 세로(긴 변이 위아래)로 기본 포함 가구로 들어 있다. 1.2m 위라 둘러보기 길을 막지 않는다.
- **커튼 봉(`curtain_rod`)**: 벽과 벽 사이에 거는 봉 — 가로 w = 봉 길이, 높이 h = 봉 높이(바닥에서), 색 = 커튼 천. `store.emit()`이 'furniture'·'plan'마다
  `settleRods()`로 `G.rodSpan(f, walls, catalog.ROD_SPAN)`(가운데에서 봉 방향 양쪽 반직선이 닿는 벽, 300~6,000mm)에 길이·가운데를 맞춰서, 끌거나 돌리면
  그 자리 벽 사이로 바로 늘고 준다. 가로를 직접 고치면 `f.manualW = true`(속성 '벽 사이에 자동으로 맞춤' 끔). 커튼은 `f.drape`(`ROD_DRAPES` — 없으면 open
  양옆으로 걷음 · closed 쳐 둠 · none 봉만, `rodDrape()`). 3D `models3d.curtainRod`(주름은 커튼과 같은 `pleats`). 벽·가구와 겹쳐도 되고(`WALL_OK`·`OVERLAP_ANY`),
  둘러보기 길(`buildGrid`)에서는 빼서 천을 지나 걷는다.
- **스툴(`chair` + `f.stool`)**: 등받이 없는 의자. 높이 H가 곧 앉는 면이라 `chairUnderDesk`는 앉는 면을 H로 보고(책상 밑에 통째로 들어간다),
  속성 '등받이 없음'을 켜고 끌면(`applyStool`) 높이·기본 크기(`catalog.STOOL` ↔ 의자 카드)와 이름('의자'↔'스툴')을 함께 맞춘다.
- 거울은 비출 환경맵이 없어 금속성을 높이면 검게 나온다. `MIRROR()`(밝은 회청색, 낮은 금속성)를 쓴다.
- 박스·구·원기둥 지오메트리는 `sharedGeo()`로 하나씩 공유하고 `scale`로 키운다. `disposeObject()`는 공유 지오메트리를 버리지 않는다.
- 사진 텍스처는 `library` id별로 캐시한다. `'library'` 이벤트가 나면 캐시를 비우고 전부 다시 만든다.
- `view.captureShots(shots, W, H, { type, floorImage })`·`editor.capture(W, H, scale, { house, type })`는 화면 크기와 상관없이 그림을 따로 그린 뒤
  렌더러 크기·카메라(2D는 view·그리던 선)를 되돌린다. 캡처 버튼은 **PDF 한 파일**(`pdf.makePdf`, JPEG 쪽, A4 비율 1980×1400/1400×1980)로 받는다:
  2D는 도면 전체 + `house`(=`houseBounds()` 벽·방·가구만 꽉 차게 — 도면 그림의 제목·설명·바깥 치수가 빠진다) 두 쪽,
  3D는 `SHOTS`(위 · 앞 왼쪽 · 앞 오른쪽) 세 장을 바닥 도면 그림 그대로 + `floorImage: false`로 한 번 더(여섯 쪽). 각 장은 `shotCamera()`가
  벽·가구 범위를 꽉 차게 잡고, 위에서 본 장은 집이 세로로 길면 세로로 찍는다. 둘러보기 중에는 지금 화면 한 쪽(1인칭 그대로).
- **도면은 json으로만 연다.** 왼쪽 `📂 도면 불러오기(json)`(`#file-project`)와 그 위 `Xi 위례자이더파크 불러오기`(`#btn-xi-park`, 자이 마크 색 남청 배경 + CSS `.xi-mark`(`css/xi-mark.png` 마스크) → `#sample-dialog`에서
  라디오로 고른 `sample/` 아래 파일(`plan/…` · `real/…`)을 fetch)가 `openProject()` → `loadProject()`를 부른다. 고를 수 있는 파일은 `main.js`의 `XI_PARK_SAMPLES`(항목에 `sheet`가 있으면 그 줄에 실측 기록지 PDF 내려받기 링크 — 지금은 A1-real·A2-real·B1-real·B2-real)
  (정적 서버는 폴더 목록을 주지 않으므로) — sample에 json을 더하면 여기에도 `file: 'plan/…'`(실측은 `'real/…'`)로 더한다. 공지·새 소식의 A1-real·A2-real 내려받기 링크(`index.html`)도 `sample/real/`을 가리킨다. 평면도 그림(PNG·JPG)을 여는 버튼과
  상단 '불러오기' 버튼은 사용자 요청으로 없앴다. `setPlanImage()`는 '샘플 도면으로 해 보기'만 쓴다.
- **도면만 바꾸기**(`#btn-plan-only` → `confirm` 경고 한 번 → `#file-plan-only`): 같은 집 도면이 조금 고쳐졌을 때 쓴다. `store.replacePlan(data)`가
  `plan`만 바꾸고(층수 `floor`는 지금 값 유지) 가구·배치 안(기본 포함 가구도)·내 가구는 mm 좌표 그대로 둔다. 되돌리기 한 번에 돌아온다.
  다만 주방 방에 싱크대가 하나도 없는 안(보호 중인 안 빼고)에는 새 도면의 기본 싱크대를 바로 놓는다(`fixtures.missingPlanSinks`, 같은 되돌리기 안).
- **도면의 기본 싱크대 `plan.fixtures`**: `loadProject`·`replacePlan`이 파일의 `plan.fixtures`, 없으면 그 파일 가구 가운데 '기본 포함' 싱크대(`kitchen_counter`·`kitchen_l`)를
  id 없이 담아 둔다. 둘러보기 설비 배치와 도면만 바꾸기가 1자 대신 이것을 놓는다(A2-real·A1-real은 ㄱ자). `setScale()`도 함께 옮긴다.
- 왼쪽 '② 가구' 탭을 누르면 `endDrawTool()`로 선택·이동 도구가 된다.
- 카메라는 사용자가 아직 돌리지 않았을 때(`userMoved === false`)만 화면 크기가 바뀔 때 다시 맞춘다.
- 방 이름표는 `CSS2DObject`다. 그룹에서 빼면(`clear()`) three.js가 DOM 요소도 함께 지운다.

### 화면 (`main.js`)

- 속성 패널은 선택이 바뀔 때만 통째로 그리고(`renderProps`), 같은 대상이 바뀌면 입력칸 값만 고친다(`refreshProps`).
  이때 **지금 포커스가 있는 칸은 건드리지 않는다.** 통째로 다시 그리면 Tab으로 칸을 옮길 때 포커스가 사라진다.
- **여러 가구 선택**: 가구만 된다. `selectedFurnitureIds()`·`selectFurniture(ids)`·`toggleFurnitureSelection(id)`로 다루고
  `ui.selection.ids`를 직접 만들지 않는다(없는 id를 걸러 1개면 `ids`를 뺀다). Shift+클릭으로 더하기·빼기, 2D 빈 곳 Shift+끌기는
  가운데가 사각형 안에 든 가구를 고른다. 고른 가구를 끌면 함께 움직인다 — 2D·3D 모두 `beginFurnitureDrag`/`dragFurnitureTo`
  (store) 하나를 쓴다. 하나는 자리를, 여럿은 이동량을 10mm 칸에 맞춘다. 묶음 동작(끌기·방향키·회전·복제·삭제)은 `checkpoint()`를
  한 번만 불러 Ctrl+Z 한 번에 돌아온다. 묶음 회전은 고른 가구 가운데를 축으로 자리까지 돈다. 속성 패널은 묶음 화면(`sel.ids`)을 따로 그린다.
- 가격 입력은 `parseWon()`(main.js)으로 읽는다: 쉼표·원·₩·공백을 빼고 `129만`·`129만 9천`·`12.9만`을 받는다. 화면은 `fmtWon()`.
  목록 위 `#placed-total`에 전체 합계(가격 없는 가구 수도 알림), 종류 제목에 소계, 여러 개 선택 패널에 고른 가구 합계를 보인다.
  `builtin` 가구는 세 합계 모두에서 빼고(목록 위 개수도 뺀 수, `priceNotes()`가 '총 n개 중 기본 가구 m개는 제외' 안내), 목록에는 '기본 포함'과 지운 줄 가격(`priceTag()`)으로 보인다.
- 합계·'배치된 가구' 목록(맨 아래 🚪 문 묶음, 누르면 문 선택)·엑셀은 `costItems()` = 가구 + `costDoors()`(가구 꼴로 바꾼 문,
  `door: true`, 크기는 문 폭 × 벽 두께 × `DOOR.h`)를 쓴다. 문의 가격·모델명·기본 포함을 고치면 'plan' 이벤트를 낸다.
- 가구 목록 엑셀(`furnitureSheet(all)`, main.js): 기본은 가격이 계산된 가구(`!builtin && price != null`)와 합계 줄(`SUM` 수식 + 미리 계산한 값).
  `모든 가구`(`#xlsx-all`)면 기본 가구가 아닌 것을 모두 위에, 합계 줄 아래에 기본 가구를 회색으로 따로 모은다. 순서는 목록과 같은 `byTypeThenName`.
- 왼쪽 '배치된 가구' 목록은 `SHAPES` 순서로 종류별로 묶고(제목 + 개수), 같은 종류 안은 이름순(`Intl.Collator('ko', { numeric })`)이다.
- 새 가구는 `dropPoint()`가 화면 가운데에서 나선형으로 돌며 벽·가구와 겹치지 않는 첫 자리에 놓는다.
- **배치 금지 구역 `plan.blocked`**(`{ id, pts }`, 도면의 빗금 칸 — 샤프트 등): `G.findCollisions(furniture, walls, blocked)`가 벽처럼 재므로
  (WALL_OK 종류는 넘어간다) 부르는 곳은 늘 셋째 인자로 `plan.blocked`를 넘긴다. 2D는 회색 빗금 + 점선 테두리(`editor.hatch`)로 그린다.
  샘플 JSON에는 생성 스크립트의 샤프트 사각형이 들어 있고, `blocked` 키가 없는 예전 프로젝트·저장본을 열면 `blockedForOldProject()`가
  `wallDetect.findHatchRects()`(빗금 바탕 #e3e5e9 · 선 #9aa1ab 색의 8px 칸 → 사각형, ㄱ자는 둘)로 한 번 찾아 넣는다. `setScale()`도 함께 옮긴다.
- 겹침 판정은 `G.findCollisions()` 하나다. 맞닿기만 한 것은 겹침이 아니도록 꼭짓점을 1~2mm 안쪽으로 줄여 잰다.
  가구끼리는 높이 구간(`elev`~`elev+h`)이 겹칠 때만 겹침이다(벽걸이 TV와 거실장).
  **의자와 책상·식탁·화장대(`KNEE_SPACE`, 종류별 상판 높이)**는 앉는 부분이 상판 밑으로 들어가도 되고, 상판보다 높은 등받이 띠
  (`CHAIR_BACK_MM`, 의자 로컬 -y 쪽)가 책상과 겹칠 때만 겹침이다. 앉는 면이 상판 밑으로 못 들어가는 낮은 테이블은 평소대로 잰다.
  겹쳐 놓아도 되는 종류 짝은 `OVERLAP_OK`(지금은 책상·책장 — 책상 책장, 욕실 철제 선반·욕실 상부 선반)에, 어떤 가구와도 겹쳐도 되는 종류는 `OVERLAP_ANY`(커튼·커튼 봉)에,
  벽과 겹쳐도 되는 종류는 `WALL_OK`(커튼·커튼 봉)에 더한다. 냉장고장(`wstyle: 'fridge'`) 안에 넣어도 되는 종류는 `IN_FRIDGE_CABINET`(냉장고·김치냉장고)다.
  그 밖의 벽과의 겹침은 그대로 잰다.
- 그리기 도구는 켜진 버튼을 다시 누르거나 Esc(그리던 것 취소 → 도구 끄기 → 선택 해제 순)로 끈다. 목록·3D·샘플 가구에서 가구를
  누르면 `endDrawTool()`로 끈다 — 이미 고른 가구를 다시 누르면 'selection' 이벤트가 안 나므로 누르는 곳에서 직접 부른다.
- 단축키는 입력칸에 글자를 넣는 중(`isTyping()`)이거나 팝업(`dialog[open]`)이 열려 있으면 무시한다.
- **공지사항**(`#notice-dialog`): 처음 접속할 때 `showModal()`. 프로그램 설명 + `docs/OhMyHome_User_Guide.pdf` 내려받기 링크(그래서 배포 zip에도
  `docs/`에 담는다). 아래 `다시 보지 않기` 체크박스(`#notice-hide`)는 바꿀 때 바로 localStorage `ohmyhome.notice.hidden`에 `NOTICE_VER`를 남기거나 지운다 — 남아 있으면 접속 때 띄우지 않는다. 공지를 열 때(`showNotice`)는 저장된 값으로 체크를 맞춘다.
  왼쪽 칸(`.notice-main`)이 소개, 오른쪽 칸(`.notice-new`)이 새 소식이다. 공지 내용을 바꾸면 `NOTICE_VER`를 올리고(예전 공지를 숨긴 사람에게도 한 번 뜬다)
  `NOTICE_DATE`(바꾼 날, `YYYY-MM-DD`)도 고친다 — 상단 `📢 공지사항`(`#btn-notice`, 언제든 공지를 다시 연다)에 그날부터 `NOTICE_NEW_DAYS`(7)일 동안 `NEW`(`.new-badge`, 통통 튀고 빨간 고리가 퍼지는 CSS 애니메이션 — 동작 줄이기 설정이면 멈춤)가 붙는다.
  공지 창을 닫으면(처음 뜬 공지도) localStorage `ohmyhome.notice.read`에 `NOTICE_VER`를 남겨 NEW를 지운다 — 버전이 바뀌면 다시 붙는다(`updateNoticeBadge`).
  새 소식의 `A1-real 고르러 가기`(value `real-a1`) · `A2-real 고르러 가기`(value `real`) · `B1-real 고르러 가기`(value `real-b1`) · `B2-real 고르러 가기`(value `real-b2`)는 위례자이더파크 창을 그 실측 도면에 맞춰 연다
  (`XI_PARK_SAMPLES`의 파일 이름 앞부분 `55B1-real_`로 찾는다).
  그 아래 `✨ 추가 기능 보기`(`#btn-features`, type=button이라 공지를 닫지 않는다)는 `#features-dialog`(그날 더한 기능 설명)를 공지 위에 겹쳐 띄운다.
  기능을 더하면 이 목록도 고친다.
- **CSS의 `[hidden] { display: none !important; }`를 지우지 말 것.** `display`를 준 요소는 `hidden` 속성이
  먹지 않는다. (예전 사진 대화상자의 안내 문구가 캔버스를 덮어 클릭을 가로챈 적이 있다.)

## 컨벤션

- UI 문자열, 주석, 커밋 메시지, README 모두 한국어다.
- 빌드 도구 없이 브라우저 ES 모듈로 쓴다. 외부 라이브러리는 importmap에 **정확한 버전**으로만 넣고,
  three.js 애드온은 `three/addons/`(같은 버전)에서 가져온다.
- 길이는 상태에서 언제나 mm 정수(또는 실수)로 다룬다. m는 3D 변환과 화면 표시에서만 쓴다.
  화면에 mm를 보일 때는 `fmtMM()`(천 단위 쉼표)을 쓰고, 면적은 ㎡와 평(÷ 3.3058)을 함께 보인다.
- 가구 기본 크기는 `catalog.js`에만 둔다. 화면이나 3D 코드에 하드코딩하지 말 것.
- `geometry.js` · `wallDetect.js` · `catalog.js` · `xlsx.js` · `pdf.js`에는 DOM·three.js 의존을 넣지 않는다(Node에서 시험할 수 있게).
- 도면·사진은 사용자 PC에만 저장한다: 브라우저 localStorage와, 사용자가 띄운 로컬 serve.py가 쓰는 프로젝트 폴더의
  `ohmyhome-project.json`(.gitignore). 바깥 서버로 보내는 코드는 없으며, 그렇게 두어야 한다.
