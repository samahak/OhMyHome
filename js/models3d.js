// 샘플 가구의 3D 모양. 단위는 m, 원점은 바닥 사각형 가운데, 앞면은 +z.
// 모양은 박스·원기둥 몇 개로 단순하게 만들고 크기(W·D·H)에 맞춰 늘린다.
import * as THREE from 'three';
import { lCounterDepth, lLegDepth, plantOf, WARDROBE_STYLES, wardrobeStyle, mixStyles, COUNTER_TOP, rodDrape } from './catalog.js';

// 같은 지오메트리를 여러 메시가 scale만 바꿔 함께 쓴다 (disposeObject가 버리지 않는다)
const geoCache = new Map();
function sharedGeo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
function boxGeo() { return sharedGeo('box', () => new THREE.BoxGeometry(1, 1, 1)); }

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, ...opts });
}

function shade(color, k) {
  const c = new THREE.Color(color);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * k)));
  return c;
}

/** 크기 w×h×d 박스를 (x,y,z)에 중심을 두고 넣는다 */
function box(g, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(boxGeo(), material);
  m.scale.set(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

function cylZ(g, r, len, x, y, z, material, seg = 32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

const METAL = () => mat('#b8bec7', { metalness: 0.7, roughness: 0.3 });
const DARK = () => mat('#2a2e35', { roughness: 0.5 });
const GROOVE = () => mat('#555b64', { roughness: 0.9 });
// 거울: 비출 주변 환경이 없어서 금속성을 높이면 검게 보인다 → 밝은 회청색으로 '거울 느낌'만 낸다
const MIRROR = () => mat('#dde5eb', { metalness: 0.3, roughness: 0.12 });

/* ---------- 모양들 ---------- */

function fridge(g, W, D, H, c, side) {
  const body = mat(c, { metalness: 0.35, roughness: 0.35 });
  box(g, W, H, D, 0, H / 2, 0, body);
  const f = D / 2;
  const groove = GROOVE(), metal = METAL();
  if (side) {
    box(g, 0.006, H * 0.97, 0.004, 0, H / 2, f + 0.002, groove);
    for (const s of [-1, 1]) box(g, 0.022, H * 0.42, 0.03, s * 0.045, H * 0.56, f + 0.02, metal);
  } else {
    const split = H * 0.62;
    box(g, W * 0.98, 0.006, 0.004, 0, split, f + 0.002, groove);
    box(g, 0.022, H * 0.2, 0.03, W / 2 - 0.06, split + H * 0.13, f + 0.02, metal);
    box(g, 0.022, H * 0.2, 0.03, W / 2 - 0.06, split - H * 0.14, f + 0.02, metal);
  }
}

function kimchi(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c, { metalness: 0.25, roughness: 0.4 }));
  const groove = GROOVE();
  box(g, 0.006, 0.004, D * 0.96, 0, H + 0.002, 0, groove);
  box(g, W * 0.98, 0.004, 0.006, 0, H + 0.002, D * 0.15, groove);
  box(g, W * 0.96, H * 0.08, 0.01, 0, H * 0.9, D / 2 + 0.005, mat(shade(c, 0.85)));
}

/** 스탠드형 김치냉장고: 위 칸 양문 + 아래 서랍 두 개 */
function kimchiStand(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c, { metalness: 0.3, roughness: 0.38 }));
  const f = D / 2, groove = GROOVE(), metal = METAL();
  const top = H * 0.56, mid = H * 0.29;
  box(g, 0.006, H - top - 0.01, 0.004, 0, (top + H) / 2, f + 0.002, groove);
  for (const y of [top, mid]) box(g, W * 0.98, 0.006, 0.004, 0, y, f + 0.002, groove);
  for (const s of [-1, 1]) box(g, 0.022, (H - top) * 0.45, 0.03, s * 0.045, top + (H - top) * 0.45, f + 0.02, metal);
  for (const y of [top - 0.06, mid - 0.06]) box(g, W * 0.5, 0.022, 0.03, 0, y, f + 0.02, metal);
}

/** 드럼 문: 금속 테두리 + 어두운 유리 (f = 앞면 z) */
function drumDoor(g, R, cy, f) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.025, 12, 48), METAL());
  ring.position.set(0, cy, f + 0.02);
  ring.castShadow = true;
  g.add(ring);
  cylZ(g, R * 0.93, 0.02, 0, cy, f + 0.015, mat('#29384a', { metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.85 }));
}

function washer(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c, { roughness: 0.4, metalness: 0.15 }));
  const f = D / 2;
  box(g, W * 0.98, H * 0.12, 0.01, 0, H * 0.92, f + 0.005, mat(shade(c, 0.8)));
  drumDoor(g, Math.min(W, H) * 0.31, H * 0.47, f);
  cylZ(g, 0.035, 0.03, -W * 0.3, H * 0.92, f + 0.02, METAL());
}

/** 타워형 세탁건조기: 위 건조기 + 가운데 조작부 + 아래 세탁기를 한 몸으로 */
function washTower(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c, { roughness: 0.4, metalness: 0.15 }));
  const f = D / 2, panel = H * 0.07, half = (H - panel) / 2;
  box(g, W * 0.98, panel, 0.01, 0, half + panel / 2, f + 0.005, mat(shade(c, 0.72)));
  box(g, W * 0.3, panel * 0.45, 0.004, 0, half + panel / 2, f + 0.012, mat('#3b8fd9', { emissive: '#1b5fa0', emissiveIntensity: 0.5 }));
  const R = Math.min(W, half) * 0.32;
  drumDoor(g, R, half * 0.48, f);                 // 아래 세탁기
  drumDoor(g, R, half + panel + half * 0.52, f);  // 위 건조기
  box(g, W * 0.98, 0.006, 0.004, 0, half + panel + half - 0.03, f + 0.002, GROOVE());
}

function topWasher(g, W, D, H, c) {
  const bodyH = H * 0.9;
  box(g, W, bodyH, D, 0, bodyH / 2, 0, mat(c, { roughness: 0.4 }));
  box(g, W * 0.86, 0.02, D * 0.62, 0, bodyH + 0.01, D * 0.12, mat('#9fb4c8', { roughness: 0.2, transparent: true, opacity: 0.85 }));
  box(g, W, H - bodyH, D * 0.2, 0, bodyH + (H - bodyH) / 2, -D / 2 + D * 0.1, mat(shade(c, 0.82)));
}

/** 막대(옷걸이 봉)를 x축 방향으로 */
function cylX(g, r, len, x, y, z, material) {
  const m = new THREE.Mesh(sharedGeo('cyl16', () => new THREE.CylinderGeometry(1, 1, 1, 16)), material);
  m.scale.set(r, len, r);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

const CLOTHES = ['#3d4a5c', '#c9b79c', '#7a8b99', '#e8e2d6', '#5b6e58', '#9c5a4a', '#2e2e33', '#b7c4cf', '#d8a7a0'];

/**
 * 붙박이장/옷장. f.wstyle(catalog.WARDROBE_STYLES): 통 · 분리형(위 짧은 문 + 아래 긴 문) · 2단/3단 서랍형(아래 서랍 + 위 문) ·
 * 믹스장(칸마다 위 모양 가운데 하나, catalog.mixStyles) · 냉장고장(fridgeCabinet).
 * f.noDoor면 문 없이 옆판·칸막이·뒤판만 두고 안에 선반·옷걸이 봉·걸린 옷을 보인다(서랍은 그대로).
 * 냉장고장(fridge): 옆판 + 위 짧은 장(문 또는 문 없으면 선반 칸)만 있고, 아래는 바닥판·걸레받이·뒤판 없이 바닥까지 트여 있다.
 */
function wardrobe(g, W, D, H, c, f = {}) {
  const style = wardrobeStyle(f);
  const body = mat(c, { roughness: 0.55 });
  if (style === 'fridge') { fridgeCabinet(g, W, D, H, body, !!f.noDoor); return; }
  const k = { g, D, H, fz: D / 2, base: 0.07, t: 0.018, body, groove: GROOVE(), metal: METAL(), seed: 0 };
  k.dh = Math.min(0.22, (H - k.base) * 0.12);   // 서랍 한 단 높이
  // 칸: 믹스장은 칸마다 모양이 다르고, 나머지는 가로 전체가 한 칸
  const parts = style === 'mix' ? mixStyles({ ...f, w: W * 1000 }) : [style];
  const sw = W / parts.length, secs = parts.map((st, i) => ({ st, x0: -W / 2 + sw * i, x1: -W / 2 + sw * (i + 1) }));
  box(g, W * 0.995, k.base, 0.01, 0, k.base / 2, k.fz - 0.004, mat(shade(c, 0.75)));   // 걸레받이

  if (!f.noDoor) {
    box(g, W, H, D, 0, H / 2, 0, body);
    for (let i = 1; i < secs.length; i++) box(g, 0.008, H - k.base, 0.004, secs[i].x0, k.base + (H - k.base) / 2, k.fz + 0.002, k.groove);   // 칸 경계
    for (const s of secs) closedSection(k, s.x0, s.x1, s.st);
    return;
  }
  // 문 없는 오픈형: 옆판·윗판·바닥·뒤판 + 칸 경계마다 칸막이
  const { t, base, fz } = k;
  for (const s of [-1, 1]) box(g, t, H, D, s * (W / 2 - t / 2), H / 2, 0, body);
  box(g, W, t, D, 0, H - t / 2, 0, body);
  box(g, W - 2 * t, base, D * 0.98, 0, base / 2, -0.006, mat(shade(c, 0.75)));
  box(g, W - 2 * t, H - base, 0.008, 0, base + (H - base) / 2, -fz + 0.004, mat(shade(c, 0.9), { roughness: 0.6 }));
  k.cloth = CLOTHES.map((x) => mat(x, { roughness: 0.9 }));
  for (let i = 1; i < secs.length; i++) box(g, t, H - base - t, D * 0.98, secs[i].x0, base + (H - base - t) / 2, 0, body);
  for (const s of secs) openSection(k, s.x0, s.x1, s.st);
}

/** 서랍: [x0, x1]을 cols칸 × nd단으로, 앞면 홈과 가로 손잡이 */
function wardrobeDrawers(k, x0, x1, nd, cols) {
  const { g, base, dh, fz, groove, metal } = k, w = x1 - x0, cw = w / cols, cx = (x0 + x1) / 2;
  for (let n = 1; n <= nd; n++) box(g, w * 0.98, 0.006, 0.004, cx, base + dh * n, fz + 0.002, groove);
  for (let j = 1; j < cols; j++) box(g, 0.006, nd * dh, 0.004, x0 + cw * j, base + nd * dh / 2, fz + 0.002, groove);
  for (let j = 0; j < cols; j++) {
    for (let n = 0; n < nd; n++) box(g, Math.min(0.24, cw * 0.35), 0.015, 0.02, x0 + cw * (j + 0.5), base + dh * (n + 0.55), fz + 0.012, metal);
  }
}

/** 문 달린 칸 하나 [x0, x1]: 문짝 홈·손잡이(분리형은 위아래), 서랍형은 아래 서랍 */
function closedSection(k, x0, x1, st) {
  const { g, H, base, dh, fz, groove, metal } = k, w = x1 - x0;
  const nd = WARDROBE_STYLES[st].drawers || 0, drawTop = base + nd * dh;
  const splitY = st === 'split' ? H - Math.min(0.6, H * 0.26) : null;
  const n = Math.max(1, Math.round(w / 0.55)), dw = w / n;
  for (let i = 1; i < n; i++) box(g, 0.006, H - drawTop, 0.004, x0 + dw * i, drawTop + (H - drawTop) / 2, fz + 0.002, groove);
  if (splitY) box(g, w * 0.98, 0.006, 0.004, (x0 + x1) / 2, splitY, fz + 0.002, groove);
  for (let i = 0; i < n; i++) {
    const left = x0 + dw * i;
    // 문 두 짝이 마주 보는 쪽에 손잡이를 단다
    const hx = n === 1 || i % 2 === 0 ? left + dw - 0.04 : left + 0.04;
    if (splitY) {
      const hl = Math.min(0.4, (splitY - drawTop) * 0.25);
      box(g, 0.018, hl, 0.025, hx, Math.min(1.05, (splitY + drawTop) / 2), fz + 0.015, metal);   // 아래 긴 문
      box(g, 0.018, 0.14, 0.025, hx, splitY + 0.1, fz + 0.015, metal);                           // 위 짧은 문(아래쪽에)
    } else {
      const hl = Math.min(0.5, (H - drawTop) * 0.25);
      box(g, 0.018, hl, 0.025, hx, Math.max(drawTop + hl / 2 + 0.08, Math.min(H * 0.5, drawTop + (H - drawTop) * 0.45)), fz + 0.015, metal);
    }
  }
  if (nd) wardrobeDrawers(k, x0, x1, nd, n >= 2 ? Math.floor(n / 2) : 1);
}

/** 문 없는 칸 하나 [x0, x1]: 아래 서랍, 맨 위 선반 + 갠 옷, 옷걸이 봉(분리형은 위아래 두 줄) + 걸린 옷. 900mm마다 칸막이 */
function openSection(k, x0, x1, st) {
  const { g, D, H, base, dh, t, body, cloth } = k;
  const nd = WARDROBE_STYLES[st].drawers || 0, drawTop = base + nd * dh;
  const cols = Math.max(1, Math.round((x1 - x0) / 0.9)), cw = (x1 - x0) / cols, cx = (x0 + x1) / 2, iw = x1 - x0 - t;
  for (let i = 1; i < cols; i++) box(g, t, H - base - t, D * 0.98, x0 + cw * i, base + (H - base - t) / 2, 0, body);
  if (nd) { box(g, iw, nd * dh, D, cx, base + nd * dh / 2, 0, body); wardrobeDrawers(k, x0 + t / 2, x1 - t / 2, nd, cols); }
  const topY = H - Math.min(0.32, H * 0.15), midY = (drawTop + topY) / 2;
  const rods = st === 'split'
    ? [{ y: topY - 0.06, bottom: midY + 0.03 }, { y: midY - 0.03, bottom: drawTop + 0.08 }]
    : [{ y: topY - 0.06, bottom: drawTop + (nd ? 0.1 : 0.25) }];
  if (st === 'split') box(g, iw, t, D * 0.96, cx, midY + 0.01, 0, body);   // 위·아래 칸 사이 선반
  box(g, iw, t, D * 0.96, cx, topY, 0, body);
  const metal = METAL();
  for (let j = 0; j < cols; j++) {
    const a = x0 + cw * j + t, b = a + cw - 2 * t;
    // 선반 위 갠 옷 상자 두 더미
    for (const [m, fx] of [[0, 0.27], [1, 0.73]]) {
      const bw = Math.min(0.32, (b - a) * 0.36), bh = Math.min(0.12, (H - topY - t) * 0.45);
      if (bh > 0.03) for (let l = 0; l < 2; l++) box(g, bw, bh * 0.9, D * 0.6, a + (b - a) * fx, topY + t / 2 + bh * (l + 0.45), 0.02, cloth[(k.seed + m * 2 + l + 4) % cloth.length]);
    }
    for (const r of rods) {
      cylX(g, 0.012, b - a, (a + b) / 2, r.y, 0, metal);
      const len = r.y - 0.04 - r.bottom;
      if (len < 0.15) continue;
      const m = Math.max(1, Math.floor((b - a - 0.08) / 0.07));
      for (let i = 0; i < m; i++) {
        k.seed++;
        const l = len * (0.62 + 0.38 * (((k.seed * 37) % 7) / 6));
        box(g, 0.03, l, D * 0.7, a + 0.06 + ((b - a - 0.12) * (i + 0.5)) / m, r.y - 0.03 - l / 2, 0, cloth[(k.seed * 5) % cloth.length]);
      }
    }
  }
}

/** 냉장고장: 양 옆판 + 위 장(높이 300~600mm, 냉장고 자리 1.89m를 남긴다 — A1-real 실측). 아래는 바닥까지 비운다 */
function fridgeCabinet(g, W, D, H, body, open) {
  const t = 0.018, fz = D / 2, top = Math.max(0.3, Math.min(0.6, H - 1.89)), y0 = H - top;
  for (const s of [-1, 1]) box(g, t, H, D, s * (W / 2 - t / 2), H / 2, 0, body);
  if (open) {   // 문 없는 위 칸: 윗판·밑판·뒤판만
    box(g, W - 2 * t, t, D, 0, H - t / 2, 0, body);
    box(g, W - 2 * t, t, D, 0, y0 + t / 2, 0, body);
    box(g, W - 2 * t, top, 0.008, 0, y0 + top / 2, -fz + 0.004, mat(body.color.clone().multiplyScalar(0.9)));
    return;
  }
  box(g, W - 2 * t, top, D, 0, y0 + top / 2, 0, body);
  const n = Math.max(1, Math.round((W - 2 * t) / 0.55)), dw = (W - 2 * t) / n, groove = GROOVE(), metal = METAL();
  for (let i = 1; i < n; i++) box(g, 0.006, top, 0.004, -W / 2 + t + dw * i, y0 + top / 2, fz + 0.002, groove);
  for (let i = 0; i < n; i++) {
    const left = -W / 2 + t + dw * i, hx = n === 1 || i % 2 === 0 ? left + dw - 0.04 : left + 0.04;
    box(g, 0.018, Math.min(0.14, top * 0.4), 0.025, hx, y0 + 0.1, fz + 0.015, metal);   // 문 아래쪽 손잡이
  }
}

/** 신발장: 가운데 빈 칸 없이 바닥 걸레받이 위로 위아래 통으로 된 문짝들 (문짝마다 위에서 아래까지 한 번에 열린다) */
function shoeCabinet(g, W, D, H, c) {
  const f = D / 2, base = 0.06;
  box(g, W, H, D, 0, H / 2, 0, mat(c, { roughness: 0.55 }));
  box(g, W * 0.995, base, 0.01, 0, base / 2, f - 0.004, mat(shade(c, 0.75)));                    // 걸레받이
  const n = Math.max(1, Math.round(W / 0.45)), dw = W / n, groove = GROOVE(), metal = METAL();
  for (let i = 1; i < n; i++) box(g, 0.006, H - base, 0.004, -W / 2 + dw * i, base + (H - base) / 2, f + 0.002, groove);
  const hy = Math.min(1.0, H * 0.5), hl = Math.min(0.3, H * 0.15);
  for (let i = 0; i < n; i++) {
    // 두 짝이 마주 보는 쪽 끝에 세로 손잡이 (한 짝뿐이면 오른쪽 끝)
    const left = -W / 2 + dw * i, hx = n === 1 || i % 2 === 0 ? left + dw - 0.035 : left + 0.035;
    box(g, 0.015, hl, 0.02, hx, hy, f + 0.012, metal);
  }
}

/**
 * 전자레인지 장(렌지대): 아래부터 수납문 · 전자레인지 칸(전자레인지가 들어 있다) · 밥솥 칸(열린 선반) · 위 수납문.
 * 칸 높이는 H에 맞춰 줄이되 전자레인지 칸은 0.32m 안팎을 지킨다.
 */
function microwaveCabinet(g, W, D, H, c) {
  const body = mat(c, { roughness: 0.55 }), inner = mat(shade(c, 0.88)), t = 0.018, f = D / 2;
  const lowH = Math.min(0.85, H * 0.45), mwH = Math.min(0.34, H * 0.2), riceH = Math.min(0.32, H * 0.17);
  const y1 = lowH, y2 = y1 + mwH, y3 = y2 + riceH, upH = Math.max(0, H - y3);
  for (const s of [-1, 1]) box(g, t, H, D, s * (W / 2 - t / 2), H / 2, 0, body);                 // 옆판
  box(g, W - 2 * t, H, 0.008, 0, H / 2, -f + 0.004, inner);                                      // 뒤판
  box(g, W - 2 * t, lowH, D - 0.01, 0, lowH / 2, 0.005, body);                                    // 아래 수납
  for (const y of [y1, y2, y3]) box(g, W - 2 * t, t, D, 0, y + t / 2, 0, body);                  // 칸 바닥
  if (upH > 0.05) box(g, W - 2 * t, upH, D - 0.01, 0, y3 + upH / 2, 0.005, body);                // 위 수납
  const groove = GROOVE(), metal = METAL();
  const doors = (y0, h) => {
    const n = W > 0.75 ? 2 : 1;
    for (let i = 1; i < n; i++) box(g, 0.006, h, 0.004, -W / 2 + (W / n) * i, y0 + h / 2, f + 0.002, groove);
    for (let i = 0; i < n; i++) box(g, 0.015, Math.min(0.12, h * 0.3), 0.02, -W / 2 + (W / n) * i + (W / n) - 0.04, y0 + (y0 < 0.5 ? h - 0.09 : 0.09), f + 0.012, metal);
  };
  doors(0, lowH);
  if (upH > 0.05) doors(y3, upH);
  // 전자레인지 (칸 안에 쏙)
  const mw = Math.min(W - 2 * t - 0.03, 0.5), mh = Math.min(mwH - 0.05, 0.29), md = Math.min(D - 0.06, 0.38), my = y1 + t + mh / 2 + 0.005, mz = f - md / 2 - 0.02;
  box(g, mw, mh, md, 0, my, mz, mat('#d9dbde', { roughness: 0.4, metalness: 0.3 }));
  box(g, mw * 0.68, mh * 0.8, 0.006, -mw * 0.14, my, mz + md / 2 + 0.003, mat('#1b1e22', { roughness: 0.15, metalness: 0.2 }));  // 유리 문
  box(g, mw * 0.24, mh * 0.8, 0.006, mw * 0.36, my, mz + md / 2 + 0.003, mat('#2b2f35', { roughness: 0.4 }));                       // 조작판
  box(g, mw * 0.12, 0.02, 0.004, mw * 0.36, my + mh * 0.22, mz + md / 2 + 0.007, mat('#7fd1a8', { emissive: '#4fbf8a', emissiveIntensity: 0.6 }));  // 표시창
  // 밥솥 칸 간접등
  box(g, (W - 2 * t) * 0.9, 0.01, 0.01, 0, y3 - 0.006, f - 0.03, mat('#fff1d0', { emissive: '#ffe3b3', emissiveIntensity: 0.7 }));
}

/**
 * 커튼: 위에 레일, 양옆으로 걷어 둔 주름 커튼 두 폭(겉 커튼, 색 c), 그 뒤 가운데에 반투명 속커튼(쉬폰).
 * 주름은 얇은 판을 지그재그로 꺾어 이어 붙인다. 앞면(+z)이 방 쪽, 뒤(-z)가 창 쪽.
 */
function curtain(g, W, D, H, c) {
  const railH = 0.04, top = H - railH, z0 = -D / 2;
  box(g, W, railH, Math.min(D, 0.06), 0, H - railH / 2, z0 + Math.min(D, 0.06) / 2 + 0.01, mat('#e9e6e0', { roughness: 0.5 }));   // 레일
  const fabric = mat(c, { roughness: 0.95, side: THREE.DoubleSide });
  const depth = Math.min(D * 0.55, 0.07), zMid = z0 + Math.min(D, 0.06) + depth / 2 + 0.01, hang = top - 0.01;
  const panel = (x0, x1, material, z = zMid, amp = depth / 2) => pleats(g, x0, x1, hang, z, amp, material);
  const side = Math.min(W * 0.22, 0.6);
  panel(-W / 2, -W / 2 + side, fabric);
  panel(W / 2 - side, W / 2, fabric);
  // 속커튼: 가운데를 덮는 반투명 천 (그림자는 지지 않게)
  const sheer = mat('#ffffff', { roughness: 1, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const before = g.children.length;
  panel(-W / 2 + side * 0.6, W / 2 - side * 0.6, sheer, zMid - depth * 0.6, depth * 0.25);
  for (const m of g.children.slice(before)) m.castShadow = false;
}

/** x0~x1 폭에 주름진 천 한 폭 — 바닥 10mm 위에서 hang 높이까지, 얇은 판을 번갈아 꺾어 지그재그 주름 */
function pleats(g, x0, x1, hang, z, amp, material) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.07)), p = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const len = Math.hypot(p, amp * 2) + 0.004;   // 이웃 판과 끝이 맞물리게 조금 길게
    const m = box(g, len, hang, 0.006, x0 + p * (i + 0.5), 0.01 + hang / 2, z, material);
    m.rotation.y = Math.atan2(amp * 2, p) * (i % 2 ? 1 : -1);
  }
}

/**
 * 커튼 봉: 벽과 벽 사이(가로 W)에 높이 H로 건 둥근 봉 + 양 끝 벽 브래킷(원판) + 고리. 깊이 D 가운데에 단다.
 * f.drape(catalog.rodDrape): open 양옆으로 걷은 커튼 · closed 봉 전체를 덮은 커튼 · none 봉만. 천 색은 c.
 */
function curtainRod(g, W, D, H, c, f = {}) {
  const r = 0.0125, y = H - 0.035, metal = METAL();
  cylX(g, r, W, 0, y, 0, metal);
  for (const s of [-1, 1]) {   // 벽 브래킷: 벽 면에 붙는 원판 + 봉을 받치는 짧은 통
    cylX(g, 0.03, 0.008, s * (W / 2 - 0.004), y, 0, metal);
    cylX(g, r + 0.006, 0.03, s * (W / 2 - 0.02), y, 0, metal);
  }
  const drape = rodDrape(f);
  if (drape === 'none') return;
  const fabric = mat(c, { roughness: 0.95, side: THREE.DoubleSide });
  const hang = y - r - 0.03 - 0.01, amp = Math.min(D * 0.4, 0.035);
  const parts = drape === 'closed' ? [[-W / 2 + 0.03, W / 2 - 0.03]]
    : (() => { const s = Math.min(W * 0.2, 0.45); return [[-W / 2 + 0.03, -W / 2 + 0.03 + s], [W / 2 - 0.03 - s, W / 2 - 0.03]]; })();
  const ring = mat('#9aa1ab', { metalness: 0.6, roughness: 0.35 });
  for (const [x0, x1] of parts) {
    pleats(g, x0, x1, hang, 0, amp, fabric);
    const n = Math.max(2, Math.round((x1 - x0) / 0.1));
    for (let i = 0; i <= n; i++) box(g, 0.006, 0.03, 0.03, x0 + ((x1 - x0) * i) / n, y - r - 0.015, 0, ring);   // 고리
  }
}

function drawer(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c));
  const n = Math.max(2, Math.round(H / 0.22));
  const rh = H / n, groove = GROOVE(), metal = METAL();
  for (let i = 1; i < n; i++) box(g, W * 0.98, 0.006, 0.004, 0, rh * i, D / 2 + 0.002, groove);
  for (let i = 0; i < n; i++) {
    const y = rh * i + rh / 2;
    const xs = W > 0.7 ? [-W / 4, W / 4] : [0];
    for (const x of xs) box(g, Math.min(0.12, W * 0.2), 0.015, 0.02, x, y, D / 2 + 0.012, metal);
  }
}

function shelf(g, W, D, H, c) {
  const m = mat(c), t = 0.02;
  for (const s of [-1, 1]) box(g, t, H, D, s * (W / 2 - t / 2), H / 2, 0, m);
  box(g, W, H, 0.008, 0, H / 2, -D / 2 + 0.004, mat(shade(c, 0.9)));
  const n = Math.max(2, Math.round(H / 0.35));
  for (let i = 0; i <= n; i++) {
    const y = Math.min(H - t / 2, Math.max(t / 2, (H / n) * i));
    box(g, W - 2 * t, t, D, 0, y, 0, m);
  }
  // 책 몇 권
  const colors = ['#c0564b', '#4f7cac', '#e0b34a', '#5f9e6e', '#8a6fb0'];
  for (let i = 0; i < n; i++) {
    const y0 = (H / n) * i + t;
    const bh = Math.min(H / n - t * 2, 0.26);
    let x = -W / 2 + t + 0.02, k = i;
    while (x < W / 2 - t - 0.06 && (k - i) < 12) {
      const bw = 0.025 + ((k * 7) % 4) * 0.008;
      if ((k * 13) % 5 !== 0) box(g, bw, bh * (0.75 + ((k * 3) % 4) * 0.07), D * 0.75, x + bw / 2, y0 + bh * 0.4, 0.01, mat(colors[k % colors.length]));
      x += bw + 0.004; k++;
    }
  }
}

/** 화장대: 상판 + 오른쪽 서랍 + 왼쪽 다리 + 뒤쪽 거울 (H는 거울 꼭대기까지) */
function vanity(g, W, D, H, c) {
  const m = mat(c), top = Math.min(0.75, H * 0.55), t = 0.03;
  box(g, W, t, D, 0, top - t / 2, 0, m);
  const dw = Math.min(0.4, W * 0.45), y0 = 0.05, y1 = top - t;
  box(g, dw, y1 - y0, D * 0.96, W / 2 - dw / 2, (y0 + y1) / 2, 0, m);
  const groove = GROOVE(), metal = METAL();
  for (let i = 1; i < 3; i++) box(g, dw * 0.96, 0.005, 0.004, W / 2 - dw / 2, y0 + ((y1 - y0) * i) / 3, D * 0.48 + 0.002, groove);
  for (let i = 0; i < 3; i++) box(g, 0.08, 0.012, 0.02, W / 2 - dw / 2, y0 + ((y1 - y0) * (i + 0.5)) / 3, D * 0.48 + 0.01, metal);
  for (const sz of [-1, 1]) box(g, 0.035, top - t, 0.035, -W / 2 + 0.04, (top - t) / 2, sz * (D / 2 - 0.04), m);
  if (H > top + 0.15) {
    const mh = H - top - 0.04, mw = Math.min(W * 0.7, mh * 0.8), my = top + 0.02 + mh / 2;
    box(g, mw + 0.04, mh, 0.025, 0, my, -D / 2 + 0.03, mat(shade(c, 0.85)));
    box(g, mw, mh - 0.04, 0.006, 0, my, -D / 2 + 0.046, MIRROR());
  }
}

/** 욕실 철제 선반: 네 기둥 + 단마다 테두리 · 가는 철망 (선반 수는 높이 35cm마다 하나) */
/** 나무 선반: 네 귀퉁이 다리 + 칸마다 원목 판(뒤판 없음) + 뒤쪽 가로대. 칸은 약 35cm마다 */
function woodShelf(g, W, D, H, c) {
  const wood = mat(c, { roughness: 0.7 }), board = mat(shade(c, 1.06), { roughness: 0.65 }), leg = 0.04, t = 0.025;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, leg, H, leg, x * (W / 2 - leg / 2), H / 2, z * (D / 2 - leg / 2), wood);
  const n = Math.max(2, Math.round(H / 0.35)), y0 = 0.08, gap = (H - y0 - t) / (n - 1);
  for (let i = 0; i < n; i++) {
    const y = y0 + gap * i;
    box(g, W, t, D, 0, y + t / 2, 0, board);
    if (i < n - 1) box(g, W - 2 * leg, 0.03, 0.015, 0, y + gap * 0.55, -D / 2 + 0.0075, wood);   // 뒤 가로대 (물건이 뒤로 안 빠지게)
  }
}

/* ---------- 식물 ---------- */

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** 잎 하나: base에서 방향(yaw: 수평 각, pitch: 위로 든 각)으로 길이 L·폭 wd인 납작한 타원. 잎 끝 점을 돌려준다 */
function leaf(g, base, yaw, pitch, L, wd, material, thick = 0.006) {
  const dir = V3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
  const m = new THREE.Mesh(sharedGeo('sphere', () => new THREE.SphereGeometry(1, 12, 8)), material);
  m.scale.set(L / 2, thick, wd / 2);
  m.quaternion.setFromUnitVectors(V3(1, 0, 0), dir);
  m.position.copy(base).addScaledVector(dir, L / 2);
  m.castShadow = true;
  g.add(m);
  return base.clone().addScaledVector(dir, L);
}

/** 줄기·가지: a에서 b까지 반지름 r 막대 */
function rod(g, a, b, r, material) {
  const d = b.clone().sub(a), len = d.length();
  if (len < 1e-4) return;
  const m = new THREE.Mesh(sharedGeo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 8)), material);
  m.scale.set(r, len, r);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.castShadow = true;
  g.add(m);
}

/** 고정 씨앗 난수 — 같은 종류는 늘 같은 모양 (다시 그려도 잎이 바뀌지 않게) */
function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

const GOLD = 2.39996;   // 잎을 고르게 돌려 놓는 황금각 (rad)

/**
 * 종류별 잎·줄기. p = { R: 잎이 퍼지는 반지름, H: 전체 높이, top: 흙 가운데 점, potR, potH, drop: 화분 아래로 늘어질 수 있는 길이, rnd }
 */
const PLANT_SHAPES = {
  /** 몬스테라: 줄기마다 크고 넓은 하트 모양 잎이 바깥으로 처진다 */
  monstera(g, { R, H, top, potH, rnd }) {
    const lf = mat('#2e6b3c', { roughness: 0.5 }), st = mat('#557d3c');
    const L = Math.min(R * 0.75, (H - potH) * 0.45);
    for (let i = 0; i < 9; i++) {
      const a = i * GOLD + rnd() * 0.4, dist = R * (0.2 + 0.4 * rnd());
      const p = V3(Math.cos(a) * dist, Math.min(H - L * 0.3, potH + (H - potH) * (0.45 + 0.45 * rnd())), Math.sin(a) * dist);
      rod(g, top, p, 0.008, st);
      leaf(g, p, a, -0.2 - 0.35 * rnd(), L * (0.8 + 0.3 * rnd()), L * 0.85, lf);
    }
  },
  /** 여인초: 곧게 선 줄기 끝에 길쭉한 노 모양 잎이 위로 부채처럼 퍼진다 */
  strelitzia(g, { R, H, top, potH, rnd }) {
    const lf = mat('#3b7a44', { roughness: 0.5 }), st = mat('#6c8a48');
    for (let i = 0; i < 8; i++) {
      const a = i * GOLD, dist = R * 0.3 * rnd();
      const p = V3(Math.cos(a) * dist, potH + (H - potH) * (0.35 + 0.2 * rnd()), Math.sin(a) * dist);
      rod(g, top, p, 0.01, st);
      const pitch = 1.0 + 0.3 * rnd(), L = Math.max(0.1, (H - p.y - 0.02) / Math.sin(pitch));
      leaf(g, p, a, pitch, L, L * 0.32, lf);
    }
  },
  /** 올리브나무: 가는 줄기 + 가지 몇 개 + 은빛 작은 잎이 둥글게 모인 수관 */
  olive(g, { R, H, top, rnd }) {
    const bark = mat('#6e5640', { roughness: 0.9 }), lf = mat('#7d9168', { roughness: 0.7 });
    const trunkTop = V3(0, H * 0.55, 0);
    rod(g, top, trunkTop, 0.02, bark);
    const cy = H * 0.78, ry = Math.min(0.3, H * 0.18), rx = R * 0.85;
    for (let i = 0; i < 4; i++) {
      const a = i * GOLD;
      rod(g, trunkTop, V3(Math.cos(a) * rx * 0.5, cy, Math.sin(a) * rx * 0.5), 0.01, bark);
    }
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()), h = (rnd() * 2 - 1) * ry;
      const b = V3(Math.cos(a) * rx * r, cy + h, Math.sin(a) * rx * r);
      leaf(g, b, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.2, 0.1, 0.028, lf, 0.005);
    }
  },
  /** 고무나무: 곧은 줄기에 두껍고 윤기 나는 짙은 타원 잎이 어긋나게 달린다 */
  rubber(g, { H, top, potH }) {
    const lf = mat('#1f3d27', { roughness: 0.3 }), st = mat('#5a4a3a');
    rod(g, top, V3(0, H - 0.05, 0), 0.012, st);
    let k = 0;
    for (let y = potH + 0.15; y < H - 0.08; y += 0.11, k++) leaf(g, V3(0, y, 0), k * 2.3, 0.15 + 0.1 * (k % 2), 0.24, 0.12, lf, 0.008);
    leaf(g, V3(0, H - 0.08, 0), 0, 1.35, 0.1, 0.035, mat('#8a3b3b', { roughness: 0.4 }));   // 끝의 새순
  },
  /** 아레카야자: 휘어진 잎줄기 여러 개, 잎줄기마다 가는 작은 잎이 양쪽으로 줄지어 난다 */
  areca(g, { R, H, top, potH, rnd }) {
    const st = mat('#7a9440'), lf = mat('#5c9a45', { roughness: 0.55 });
    for (let i = 0; i < 9; i++) {
      const a = i * GOLD + rnd() * 0.3, reach = R * (0.75 + 0.25 * rnd()), hi = H * (0.8 + 0.18 * rnd());
      const c = V3(Math.cos(a) * reach * 0.3, hi, Math.sin(a) * reach * 0.3);
      const e = V3(Math.cos(a) * reach, Math.max(potH + 0.2, hi - (H - potH) * 0.3), Math.sin(a) * reach);
      const at = (t) => top.clone().multiplyScalar((1 - t) ** 2).addScaledVector(c, 2 * (1 - t) * t).addScaledVector(e, t * t);
      let prev = top;
      for (let s = 1; s <= 10; s++) {
        const t = s / 10, p = at(t);
        rod(g, prev, p, 0.005, st);
        if (t > 0.25) for (const side of [1, -1]) leaf(g, p, a + side * 1.25, -0.35, 0.2 * (1.1 - t * 0.5), 0.022, lf, 0.003);
        prev = p;
      }
    }
  },
  /** 산세베리아: 흙에서 바로 곧게 솟은 길고 뾰족한 칼 모양 잎 */
  sansevieria(g, { H, top, potR, potH, rnd }) {
    const lfs = [mat('#355e33', { roughness: 0.5 }), mat('#4c7a3e', { roughness: 0.5 })];
    for (let i = 0; i < 11; i++) {
      const a = i * GOLD, dist = potR * 0.5 * rnd(), pitch = 1.32 + 0.18 * rnd();
      const b = V3(top.x + Math.cos(a) * dist, top.y, top.z + Math.sin(a) * dist);
      leaf(g, b, a, pitch, ((H - potH) * (0.6 + 0.38 * rnd())) / Math.sin(pitch), 0.055, lfs[i % 2], 0.009);
    }
  },
  /** 금전수: 흙에서 굵은 줄기 여러 개가 위로 휘어 오르고, 줄기 양쪽에 윤기 나는 짙은 타원 잎이 마주 달린다 */
  zamioculcas(g, { R, H, top, potR, potH, rnd }) {
    const st = mat('#4f6b33', { roughness: 0.5 }), lf = mat('#24502c', { roughness: 0.25 });
    for (let i = 0; i < 9; i++) {
      const a = i * GOLD + rnd() * 0.3, base = V3(Math.cos(a) * potR * 0.3 * rnd(), top.y, Math.sin(a) * potR * 0.3 * rnd());
      const reach = R * (0.55 + 0.4 * rnd()), hi = potH + (H - potH) * (0.6 + 0.38 * rnd());
      const c = V3(base.x + Math.cos(a) * reach * 0.35, potH + (hi - potH) * 0.75, base.z + Math.sin(a) * reach * 0.35);
      const e = V3(Math.cos(a) * reach, hi, Math.sin(a) * reach);
      const at = (t) => base.clone().multiplyScalar((1 - t) ** 2).addScaledVector(c, 2 * (1 - t) * t).addScaledVector(e, t * t);
      let prev = base;
      for (let s = 1; s <= 8; s++) {
        const t = s / 8, p = at(t);
        rod(g, prev, p, 0.009 * (1.2 - t * 0.6), st);
        if (t > 0.2) for (const side of [1, -1]) leaf(g, p, a + side * 1.1, 0.2 - t * 0.5, 0.085, 0.04, lf, 0.006);
        prev = p;
      }
      leaf(g, prev, a, 0.1, 0.08, 0.038, lf, 0.006);   // 끝 잎
    }
  },
  /** 스킨답서스: 화분 위 작은 하트 잎 덩어리 + 화분 가장자리 너머로 늘어지는 덩굴 (선반 위에 두면 아래로 길게 처진다) */
  pothos(g, { top, potR, potH, drop, rnd }) {
    const lfs = [mat('#4f8f3a', { roughness: 0.45 }), mat('#9fb54a', { roughness: 0.45 })], st = mat('#5f8a3a');
    for (let i = 0; i < 12; i++) leaf(g, V3(Math.cos(i * GOLD) * potR * 0.4, potH, Math.sin(i * GOLD) * potR * 0.4), i * GOLD, 0.3 + 0.5 * rnd(), 0.09, 0.075, lfs[i % 3 === 0 ? 1 : 0]);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + rnd() * 0.3, len = Math.min(drop, 0.15 + 0.5 * rnd());
      const rim = V3(Math.cos(a) * potR * 0.85, potH + 0.02, Math.sin(a) * potR * 0.85);
      const out = V3(Math.cos(a) * (potR + 0.05), potH + 0.03, Math.sin(a) * (potR + 0.05));
      const end = V3(Math.cos(a) * (potR + 0.09), potH - len, Math.sin(a) * (potR + 0.09));
      rod(g, top, rim, 0.003, st); rod(g, rim, out, 0.003, st); rod(g, out, end, 0.003, st);
      for (let s = 0.08; s < len; s += 0.07) {
        const p = out.clone().lerp(end, s / len);
        leaf(g, p, a + (s * 10 % 2 < 1 ? 0.6 : -0.6), -0.5, 0.07, 0.06, lfs[Math.floor(s * 100) % 3 === 0 ? 1 : 0]);
      }
    }
  },
};

/** 식물: 아래로 좁아지는 화분(색상 = 화분 색) + 흙 + 종류별 잎. 종류는 f.plant (catalog.PLANTS) */
function plant(g, W, D, H, c, f) {
  const kind = plantOf(f), R = Math.min(W, D) / 2;
  const potR = Math.min(0.2, R * 0.55), potH = Math.min(0.38, Math.max(0.15, H * 0.24));
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.78, potH, 28), mat(c, { roughness: 0.8 }));
  pot.position.y = potH / 2;
  pot.castShadow = pot.receiveShadow = true;
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(potR * 0.93, potR * 0.93, 0.01, 28), mat('#4a3626', { roughness: 1 }));
  soil.position.y = potH - 0.025;
  g.add(soil);
  const seed = Object.keys(PLANT_SHAPES).indexOf(kind) * 97 + 13;
  // 늘어지는 덩굴은 바닥을 뚫지 않게: 화분 바닥 + 띄운 높이까지만
  const drop = Math.max(0.05, potH + (f?.elev || 0) / 1000 - 0.03);
  PLANT_SHAPES[kind](g, { R, H, top: V3(0, potH - 0.02, 0), potR, potH, drop, rnd: seeded(seed) });
}

function bathShelf(g, W, D, H, c) {
  const steel = mat(c, { metalness: 0.3, roughness: 0.3 }), r = 0.008;   // 금속성이 높으면 비출 환경이 없어 검게 보인다
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 2 * r, H, 2 * r, x * (W / 2 - r), H / 2, z * (D / 2 - r), steel);
  const n = Math.max(2, Math.round(H / 0.35)), gap = (H - 0.05) / (n - 1);
  for (let i = 0; i < n; i++) {
    const y = 0.05 + gap * i - (i === n - 1 ? 0.01 : 0);
    box(g, W, 0.01, 0.01, 0, y, D / 2 - 0.005, steel);
    box(g, W, 0.01, 0.01, 0, y, -D / 2 + 0.005, steel);
    box(g, 0.01, 0.01, D, -W / 2 + 0.005, y, 0, steel);
    box(g, 0.01, 0.01, D, W / 2 - 0.005, y, 0, steel);
    const bars = Math.max(3, Math.round(D / 0.03));
    for (let k = 1; k < bars; k++) box(g, W - 0.01, 0.004, 0.004, 0, y - 0.002, -D / 2 + (D * k) / bars, steel);
    box(g, W, 0.03, 0.006, 0, y + 0.018, D / 2 - 0.004, steel);   // 앞 턱 (물건이 안 떨어지게)
  }
}

/** 욕실 상부 선반: 벽에 거는 열린 선반 — 뒤판 + 옆판 + 선반 판 두 장(가운데·아래) + 위판. 원점은 선반 바닥 가운데(elev만큼 띄운다) */
function bathUpperShelf(g, W, D, H, c) {
  const body = mat(c, { roughness: 0.35 }), t = 0.018;
  box(g, W, H, 0.01, 0, H / 2, -D / 2 + 0.005, mat(shade(c, 0.94), { roughness: 0.4 }));        // 뒤판
  for (const s of [-1, 1]) box(g, t, H, D, s * (W / 2 - t / 2), H / 2, 0, body);                // 옆판
  for (const y of [t / 2, H / 2, H - t / 2]) box(g, W - 2 * t, t, D - 0.01, 0, y, 0.005, body); // 아래·가운데·위판
  box(g, W - 2 * t, 0.02, 0.006, 0, t + 0.01, D / 2 - 0.003, mat(shade(c, 0.85)));              // 아래 판 앞 턱
}

/** 에어컨 실외기: 몸통 + 앞면 왼쪽 둥근 팬 그릴 + 오른쪽 서비스 판 + 받침 다리 */
function airconOutdoor(g, W, D, H, c) {
  const body = mat(c, { roughness: 0.45 }), foot = 0.04, bh = H - foot;
  box(g, W, bh, D, 0, foot + bh / 2, 0, body);
  for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) box(g, 0.06, foot, D * 0.9, x, foot / 2, 0, mat('#5b616b'));
  const R = Math.min(bh * 0.42, W * 0.3), fx = -W / 2 + R + 0.06, fy = foot + bh / 2, f = D / 2;
  const dark = mat('#3a3f46', { roughness: 0.7 }), grille = mat('#9aa1aa', { metalness: 0.5, roughness: 0.4 });
  cylZ(g, R, 0.006, fx, fy, f + 0.002, dark);                                    // 팬 구멍
  const blade = mat('#6b727b', { roughness: 0.6 });
  for (let k = 0; k < 3; k++) {                                                 // 팬 날개
    const b = new THREE.Mesh(new THREE.BoxGeometry(R * 0.9, R * 0.28, 0.004), blade);
    b.position.set(fx, fy, f + 0.006);
    b.rotation.z = (k * Math.PI * 2) / 3 + 0.3;
    b.translateX(R * 0.42);
    g.add(b);
  }
  for (const rr of [R, R * 0.66, R * 0.33]) {                                   // 동심원 그릴
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.004, 6, 40), grille);
    ring.position.set(fx, fy, f + 0.012);
    g.add(ring);
  }
  box(g, 2 * R, 0.006, 0.006, fx, fy, f + 0.012, grille);
  box(g, 0.006, 2 * R, 0.006, fx, fy, f + 0.012, grille);
  const px = (fx + R + W / 2) / 2, pw = W / 2 - (fx + R) - 0.05;
  if (pw > 0.05) box(g, pw, bh * 0.6, 0.006, px, fy, f + 0.003, mat(shade(c, 0.93)));   // 서비스 판
}

function tvstand(g, W, D, H, c) {
  const leg = Math.min(0.08, H * 0.2);
  box(g, W, H - leg, D, 0, leg + (H - leg) / 2, 0, mat(c));
  const lm = mat(shade(c, 0.5));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.03, leg, 0.03, sx * (W / 2 - 0.05), leg / 2, sz * (D / 2 - 0.05), lm);
  const n = Math.max(1, Math.round(W / 0.6)), dw = W / n, groove = GROOVE(), metal = METAL();
  for (let i = 1; i < n; i++) box(g, 0.006, H - leg, 0.004, -W / 2 + dw * i, leg + (H - leg) / 2, D / 2 + 0.002, groove);
  for (let i = 0; i < n; i++) box(g, Math.min(0.15, dw * 0.3), 0.012, 0.02, -W / 2 + dw * i + dw / 2, H - 0.05, D / 2 + 0.01, metal);
}

function tv(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c, { roughness: 0.4 }));
  box(g, W * 0.97, H * 0.95, 0.003, 0, H / 2, D / 2 + 0.002, mat('#1b2836', { roughness: 0.15, metalness: 0.4, emissive: '#0a1420', emissiveIntensity: 0.6 }));
}

/** 월패드: 흰 본체 + 앞면 화면(메뉴 타일) + 화면 아래 버튼 셋 + 위 가운데 카메라 */
function wallpad(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c, { roughness: 0.35 }));
  const sw = W * 0.86, sh = H * 0.68, sy = H * 0.57, z = D / 2 + 0.001;
  box(g, sw, sh, 0.002, 0, sy, z, mat('#14202c', { roughness: 0.15, metalness: 0.3, emissive: '#0b1724', emissiveIntensity: 0.6 }));
  // 화면 메뉴 타일 (3 × 2)
  const tiles = ['#3b82c4', '#46a37a', '#d99a3b', '#7b6cc9', '#c95b6c', '#4aa3b5'];
  const tw = sw * 0.26, th = sh * 0.34;
  tiles.forEach((col, i) => {
    const x = (i % 3 - 1) * sw * 0.31, y = sy + (i < 3 ? 1 : -1) * sh * 0.2;
    box(g, tw, th, 0.001, x, y, z + 0.0015, mat(col, { roughness: 0.4, emissive: col, emissiveIntensity: 0.35 }));
  });
  for (const k of [-1, 0, 1]) box(g, W * 0.16, H * 0.06, 0.004, k * W * 0.22, H * 0.11, z + 0.001, mat('#d9dce1', { roughness: 0.5 }));
  box(g, 0.008, 0.008, 0.003, 0, H * 0.95, z + 0.001, DARK());   // 카메라
}

function aircon(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c, { roughness: 0.35 }));
  box(g, W * 0.7, H * 0.18, 0.01, 0, H * 0.84, D / 2 + 0.005, DARK());
  box(g, W * 0.3, 0.05, 0.01, 0, H * 0.62, D / 2 + 0.005, mat('#3b8fd9', { emissive: '#1b5fa0', emissiveIntensity: 0.6 }));
}

function bed(g, W, D, H, c) {
  const frameH = 0.26, mattH = 0.22, wood = mat(c);
  box(g, W, frameH, D, 0, frameH / 2, 0, wood);
  const mattTop = frameH + mattH;
  box(g, W - 0.05, mattH, D - 0.12, 0, frameH + mattH / 2, 0.04, mat('#f3f2ee', { roughness: 0.95 }));
  const headH = Math.max(H, mattTop + 0.1);
  box(g, W, headH, 0.07, 0, headH / 2, -D / 2 + 0.035, wood);
  const pillows = W >= 1.3 ? 2 : 1, pw = (W - 0.2) / pillows - 0.06;
  for (let i = 0; i < pillows; i++) {
    const x = -W / 2 + 0.1 + (pw + 0.06) * i + pw / 2 + 0.03;
    box(g, pw, 0.12, 0.38, x, mattTop + 0.06, -D / 2 + 0.07 + 0.26, mat('#ffffff', { roughness: 1 }));
  }
  const blanket = D * 0.62;
  box(g, W - 0.02, 0.05, blanket, 0, mattTop + 0.02, D / 2 - blanket / 2 - 0.02, mat('#9db7d6', { roughness: 1 }));
}

function sofa(g, W, D, H, c, f) {
  const m = mat(c, { roughness: 0.9 }), seatH = 0.42, arm = Math.min(0.2, W * 0.12), backT = Math.min(0.22, D * 0.25);
  box(g, W, seatH * 0.65, D, 0, seatH * 0.325, 0, m);
  const n = f?.seats || (W > 1.6 ? 3 : W > 1.1 ? 2 : 1), cw = (W - 2 * arm) / n;
  const cm = mat(shade(c, 1.08), { roughness: 0.95 });
  for (let i = 0; i < n; i++) box(g, cw - 0.015, 0.15, D - backT - 0.03, -W / 2 + arm + cw * i + cw / 2, seatH * 0.65 + 0.075, backT / 2, cm);
  box(g, W, H, backT, 0, H / 2, -D / 2 + backT / 2, m);
  for (const s of [-1, 1]) box(g, arm, seatH + 0.2, D, s * (W / 2 - arm / 2), (seatH + 0.2) / 2, 0, m);
}

function table(g, W, D, H, c) {
  const m = mat(c), top = 0.04, leg = 0.05, inset = 0.07;
  box(g, W, top, D, 0, H - top / 2, 0, m);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, leg, H - top, leg, sx * (W / 2 - inset), (H - top) / 2, sz * (D / 2 - inset), m);
}

function desk(g, W, D, H, c) {
  const m = mat(c), top = 0.03, side = 0.03;
  box(g, W, top, D, 0, H - top / 2, 0, m);
  for (const s of [-1, 1]) box(g, side, H - top, D, s * (W / 2 - side / 2), (H - top) / 2, 0, m);
  box(g, W - 2 * side, H * 0.4, 0.02, 0, H * 0.62, -D / 2 + 0.03, mat(shade(c, 0.9)));
}

/** 의자. f.stool이면 등받이 없는 스툴 — 높이(H)가 앉는 면 높이다 */
function chair(g, W, D, H, c, f = {}) {
  const m = mat(c), leg = 0.035;
  if (f.stool) {
    const seat = 0.05;
    box(g, W, seat, D, 0, H - seat / 2, 0, m);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, leg, H - seat, leg, sx * (W / 2 - 0.05), (H - seat) / 2, sz * (D / 2 - 0.05), mat(shade(c, 0.6)));
    // 다리 사이 가로대
    for (const sz of [-1, 1]) box(g, W - 0.1, 0.02, 0.02, 0, (H - seat) * 0.3, sz * (D / 2 - 0.05), mat(shade(c, 0.6)));
    return;
  }
  const seatH = Math.min(0.46, H * 0.55);
  box(g, W, 0.05, D * 0.92, 0, seatH, 0.02, m);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, leg, seatH, leg, sx * (W / 2 - 0.04), seatH / 2, sz * (D / 2 - 0.05), mat(shade(c, 0.6)));
  box(g, W, H - seatH, 0.04, 0, seatH + (H - seatH) / 2, -D / 2 + 0.03, m);
}

/* ---------- 욕실 · 주방 설비 ---------- */

/**
 * 정수기. 싱크대 위 소형(f.onCounter, 또는 낮은 것)은 납작한 몸통 + 아래 물받이,
 * 바닥에 선 대형은 키 큰 몸통의 위쪽에 물 받는 자리, 아래는 수납 문. 앞면에 어두운 물 받는 칸 + 꼭지 + 물받이 + 파란 표시창.
 */
function waterPurifier(g, W, D, H, c, f = {}) {
  const small = f.onCounter || H < 0.7, fz = D / 2;
  box(g, W, H, D, 0, H / 2, 0, mat(c, { roughness: 0.3, metalness: 0.1 }));
  const z0 = small ? 0.03 : H * 0.6, z1 = small ? H * 0.62 : H * 0.86;   // 물 받는 칸 아래·위
  box(g, W * 0.8, z1 - z0, 0.004, 0, (z0 + z1) / 2, fz + 0.002, mat('#3a4049', { roughness: 0.5 }));
  box(g, 0.03, 0.035, 0.07, 0, z1 - 0.03, fz + 0.035, METAL());                                     // 꼭지
  box(g, W * 0.85, 0.015, 0.1, 0, z0 + 0.0075, fz + 0.05, mat('#9aa1a9', { metalness: 0.5, roughness: 0.3 }));   // 물받이
  box(g, W * 0.55, 0.03, 0.004, 0, Math.min(H - 0.03, z1 + 0.05), fz + 0.003, mat('#1d2a38', { emissive: '#3b8fd9', emissiveIntensity: 0.5 }));   // 표시창
  if (!small) box(g, W * 0.96, 0.005, 0.004, 0, H * 0.5, fz + 0.002, GROOVE());   // 아래 수납 문
}

/** 세로축 타원 기둥 (rx: 가로 반지름, rz: 깊이 반지름) */
function ovalY(g, rx, rz, h, x, y, z, material, taper = 1) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rx, rx * taper, h, 32), material);
  m.scale.z = rz / rx;
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

const PORCELAIN = (c) => mat(c, { roughness: 0.25, metalness: 0.05 });

function toilet(g, W, D, H, c) {
  const p = PORCELAIN(c), tankD = Math.min(0.2, D * 0.28), seatY = Math.min(0.42, H * 0.55);
  box(g, W, H - seatY + 0.02, tankD, 0, (seatY - 0.02 + H) / 2, -D / 2 + tankD / 2, p);           // 물탱크
  box(g, W * 0.5, seatY - 0.06, D * 0.45, 0, (seatY - 0.06) / 2, -D / 2 + tankD + D * 0.2, p);    // 받침
  const bowlD = D - tankD, cz = -D / 2 + tankD + bowlD / 2 - 0.01;
  ovalY(g, W * 0.48, bowlD / 2, 0.16, 0, seatY - 0.09, cz, p, 0.75);                             // 변기 몸통
  ovalY(g, W * 0.48, bowlD / 2, 0.025, 0, seatY + 0.005, cz, mat('#ffffff', { roughness: 0.4 })); // 시트
  box(g, 0.05, 0.015, 0.02, W * 0.3, H - 0.03, -D / 2 + tankD + 0.01, METAL());                  // 물 내림 손잡이
}

function basin(g, W, D, H, c) {
  const cab = mat(c), top = 0.04, gap = 0.15;
  box(g, W, H - top - gap, D * 0.95, 0, gap + (H - top - gap) / 2, -D * 0.025, cab);             // 하부장 (바닥에서 띄움)
  box(g, 0.006, H - top - gap - 0.02, 0.004, 0, gap + (H - top - gap) / 2, D * 0.45 + 0.002, GROOVE());
  box(g, W, top, D, 0, H - top / 2, 0, PORCELAIN('#fbfbfa'));                                    // 상판
  ovalY(g, Math.min(W, D) * 0.32, Math.min(W, D) * 0.26, 0.012, 0, H + 0.002, D * 0.06, mat('#d5dbe0', { roughness: 0.2, metalness: 0.2 }));
  const metal = METAL();
  box(g, 0.03, 0.16, 0.03, 0, H + 0.08, -D / 2 + 0.07, metal);                                   // 수전
  box(g, 0.025, 0.025, 0.12, 0, H + 0.15, -D / 2 + 0.12, metal);
  box(g, W * 0.92, 0.72, 0.02, 0, H + 0.25 + 0.36, -D / 2 + 0.012, MIRROR()); // 거울
}

function bathtub(g, W, D, H, c) {
  const p = PORCELAIN(c), t = 0.07;
  box(g, W, H, t, 0, H / 2, -D / 2 + t / 2, p);
  box(g, W, H, t, 0, H / 2, D / 2 - t / 2, p);
  box(g, t, H, D - 2 * t, -W / 2 + t / 2, H / 2, 0, p);
  box(g, t, H, D - 2 * t, W / 2 - t / 2, H / 2, 0, p);
  box(g, W - 2 * t, 0.12, D - 2 * t, 0, 0.06, 0, mat('#eaf0f3', { roughness: 0.2 }));            // 바닥
  const metal = METAL();
  box(g, 0.03, 0.12, 0.03, -W / 2 + 0.18, H + 0.06, -D / 2 + 0.035, metal);
  box(g, 0.025, 0.025, 0.12, -W / 2 + 0.18, H + 0.11, -D / 2 + 0.09, metal);
}

/**
 * 샤워부스: 낮은 받침 + 앞·양옆 유리(색은 틀 색) + 앞문 손잡이 + 뒤 벽(-z) 쪽 샤워 수전.
 * 코너에 두면 벽에 붙은 옆 유리는 벽 앞에 겹쳐 보일 뿐이라 따로 고르지 않는다.
 */
function shower(g, W, D, H, c) {
  const trayH = 0.05, frame = mat(c, { metalness: 0.6, roughness: 0.3 }), f = 0.03;
  box(g, W, trayH, D, 0, trayH / 2, 0, PORCELAIN('#f4f5f4'));                                     // 받침
  box(g, W * 0.12, 0.004, W * 0.12, 0, trayH + 0.002, 0, METAL());                                // 배수구
  const glass = mat('#dcebf2', { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false });
  const gh = H - trayH - f, gy = trayH + gh / 2;
  const before = g.children.length;
  box(g, W - 2 * f, gh, 0.008, 0, gy, D / 2 - f / 2, glass);                                     // 앞 유리
  for (const s of [-1, 1]) box(g, 0.008, gh, D - 2 * f, s * (W / 2 - f / 2), gy, 0, glass);       // 옆 유리
  for (const m of g.children.slice(before)) m.castShadow = false;
  // 틀: 네 모서리 기둥 + 위 테두리
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, f, H - trayH, f, sx * (W / 2 - f / 2), trayH + (H - trayH) / 2, sz * (D / 2 - f / 2), frame);
  for (const sz of [-1, 1]) box(g, W, f, f, 0, H - f / 2, sz * (D / 2 - f / 2), frame);
  for (const sx of [-1, 1]) box(g, f, f, D, sx * (W / 2 - f / 2), H - f / 2, 0, frame);
  // 앞문: 가운데 세로 틀(문 경계) + 손잡이
  box(g, 0.012, gh, 0.012, W * 0.05, gy, D / 2 - f / 2, frame);
  box(g, 0.02, 0.3, 0.03, W * 0.05 - 0.06, trayH + 1.0, D / 2 + 0.015, METAL());
  // 샤워 수전: 뒤 벽 쪽 세로 봉 + 해바라기 헤드 + 손잡이
  const metal = METAL(), bz = -D / 2 + f + 0.03, top = Math.min(H - 0.1, 2.0);
  box(g, 0.025, top - 0.9, 0.025, 0, 0.9 + (top - 0.9) / 2, bz, metal);
  box(g, 0.025, 0.025, 0.2, 0, top, bz + 0.1, metal);
  ovalY(g, 0.11, 0.11, 0.015, 0, top - 0.02, bz + 0.2, metal);
  box(g, 0.14, 0.05, 0.05, 0, 1.0, bz + 0.01, metal);
}

/** 선반장: 아래 문 두 짝(또는 한 짝) 수납장 + 위 트인 선반 칸 */
function shelfCabinet(g, W, D, H, c) {
  const m = mat(c), t = 0.018, groove = GROOVE(), metal = METAL();
  const baseH = Math.min(H * 0.42, 0.85);
  for (const s of [-1, 1]) box(g, t, H, D, s * (W / 2 - t / 2), H / 2, 0, m);                     // 옆판
  box(g, W, H, 0.008, 0, H / 2, -D / 2 + 0.004, mat(shade(c, 0.9)));                             // 뒤판
  box(g, W - 2 * t, baseH, D - 0.01, 0, baseH / 2, 0.001, m);                              // 아래 수납장 몸통
  const doors = W > 0.55 ? 2 : 1, dw = (W - 2 * t) / doors;
  for (let i = 1; i < doors; i++) box(g, 0.005, baseH - 0.03, 0.004, -W / 2 + t + dw * i, baseH / 2, D / 2 + 0.002, groove);
  for (let i = 0; i < doors; i++) {
    const x = -W / 2 + t + dw * i + (doors === 2 ? (i ? 0.04 : dw - 0.04) : dw - 0.05);
    box(g, 0.015, Math.min(0.14, baseH * 0.3), 0.02, x, baseH - 0.12, D / 2 + 0.012, metal);
  }
  const n = Math.max(1, Math.round((H - baseH) / 0.33)), step = (H - baseH) / n;
  for (let i = 1; i <= n; i++) box(g, W - 2 * t, t, D - 0.01, 0, Math.min(H - t / 2, baseH + step * i), 0.001, m);   // 선반 + 윗판
}

/** 주방 싱크대: 하부장 + 상판(개수대·쿡탑) + H가 1.4m를 넘으면 상부장 */
function kitchenCounter(g, W, D, H, c) {
  counterRun(g, W, D, H, c);
}

/**
 * 싱크대 한 줄: 하부장 + 상판 + (개수대) + (인덕션) + 상부장(+ 후드). 가운데 원점, 앞면 +z.
 * sink/cook: 놓을지 (cook 기본은 1.2m 넘을 때), flip: 개수대는 왼쪽·인덕션은 오른쪽인 것을 좌우로 바꾼다.
 * upperExt: 상부장만 한쪽 끝(-1: -x, 1: +x)으로 upperExtBy(m, 없으면 상판 깊이 - 상부장 깊이)만큼 늘린다 — ㄱ자 꺾인 쪽 상부장을 모서리의 가로 쪽 상부장에 붙인다.
 * sinkAt/cookAt: 개수대·인덕션 가운데 x(m)를 직접 정한다(ㄱ자는 도면 그림 자리). 후드는 인덕션 위로 따라간다.
 */
function counterRun(g, W, D, H, c, { sink = true, cook = W > 1.2, flip = false, upperExt = 0, upperExtBy = null, sinkAt = null, cookAt = null } = {}) {
  const cab = mat(c), baseH = COUNTER_TOP / 1000, top = 0.04, plinth = 0.1;
  box(g, W, plinth, D * 0.9, 0, plinth / 2, -D * 0.05, mat(shade(c, 0.6)));
  box(g, W, baseH - top - plinth, D * 0.96, 0, plinth + (baseH - top - plinth) / 2, -D * 0.02, cab);
  box(g, W, top, D, 0, baseH - top / 2, 0, mat('#d8d4cd', { roughness: 0.35 }));
  const n = Math.max(1, Math.round(W / 0.6)), dw = W / n, groove = GROOVE();
  for (let i = 1; i < n; i++) box(g, 0.005, baseH - top - plinth - 0.02, 0.004, -W / 2 + dw * i, plinth + (baseH - top - plinth) / 2, D * 0.46 + 0.002, groove);
  const metal = METAL();
  const k = flip ? -1 : 1;
  const sinkX = sinkAt ?? k * (-W / 2 + Math.min(W * 0.3, 0.75)), cookX = cookAt ?? (sink ? k * (W / 2 - Math.min(W * 0.28, 0.6)) : 0);
  if (sink) {
    box(g, Math.min(0.8, W * 0.3), 0.006, D * 0.7, sinkX, baseH + 0.001, 0.02, mat('#9ea6ae', { metalness: 0.8, roughness: 0.25 }));
    box(g, 0.03, 0.25, 0.03, sinkX, baseH + 0.125, -D / 2 + 0.08, metal);
    box(g, 0.025, 0.025, 0.18, sinkX, baseH + 0.24, -D / 2 + 0.16, metal);
  }
  if (cook) {
    // 인덕션 3구: 검은 유리판 + 화구 테두리(가는 회색 원) + 앞쪽 터치 조작부
    const iw = 0.59, id = Math.min(0.52, D * 0.86), topY = baseH + 0.004;
    box(g, iw, 0.008, id, cookX, topY, 0, mat('#121417', { roughness: 0.08, metalness: 0.4 }));
    const ring = mat('#7d848c', { roughness: 0.4 });
    for (const [dx, dz, r] of [[-0.14, -0.06, 0.1], [0.15, -0.08, 0.08], [0.06, 0.1, 0.07]]) {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.004, r, 40), ring);
      m.rotation.x = -Math.PI / 2;
      m.position.set(cookX + dx, topY + 0.0045, dz);
      g.add(m);
    }
    box(g, iw * 0.7, 0.002, 0.035, cookX, topY + 0.004, id / 2 - 0.04, mat('#2b3138', { emissive: '#3b8fd9', emissiveIntensity: 0.35 }));
  }
  if (H > 1.4) {
    const y0 = Math.max(1.4, baseH + 0.6), uD = Math.min(0.35, D * 0.6), ext = upperExt ? upperExtBy ?? D - uD : 0;
    box(g, W + ext, H - y0, uD, upperExt * ext / 2, (y0 + H) / 2, -D / 2 + uD / 2, cab);
    for (let i = 1; i < n; i++) box(g, 0.005, H - y0 - 0.02, 0.004, -W / 2 + dw * i, (y0 + H) / 2, -D / 2 + uD + 0.002, groove);
    if (cook) box(g, 0.6, 0.12, uD + 0.05, cookX, y0 - 0.06, -D / 2 + (uD + 0.05) / 2, mat('#b9bec4', { metalness: 0.6, roughness: 0.35 })); // 후드
  }
}

/**
 * ㄱ자 주방 싱크대: 뒤쪽 가로(W) + 옆쪽 꺾인 세로(D). 상판 깊이 T는 f.counterD.
 * 꺾인 쪽 깊이 TL은 f.legD(없으면 T) — 위 조리대보다 깊은 옆 선반(냉장고장과 면 맞춤) 등.
 * 꺾인 쪽은 앞에서 볼 때 오른쪽(+x), f.mirror면 왼쪽. 개수대와 인덕션(+ 후드)은 둘 다 가로 쪽에 놓는다 — 모서리 칸(T)을 뺀 구간 안에서
 * 꺾인 쪽 반대 끝이 개수대, 꺾인 쪽(모서리)에 가까운 쪽이 인덕션(f.mirror면 좌우가 함께 뒤집힌다 — A-1·A-2형 실측). 꺾인 쪽은 상판·하부장·상부장만(주방 선반).
 * 가로 쪽 남은 구간이 1.4m보다 짧으면 인덕션은 꺾인 쪽 끝(0.8m 이상일 때)에 놓는다. 바닥 모양은 geometry.furnitureRects와 같다.
 */
function kitchenL(g, W, D, H, c, f) {
  const T = Math.min(lCounterDepth(f) * 0.001, W, D), TL = Math.min(lLegDepth(f) * 0.001, W), side = f?.mirror ? -1 : 1, legL = D - T;
  const a = side > 0 ? -W / 2 : -W / 2 + TL, span = W - TL;   // 모서리(꺾인 쪽 폭)를 뺀 가로 쪽 구간 [a, a + span]
  const longCook = span >= 1.4, legCook = !longCook && legL >= 0.8;
  const long = new THREE.Group();
  counterRun(long, W, T, H, c, longCook
    ? (side > 0
      ? { cook: true, sinkAt: a + Math.min(span * 0.28, 0.75), cookAt: a + span - 0.42 }    // 인덕션 폭 0.59 + 모서리 쪽 여유
      : { cook: true, sinkAt: a + span - Math.min(span * 0.28, 0.75), cookAt: a + 0.42 })
    : { cook: false, sinkAt: a + span / 2 });
  long.position.z = -D / 2 + T / 2;
  g.add(long);
  if (legL <= 0.01) return;
  const leg = new THREE.Group();
  // 꺾인 쪽은 가로 쪽 상판 앞에서 시작하지만, 상부장은 가로 쪽 상부장(상판보다 얕다) 앞면까지 늘려 모서리에서 붙인다.
  // 돌린 뒤 로컬 -x(side = 1) / +x(side = -1)가 모서리 쪽이고, 그 반대 끝이 꺾인 쪽 끝이다
  const cookAt = side * Math.max(0, legL / 2 - Math.min(0.54, legL / 2));
  const uD = Math.min(0.35, T * 0.6);   // 가로 쪽 상부장 깊이 — 꺾인 쪽 상부장을 그 앞면까지 늘린다
  counterRun(leg, legL, TL, H, c, { sink: false, cook: legCook, cookAt, upperExt: -side, upperExtBy: T - uD });
  leg.rotation.y = -side * Math.PI / 2;   // 앞면(+z)이 안쪽을 보게
  leg.position.set(side * (W / 2 - TL / 2), 0, T / 2);
  g.add(leg);
}

function plain(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c));
}

/**
 * 문틀 (m). 원점은 문 틈 가운데 바닥, x = 문 폭 방향, z = 벽 두께 방향. 양옆 기둥 + 위 인방.
 */
export function buildDoorFrame(W, H, T, color = '#e9e3da') {
  const g = new THREE.Group(), m = mat(color, { roughness: 0.6 }), fw = 0.04, fd = T + 0.02;
  box(g, fw, H, fd, -W / 2 + fw / 2, H / 2, 0, m);
  box(g, fw, H, fd, W / 2 - fw / 2, H / 2, 0, m);
  box(g, W, fw, fd, 0, H - fw / 2, 0, m);
  return g;
}

/**
 * 문짝 (m). 원점은 경첩 바닥, 문짝은 +x로 W만큼 뻗고(열린 채로 벽에 수직), 두께는 z = 0~zSide*T 쪽에 둔다.
 * 끝 쪽 양면에 손잡이를 단다.
 */
export function buildDoorLeaf(W, H, zSide = 1) {
  const g = new THREE.Group(), T = 0.04, z = (zSide * T) / 2;
  box(g, W - 0.01, H - 0.01, T, W / 2, H / 2, z, mat('#d9c3a5', { roughness: 0.6 }));
  const metal = METAL();
  for (const k of [1, -1]) {
    box(g, 0.12, 0.02, 0.02, W - 0.1, 1.0, z + k * (T / 2 + 0.03), metal);   // 손잡이 (문짝에서 띄움)
    box(g, 0.02, 0.02, 0.03, W - 0.05, 1.0, z + k * (T / 2 + 0.015), metal);
  }
  return g;
}

/**
 * 미닫이 문짝 (m). 원점은 문짝 바닥 가운데, 폭은 x, 두께는 z. 손잡이(세로 홈 손잡이)는 x = edge 쪽 끝 양면에.
 * 가운데에 간살 무늬 유리를 넣는다.
 */
export function buildSlidingLeaf(W, H, T, edge = 1) {
  const g = new THREE.Group(), wood = mat('#d9c3a5', { roughness: 0.6 }), sw = Math.min(0.09, W * 0.12);
  box(g, sw, H, T, -W / 2 + sw / 2, H / 2, 0, wood);   // 양 옆 틀
  box(g, sw, H, T, W / 2 - sw / 2, H / 2, 0, wood);
  box(g, W - 2 * sw, 0.15, T, 0, 0.075, 0, wood);       // 아래·위·가운데 가로대
  box(g, W - 2 * sw, sw, T, 0, H - sw / 2, 0, wood);
  box(g, W - 2 * sw, sw, T, 0, H * 0.42, 0, wood);
  box(g, W - 2 * sw, H * 0.42 - 0.15, T * 0.5, 0, 0.15 + (H * 0.42 - 0.15) / 2, 0, wood);   // 아래 판
  const glass = new THREE.MeshStandardMaterial({ color: '#eef3f6', roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.55 });
  const gy0 = H * 0.42 + sw / 2, gy1 = H - sw;
  box(g, W - 2 * sw, gy1 - gy0, 0.008, 0, (gy0 + gy1) / 2, 0, glass);
  for (const k of [1 / 3, 2 / 3]) box(g, 0.02, gy1 - gy0, T * 0.6, -W / 2 + sw + (W - 2 * sw) * k, (gy0 + gy1) / 2, 0, wood);   // 간살
  const metal = METAL();
  for (const k of [1, -1]) box(g, 0.025, 0.2, 0.006, edge * (W / 2 - sw / 2), 1.0, k * (T / 2 + 0.002), metal);
  return g;
}

/** 중문 틀 색 (짙은 회색 알루미늄) */
export const MIDDLE_FRAME = '#3b3f45';

/**
 * 현관 중문 유리 문짝 (m). 원점은 문짝 바닥 가운데, 폭 x, 두께 z. 가는 알루미늄 틀 + 투명 유리 + 허리 띠,
 * x = edge 쪽 끝에 길쭉한 세로 손잡이.
 */
export function buildGlassLeaf(W, H, T, edge = 1) {
  const g = new THREE.Group(), al = mat(MIDDLE_FRAME, { roughness: 0.4, metalness: 0.4 }), fw = 0.035;
  box(g, fw, H, T, -W / 2 + fw / 2, H / 2, 0, al);
  box(g, fw, H, T, W / 2 - fw / 2, H / 2, 0, al);
  box(g, W - 2 * fw, 0.06, T, 0, 0.03, 0, al);
  box(g, W - 2 * fw, fw, T, 0, H - fw / 2, 0, al);
  box(g, W - 2 * fw, 0.012, T * 0.6, 0, H * 0.48, 0, al);   // 허리 띠
  const glass = new THREE.MeshStandardMaterial({ color: '#dcebf2', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false });
  box(g, W - 2 * fw, H - 0.06 - fw, 0.006, 0, 0.06 + (H - 0.06 - fw) / 2, 0, glass).castShadow = false;
  for (const k of [1, -1]) box(g, 0.02, 0.6, 0.02, edge * (W / 2 - fw - 0.03), 1.0, k * (T / 2 + 0.012), al);
  return g;
}

/** 중문 위 고정 유리 (m): 문 높이 ~ 천장. 원점은 바닥 가운데(y = 0이 상부창 아래), 폭 x, 두께 z */
export function buildTransom(W, H, T) {
  const g = new THREE.Group(), al = mat(MIDDLE_FRAME, { roughness: 0.4, metalness: 0.4 }), fw = 0.035;
  box(g, W, fw, T, 0, fw / 2, 0, al);
  box(g, W, fw, T, 0, H - fw / 2, 0, al);
  box(g, fw, H, T, -W / 2 + fw / 2, H / 2, 0, al);
  box(g, fw, H, T, W / 2 - fw / 2, H / 2, 0, al);
  const glass = new THREE.MeshStandardMaterial({ color: '#dcebf2', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false });
  box(g, W - 2 * fw, H - 2 * fw, 0.006, 0, H / 2, 0, glass).castShadow = false;
  return g;
}

/**
 * 창틀 + 유리 (m). 원점은 창 가운데 아래(창 아래 높이), x = 창 폭 방향, y = 위, z = 벽 두께 방향.
 * 폭이 0.9m를 넘으면 미닫이 두 짝(앞뒤로 겹친 유리)으로 그린다. 바닥까지 내려오는 창이 아니면 안쪽에 창턱을 단다.
 */
export function buildWindow(W, H, T, sill) {
  const g = new THREE.Group();
  const frame = mat('#eef0f2', { roughness: 0.5 }), fw = 0.05, fd = Math.min(T * 0.6, 0.12);
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe6f5', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false });
  box(g, W, fw, fd, 0, fw / 2, 0, frame);                 // 아래
  box(g, W, fw, fd, 0, H - fw / 2, 0, frame);             // 위
  box(g, fw, H, fd, -W / 2 + fw / 2, H / 2, 0, frame);    // 왼쪽
  box(g, fw, H, fd, W / 2 - fw / 2, H / 2, 0, frame);     // 오른쪽
  const n = W > 0.9 ? 2 : 1, pw = (W - 2 * fw) / n + (n > 1 ? 0.04 : 0), gh = H - 2 * fw;
  for (let i = 0; i < n; i++) {
    const x = n > 1 ? (i === 0 ? -1 : 1) * (W - 2 * fw - pw) / 2 : 0, z = n > 1 ? (i === 0 ? -1 : 1) * fd * 0.2 : 0;
    const sash = mat('#f6f7f8', { roughness: 0.45 }), sw = 0.035;
    box(g, pw, sw, 0.03, x, fw + sw / 2, z, sash);
    box(g, pw, sw, 0.03, x, H - fw - sw / 2, z, sash);
    box(g, sw, gh, 0.03, x - pw / 2 + sw / 2, H / 2, z, sash);
    box(g, sw, gh, 0.03, x + pw / 2 - sw / 2, H / 2, z, sash);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(pw - 2 * sw, gh - 2 * sw), glass);
    pane.position.set(x, H / 2, z);
    g.add(pane);
    const back = pane.clone();
    back.rotation.y = Math.PI;
    g.add(back);
  }
  if (sill > 0.05) {
    for (const zs of [1, -1]) box(g, W + 0.06, 0.025, (T - fd) / 2 + 0.04, 0, 0.0125 - 0.005, zs * (fd / 2 + ((T - fd) / 2 + 0.04) / 2 - 0.01), mat('#e7e1d6', { roughness: 0.4 }));
  }
  return g;
}

const BUILDERS = {
  fridge_side: (g, W, D, H, c) => fridge(g, W, D, H, c, true),
  fridge_top: (g, W, D, H, c) => fridge(g, W, D, H, c, false),
  kimchi, kimchi_stand: kimchiStand, washer, wash_tower: washTower, top_washer: topWasher, wardrobe, shoe_cabinet: shoeCabinet, microwave_cabinet: microwaveCabinet, curtain, curtain_rod: curtainRod, drawer, shelf, wood_shelf: woodShelf, shelf_cabinet: shelfCabinet, shower, plant, tvstand, tv, wallpad, aircon, aircon_outdoor: airconOutdoor, bath_shelf: bathShelf, bath_upper_shelf: bathUpperShelf,
  bed, sofa, table, desk, chair, vanity, toilet, basin, bathtub, kitchen_counter: kitchenCounter, kitchen_l: kitchenL, water_purifier: waterPurifier, box: plain,
};

/**
 * 가구 하나의 3D 묶음을 만든다. photo(THREE.Texture)가 있으면 앞면에 사진판을 붙인다.
 * 위치·회전은 부르는 쪽이 정한다.
 */
export function buildFurniture(f, photo) {
  const g = new THREE.Group();
  const W = f.w / 1000, D = f.d / 1000, H = f.h / 1000;
  (BUILDERS[f.type] || plain)(g, W, D, H, f.color || '#cccccc', f);
  if (photo) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ map: photo, roughness: 0.7 }),
    );
    plane.position.set(0, H / 2, D / 2 + 0.035);
    g.add(plane);
  }
  return g;
}

/**
 * 문짝을 '형태만' 보이게(on) 또는 원래대로. 둘러보기에서 집 안에 들어오면 문 너머 방이 보이도록 쓴다.
 * 면은 반투명(GHOST_OPACITY, 원래 더 투명한 유리는 그대로)하게, 상자 모양 부품에는 진한 모서리 선을 붙인다.
 * 처음 부를 때 원래 재질을 userData에 남겨 둔다.
 */
const GHOST_OPACITY = 0.35;
export function setGhost(obj, on) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const u = o.userData;
    if (!u.solid) {
      if (!on) return;
      u.solid = o.material;
      u.ghost = [].concat(o.material).map((m) => Object.assign(m.clone(), {
        transparent: true, opacity: m.transparent ? Math.min(m.opacity, GHOST_OPACITY) : GHOST_OPACITY, depthWrite: false,
      }));
      if (!Array.isArray(o.material)) u.ghost = u.ghost[0];
      if (o.geometry?.type === 'BoxGeometry') {
        // 공유 상자 지오메트리는 모서리 선도 공유한다 (disposeObject가 버리지 않게 geoCache에 둔다)
        const edges = o.geometry === boxGeo() ? sharedGeo('boxEdges', () => new THREE.EdgesGeometry(boxGeo())) : new THREE.EdgesGeometry(o.geometry);
        u.edges = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#3a2614' }));
        u.edges.raycast = () => {};
        o.add(u.edges);
      }
      u.shadow = o.castShadow;
    }
    o.material = on ? u.ghost : u.solid;
    o.castShadow = on ? false : u.shadow;
    if (u.edges) u.edges.visible = on;
  });
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry && ![...geoCache.values()].includes(o.geometry)) o.geometry.dispose();
    if (o.material) {
      for (const m of [].concat(o.material)) m.dispose();
    }
    // setGhost로 바꿔 둔 문짝: 안 보이는 쪽 재질도 버린다
    for (const m of [].concat(o.userData?.solid || [], o.userData?.ghost || [])) if (m !== o.material) m.dispose();
  });
}
