# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 명령

```bash
# 실행 — 정적 파일 서버를 띄우고 브라우저를 연다 (기본 포트 8190)
./run_ohmyhome.sh           # macOS / Linux  (PORT=9000 ./run_ohmyhome.sh 로 변경)
run_ohmyhome.bat            # Windows
python3 serve.py 8190      # 직접 띄울 때 (no-cache 헤더를 붙이는 정적 서버, 기본 127.0.0.1만)
HOST=0.0.0.0 ./run_ohmyhome.sh   # 같은 네트워크의 다른 기기에서 접속 (serve.py가 내 PC IP 주소를 찍는다)

# 배포 파일 — dist/OhMyHome-<날짜>.zip (화면·실행 스크립트·sample의 json 전부·사용 가이드 PDF·LICENSE만.
#   README와 sample의 png는 넣지 않는다. 브라우저 localStorage의 작업 데이터는 애초에 파일에 없다)
./build_ohmyhome.sh         # macOS / Linux
build_ohmyhome.bat          # Windows (PowerShell Compress-Archive)

# 사용 가이드 PDF — docs/guide/guide.html(+ img/ 화면 캡처)을 Chrome으로 인쇄해 docs/OhMyHome_Guide.pdf를 만든다.
# 화면·기능이 바뀌면 guide.html을 고치고 다시 만들어 함께 커밋한다(빌드 스크립트는 이 PDF가 없으면 멈춘다)
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
- 깨끗한 상태에서 시작하려면 `localStorage.clear()` 후 새로 고친다(자동 저장 키 `ohmyhome.project.v1`).
- 2D 캔버스 좌표는 `editor.toScr({x, y})`(mm → 캔버스 px)에 캔버스의 `getBoundingClientRect()`를 더해 구한다.
  두 화면을 나란히 띄우면 2D 칸이 좁아서, 도면 바깥쪽 점은 3D 캔버스 위를 누르게 되니 조심한다.

## 아키텍처

```
index.html             화면 뼈대 + importmap (three.js CDN)
css/style.css
js/main.js             화면 조립 — 왼쪽 패널, 속성 패널, 상단 버튼, 단축키, 벽 인식 실행
js/store.js            상태 하나 + 이벤트 + 되돌리기 + localStorage 자동 저장
js/geometry.js         평면 기하 — 꼭짓점, 겹침(SAT), 벽에 붙이기, 면적·무게중심   (DOM 없음)
js/wallDetect.js       도면 이미지 → 벽 사각형                                    (DOM 없음)
js/catalog.js          샘플 가구 목록·기본 크기·모양(SHAPES)·사진 비율로 모양 추천 (DOM 없음)
js/plan2d.js           2D 도면 편집기 (캔버스, 도구별 마우스 입력)
js/view3d.js           3D 보기 + 가구 끌기 (three.js, OrbitControls, CSS2DRenderer)
js/models3d.js         샘플 가구 3D 모양 (박스·원기둥 조합)
js/furniturePhoto.js   가구 사진 → 크기 측정 대화상자
js/tour.js             둘러보기 — 현관문 열기 · 1인칭 카메라 · 자동 동선 · 직접 걷기 · 화면 안내판
js/walkGrid.js         둘러보기용 걸을 수 있는 칸 지도 · A* 길 찾기 · 들를 곳 고르기             (DOM 없음)
js/fixtures.js         현관·욕실·주방 설비 자동 배치 (신발장·변기·세면대·욕조·주방 싱크대)          (DOM 없음)
js/windows.js          창 자동 찾기 — 도면 이미지에서 벽 위의 연한 구간 + 바깥벽 틈                 (DOM 없음)
js/doors.js            문 자동 찾기 — 벽 틈 중 도면 이미지에 여닫이 문 기호(문짝 선 + 호)가 있는 곳   (DOM 없음)
js/scenery.js          둘러보기 창밖 풍경 — 층수 높이의 땅, 우리 동, 도로·차·가로수, 빌라, 아파트, 숲, 먼 산, 하늘
js/samplePlan.js       체험용 샘플 도면 (캔버스로 그림, 1px = 10mm)
docs/guide/            배포용 사용 가이드 원본(guide.html, img/) → docs/OhMyHome_Guide.pdf
sample/                실제 세대 예시 — 55㎡ A-2형 · A-1형(좌우 반전)의 2D·3D 이미지와 바로 여는 프로젝트 JSON (1px = 5mm)
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
state.plan      { image:{src,width,height} | null, mmPerPx, scaleSet, scaleRef, entrance, walls[], rooms[], windows[], doors[], doorsRemoved[], wallHeight, floor }
  scaleRef      { a, b, mm } | null — 축척을 맞춘 기준 치수선 (2D에 주황 점선으로 그린다)
  wall          { id, a:{x,y}, b:{x,y}, t(두께), cap, auto }
  room          { id, name, pts:[{x,y}], hidden? }
  window        { id, a, b, t, sill, h, auto } — a–b는 벽 중심선 위 창 양 끝, sill: 바닥~창 아래, h: 창 높이 (mm)
  door          { id, a, b, t, swing, auto } — a: 경첩 끝, b: 반대 끝(벽 중심선 위), swing: 문짝이 a→b 왼쪽 법선 (-uy, ux) 쪽이면 1
state.furniture { id, type, name, w, d, h, x, y, rot, elev, color, libId, usePhoto, model?, price? }
  model, price   사용자가 넣은 모델명·가격(원, 정수). 없으면 키가 없다. 합계는 price 있는 것만 더한다
  builtin        '기본 포함 가구'(집에 딸려 오는 것)면 true, 아니면 키가 없다. 가격이 있어도 합계(`sumPrice`)에서 뺀다
state.library   사진으로 만든 내 가구 { id, type, name, w, d, h, color, image(dataURL), usePhoto }
ui.selection    { kind: 'furniture'|'wall'|'room'|'window', id, ids? } | null   (저장하지 않는다)
  ids           가구를 2개 이상 골랐을 때만 있다. id는 마지막에 고른 가구
```

- 화면들은 `on('plan' | 'furniture' | 'library' | 'selection')`을 듣고 다시 그린다. 상태를 바꾼 쪽이 `emit()`한다.
  `selection` 말고 다른 이벤트가 나면 600ms 뒤 localStorage에 자동 저장된다.
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
- 벽 속성의 '길이', 방 속성의 '가로'·'세로': 도면 이미지가 있으면 그 길이로 **전체 크기**를 맞춘다
  (도면 없이 빈 모눈에 그린 벽은 예전처럼 끝점만 옮긴다).
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

### 가구 사진 측정 (`furniturePhoto.js`)

테두리 픽셀의 중앙값을 배경색으로 보고, 배경과 다른 픽셀이 몰린 가로·세로 구간을 가구 영역으로 잡는다.
실제 크기는 사진만으로 알 수 없으므로 기준이 필요하다. **아는 치수 하나**를 넣으면 영역 비율로 나머지를 구하고,
**기준 물체 선**을 그으면 mm/px를 구해 가로·높이를 함께 잰다. 깊이는 고른 모양의 `defaultsFor(type).d`로 채운다.
사진은 영역만 잘라 긴 변 512px JPEG로 `library[].image`에 넣는다.

### 둘러보기 (`tour.js`, `walkGrid.js`)

출발점은 `state.plan.entrance`(현관문 틈 `{ a, b, t, out }`)다. 없으면 2D에서 `entrance` 도구로 문 자리를 누르게 하고,
`G.findDoorGap()`이 벽 끝에서 쏜 반직선으로 틈과 바깥 방향을 찾는다. `setScale()`은 entrance도 함께 옮긴다.

- `walkGrid.buildGrid()`: 100mm 칸, 벽·가구(높이 1.2m 아래)에서 몸 반지름 220mm 안쪽 칸을 막는다. **벽들의 바깥 사각형 밖은
  모두 막는다** — 이미지에서 인식한 벽은 창 자리가 틈이라 그대로 두면 창으로 걸어 나간다.
- 둘러보기 중에는 **현관문 틈을 벽으로 막은 지도**를 쓴다. 막지 않으면 들를 곳이 공용 홀(밖)까지 잡힌다.
  현관 앞 → 문 → 현관 안쪽 구간은 지도를 쓰지 않고 정해진 직선으로 걷는다.
- 들를 곳(`roomCenters`)은 거리 변환의 봉우리다. 벽만 있는 지도(`sightGrid`)에서 서로 보이고 3.2m 안이면 같은 방으로 묶는다.
  이름은 그 점이 든 방(`rooms`) 이름이고, 같은 이름은 한 번만 들른다. **이름 붙은 방은 봉우리가 안 잡혀도 꼭 들른다**
  (`Tour.roomSpot` — 욕실은 설비가 차서 봉우리가 안 생긴다). 순서는 `orderByWalk`(걷는 칸 수 기준 욕심 순서 + 2-opt).
- 둘러보기를 시작할 때 `fixtures.autoFixtures()`가 설비를 놓는다(일반 가구로 들어가 되돌리기·삭제 가능). 그 방에 같은 종류가
  이미 있으면 건너뛰고, 벽·가구와 겹치는 설비(`findCollisions`)는 빼고 놓는다.
  - 신발장(`shoe_cabinet`): 방 이름 없이 `plan.entrance`만 본다. 현관문 안쪽 옆벽에 문틀부터 세우되, 문 폭 바깥이고
    통로 800mm가 남는 쪽, 벽이 곧게 이어지는 길이(최대 1,200)만큼. 3m 안에 신발장(종류 또는 이름 '신발')이 있으면 건너뛴다.
    둘러보기 문짝은 경첩이 a 끝이지만, 신발장이 a 쪽이면 b 끝으로 옮겨 열린 문짝이 신발장을 가리지 않게 한다(`buildScene`).
  - 욕실/화장실: 변기·세면대. 이름이 부부·안방·마스터·파우더가 아닌 욕실 가운데 **가장 큰 한 곳**에는 욕조를 문 없는 짧은 벽에
    벽 끝까지 대고, 맞닿은 막힌 옆벽에 욕조 쪽부터 세면대 → 변기 순으로 놓는다. 안 들어가면 변기·세면대만 안쪽 벽에.
  - 주방/부엌: 주방 싱크대(개수대·인덕션 3구·상부장·후드).
  - 놓을 벽은 방 안쪽 상자(`innerBox`, 가운데에서 `spanAt`)의 네 변 가운데 **벽 면 25mm 바깥**이 가장 많이 비어 있는 변
    (=문 쪽)의 반대편이다. 25mm보다 멀리 재면 60mm 샤프트 벽을 넘어가 '열린 변'으로 잘못 읽는다.
  - 방 이름이 없는 도면은 욕실·주방을 알 수 없어 신발장만 놓고, 상태줄에 방 이름을 붙이라고 안내한다(`hasFixtureRooms`).
- 우물천장은 **거실만**: 안쪽 상자에서 450mm 들어온 자리를 천장 판에 구멍(`Shape.holes`)으로 뚫고,
  150mm 위에 판·옆면·간접조명 띠를 붙인다. 거실은 `Tour.findLiving()`이 고른다:
  이름이 '거실'인 방 → 없으면 **아래 바깥벽에 닿은 공간 가운데 가로가 가장 넓은 곳**(가로·세로 2.4m 미만 제외).
  방 영역이 있으면 방들 중에서(`innerBox`), 없으면 아래 바깥벽 80cm 안쪽 줄을 가로로 훑어 벽 사이 구간 중에서 고른다.
  방 가운데에서 좌우로 재면 문 틈으로 옆방까지 새므로 이렇게 한다. 깊이는 가로의 1.2배(최소 3m)까지(위가 주방으로 트인 경우).
  고른 칸 안의 들를 곳은 이름이 '공간 n'이면 '거실'로 바꾼다.
- 나머지 방은 천장 가운데 네모 LED 방등(`buildLeds`, 방 짧은 변 2.6m↑ 600 / 1.6m↑ 450 / 그 밖 300mm)과 그 아래 약한
  PointLight(열 개까지). 방이 없는 도면은 들를 곳 자리에 단다. 칸 크기(`spanBox`)는 창·현관문 틈을 막은 벽으로, 축마다
  **짧은 쪽 거리**로 잰다 — 반대쪽은 문 틈으로 새어 옆방 벽까지 잴 수 있다.
- 방 영역의 `hidden: true`는 "도면 이미지에 이미 그려진 방"이라 2D·3D에 색과 이름표를 그리지 않는다(이름·면적용).
- `view3d.setTourMode(true)`는 나무 바닥·천장 높이 벽·이름표 숨김으로 다시 그린다. 문짝·문 위 벽·천장·실내등은
  `Tour.group`에 따로 두고 나갈 때 치운다. 둘러보기 중 키 입력은 `tour.js`가 capture 단계에서 받고, `main.js` 단축키는 쉰다.

### 문 (`doors.js`)

- 후보 틈은 `doorGaps()`: 벽 끝에서 벽 방향으로 쏜 반직선이 **어느 벽이든** 500~1,300mm 안에서 닿는 곳(같은 줄 벽만 보는
  `findWindowGaps`로는 복도에서 방으로 꺾이는 문을 놓친다). 창 자리 틈은 뺀다.
- 틈마다 경첩(양 끝) × 여는 쪽(양쪽) 네 가지 기호를 가정해 이미지와 맞춰 본다. 경첩은 **벽 면 위**(중심선에서 t/2), 문짝은 문 폭 길이로
  벽에 수직, 호는 반대 끝까지. 호 10~80° 표본의 60%, 문짝 선 표본의 50% 이상이 어두우면(< 180, 법선 방향 ±25mm) 문이다.
  미닫이(평행한 두 선)는 찾지 않는다 — 🚪 문 도구로 직접 단다.
- 자동 문은 벽 인식·'문 기호 찾아 문 달기'·둘러보기 시작 때 다시 찾는다(`autoDoors`, 창과 같은 방식: `auto: false`는 그대로).
  문 목록이 없는 예전 프로젝트·저장본을 열면 한 번 찾아 단다(`doorsForOldProject`, 그래서 `loadSaved()`는 불러온 원본을 돌려준다).
- 자동 문을 지우면 그 가운데를 `plan.doorsRemoved`에 남기고(`store.removeItem`), 다시 찾을 때 300mm 안의 문은 달지 않는다.
  🚪 문 도구로 그 자리에 직접 달면 목록에서 빠진다. 새 도면 이미지를 열면 비운다. `setScale()`도 함께 옮긴다.
- 경첩·여는 쪽을 손으로 바꾸면 `auto: false`가 된다. 경첩을 반대로 하면 a↔b를 바꾸고 swing도 뒤집는다(법선이 뒤집히므로).
- 3D: 문 위 벽(`catalog.DOOR.h` ~ 천장, `wallPiece`) + 문틀 + 90° 열린 문짝(`models3d.buildDoorFrame/buildDoorLeaf`).
  둘러보기 중 현관 자리의 문은 그리지 않는다(`tour.js`가 여닫는 현관문을 따로 만든다). 문짝은 길 찾기 장애물에 넣지 않는다.

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

- 가구 메시는 `syncFurniture()`가 id별로 들고 있다. **크기·모양·색·사진·선택·겹침 여부를 이어 붙인 `key`가 바뀔 때만**
  다시 만들고, 위치·회전만 바뀌면 transform만 고친다. 선택 외곽선과 겹침 빨간 외곽선은 모양에 붙어 있어서 key에 들어간다.
- 새 샘플 모양을 더하려면 `catalog.js`의 `SHAPES`(+ 필요하면 `CATALOG`)와 `models3d.js`의 `BUILDERS`에 함께 넣는다.
  모양 함수는 m 단위 `(group, W, D, H, color)`를 받고, 바닥 가운데를 원점으로 앞면을 +z로 그린다.
  `SHAPES[type].photoFront`는 사진 대화상자에서 '앞면에 사진 입히기'의 기본값이다.
- **숫자 하나로 크기를 정하는 가구**(TV 인치, 소파 인원, 식탁 인원)는 `catalog.SIZE_PRESETS` 한 표로 다룬다. 가구 항목에
  `f[key]`(`inch`, `seats`)를 남기고 `size(v)`로 크기를 바꾼다. 속성 패널의 입력칸·빠른 선택 버튼도 이 표를 보고 그린다.
  `affects`에 든 칸(가로 등)을 직접 고치면 `f[key]`를 지우고, 화면에는 `guess(f)`로 짐작한 값을 보여 준다.
  이름이 `namePattern`(예: `65인치 TV`, `3인 소파`) 꼴일 때만 이름도 따라 바꾼다. 새 항목은 이 표에만 더하면 된다.
- 모양 함수는 다섯째 인자로 가구 항목 `f`도 받는다(소파 쿠션 수 = `f.seats`). 모양에 영향을 주는 값을 새로 쓰면
  `view3d.syncFurniture()`의 `key`에도 넣어야 다시 그려진다.
- **ㄱ자 주방 싱크대(`kitchen_l`)**: `w` = 가로(뒤쪽), `d` = 세로(꺾인 쪽) 길이(세로가 더 길어도 된다), 상판 깊이 `f.counterD`(없으면 `catalog.L_COUNTER.depth`),
  `f.mirror`면 꺾인 쪽이 왼쪽(기본은 앞에서 볼 때 오른쪽 +x). 바닥 모양은 `G.furnitureRects(f)`(사각형 둘)가 정하고,
  겹침(`findCollisions`)·클릭·길 찾기는 `G.furnitureParts()`, 2D 그리기는 `furnitureOutline`/`furnitureFront`를 쓴다 —
  `furnitureCorners()`(바깥 상자)로 재면 안쪽 빈 모서리까지 막힌다. 새로 사각형이 아닌 가구를 넣으면 `furnitureRects`에 더한다.
  3D는 `counterRun()`(싱크대 한 줄) 둘: 가로 쪽에 개수대, 꺾인 쪽에 인덕션·후드(꺾인 쪽이 800mm 미만이면 가로 쪽에).
  `SHAPES[type].dims`가 있으면 속성 패널의 가로·깊이 칸 이름을 바꾼다.
- **식물(`plant`)**: 종류는 `f.plant`(`catalog.PLANTS` 키, 없으면 몬스테라 — `plantOf()`). 종류를 바꾸면(`applyPlant`) 크기를 그 종류
  기본값으로 맞추고, 이름이 종류 이름이었으면 이름도 바꾼다. `f.color`는 화분 색(2D는 잎 색으로 칠한다). 3D는 `models3d.PLANT_SHAPES`의
  종류별 함수가 `leaf()`(납작한 타원)·`rod()`(줄기)로 그리고, 고정 씨앗 난수라 다시 그려도 모양이 같다. 스킨답서스 덩굴은 바닥을 뚫지 않게
  `f.elev`만큼만 늘어지므로 `syncFurniture()` key에 식물의 elev가 들어간다. 잎·줄기 지오메트리는 `sharedGeo()`로 함께 쓴다.
- 거울은 비출 환경맵이 없어 금속성을 높이면 검게 나온다. `MIRROR()`(밝은 회청색, 낮은 금속성)를 쓴다.
- 박스·구·원기둥 지오메트리는 `sharedGeo()`로 하나씩 공유하고 `scale`로 키운다. `disposeObject()`는 공유 지오메트리를 버리지 않는다.
- 사진 텍스처는 `library` id별로 캐시한다. `'library'` 이벤트가 나면 캐시를 비우고 전부 다시 만든다.
- `view.captureShots(SHOTS)`·`editor.capture()`는 화면 크기와 상관없이 가로 그림(3D 1920×1080, 2D 3840×2160)을 따로 그린 뒤
  렌더러 크기·카메라(2D는 view·그리던 선)를 되돌린다. 3D 캡처 버튼은 `SHOTS`(위 · 앞 왼쪽 · 앞 오른쪽) 세 장을 내려받고,
  각 장은 `shotCamera()`가 벽·가구 범위를 꽉 차게 잡는다. 둘러보기 중에는 `capture()` 한 장(1인칭 그대로).
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
- 왼쪽 '배치된 가구' 목록은 `SHAPES` 순서로 종류별로 묶고(제목 + 개수), 같은 종류 안은 이름순(`Intl.Collator('ko', { numeric })`)이다.
- 새 가구는 `dropPoint()`가 화면 가운데에서 나선형으로 돌며 벽·가구와 겹치지 않는 첫 자리에 놓는다.
- 겹침 판정은 `G.findCollisions()` 하나다. 맞닿기만 한 것은 겹침이 아니도록 꼭짓점을 1~2mm 안쪽으로 줄여 잰다.
  가구끼리는 높이 구간(`elev`~`elev+h`)이 겹칠 때만 겹침이다(벽걸이 TV와 거실장).
  **의자와 책상·식탁·화장대(`KNEE_SPACE`, 종류별 상판 높이)**는 앉는 부분이 상판 밑으로 들어가도 되고, 상판보다 높은 등받이 띠
  (`CHAIR_BACK_MM`, 의자 로컬 -y 쪽)가 책상과 겹칠 때만 겹침이다. 앉는 면이 상판 밑으로 못 들어가는 낮은 테이블은 평소대로 잰다.
- 그리기 도구는 켜진 버튼을 다시 누르거나 Esc(그리던 것 취소 → 도구 끄기 → 선택 해제 순)로 끈다. 목록·3D·샘플 가구에서 가구를
  누르면 `endDrawTool()`로 끈다 — 이미 고른 가구를 다시 누르면 'selection' 이벤트가 안 나므로 누르는 곳에서 직접 부른다.
- 단축키는 입력칸에 글자를 넣는 중(`isTyping()`)이거나 사진 대화상자가 열려 있으면 무시한다.
- **CSS의 `[hidden] { display: none !important; }`를 지우지 말 것.** `display`를 준 요소는 `hidden` 속성이
  먹지 않는다. 사진 대화상자의 안내 문구가 캔버스를 덮어 클릭을 가로챈 적이 있다.

## 컨벤션

- UI 문자열, 주석, 커밋 메시지, README 모두 한국어다.
- 빌드 도구 없이 브라우저 ES 모듈로 쓴다. 외부 라이브러리는 importmap에 **정확한 버전**으로만 넣고,
  three.js 애드온은 `three/addons/`(같은 버전)에서 가져온다.
- 길이는 상태에서 언제나 mm 정수(또는 실수)로 다룬다. m는 3D 변환과 화면 표시에서만 쓴다.
  화면에 mm를 보일 때는 `fmtMM()`(천 단위 쉼표)을 쓰고, 면적은 ㎡와 평(÷ 3.3058)을 함께 보인다.
- 가구 기본 크기는 `catalog.js`에만 둔다. 화면이나 3D 코드에 하드코딩하지 말 것.
- `geometry.js` · `wallDetect.js` · `catalog.js`에는 DOM·three.js 의존을 넣지 않는다(Node에서 시험할 수 있게).
- 도면·사진은 사용자 브라우저에만 저장한다. 서버로 보내는 코드는 없으며, 그렇게 두어야 한다.
