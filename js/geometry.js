// 평면 기하 — 모든 좌표는 mm, y는 아래로 증가한다(도면 이미지와 같은 방향).
// 가구 회전 rot(도)은 화면에서 시계 방향이다. 가구의 앞면은 로컬 +y(= 3D의 +z)다.
import { lCounterDepth, lLegDepth } from './catalog.js';

export const DEG = Math.PI / 180;

export function normDeg(d) {
  return ((Math.round(d * 100) / 100) % 360 + 360) % 360;
}

export function rotatePt(x, y, rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 가구 바닥 사각형의 네 꼭짓점 (shrink만큼 안쪽으로) */
export function furnitureCorners(f, shrink = 0) {
  const hw = Math.max(0, f.w / 2 - shrink), hd = Math.max(0, f.d / 2 - shrink), r = f.rot * DEG;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => {
    const p = rotatePt(x, y, r);
    return { x: f.x + p.x, y: f.y + p.y };
  });
}

/**
 * 가구 바닥을 이루는 로컬 사각형 목록 [x0, y0, x1, y1] (가운데 원점, 앞면 +y). 보통 가구는 w×d 하나다.
 * ㄱ자 주방 싱크대(kitchen_l)는 뒤쪽 가로(w × 상판 깊이) + 옆쪽 꺾인 세로(상판 깊이 × 나머지 d) 두 개다.
 * 꺾인 쪽은 앞에서 볼 때 오른쪽(+x)이고, f.mirror면 왼쪽이다.
 */
export function furnitureRects(f) {
  const hw = f.w / 2, hd = f.d / 2;
  if (f.type !== 'kitchen_l') return [[-hw, -hd, hw, hd]];
  const t = Math.min(lCounterDepth(f), f.w, f.d), tl = Math.min(lLegDepth(f), f.w);   // 가로 쪽 깊이 · 꺾인 쪽 깊이
  const [x0, x1] = f.mirror ? [-hw, -hw + tl] : [hw - tl, hw];
  return [[-hw, -hd, hw, -hd + t], [x0, -hd + t, x1, hd]];
}

const toPlan = (f, x, y) => {
  const p = rotatePt(x, y, f.rot * DEG);
  return { x: f.x + p.x, y: f.y + p.y };
};

/** 가구 바닥 조각들의 꼭짓점 (볼록 사각형 목록, shrink만큼 안쪽으로) — 겹침·클릭·길 찾기에 쓴다 */
export function furnitureParts(f, shrink = 0) {
  return furnitureRects(f).map(([x0, y0, x1, y1]) => {
    const s = Math.min(shrink, (x1 - x0) / 2, (y1 - y0) / 2);
    return [[x0 + s, y0 + s], [x1 - s, y0 + s], [x1 - s, y1 - s], [x0 + s, y1 - s]].map(([x, y]) => toPlan(f, x, y));
  });
}

/** 2D에 그릴 가구 바깥 테두리. ㄱ자는 여섯 꼭짓점 */
export function furnitureOutline(f) {
  if (f.type !== 'kitchen_l') return furnitureCorners(f);
  const [[x0, y0, x1, y1], [lx0, , lx1, ly1]] = furnitureRects(f);
  const pts = f.mirror
    ? [[x0, y0], [x1, y0], [x1, y1], [lx1, y1], [lx1, ly1], [lx0, ly1]]
    : [[x0, y0], [x1, y0], [lx1, ly1], [lx0, ly1], [lx0, y1], [x0, y1]];
  return pts.map(([x, y]) => toPlan(f, x, y));
}

/** 앞면(사람이 서는 쪽) 선. 보통 가구는 +y 변 하나, ㄱ자는 안쪽으로 꺾인 두 변 */
export function furnitureFront(f) {
  if (f.type !== 'kitchen_l') { const c = furnitureCorners(f); return [c[3], c[2]]; }
  const [[x0, , x1, y1], [lx0, , lx1, ly1]] = furnitureRects(f);
  const pts = f.mirror ? [[x1, y1], [lx1, y1], [lx1, ly1]] : [[x0, y1], [lx0, y1], [lx0, ly1]];
  return pts.map(([x, y]) => toPlan(f, x, y));
}

/** 벽 사각형의 네 꼭짓점. cap이면 양 끝을 두께 절반만큼 늘려 모서리를 메운다. */
export function wallCorners(w, shrink = 0) {
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const ext = (w.cap ? w.t / 2 : 0) - shrink, ht = Math.max(0, w.t / 2 - shrink);
  const a = { x: w.a.x - ux * ext, y: w.a.y - uy * ext };
  const b = { x: w.b.x + ux * ext, y: w.b.y + uy * ext };
  return [
    { x: a.x + nx * ht, y: a.y + ny * ht },
    { x: b.x + nx * ht, y: b.y + ny * ht },
    { x: b.x - nx * ht, y: b.y - ny * ht },
    { x: a.x - nx * ht, y: a.y - ny * ht },
  ];
}

export function wallLength(w) {
  return dist(w.a, w.b) + (w.cap ? w.t : 0);
}

/** 볼록 다각형 두 개가 겹치는지 (분리축 정리) */
export function convexOverlap(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const ax = -(q.y - p.y), ay = q.x - p.x;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const v of A) { const d = v.x * ax + v.y * ay; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const v of B) { const d = v.x * ax + v.y * ay; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA <= minB || maxB <= minA) return false;
    }
  }
  return true;
}

export function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 점에서 선분까지 — 거리, 선분 위 비율 t(0~1), 가장 가까운 점 */
export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + dx * t, y = a.y + dy * t;
  return { dist: Math.hypot(p.x - x, p.y - y), t, x, y };
}

export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const c = p.x * q.y - q.x * p.y;
    a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-9) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** 가구의 로컬 사각형 [x0,x1]×[y0,y1] (가운데 원점, 앞면 +y)을 도면 좌표 꼭짓점으로 */
function localRect(f, x0, y0, x1, y1) {
  const r = f.rot * DEG;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => {
    const p = rotatePt(x, y, r);
    return { x: f.x + p.x, y: f.y + p.y };
  });
}

// 의자를 밀어 넣을 수 있는(다리 사이가 비어 있는) 가구 → 상판 높이
// 화장대는 높이(H)에 거울이 들어가므로 상판은 models3d.vanity와 같은 750mm로 본다
const KNEE_SPACE = {
  desk: (f) => f.h,
  table: (f) => f.h,
  vanity: (f) => Math.min(f.h, 750),
};
const DESK_TOP_MM = 40;     // 상판 두께 — 의자가 들어갈 수 있는 높이는 책상 높이에서 이만큼 뺀다
const CHAIR_BACK_MM = 60;   // 등받이 두께 (models3d.chair와 맞춘다)

/**
 * 책상·식탁과 의자는 앉는 부분이 책상 밑으로 들어가도 된다.
 * 책상보다 높이 올라오는 등받이가 책상과 겹칠 때만 겹침이다.
 * 의자 앉는 높이가 상판 밑으로 들어가지 못하면(낮은 테이블) 평소처럼 바닥 사각형으로 판정한다.
 */
function chairUnderDesk(chair, desk) {
  const under = desk.elev + KNEE_SPACE[desk.type](desk) - DESK_TOP_MM;   // 상판 아랫면 높이
  const seat = chair.elev + (chair.stool ? chair.h : Math.min(460, chair.h * 0.55));  // 앉는 면 높이 (스툴은 맨 위)
  if (seat + 20 > under) return null;                       // 들어갈 수 없다 → 일반 판정
  if (chair.elev + chair.h <= under) return false;          // 의자 전체가 들어간다
  const back = localRect(chair, -chair.w / 2 + 1, -chair.d / 2 + 1, chair.w / 2 - 1, -chair.d / 2 + CHAIR_BACK_MM);
  return convexOverlap(back, furnitureCorners(desk, 2));
}

/** 서로 겹쳐 놓아도 되는 가구 종류 짝 (책상 위·옆으로 책장을 겹쳐 세우는 책상 책장 등) */
const OVERLAP_OK = new Set([['desk', 'shelf'], ['bath_shelf', 'bath_upper_shelf']].map((p) => p.sort().join('|')));
/** 어떤 가구와도 겹쳐 놓아도 되는 종류 (커튼은 소파·침대·책상 등 창 앞 가구 뒤로 늘어진다) */
const OVERLAP_ANY = new Set(['curtain']);
/** 벽과 겹쳐 놓아도 되는 종류 (커튼은 창틀·벽 안쪽에 걸쳐 단다) */
const WALL_OK = new Set(['curtain']);
/** 냉장고장(옷장 모양 wstyle 'fridge')의 빈 아래 칸에 넣어도 되는 종류 */
const IN_FRIDGE_CABINET = new Set(['fridge_side', 'fridge_top', 'kimchi', 'kimchi_stand']);
const inFridgeCabinet = (w, x) => w.type === 'wardrobe' && w.wstyle === 'fridge' && IN_FRIDGE_CABINET.has(x.type);
const overlapOk = (a, b) => OVERLAP_ANY.has(a.type) || OVERLAP_ANY.has(b.type) || OVERLAP_OK.has([a.type, b.type].sort().join('|'))
  || inFridgeCabinet(a, b) || inFridgeCabinet(b, a);

/** 벽이나 다른 가구와 겹치는 가구 id 집합. 맞닿기만 한 것은 겹침이 아니다. */
export function findCollisions(furniture, walls) {
  const bad = new Set();
  const fc = furniture.map((f) => furnitureParts(f, 2));
  const wc = walls.map((w) => wallCorners(w, 1));
  const overlap = (A, B) => A.some((a) => B.some((b) => convexOverlap(a, b)));   // 조각(ㄱ자는 둘) 중 하나라도 겹치면
  furniture.forEach((f, i) => {
    if (f.disabled) return;   // 비활성화한 가구는 없는 것으로 친다
    if (!WALL_OK.has(f.type)) for (const w of wc) {
      if (overlap(fc[i], [w])) { bad.add(f.id); break; }
    }
    for (let j = i + 1; j < furniture.length; j++) {
      const g = furniture[j];
      if (g.disabled) continue;
      const vertical = f.elev < g.elev + g.h && g.elev < f.elev + f.h;
      if (!vertical || overlapOk(f, g) || !overlap(fc[i], fc[j])) continue;
      let hit = null;
      if (f.type === 'chair' && g.type in KNEE_SPACE) hit = chairUnderDesk(f, g);
      else if (g.type === 'chair' && f.type in KNEE_SPACE) hit = chairUnderDesk(g, f);
      if (hit === false) continue;
      bad.add(f.id); bad.add(g.id);
    }
  });
  return bad;
}

/** 가장 가까운 벽에 등을 대도록 위치·방향을 맞춘 값 */
export function snapToWall(f, walls, gap = 5) {
  let best = null;
  for (const w of walls) {
    const r = distToSegment(f, w.a, w.b);
    if (!best || r.dist < best.r.dist) best = { w, r };
  }
  if (!best) return null;
  const { w, r } = best;
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if ((f.x - r.x) * nx + (f.y - r.y) * ny < 0) { nx = -nx; ny = -ny; }
  // 앞면(로컬 +y)이 벽 반대쪽(n)을 보도록: (-sinθ, cosθ) = n
  const rot = normDeg(Math.atan2(-nx, ny) / DEG);
  const off = w.t / 2 + f.d / 2 + gap;
  return { x: r.x + nx * off, y: r.y + ny * off, rot };
}

/**
 * 사용자가 적은 길이를 mm로 읽는다. 도면마다 표기가 달라서 단위를 너그럽게 받는다.
 *   '3800' '3,800' '3800mm' → 3800,  '380cm' → 3800,  '3.8m' '3.8' → 3800
 * 단위가 없고 50보다 작으면 m로 본다(3.8을 3.8mm로 읽으면 도면이 손톱만 해진다).
 */
export function parseLengthMM(text) {
  const s = String(text ?? '').trim().toLowerCase().replace(/[,\s]/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(mm|cm|m|미터|센티)?$/);
  if (!m) return NaN;
  const v = parseFloat(m[1]);
  const unit = m[2] || (v < 50 ? 'm' : 'mm');
  return { mm: 1, cm: 10, 센티: 10, m: 1000, 미터: 1000 }[unit] * v;
}

/** p에서 방향 (dx,dy)로 쏜 반직선이 다각형 변과 처음 만나는 거리 (없으면 Infinity) */
export function rayHit(p, dx, dy, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;   // 반직선 위 거리
    const u = ((a.x - p.x) * dy - (a.y - p.y) * dx) / den;   // 변 위 비율
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

/**
 * 한 점에서 좌우·위아래로 가장 가까운 벽까지 재어, 그 칸의 안쪽 가로·세로를 돌려준다.
 * 어느 방향이 벽에 막히지 않으면 그 축은 null. p가 벽 안이면 null.
 */
export function spanAt(p, walls) {
  const polys = walls.map((w) => wallCorners(w));
  if (polys.some((poly) => pointInPoly(p, poly))) return null;
  const reach = (dx, dy) => Math.min(...polys.map((poly) => rayHit(p, dx, dy, poly)));
  const axis = (dx, dy) => {
    const f = reach(dx, dy), r = reach(-dx, -dy);
    if (!isFinite(f) || !isFinite(r)) return null;
    return { a: { x: p.x - dx * r, y: p.y - dy * r }, b: { x: p.x + dx * f, y: p.y + dy * f } };
  };
  const h = axis(1, 0), v = axis(0, 1);
  return h || v ? { h, v } : null;
}

/**
 * 점 p 근처의 문 틈(벽이 끊긴 곳)을 찾는다. 벽 끝에서 벽 방향으로 반직선을 쏘아
 * min~max mm 안에서 다른 벽을 만나면 그 사이를 틈으로 본다. 바깥 방향(out)은 벽 전체의 중심에서 먼 쪽이다.
 * 반환: { a, b, t, out:{x,y} } | null
 */
export function findDoorGap(p, walls, { min = 550, max = 1800, near = 1500 } = {}) {
  const polys = walls.map((w) => wallCorners(w));
  let best = null;
  walls.forEach((w, i) => {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (!len) return;
    const ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len, ext = w.cap ? w.t / 2 : 0;
    for (const [end, dx, dy] of [[w.b, ux, uy], [w.a, -ux, -uy]]) {
      const e = { x: end.x + dx * ext, y: end.y + dy * ext };
      const from = { x: e.x + dx, y: e.y + dy };
      let d = Infinity;
      polys.forEach((poly, j) => { if (j !== i) d = Math.min(d, rayHit(from, dx, dy, poly)); });
      d += 1;
      if (!(d >= min && d <= max)) continue;
      const b = { x: e.x + dx * d, y: e.y + dy * d };
      const gap = Math.hypot((e.x + b.x) / 2 - p.x, (e.y + b.y) / 2 - p.y);
      if (gap > near || (best && gap >= best.gap)) continue;
      best = { a: e, b, t: w.t, gap };
    }
  });
  if (!best) return null;
  const n = walls.length * 2;
  const c = walls.reduce((s, w) => ({ x: s.x + (w.a.x + w.b.x) / n, y: s.y + (w.a.y + w.b.y) / n }), { x: 0, y: 0 });
  const gx = best.b.x - best.a.x, gy = best.b.y - best.a.y, gl = Math.hypot(gx, gy);
  let out = { x: -gy / gl, y: gx / gl };
  const mid = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
  const far = (k) => Math.hypot(mid.x + out.x * k - c.x, mid.y + out.y * k - c.y);
  if (far(800) < far(-800)) out = { x: -out.x, y: -out.y };
  return { a: best.a, b: best.b, t: best.t, out };
}

/**
 * 창이 벽 위에 걸친 구간 [s0, s1] (mm, 벽 상자의 시작 끝에서 잰 거리). 창이 그 벽 위에 없으면 null.
 * 3D에서 벽 상자를 창 자리만큼 잘라 내는 데 쓴다.
 */
export function windowSpanOnWall(win, w) {
  const d = dist(w.a, w.b);
  if (!d) return null;
  const ux = (w.b.x - w.a.x) / d, uy = (w.b.y - w.a.y) / d, ext = w.cap ? w.t / 2 : 0;
  const o = { x: w.a.x - ux * ext, y: w.a.y - uy * ext };
  const proj = (p) => ({ s: (p.x - o.x) * ux + (p.y - o.y) * uy, off: -(p.x - o.x) * uy + (p.y - o.y) * ux });
  const pa = proj(win.a), pb = proj(win.b), tol = w.t / 2 + 20;
  if (Math.abs(pa.off) > tol || Math.abs(pb.off) > tol) return null;
  const s0 = Math.max(0, Math.min(pa.s, pb.s)), s1 = Math.min(wallLength(w), Math.max(pa.s, pb.s));
  return s1 - s0 > 1 ? [s0, s1] : null;
}

/**
 * 바깥벽의 틈(= 창 자리) 찾기. 도면 이미지에서 인식한 벽은 창 자리가 얇은 선이라 지워져 틈으로 남는다.
 * 벽 끝에서 벽 방향으로 쏜 반직선이 **같은 줄의 나란한 벽**에 min~max 안에서 닿으면 틈이다.
 * 틈을 모두 막은 칸 지도에서 도면 바깥 테두리부터 채워 나가 '집 바깥'을 구하고, 틈 한쪽이 바깥에 닿으면 창 자리로 본다.
 * (반직선 한 줄로 바깥을 재면 다른 문·창 틈으로 새어 나가 안쪽 문을 창으로 잘못 본다.)
 * skip 점(현관문 가운데)에서 300mm 안을 지나는 틈은 뺀다. outsideOnly: false면 바깥 판정 없이 같은 줄의 틈을 모두 돌려준다.
 * @returns [{ a, b, t }]
 */
export function findWindowGaps(walls, { min = 400, max = 6000, skip = [], cell = 40, outsideOnly = true } = {}) {
  const polys = walls.map((w) => wallCorners(w));
  const gaps = [];
  walls.forEach((w, i) => {
    const len = dist(w.a, w.b);
    if (!len) return;
    const ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len, ext = w.cap ? w.t / 2 : 0;
    for (const [end, dx, dy] of [[w.b, ux, uy], [w.a, -ux, -uy]]) {
      const e = { x: end.x + dx * ext, y: end.y + dy * ext };
      const from = { x: e.x + dx, y: e.y + dy };
      let d = Infinity, j = -1;
      polys.forEach((poly, k) => { if (k === i) return; const h = rayHit(from, dx, dy, poly); if (h < d) { d = h; j = k; } });
      d += 1;
      if (!(d >= min && d <= max)) continue;
      const o = walls[j], ol = dist(o.a, o.b) || 1;
      if (Math.abs(ux * (o.b.y - o.a.y) / ol - uy * (o.b.x - o.a.x) / ol) > 0.05) continue;              // 나란한 벽
      if (Math.abs(-(o.a.x - e.x) * uy + (o.a.y - e.y) * ux) > Math.max(w.t, o.t) / 2 + 30) continue;     // 같은 줄
      const b = { x: e.x + dx * d, y: e.y + dy * d }, mid = { x: (e.x + b.x) / 2, y: (e.y + b.y) / 2 };
      if (gaps.some((g) => dist(g.mid, mid) < 100)) continue;
      gaps.push({ a: e, b, t: w.t, mid, n: { x: -uy, y: ux } });
    }
  });
  if (!gaps.length) return [];
  if (!outsideOnly) return gaps.filter((g) => !skip.some((s) => distToSegment(s, g.a, g.b).dist < 300)).map(({ a, b, t }) => ({ a, b, t }));

  // 벽 + 모든 틈을 막은 칸 지도 → 테두리부터 채운 칸이 집 바깥
  const isOutside = outsideTester(polys.concat(gaps.map((g) => wallCorners({ a: g.a, b: g.b, t: g.t + 20, cap: false }))), cell);
  return gaps
    .filter((g) => !skip.some((s) => distToSegment(s, g.a, g.b).dist < 300))
    .filter((g) => [1, -1].some((k) => isOutside({ x: g.mid.x + g.n.x * k * (g.t / 2 + 90), y: g.mid.y + g.n.y * k * (g.t / 2 + 90) })))
    .map(({ a, b, t }) => ({ a, b, t }));
}

/**
 * 막힌 다각형들(벽·막은 틈) 바깥 테두리부터 칸을 채워 '집 바깥'을 구하고, 점이 바깥인지 알려 주는 함수를 돌려준다.
 * cell(mm)은 가장 얇은 벽(60mm)보다 작아야 벽 사이로 새지 않는다.
 */
export function outsideTester(polys, cell = 40) {
  if (!polys.length) return () => true;
  const bb = boundsOf(polys.flat()), pad = 3 * cell;
  const x0 = bb.minX - pad, y0 = bb.minY - pad, W = Math.ceil((bb.w + 2 * pad) / cell), H = Math.ceil((bb.h + 2 * pad) / cell);
  const blocked = new Uint8Array(W * H), outside = new Uint8Array(W * H);
  for (const poly of polys) {
    const pb = boundsOf(poly);
    for (let cy = Math.max(0, Math.floor((pb.minY - y0) / cell)); cy <= Math.min(H - 1, Math.ceil((pb.maxY - y0) / cell)); cy++) {
      for (let cx = Math.max(0, Math.floor((pb.minX - x0) / cell)); cx <= Math.min(W - 1, Math.ceil((pb.maxX - x0) / cell)); cx++) {
        if (!blocked[cy * W + cx] && pointInPoly({ x: x0 + (cx + 0.5) * cell, y: y0 + (cy + 0.5) * cell }, poly)) blocked[cy * W + cx] = 1;
      }
    }
  }
  const queue = [];
  const push = (i) => { if (!blocked[i] && !outside[i]) { outside[i] = 1; queue.push(i); } };
  for (let cx = 0; cx < W; cx++) { push(cx); push((H - 1) * W + cx); }
  for (let cy = 0; cy < H; cy++) { push(cy * W); push(cy * W + W - 1); }
  while (queue.length) {
    const i = queue.pop(), cx = i % W;
    if (cx > 0) push(i - 1);
    if (cx < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < W * (H - 1)) push(i + W);
  }
  return (p) => {
    const cx = Math.floor((p.x - x0) / cell), cy = Math.floor((p.y - y0) / cell);
    return cx < 0 || cy < 0 || cx >= W || cy >= H || outside[cy * W + cx] === 1;
  };
}

export function boundsOf(points) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
