// 평면 기하 — 모든 좌표는 mm, y는 아래로 증가한다(도면 이미지와 같은 방향).
// 가구 회전 rot(도)은 화면에서 시계 방향이다. 가구의 앞면은 로컬 +y(= 3D의 +z)다.

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

/** 벽이나 다른 가구와 겹치는 가구 id 집합. 맞닿기만 한 것은 겹침이 아니다. */
export function findCollisions(furniture, walls) {
  const bad = new Set();
  const fc = furniture.map((f) => furnitureCorners(f, 2));
  const wc = walls.map((w) => wallCorners(w, 1));
  furniture.forEach((f, i) => {
    for (const w of wc) {
      if (convexOverlap(fc[i], w)) { bad.add(f.id); break; }
    }
    for (let j = i + 1; j < furniture.length; j++) {
      const g = furniture[j];
      const vertical = f.elev < g.elev + g.h && g.elev < f.elev + f.h;
      if (vertical && convexOverlap(fc[i], fc[j])) { bad.add(f.id); bad.add(g.id); }
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
function rayHit(p, dx, dy, poly) {
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

export function boundsOf(points) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
