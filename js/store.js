// 앱 상태 한 곳. 2D·3D·패널은 여기 이벤트를 듣고 다시 그린다.
//   'plan'      도면(이미지·축척·벽·방·벽 높이)이 바뀜
//   'furniture' 배치된 가구가 바뀜
//   'library'   사진으로 만든 내 가구 목록이 바뀜
//   'selection' 선택이 바뀜

const STORAGE_KEY = 'ohmyhome.project.v1';
const HISTORY_LIMIT = 60;

export function freshState() {
  return {
    plan: {
      image: null,          // { src(dataURL), width, height } — 픽셀
      mmPerPx: 10,          // 이미지 1px이 몇 mm인지
      scaleSet: false,      // 사용자가 축척을 직접 맞췄는지
      scaleRef: null,       // 축척을 맞춘 기준 치수 { a, b, mm } — a·b는 도면 좌표(mm)
      walls: [],            // { id, a:{x,y}, b:{x,y}, t, cap, auto }  (mm)
      rooms: [],            // { id, name, pts:[{x,y}] }               (mm)
      wallHeight: 2300,
    },
    furniture: [],          // { id, type, name, w, d, h, x, y, rot, elev, color, libId, usePhoto }
    library: [],            // { id, type, name, w, d, h, color, image(dataURL), usePhoto }
  };
}

export const state = freshState();
export const ui = { selection: null }; // { kind: 'furniture'|'wall'|'room', id }

const listeners = new Map();
export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
}
export function emit(...types) {
  for (const t of types) listeners.get(t)?.forEach((fn) => fn());
  if (types.some((t) => t !== 'selection')) scheduleSave();
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
  };
}
function restore(s) {
  Object.assign(state.plan, JSON.parse(s.plan), { image: s.image });
  state.furniture = JSON.parse(s.furniture);
  if (ui.selection && !findSelected()) ui.selection = null;
  emit('plan', 'furniture', 'selection');
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
  const same = sel && ui.selection && sel.kind === ui.selection.kind && sel.id === ui.selection.id;
  if (same || (!sel && !ui.selection)) return;
  ui.selection = sel;
  emit('selection');
}
export function findSelected() {
  const s = ui.selection;
  if (!s) return null;
  if (s.kind === 'furniture') return state.furniture.find((f) => f.id === s.id) || null;
  if (s.kind === 'wall') return state.plan.walls.find((w) => w.id === s.id) || null;
  if (s.kind === 'room') return state.plan.rooms.find((r) => r.id === s.id) || null;
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
  if (ui.selection?.id === id) ui.selection = null;
  emit(kind === 'furniture' ? 'furniture' : 'plan', 'selection');
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
  if (p.scaleRef) p.scaleRef = { ...p.scaleRef, a: sc(p.scaleRef.a), b: sc(p.scaleRef.b) };
  state.furniture.forEach((f) => { f.x *= k; f.y *= k; });
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

/* ---------- 저장 ---------- */
let saveTimer = null;
let onSaveError = null;
export function setSaveErrorHandler(fn) { onSaveError = fn; }

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}
export function saveNow() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
  } catch (e) {
    onSaveError?.(e);
  }
}
export function serialize() {
  return { app: 'OhMyHome', version: 1, plan: state.plan, furniture: state.furniture, library: state.library };
}
export function loadProject(data) {
  if (!data || !data.plan) throw new Error('OhMyHome 프로젝트 파일이 아닙니다.');
  const base = freshState();
  checkpoint();
  Object.assign(state.plan, base.plan, data.plan);
  state.furniture = (data.furniture || []).map((f) => ({ elev: 0, rot: 0, ...f }));
  state.library = data.library || [];
  ui.selection = null;
  emit('plan', 'furniture', 'library', 'selection');
}
export function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const base = freshState();
    Object.assign(state.plan, base.plan, data.plan);
    state.furniture = data.furniture || [];
    state.library = data.library || [];
    return true;
  } catch {
    return false;
  }
}
export function resetProject() {
  checkpoint();
  const base = freshState();
  Object.assign(state.plan, base.plan);
  state.furniture = [];
  ui.selection = null;
  emit('plan', 'furniture', 'selection');
}
