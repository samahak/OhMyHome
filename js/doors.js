// 문 자동 찾기 — DOM 없이 돈다.
//   벽 끝에서 벽 방향으로 쏜 반직선이 다른 벽에 문 폭(500~1,300mm)만큼 떨어져 닿으면 그 사이가 문 후보 틈이다.
//   도면 이미지에서 그 틈에 여닫이 문 기호(벽 면에서 수직으로 선 문짝 선 + 4분의 1 호)가 그려져 있으면 문으로 본다.
//   경첩(틈 양 끝 중 어느 쪽) × 열리는 쪽(틈 양쪽 중 어느 쪽) 네 가지를 모두 그려 보고 이미지와 가장 잘 맞는 것을 고른다.
// 문 { a, b, t, swing, style? } — a: 경첩 끝, b: 반대 끝(벽 중심선 위), swing: 문짝이 a→b의 왼쪽 법선 n=(-uy, ux) 쪽(1)인지 반대쪽(-1)인지.
//   style 없음: 여닫이. 'sliding': 미닫이 — 문짝이 swing 쪽 벽 면에 붙어 a 쪽으로 밀려 열린다(틈이 SLIDE.twoOver보다 넓으면 두 짝이 양쪽으로).
//   'middle': 현관 중문 — 유리 3연동 미닫이. 세 짝이 swing 쪽에 레일 셋으로 겹쳐 a 쪽으로 모이며 열린다.
//   미닫이 기호(평행한 두 선)는 찾지 않는다 — 🚪 문 도구로 달고 속성에서 바꾼다. 중문은 findMiddleDoorGap()이 자리를 찾는다.
import * as G from './geometry.js';

const MIN_W = 500, MAX_W = 1300;
const DARK = 180;          // 이보다 어두운 픽셀을 선으로 본다 (방 바탕색은 230 넘게 밝다)
const ARC_OK = 0.6, LEAF_OK = 0.5;

/** 벽 끝에서 쏜 반직선이 다른 벽에 닿는 틈 (같은 틈은 한 번만) */
export function doorGaps(walls, { min = MIN_W, max = MAX_W } = {}) {
  const polys = walls.map((w) => G.wallCorners(w));
  const gaps = [];
  walls.forEach((w, i) => {
    const len = G.dist(w.a, w.b);
    if (!len) return;
    const ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len, ext = w.cap ? w.t / 2 : 0;
    for (const [end, dx, dy] of [[w.b, ux, uy], [w.a, -ux, -uy]]) {
      const e = { x: end.x + dx * ext, y: end.y + dy * ext };
      const from = { x: e.x + dx, y: e.y + dy };
      let d = Infinity;
      polys.forEach((poly, k) => { if (k !== i) d = Math.min(d, G.rayHit(from, dx, dy, poly)); });
      d += 1;
      if (!(d >= min && d <= max)) continue;
      const b = { x: e.x + dx * d, y: e.y + dy * d }, mid = { x: (e.x + b.x) / 2, y: (e.y + b.y) / 2 };
      if (gaps.some((g) => G.dist(g.mid, mid) < 150)) continue;
      gaps.push({ a: e, b, t: w.t, mid });
    }
  });
  return gaps;
}

/** 문의 문짝·호를 그릴 점들 (mm). 경첩은 벽 면 위, 문짝은 문 폭 길이로 벽에 수직 */
export function doorGeometry(door) {
  const len = G.dist(door.a, door.b) || 1;
  const ux = (door.b.x - door.a.x) / len, uy = (door.b.y - door.a.y) / len;
  const nx = -uy * door.swing, ny = ux * door.swing;
  const hinge = { x: door.a.x + nx * door.t / 2, y: door.a.y + ny * door.t / 2 };
  const tip = { x: hinge.x + nx * len, y: hinge.y + ny * len };
  const arc = (deg) => {
    const r = deg * G.DEG;
    return { x: hinge.x + (ux * Math.cos(r) + nx * Math.sin(r)) * len, y: hinge.y + (uy * Math.cos(r) + ny * Math.sin(r)) * len };
  };
  return { len, u: { x: ux, y: uy }, n: { x: nx, y: ny }, hinge, tip, arc };
}

/** 미닫이 문짝 치수 (mm): 두께, 벽 면에서 띄움, 이 폭을 넘는 틈은 두 짝, 문틀에 걸치는 길이, 중문 짝끼리 겹치는 길이·레일 간격 */
export const SLIDE = { t: 40, gap: 15, twoOver: 1300, overlap: 30, middleLap: 50, track: 10 };
export const DOOR_STYLES = { swing: '여닫이', sliding: '미닫이', middle: '중문' };
export const doorStyle = (d) => (DOOR_STYLES[d?.style] ? d.style : 'swing');

/**
 * 미닫이·중문 문짝 자리 (mm). at(s, o): a에서 틈 방향으로 s, 벽 중심선에서 swing 쪽으로 o만큼 간 점.
 * panels: 닫힌 자리 [s0, s1], 문짝 가운데 줄의 벽 중심선에서 거리 off, 열린 자리까지 밀 길이 shift(-: a 쪽), arrow(2D 화살표 그릴 짝).
 * reach: 가장 바깥 문짝 바깥 면까지 거리.
 */
export function slidingPanels(door) {
  const g = doorGeometry(door), L = g.len, o = SLIDE.overlap, T = SLIDE.t;
  const off0 = door.t / 2 + SLIDE.gap + T / 2;
  const at = (s, d = off0) => ({ x: door.a.x + g.u.x * s + g.n.x * d, y: door.a.y + g.u.y * s + g.n.y * d });
  let panels;
  if (doorStyle(door) === 'middle') {
    // 3연동: a 끝 짝(벽 쪽 레일)은 그대로, 나머지 둘이 그 위로 겹쳐 모인다
    const lap = SLIDE.middleLap, w = (L + 2 * o + 2 * lap) / 3;
    panels = [0, 1, 2].map((k) => {
      const s0 = -o + k * (w - lap);
      return { s0, s1: s0 + w, off: off0 + k * (T + SLIDE.track), shift: -k * (w - lap), arrow: k === 2 };
    });
  } else if (L > SLIDE.twoOver) {
    const w = L / 2 + o + o / 2;
    panels = [{ s0: -o, s1: L / 2 + o / 2, shift: -w * 0.92 }, { s0: L / 2 - o / 2, s1: L + o, shift: w * 0.92 }]
      .map((pn) => ({ ...pn, off: off0, arrow: true }));
  } else {
    panels = [{ s0: -o, s1: L + o, off: off0, shift: -(L + 2 * o) * 0.92, arrow: true }];
  }
  const reach = Math.max(...panels.map((pn) => pn.off)) + T / 2;
  return { ...g, off: off0, at, panels, reach };
}

/**
 * 문을 문 폭에 수직(양옆 벽을 따라)으로 dist mm 옮긴 자리 { a, b } — 새 가운데에서 문 방향 양쪽으로 쏜 반직선이 닿는 벽까지로
 * 폭을 다시 맞춘다(a·b 순서는 그대로). 양쪽 다 벽이 없거나 폭이 MIN_W보다 좁으면(벽 속 등) null.
 * dist의 +는 a→b의 왼쪽 법선 (-uy, ux) 쪽.
 */
export function moveDoorAlong(door, walls, dist) {
  const len = G.dist(door.a, door.b) || 1, ux = (door.b.x - door.a.x) / len, uy = (door.b.y - door.a.y) / len;
  const m = { x: (door.a.x + door.b.x) / 2 - uy * dist, y: (door.a.y + door.b.y) / 2 + ux * dist };
  const polys = walls.map((w) => G.wallCorners(w));
  if (polys.some((poly) => G.pointInPoly(m, poly))) return null;
  const reach = (dx, dy) => Math.min(...polys.map((poly) => G.rayHit(m, dx, dy, poly)));
  const da = reach(-ux, -uy), db = reach(ux, uy);
  if (!isFinite(da) || !isFinite(db) || da + db < MIN_W || da + db > MAX_W * 2.5) return null;
  return { a: { x: m.x - ux * da, y: m.y - uy * da }, b: { x: m.x + ux * db, y: m.y + uy * db } };
}

/** 문 가운데가 현관문 줄에서 집 안쪽으로 들어간 거리 (mm). 현관문이 없으면 null */
export function depthFromEntrance(door, entrance) {
  if (!entrance) return null;
  const e = entrance, mx = (door.a.x + door.b.x) / 2, my = (door.a.y + door.b.y) / 2;
  return -((mx - (e.a.x + e.b.x) / 2) * e.out.x + (my - (e.a.y + e.b.y) / 2) * e.out.y);
}

/**
 * 현관 중문 자리: 현관문 안쪽의 벽 틈. 현관문 바로 안쪽 점이 든 방 영역(보통 '현관')이 있으면 그 방 가장자리에 걸친 틈,
 * 없으면 현관문과 나란하고 0.6~3.5m 안쪽에 있는 틈 가운데 가장 가까운 것. 문짝은 현관 반대쪽(집 안쪽)에 붙인다.
 * @returns { a, b, t, swing } | null
 */
export function findMiddleDoorGap(plan) {
  const e = plan.entrance;
  if (!e) return null;
  const em = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, eu = G.dist(e.a, e.b) || 1;
  const eux = (e.b.x - e.a.x) / eu, euy = (e.b.y - e.a.y) / eu;
  const room = (plan.rooms || []).find((r) => G.pointInPoly({ x: em.x - e.out.x * 300, y: em.y - e.out.y * 300 }, r.pts));
  const wins = plan.windows || [];
  const cands = doorGaps(plan.walls, { min: 700, max: 2400 }).filter((g) => {
    const depth = -((g.mid.x - em.x) * e.out.x + (g.mid.y - em.y) * e.out.y);
    return depth > 300 && depth < 4000 && !wins.some((w) => G.distToSegment(g.mid, w.a, w.b).dist < 200);
  });
  const edgeDist = (p, pts) => Math.min(...pts.map((q, i) => G.distToSegment(p, q, pts[(i + 1) % pts.length]).dist));
  let best = null;
  for (const g of cands) {
    const depth = -((g.mid.x - em.x) * e.out.x + (g.mid.y - em.y) * e.out.y);
    const len = G.dist(g.a, g.b), par = Math.abs(((g.b.x - g.a.x) * eux + (g.b.y - g.a.y) * euy) / len);
    let score;
    if (room) {
      const ed = edgeDist(g.mid, room.pts);
      if (ed > 250) continue;
      score = ed + (1 - par) * 500;
    } else {
      if (depth < 600 || depth > 3500 || par < 0.7) continue;
      score = depth;
    }
    if (!best || score < best.score) best = { g, score };
  }
  if (!best) return null;
  const { a, b, t, mid } = best.g;
  const nx = -(b.y - a.y), ny = b.x - a.x;
  const swing = nx * (mid.x - em.x) + ny * (mid.y - em.y) >= 0 ? 1 : -1;   // 현관에서 멀어지는 쪽
  return { a, b, t, swing };
}

/** 이미지 위 mm 점 근처(법선 방향 ±tol mm)에 어두운 선이 있는지 */
function darkNear(img, mmPerPx, p, dir, tol) {
  const steps = Math.max(1, Math.round(tol / mmPerPx));
  for (let k = -steps; k <= steps; k++) {
    const x = Math.round((p.x + dir.x * k * mmPerPx) / mmPerPx), y = Math.round((p.y + dir.y * k * mmPerPx) / mmPerPx);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const i = (y * img.width + x) * 4, d = img.data;
    if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < DARK) return true;
  }
  return false;
}

/** 문 기호가 이미지와 얼마나 맞는지 { arc, leaf } (0~1, 선 위에 어두운 픽셀이 있는 표본의 비율) */
function symbolScore(door, img, mmPerPx) {
  const g = doorGeometry(door), tol = Math.max(2 * mmPerPx, 25);
  let arc = 0, leaf = 0;
  const A = 16, L = 10;
  for (let i = 0; i < A; i++) {
    const deg = 10 + (70 * i) / (A - 1);   // 벽에 붙은 양 끝은 빼고 잰다
    const p = g.arc(deg);
    const r = { x: (p.x - g.hinge.x) / g.len, y: (p.y - g.hinge.y) / g.len };
    if (darkNear(img, mmPerPx, p, r, tol)) arc++;
  }
  for (let i = 0; i < L; i++) {
    const s = 0.15 + (0.75 * i) / (L - 1);
    if (darkNear(img, mmPerPx, { x: g.hinge.x + g.n.x * g.len * s, y: g.hinge.y + g.n.y * g.len * s }, g.u, tol)) leaf++;
  }
  return { arc: arc / A, leaf: leaf / L };
}

/**
 * 도면 이미지에서 여닫이 문 기호가 그려진 틈을 찾아 문으로 돌려준다. 창 자리 틈은 뺀다.
 * @param img { data, width, height } — 도면 이미지 픽셀(원본 크기). 없으면 찾지 않는다(빈 목록).
 */
export function findDoors(plan, img) {
  if (!img) return [];
  const wins = plan.windows || [];
  const out = [];
  for (const gap of doorGaps(plan.walls)) {
    if (wins.some((w) => G.distToSegment(gap.mid, w.a, w.b).dist < 200)) continue;
    let best = null;
    for (const [a, b] of [[gap.a, gap.b], [gap.b, gap.a]]) {
      for (const swing of [1, -1]) {
        const door = { a, b, t: gap.t, swing };
        const s = symbolScore(door, img, plan.mmPerPx);
        const score = s.arc * 0.65 + s.leaf * 0.35;
        if (s.arc >= ARC_OK && s.leaf >= LEAF_OK && (!best || score > best.score)) best = { door, score };
      }
    }
    if (best) out.push(best.door);
  }
  return out;
}
