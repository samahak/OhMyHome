// 둘러보기용 걸을 수 있는 칸 지도 — DOM 없이 돈다.
// 도면을 cell(mm) 칸으로 나누고, 벽·가구에서 몸 반지름(radius)만큼 떨어지지 않은 칸을 막는다.
// 벽들의 바깥 사각형 밖은 모두 막는다(창이 벽 틈으로 잡힌 도면에서 밖으로 나가지 않게).
import { wallCorners, furnitureParts, pointInPoly, distToSegment, boundsOf } from './geometry.js';

export function buildGrid(walls, furniture, { cell = 100, radius = 220, margin = 300 } = {}) {
  const b = boundsOf(walls.flatMap((w) => [w.a, w.b]));
  if (!b) return null;
  const x0 = b.minX - margin, y0 = b.minY - margin;
  const nx = Math.ceil((b.w + margin * 2) / cell), ny = Math.ceil((b.h + margin * 2) / cell);
  const blocked = new Uint8Array(nx * ny);
  const g = { cell, x0, y0, nx, ny, blocked, bounds: b };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = centerOf(g, i, j);
      if (c.x < b.minX || c.x > b.maxX || c.y < b.minY || c.y > b.maxY) blocked[j * nx + i] = 1;
    }
  }
  // 높이 걸린 것(벽걸이 등)과 커튼 봉(천을 젖히고 지나간다)은 걸어서 지나갈 수 있다
  const polys = walls.map((w) => wallCorners(w))
    .concat(furniture.filter((f) => !f.disabled && (f.elev || 0) < 1200 && f.type !== 'curtain_rod').flatMap((f) => furnitureParts(f)));
  for (const poly of polys) {
    const pb = boundsOf(poly);
    const i0 = Math.max(0, Math.floor((pb.minX - radius - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((pb.maxX + radius - x0) / cell));
    const j0 = Math.max(0, Math.floor((pb.minY - radius - y0) / cell)), j1 = Math.min(ny - 1, Math.floor((pb.maxY + radius - y0) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (blocked[k]) continue;
        const c = centerOf(g, i, j);
        if (pointInPoly(c, poly) || edgeDist(c, poly) <= radius) blocked[k] = 1;
      }
    }
  }
  return g;
}

function edgeDist(p, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]).dist);
  return d;
}

export function cellOf(g, p) {
  return [Math.floor((p.x - g.x0) / g.cell), Math.floor((p.y - g.y0) / g.cell)];
}
export function centerOf(g, i, j) {
  return { x: g.x0 + (i + 0.5) * g.cell, y: g.y0 + (j + 0.5) * g.cell };
}
function inside(g, i, j) { return i >= 0 && j >= 0 && i < g.nx && j < g.ny; }
function freeCell(g, i, j) { return inside(g, i, j) && !g.blocked[j * g.nx + i]; }

export function isFree(g, p) {
  const [i, j] = cellOf(g, p);
  return freeCell(g, i, j);
}

/** p에서 가장 가까운 빈 칸의 가운데 (maxCells 칸 안에 없으면 null) */
export function nearestFree(g, p, maxCells = 25) {
  const [ci, cj] = cellOf(g, p);
  if (freeCell(g, ci, cj)) return { x: p.x, y: p.y };
  for (let r = 1; r <= maxCells; r++) {
    let best = null;
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !freeCell(g, i, j)) continue;
        const c = centerOf(g, i, j);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (!best || d < best.d) best = { d, c };
      }
    }
    if (best) return best.c;
  }
  return null;
}

/** a–b 직선이 빈 칸으로만 지나가는지 */
export function lineFree(g, a, b) {
  const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / (g.cell / 2)));
  for (let k = 0; k <= n; k++) {
    if (!isFree(g, { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })) return false;
  }
  return true;
}

const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

/** A* 길 찾기 → mm 점 목록 (직선으로 이어도 되는 곳은 줄인다). 길이 없으면 null */
export function findPath(g, from, to) {
  const a = nearestFree(g, from), b = nearestFree(g, to);
  if (!a || !b) return null;
  const [si, sj] = cellOf(g, a), [ti, tj] = cellOf(g, b);
  const N = g.nx * g.ny, start = sj * g.nx + si, goal = tj * g.nx + ti;
  const cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const h = (k) => {
    const dx = Math.abs((k % g.nx) - ti), dy = Math.abs(Math.floor(k / g.nx) - tj);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const heap = new MinHeap();
  cost[start] = 0;
  heap.push(start, h(start));
  while (heap.size) {
    const k = heap.pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === goal) break;
    const i = k % g.nx, j = Math.floor(k / g.nx);
    for (const [di, dj, c] of NB) {
      const ni = i + di, nj = j + dj;
      if (!freeCell(g, ni, nj)) continue;
      if (di && dj && (!freeCell(g, i + di, j) || !freeCell(g, i, j + dj))) continue; // 모서리 비껴가기 금지
      const nk = nj * g.nx + ni, nc = cost[k] + c;
      if (nc < cost[nk]) { cost[nk] = nc; prev[nk] = k; heap.push(nk, nc + h(nk)); }
    }
  }
  if (!done[goal]) return null;
  const cells = [];
  for (let k = goal; k !== -1; k = prev[k]) cells.push(centerOf(g, k % g.nx, Math.floor(k / g.nx)));
  cells.reverse();
  const pts = [a, ...cells.slice(1, -1), b];
  // 줄 당기기: 직선으로 닿는 가장 먼 점까지 건너뛴다
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineFree(g, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/**
 * start에서 걸어서 갈 수 있는 곳 가운데 '방 한가운데' 같은 자리들을 고른다.
 * 벽에서 가장 먼 칸(거리 변환의 봉우리)을 넓은 순으로 뽑는다. 이미 뽑은 곳과 벽 없이 서로 보이고
 * sameRoom보다 가까우면 같은 방으로 보고 버린다(벽 하나 건너 욕실은 따로 남는다). minGap보다 가까우면 무조건 버린다.
 * 서로 보이는지는 sightGrid(보통 가구를 뺀 벽만의 지도)로 잰다.
 * 돌아볼 순서는 start에서 가까운 곳부터 이어 간다.
 */
export function roomCenters(g, start, { minClear = 450, sameRoom = 3200, minGap = 800, skipNear = 1500, max = 12, sightGrid = g } = {}) {
  const { nx, ny } = g, N = nx * ny;
  // 걸어서 닿는 칸
  const reach = new Uint8Array(N);
  const s = nearestFree(g, start);
  if (!s) return [];
  const [si, sj] = cellOf(g, s);
  const queue = [sj * nx + si];
  reach[queue[0]] = 1;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % nx, j = Math.floor(k / nx);
    for (const [di, dj] of NB.slice(0, 4)) {
      const ni = i + di, nj = j + dj, nk = nj * nx + ni;
      if (freeCell(g, ni, nj) && !reach[nk]) { reach[nk] = 1; queue.push(nk); }
    }
  }
  const dist = clearance(g);
  const cand = [];
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i;
    if (!reach[k] || dist[k] * g.cell < minClear) continue;
    let peak = true;
    for (const [di, dj] of NB) if (dist[(j + dj) * nx + i + di] > dist[k]) { peak = false; break; }
    if (peak) cand.push({ ...centerOf(g, i, j), d: dist[k] });
  }
  cand.sort((p, q) => q.d - p.d);
  const picked = [];
  for (const c of cand) {
    if (Math.hypot(c.x - s.x, c.y - s.y) < skipNear) continue;
    if (picked.some((p) => {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      return d < minGap || (d < sameRoom && lineFree(sightGrid, p, c));
    })) continue;
    picked.push(c);
    if (picked.length >= max) break;
  }
  return orderByWalk(g, s, picked).map((p) => ({ x: p.x, y: p.y }));
}

/** 막힌 칸까지의 거리 (두 번 훑는 근사 거리 변환, 칸 단위) */
export function clearance(g) {
  const { nx, ny } = g, N = nx * ny;
  const dist = new Float32Array(N);
  for (let k = 0; k < N; k++) dist[k] = g.blocked[k] ? 0 : 1e9;
  const relax = (k, ni, nj, c) => { if (inside(g, ni, nj)) dist[k] = Math.min(dist[k], dist[nj * nx + ni] + c); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    relax(k, i - 1, j, 1); relax(k, i, j - 1, 1); relax(k, i - 1, j - 1, Math.SQRT2); relax(k, i + 1, j - 1, Math.SQRT2);
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i;
    relax(k, i + 1, j, 1); relax(k, i, j + 1, 1); relax(k, i + 1, j + 1, Math.SQRT2); relax(k, i - 1, j + 1, Math.SQRT2);
  }
  return dist;
}

/**
 * 빈 칸을 이어진 덩어리(구역)로 나눈다 (4방향). 문을 벽으로 막은 지도에 쓰면 방마다 한 구역이 된다.
 * 반환 { label: Int32Array(칸마다 구역 번호, 막힌 칸 -1), sizes: [구역마다 칸 수] }
 */
export function zonesOf(g) {
  const { nx, ny } = g, N = nx * ny;
  const label = new Int32Array(N).fill(-1), sizes = [];
  for (let k0 = 0; k0 < N; k0++) {
    if (g.blocked[k0] || label[k0] >= 0) continue;
    const z = sizes.length, queue = [k0];
    label[k0] = z;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], i = k % nx, j = Math.floor(k / nx);
      for (const [di, dj] of NB.slice(0, 4)) {
        const ni = i + di, nj = j + dj, nk = nj * nx + ni;
        if (freeCell(g, ni, nj) && label[nk] < 0) { label[nk] = z; queue.push(nk); }
      }
    }
    sizes.push(queue.length);
  }
  return { label, sizes };
}

/**
 * 들를 순서: 실제 걷는 거리로 가까운 곳부터 고른 뒤(욕심 순서), 동선이 꼬인 곳을 뒤집어 펴서(2-opt) 줄인다.
 * 출발점은 고정이고 끝은 열려 있다. 점에 붙은 다른 값은 그대로 둔다.
 */
export function orderByWalk(g, start, pts) {
  const all = [start, ...pts];
  const at = (steps, p) => { const [i, j] = cellOf(g, p); return inside(g, i, j) ? steps[j * g.nx + i] : Infinity; };
  const D = all.map((a) => { const st = walkSteps(g, a); return all.map((b) => at(st, b)); });
  const BIG = 1e6, d = (i, j) => (isFinite(D[i][j]) ? D[i][j] : BIG);
  // 욕심 순서
  const order = [0], left = new Set(pts.map((_, i) => i + 1));
  while (left.size) {
    const cur = order[order.length - 1];
    let best = null;
    for (const k of left) if (best === null || d(cur, k) < d(cur, best)) best = k;
    order.push(best);
    left.delete(best);
  }
  // 2-opt: 구간을 뒤집어 전체 거리가 줄면 받아들인다
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const a = order[i - 1], b = order[i], c = order[j], e = order[j + 1];
        const before = d(a, b) + (e === undefined ? 0 : d(c, e));
        const after = d(a, c) + (e === undefined ? 0 : d(b, e));
        if (after < before - 1e-9) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return order.slice(1).map((k) => all[k]);
}

/** from에서 각 칸까지 걸어서 몇 칸인지 (4방향, 못 가면 Infinity) */
export function walkSteps(g, from) {
  const { nx } = g;
  const steps = new Float32Array(nx * g.ny).fill(Infinity);
  const [si, sj] = cellOf(g, from);
  if (!freeCell(g, si, sj)) return steps;
  const queue = [sj * nx + si];
  steps[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % nx, j = Math.floor(k / nx);
    for (const [di, dj] of NB.slice(0, 4)) {
      const ni = i + di, nj = j + dj, nk = nj * nx + ni;
      if (freeCell(g, ni, nj) && steps[nk] === Infinity) { steps[nk] = steps[k] + 1; queue.push(nk); }
    }
  }
  return steps;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v, top = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
