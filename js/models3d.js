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

function washer(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c, { roughness: 0.4, metalness: 0.15 }));
  const f = D / 2;
  box(g, W * 0.98, H * 0.12, 0.01, 0, H * 0.92, f + 0.005, mat(shade(c, 0.8)));
  const R = Math.min(W, H) * 0.31, cy = H * 0.47;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.025, 12, 48), METAL());
  ring.position.set(0, cy, f + 0.02);
  ring.castShadow = true;
  g.add(ring);
  cylZ(g, R * 0.93, 0.02, 0, cy, f + 0.015, mat('#29384a', { metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.85 }));
  cylZ(g, 0.035, 0.03, -W * 0.3, H * 0.92, f + 0.02, METAL());
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

function plain(g, W, D, H, c) {
  box(g, W, H, D, 0, H / 2, 0, mat(c));
}

const BUILDERS = {
  fridge_side: (g, W, D, H, c) => fridge(g, W, D, H, c, true),
  fridge_top: (g, W, D, H, c) => fridge(g, W, D, H, c, false),
  kimchi, washer, top_washer: topWasher, wardrobe, drawer, shelf, tvstand, tv, aircon,
  bed, sofa, table, desk, chair, box: plain,
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
