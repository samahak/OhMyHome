// 화면 조립 — 왼쪽 패널·가운데 2D/3D·오른쪽 속성 패널과 단축키를 묶는다.
import {
  state, ui, on, emit, checkpoint, undo, redo, select, uid, removeItem, findSelected,
  selectFurniture, selectedFurnitureIds, isFurnitureSelected, toggleFurnitureSelection, removeFurniture,
  applyScaleRef, serialize, loadProject, loadSaved, resetProject, setSaveErrorHandler,
} from './store.js';
import * as G from './geometry.js';
import { CATALOG, SHAPES, SIZE_PRESETS, L_COUNTER, lCounterDepth, PLANTS, plantOf, iconFor, windowDefaults } from './catalog.js';
import { PlanEditor, fmtMM, isTyping } from './plan2d.js';
import { View3D, SHOTS } from './view3d.js';
import { makeXlsx, STYLE } from './xlsx.js';
import { detectWallRects, rectToWall } from './wallDetect.js';
import { drawSamplePlan } from './samplePlan.js';
import { initPhotoDialog } from './furniturePhoto.js';
import { autoFixtures, hasFixtureRooms } from './fixtures.js';
import { findWindows } from './windows.js';
import { findDoors } from './doors.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const PYEONG = 3.3058;
const UNSCALED_WIDTH_MM = 12000; // 축척을 모를 때 도면 가로를 이만큼으로 가정

function status(text) { $('status').textContent = text; }

const restored = loadSaved();
setSaveErrorHandler(() => status('⚠ 브라우저 저장 공간이 부족해 자동 저장하지 못했습니다. 상단 ‘저장(.json)’으로 파일에 보관하세요.'));

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
  if (b.dataset.tool === 'pick' && !state.plan.image) { status('먼저 도면 이미지를 여세요.'); return; }
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

/* ---------- 도면 불러오기 ---------- */
function readDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
function loadImg(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

$('file-plan').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    let src = await readDataURL(file);
    let im = await loadImg(src);
    // 저장 공간을 아끼려고 큰 도면은 줄인다 (벽 인식에는 충분한 크기)
    const k = Math.min(1, 2400 / Math.max(im.width, im.height));
    if (k < 1 || file.size > 1.5e6) {
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, 0, c.width, c.height);
      src = c.toDataURL('image/jpeg', 0.92);
      im = await loadImg(src);
    }
    setPlanImage({ src, width: im.width, height: im.height }, UNSCALED_WIDTH_MM / im.width, false);
    editor.setTool('scale');
    status('도면을 열었습니다. 먼저 기준 치수를 맞추세요: 도면의 치수선 하나(예: 거실 3.8m) 양 끝을 찍고 길이를 넣으면 됩니다.');
  } catch {
    alert('이미지를 읽지 못했습니다. PNG나 JPG 파일인지 확인해 주세요.');
  }
});

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
  if (!p.image) { status('먼저 도면 이미지를 여세요.'); return; }
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
  if (!p.image) { status('먼저 도면 이미지를 여세요.'); return; }
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
        if (!G.findCollisions([...state.furniture, probe], state.plan.walls).has('__probe')) return { x: probe.x, y: probe.y };
      }
    }
  }
  return { x: cx, y: cy };
}

function addFurniture(def, extra = {}) {
  const { x, y } = dropPoint(def);
  checkpoint();
  const f = {
    id: uid('f'), type: def.type, name: def.name, w: def.w, d: def.d, h: def.h,
    x, y, rot: 0, elev: def.elev || 0, color: def.color, libId: null, usePhoto: false, ...extra,
  };
  const preset = SIZE_PRESETS[def.type];
  if (preset && def[preset.key]) f[preset.key] = def[preset.key];
  if (def.plant) f.plant = def.plant;
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
/** 가격 합계: 기본 포함 가구(builtin, 집에 딸려 오는 것)는 더하지 않는다 */
const sumPrice = (fs) => fs.reduce((s, f) => s + (f.builtin ? 0 : f.price || 0), 0);

/** 합계 아래 안내 문장들: 기본 포함이라 제외한 가구 수 · 가격을 안 넣은 가구 수 */
function priceNotes(fs) {
  const builtin = fs.filter((f) => f.builtin).length, noPrice = fs.filter((f) => !f.builtin && f.price == null).length;
  return [
    builtin && `총 ${fs.length}개 중 기본 가구 ${builtin}개는 제외했습니다`,
    noPrice && `가격을 넣지 않은 가구 ${noPrice}개는 빼고 더했습니다`,
  ].filter(Boolean);
}

/** 배치된 가구 합계: 기본 포함 가구를 뺀 개수 · 가격 합계 (뺀 가구·가격 안 넣은 가구 수도 알린다) */
function renderPlacedTotal() {
  const fs = state.furniture, n = fs.filter((f) => !f.builtin).length;
  $('placed-total').hidden = $('placed-export').hidden = !fs.length;
  $('placed-total').innerHTML = fs.some((f) => f.price != null || f.builtin)
    ? `가구 ${n}개 · 합계 <b>${fmtWon(sumPrice(fs))}</b>${priceNotes(fs).map((s) => `<small>${s}</small>`).join('')}`
    : `가구 ${fs.length}개<small>가구를 골라 모델명·가격을 넣으면 여기에 합계가 나옵니다</small>`;
}

/**
 * 가구 목록 엑셀: 기본은 가격이 계산된 가구(기본 가구 아님 + 가격 있음)만 + 합계 줄.
 * all이면 기본 가구가 아닌 것을 모두(가격 없는 것도) 위에, 합계 줄 아래에 기본 가구를 따로 모은다.
 */
function furnitureSheet(all) {
  const fs = [...state.furniture].sort(byTypeThenName);
  const paid = fs.filter((f) => !f.builtin && (all || f.price != null)), builtin = all ? fs.filter((f) => f.builtin) : [];
  const H = (v) => ({ v, s: STYLE.header });
  const row = (f, i, muted) => [i + 1, SHAPES[f.type]?.label || f.type, f.name, f.model || '',
    f.price != null ? { v: f.price, s: muted ? STYLE.mutedWon : STYLE.won } : '', f.w, f.d, f.h, f.builtin ? '기본 포함' : '구매']
    .map((v) => (muted && typeof v !== 'object' ? { v, s: STYLE.muted } : v));
  const head = 4;   // 제목 · 요약 · 빈 줄 다음 줄이 머리글
  const rows = [
    [{ v: 'OhMyHome 가구 목록', s: STYLE.title }],
    [`${today()} · 가구 ${paid.length}개 · 합계 ${fmtWon(sumPrice(paid))}${all && builtin.length ? ` · 기본 가구 ${builtin.length}개는 합계에서 제외` : ''}`],
    [],
    ['번호', '종류', '이름', '모델명', '가격(원)', '가로(mm)', '깊이(mm)', '높이(mm)', '구분'].map(H),
    ...paid.map((f, i) => row(f, i)),
  ];
  const end = head + paid.length;
  rows.push(['', '', { v: '합계', s: STYLE.totalLabel }, { v: `${paid.length}개`, s: STYLE.totalLabel },
    { f: paid.length ? `SUM(E${head + 1}:E${end})` : '0', v: sumPrice(paid), s: STYLE.totalWon },
    ...Array(4).fill({ v: '', s: STYLE.totalLabel })]);
  if (builtin.length) {
    rows.push([], [{ v: `기본 포함 가구 ${builtin.length}개 (합계에서 제외)`, s: STYLE.section }], ...builtin.map((f, i) => row(f, i, true)));
  }
  return makeXlsx({ name: '가구 목록', cols: [6, 14, 22, 26, 14, 10, 10, 10, 10], rows, freeze: head });
}

$('btn-xlsx').addEventListener('click', () => {
  const all = $('xlsx-all').checked;
  if (!all && !state.furniture.some((f) => !f.builtin && f.price != null)) {
    status('가격이 계산된 가구가 없습니다. 가구에 가격을 넣거나 ‘모든 가구’를 켜고 다시 눌러 주세요.');
    return;
  }
  const blob = new Blob([furnitureSheet(all)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  download(url, `ohmyhome-가구-${today()}.xlsx`);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  status(all ? '모든 가구를 엑셀로 저장했습니다(가격이 계산된 가구 위, 기본 가구 아래).' : '가격이 계산된 가구를 엑셀로 저장했습니다.');
});

/** 목록·묶음 패널의 가격 표시: 기본 포함 가구는 '기본 포함' 꼬리표, 가격은 지운 줄로 */
const priceTag = (f) => f.builtin
  ? `<span class="price builtin">기본 포함${f.price != null ? ` <s>${fmtWon(f.price)}</s>` : ''}</span>`
  : f.price != null ? `<span class="price">${fmtWon(f.price)}</span>` : '';

/** 배치된 가구: 종류별로 묶고(제목 + 개수 + 소계), 같은 종류 안에서는 이름순 */
function renderPlaced() {
  renderPlacedTotal();
  const bad = G.findCollisions(state.furniture, state.plan.walls);
  const groups = new Map();
  for (const f of [...state.furniture].sort(byTypeThenName)) {
    if (!groups.has(f.type)) groups.set(f.type, []);
    groups.get(f.type).push(f);
  }
  $('placed-list').innerHTML = state.furniture.length
    ? [...groups].map(([type, fs]) => `
      <div class="placed-group">${iconFor(type)} ${esc(SHAPES[type]?.label || type)} <span class="n">${fs.length}</span>${fs.some((f) => !f.builtin && f.price != null) ? `<span class="sub">${fmtWon(sumPrice(fs))}</span>` : ''}</div>
      ${fs.map((f) => `
      <button data-id="${f.id}" class="${isFurnitureSelected(f.id) ? 'sel' : ''}">
        <span>${esc(f.name)}${bad.has(f.id) ? ' <span class="bad">⚠</span>' : ''}${f.model ? `<span class="model">${esc(f.model)}</span>` : ''}</span>
        ${priceTag(f) || `<span class="sz">${f.w}×${f.d}×${f.h}</span>`}
      </button>`).join('')}`).join('')
    : '<p class="empty">아직 놓은 가구가 없습니다.</p>';
  // Shift·Ctrl(⌘)+클릭: 선택에 더하거나 빼기
  $('placed-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
    endDrawTool();
    if (e.shiftKey || e.ctrlKey || e.metaKey) toggleFurnitureSelection(b.dataset.id);
    else select({ kind: 'furniture', id: b.dataset.id });
  }));
}

const photo = initPhotoDialog({
  status,
  onSave: (item, place) => {
    state.library.push(item);
    emit('library');
    if (place) placeLibrary(item.id);
    else status(`‘${item.name}’을(를) 내 가구에 저장했습니다. 눌러서 배치하세요.`);
  },
});
$('btn-photo').addEventListener('click', () => photo.open());

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
      <div class="warn" data-warn hidden>⚠ 고른 가구 가운데 벽이나 다른 가구와 겹치는 것이 있습니다.</div>
      <ul class="multi-list">${sel.ids.map((id) => state.furniture.find((f) => f.id === id))
        .sort(byTypeThenName).map((f) => `<li>${iconFor(f.type)} ${esc(f.name)} ${priceTag(f)}</li>`).join('')}</ul>
      ${(() => {
        const fs = sel.ids.map((id) => state.furniture.find((f) => f.id === id)), notes = priceNotes(fs);
        return fs.some((f) => f.price != null || f.builtin) ? `<div class="field"><span>고른 가구 가격 합계</span><b>${fmtWon(sumPrice(fs))}</b></div>${notes.length ? `<p class="hint">${notes.join('.<br>')}.</p>` : ''}` : '';
      })()}
      <div class="btns"><button data-act="builtin-on" title="집에 딸려 오는 가구로 표시해 가격 합계에서 뺍니다">기본 포함으로</button><button data-act="builtin-off">기본 포함 해제</button></div>
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
      <div class="warn" data-warn hidden>⚠ 벽이나 다른 가구와 겹칩니다.</div>
      <label class="field"><span>이름</span><input type="text" data-f="name"></label>
      <label class="field"><span>모델명</span><input type="text" data-f="model" placeholder="예: LG 오브제 M873"></label>
      <label class="field"><span>가격 (원)</span><input type="text" inputmode="numeric" data-f="price" placeholder="예: 1,290,000 · 129만"></label>
      <label class="check" title="집에 딸려 오는 가구(빌트인·옵션)는 가격 합계에서 뺍니다"><input type="checkbox" data-f="builtin"> 기본 포함 가구 (합계에서 빼기)</label>
      <label class="field"><span>샘플 모양</span><select data-f="type">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      ${obj.type === 'plant' ? `
      <label class="field"><span>식물 종류</span><select data-f="plant">${Object.entries(PLANTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      <div class="btns preset-btns">${Object.entries(PLANTS).map(([k, v]) => `<button data-plant="${k}">${v.label}</button>`).join('')}</div>` : ''}
      ${preset ? `
      <label class="field"><span>${preset.label}</span><input type="number" min="${preset.min}" max="${preset.max}" step="1" data-f="${preset.key}"></label>
      <div class="btns preset-btns">${preset.options.map((n) => `<button data-preset="${n}">${n}${preset.unit}</button>`).join('')}</div>` : ''}
      <label class="field"><span>${dims.w} (mm)</span><input type="number" min="10" step="10" data-f="w"></label>
      <label class="field"><span>${dims.d} (mm)</span><input type="number" min="10" step="10" data-f="d"></label>
      ${isL ? `
      <label class="field"><span>상판 깊이 (mm)</span><input type="number" min="${L_COUNTER.minDepth}" max="${L_COUNTER.maxDepth}" step="10" data-f="counterD"></label>
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
    el.innerHTML = `
      <h3><span>🚪 문</span><button data-act="close" class="icon">✕</button></h3>
      <div class="field"><span>종류</span><b>${obj.auto === false ? '직접 단 문' : '도면 기호에서 찾음'}</b></div>
      <div class="field"><span>문 폭</span><b>${fmtMM(G.dist(obj.a, obj.b))} mm</b></div>
      <div class="btns"><button data-act="hinge">⇋ 경첩 반대로</button><button data-act="swing">⇅ 여는 쪽 반대로</button></div>
      <div class="btns"><button data-act="del" class="danger">문 삭제</button></div>
      <p class="hint">3D에서는 문 위를 천장까지 벽으로 채우고, 문짝을 도면 기호처럼 90° 열어 둡니다.</p>`;
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
    const bad = G.findCollisions(state.furniture, state.plan.walls);
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
    if (k === 'plant') return plantOf(obj);
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
    el.querySelector('[data-warn]').hidden = !G.findCollisions(state.furniture, state.plan.walls).has(obj.id);
    const p = SIZE_PRESETS[obj.type];
    const cur = p && (obj[p.key] ?? p.guess(obj));
    el.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('active', +b.dataset.preset === cur));
    el.querySelectorAll('[data-plant]').forEach((b) => b.classList.toggle('active', b.dataset.plant === plantOf(obj)));
    const lside = el.querySelector('[data-v=lside]');
    if (lside) lside.textContent = obj.mirror ? '왼쪽 (앞에서 볼 때)' : '오른쪽 (앞에서 볼 때)';
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
  let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? +inp.value : inp.value;
  if (inp.type === 'number' && !isFinite(v)) return;
  if (k === 'plant') { applyPlant(obj, v); return; }
  if (k === 'price') {
    const won = parseWon(v);
    if (Number.isNaN(won)) { status(`‘${v}’를 가격으로 읽지 못했습니다. 예: 1,290,000 · 1290000원 · 129만`); refreshProps(); return; }
    checkpoint();
    if (won === null) delete obj.price; else obj.price = won;
    emit('furniture');
    return;
  }
  if (k === 'builtin') {
    checkpoint();
    if (v) obj.builtin = true; else delete obj.builtin;
    emit('furniture');
    return;
  }
  if (k === 'model') {
    checkpoint();
    const m = String(v).trim();
    if (m) obj.model = m; else delete obj.model;
    emit('furniture');
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
  }
  emit(sel.kind === 'furniture' ? 'furniture' : 'plan');
  if (k === 'type') renderProps();   // 모양마다 칸 이름·칸이 다르다 (ㄱ자 싱크대)
}

/** ㄱ자 싱크대: 상판 깊이는 정해진 범위에서, 가로·세로는 상판 깊이 + 최소 팔 길이보다 길게 (세로가 가로보다 길어도 된다) */
function clampKitchenL(obj, k, v) {
  const L = L_COUNTER;
  if (k === 'counterD') return Math.max(L.minDepth, Math.min(L.maxDepth, obj.w - L.minArm, obj.d - L.minArm, v));
  if (k === 'w' || k === 'd') {
    const min = lCounterDepth(obj) + L.minArm;
    if (v < min) status(`${k === 'w' ? '가로' : '세로'} 길이는 상판 깊이 + ${L.minArm}mm(${fmtMM(min)}mm) 이상이어야 합니다.`);
    return Math.max(min, v);
  }
  return v;
}

/**
 * 식물 종류를 바꾼다: 크기를 그 종류의 기본값으로 맞추고, 이름이 종류 이름(또는 '식물')이었으면 이름도 바꾼다.
 * 자리·화분 색·모델명·가격은 그대로 둔다.
 */
function applyPlant(obj, key) {
  const p = PLANTS[key];
  if (!obj || obj.type !== 'plant' || !p) return;
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
  if (!p) return;
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
  if (!obj) return;
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
  if (!fs.length) return;
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
  if (!fs.length) return;
  checkpoint();
  const copies = fs.map((f) => ({ ...f, id: uid('f'), x: f.x + 300, y: f.y + 300 }));
  state.furniture.push(...copies);
  emit('furniture');
  selectFurniture(copies.map((c) => c.id));
  if (copies.length > 1) status(`가구 ${copies.length}개를 복제했습니다. 복제본이 선택되어 있으니 끌어서 옮기세요.`);
}

function moveSelected(dx, dy) {
  const fs = selectedFurniture();
  if (!fs.length) return;
  checkpoint();
  for (const f of fs) { f.x += dx; f.y += dy; }
  emit('furniture');
}

function deleteSelected() {
  const sel = ui.selection;
  if (!sel) return;
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

/** 문 목록이 없던 예전 프로젝트·저장본을 열면 문 기호를 한 번 찾아 단다 (되돌리기 기록은 남기지 않는다) */
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
  const fixtures = autoFixtures({ ...plan, walls: plan.walls.concat(win.windows) }, state.furniture, uid);
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
  view.startTour({
    onExit: () => {
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
  download(URL.createObjectURL(blob), `ohmyhome-${today()}.json`);
});
$('file-project').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    loadProject(data);
    $('wall-height').value = state.plan.wallHeight;
    $('floor-num').value = state.plan.floor;
    editor.fit();
    view.resetCamera('persp');
    status('프로젝트를 불러왔습니다.');
    doorsForOldProject(data);
  } catch (err) {
    alert(`불러오지 못했습니다: ${err.message}`);
  }
});
$('btn-capture').addEventListener('click', () => {
  if (view.tour) { download(view.capture(), `ohmyhome-3d-${today()}.png`); return; }   // 둘러보기 중: 1인칭 화면 그대로
  // 위에서 · 왼쪽 비스듬히 · 오른쪽 비스듬히 세 장 (파일을 하나씩 내려받게 조금씩 띄운다)
  view.captureShots(SHOTS).forEach((s, i) => setTimeout(() => download(s.url, `ohmyhome-3d-${s.name}-${today()}.png`), i * 400));
  status('3D 그림 세 장(위에서 · 왼쪽 비스듬히 · 오른쪽 비스듬히)을 저장합니다. 브라우저가 여러 파일 받기를 물으면 허용해 주세요.');
});
$('btn-capture-2d').addEventListener('click', () => download(editor.capture(), `ohmyhome-2d-${today()}.png`));

function download(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function today() { return new Date().toISOString().slice(0, 10); }

/* ---------- 단축키 ---------- */
window.addEventListener('keydown', (e) => {
  if (view.tour || isTyping() || $('photo-dialog').open) return;   // 둘러보기 중 키는 tour.js가 받는다
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
  renderScaleInfo(); renderPlanInfo(); renderPlaced(); refreshOrRender();
  // 되돌리기·새 도면·불러오기 뒤에도 입력칸이 상태를 따라가게 (입력 중인 칸은 건드리지 않는다)
  for (const [id, v] of [['wall-height', state.plan.wallHeight], ['floor-num', state.plan.floor]]) {
    if ($(id) !== document.activeElement) $(id).value = v;
  }
});
on('furniture', () => { renderPlaced(); refreshOrRender(); });
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
renderPlaced();
if (restored) { status('지난번 작업을 불러왔습니다. (브라우저에 자동 저장됩니다)'); doorsForOldProject(restored); }
else status('📐 도면 이미지를 열거나 ‘샘플 도면으로 해 보기’를 눌러 시작하세요.');

// 개발·점검용
window.__ohmyhome = { state, editor, view, runDetect };
