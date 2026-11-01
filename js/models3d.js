// 샘플 가구의 3D 모양. 단위는 m, 원점은 바닥 사각형 가운데, 앞면은 +z.
// 모양은 박스·원기둥 몇 개로 단순하게 만들고 크기(W·D·H)에 맞춰 늘린다.
import * as THREE from 'three';

const geoCache = new Map();
function boxGeo() {
  if (!geoCache.has('box')) geoCache.set('box', new THREE.BoxGeometry(1, 1, 1));
  return geoCache.get('box');
}

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

function wardrobe(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c, { roughness: 0.55 }));
  const f = D / 2, base = 0.07;
  box(g, W * 0.995, base, 0.01, 0, base / 2, f - 0.004, mat(shade(c, 0.75)));
  const n = Math.max(1, Math.round(W / 0.55));
  const dw = W / n, groove = GROOVE(), metal = METAL();
  for (let i = 1; i < n; i++) box(g, 0.006, H - base, 0.004, -W / 2 + dw * i, base + (H - base) / 2, f + 0.002, groove);
  for (let i = 0; i < n; i++) {
    const left = -W / 2 + dw * i;
    // 문 두 짝이 마주 보는 쪽에 손잡이를 단다
    const hx = i % 2 === 0 ? left + dw - 0.04 : left + 0.04;
    box(g, 0.018, Math.min(0.5, H * 0.25), 0.025, n === 1 ? left + dw - 0.04 : hx, H * 0.5, f + 0.015, metal);
  }
}

/** 신발장: 바닥에서 띄운 하부장 + 가운데 열린 선반(물건 올려 두는 자리) + 상부장 */
function shoeCabinet(g, W, D, H, c) {
  const body = mat(c, { roughness: 0.55 }), gap = 0.12, nicheY = Math.min(1.0, H * 0.42), nicheH = 0.3;
  const lowH = nicheY - gap, upY = nicheY + nicheH, upH = H - upY;
  box(g, W, lowH, D, 0, gap + lowH / 2, 0, body);
  box(g, W, upH, D, 0, upY + upH / 2, 0, body);
  box(g, W, 0.025, D, 0, nicheY + 0.0125, 0, mat(shade(c, 0.9)));                                // 선반 바닥
  box(g, W, nicheH, 0.02, 0, nicheY + nicheH / 2, -D / 2 + 0.01, mat(shade(c, 0.8)));               // 선반 뒤판
  for (const x of [-W / 2 + 0.01, W / 2 - 0.01]) box(g, 0.02, nicheH, D, x, nicheY + nicheH / 2, 0, body);
  box(g, W * 0.9, 0.012, 0.012, 0, upY - 0.01, D / 2 - 0.03, mat('#fff1d0', { emissive: '#ffe3b3', emissiveIntensity: 0.8 })); // 선반 간접등
  const n = Math.max(1, Math.round(W / 0.45)), dw = W / n, groove = GROOVE(), metal = METAL(), f = D / 2;
  for (let i = 1; i < n; i++) {
    box(g, 0.006, lowH, 0.004, -W / 2 + dw * i, gap + lowH / 2, f + 0.002, groove);
    box(g, 0.006, upH, 0.004, -W / 2 + dw * i, upY + upH / 2, f + 0.002, groove);
  }
  for (let i = 0; i < n; i++) {
    const hx = -W / 2 + dw * i + (i % 2 === 0 ? dw - 0.035 : 0.035);
    box(g, 0.015, 0.12, 0.02, hx, gap + lowH - 0.1, f + 0.012, metal);
    box(g, 0.015, 0.12, 0.02, hx, upY + 0.1, f + 0.012, metal);
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

function sofa(g, W, D, H, c) {
  const m = mat(c, { roughness: 0.9 }), seatH = 0.42, arm = Math.min(0.2, W * 0.12), backT = Math.min(0.22, D * 0.25);
  box(g, W, seatH * 0.65, D, 0, seatH * 0.325, 0, m);
  const n = W > 1.6 ? 3 : W > 1.1 ? 2 : 1, cw = (W - 2 * arm) / n;
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

function chair(g, W, D, H, c) {
  const m = mat(c), seatH = Math.min(0.46, H * 0.55), leg = 0.035;
  box(g, W, 0.05, D * 0.92, 0, seatH, 0.02, m);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, leg, seatH, leg, sx * (W / 2 - 0.04), seatH / 2, sz * (D / 2 - 0.05), mat(shade(c, 0.6)));
  box(g, W, H - seatH, 0.04, 0, seatH + (H - seatH) / 2, -D / 2 + 0.03, m);
}

/* ---------- 욕실 · 주방 설비 ---------- */

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

/** 주방 싱크대: 하부장 + 상판(개수대·쿡탑) + H가 1.4m를 넘으면 상부장 */
function kitchenCounter(g, W, D, H, c) {
  const cab = mat(c), baseH = 0.85, top = 0.04, plinth = 0.1;
  box(g, W, plinth, D * 0.9, 0, plinth / 2, -D * 0.05, mat(shade(c, 0.6)));
  box(g, W, baseH - top - plinth, D * 0.96, 0, plinth + (baseH - top - plinth) / 2, -D * 0.02, cab);
  box(g, W, top, D, 0, baseH - top / 2, 0, mat('#d8d4cd', { roughness: 0.35 }));
  const n = Math.max(1, Math.round(W / 0.6)), dw = W / n, groove = GROOVE();
  for (let i = 1; i < n; i++) box(g, 0.005, baseH - top - plinth - 0.02, 0.004, -W / 2 + dw * i, plinth + (baseH - top - plinth) / 2, D * 0.46 + 0.002, groove);
  const metal = METAL();
  const sinkX = -W / 2 + Math.min(W * 0.3, 0.75), cookX = W / 2 - Math.min(W * 0.28, 0.6);
  box(g, Math.min(0.8, W * 0.3), 0.006, D * 0.7, sinkX, baseH + 0.001, 0.02, mat('#9ea6ae', { metalness: 0.8, roughness: 0.25 }));
  box(g, 0.03, 0.25, 0.03, sinkX, baseH + 0.125, -D / 2 + 0.08, metal);
  box(g, 0.025, 0.025, 0.18, sinkX, baseH + 0.24, -D / 2 + 0.16, metal);
  if (W > 1.2) {
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
    const y0 = Math.max(1.4, baseH + 0.6), uD = Math.min(0.35, D * 0.6);
    box(g, W, H - y0, uD, 0, (y0 + H) / 2, -D / 2 + uD / 2, cab);
    for (let i = 1; i < n; i++) box(g, 0.005, H - y0 - 0.02, 0.004, -W / 2 + dw * i, (y0 + H) / 2, -D / 2 + uD + 0.002, groove);
    if (W > 1.2) box(g, 0.6, 0.12, uD + 0.05, cookX, y0 - 0.06, -D / 2 + (uD + 0.05) / 2, mat('#b9bec4', { metalness: 0.6, roughness: 0.35 })); // 후드
  }
}

function plain(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c));
}

const BUILDERS = {
  fridge_side: (g, W, D, H, c) => fridge(g, W, D, H, c, true),
  fridge_top: (g, W, D, H, c) => fridge(g, W, D, H, c, false),
  kimchi, kimchi_stand: kimchiStand, washer, wash_tower: washTower, top_washer: topWasher, wardrobe, shoe_cabinet: shoeCabinet, drawer, shelf, tvstand, tv, aircon, aircon_outdoor: airconOutdoor, bath_shelf: bathShelf,
  bed, sofa, table, desk, chair, vanity, toilet, basin, bathtub, kitchen_counter: kitchenCounter, box: plain,
};

/**
 * 가구 하나의 3D 묶음을 만든다. photo(THREE.Texture)가 있으면 앞면에 사진판을 붙인다.
 * 위치·회전은 부르는 쪽이 정한다.
 */
export function buildFurniture(f, photo) {
  const g = new THREE.Group();
  const W = f.w / 1000, D = f.d / 1000, H = f.h / 1000;
  (BUILDERS[f.type] || plain)(g, W, D, H, f.color || '#cccccc');
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

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry && o.geometry !== boxGeo()) o.geometry.dispose();
    if (o.material) {
      for (const m of [].concat(o.material)) m.dispose();
    }
  });
}
