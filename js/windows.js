// 창 자동 찾기 — DOM 없이 돈다.
//   1) 벽 위의 밝은 구간: 도면 이미지에서 창은 벽 자리에 연한 색(흰 바탕 + 가는 선, 연회색 줄무늬)으로 그려진다.
//      벽 중심선을 따라가며 벽 두께 안쪽 픽셀 밝기를 재어, 벽 평균보다 뚜렷이 밝은 구간을 창으로 본다.
//      (직접 그린 벽이나 샘플처럼 창 자리까지 벽으로 덮은 경우)
//   2) 바깥벽의 틈: 이미지에서 인식한 벽은 창 자리가 지워져 틈으로 남는다 (G.findWindowGaps).
// 어느 쪽이든 한쪽이 집 바깥에 닿는 구간만 창으로 친다 — 안쪽 문 자리를 창으로 잘못 막지 않게.
import * as G from './geometry.js';

const STEP = 20;          // 벽을 따라 재는 간격 mm
const MIN_W = 400, MAX_W = 6000;

/** 이미지 위 mm 점의 밝기 (0~255, 이미지 밖이면 null) */
function lumAt(img, mmPerPx, x, y) {
  const px = Math.round(x / mmPerPx), py = Math.round(y / mmPerPx);
  if (px < 0 || py < 0 || px >= img.width || py >= img.height) return null;
  const i = (py * img.width + px) * 4, d = img.data;
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/** 벽마다 중심선을 따라 STEP 간격으로 벽 두께 안쪽 밝기(가로지른 다섯 점의 중앙값)를 잰다 */
function profiles(img, mmPerPx, walls) {
  return walls.map((w) => {
    const d = G.dist(w.a, w.b);
    if (!d) return null;
    const u = { x: (w.b.x - w.a.x) / d, y: (w.b.y - w.a.y) / d }, n = { x: -u.y, y: u.x };
    const ext = w.cap ? w.t / 2 : 0, len = d + 2 * ext, o = { x: w.a.x - u.x * ext, y: w.a.y - u.y * ext };
    const vals = [];
    for (let s = STEP / 2; s < len; s += STEP) {
      const cross = [];
      for (const k of [-0.3, -0.15, 0, 0.15, 0.3]) {
        const v = lumAt(img, mmPerPx, o.x + u.x * s + n.x * w.t * k, o.y + u.y * s + n.y * w.t * k);
        if (v != null) cross.push(v);
      }
      vals.push(cross.length ? median(cross) : null);
    }
    return { w, o, u, n, len, vals };
  });
}

/** 벽 위의 밝은 구간 → 창 후보 [{ a, b, t }]. 벽 양 끝에 닿은 구간은 벽이 그림과 어긋난 것으로 보고 뺀다 */
export function lightWallRuns(img, mmPerPx, walls) {
  const prof = profiles(img, mmPerPx, walls).filter(Boolean);
  const all = prof.flatMap((p) => p.vals.filter((v) => v != null));
  if (!all.length) return [];
  const wallLum = median(all);
  const light = wallLum + Math.max(45, (255 - wallLum) * 0.3);
  const out = [];
  for (const p of prof) {
    const n = p.vals.length;
    let i = 0;
    while (i < n) {
      if (!(p.vals[i] >= light)) { i++; continue; }
      let j = i;
      // 창 안의 가는 선·창틀 때문에 한두 칸 어두운 곳은 이어 붙인다
      while (j + 1 < n && (p.vals[j + 1] >= light || (j + 3 < n && p.vals[j + 3] >= light && p.vals[j + 2] >= light))) j++;
      const s0 = i * STEP, s1 = (j + 1) * STEP, wlen = s1 - s0;
      if (i > 1 && j < n - 2 && wlen >= MIN_W && wlen <= MAX_W) {
        out.push({
          a: { x: p.o.x + p.u.x * s0, y: p.o.y + p.u.y * s0 },
          b: { x: p.o.x + p.u.x * s1, y: p.o.y + p.u.y * s1 },
          t: p.w.t,
        });
      }
      i = j + 1;
    }
  }
  return out;
}

/**
 * 창 자리 찾기: 이미지의 밝은 구간(이미지가 있을 때) + 바깥벽 틈. 집 바깥에 닿지 않는 구간과 현관문 자리는 뺀다.
 * @param img { data, width, height } | null — 도면 이미지 픽셀(원본 크기)
 */
export function findWindows(plan, img) {
  const e = plan.entrance;
  // 현관문과 이미 단 문(plan.doors) 자리는 창이 아니다 — 현관을 아직 안 정한 벽 인식 직후에는 현관문 틈이 바깥에 닿아 창으로 잡혀,
  // 그 자리의 문 기호를 문으로 달지 못했다(findDoors는 창 자리 틈을 뺀다)
  const mid = (d) => ({ x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 });
  const skip = (e ? [mid(e)] : []).concat((plan.doors || []).filter((d) => G.dist(d.a, d.b) > 0).map(mid));
  const gaps = G.findWindowGaps(plan.walls, { skip });
  let runs = img ? lightWallRuns(img, plan.mmPerPx, plan.walls) : [];
  if (runs.length) {
    // 바깥 판정: 벽 + 모든 틈(문 포함)을 막은 지도. 문 틈은 findDoorGap 범위의 틈을 다 막아 둔다
    const closers = G.findWindowGaps(plan.walls, { skip: [], outsideOnly: false });
    const polys = plan.walls.concat(closers, e ? [{ a: e.a, b: e.b, t: e.t }] : []).map((w) => G.wallCorners({ ...w, cap: !!w.cap }));
    const isOutside = G.outsideTester(polys);
    runs = runs.filter((r) => {
      const mid = { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 };
      if (skip.some((s) => G.distToSegment(s, r.a, r.b).dist < 300)) return false;
      const len = G.dist(r.a, r.b), nx = -(r.b.y - r.a.y) / len, ny = (r.b.x - r.a.x) / len, k = r.t / 2 + 90;
      return isOutside({ x: mid.x + nx * k, y: mid.y + ny * k }) || isOutside({ x: mid.x - nx * k, y: mid.y - ny * k });
    });
  }
  // 겹치는 것은 하나만
  const out = [];
  for (const c of runs.concat(gaps)) {
    const mid = { x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 };
    if (!out.some((o) => G.distToSegment(mid, o.a, o.b).dist < 150)) out.push(c);
  }
  return out;
}
