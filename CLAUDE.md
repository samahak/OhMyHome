# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 명령

```bash
# 실행 — 정적 파일 서버를 띄우고 브라우저를 연다 (기본 포트 8190)
./run_ohmyhome.sh           # macOS / Linux  (PORT=9000 ./run_ohmyhome.sh 로 변경)
run_ohmyhome.bat            # Windows
python3 -m http.server 8190 # 직접 띄울 때

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
js/samplePlan.js       체험용 샘플 도면 (캔버스로 그림, 1px = 10mm)
sample/                실제 세대 예시 — 55㎡ A-2형 2D·3D 이미지와 바로 여는 프로젝트 JSON (1px = 5mm)
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
state.plan      { image:{src,width,height} | null, mmPerPx, scaleSet, scaleRef, walls[], rooms[], wallHeight }
  scaleRef      { a, b, mm } | null — 축척을 맞춘 기준 치수선 (2D에 주황 점선으로 그린다)
  wall          { id, a:{x,y}, b:{x,y}, t(두께), cap, auto }
  room          { id, name, pts:[{x,y}] }
state.furniture { id, type, name, w, d, h, x, y, rot, elev, color, libId, usePhoto }
state.library   사진으로 만든 내 가구 { id, type, name, w, d, h, color, image(dataURL), usePhoto }
ui.selection    { kind: 'furniture'|'wall'|'room', id } | null   (저장하지 않는다)
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

### 3D (`view3d.js`, `models3d.js`)

- 가구 메시는 `syncFurniture()`가 id별로 들고 있다. **크기·모양·색·사진·선택·겹침 여부를 이어 붙인 `key`가 바뀔 때만**
  다시 만들고, 위치·회전만 바뀌면 transform만 고친다. 선택 외곽선과 겹침 빨간 외곽선은 모양에 붙어 있어서 key에 들어간다.
- 새 샘플 모양을 더하려면 `catalog.js`의 `SHAPES`(+ 필요하면 `CATALOG`)와 `models3d.js`의 `BUILDERS`에 함께 넣는다.
  모양 함수는 m 단위 `(group, W, D, H, color)`를 받고, 바닥 가운데를 원점으로 앞면을 +z로 그린다.
  `SHAPES[type].photoFront`는 사진 대화상자에서 '앞면에 사진 입히기'의 기본값이다.
- 박스 지오메트리는 하나를 공유하고 `scale`로 키운다. `disposeObject()`는 그 공유 지오메트리를 버리지 않는다.
- 사진 텍스처는 `library` id별로 캐시한다. `'library'` 이벤트가 나면 캐시를 비우고 전부 다시 만든다.
- 카메라는 사용자가 아직 돌리지 않았을 때(`userMoved === false`)만 화면 크기가 바뀔 때 다시 맞춘다.
- 방 이름표는 `CSS2DObject`다. 그룹에서 빼면(`clear()`) three.js가 DOM 요소도 함께 지운다.

### 화면 (`main.js`)

- 속성 패널은 선택이 바뀔 때만 통째로 그리고(`renderProps`), 같은 대상이 바뀌면 입력칸 값만 고친다(`refreshProps`).
  이때 **지금 포커스가 있는 칸은 건드리지 않는다.** 통째로 다시 그리면 Tab으로 칸을 옮길 때 포커스가 사라진다.
- 새 가구는 `dropPoint()`가 화면 가운데에서 나선형으로 돌며 벽·가구와 겹치지 않는 첫 자리에 놓는다.
- 겹침 판정은 `G.findCollisions()` 하나다. 맞닿기만 한 것은 겹침이 아니도록 꼭짓점을 1~2mm 안쪽으로 줄여 잰다.
  가구끼리는 높이 구간(`elev`~`elev+h`)이 겹칠 때만 겹침이다(벽걸이 TV와 거실장).
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
