// 앱 상태 한 곳. 2D·3D·패널은 여기 이벤트를 듣고 다시 그린다.
//   'plan'      도면(이미지·축척·벽·방·벽 높이)이 바뀜
//   'furniture' 배치된 가구가 바뀜
//   'library'   사진으로 만든 내 가구 목록이 바뀜
//   'layouts'   배치 안(1안·2안…) 목록·지금 안이 바뀜
//   'selection' 선택이 바뀜

import { counterUnder, rodSpan, ductReach } from './geometry.js';
import { PURIFIER, COUNTER_TOP, ROD_SPAN } from './catalog.js';

const STORAGE_KEY = 'ohmyhome.project.v1';
const HISTORY_LIMIT = 60;

export function freshState() {
  return {
    plan: {
      name: '',             // 도면 이름 — 상단 되돌리기 왼쪽에 보이고 고칠 수 있다. 저장 파일 이름(ohmyhome-{이름}-{날짜}.json)에 쓴다
      image: null,          // { src(dataURL), width, height } — 픽셀
      mmPerPx: 10,          // 이미지 1px이 몇 mm인지
      scaleSet: false,      // 사용자가 축척을 직접 맞췄는지
      scaleRef: null,       // 축척을 맞춘 기준 치수 { a, b, mm } — a·b는 도면 좌표(mm)
      entrance: null,       // 현관문 틈 { a, b, t, out:{x,y} } — 둘러보기의 출발점, out은 바깥 방향 단위벡터
      walls: [],            // { id, a:{x,y}, b:{x,y}, t, cap, auto }  (mm)
      rooms: [],            // { id, name, pts:[{x,y}], hidden? }      (mm) hidden: 이미지에 이미 그려진 방이라 색·이름표를 생략
      windows: [],          // { id, a, b, t, sill, h }  (mm) a–b: 벽 중심선 위 창 양 끝, sill: 바닥~창 아래, h: 창 높이
      doors: [],            // { id, a, b, t, swing, auto }  (mm) a: 경첩 끝, b: 반대 끝, swing: 문짝이 a→b 왼쪽 법선 쪽(1)/반대(-1) (doors.js)
      doorsRemoved: [],     // [{x,y}] 사용자가 지운 자동 문의 가운데 — 문 기호를 다시 찾아도 이 자리에는 달지 않는다
      wallHeight: 2300,
      floor: 10,            // 몇 층인지 — 둘러보기에서 창밖 땅 높이
      blocked: [],          // { id, pts:[{x,y}] } 가구 배치 금지 구역 — 도면의 빗금(샤프트 등). 가구가 겹치면 겹침으로 친다
      fixtures: [],         // 이 도면의 기본 싱크대(가구 꼴, id 없음) — 도면 파일의 '기본 포함' 주방 싱크대. 싱크대가 없는 주방에 이것부터 놓는다
    },
    furniture: [],          // { id, type, name, w, d, h, x, y, rot, elev, color, libId, usePhoto } — 지금 보고 있는 안의 가구
    library: [],            // { id, type, name, w, d, h, color, image(dataURL), usePhoto }
    // 배치 안: 안마다 가구 배치를 따로 둔다(도면·내 가구는 함께 쓴다). 지금 안의 가구는 state.furniture에 있고,
    // 그 안의 furniture 칸은 비워 둔다 — 안을 바꿀 때 서로 옮겨 담는다
    layouts: [{ id: 'L1', name: '1안', furniture: [] }],
    layoutId: 'L1',
  };
}

export const state = freshState();
// { kind: 'furniture'|'wall'|'room'|'window'|'door', id, ids? } — ids: 가구를 여러 개 고른 경우의 id 목록(2개 이상, id는 마지막에 고른 것)
export const ui = { selection: null };

const listeners = new Map();
export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
}
export function emit(...types) {
  if (types.includes('furniture') || types.includes('plan')) settleRods();
  if (types.includes('furniture')) settlePurifiers();
  for (const t of types) listeners.get(t)?.forEach((fn) => fn());
  if (types.some((t) => t !== 'selection')) scheduleSave();
}

/**
 * 정수기는 놓인 자리를 따른다: 가운데가 주방 싱크대 위면 소형(상판 높이에 올리고 싱크대 방향으로), 아니면 바닥에 선 대형.
 * 크기·띄움은 대형↔소형이 바뀔 때만 맞추고(그 뒤 사용자가 고친 크기는 둔다), 이름은 기본 이름일 때만 따라 바꾼다.
 * 가구를 옮기는 길이 여럿이라(끌기·방향키·속성 칸·되돌리기) 'furniture' 이벤트마다 여기서 한 번에 맞춘다.
 */
const PURIFIER_NAMES = new Set(['정수기', PURIFIER.large.name, PURIFIER.small.name]);
function settlePurifiers() {
  for (const f of state.furniture) {
    if (f.type !== 'water_purifier') continue;
    const c = counterUnder(f, state.furniture), kind = c ? 'small' : 'large', p = PURIFIER[kind];
    if (!!c !== !!f.onCounter) {
      Object.assign(f, { w: p.w, d: p.d, h: p.h, elev: c ? (c.elev || 0) + COUNTER_TOP : 0 });
      if (c) { f.onCounter = true; f.rot = c.rot; } else delete f.onCounter;
    }
    if (PURIFIER_NAMES.has(f.name)) f.name = p.name;
  }
}

/**
 * 전열교환기(erv)는 덕트 길이(ductL · ductR, 본체 양 끝에서 벽까지)를 여기서 함께 맞춘다.
 * 커튼 봉은 벽과 벽 사이에 건다: 가로를 직접 고친 것(manualW) 말고는 봉 방향 양쪽 벽까지 길이·가운데를 맞춘다.
 * 끌거나 돌리면 그 자리 벽 사이로 바로 늘고 줄어든다. 양쪽에 벽이 없으면(트인 곳) 그대로 둔다.
 */
function settleRods() {
  for (const f of state.furniture) {
    if (f.type === 'erv') {   // 전열교환기 덕트: 본체 양 끝에서 벽까지 (놓인 자리마다 다시 잰다)
      const d = ductReach(f, state.plan.walls);
      if (d.l != null) f.ductL = d.l; else delete f.ductL;
      if (d.r != null) f.ductR = d.r; else delete f.ductR;
      continue;
    }
    if (f.type !== 'curtain_rod' || f.manualW) continue;
    const s = rodSpan(f, state.plan.walls, ROD_SPAN);
    if (!s) continue;
    f.x = Math.round(s.x); f.y = Math.round(s.y); f.w = Math.round(s.w);
  }
}

let seq = Date.now() % 100000;
export function uid(prefix = 'i') {
  return `${prefix}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/* ---------- 되돌리기 ---------- */
// 이미지 dataURL은 커서 복사하지 않고 참조만 들고 있는다.
const past = [], future = [];
function snapshot() {
  return {
    image: state.plan.image,
    plan: JSON.stringify({ ...state.plan, image: null }),
    furniture: JSON.stringify(state.furniture),
    layouts: JSON.stringify({ list: state.layouts, id: state.layoutId }),
    library: state.library,   // 내 가구(사진 dataURL) — 배열을 통째로 바꿀 뿐 고치지 않으므로 참조만 든다
  };
}
function restore(s) {
  Object.assign(state.plan, JSON.parse(s.plan), { image: s.image });
  state.furniture = JSON.parse(s.furniture);
  const l = JSON.parse(s.layouts);
  state.layouts = l.list; state.layoutId = l.id;
  // 다른 프로젝트를 연 것을 되돌리면 내 가구도 돌아와야 한다(안 그러면 자동 저장이 내 가구를 지운 채로 남긴다)
  const libChanged = s.library && s.library !== state.library;
  if (libChanged) state.library = s.library;
  if (ui.selection?.ids) ui.selection = furnitureSelection(ui.selection.ids);
  if (ui.selection && !findSelected()) ui.selection = null;
  emit('plan', 'furniture', 'layouts', 'selection', ...(libChanged ? ['library'] : []));
}
export function checkpoint() {
  past.push(snapshot());
  if (past.length > HISTORY_LIMIT) past.shift();
  future.length = 0;
}
export function undo() {
  if (!past.length) return false;
  future.push(snapshot());
  restore(past.pop());
  return true;
}
export function redo() {
  if (!future.length) return false;
  past.push(snapshot());
  restore(future.pop());
  return true;
}

/* ---------- 선택 ---------- */
export function select(sel) {
  const key = (s) => s && `${s.kind}:${s.id}:${s.ids?.join(',') || ''}`;
  if (key(sel) === key(ui.selection)) return;
  ui.selection = sel;
  emit('selection');
}

/** 가구 id 목록으로 선택을 만든다 (없는 id는 뺀다). 0개면 null, 1개면 보통 선택 */
function furnitureSelection(ids) {
  const alive = [...new Set(ids)].filter((id) => state.furniture.some((f) => f.id === id));
  if (!alive.length) return null;
  const sel = { kind: 'furniture', id: alive[alive.length - 1] };
  if (alive.length > 1) sel.ids = alive;
  return sel;
}
export function selectFurniture(ids) { select(furnitureSelection(ids)); }

/** 지금 고른 가구 id 목록 (가구가 아니면 빈 목록) */
export function selectedFurnitureIds() {
  const s = ui.selection;
  return s?.kind === 'furniture' ? s.ids || [s.id] : [];
}
export function isFurnitureSelected(id) { return selectedFurnitureIds().includes(id); }

/** Shift+클릭: 가구를 선택에 더하거나 뺀다. 더해졌으면 true */
export function toggleFurnitureSelection(id) {
  const ids = selectedFurnitureIds();
  const has = ids.includes(id);
  selectFurniture(has ? ids.filter((x) => x !== id) : [...ids, id]);
  return !has;
}

/* ---------- 가구 끌기 (2D·3D 함께 씀) ---------- */
/** 고른 가구들을 도면 점 p(mm)에서 잡는다. 기록(checkpoint)은 처음 실제로 움직일 때 한 번만 남긴다 */
export function beginFurnitureDrag(ids, p) {
  const orig = ids.map((id) => state.furniture.find((f) => f.id === id)).filter(Boolean).map((f) => ({ id: f.id, x: f.x, y: f.y }));
  return { start: p, orig, started: false };
}
export function dragFurnitureTo(drag, p) {
  if (!drag.orig.length) return;
  if (!drag.started) {
    if (furnitureLocked()) { drag.orig = []; return; }   // 보호 중인 안: 눌러서 고르기만 된다
    checkpoint();
    drag.started = true;
  }
  const snap = (v) => Math.round(v / 10) * 10;
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  const one = drag.orig.length === 1;
  for (const o of drag.orig) {
    const f = state.furniture.find((x) => x.id === o.id);
    if (!f) continue;
    // 하나는 자리를 10mm 칸에 맞추고, 여럿은 서로 간격이 그대로이도록 이동량을 10mm 칸에 맞춘다
    f.x = one ? snap(o.x + dx) : o.x + snap(dx);
    f.y = one ? snap(o.y + dy) : o.y + snap(dy);
  }
  emit('furniture');
}
export function findSelected() {
  const s = ui.selection;
  if (!s) return null;
  if (s.kind === 'furniture') return state.furniture.find((f) => f.id === s.id) || null;
  if (s.kind === 'wall') return state.plan.walls.find((w) => w.id === s.id) || null;
  if (s.kind === 'room') return state.plan.rooms.find((r) => r.id === s.id) || null;
  if (s.kind === 'window') return state.plan.windows.find((w) => w.id === s.id) || null;
  if (s.kind === 'door') return state.plan.doors.find((d) => d.id === s.id) || null;
  return null;
}

/* ---------- 변경 도우미 ---------- */
export function updateFurniture(id, patch) {
  const f = state.furniture.find((x) => x.id === id);
  if (!f) return;
  Object.assign(f, patch);
  emit('furniture');
}

export function removeItem(kind, id) {
  if (kind === 'furniture') state.furniture = state.furniture.filter((f) => f.id !== id);
  if (kind === 'wall') state.plan.walls = state.plan.walls.filter((w) => w.id !== id);
  if (kind === 'room') state.plan.rooms = state.plan.rooms.filter((r) => r.id !== id);
  if (kind === 'window') state.plan.windows = state.plan.windows.filter((w) => w.id !== id);
  if (kind === 'door') {
    const d = state.plan.doors.find((x) => x.id === id);
    if (d && d.auto !== false) state.plan.doorsRemoved.push({ x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 });
    state.plan.doors = state.plan.doors.filter((x) => x.id !== id);
  }
  if (ui.selection?.ids) ui.selection = furnitureSelection(ui.selection.ids);
  else if (ui.selection?.id === id) ui.selection = null;
  emit(kind === 'furniture' ? 'furniture' : 'plan', 'selection');
}

/** 가구 여러 개를 한 번에 지운다 (되돌리기 한 번에 돌아오도록 checkpoint는 부르는 쪽에서 한 번) */
export function removeFurniture(ids) {
  state.furniture = state.furniture.filter((f) => !ids.includes(f.id));
  if (ui.selection?.kind === 'furniture') ui.selection = furnitureSelection(selectedFurnitureIds());
  emit('furniture', 'selection');
}

/**
 * 축척을 바꾼다. 벽·방·가구 위치는 도면 이미지 위의 자리를 지키도록 같은 비율로 옮긴다.
 * (가구 크기와 직접 그린 벽 두께는 실제 치수이므로 그대로 둔다.)
 */
export function setScale(mmPerPx) {
  const p = state.plan;
  const k = mmPerPx / p.mmPerPx;
  p.mmPerPx = mmPerPx;
  p.scaleSet = true;
  if (Math.abs(k - 1) < 1e-9) { emit('plan'); return; }
  const sc = (pt) => ({ x: pt.x * k, y: pt.y * k });
  p.walls = p.walls.map((w) => ({ ...w, a: sc(w.a), b: sc(w.b), t: w.auto ? w.t * k : w.t }));
  p.rooms = p.rooms.map((r) => ({ ...r, pts: r.pts.map(sc) }));
  p.windows = p.windows.map((w) => ({ ...w, a: sc(w.a), b: sc(w.b) }));
  p.doors = p.doors.map((d) => ({ ...d, a: sc(d.a), b: sc(d.b), t: d.auto ? d.t * k : d.t }));
  p.doorsRemoved = p.doorsRemoved.map(sc);
  p.blocked = (p.blocked || []).map((z) => ({ ...z, pts: z.pts.map(sc) }));
  p.fixtures = (p.fixtures || []).map((f) => ({ ...f, x: f.x * k, y: f.y * k }));
  if (p.scaleRef) p.scaleRef = { ...p.scaleRef, a: sc(p.scaleRef.a), b: sc(p.scaleRef.b) };
  if (p.entrance) p.entrance = { ...p.entrance, a: sc(p.entrance.a), b: sc(p.entrance.b), t: p.entrance.t * k };
  // 다른 안의 가구도 함께 (보호 중인 안도 — 가구가 도면 위 자리를 지키는 것이지 배치를 바꾸는 것이 아니다)
  for (const fs of [state.furniture, ...state.layouts.map((l) => l.furniture)]) fs.forEach((f) => { f.x *= k; f.y *= k; });
  emit('plan', 'furniture');
}

/**
 * 기준 치수 하나로 축척을 맞춘다. 도면 위 두 점 a·b 사이가 실제로 mm라는 뜻이다.
 * 기준선은 남겨 두어 화면에 보여 주고, 나중에 값만 고쳐 다시 맞출 수 있게 한다.
 */
export function applyScaleRef(a, b, mm) {
  const p = state.plan;
  const px = Math.hypot(b.x - a.x, b.y - a.y) / p.mmPerPx;
  if (!(px > 0) || !(mm > 0)) return false;
  p.scaleRef = { a, b, mm };
  setScale(mm / px);
  return true;
}

/* ---------- 배치 안 ---------- */
// 안을 바꾸거나 더하는 쪽에서 checkpoint()를 먼저 부른다 (되돌리면 그 전 안과 배치로 돌아온다)
const copyOf = (fs) => JSON.parse(JSON.stringify(fs));
export const currentLayout = () => state.layouts.find((l) => l.id === state.layoutId) || state.layouts[0];
/** 안 id → 그 안의 가구 (지금 안은 state.furniture) */
export function layoutFurniture(id) {
  return id === state.layoutId ? state.furniture : state.layouts.find((l) => l.id === id)?.furniture || [];
}
function nextLayoutName() {
  const n = Math.max(0, ...state.layouts.map((l) => +(/^(\d+)안$/.exec(l.name)?.[1] || 0)));
  return `${n + 1}안`;
}
let onLocked = null;
/** 보호 중인 안의 가구를 바꾸려 할 때 부를 함수 (main.js가 상태줄에 알린다) */
export function setLockedHandler(fn) { onLocked = fn; }
/** 지금 안이 보호 중이면 알리고 true — 가구를 바꾸는 곳마다 먼저 부른다 (안 바꾸기·이름·복사는 된다) */
export function furnitureLocked() {
  const l = currentLayout();
  if (!l.locked) return false;
  onLocked?.(l);
  return true;
}
/** 안 보호를 켜고 끈다 (부르는 쪽이 checkpoint — 되돌리기 기록과 보호 상태가 어긋나지 않게) */
export function setLayoutLocked(id, on) {
  const l = state.layouts.find((x) => x.id === id);
  if (!l) return;
  if (on) l.locked = true; else delete l.locked;
  emit('layouts');
}
/** 지금 안을 그대로 복사한 새 안을 만들고 그 안으로 넘어간다 (보호는 따라가지 않는다 — 고쳐 보려고 만드는 안이다) */
export function addLayout() {
  const l = { id: uid('L'), name: nextLayoutName(), furniture: [] };
  const fs = copyOf(state.furniture).map((f) => ({ ...f, id: uid('f') }));
  currentLayout().furniture = state.furniture;
  state.layouts.push(l);
  state.layoutId = l.id;
  state.furniture = fs;
  ui.selection = null;
  emit('furniture', 'layouts', 'selection');
  return l;
}
export function switchLayout(id) {
  const to = state.layouts.find((l) => l.id === id);
  if (!to || id === state.layoutId) return false;
  currentLayout().furniture = state.furniture;
  state.furniture = to.furniture;
  to.furniture = [];
  state.layoutId = id;
  ui.selection = null;
  emit('furniture', 'layouts', 'selection');
  return true;
}
export function renameLayout(id, name) {
  const l = state.layouts.find((x) => x.id === id);
  if (!l || !name) return;
  l.name = name;
  emit('layouts');
}
/** 안을 지운다 (하나뿐이면 지우지 않는다). 지금 안이면 옆 안으로 넘어간다 */
export function deleteLayout(id) {
  if (state.layouts.length < 2) return false;
  const i = state.layouts.findIndex((l) => l.id === id);
  if (i < 0 || state.layouts[i].locked) return false;
  if (id === state.layoutId) switchLayout(state.layouts[i + 1]?.id || state.layouts[i - 1].id);
  state.layouts.splice(state.layouts.findIndex((l) => l.id === id), 1);
  emit('layouts');
  return true;
}
/** 띄움·회전이 빠진 가구(손으로 고친 파일 등)는 0으로 — 없으면 겹침 판정·꼭짓점이 NaN이 되어 조용히 틀린다 */
const withDefaults = (f) => ({ ...f, elev: f.elev ?? 0, rot: f.rot ?? 0 });
/** 저장·불러온 데이터의 안 목록을 상태로 (안이 없던 예전 파일은 '1안' 하나) */
function applyLayouts(data) {
  const list = Array.isArray(data.layouts) && data.layouts.length ? copyOf(data.layouts) : [{ id: 'L1', name: '1안', furniture: [] }];
  // 손으로 고친 파일 등에서 안의 furniture·id가 빠져 있으면 안을 바꿀 때 가구 목록이 undefined가 되어 화면이 멈춘다
  list.forEach((l, i) => {
    l.furniture = Array.isArray(l.furniture) ? l.furniture.map(withDefaults) : [];
    if (!l.id) l.id = uid('L');
    if (!l.name) l.name = `${i + 1}안`;
  });
  const cur = list.find((l) => l.id === data.layoutId) || list[0];
  state.layouts = list;
  state.layoutId = cur.id;
  // 지금 안의 가구는 furniture 칸(예전 파일과 같은 자리)에서 읽는다
  cur.furniture = [];
}

/* ---------- 저장 ---------- */
// 브라우저 저장소(localStorage, 주소마다 따로)에 늘 저장하고, serve.py로 열었으면 프로젝트 폴더의 ohmyhome-project.json에도 저장한다
// (/api/project — localhost·IP 어느 주소로 열어도 같은 작업). 시작할 때는 그 파일을 먼저 읽는다.
const SERVER_URL = 'api/project';
let serverOk = false;           // serve.py가 저장을 받아 주는지 (응답 머리글 X-OhMyHome로 알아본다)
let saveTimer = null;
let onSaveError = null;
let saveChain = Promise.resolve();
export function setSaveErrorHandler(fn) { onSaveError = fn; }
export const savesToServer = () => serverOk;

/** 프로젝트 폴더에 저장된 작업 (없거나 serve.py가 아니면 null) */
export async function loadFromServer() {
  try {
    const r = await fetch(SERVER_URL, { cache: 'no-store' });
    serverOk = r.ok && r.headers.get('X-OhMyHome') === '1';
    if (!serverOk) return null;
    const data = await r.json();
    return data?.plan ? data : null;
  } catch {
    serverOk = false;
    return null;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 600);
}
export function saveNow() {
  const json = JSON.stringify(serialize());
  let localErr = null;
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    localErr = e;
  }
  if (!serverOk) { if (localErr) onSaveError?.(localErr, 'local'); return; }
  // 차례대로 보낸다 (늦게 끝난 예전 요청이 새 내용을 덮지 않게)
  saveChain = saveChain.then(() => fetch(SERVER_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
    .catch((e) => onSaveError?.(e, 'server')));
}
// 탭을 닫거나 다른 앱으로 갈 때 기다리던 저장을 바로 한다
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveNow(); } });
export function serialize() {
  // furniture는 지금 안의 가구(예전 앱도 그대로 연다), layouts는 모든 안 (지금 안은 furniture를 채워 넣는다)
  const layouts = state.layouts.map((l) => (l.id === state.layoutId ? { ...l, furniture: state.furniture } : l));
  return { app: 'OhMyHome', version: 1, plan: state.plan, furniture: state.furniture, library: state.library, layouts, layoutId: state.layoutId };
}
/** 싱크대 종류 — 도면의 기본 싱크대(plan.fixtures)로 기억해 두는 가구 */
const SINK_TYPES = new Set(['kitchen_counter', 'kitchen_l']);
/** 도면 파일의 기본 싱크대: plan.fixtures가 있으면 그것, 없으면 그 파일 가구 가운데 '기본 포함' 싱크대 */
function planFixtures(data) {
  if (Array.isArray(data.plan.fixtures)) return data.plan.fixtures;
  return (data.furniture || []).filter((f) => f.builtin && SINK_TYPES.has(f.type)).map(({ id, ...f }) => ({ elev: 0, rot: 0, ...f }));
}
export function loadProject(data) {
  if (!data || !data.plan) throw new Error('OhMyHome 프로젝트 파일이 아닙니다.');
  const base = freshState();
  checkpoint();
  Object.assign(state.plan, base.plan, data.plan, { fixtures: planFixtures(data) });
  state.furniture = (data.furniture || []).map(withDefaults);
  state.library = data.library || [];
  applyLayouts(data);
  ui.selection = null;
  emit('plan', 'furniture', 'library', 'layouts', 'selection');
}
/**
 * 도면만 바꾼다 — 같은 집의 도면이 조금 고쳐졌을 때 쓴다. data.plan(도면 그림·축척·벽·방·창·문·현관)으로 바꾸고,
 * 배치 안·가구(기본 포함 가구도)·내 가구·층수는 그대로 둔다. 가구는 도면 좌표(mm) 그대로 남는다.
 * 그 파일의 기본 싱크대는 plan.fixtures로 가져온다 — 싱크대가 없는 안에 놓는 것은 부르는 쪽(main.js)이 같은 되돌리기 안에서 한다.
 */
export function replacePlan(data) {
  if (!data || !data.plan) throw new Error('OhMyHome 프로젝트 파일이 아닙니다.');
  checkpoint();
  const floor = state.plan.floor;
  Object.assign(state.plan, freshState().plan, data.plan, { floor, fixtures: planFixtures(data) });
  ui.selection = null;
  emit('plan', 'selection');
}
/** 저장된 작업을 연다: from(프로젝트 폴더에서 읽은 것)이 있으면 그것, 없으면 브라우저 저장소 */
export function loadSaved(from = null) {
  try {
    const raw = from ? null : localStorage.getItem(STORAGE_KEY);
    if (!from && !raw) return false;
    const data = from || JSON.parse(raw);
    // 폴더의 작업을 열었으면 이 주소의 브라우저 저장소(예비본)도 같게 맞춘다 — 예전 내용이 남아 있다가 되살아나지 않게
    if (from) try { localStorage.setItem(STORAGE_KEY, JSON.stringify(from)); } catch { /* 저장 공간 부족: 폴더 파일이 있으니 넘어간다 */ }
    const base = freshState();
    Object.assign(state.plan, base.plan, data.plan);
    state.furniture = (data.furniture || []).map(withDefaults);
    state.library = data.library || [];
    applyLayouts(data);
    return data;   // 불러온 원본 — 문 목록이 없던 예전 저장본인지 main.js가 본다
  } catch {
    return false;
  }
}
export function resetProject() {
  checkpoint();
  const base = freshState();
  Object.assign(state.plan, base.plan);
  state.furniture = [];
  applyLayouts({});
  ui.selection = null;
  emit('plan', 'furniture', 'layouts', 'selection');
}
