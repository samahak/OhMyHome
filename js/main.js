// 화면 조립 — 왼쪽 패널·가운데 2D/3D·오른쪽 속성 패널과 단축키를 묶는다.
import {
  state, ui, on, emit, checkpoint, undo, redo, select, uid, removeItem, findSelected,
  selectFurniture, selectedFurnitureIds, isFurnitureSelected, toggleFurnitureSelection, removeFurniture,
  applyScaleRef, serialize, loadProject, replacePlan, loadSaved, loadFromServer, savesToServer, saveNow, resetProject, setSaveErrorHandler,
  addLayout, switchLayout, renameLayout, deleteLayout, currentLayout, layoutFurniture, setLayoutLocked, furnitureLocked, setLockedHandler,
} from './store.js';
import * as G from './geometry.js';
import { CATALOG, SHAPES, SIZE_PRESETS, L_COUNTER, lCounterDepth, lLegDepth, PLANTS, plantOf, WARDROBE_STYLES, wardrobeStyle, MIX_PARTS, mixStyles, STOOL, ROD_DRAPES, ROD_SPAN, rodDrape, iconFor, windowDefaults, DOOR } from './catalog.js';
import { PlanEditor, fmtMM, isTyping } from './plan2d.js';
import { View3D, SHOTS } from './view3d.js';
import { makePdf, dataURLBytes } from './pdf.js';
import { makeXlsx, STYLE } from './xlsx.js';
import { detectWallRects, rectToWall, findHatchRects } from './wallDetect.js';
import { drawSamplePlan } from './samplePlan.js';
import { autoFixtures, hasFixtureRooms, missingPlanSinks } from './fixtures.js';
import { findWindows } from './windows.js';
import { findDoors, findMiddleDoorGap, moveDoorAlong, depthFromEntrance, doorStyle, DOOR_STYLES, SLIDE } from './doors.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const PYEONG = 3.3058;
const UNSCALED_WIDTH_MM = 12000; // 축척을 모를 때 도면 가로를 이만큼으로 가정

function status(text) { $('status').textContent = text; }

// serve.py로 열었으면 프로젝트 폴더의 ohmyhome-project.json을 먼저 연다 (localhost·IP 어느 주소든 같은 작업)
const fromServer = await loadFromServer();
const restored = loadSaved(fromServer);
setSaveErrorHandler((e, where) => status(where === 'server'
  ? `⚠ 프로젝트 폴더(ohmyhome-project.json)에 저장하지 못했습니다 (${e.message}). 로컬 서버가 켜져 있는지 확인하고, 상단 ‘저장(.json)’으로도 보관하세요.`
  : '⚠ 브라우저 저장 공간이 부족해 자동 저장하지 못했습니다. 상단 ‘저장(.json)’으로 파일에 보관하세요.'));
setLockedHandler((l) => status(`🔒 ‘${l.name}’은(는) 보호 중이라 가구를 옮기거나 고칠 수 없습니다. 배치 안의 ‘🔒 보호’를 눌러 풀거나, ‘지금 안 복사해서 추가’로 새 안을 만들어 고치세요.`));

/* ---------- 2D / 3D ---------- */
const editor = new PlanEditor($('plan-canvas'), {
  status,
  cursor: (t) => { $('cursor-pos').textContent = t; },
  wallThickness: () => +$('wall-thick').value || 150,
  toolChanged: (tool) => {
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  },
  pickColor: (p) => pickWallColor(p),
  pickEntrance: (p) => setEntrance(p),
  spanAt: (p) => spanAt(p),
  openMeasure: (lines, sx, sy, missing) => openMeasure(lines, sx, sy, missing),
  closeMeasure: () => { $('measure-pop').hidden = true; },
});
const view = new View3D($('view3d'));

/** 2D 그리기 도구를 끈다 — 가구를 누르면 (이미 골라 둔 가구라 선택이 안 바뀌어도) 다음 2D 클릭에 벽 등이 그려지지 않게 */
function endDrawTool() { if (editor.tool !== 'select') editor.setTool('select'); }
view.renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 0 && view.pickFurniture(e)) endDrawTool(); });

document.querySelectorAll('.tool-btn').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.tool === 'pick' && !state.plan.image) { status('먼저 도면을 불러오세요.'); return; }
  // 켜진 도구 버튼을 다시 누르면 끄고 선택 도구로 돌아간다
  editor.setTool(b.dataset.tool === editor.tool ? 'select' : b.dataset.tool);
}));

/* ---------- 탭 · 보기 방식 ---------- */
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  showTab(t.dataset.tab);
  if (t.dataset.tab === 'furniture') endDrawTool();   // 가구 탭으로 오면 바로 가구를 누르고 끌 수 있게 '선택·이동'으로
}));
function showTab(name) {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
  $('tab-plan').hidden = name !== 'plan';
  $('tab-furniture').hidden = name !== 'furniture';
}

document.querySelectorAll('#view-mode button').forEach((b) => b.addEventListener('click', () => setViewMode(b.dataset.view)));
function setViewMode(mode) {
  document.querySelectorAll('#view-mode button').forEach((x) => x.classList.toggle('active', x.dataset.view === mode));
  $('views').className = `views ${mode === 'split' ? 'split' : mode === '2d' ? 'only2d' : 'only3d'}`;
  try { localStorage.setItem('ohmyhome.view', mode); } catch { /* 저장 못 해도 그만 */ }
}
try { setViewMode(localStorage.getItem('ohmyhome.view') || 'split'); } catch { setViewMode('split'); }

// ⛶ 전체 화면: 보기 칸(#views)을 지금 보기(2D · 나란히 · 3D) 그대로 전체 화면으로. 오른쪽 위 ✕ 닫기나 Esc로 돌아온다.
// 캔버스 크기는 2D·3D의 ResizeObserver가 맞춘다
$('btn-full').addEventListener('click', () => {
  const el = $('views');
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) { status('이 브라우저는 전체 화면을 지원하지 않습니다.'); return; }
  Promise.resolve(req.call(el)).catch(() => status('전체 화면을 열지 못했습니다.'));
});
$('btn-full-close').addEventListener('click', () => {
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
});
// ⤢ 맞추기: 전체 화면 크기에 맞춰 2D는 도면 전체, 3D는 지금 시점(위에서·비스듬히)으로 집 전체가 보이게 다시 잡는다
$('btn-full-fit').addEventListener('click', () => {
  editor.fit();
  view.resetCamera(view.camMode);
});
// 📷 캡처: 전체 화면에 보이는 그대로(2D 캔버스 · 3D 캔버스 · 3D 이름표)를 한 장의 PNG로. 상태줄이 안 보이므로 버튼 글자로 알린다
$('btn-full-cap').addEventListener('click', () => {
  const btn = $('btn-full-cap');
  try {
    const url = captureViews();
    const mode = { '2d': '2d', split: '나란히', '3d': '3d' }[currentViewMode()] || '';
    download(url, `ohmyhome-화면-${mode}-${layoutTag()}${today()}.png`);
    btn.textContent = '✓ 저장했습니다';
  } catch (err) {
    btn.textContent = '⚠ 저장 못 함';
    console.error(err);
  }
  clearTimeout(btn.timer);
  btn.timer = setTimeout(() => { btn.textContent = '📷 캡처'; }, 1600);
});
/** 보기 칸(#views)에 지금 보이는 캔버스들과 3D 이름표를 화면 배치 그대로 한 장에 그려 PNG dataURL로 */
function captureViews() {
  const box = $('views').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const cv = document.createElement('canvas');
  cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  c.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
  c.fillRect(0, 0, box.width, box.height);
  view.renderer.render(view.scene, view.camera);   // 3D 그림을 지금 카메라로 한 번 더 그려 둔다
  for (const [v, el] of [[$('view2d'), $('plan-canvas')], [$('view3d'), view.renderer.domElement]]) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;   // 숨긴 보기
    c.fillStyle = getComputedStyle(v).backgroundColor;   // 캔버스 뒤 바탕(투명한 곳)
    c.fillRect(r.left - box.left, r.top - box.top, r.width, r.height);
    c.drawImage(el, r.left - box.left, r.top - box.top, r.width, r.height);
  }
  // 3D 이름표(CSS2D, DOM)는 캔버스에 없으므로 보이는 것만 같은 자리에 다시 그린다
  for (const el of $('view3d').querySelectorAll('.label3d')) {
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    if (!r.width || st.display === 'none' || st.visibility === 'hidden') continue;
    const x = r.left - box.left, y = r.top - box.top;
    c.fillStyle = st.backgroundColor;
    c.beginPath(); c.roundRect(x, y, r.width, r.height, parseFloat(st.borderTopLeftRadius) || 0); c.fill();
    c.fillStyle = st.color;
    c.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const lines = el.innerText.split('\n').filter(Boolean), lh = r.height / Math.max(1, lines.length);
    lines.forEach((t, i) => c.fillText(t, x + r.width / 2, y + lh * (i + 0.5)));
  }
  return cv.toDataURL('image/png');
}

$('cam-top').addEventListener('click', () => view.resetCamera('top'));
$('cam-persp').addEventListener('click', () => view.resetCamera('persp'));
$('wall-opacity').addEventListener('input', (e) => view.setWallOpacity(+e.target.value));
$('floor-image').addEventListener('change', (e) => view.setFloorImage(e.target.checked));
$('low-walls').addEventListener('change', (e) => view.setLowWalls(e.target.checked));
$('img-opacity').addEventListener('input', (e) => { editor.imageOpacity = +e.target.value; editor.draw(); });
$('show-dims').addEventListener('change', (e) => { editor.showDims = e.target.checked; editor.draw(); });

$('floor-num').value = state.plan.floor;
$('floor-num').addEventListener('change', (e) => {
  const v = Math.round(+e.target.value);
  if (!(v >= 1 && v <= 80)) { e.target.value = state.plan.floor; return; }
  checkpoint();
  state.plan.floor = v;
  emit('plan');
  status(`${v}층으로 정했습니다. 둘러보기에서 창밖이 ${v}층 높이로 보입니다.`);
});

$('wall-height').value = state.plan.wallHeight;
$('wall-height').addEventListener('change', (e) => {
  const v = +e.target.value;
  if (!(v >= 500)) return;
  checkpoint();
  state.plan.wallHeight = v;
  emit('plan');
});

/* ---------- 도면 ---------- */
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

function setPlanImage(image, mmPerPx, scaleSet) {
  const p = state.plan;
  let clear = true;
  if (p.walls.length || p.rooms.length) clear = confirm('새 도면을 엽니다. 지금 그려 둔 벽과 방을 지울까요?\n(취소를 누르면 그대로 둡니다)');
  checkpoint();
  p.image = image;
  p.mmPerPx = mmPerPx;
  p.scaleSet = scaleSet;
  p.scaleRef = null;
  if (clear) { p.walls = []; p.rooms = []; p.windows = []; p.doors = []; p.doorsRemoved = []; p.entrance = null; }
  p.name = image ? '샘플 도면' : '';
  ui.selection = null;
  emit('plan', 'selection');
  editor.fit();
  view.resetCamera('persp');
}

$('btn-sample').addEventListener('click', async () => {
  const s = drawSamplePlan();
  setPlanImage({ src: s.src, width: s.width, height: s.height }, s.mmPerPx, true);
  await runDetect();
  status('샘플 도면(1px = 10mm)을 열고 벽을 자동으로 찾았습니다. ② 가구 탭에서 가구를 놓아 보세요.');
});

/* ---------- 축척 ---------- */
$('btn-plan-width').addEventListener('click', () => {
  const p = state.plan;
  const v = G.parseLengthMM($('plan-width-mm').value);
  if (!p.image) { status('먼저 도면을 불러오세요.'); return; }
  if (!(v > 0)) { status('도면 전체 가로 길이를 넣어 주세요. (예: 17.5m 또는 17500)'); return; }
  checkpoint();
  // 이미지 윗변 전체를 기준선으로 삼는다
  applyScaleRef({ x: 0, y: 0 }, { x: p.image.width * p.mmPerPx, y: 0 }, v);
  $('plan-width-mm').value = '';
  status(`도면 전체 가로 ${fmtMM(v)}mm로 크기를 맞췄습니다.`);
});

/** 기준 치수 값만 고쳐 다시 맞춘다 (기준선 위치는 그대로) */
function reapplyScaleRef() {
  const r = state.plan.scaleRef;
  if (!r) return;
  const v = G.parseLengthMM($('scale-ref-len').value);
  if (!(v > 0)) { status('기준 치수를 3.8m 또는 3800처럼 넣어 주세요.'); return; }
  if (Math.abs(v - r.mm) < 0.5) return;
  checkpoint();
  applyScaleRef(r.a, r.b, v);
  status(`기준 치수를 ${fmtMM(v)}mm로 바꿔 도면 크기를 다시 맞췄습니다.`);
}
$('btn-scale-ref').addEventListener('click', reapplyScaleRef);
$('scale-ref-len').addEventListener('keydown', (e) => { if (e.key === 'Enter') reapplyScaleRef(); });

function renderScaleInfo() {
  const p = state.plan, el = $('scale-info');
  if (!p.image) {
    $('scale-ref-row').hidden = true;
    el.className = 'scale-info';
    el.textContent = '도면 없이 빈 모눈(1칸 = 1m)에 직접 그릴 수도 있습니다.';
    return;
  }
  const W = (p.image.width * p.mmPerPx) / 1000, H = (p.image.height * p.mmPerPx) / 1000;
  $('scale-ref-row').hidden = !p.scaleRef;
  if (p.scaleRef && document.activeElement !== $('scale-ref-len')) $('scale-ref-len').value = fmtMM(p.scaleRef.mm);
  if (p.scaleSet) {
    el.className = 'scale-info';
    el.innerHTML = `${p.scaleRef ? `✔ 기준 치수 <b>${fmtMM(p.scaleRef.mm)}mm</b>로 맞춤 (도면의 주황 점선)<br>` : '✔ '}`
      + `1px = ${p.mmPerPx.toFixed(2)}mm · 도면 이미지 실제 크기 ${W.toFixed(2)} × ${H.toFixed(2)} m`;
  } else {
    el.className = 'scale-info warn';
    el.innerHTML = `⚠ 축척을 아직 맞추지 않았습니다.<br>지금은 도면 가로를 ${UNSCALED_WIDTH_MM / 1000}m로 가정하고 있어요.`;
  }
}

/* ---------- 치수 도구: 한 곳을 눌러 지금 크기를 보고, 고치면 전체 크기를 맞춘다 ---------- */

/** 누른 자리의 벽 사이 가로·세로. 벽이 있으면 벽으로, 아직 없으면 도면 이미지의 굵은 어두운 선으로 잰다. */
async function spanAt(p) {
  const pl = state.plan;
  if (pl.walls.length) return G.spanAt(p, pl.walls);
  if (!pl.image) return null;
  const data = await planImageData();
  const W = data.width, H = data.height, d = data.data, thr = +$('detect-thr').value;
  const x0 = Math.floor(p.x / pl.mmPerPx), y0 = Math.floor(p.y / pl.mmPerPx);
  const dark = (x, y) => { const i = (y * W + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < thr; };
  if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H || dark(x0, y0)) return null;
  // 글자·치수선처럼 얇은 선은 지나치고, 이만큼 이어진 어두운 픽셀을 만나야 벽으로 본다
  const minRun = Math.max(4, Math.round(Math.max(W, H) * 0.004));
  const walk = (dx, dy) => {
    let run = 0;
    for (let k = 1, x = x0 + dx, y = y0 + dy; x >= 0 && y >= 0 && x < W && y < H; k++, x += dx, y += dy) {
      if (!dark(x, y)) { run = 0; continue; }
      if (++run >= minRun) return k - run + 1; // 벽 안쪽 면까지의 픽셀 수
    }
    return null;
  };
  const s = pl.mmPerPx;
  const axis = (dx, dy) => {
    const f = walk(dx, dy), r = walk(-dx, -dy);
    if (f == null || r == null) return null;
    // 픽셀 i는 [i, i+1) 칸이므로 뒤쪽 벽면은 x0-r+1, 앞쪽 벽면은 x0+f
    return { a: { x: (x0 - dx * (r - 1)) * s, y: (y0 - dy * (r - 1)) * s }, b: { x: (x0 + dx * f) * s, y: (y0 + dy * f) * s } };
  };
  const h = axis(1, 0), v = axis(0, 1);
  return h || v ? { h, v } : null;
}

function openMeasure(lines, sx, sy, missing = []) {
  const pop = $('measure-pop');
  pop.innerHTML = `
    <div class="mp-head"><b>📏 지금 보이는 크기</b><button class="icon" data-close title="닫기 (Esc)">✕</button></div>
    ${lines.map((l, i) => `
      <div class="mp-row">
        <span>${l.label}</span>
        <input type="text" data-i="${i}" value="${fmtMM(G.dist(l.a, l.b))}">
        <span>mm</span>
        <button class="primary" data-apply="${i}">맞추기</button>
      </div>`).join('')}
    ${missing.length ? `<p class="hint">${missing.join('·')}는 문·창문 틈으로 벽에 막히지 않아 잴 수 없습니다. 조금 옆을 눌러 보세요.</p>` : ''}
    <p class="hint">도면에 적힌 실제 치수(예: 3.8m)로 고치고 Enter를 누르면 도면 전체 크기가 그에 맞게 바뀝니다.</p>`;
  pop.hidden = false;
  const box = $('view2d').getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(sx + 14, box.width - pop.offsetWidth - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(sy + 14, box.height - pop.offsetHeight - 8))}px`;
  const apply = (i) => applyMeasure(lines[i], pop.querySelector(`input[data-i="${i}"]`).value);
  pop.querySelector('[data-close]').addEventListener('click', () => editor.cancel());
  pop.querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', () => apply(+b.dataset.apply)));
  pop.querySelectorAll('input').forEach((inp) => inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply(+inp.dataset.i);
    if (e.key === 'Escape') editor.cancel();
  }));
  const first = pop.querySelector('input');
  first.focus();
  first.select();
}

function applyMeasure(line, text) {
  const v = G.parseLengthMM(text);
  if (!(v > 0)) { status(`‘${text}’를 길이로 읽지 못했습니다. 3.8m 또는 3800처럼 넣어 주세요.`); return; }
  const cur = G.dist(line.a, line.b);
  editor.cancel();
  if (Math.abs(v - cur) < 0.5) { status('지금 크기와 같습니다.'); return; }
  rescaleBy(line.a, line.b, v);
  status(`${line.label} ${fmtMM(v)}mm 기준으로 도면 전체 크기를 맞췄습니다. 다른 방을 눌러 도면 치수와 맞는지 확인해 보세요. (끝내려면 Esc)`);
}

/** 도면 위 a–b 사이를 mm로 보고 도면 전체 크기를 다시 맞춘다 */
function rescaleBy(a, b, mm) {
  checkpoint();
  applyScaleRef(a, b, mm);
}

/* ---------- 벽 자동 인식 ---------- */
let detectMode = 'dark';
let detectColor = null;
document.querySelectorAll('#detect-mode button').forEach((b) => b.addEventListener('click', () => {
  detectMode = b.dataset.mode;
  document.querySelectorAll('#detect-mode button').forEach((x) => x.classList.toggle('active', x === b));
  $('detect-dark').hidden = detectMode !== 'dark';
  $('detect-color').hidden = detectMode !== 'color';
}));
for (const [id, out] of [['detect-thr', 'thr-out'], ['detect-tol', 'tol-out'], ['detect-thick', 'thick-out'], ['detect-piece', 'piece-out']]) {
  $(id).addEventListener('input', () => { $(out).textContent = $(id).value; });
}
$('btn-detect').addEventListener('click', () => runDetect());
$('btn-clear-auto').addEventListener('click', () => {
  if (!state.plan.walls.some((w) => w.auto)) return;
  checkpoint();
  state.plan.walls = state.plan.walls.filter((w) => !w.auto);
  emit('plan');
});

let planPixels = null; // { src, data: ImageData(원본 크기) }
async function planImageData() {
  const p = state.plan;
  if (planPixels?.src === p.image.src) return planPixels.data;
  const im = await loadImg(p.image.src);
  const c = document.createElement('canvas');
  c.width = p.image.width; c.height = p.image.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(im, 0, 0, c.width, c.height);
  planPixels = { src: p.image.src, data: g.getImageData(0, 0, c.width, c.height) };
  return planPixels.data;
}

async function pickWallColor(mm) {
  const p = state.plan;
  const data = await planImageData();
  const x = Math.round(mm.x / p.mmPerPx), y = Math.round(mm.y / p.mmPerPx);
  if (x < 1 || y < 1 || x >= data.width - 1 || y >= data.height - 1) { status('도면 이미지 안쪽을 눌러 주세요.'); return; }
  let r = 0, g = 0, b = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const i = ((y + dy) * data.width + (x + dx)) * 4;
    r += data.data[i]; g += data.data[i + 1]; b += data.data[i + 2];
  }
  detectColor = { r: r / 9, g: g / 9, b: b / 9 };
  $('pick-swatch').style.background = `rgb(${detectColor.r},${detectColor.g},${detectColor.b})`;
  editor.setTool('select');
  await runDetect();
}

async function runDetect() {
  const p = state.plan;
  if (!p.image) { status('먼저 도면을 불러오세요.'); return; }
  if (detectMode === 'color' && !detectColor) { editor.setTool('pick'); return; }
  status('벽을 찾는 중…');
  const full = await planImageData();
  // 너무 크면 줄여서 처리한다
  const k = Math.min(1, 1600 / Math.max(full.width, full.height));
  let img = full;
  if (k < 1) {
    const src = document.createElement('canvas');
    src.width = full.width; src.height = full.height;
    src.getContext('2d').putImageData(full, 0, 0);
    const c = document.createElement('canvas');
    c.width = Math.round(full.width * k); c.height = Math.round(full.height * k);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, c.width, c.height);
    img = g.getImageData(0, 0, c.width, c.height);
  }
  const mmPerPx = p.mmPerPx / k;
  const minThickPx = Math.max(2, +$('detect-thick').value / mmPerPx);
  const rects = detectWallRects(img, {
    mode: detectMode,
    threshold: +$('detect-thr').value,
    color: detectColor,
    tolerance: +$('detect-tol').value,
    minThickPx,
    minPiecePx: +$('detect-piece').value / mmPerPx,
  });
  checkpoint();
  p.walls = p.walls.filter((w) => !w.auto).concat(rects.map((r) => ({ id: uid('w'), ...rectToWall(r, mmPerPx), cap: false, auto: true })));
  p.windows = (await autoWindows()).windows;   // 바뀐 벽에 맞춰 창 자리도 다시 찾는다
  p.doors = (await autoDoors()).doors;         // 문 기호가 그려진 틈에는 문을 단다
  emit('plan');
  status(rects.length
    ? `벽 ${rects.length}개${p.doors.length ? `, 문 ${p.doors.length}개` : ''}를 찾았습니다.${p.scaleSet ? '' : ' (축척을 맞추지 않아 크기는 어림값입니다)'} 잘못 잡힌 것은 🧽 지우기로, 빠진 벽은 🧱 벽 그리기로 고치세요.`
    : '벽을 찾지 못했습니다. ‘어두움 기준’을 올리거나 ‘최소 벽 두께’를 낮춰 보세요. 색이 있는 도면은 ‘벽 색 찍기’를 쓰세요.');
}

/* ---------- 측정 결과 ---------- */
function renderPlanInfo() {
  const p = state.plan;
  const auto = p.walls.filter((w) => w.auto).length;
  let html = `<div class="row"><span>벽 ${p.walls.length}개</span><span class="hint" style="margin:0">(자동 ${auto} · 직접 ${p.walls.length - auto})</span></div>`;
  if (p.rooms.length) {
    let total = 0;
    html += '<table><tr><td><b>방</b></td><td class="num"><b>㎡</b></td><td class="num"><b>평</b></td></tr>';
    for (const r of p.rooms) {
      const a = G.polygonArea(r.pts) / 1e6;
      total += a;
      const b = G.boundsOf(r.pts);
      html += `<tr><td><a href="#" data-room="${r.id}">${esc(r.name)}</a><br><span class="hint">${fmtMM(b.w)} × ${fmtMM(b.h)}</span></td><td class="num">${a.toFixed(2)}</td><td class="num">${(a / PYEONG).toFixed(1)}</td></tr>`;
    }
    html += `<tr class="total"><td>합계</td><td class="num">${total.toFixed(2)}</td><td class="num">${(total / PYEONG).toFixed(1)}</td></tr></table>`;
  } else {
    html += '<p class="hint">⬛ 방 영역 도구로 방 꼭짓점을 찍으면 면적(㎡·평)과 가로×세로가 여기에 나옵니다.</p>';
  }
  $('plan-info').innerHTML = html;
  $('plan-info').querySelectorAll('[data-room]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    select({ kind: 'room', id: a.dataset.room });
  }));
}

/* ---------- 가구 ---------- */
/** 새 가구를 놓을 자리: 화면 가운데에서 가까운, 벽·가구와 겹치지 않는 곳 */
function dropPoint(def) {
  const mode = $('views').className;
  const p = (mode.includes('only3d') ? view.viewCenter() : editor.viewCenter()) || view.viewCenter();
  const cx = Math.round(p.x / 10) * 10, cy = Math.round(p.y / 10) * 10;
  const probe = { id: '__probe', w: def.w, d: def.d, h: def.h, elev: def.elev || 0, rot: 0 };
  const step = 250;
  for (let ring = 0; ring <= 16; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (const [dx, dy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
        Object.assign(probe, { x: cx + dx * step, y: cy + dy * step });
        if (!G.findCollisions([...state.furniture, probe], state.plan.walls, state.plan.blocked).has('__probe')) return { x: probe.x, y: probe.y };
      }
    }
  }
  return { x: cx, y: cy };
}

function addFurniture(def, extra = {}) {
  if (furnitureLocked()) return null;
  const { x, y } = dropPoint(def);
  checkpoint();
  const f = {
    id: uid('f'), type: def.type, name: def.name, w: def.w, d: def.d, h: def.h,
    x, y, rot: 0, elev: def.elev || 0, color: def.color, libId: null, usePhoto: false, ...extra,
  };
  const preset = SIZE_PRESETS[def.type];
  if (preset && def[preset.key]) f[preset.key] = def[preset.key];
  if (def.plant) f.plant = def.plant;
  if (def.stool) f.stool = true;
  state.furniture.push(f);
  emit('furniture');
  select({ kind: 'furniture', id: f.id });
  status(`${f.name}을(를) 놓았습니다. 2D·3D 어느 쪽에서든 끌어서 옮기고, R로 90° 돌립니다.`);
  return f;
}

function renderCatalog() {
  $('catalog').innerHTML = CATALOG.map((c, i) => {
    const p = SIZE_PRESETS[c.type];
    const v = p && c[p.key];
    const plant = c.type === 'plant';   // 식물은 놓은 뒤 종류를 고른다
    return `
    <button class="cat-item" data-i="${i}" title="${esc(c.name)} ${c.w}×${c.d}×${c.h}mm">
      <span class="ico">${c.icon}</span><span class="nm">${v ? p.card : plant ? '식물' : esc(c.name)}</span>
      <span class="sz">${v ? `${v}${p.unitText} · ${p.pick}` : plant ? `${esc(c.name)} · 종류 선택` : `${c.w}×${c.d}`}</span>
    </button>`;
  }).join('');
  $('catalog').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => addFurniture(CATALOG[+b.dataset.i])));
}

function renderLibrary() {
  const lib = state.library;
  $('library-card').hidden = !lib.length;
  $('library').innerHTML = lib.map((l) => `
    <div class="lib-wrap">
      <button class="cat-item" data-id="${l.id}" title="${esc(l.name)} ${l.w}×${l.d}×${l.h}mm">
        ${l.image ? `<img src="${l.image}" alt="">` : `<span class="ico">${iconFor(l.type)}</span>`}
        <span class="nm">${esc(l.name)}</span><span class="sz">${l.w}×${l.d}×${l.h}</span>
      </button>
      <button class="del" data-del="${l.id}" title="내 가구에서 지우기">✕</button>
    </div>`).join('');
  $('library').querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => placeLibrary(b.dataset.id)));
  $('library').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const l = lib.find((x) => x.id === b.dataset.del);
    if (!l || !confirm(`‘${l.name}’을(를) 내 가구에서 지울까요? (이미 놓은 가구는 사진만 빠집니다)`)) return;
    state.library = lib.filter((x) => x.id !== l.id);
    emit('library');
  }));
}

function placeLibrary(id) {
  const l = state.library.find((x) => x.id === id);
  if (!l) return;
  addFurniture(l, { libId: l.id, usePhoto: l.usePhoto, color: l.color });
}

const byName = new Intl.Collator('ko', { numeric: true }).compare;
// 종류 순서는 SHAPES에 적힌 순서 (냉장고 → 세탁기 → 수납 → 침대 → 소파 → … → 설비)
const TYPE_ORDER = new Map(Object.keys(SHAPES).map((k, i) => [k, i]));
const typeRank = (t) => TYPE_ORDER.get(t) ?? TYPE_ORDER.size;
const byTypeThenName = (a, b) => typeRank(a.type) - typeRank(b.type) || byName(a.name, b.name);

/** 가격 입력 읽기: '1,290,000' · '1290000원' · '129만' · '129만 9천' · '12.9만' → 원. 빈칸은 null, 못 읽으면 NaN */
function parseWon(text) {
  const s = String(text).replace(/[\s,원₩]/g, '');
  if (!s) return null;
  const m = s.match(/^(?:(\d+(?:\.\d+)?)만)?(?:(\d+(?:\.\d+)?)천)?(\d+)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return NaN;
  return Math.round((+m[1] || 0) * 10000 + (+m[2] || 0) * 1000 + (+m[3] || 0));
}
const fmtWon = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
/** 가격 합계에서 빼는 것: 기본 포함 가구(builtin, 집에 딸려 오는 것)와 비활성화한 가구(disabled, 지금은 안 놓은 것) */
const excluded = (f) => f.builtin || f.disabled;
const sumPrice = (fs) => fs.reduce((s, f) => s + (excluded(f) ? 0 : f.price || 0), 0);

/**
 * 비용에 넣는 문: 현관 중문은 늘(사서 다는 것이라), 다른 문은 가격을 넣었을 때만. 가구 항목과 같은 꼴로 바꿔 합계·목록·엑셀에 함께 쓴다.
 * door: true, 크기는 문 폭 × 벽 두께 × 문 높이
 */
const DOOR_NAMES = { swing: '여닫이문', double: '양여닫이문', sliding: '미닫이문', bypass: '미서기문', middle: '현관 중문' };
function costDoors() {
  return state.plan.doors.filter((d) => doorStyle(d) === 'middle' || d.price != null).map((d) => ({
    id: d.id, door: true, style: doorStyle(d), name: d.name || DOOR_NAMES[doorStyle(d)], model: d.model, price: d.price, builtin: d.builtin,
    w: Math.round(G.dist(d.a, d.b)), d: Math.round(d.t), h: DOOR.h,
  }));
}
const costItems = () => [...state.furniture, ...costDoors()];

/** 합계 아래 안내 문장들: 기본 포함이라 제외한 수 · 가격을 안 넣은 수 */
function priceNotes(fs) {
  const builtin = fs.filter((f) => f.builtin).length, off = fs.filter((f) => f.disabled && !f.builtin).length;
  const noPrice = fs.filter((f) => !excluded(f) && f.price == null);
  const what = noPrice.some((f) => f.door) ? (noPrice.every((f) => f.door) ? '문' : '가구·문') : '가구';
  const out = [builtin && `기본 가구 ${builtin}개`, off && `비활성 가구 ${off}개`].filter(Boolean).join(' · ');
  return [
    out && `총 ${fs.length}개 중 ${out}는 제외했습니다`,
    noPrice.length && `가격을 넣지 않은 ${what} ${noPrice.length}개는 빼고 더했습니다`,
  ].filter(Boolean);
}

/** 배치된 가구(+ 비용에 넣는 문) 합계: 기본 포함을 뺀 개수 · 가격 합계 (뺀 것·가격 안 넣은 것 수도 알린다) */
function renderPlacedTotal() {
  const fs = costItems(), nf = fs.filter((f) => !excluded(f) && !f.door).length, nd = fs.filter((f) => !excluded(f) && f.door).length;
  $('placed-total').hidden = $('placed-export').hidden = !fs.length;
  $('placed-total').innerHTML = fs.some((f) => f.price != null || excluded(f))
    ? `가구 ${nf}개${nd ? ` · 문 ${nd}개` : ''} · 합계 <b>${fmtWon(sumPrice(fs))}</b>${priceNotes(fs).map((s) => `<small>${s}</small>`).join('')}`
    : `가구 ${state.furniture.length}개${nd ? ` · 문 ${nd}개` : ''}<small>가구를 골라 모델명·가격을 넣으면 여기에 합계가 나옵니다</small>`;
}

/**
 * 가구 목록 엑셀: 기본은 가격이 계산된 가구(기본 가구 아님 + 가격 있음)만 + 합계 줄.
 * all이면 기본 가구가 아닌 것을 모두(가격 없는 것도) 위에, 합계 줄 아래에 기본 가구를 따로 모은다.
 */
function furnitureSheet(all) {
  const fs = [...[...state.furniture].sort(byTypeThenName), ...costDoors()];   // 문(중문 등)은 가구 뒤에
  const paid = fs.filter((f) => !excluded(f) && (all || f.price != null)), builtin = all ? fs.filter(excluded) : [];
  const H = (v) => ({ v, s: STYLE.header });
  const row = (f, i, muted) => [i + 1, f.door ? DOOR_STYLES[f.style] : SHAPES[f.type]?.label || f.type, f.name, f.model || '',
    f.price != null ? { v: f.price, s: muted ? STYLE.mutedWon : STYLE.won } : '', f.w, f.d, f.h, f.builtin ? '기본 포함' : f.disabled ? '비활성' : f.custom ? '맞춤 제작' : '구매']
    .map((v) => (muted && typeof v !== 'object' ? { v, s: STYLE.muted } : v));
  const head = 4;   // 제목 · 요약 · 빈 줄 다음 줄이 머리글
  const rows = [
    [{ v: `OhMyHome 가구 목록${state.layouts.length > 1 ? ` — ${currentLayout().name}` : ''}`, s: STYLE.title }],
    [`${today()} · 가구 ${paid.filter((f) => !f.door).length}개${paid.some((f) => f.door) ? ` · 문 ${paid.filter((f) => f.door).length}개` : ''} · 합계 ${fmtWon(sumPrice(paid))}${all && builtin.length ? ` · 기본·비활성 가구 ${builtin.length}개는 합계에서 제외` : ''}`],
    [],
    ['번호', '종류', '이름', '모델명', '가격(원)', '가로(mm)', '깊이(mm)', '높이(mm)', '구분'].map(H),
    ...paid.map((f, i) => row(f, i)),
  ];
  const end = head + paid.length;
  rows.push(['', '', { v: '합계', s: STYLE.totalLabel }, { v: `${paid.length}개`, s: STYLE.totalLabel },
    { f: paid.length ? `SUM(E${head + 1}:E${end})` : '0', v: sumPrice(paid), s: STYLE.totalWon },
    ...Array(4).fill({ v: '', s: STYLE.totalLabel })]);
  if (builtin.length) {
    rows.push([], [{ v: `기본 포함·비활성 가구 ${builtin.length}개 (합계에서 제외)`, s: STYLE.section }], ...builtin.map((f, i) => row(f, i, true)));
  }
  return makeXlsx({ name: '가구 목록', cols: [6, 14, 22, 26, 14, 10, 10, 10, 10], rows, freeze: head });
}

$('btn-xlsx').addEventListener('click', () => {
  const all = $('xlsx-all').checked;
  if (!all && !costItems().some((f) => !excluded(f) && f.price != null)) {
    status('가격이 계산된 가구가 없습니다. 가구에 가격을 넣거나 ‘모든 가구’를 켜고 다시 눌러 주세요.');
    return;
  }
  const blob = new Blob([furnitureSheet(all)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  download(url, `ohmyhome-가구-${layoutTag()}${today()}.xlsx`);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  status(all ? '모든 가구를 엑셀로 저장했습니다(가격이 계산된 가구 위, 기본 가구 아래).' : '가격이 계산된 가구를 엑셀로 저장했습니다.');
});

/** 목록·묶음 패널의 가격 표시: 기본 포함 가구는 '기본 포함' 꼬리표, 가격은 지운 줄로 */
const priceTag = (f) => excluded(f)
  ? `<span class="price builtin">${f.builtin ? '기본 포함' : '비활성'}${f.price != null ? ` <s>${fmtWon(f.price)}</s>` : ''}</span>`
  : f.price != null ? `<span class="price">${fmtWon(f.price)}</span>` : '';

/** 맞춤 제작 가구 꼬리표 (기성품이 아니라 크기·비용이 다를 수 있다) */
const CUSTOM_TAG = ' <span class="custom-tag" title="맞춤 제작 — 기성품이 아니라 크기·비용이 달라질 수 있습니다">🛠️ 맞춤</span>';

/** 배치된 가구: 종류별로 묶고(제목 + 개수 + 소계), 같은 종류 안에서는 이름순 */
function renderPlaced() {
  renderPlacedTotal();
  const bad = G.findCollisions(state.furniture, state.plan.walls, state.plan.blocked);
  const groups = new Map();
  for (const f of [...state.furniture].sort(byTypeThenName)) {
    if (!groups.has(f.type)) groups.set(f.type, []);
    groups.get(f.type).push(f);
  }
  $('placed-list').innerHTML = state.furniture.length
    ? [...groups].map(([type, fs]) => `
      <div class="placed-group">${iconFor(type)} ${esc(SHAPES[type]?.label || type)} <span class="n">${fs.length}</span>${fs.some((f) => !excluded(f) && f.price != null) ? `<span class="sub">${fmtWon(sumPrice(fs))}</span>` : ''}</div>
      ${fs.map((f) => `
      <button data-id="${f.id}" class="${isFurnitureSelected(f.id) ? 'sel' : ''}${f.disabled ? ' off' : ''}">
        <span>${esc(f.name)}${f.custom ? CUSTOM_TAG : ''}${bad.has(f.id) ? ' <span class="bad">⚠</span>' : ''}${f.model ? `<span class="model">${esc(f.model)}</span>` : ''}</span>
        ${priceTag(f) || `<span class="sz">${f.w}×${f.d}×${f.h}</span>`}
      </button>`).join('')}`).join('')
    : '<p class="empty">아직 놓은 가구가 없습니다.</p>';
  // 비용에 넣는 문(현관 중문 등)은 맨 아래 '문' 묶음으로. 누르면 그 문을 고른다
  const ds = costDoors(), selDoor = ui.selection?.kind === 'door' && ui.selection.id;
  if (ds.length) {
    $('placed-list').insertAdjacentHTML('beforeend', `
      <div class="placed-group">🚪 문 <span class="n">${ds.length}</span>${ds.some((f) => !f.builtin && f.price != null) ? `<span class="sub">${fmtWon(sumPrice(ds))}</span>` : ''}</div>
      ${ds.map((f) => `
      <button data-door="${f.id}" class="${selDoor === f.id ? 'sel' : ''}">
        <span>${esc(f.name)}${f.model ? `<span class="model">${esc(f.model)}</span>` : ''}</span>
        ${priceTag(f) || `<span class="sz">폭 ${fmtMM(f.w)}</span>`}
      </button>`).join('')}`);
  }
  // Shift·Ctrl(⌘)+클릭: 선택에 더하거나 빼기
  $('placed-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
    endDrawTool();
    if (b.dataset.door) select({ kind: 'door', id: b.dataset.door });
    else if (e.shiftKey || e.ctrlKey || e.metaKey) toggleFurnitureSelection(b.dataset.id);
    else select({ kind: 'furniture', id: b.dataset.id });
  }));
}

/* ---------- 배치 안 ---------- */
/** 안 목록: 이름 · 가구 수 · 합계 (문 비용은 모든 안이 함께) */
function renderLayouts() {
  const doors = costDoors();
  $('layout-list').innerHTML = state.layouts.map((l) => {
    const fs = layoutFurniture(l.id), all = [...fs, ...doors], priced = all.some((f) => f.price != null);
    return `<button data-layout="${l.id}" class="${l.id === state.layoutId ? 'sel' : ''}">
      <span>${esc(l.name)}${l.locked ? '<span class="lock" title="보호 중 — 가구를 고칠 수 없습니다">🔒</span>' : ''}</span><span class="sz">가구 ${fs.filter((f) => !excluded(f)).length}개${priced ? ` · ${fmtWon(sumPrice(all))}` : ''}</span></button>`;
  }).join('');
  $('layout-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.layout === state.layoutId) return;
    endDrawTool();
    checkpoint();
    switchLayout(b.dataset.layout);
    status(`‘${currentLayout().name}’ 배치를 봅니다.`);
  }));
  const locked = !!currentLayout().locked;
  $('btn-layout-del').disabled = state.layouts.length < 2 || locked;
  $('btn-layout-del').title = locked ? '보호 중인 안은 지울 수 없습니다' : '';
  $('btn-layout-lock').classList.toggle('active', locked);
  $('btn-layout-lock').textContent = locked ? '🔒 보호 중' : '🔓 보호하기';
  $('placed-layout').textContent = state.layouts.length > 1 ? `— ${currentLayout().name}` : '';
}
$('btn-layout-add').addEventListener('click', () => {
  const from = currentLayout().name;
  checkpoint();
  const l = addLayout();
  status(`‘${from}’을(를) 그대로 복사해 ‘${l.name}’을(를) 만들었습니다. 이제 ‘${l.name}’에서 가구를 옮겨 보세요.`);
});
$('btn-layout-lock').addEventListener('click', () => {
  const l = currentLayout(), on = !l.locked;
  checkpoint();
  setLayoutLocked(l.id, on);
  if (ui.selection?.kind === 'furniture') renderProps();   // 속성 칸을 막거나 푼다
  status(on ? `🔒 ‘${l.name}’을(를) 보호합니다. 가구를 옮기거나 고치거나 지울 수 없습니다(다시 누르면 풉니다).`
    : `🔓 ‘${l.name}’의 보호를 풀었습니다.`);
});
$('btn-layout-rename').addEventListener('click', () => {
  const l = currentLayout();
  const name = prompt('안 이름', l.name)?.trim();
  if (!name || name === l.name) return;
  checkpoint();
  renameLayout(l.id, name);
});
$('btn-layout-del').addEventListener('click', () => {
  const l = currentLayout();
  if (state.layouts.length < 2 || !confirm(`‘${l.name}’ 배치를 지울까요? (되돌리기로 살릴 수 있습니다)`)) return;
  checkpoint();
  deleteLayout(l.id);
  status(`‘${l.name}’을(를) 지우고 ‘${currentLayout().name}’을(를) 봅니다.`);
});
/** 파일 이름에 넣을 안 이름 (안이 하나면 넣지 않는다) */
const layoutTag = () => (state.layouts.length > 1 ? `${currentLayout().name.replace(/[\\/:*?"<>|\s]+/g, '_')}-` : '');


/* ---------- 속성 패널 ---------- */
let propsFor = null;

function renderProps() {
  const el = $('props');
  const obj = findSelected();
  const sel = ui.selection;
  if (!obj) { el.hidden = true; propsFor = null; return; }
  el.hidden = false;
  propsFor = selKey(sel);

  if (sel.ids) {
    el.innerHTML = `
      <h3><span>🗂️ 가구 ${sel.ids.length}개</span><button data-act="close" class="icon">✕</button></h3>
      <div class="warn" data-warn hidden>⚠ 고른 가구 가운데 벽·빗금 구역(배치 금지)이나 다른 가구와 겹치는 것이 있습니다.</div>
      <ul class="multi-list">${sel.ids.map((id) => state.furniture.find((f) => f.id === id))
        .sort(byTypeThenName).map((f) => `<li>${iconFor(f.type)} ${esc(f.name)}${f.custom ? CUSTOM_TAG : ''} ${priceTag(f)}</li>`).join('')}</ul>
      ${(() => {
        const fs = sel.ids.map((id) => state.furniture.find((f) => f.id === id)), notes = priceNotes(fs);
        return fs.some((f) => f.price != null || excluded(f)) ? `<div class="field"><span>고른 가구 가격 합계</span><b>${fmtWon(sumPrice(fs))}</b></div>${notes.length ? `<p class="hint">${notes.join('.<br>')}.</p>` : ''}` : '';
      })()}
      <div class="btns"><button data-act="builtin-on" title="집에 딸려 오는 가구로 표시해 가격 합계에서 뺍니다">기본 포함으로</button><button data-act="builtin-off">기본 포함 해제</button></div>
      <div class="btns"><button data-act="custom-on" title="기성품이 아닌 맞춤 제작으로 표시합니다 (도면 치수 아래 🛠️ 맞춤)">맞춤 제작으로</button><button data-act="custom-off">맞춤 해제</button></div>
      <div class="btns"><button data-act="off-on" title="점선·연한 색으로 보이고 겹침·합계에서 빠집니다">비활성화</button><button data-act="off-off">다시 활성화</button></div>
      <div class="btns"><button data-act="rot-90">⟲ 90°</button><button data-act="rot90">⟳ 90°</button></div>
      <div class="btns">
        <button data-act="dup">함께 복제</button>
        <button data-act="del" class="danger">모두 삭제</button>
      </div>
      <p class="hint">끌어서 함께 이동 · 방향키 10mm(Shift 100mm) · R 90° 회전(가운데를 축으로) · Ctrl+D 복제 · Delete 삭제<br>
        Shift+클릭으로 더하거나 빼고, Shift+빈 곳 끌기로 한꺼번에 고릅니다. Ctrl+A는 가구 전체.</p>`;
  } else if (sel.kind === 'furniture') {
    const lib = obj.libId && state.library.find((l) => l.id === obj.libId);
    const preset = SIZE_PRESETS[obj.type];
    const dims = { w: '가로 W', d: '깊이 D', ...SHAPES[obj.type]?.dims };
    const isL = obj.type === 'kitchen_l';
    el.innerHTML = `
      <h3><span>${iconFor(obj.type)} 가구</span><button data-act="close" class="icon">✕</button></h3>
      ${lib?.image ? `<img class="thumb" src="${lib.image}" alt="">` : ''}
      <div class="warn" data-warn hidden>⚠ 벽·빗금 구역(배치 금지)이나 다른 가구와 겹칩니다.</div>
      <label class="field"><span>이름</span><input type="text" data-f="name"></label>
      <label class="field"><span>모델명</span><input type="text" data-f="model" placeholder="예: LG 오브제 M873"></label>
      <label class="field"><span>가격 (원)</span><input type="text" inputmode="numeric" data-f="price" placeholder="예: 1,290,000 · 129만"></label>
      <label class="check" title="집에 딸려 오는 가구(빌트인·옵션)는 가격 합계에서 뺍니다"><input type="checkbox" data-f="builtin"> 기본 포함 가구 (합계에서 빼기)</label>
      <label class="check" title="지우지 않고 잠시 빼 둡니다 — 점선·연한 색으로 보이고, 겹침 판정·둘러보기 길·가격 합계에서 빠집니다"><input type="checkbox" data-f="disabled"> 비활성화 (점선으로 연하게, 겹침·합계에서 빼기)</label>
      <label class="check" title="기성품이 아니라 따로 만드는 가구 — 크기가 기성품과 다르고 비용이 더 들 수 있습니다. 도면의 치수 아래에 🛠️ 맞춤이 붙습니다"><input type="checkbox" data-f="custom"> 🛠️ 맞춤 제작 (기성품 아님 — 크기·비용이 다를 수 있음)</label>
      <label class="field"><span>샘플 모양</span><select data-f="type">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      ${obj.type === 'plant' ? `
      <label class="field"><span>식물 종류</span><select data-f="plant">${Object.entries(PLANTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      <div class="btns preset-btns">${Object.entries(PLANTS).map(([k, v]) => `<button data-plant="${k}">${v.label}</button>`).join('')}</div>` : ''}
      ${obj.type === 'chair' ? `
      <label class="check" title="등받이 없이 엉덩이만 앉는 의자(스툴)로 그립니다 — 높이가 앉는 면 높이가 되고, 책상·식탁 밑으로 통째로 들어갈 수 있습니다"><input type="checkbox" data-f="stool"> 등받이 없음 (엉덩이만 앉는 스툴)</label>` : ''}
      ${obj.type === 'water_purifier' ? '<p class="hint" data-v="purifier"></p>' : ''}
      ${obj.type === 'curtain_rod' ? `
      <label class="field"><span>커튼</span><select data-f="drape">${Object.entries(ROD_DRAPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      <label class="check" title="봉 방향 양쪽 벽까지 길이를 늘 맞춥니다 — 끌거나 돌리면 그 자리 벽 사이로 바로 늘고 줄어듭니다. 가로를 직접 고치면 꺼집니다"><input type="checkbox" data-f="fitWalls"> ↔ 벽 사이에 자동으로 맞춤</label>
      <p class="hint" data-v="rod"></p>` : ''}
      ${obj.type === 'wardrobe' ? `
      <label class="field"><span>옷장 모양</span><select data-f="wstyle">${Object.entries(WARDROBE_STYLES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      ${obj.wstyle === 'mix' ? mixStyles(obj).map((_, i, all) => `
      <label class="field indent"><span>칸 ${i + 1}${i === 0 ? ' (왼쪽)' : i === all.length - 1 ? ' (오른쪽)' : ''}</span><select data-f="mix-${i}">${MIX_PARTS.map((k) => `<option value="${k}">${WARDROBE_STYLES[k].label}</option>`).join('')}</select></label>`).join('') : ''}
      <label class="check" title="문짝 없이 칸·선반·옷걸이 봉이 드러나는 오픈형(드레스룸 시스템장)으로 그립니다"><input type="checkbox" data-f="noDoor"> 문 없음 (오픈형 — 안의 선반·옷이 보임)</label>` : ''}
      ${preset ? `
      <label class="field"><span>${preset.label}</span><input type="number" min="${preset.min}" max="${preset.max}" step="1" data-f="${preset.key}"></label>
      <div class="btns preset-btns">${preset.options.map((n) => `<button data-preset="${n}">${n}${preset.unit}</button>`).join('')}</div>` : ''}
      <label class="field"><span>${dims.w} (mm)</span><input type="number" min="10" step="10" data-f="w"></label>
      <label class="field"><span>${dims.d} (mm)</span><input type="number" min="10" step="10" data-f="d"></label>
      ${isL ? `
      <label class="field"><span>상판 깊이 (mm)</span><input type="number" min="${L_COUNTER.minDepth}" max="${L_COUNTER.maxDepth}" step="10" data-f="counterD"></label>
      <label class="field" title="꺾인 쪽(선반 쪽)만 더 깊을 때 — 비우면 상판 깊이와 같습니다"><span>꺾인 쪽 깊이 (mm)</span><input type="number" min="${L_COUNTER.minDepth}" max="${L_COUNTER.maxDepth}" step="10" data-f="legD"></label>
      <div class="field"><span>꺾인 쪽</span><b data-v="lside"></b></div>
      <div class="btns"><button data-act="mirror">⇋ 좌우 반전</button></div>` : ''}
      <label class="field"><span>높이 H (mm)</span><input type="number" min="10" step="10" data-f="h"></label>
      <label class="field"><span>회전 (°)</span><input type="number" step="15" data-f="rot"></label>
      <div class="btns"><button data-act="rot-90">⟲ 90°</button><button data-act="rot90">⟳ 90°</button></div>
      <label class="field"><span>바닥에서 띄움 (mm)</span><input type="number" min="0" step="10" data-f="elev"></label>
      <label class="field"><span>위치 X (mm)</span><input type="number" step="10" data-f="x"></label>
      <label class="field"><span>위치 Y (mm)</span><input type="number" step="10" data-f="y"></label>
      <label class="field"><span>색상</span><input type="color" data-f="color"></label>
      ${lib?.image ? '<label class="check"><input type="checkbox" data-f="usePhoto"> 사진을 앞면에 입히기</label>' : ''}
      <div class="btns">
        <button data-act="snap" title="가장 가까운 벽에 등을 대고 붙입니다">🧲 벽에 붙이기</button>
        <button data-act="dup">복제</button>
        <button data-act="del" class="danger">삭제</button>
      </div>
      <p class="hint">끌어서 이동 · R 90° 회전 · Q/E 15° · 방향키 10mm(Shift 100mm) · Delete 삭제<br>두꺼운 선이 가구의 앞면입니다. Shift+클릭으로 여러 개를 함께 고릅니다.</p>`;
  } else if (sel.kind === 'wall') {
    el.innerHTML = `
      <h3><span>🧱 벽</span><button data-act="close" class="icon">✕</button></h3>
      <div class="field"><span>종류</span><b>${obj.auto ? '자동 인식' : '직접 그림'}</b></div>
      <label class="field"><span>길이 (mm)</span><input type="text" data-f="len"></label>
      <label class="field"><span>두께 (mm)</span><input type="number" min="10" step="10" data-f="t"></label>
      <div class="btns"><button data-act="del" class="danger">벽 삭제</button></div>
      <p class="hint">${state.plan.image && obj.auto
        ? '자동 인식한 벽은 길이를 실제 치수로 고치면 이 벽을 기준으로 <b>도면 전체 크기</b>가 바뀝니다.'
        : '길이를 고치면 시작점은 그대로 두고 끝점을 옮깁니다(이 벽만 바뀝니다).'}</p>`;
  } else if (sel.kind === 'door') {
    const style = doorStyle(obj);
    el.innerHTML = `
      <h3><span>🚪 문</span><button data-act="close" class="icon">✕</button></h3>
      <div class="field"><span>모양</span></div>
      <div class="btns preset-btns">${Object.entries(DOOR_STYLES).map(([k, v]) => `<button data-act="door-style-${k}" class="${style === k ? 'active' : ''}">${v}</button>`).join('')}</div>
      <div class="field"><span>종류</span><b>${obj.auto === false ? '직접 단 문' : '도면 기호에서 찾음'}</b></div>
      <label class="field"><span>이름</span><input type="text" data-f="name" placeholder="${DOOR_NAMES[style]}"></label>
      <label class="field"><span>모델명</span><input type="text" data-f="model" placeholder="예: 3연동 슬림 중문"></label>
      <label class="field"><span>가격 (원)</span><input type="text" inputmode="numeric" data-f="price" placeholder="예: 1,500,000 · 150만"></label>
      <label class="check" title="집에 딸려 오는 문은 가격 합계에서 뺍니다"><input type="checkbox" data-f="builtin"> 기본 포함 (합계에서 빼기)</label>
      ${style === 'middle' ? '' : '<p class="hint">가격을 넣은 문은 가구 합계·엑셀에 함께 들어갑니다(현관 중문은 늘 들어갑니다).</p>'}
      <div class="field"><span>문 폭</span><b data-v="dwidth">${fmtMM(G.dist(obj.a, obj.b))} mm</b></div>
      ${style === 'middle' && state.plan.entrance ? '<label class="field"><span>현관문에서 (mm)</span><input type="number" step="50" data-f="mdepth"></label>' : ''}
      ${style === 'swing'
        ? '<div class="btns"><button data-act="hinge">⇋ 경첩 반대로</button><button data-act="swing">⇅ 여는 쪽 반대로</button></div>'
        : style === 'double' ? '<div class="btns"><button data-act="swing">⇅ 여는 쪽 반대로</button></div>'
        : `<div class="btns">${style === 'sliding' && G.dist(obj.a, obj.b) > SLIDE.twoOver ? '' : '<button data-act="hinge">⇋ 여는 방향 반대로</button>'}<button data-act="swing">⇅ 붙는 벽 면 반대로</button></div>`}
      <div class="btns"><button data-act="del" class="danger">문 삭제</button></div>
      <p class="hint">${{
        swing: '3D에서는 문 위를 천장까지 벽으로 채우고, 문짝을 도면 기호처럼 90° 열어 둡니다.',
        double: '양여닫이는 양 끝 경첩에 달린 두 짝이 가운데에서 만나고, 옷장 문처럼 두 짝 모두 같은 쪽으로 열립니다. 3D에서는 두 짝을 90° 열어 둡니다.',
        sliding: `미닫이는 벽 면을 따라 밀려 열립니다. 폭이 ${fmtMM(SLIDE.twoOver)}mm를 넘으면 두 짝이 양쪽으로 열립니다. 3D에서는 문짝을 끝까지 열어 둡니다.`,
        bypass: '미서기는 벽 두께 안에 두 짝이 엇갈려 있어 한 짝을 다른 짝 쪽으로 밀어 엽니다. 3D에서는 한 짝을 밀어 반쯤 열어 둡니다. ‘여는 방향’은 움직이는 짝을, ‘붙는 벽 면’은 앞뒤 레일을 바꿉니다.',
        middle: '현관 중문은 유리 세 짝이 한쪽으로 겹쳐 모이며 열리고(3연동), 문 위는 천장까지 고정 유리입니다. 2D에서 끌거나 ‘현관문에서’ 거리를 고치면 양옆 벽을 따라 앞뒤로 옮겨집니다(폭은 양옆 벽에 맞춥니다).',
      }[style]}
        🚪 문 도구로 새로 다는 문은 여기서 마지막에 고른 모양이 됩니다.</p>`;
  } else if (sel.kind === 'window') {
    el.innerHTML = `
      <h3><span>🪟 창</span><button data-act="close" class="icon">✕</button></h3>
      <label class="field"><span>창 폭 (mm)</span><input type="text" data-f="wlen"></label>
      <label class="field"><span>바닥~창 아래 (mm)</span><input type="number" min="0" step="50" data-f="sill"></label>
      <label class="field"><span>창 높이 (mm)</span><input type="number" min="100" step="50" data-f="h"></label>
      <div class="btns"><button data-preset-win="900">허리창</button><button data-preset-win="0">바닥까지 큰 창</button></div>
      <div class="btns"><button data-act="del" class="danger">창 삭제</button></div>
      <p class="hint">폭을 고치면 가운데를 두고 양쪽으로 늘어납니다. 3D에서는 창 자리의 벽을 비우고 창틀·유리를 넣습니다.</p>`;
  } else {
    el.innerHTML = `
      <h3><span>⬛ 방</span><button data-act="close" class="icon">✕</button></h3>
      <label class="field"><span>이름</span><input type="text" data-f="name"></label>
      <div class="field"><span>면적</span><b data-v="area"></b></div>
      <label class="field"><span>가로 (mm)</span><input type="text" data-f="rw"></label>
      <label class="field"><span>세로 (mm)</span><input type="text" data-f="rh"></label>
      <div class="field"><span>둘레</span><b data-v="perim"></b></div>
      <div class="btns"><button data-act="del" class="danger">방 삭제</button></div>
      <p class="hint">${state.plan.image ? '가로·세로를 도면에 적힌 치수로 고치면 이 방을 기준으로 <b>도면 전체 크기</b>가 바뀝니다.' : ''}</p>`;
  }
  if (sel.kind === 'furniture' && currentLayout().locked) {
    // 보호 중인 안: 값은 보이되 고치지 못하게
    el.querySelector('h3').insertAdjacentHTML('afterend', `<p class="props-lock">🔒 ‘${esc(currentLayout().name)}’은(는) 보호 중입니다. 배치 안의 ‘🔒 보호’를 눌러 풀면 고칠 수 있습니다.</p>`);
    el.querySelectorAll('input, select, button:not([data-act=close])').forEach((x) => { x.disabled = true; });
  }
  el.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', () => applyProp(inp)));
  el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => propAction(b.dataset.act)));
  el.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => applyPreset(findSelected(), +b.dataset.preset)));
  el.querySelectorAll('[data-plant]').forEach((b) => b.addEventListener('click', () => applyPlant(findSelected(), b.dataset.plant)));
  el.querySelectorAll('[data-preset-win]').forEach((b) => b.addEventListener('click', () => {
    const w = findSelected();
    if (!w) return;
    checkpoint();
    const sill = +b.dataset.presetWin;
    Object.assign(w, { sill, h: Math.max(300, (sill ? 2100 : Math.min(2100, state.plan.wallHeight - 100)) - sill) });
    emit('plan');
  }));
  refreshProps();
}

/** 입력칸 값만 다시 채운다 (지금 입력 중인 칸은 건드리지 않는다) */
function refreshProps() {
  const obj = findSelected();
  const sel = ui.selection;
  if (!obj) return;
  const el = $('props');
  if (sel.ids) {
    const bad = G.findCollisions(state.furniture, state.plan.walls, state.plan.blocked);
    el.querySelector('[data-warn]').hidden = !sel.ids.some((id) => bad.has(id));
    return;
  }
  const val = (k) => {
    if (sel.kind === 'wall' && k === 'len') return fmtMM(G.wallLength(obj));
    if (k === 'wlen') return fmtMM(G.dist(obj.a, obj.b));
    if (k === 'rw' || k === 'rh') { const b = G.boundsOf(obj.pts); return fmtMM(k === 'rw' ? b.w : b.h); }
    if (k === 'rot') return Math.round(obj.rot * 100) / 100;
    if (k === 'x' || k === 'y') return Math.round(obj[k]);
    if (k === 'counterD') return lCounterDepth(obj);
    if (k === 'legD') return lLegDepth(obj);
    if (k === 'mdepth') return Math.round(depthFromEntrance(obj, state.plan.entrance) ?? 0);
    if (k === 'plant') return plantOf(obj);
    if (k === 'wstyle') return wardrobeStyle(obj);
    if (k === 'drape') return rodDrape(obj);
    if (k === 'fitWalls') return !obj.manualW;
    if (k.startsWith('mix-')) return mixStyles(obj)[+k.slice(4)];
    if (k === 'price') return obj.price != null ? obj.price.toLocaleString('ko-KR') : '';
    const p = SIZE_PRESETS[obj.type];
    if (p && k === p.key) return obj[k] ?? p.guess(obj);
    return obj[k];
  };
  el.querySelectorAll('[data-f]').forEach((inp) => {
    if (inp === document.activeElement) return;
    const v = val(inp.dataset.f);
    if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v ?? '';
  });
  if (sel.kind === 'furniture') {
    el.querySelector('[data-warn]').hidden = !G.findCollisions(state.furniture, state.plan.walls, state.plan.blocked).has(obj.id);
    const p = SIZE_PRESETS[obj.type];
    const cur = p && (obj[p.key] ?? p.guess(obj));
    el.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', +b.dataset.preset === cur));
    el.querySelectorAll('[data-plant]').forEach((b) => b.classList.toggle('active', b.dataset.plant === plantOf(obj)));
    const pur = el.querySelector('[data-v=purifier]');   // 정수기는 놓인 자리에 따라 대형↔소형이 바뀐다(store.settlePurifiers)
    if (pur) pur.textContent = obj.onCounter
      ? '💧 주방 싱크대 위에 올린 소형 정수기입니다. 싱크대 밖 바닥으로 옮기면 대형(스탠드형)으로 바뀝니다.'
      : '💧 바닥에 단독으로 선 대형(스탠드형) 정수기입니다. 주방 싱크대 위로 끌어다 놓으면 소형 정수기로 바뀌어 상판 위에 올라갑니다.';
    const rod = el.querySelector('[data-v=rod]');   // 커튼 봉: 벽 사이에 맞췄는지(store.settleRods)
    if (rod) rod.textContent = obj.manualW ? `🪝 봉 길이 ${fmtMM(obj.w)}mm를 직접 정했습니다. ‘벽 사이에 자동으로 맞춤’을 켜면 양쪽 벽까지 늘립니다.`
      : G.rodSpan(obj, state.plan.walls, ROD_SPAN) ? `🪝 양쪽 벽 사이 ${fmtMM(obj.w)}mm에 걸었습니다. 끌거나 돌리면 그 자리 벽 사이로 맞춰집니다. 높이 H가 봉 높이입니다.`
        : `🪝 봉 방향 양쪽에 ${fmtMM(ROD_SPAN.min)}~${fmtMM(ROD_SPAN.max)}mm 안의 벽이 없어 길이를 그대로 둡니다. 벽과 벽 사이로 끌어 놓거나 ⟳ 90°로 방향을 바꿔 보세요.`;
    const lside = el.querySelector('[data-v=lside]');
    if (lside) lside.textContent = obj.mirror ? '왼쪽 (앞에서 볼 때)' : '오른쪽 (앞에서 볼 때)';
  }
  if (sel.kind === 'door') {
    const w = el.querySelector('[data-v=dwidth]');
    if (w) w.textContent = `${fmtMM(G.dist(obj.a, obj.b))} mm`;   // 중문을 옮기면 폭이 양옆 벽에 맞춰 바뀐다
  }
  if (sel.kind === 'room') {
    const a = G.polygonArea(obj.pts) / 1e6, b = G.boundsOf(obj.pts);
    const perim = obj.pts.reduce((s, p, i) => s + G.dist(p, obj.pts[(i + 1) % obj.pts.length]), 0);
    el.querySelector('[data-v=area]').textContent = `${a.toFixed(2)}㎡ (${(a / PYEONG).toFixed(1)}평)`;
    el.querySelector('[data-v=perim]').textContent = `${(perim / 1000).toFixed(2)} m`;
  }
}

function applyProp(inp) {
  const obj = findSelected();
  const sel = ui.selection;
  if (!obj) return;
  const k = inp.dataset.f;
  if (sel.kind === 'furniture' && furnitureLocked()) { refreshProps(); return; }
  let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? +inp.value : inp.value;
  if (inp.type === 'number' && !isFinite(v)) return;
  if (k === 'plant') { applyPlant(obj, v); return; }
  if (k === 'mdepth') { moveMiddleDoor(obj, v); return; }
  if (k === 'price') {
    const won = parseWon(v);
    if (Number.isNaN(won)) { status(`‘${v}’를 가격으로 읽지 못했습니다. 예: 1,290,000 · 1290000원 · 129만`); refreshProps(); return; }
    checkpoint();
    if (won === null) delete obj.price; else obj.price = won;
    emit(sel.kind === 'door' ? 'plan' : 'furniture');
    return;
  }
  if (k === 'disabled') {
    checkpoint();
    if (v) obj.disabled = true; else delete obj.disabled;
    emit('furniture');
    return;
  }
  if (k === 'custom') {
    checkpoint();
    if (v) obj.custom = true; else delete obj.custom;
    emit('furniture');
    return;
  }
  if (k === 'stool') { applyStool(obj, v); return; }
  if (k === 'drape') {   // 커튼 봉의 커튼 — 기본(양옆으로 걷음)은 키를 남기지 않는다
    checkpoint();
    if (v === 'open' || !ROD_DRAPES[v]) delete obj.drape; else obj.drape = v;
    emit('furniture');
    return;
  }
  if (k === 'fitWalls') {   // 켜면 바로 벽 사이로 늘린다(store.settleRods)
    checkpoint();
    if (v) delete obj.manualW; else obj.manualW = true;
    emit('furniture');
    return;
  }
  if (k === 'noDoor') {
    checkpoint();
    if (v) obj.noDoor = true; else delete obj.noDoor;
    emit('furniture');
    return;
  }
  if (k === 'wstyle') {   // 기본(통)은 키를 남기지 않는다
    checkpoint();
    if (v === 'tall' || !WARDROBE_STYLES[v]) delete obj.wstyle; else obj.wstyle = v;
    emit('furniture');
    renderProps();   // 믹스장이면 칸별 모양 칸을 보인다
    return;
  }
  if (k.startsWith('mix-')) {   // 믹스장 한 칸의 모양 — 칸 수만큼 채워 남긴다(가로를 바꿔 칸이 늘면 늘어난 칸은 기본 차례)
    checkpoint();
    const parts = mixStyles(obj);
    parts[+k.slice(4)] = v;
    obj.mix = parts;
    emit('furniture');
    return;
  }
  if (k === 'builtin') {
    checkpoint();
    if (v) obj.builtin = true; else delete obj.builtin;
    emit(sel.kind === 'door' ? 'plan' : 'furniture');
    return;
  }
  if (k === 'model') {
    checkpoint();
    const m = String(v).trim();
    if (m) obj.model = m; else delete obj.model;
    emit(sel.kind === 'door' ? 'plan' : 'furniture');
    return;
  }
  const preset = sel.kind === 'furniture' && SIZE_PRESETS[obj.type];
  if (preset && k === preset.key) { applyPreset(obj, v); return; }
  // 길이로 도면 전체 크기를 맞추는 칸들 (직접 그린 벽의 길이는 그 벽만 바꾼다 — 사용자가 더한 벽은 도면 이미지의 치수가 아니다)
  if ((sel.kind === 'wall' && k === 'len') || k === 'rw' || k === 'rh') {
    const mm = G.parseLengthMM(v);
    if (!(mm > 0)) { status(`‘${v}’를 길이로 읽지 못했습니다. 3.8m 또는 3800처럼 넣어 주세요.`); refreshProps(); return; }
    v = mm;
    if (state.plan.image && !(sel.kind === 'wall' && !obj.auto)) {
      let a, b;
      if (sel.kind === 'wall') {
        const len = G.dist(obj.a, obj.b) || 1, ux = (obj.b.x - obj.a.x) / len, uy = (obj.b.y - obj.a.y) / len, e = obj.cap ? obj.t / 2 : 0;
        a = { x: obj.a.x - ux * e, y: obj.a.y - uy * e };
        b = { x: obj.b.x + ux * e, y: obj.b.y + uy * e };
      } else {
        const bx = G.boundsOf(obj.pts);
        a = { x: bx.minX, y: bx.minY };
        b = k === 'rw' ? { x: bx.maxX, y: bx.minY } : { x: bx.minX, y: bx.maxY };
      }
      if (Math.abs(G.dist(a, b) - v) < 0.5) return;
      rescaleBy(a, b, v);
      status(`${fmtMM(v)}mm 기준으로 도면 전체 크기를 맞췄습니다.`);
      return;
    }
    if (sel.kind === 'room') { refreshProps(); return; } // 도면 없이 그린 방은 기준이 없다
  }
  if (k === 'wlen') {
    const mm = G.parseLengthMM(v), cur = G.dist(obj.a, obj.b) || 1;
    if (!(mm >= 100)) { status(`‘${v}’를 창 폭으로 읽지 못했습니다.`); refreshProps(); return; }
    checkpoint();
    const c = { x: (obj.a.x + obj.b.x) / 2, y: (obj.a.y + obj.b.y) / 2 }, ux = (obj.b.x - obj.a.x) / cur, uy = (obj.b.y - obj.a.y) / cur;
    obj.a = { x: c.x - ux * mm / 2, y: c.y - uy * mm / 2 };
    obj.b = { x: c.x + ux * mm / 2, y: c.y + uy * mm / 2 };
    emit('plan');
    return;
  }
  checkpoint();
  if (sel.kind === 'wall' && k === 'len') {
    const cur = G.dist(obj.a, obj.b) || 1;
    const target = Math.max(10, v - (obj.cap ? obj.t : 0));
    obj.b = { x: obj.a.x + ((obj.b.x - obj.a.x) / cur) * target, y: obj.a.y + ((obj.b.y - obj.a.y) / cur) * target };
  } else {
    if (k === 'rot') v = G.normDeg(v);
    if (['w', 'd', 'h', 't'].includes(k)) v = Math.max(10, v);
    if (k === 'elev' || k === 'sill') v = Math.max(0, v);
    if (obj.type === 'kitchen_l') v = clampKitchenL(obj, k, v);
    obj[k] = v;
    // 크기를 직접 고치면 인치·인원은 지우고, 화면에는 크기로 짐작한 값을 보여 준다
    if (preset?.affects.includes(k)) delete obj[preset.key];
    if (obj.type === 'curtain_rod' && k === 'w') obj.manualW = true;   // 봉 길이를 직접 정하면 벽 사이 맞춤을 끈다
  }
  emit(sel.kind === 'furniture' ? 'furniture' : 'plan');
  if (k === 'type' || (k === 'w' && obj.wstyle === 'mix')) renderProps();   // 모양마다 칸 이름·칸이 다르다 (ㄱ자 싱크대, 믹스장 칸 수)
}

/** 중문을 현관문에서 depth mm 안쪽으로 옮긴다 (양옆 벽을 따라, 폭은 새 자리 양옆 벽에 맞춘다) */
function moveMiddleDoor(door, depth) {
  const e = state.plan.entrance, cur = depthFromEntrance(door, e);
  const len = G.dist(door.a, door.b) || 1, nx = -(door.b.y - door.a.y) / len, ny = (door.b.x - door.a.x) / len;
  const per = -(nx * e.out.x + ny * e.out.y);   // 왼쪽 법선으로 1mm 갈 때 늘어나는 깊이
  if (Math.abs(per) < 0.3) { status('이 중문은 현관문과 나란하지 않아 거리로 옮길 수 없습니다. 2D에서 끌어 옮기세요.'); refreshProps(); return; }
  const r = moveDoorAlong(door, state.plan.walls, (depth - cur) / per);
  if (!r) { status(`현관문에서 ${fmtMM(depth)}mm 자리에는 양옆 벽이 없어 옮길 수 없습니다.`); refreshProps(); return; }
  checkpoint();
  Object.assign(door, r, { auto: false });
  emit('plan');
}

/** ㄱ자 싱크대: 상판 깊이는 정해진 범위에서, 가로·세로는 상판 깊이 + 최소 팔 길이보다 길게 (세로가 가로보다 길어도 된다) */
function clampKitchenL(obj, k, v) {
  const L = L_COUNTER;
  if (k === 'counterD') return Math.max(L.minDepth, Math.min(L.maxDepth, obj.w - L.minArm, obj.d - L.minArm, v));
  if (k === 'legD') return Math.max(L.minDepth, Math.min(L.maxDepth, obj.w - L.minArm, v));
  if (k === 'w' || k === 'd') {
    const min = (k === 'w' ? Math.max(lCounterDepth(obj), lLegDepth(obj)) : lCounterDepth(obj)) + L.minArm;
    if (v < min) status(`${k === 'w' ? '가로' : '세로'} 길이는 상판 깊이 + ${L.minArm}mm(${fmtMM(min)}mm) 이상이어야 합니다.`);
    return Math.max(min, v);
  }
  return v;
}

/**
 * 의자 ↔ 스툴(등받이 없음): 높이를 앉는 면 높이(STOOL.h) ↔ 등받이 의자 높이로 맞추고, 이름이 '의자'·'스툴'이면 이름도 바꾼다.
 * 가로·깊이는 기본 크기 그대로였을 때만 바꾼다(사용자가 고친 크기는 둔다).
 */
function applyStool(obj, on) {
  const chairDef = CATALOG.find((c) => c.type === 'chair' && !c.stool);
  checkpoint();
  if (on) {
    obj.stool = true;
    if (obj.h > STOOL.h + 150) obj.h = STOOL.h;
    if (obj.w === chairDef.w && obj.d === chairDef.d) Object.assign(obj, { w: STOOL.w, d: STOOL.d });
    if (obj.name === '의자') obj.name = '스툴';
  } else {
    delete obj.stool;
    if (obj.h < chairDef.h - 200) obj.h = chairDef.h;
    if (obj.w === STOOL.w && obj.d === STOOL.d) Object.assign(obj, { w: chairDef.w, d: chairDef.d });
    if (obj.name === '스툴') obj.name = '의자';
  }
  emit('furniture');
}

/**
 * 식물 종류를 바꾼다: 크기를 그 종류의 기본값으로 맞추고, 이름이 종류 이름(또는 '식물')이었으면 이름도 바꾼다.
 * 자리·화분 색·모델명·가격은 그대로 둔다.
 */
function applyPlant(obj, key) {
  const p = PLANTS[key];
  if (!obj || obj.type !== 'plant' || !p || furnitureLocked()) return;
  checkpoint();
  const named = obj.name === '식물' || Object.values(PLANTS).some((x) => x.label === obj.name);
  Object.assign(obj, { plant: key, w: p.w, d: p.d, h: p.h });
  if (named) obj.name = p.label;
  emit('furniture');
  status(`${p.label}(으)로 바꿨습니다: ${fmtMM(p.w)} × ${fmtMM(p.d)} × ${fmtMM(p.h)} mm. 크기는 속성에서 고칠 수 있고, 색상은 화분 색입니다.`);
}

/** TV 인치·소파 인원처럼 숫자 하나로 크기를 정한다 (catalog.SIZE_PRESETS) */
function applyPreset(obj, v) {
  const p = obj && SIZE_PRESETS[obj.type];
  if (!p || furnitureLocked()) return;
  if (!(v >= p.min && v <= p.max)) { status(`${p.label}는 ${p.min}~${p.max} 사이로 넣어 주세요.`); refreshProps(); return; }
  checkpoint();
  Object.assign(obj, { [p.key]: v, ...p.size(v) });
  if (p.namePattern.test(obj.name)) obj.name = p.name(v);
  emit('furniture');
  status(`${p.name(v)}: ${fmtMM(obj.w)} × ${fmtMM(obj.d)} × ${fmtMM(obj.h)} mm (${p.note})`);
}

function propAction(act) {
  const sel = ui.selection;
  const obj = findSelected();
  if (act === 'close') { select(null); return; }
  if (!obj || (sel.kind === 'furniture' && furnitureLocked())) return;
  if (act === 'del') { deleteSelected(); return; }
  if (act === 'rot90' || act === 'rot-90') rotateSelected(act === 'rot90' ? 90 : -90);
  if (act === 'dup') duplicateSelected();
  if (act === 'builtin-on' || act === 'builtin-off') {
    const fs = selectedFurniture();
    checkpoint();
    for (const f of fs) { if (act === 'builtin-on') f.builtin = true; else delete f.builtin; }
    emit('furniture');
    renderProps();   // 목록의 '기본 포함' 표시가 바뀐다
    status(act === 'builtin-on' ? `가구 ${fs.length}개를 기본 포함으로 표시해 합계에서 뺐습니다.` : `가구 ${fs.length}개의 기본 포함 표시를 지웠습니다.`);
    return;
  }
  if (act === 'off-on' || act === 'off-off') {
    const fs = selectedFurniture();
    checkpoint();
    for (const f of fs) { if (act === 'off-on') f.disabled = true; else delete f.disabled; }
    emit('furniture');
    renderProps();   // 목록의 '비활성' 표시가 바뀐다
    status(act === 'off-on' ? `가구 ${fs.length}개를 비활성화했습니다(점선으로 연하게, 겹침·합계에서 뺍니다).` : `가구 ${fs.length}개를 다시 활성화했습니다.`);
    return;
  }
  if (act === 'custom-on' || act === 'custom-off') {
    const fs = selectedFurniture();
    checkpoint();
    for (const f of fs) { if (act === 'custom-on') f.custom = true; else delete f.custom; }
    emit('furniture');
    renderProps();   // 목록의 '맞춤' 표시가 바뀐다
    status(act === 'custom-on' ? `가구 ${fs.length}개를 맞춤 제작으로 표시했습니다.` : `가구 ${fs.length}개의 맞춤 표시를 지웠습니다.`);
    return;
  }
  if (act.startsWith('door-style-')) {
    const style = act.slice('door-style-'.length);
    editor.doorStyle = style;   // 🚪 문 도구로 다음에 다는 문도 이 모양으로
    if (doorStyle(obj) === style) return;
    checkpoint();
    if (style === 'swing') delete obj.style; else obj.style = style;
    obj.auto = false;
    emit('plan');
    renderProps();
    return;
  }
  if (act === 'hinge' || act === 'swing') {
    checkpoint();
    // 경첩을 반대 끝으로 옮겨도 문짝은 같은 쪽으로 열리게: a↔b를 바꾸면 법선이 뒤집히므로 swing도 뒤집는다
    if (act === 'hinge') Object.assign(obj, { a: obj.b, b: obj.a });
    obj.swing = -obj.swing;
    obj.auto = false;   // 손으로 고친 문은 다시 찾기에서 덮어쓰지 않는다
    emit('plan');
    renderProps();      // '종류' 표시가 바뀐다
    return;
  }
  if (act === 'mirror') {
    checkpoint();
    obj.mirror = !obj.mirror;
    emit('furniture');
    status(`꺾인 쪽을 ${obj.mirror ? '왼쪽' : '오른쪽'}으로 바꿨습니다.`);
  }
  if (act === 'snap') {
    const r = G.snapToWall(obj, state.plan.walls);
    if (!r) { status('붙일 벽이 없습니다.'); return; }
    checkpoint();
    Object.assign(obj, { x: Math.round(r.x), y: Math.round(r.y), rot: r.rot });
    emit('furniture');
  }
}

const selectedFurniture = () => selectedFurnitureIds().map((id) => state.furniture.find((f) => f.id === id)).filter(Boolean);

/** 고른 가구를 돌린다. 여러 개면 고른 가구들 가운데를 축으로 자리까지 함께 돈다 */
function rotateSelected(deg) {
  const fs = selectedFurniture();
  if (!fs.length || furnitureLocked()) return;
  checkpoint();
  const b = G.boundsOf(fs.map((f) => ({ x: f.x, y: f.y })));
  const cx = b.minX + b.w / 2, cy = b.minY + b.h / 2;
  for (const f of fs) {
    if (fs.length > 1) {
      const p = G.rotatePt(f.x - cx, f.y - cy, deg * G.DEG);
      f.x = Math.round(cx + p.x); f.y = Math.round(cy + p.y);
    }
    f.rot = G.normDeg(f.rot + deg);
  }
  emit('furniture');
}

/** 고른 가구를 300mm 옆에 복제하고, 복제본을 고른다 */
function duplicateSelected() {
  const fs = selectedFurniture();
  if (!fs.length || furnitureLocked()) return;
  checkpoint();
  const copies = fs.map((f) => ({ ...f, id: uid('f'), x: f.x + 300, y: f.y + 300 }));
  state.furniture.push(...copies);
  emit('furniture');
  selectFurniture(copies.map((c) => c.id));
  if (copies.length > 1) status(`가구 ${copies.length}개를 복제했습니다. 복제본이 선택되어 있으니 끌어서 옮기세요.`);
}

function moveSelected(dx, dy) {
  const fs = selectedFurniture();
  if (!fs.length || furnitureLocked()) return;
  checkpoint();
  for (const f of fs) { f.x += dx; f.y += dy; }
  emit('furniture');
}

function deleteSelected() {
  const sel = ui.selection;
  if (!sel || (sel.kind === 'furniture' && furnitureLocked())) return;
  checkpoint();
  if (sel.ids) removeFurniture(sel.ids);
  else removeItem(sel.kind, sel.id);
}

/* ---------- 둘러보기 ---------- */
let viewBeforeTour = null;
const currentViewMode = () => document.querySelector('#view-mode button.active')?.dataset.view || 'split';

$('btn-tour').addEventListener('click', () => startTour());

/**
 * 자동 문을 다시 찾는다(도면 이미지의 문 기호). 직접 단 문(auto: false)은 그대로 두고, 예전 자동 문 가운데
 * 지금 찾은 자리에 없는 것은 뺀다. 같은 자리의 자동 문은 새로 찾은 경첩·여는 쪽으로 바꾼다.
 * 사용자가 지운 자리(plan.doorsRemoved)에는 기호가 있어도 다시 달지 않는다.
 * state는 바꾸지 않고 { doors(새 목록), added, removed, skipped }를 돌려준다. 이미지가 없으면 지금 그대로다.
 */
async function autoDoors() {
  const plan = state.plan;
  if (!plan.image) return { doors: plan.doors, added: 0, removed: 0, skipped: 0 };
  const mid = (d) => ({ x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 });
  const all = findDoors(plan, await planImageData());
  const found = all.filter((f) => !plan.doorsRemoved.some((r) => G.dist(mid(f), r) < 300));
  const near = (a, b) => G.dist(mid(a), mid(b)) < 150;
  const manual = plan.doors.filter((d) => d.auto === false);
  const fresh = found.filter((f) => !manual.some((d) => near(f, d)));
  const doors = manual.concat(fresh.map((f) => ({ id: plan.doors.find((d) => d.auto !== false && near(f, d))?.id || uid('d'), ...f, auto: true })));
  const before = plan.doors.filter((d) => d.auto !== false);
  return {
    doors,
    added: fresh.filter((f) => !before.some((d) => near(f, d))).length,
    removed: before.filter((d) => !fresh.some((f) => near(f, d))).length,
    skipped: all.length - found.length,
  };
}

/** '문 기호 찾아 문 달기' 버튼 */
async function placeDoors() {
  if (!state.plan.image) { status('도면 이미지가 있어야 문 기호를 찾을 수 있습니다. 🚪 문 도구로 틈을 눌러 직접 달 수 있습니다.'); return; }
  if (!state.plan.walls.length) { status('벽을 먼저 인식해 주세요. 문은 벽이 끊긴 틈에 답니다.'); return; }
  const r = await autoDoors();
  checkpoint();
  state.plan.doors = r.doors;
  emit('plan');
  status(r.doors.length
    ? `문 ${r.doors.length}개를 달았습니다${r.added || r.removed ? ` (새로 ${r.added}개, 뺀 것 ${r.removed}개)` : ''}.${r.skipped ? ` 지운 문 ${r.skipped}개는 다시 달지 않았습니다(🚪 문 도구로 다시 달 수 있습니다).` : ''} 문을 눌러 경첩·여는 쪽을 바꾸거나 지울 수 있습니다.`
    : '문 기호를 찾지 못했습니다. 🚪 문 도구로 틈을 눌러 직접 달아 주세요.');
}
$('btn-doors').addEventListener('click', () => placeDoors());

/** 현관 중문: 현관문 안쪽 틈에 유리 3연동 중문을 단다. 그 틈에 문이 이미 있으면 중문으로 바꾼다 */
function placeMiddleDoor() {
  const plan = state.plan;
  if (!plan.entrance) { status('현관문 자리를 먼저 정해 주세요. 🚶 둘러보기를 누르면 2D 도면에서 현관문 자리를 고를 수 있습니다.'); return; }
  const g = findMiddleDoorGap(plan);
  if (!g) { status('현관 안쪽에서 중문을 달 틈을 찾지 못했습니다. 🚪 문 도구로 그 틈에 문을 달고, 속성에서 ‘중문’을 고르세요.'); return; }
  const mid = (d) => ({ x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 });
  const old = plan.doors.find((d) => G.dist(mid(d), mid(g)) < 150);
  checkpoint();
  let door;
  if (old) door = Object.assign(old, { a: g.a, b: g.b, swing: g.swing, style: 'middle', auto: false });
  else {
    plan.doorsRemoved = plan.doorsRemoved.filter((r) => G.dist(r, mid(g)) >= 300);
    door = { id: uid('d'), ...g, style: 'middle', auto: false };
    plan.doors.push(door);
  }
  emit('plan');
  select({ kind: 'door', id: door.id });
  status(`현관 중문을 달았습니다 (폭 ${fmtMM(G.dist(g.a, g.b))}mm${old ? ', 있던 문을 중문으로 바꿈' : ''}). 속성에서 여는 방향·붙는 벽 면을 바꿀 수 있습니다.`);
}
$('btn-middle-door').addEventListener('click', () => placeMiddleDoor());

/** 문 목록이 없던 예전 프로젝트·저장본을 열면 문 기호를 한 번 찾아 단다 (되돌리기 기록은 남기지 않는다) */
/**
 * 배치 금지 구역(plan.blocked)이 없는 예전 프로젝트·저장본을 열면 도면 그림의 빗금(샤프트 등)을 한 번 찾아 넣는다.
 * 되돌리기 기록은 남기지 않는다(문 찾기와 같이 '열면서 채우는' 것).
 */
async function blockedForOldProject(data) {
  if (!data?.plan || data.plan.blocked !== undefined || !state.plan.image) return;
  const img = await planImageData(), k = state.plan.mmPerPx;
  const zones = findHatchRects(img).map((r, i) => ({
    id: uid('z'), pts: [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => ({ x: x * k, y: y * k })),
  }));
  state.plan.blocked = zones;
  if (!zones.length) return;
  emit('plan', 'furniture');   // 가구 겹침 표시도 다시
  const bad = G.findCollisions(state.furniture, state.plan.walls, state.plan.blocked).size;
  status(`도면의 빗금 칸(샤프트 등) ${zones.length}곳을 가구 배치 금지 구역으로 표시했습니다.${bad ? ` 벽·빗금 구역·다른 가구와 겹치는 가구 ${bad}개는 빨갛게 보입니다.` : ''}`);
}

async function doorsForOldProject(data) {
  if (!data?.plan || data.plan.doors !== undefined || !state.plan.image || !state.plan.walls.length) return;
  const r = await autoDoors();
  if (!r.doors.length) return;
  state.plan.doors = r.doors;
  emit('plan');
  status(`도면의 문 기호를 찾아 문 ${r.doors.length}개를 달았습니다.`);
}

/**
 * 자동 창을 다시 찾는다. 직접 낸 창(auto: false)은 그대로 두고, 예전 자동 창 가운데 지금 찾은 자리에 없는 것은 뺀다.
 * state는 바꾸지 않고 { windows(새 목록), added, removed }를 돌려준다.
 */
async function autoWindows() {
  const plan = state.plan;
  const found = findWindows(plan, plan.image ? await planImageData() : null);
  const near = (c, w) => G.distToSegment({ x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 }, w.a, w.b).dist < 150;
  const keep = plan.windows.filter((w) => w.auto === false || found.some((f) => near(f, w)));
  const add = found.filter((f) => !keep.some((w) => near(f, w)))
    .map((g) => ({ id: uid('n'), ...g, ...windowDefaults(G.dist(g.a, g.b)), auto: true }));
  return { windows: keep.concat(add), added: add.length, removed: plan.windows.length - keep.length };
}

/**
 * 둘러보기 중에는 편집 화면을 잠근다 — 왼쪽·속성 패널, 도면 이름·되돌리기·다시 하기·새 프로젝트, 보기 막대(2D·3D·전체 화면·카메라·벽 설정).
 * 둘러보기와 편집을 나누려는 것이다(저장·캡처·공지는 그대로). inert라 누르기·Tab 이동이 모두 막히고, 나가면(onExit) 푼다.
 */
const TOUR_LOCK = ['.sidebar', '#props', '#plan-name', '#btn-undo', '#btn-redo', '#btn-new', '.stage-bar'];
function lockForTour(on) {
  document.body.classList.toggle('touring', on);
  $('tour-lock').hidden = !on;
  for (const sel of TOUR_LOCK) document.querySelectorAll(sel).forEach((el) => { el.inert = on; });
}

let tourStarting = false;
async function startTour() {
  if (view.tour || tourStarting) return;
  if (!state.plan.walls.length) { status('벽이 있어야 둘러볼 수 있습니다. ① 도면에서 벽을 먼저 세워 주세요.'); return; }
  if (!state.plan.entrance) { pickEntrance(); return; }
  // 창 자리(도면 이미지에서 벽 위의 연한 구간, 바깥벽의 틈)에 창을 낸다 (되돌리기로 뺄 수 있다)
  const plan = state.plan;
  tourStarting = true;
  let win;
  let doors;
  try { win = await autoWindows(); doors = await autoDoors(); } finally { tourStarting = false; }
  // 현관 신발장, 욕실·주방 이름이 붙은 방의 변기·세면대·욕조·싱크대가 없으면 놓는다. 창 자리는 벽으로 친다
  // 보호 중인 안에는 설비를 더하지 않는다
  const fixtures = currentLayout().locked ? [] : autoFixtures({ ...plan, walls: plan.walls.concat(win.windows) }, state.furniture, uid);
  if (win.added || win.removed || doors.added || doors.removed || fixtures.length) {
    checkpoint();
    plan.windows = win.windows;
    plan.doors = doors.doors;
    state.furniture.push(...fixtures);
    emit('plan', 'furniture');
  }
  viewBeforeTour = currentViewMode();
  setViewMode('3d');
  editor.setTool('select');
  const names = [...new Set(fixtures.map((f) => f.name)), ...(win.added ? [`창 ${win.added}개`] : []), ...(doors.added ? [`문 ${doors.added}개`] : [])].join('·');
  const hint = hasFixtureRooms(state.plan) ? '' : " 방 영역에 '욕실'·'주방' 이름을 붙이면 변기·세면대·욕조·싱크대도 자동으로 놓입니다.";
  status((names
    ? `${names}을(를) 자동으로 놓았습니다 (옮기거나 지울 수 있고, 되돌리기도 됩니다). Esc로 나갑니다.`
    : `둘러보기 중 (${plan.floor}층) — Esc로 나갑니다.`) + (win.removed ? ` 잘못 잡혔던 창 ${win.removed}개를 뺐습니다.` : '') + hint);
  lockForTour(true);
  view.startTour({
    onExit: () => {
      lockForTour(false);
      if (viewBeforeTour) setViewMode(viewBeforeTour);
      viewBeforeTour = null;
      status('둘러보기를 마쳤습니다.');
    },
    onRepick: () => pickEntrance(),
  });
}

/** 2D 도면에서 현관문 자리를 고르게 한다 */
function pickEntrance() {
  if (currentViewMode() === '3d') setViewMode('split');
  editor.setTool('entrance');
}

function setEntrance(p) {
  const gap = G.findDoorGap(p, state.plan.walls);
  if (!gap) {
    status('근처에서 문 틈을 찾지 못했습니다. 벽이 끊긴 현관문 자리를 눌러 주세요. (벽 인식이 문 자리까지 막았다면 🧽 지우기로 틈을 내 주세요)');
    return;
  }
  checkpoint();
  state.plan.entrance = gap;
  emit('plan');
  editor.setTool('select');
  status(`현관문을 정했습니다 (폭 ${fmtMM(G.dist(gap.a, gap.b))}mm). 둘러보기를 시작합니다.`);
  startTour();
}

/* ---------- 상단 버튼 ---------- */
$('btn-undo').addEventListener('click', () => undo());
$('btn-redo').addEventListener('click', () => redo());
$('btn-new').addEventListener('click', () => {
  if (!confirm('도면과 배치한 가구를 모두 지우고 새로 시작할까요? (내 가구 목록은 남습니다)')) return;
  resetProject();
  editor.fit();
  view.resetCamera('persp');
});
$('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(serialize())], { type: 'application/json' });
  const name = fileSafe(state.plan.name);
  download(URL.createObjectURL(blob), `ohmyhome-${name ? `${name}-` : ''}${today()}.json`);
});
/** 파일 이름에 넣을 수 있게: 쓸 수 없는 글자·빈칸이 이어진 곳은 _ 하나로 */
function fileSafe(s) {
  return String(s || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, '_').replace(/^[._]+|_+$/g, '').slice(0, 60);
}
/** 이름이 없는 도면 파일은 파일 이름에서 짐작한다 — ohmyhome-{이름}-{날짜}.json · {이름}.ohmyhome.json */
function nameFromFile(fileName) {
  return planNameOr(fileName.replace(/\.json$/i, '').replace(/\.ohmyhome$/i, '').replace(/^ohmyhome-?/i, '').replace(/-?\d{4}-\d{2}-\d{2}$/, '').replace(/_/g, ' ').trim());
}
/**
 * 날짜뿐인 이름(2026-11-08 · 2026.11.08 · 20261108 · 2026-11-08 (1) 등 — 받은 파일 이름에서 온 것)이나 빈 이름은 기본 이름 NewHome으로.
 * 날짜는 연도 19xx·20xx + 월 1~12 + 일 1~31일 때만 본다 — 동·호수(5206-1401) 같은 숫자 이름은 그대로 둔다.
 */
const DEFAULT_PLAN_NAME = 'NewHome';
const DATE_ONLY = /^(19|20)\d{2}[-./_ ]?(0?[1-9]|1[0-2])[-./_ ]?(0?[1-9]|[12]\d|3[01])(\s*\(\d+\)|[-_ ]\d{1,2})?$/;
function planNameOr(name) {
  const s = String(name ?? '').trim();
  return s && !DATE_ONLY.test(s) ? s : DEFAULT_PLAN_NAME;
}
/** 도면 이름 입력칸 — 상단 되돌리기 왼쪽. 바꾸면(Enter·다른 곳 누르기) 되돌리기 기록을 남기고 저장한다 */
function renderPlanName() {
  const el = $('plan-name');
  if (el !== document.activeElement) el.value = state.plan.name || '';
  document.title = state.plan.name ? `${state.plan.name} — OhMyHome` : 'OhMyHome';
}
$('plan-name').addEventListener('change', (e) => {
  let v = e.target.value.trim();
  if (v) v = planNameOr(v);   // 날짜만 넣으면 NewHome (지우면 이름 없음)
  e.target.value = v;
  if (v === (state.plan.name || '')) return;
  checkpoint();
  state.plan.name = v;
  emit('plan');
  status(v ? `도면 이름을 ‘${v}’(으)로 바꿨습니다. 저장(.json) 파일 이름에 들어갑니다.` : '도면 이름을 지웠습니다.');
});
$('plan-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur();
  if (e.key === 'Escape') { e.target.value = state.plan.name || ''; e.target.blur(); }
});
/** 프로젝트 json(파일·샘플)을 연다. name: 파일에 도면 이름이 없을 때 쓸 이름 */
function openProject(data, msg = '도면을 불러왔습니다.', name = '') {
  if (data?.plan) data.plan.name = data.plan.name ? planNameOr(data.plan.name) : name;   // 파일 안 이름이 날짜뿐이면 NewHome
  loadProject(data);
  $('wall-height').value = state.plan.wallHeight;
  $('floor-num').value = state.plan.floor;
  editor.fit();
  view.resetCamera('persp');
  status(msg);
  doorsForOldProject(data);
  blockedForOldProject(data);
}
$('file-project').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    openProject(JSON.parse(await file.text()), undefined, nameFromFile(file.name));
  } catch (err) {
    alert(`불러오지 못했습니다: ${err.message}`);
  }
});
// 위례자이더파크 불러오기 — sample 폴더의 도면을 팝업에서 골라 연다.
// 정적 서버(GitHub Pages 등)는 폴더 목록을 주지 않으므로 파일 이름을 여기 적어 둔다. file은 sample/ 아래 경로 — 분양 도면 plan/, 실측 도면 real/
// (그림은 png/·real/에 있고 앱은 쓰지 않는다). sample에 json을 더하면 여기에도 더한다
const XI_PARK_SAMPLES = [
  { file: 'plan/55A1_plan.ohmyhome.json', name: '55㎡ A-1형' },
  // sheet: 그 형의 실측 기록지 PDF(있는 형만) — 고르는 창에 내려받기 링크를 단다
  { file: 'real/55A1-real_plan.ohmyhome.json', name: '55㎡ A-1형 실측 (A1-real)', sheet: 'measure/55A1_measured.pdf' },
  { file: 'plan/55A2_plan.ohmyhome.json', name: '55㎡ A-2형' },
  { file: 'real/55A2-real_plan.ohmyhome.json', name: '55㎡ A-2형 실측 (A2-real)', sheet: 'measure/55A2_measured.pdf' },
  { file: 'plan/55B1_plan.ohmyhome.json', name: '55㎡ B-1형' },
  { file: 'plan/55B2_plan.ohmyhome.json', name: '55㎡ B-2형' },
  { file: 'plan/55C_plan.ohmyhome.json', name: '55㎡ C형' },
  { file: 'plan/55D_plan.ohmyhome.json', name: '55㎡ D형' },
];
$('sample-list').innerHTML = XI_PARK_SAMPLES.map((s, i) => `<label><input type="radio" name="xi-sample" value="${i}"${i ? '' : ' checked'}>`
  + `<span>${s.name}</span><small>${s.file.split('/').pop()}</small>`
  + (s.sheet ? `<a class="sample-sheet" href="${s.sheet}" download="${s.sheet.split('/').pop()}" title="현장 실측 치수를 적은 기록지(PDF)를 내려받습니다">📄 실측 기록지</a>` : '')
  + '</label>').join('');
// 실측 기록지 링크를 눌러도 그 줄이 골라지거나(라벨) 두 번 눌림으로 도면이 열리지 않게
$('sample-list').addEventListener('click', (e) => { if (e.target.closest('.sample-sheet')) e.stopPropagation(); }, true);
$('btn-xi-park').addEventListener('click', () => $('sample-dialog').showModal());
$('sample-list').addEventListener('dblclick', (e) => { if (e.target.closest('label') && !e.target.closest('.sample-sheet')) $('btn-sample-load').click(); });
$('sample-dialog').addEventListener('close', async () => {
  const dlg = $('sample-dialog');
  if (dlg.returnValue !== 'load') return;
  dlg.returnValue = '';
  const s = XI_PARK_SAMPLES[+dlg.querySelector('input[name="xi-sample"]:checked').value];
  status(`${s.name} 도면을 여는 중…`);
  try {
    const res = await fetch(`sample/${s.file}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`sample/${s.file}을 찾지 못했습니다 (${res.status})`);
    const data = await res.json();
    if (data?.plan) data.plan.name = s.name;   // 위례자이더파크 창에서 고른 이름으로
    openProject(data, `위례자이더파크 ${s.name} 도면을 불러왔습니다.`);
  } catch (err) {
    status('');
    alert(`불러오지 못했습니다: ${err.message}`);
  }
});
// 도면만 바꾸기 — 같은 집 도면이 조금 고쳐졌을 때. 한 번 경고하고, 가구·배치 안은 그대로 둔 채 도면만 바꾼다
$('btn-plan-only').addEventListener('click', () => {
  if (!confirm('도면만 바꿉니다.\n\n벽·방·창·문·도면 그림이 고른 파일의 것으로 바뀌고, 배치한 가구(기본 포함 가구도)는 지금 자리 그대로 남습니다.\n'
    + '같은 집 도면이 조금 고쳐진 경우에만 쓰세요. 다른 집 도면이면 가구가 엉뚱한 자리에 놓입니다.\n\n계속할까요?')) return;
  $('file-plan-only').click();
});
$('file-plan-only').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data?.plan) data.plan.name = data.plan.name ? planNameOr(data.plan.name) : nameFromFile(file.name);
    replacePlan(data);
    // 그 도면의 기본 싱크대(ㄱ자 등)를 싱크대가 없는 안마다 바로 놓는다 (보호 중인 안은 빼고, 되돌리기 한 번에 함께 돌아온다)
    const sinkIn = [];
    for (const l of state.layouts) {
      if (l.locked) continue;
      const fs = layoutFurniture(l.id), add = missingPlanSinks(state.plan, fs, uid);
      if (add.length) { fs.push(...add); sinkIn.push(l.name); }
    }
    if (sinkIn.length) emit('furniture');
    $('wall-height').value = state.plan.wallHeight;
    editor.fit();
    view.resetCamera('persp');
    const bad = G.findCollisions(state.furniture, state.plan.walls, state.plan.blocked).size;
    const sinkMsg = sinkIn.length ? ` 싱크대가 없던 ${state.layouts.length > 1 ? `${sinkIn.join('·')}에` : '배치에'} 이 도면의 기본 싱크대를 놓았습니다.` : '';
    status(`도면만 바꿨습니다. 가구 배치는 그대로입니다.${sinkMsg}${bad ? ` 벽·빗금 구역·다른 가구와 겹치는 가구 ${bad}개는 빨갛게 보입니다.` : ''} 되돌리기(Ctrl+Z)로 예전 도면으로 돌아갈 수 있습니다.`);
    doorsForOldProject(data);
    blockedForOldProject(data);
  } catch (err) {
    alert(`도면을 바꾸지 못했습니다: ${err.message}`);
  }
});
/* ---------- 캡처 → PDF ---------- */
// 그림은 A4 비율로 찍어 PDF 쪽을 꽉 채운다 (가로로 긴 집은 가로 A4, 세로로 긴 집은 세로 A4)
const A4_LAND = [1980, 1400], A4_PORT = [1400, 1980];
const a4For = (b) => (b && b.h > b.w * 1.05 ? A4_PORT : A4_LAND);
function savePdf(shots, name) {
  const pages = shots.map((s) => ({ jpeg: dataURLBytes(s.url), width: s.width, height: s.height }));
  const url = URL.createObjectURL(new Blob([makePdf(pages)], { type: 'application/pdf' }));
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('btn-capture').addEventListener('click', () => {
  const opt = { type: 'image/jpeg', quality: 0.9 };
  if (view.tour) {   // 둘러보기 중: 1인칭 화면 그대로 한 쪽
    savePdf(view.captureShots([{ name: '' }], ...A4_LAND, opt), `ohmyhome-3d-${layoutTag()}${today()}.pdf`);
    status('지금 둘러보기 화면을 PDF로 저장했습니다.');
    return;
  }
  // 전체(바닥 도면 그림 그대로) 위·왼쪽·오른쪽 + 집만(바닥 도면 그림을 빼고) 위·왼쪽·오른쪽
  const top = SHOTS[0], [tw, th] = a4For(editor.houseBounds());
  const shots = (floorImage) => view.captureShots(SHOTS.map((s) => (s === top ? { ...s, W: tw, H: th } : s)), ...A4_LAND, { ...opt, floorImage });
  savePdf([...shots(undefined), ...shots(false)], `ohmyhome-3d-${layoutTag()}${today()}.pdf`);
  status('3D를 PDF로 저장했습니다: 위 · 왼쪽 비스듬히 · 오른쪽 비스듬히 (전체 3쪽 + 바닥 도면 그림을 뺀 집만 3쪽).');
});
$('btn-capture-2d').addEventListener('click', () => {
  const opt = { type: 'image/jpeg', quality: 0.9 };
  const page = (house) => {
    const [w, h] = a4For(house ? editor.houseBounds() : editor.contentBounds());
    return { url: editor.capture(w, h, 2, { ...opt, house }), width: w * 2, height: h * 2 };
  };
  savePdf([page(false), page(true)], `ohmyhome-2d-${layoutTag()}${today()}.pdf`);
  status('2D 도면을 PDF로 저장했습니다: 도면 전체 1쪽 + 제목·설명·바깥 치수를 뺀 집 부분만 크게 1쪽.');
});

function download(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function today() { return new Date().toISOString().slice(0, 10); }

/* ---------- 단축키 ---------- */
window.addEventListener('keydown', (e) => {
  if (view.tour || isTyping() || document.querySelector('dialog[open]')) return;   // 둘러보기 중 키는 tour.js가 받는다, 팝업 중에도 쉰다
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && key === 'y') { e.preventDefault(); redo(); return; }
  if (mod && key === 'd') { e.preventDefault(); duplicateSelected(); return; }
  if (mod && key === 'a') { e.preventDefault(); selectFurniture(state.furniture.map((f) => f.id)); return; }
  if (mod) return;
  const sel = ui.selection;
  if (e.key === 'Escape') {
    // 그리던 것 취소 → 그리기 도구 끄기 → 선택 해제 순서
    if (editor.cancel()) return;
    if (editor.tool !== 'select') editor.setTool('select');
    else if (sel) select(null);
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSelected(); return; }
  if (sel?.kind === 'furniture') {
    if (key === 'r') { rotateSelected(e.shiftKey ? -90 : 90); return; }
    if (key === 'q' && !sel.ids) { rotateSelected(-15); return; }
    if (key === 'e' && !sel.ids) { rotateSelected(15); return; }
    const step = e.shiftKey ? 100 : 10;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) {
      e.preventDefault();
      moveSelected(mv[0], mv[1]);
      return;
    }
  }
  const tools = { v: 'select', w: 'wall', a: 'room', m: 'measure', n: 'window', d: 'door', x: 'erase' };
  if (tools[key]) { editor.setTool(tools[key]); return; }
  if (key === 'f') editor.fit();
});

/* ---------- 연결 ---------- */
on('plan', () => {
  renderScaleInfo(); renderPlanInfo(); renderPlaced(); renderLayouts(); refreshOrRender(); renderPlanName();
  // 되돌리기·새 도면·불러오기 뒤에도 입력칸이 상태를 따라가게 (입력 중인 칸은 건드리지 않는다)
  for (const [id, v] of [['wall-height', state.plan.wallHeight], ['floor-num', state.plan.floor]]) {
    if ($(id) !== document.activeElement) $(id).value = v;
  }
});
on('furniture', () => { renderPlaced(); renderLayouts(); refreshOrRender(); });
on('layouts', renderLayouts);
on('selection', () => {
  renderPlaced();
  renderProps();
  if (ui.selection?.kind === 'furniture') {
    showTab('furniture');
    endDrawTool();   // 목록·3D·샘플 가구·Ctrl+A로 가구를 골랐을 때
  }
});
on('library', renderLibrary);

function selKey(sel) { return sel && `${sel.kind}:${sel.id}:${sel.ids?.join(',') || ''}`; }

function refreshOrRender() {
  const key = selKey(ui.selection);
  if (key && key === propsFor && findSelected()) refreshProps(); else renderProps();
}

renderCatalog();
renderLibrary();
renderScaleInfo();
renderPlanInfo();
renderPlanName();
renderPlaced();
renderLayouts();
// 예전에 날짜만 들어간 도면 이름(파일 이름에서 짐작한 것)은 NewHome으로
if (state.plan.name && planNameOr(state.plan.name) !== state.plan.name) { state.plan.name = planNameOr(state.plan.name); renderPlanName(); }
if (restored) {
  status(fromServer
    ? '지난번 작업을 불러왔습니다. (프로젝트 폴더의 ohmyhome-project.json에 자동 저장 — localhost·IP 어느 주소로 열어도 같습니다)'
    : `지난번 작업을 불러왔습니다. (${savesToServer() ? '이제 프로젝트 폴더의 ohmyhome-project.json에도' : '브라우저에'} 자동 저장됩니다)`);
  doorsForOldProject(restored);
  blockedForOldProject(restored);
  // 브라우저 저장소에만 있던 작업이면 바로 프로젝트 폴더에도 써 둔다 (다른 주소에서도 보이게)
  if (!fromServer && savesToServer()) saveNow();
}
else status('📂 ‘도면 불러오기(json)’로 저장한 도면을 열거나 ‘샘플 도면으로 해 보기’를 눌러 시작하세요.');

// 개발·점검용
window.__ohmyhome = { state, editor, view, runDetect };

/* ---------- 공지사항 — 처음 접속할 때. '다시 보지 않기'에 체크해 두면 이 브라우저에서는 저절로 띄우지 않는다(체크를 풀면 다시 뜬다) ---------- */
// 공지 내용이 바뀌면 NOTICE_VER를 올리고 NOTICE_DATE를 바꾼 날로 고친다 — 예전 공지를 '다시 보지 않기' 한 사람에게도 새 공지는 한 번 뜨고,
// 상단 '📢 공지사항' 버튼에 그날부터 NOTICE_NEW_DAYS일 동안 NEW가 붙는다 — 이 PC(브라우저)에서 이 공지를 한 번 읽으면(창을 닫으면) 지운다
const NOTICE_KEY = 'ohmyhome.notice.hidden', NOTICE_READ_KEY = 'ohmyhome.notice.read';
const NOTICE_VER = '3', NOTICE_DATE = '2026-11-08', NOTICE_NEW_DAYS = 7;
/** 공지가 바뀐 지 NOTICE_NEW_DAYS일이 안 지났는가 (바뀐 날 0시부터, 이 PC 시각 기준) */
function noticeIsNew(now = new Date()) {
  const [y, m, d] = NOTICE_DATE.split('-').map(Number);
  const from = new Date(y, m - 1, d), until = new Date(y, m - 1, d + NOTICE_NEW_DAYS);
  return now >= from && now < until;
}
/** 이 브라우저에서 지금 공지(NOTICE_VER)를 읽은 적이 있는가 — 공지가 바뀌면 버전이 달라 다시 안 읽은 것이 된다 */
function noticeRead() { try { return localStorage.getItem(NOTICE_READ_KEY) === NOTICE_VER; } catch { return false; } }
function updateNoticeBadge() { document.querySelector('#btn-notice .new-badge').hidden = !noticeIsNew() || noticeRead(); }
updateNoticeBadge();
$('btn-notice').addEventListener('click', () => {
  const dlg = $('notice-dialog');
  if (dlg.open) return;
  dlg.returnValue = '';   // 지난번 닫을 때의 값('real' 등)이 남지 않게
  showNotice();
});
function noticeHidden() { try { return localStorage.getItem(NOTICE_KEY) === NOTICE_VER; } catch { return false; } }
/** 공지를 띄운다 — '다시 보지 않기' 체크는 지금 저장된 값으로 맞춘다 */
function showNotice() {
  $('notice-hide').checked = noticeHidden();
  $('notice-dialog').showModal();
}
// 체크하면 바로 남기고(닫기를 안 눌러도), 풀면 지워 다음 접속 때 다시 뜬다
$('notice-hide').addEventListener('change', (e) => {
  try { if (e.target.checked) localStorage.setItem(NOTICE_KEY, NOTICE_VER); else localStorage.removeItem(NOTICE_KEY); } catch { /* 저장소를 못 쓰면 다음에도 뜬다 */ }
});
$('notice-dialog').addEventListener('close', () => {
  // 처음 뜬 공지든 버튼으로 연 공지든, 닫으면 읽은 것으로 남기고 NEW를 지운다
  try { localStorage.setItem(NOTICE_READ_KEY, NOTICE_VER); } catch { /* 저장소를 못 쓰면 NEW가 남는다 */ }
  updateNoticeBadge();
  const v = $('notice-dialog').returnValue;
  const real = { real: '55A2-real', 'real-a1': '55A1-real' }[v];
  if (real) {   // 새 소식의 'A2-real · A1-real 고르러 가기': 위례자이더파크 목록을 그 실측 도면에 맞춰 연다
    const i = XI_PARK_SAMPLES.findIndex((s) => s.file.split('/').pop().startsWith(`${real}_`));
    const r = document.querySelector(`input[name="xi-sample"][value="${i}"]`);
    if (r) r.checked = true;
    $('sample-dialog').showModal();
  }
});
$('btn-features').addEventListener('click', () => $('features-dialog').showModal());   // 공지 위에 겹쳐 띄우고, 닫으면 공지로 돌아온다
if (!noticeHidden()) showNotice();
