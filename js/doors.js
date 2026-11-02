// 문 자동 찾기 — DOM 없이 돈다.
//   벽 끝에서 벽 방향으로 쏜 반직선이 다른 벽에 문 폭(500~1,300mm)만큼 떨어져 닿으면 그 사이가 문 후보 틈이다.
//   도면 이미지에서 그 틈에 여닫이 문 기호(벽 면에서 수직으로 선 문짝 선 + 4분의 1 호)가 그려져 있으면 문으로 본다.
//   경첩(틈 양 끝 중 어느 쪽) × 열리는 쪽(틈 양쪽 중 어느 쪽) 네 가지를 모두 그려 보고 이미지와 가장 잘 맞는 것을 고른다.
// 문 { a, b, t, swing } — a: 경첩 끝, b: 반대 끝(벽 중심선 위), swing: 문짝이 a→b의 왼쪽 법선 n=(-uy, ux) 쪽(1)인지 반대쪽(-1)인지.
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
