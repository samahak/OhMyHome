// 둘러보기 창밖 풍경 — 우리 동(아래층 외벽·옆집), 앞 도로·인도·가로수·차, 길 건너 빌라, 사방 아파트 동,
// 멀리 산 능선 세 겹, 하늘. 단위 m, 3D 좌표(x = 도면 x, z = 도면 y). 도면 아래쪽(+z)을 앞(거실 창 쪽)으로 본다.
// 우리 층 바닥이 y = 0이고, 땅은 (층 - 1) × 층 높이 + 1m(1층 바닥 높이) 아래다.
import * as THREE from 'three';

export const FLOOR_H = 2.8;          // 층 높이 m
const BAY = 3, TILE_ROWS = 8, TILE_COLS = 8;   // 창 텍스처 한 장 = 8층 × 8칸(한 칸 3m)
const TILE_W = BAY * TILE_COLS, TILE_H = FLOOR_H * TILE_ROWS;

/** 같은 도면이면 늘 같은 풍경이 나오게 하는 고정 씨앗 난수 (0~1) */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** 창 격자 텍스처 — 가끔 불 켜진 창 */
function facadeTexture(base, rand, lit = 0.1) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const cw = 256 / TILE_COLS, ch = 256 / TILE_ROWS;
  for (let j = 0; j < TILE_ROWS; j++) {
    for (let i = 0; i < TILE_COLS; i++) {
      const x = i * cw + cw * 0.14, y = j * ch + ch * 0.26, w = cw * 0.72, h = ch * 0.5;
      g.fillStyle = rand() < lit ? '#ffe7a8' : rand() < 0.5 ? '#5f6f80' : '#73859a';
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillRect(x - 1, y + h, w + 2, 2);   // 창턱
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 도로 텍스처 — 가로 10m, 세로(도로 폭) 한 장. 가운데 노란 겹선, 차로 흰 점선 */
function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#4b4f55';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e2b93b';
  g.fillRect(0, 61, 128, 2); g.fillRect(0, 65, 128, 2);
  g.fillStyle = '#e8e8e8';
  for (const y of [31, 95]) g.fillRect(0, y, 64, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * @param o { minX, maxX, minZ, maxZ } 우리 집 바깥 사각형(m), floor: 층
 * @returns { group, dispose }
 */
export function buildScenery({ minX, maxX, minZ, maxZ, floor = 10 }) {
  const group = new THREE.Group();
  const textures = [];
  const rand = rng(20261101);
  const groundY = -((Math.max(1, floor) - 1) * FLOOR_H + 1.0);
  const cx = (minX + maxX) / 2, W = maxX - minX, D = maxZ - minZ;
  const zF = maxZ;                                 // 앞(거실 창) 쪽 바깥벽
  const lambert = (o) => new THREE.MeshLambertMaterial(o);
  const keep = (t) => (textures.push(t), t);

  const apt = [keep(facadeTexture('#eeeae3', rand)), keep(facadeTexture('#e4e8ec', rand)), keep(facadeTexture('#efe6d8', rand))];
  const villa = ['#b26a52', '#d8c9b0', '#c4c6c3', '#a5806a'].map((c) => keep(facadeTexture(c, rand, 0.06)));

  /** 창 텍스처를 입힌 건물 상자. y0: 바닥 높이, vShift: 창 줄을 층에 맞추려 아래로 민 높이(m) */
  const block = (x, z, w, d, h, tex, { y0 = groundY, roof = '#8b9096', vShift = 0, top = true } = {}) => {
    const face = (len) => {
      const t = keep(tex.clone());
      t.repeat.set(len / TILE_W, h / TILE_H);
      t.offset.set(0, -vShift / TILE_H);
      t.needsUpdate = true;
      return lambert({ map: t });
    };
    const side = face(d), front = face(w), roofM = lambert({ color: roof });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roofM, roofM, front, front]);
    m.position.set(x, y0 + h / 2, z);
    group.add(m);
    if (top && h > 20) {   // 옥상 계단실
      const r = new THREE.Mesh(new THREE.BoxGeometry(Math.min(8, w * 0.3), 3, Math.min(6, d * 0.5)), roofM);
      r.position.set(x, y0 + h + 1.5, z);
      group.add(r);
    }
    return m;
  };

  // 땅 · 단지 바닥
  const plane = (w, d, color, x, z, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lambert({ color }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  plane(9000, 9000, '#8c9a7b', cx, (minZ + maxZ) / 2, groundY);
  plane(260, zF + 16 - (minZ - 60), '#cdc6b9', cx, (zF + 16 + minZ - 60) / 2, groundY + 0.02);

  // 우리 동: 우리 집 아래층 외벽 + 양옆 세대 (우리 층부터 꼭대기까지). 창 줄은 층 경계에 맞춘다
  const topFloors = Math.max(floor + 4, 15), unitW = Math.max(W, 8);
  const below = -groundY;
  if (below > 0.1) block(cx, (minZ + maxZ) / 2, W + 2 * unitW, D, below - 0.02, apt[0], { vShift: 1.0, top: false });
  const upH = (topFloors - floor + 1) * FLOOR_H;
  for (const s of [-1, 1]) {
    block(cx + s * (W / 2 + unitW / 2 + 0.02), (minZ + maxZ) / 2, unitW, D, upH, apt[0], { y0: -0.02, vShift: 0 });
  }

  // 앞 도로 (4차로 16m) + 양쪽 인도 4m + 차 몇 대
  const L = 1600, roadZ = zF + 30;
  const rt = keep(roadTexture());
  rt.repeat.set(L / 10, 1);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(L, 16), lambert({ map: rt }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(cx, groundY + 0.03, roadZ);
  group.add(road);
  for (const z of [roadZ - 10, roadZ + 10]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(L, 0.15, 4), lambert({ color: '#bdb6ab' }));
    walk.position.set(cx, groundY + 0.075, z);
    group.add(walk);
  }
  const carColors = ['#f4f4f2', '#2b2f36', '#9aa3ad', '#7b1f24', '#1f3f6b', '#d8d2c4'];
  for (let i = 0; i < 14; i++) {
    const lane = [-6, -2, 2, 6][Math.floor(rand() * 4)], x = cx + (rand() - 0.5) * 300;
    const car = new THREE.Group();
    const body = lambert({ color: carColors[Math.floor(rand() * carColors.length)] });
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.75, 1.8), body); b.position.y = 0.55;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.6), lambert({ color: '#3a4450' })); cab.position.set(-0.2, 1.2, 0);
    car.add(b, cab);
    car.position.set(x, groundY + 0.03, roadZ + lane);
    group.add(car);
  }

  // 길 건너 빌라 줄 (4~5층)
  for (let x = cx - 160; x < cx + 160;) {
    const w = 11 + rand() * 6, d = 11 + rand() * 3, floors = 4 + Math.floor(rand() * 2);
    block(x + w / 2, roadZ + 18 + d / 2, w, d, floors * FLOOR_H + 0.4, villa[Math.floor(rand() * villa.length)], { roof: '#7d6f66' });
    x += w + 3 + rand() * 6;
  }

  // 아파트 동: 앞쪽 먼 줄, 뒤쪽 우리 단지, 양옆 같은 줄
  const slab = (x, z, floors, tex) => block(x, z, 42 + rand() * 18, 13, floors * FLOOR_H, tex);
  for (const [dz, xs] of [[150, [-110, -10, 100]], [240, [-160, -50, 60, 170]]]) {
    for (const dx of xs) slab(cx + dx + (rand() - 0.5) * 20, zF + dz, 18 + Math.floor(rand() * 10), apt[Math.floor(rand() * 3)]);
  }
  for (const [dz, xs] of [[-50, [-80, 0, 80]], [-120, [-120, -30, 60, 150]]]) {
    for (const dx of xs) slab(cx + dx + (rand() - 0.5) * 16, minZ + dz, 15 + Math.floor(rand() * 12), apt[Math.floor(rand() * 3)]);
  }
  for (const s of [-1, 1]) {
    for (const k of [1, 2]) slab(cx + s * (W / 2 + unitW + 25 + k * 55), (minZ + maxZ) / 2 + (rand() - 0.5) * 10, 15 + Math.floor(rand() * 10), apt[k % 3]);
  }
  // 그 너머 시가지 (반지름 320~900m)
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, r = 320 + rand() * 580;
    const w = 18 + rand() * 40, d = 12 + rand() * 12, floors = 6 + Math.floor(rand() * 24);
    block(cx + Math.cos(a) * r, (minZ + maxZ) / 2 + Math.sin(a) * r, w, d, floors * FLOOR_H, apt[i % 3]);
  }

  // 가로수 · 단지 나무 (한 번에 그리는 InstancedMesh)
  const spots = [];
  for (let x = cx - 300; x < cx + 300; x += 9) for (const z of [roadZ - 10, roadZ + 10]) spots.push([x + rand() * 2, z]);
  for (let i = 0; i < 70; i++) {
    const x = cx + (rand() - 0.5) * 220;
    const z = rand() < 0.5 ? zF + 3 + rand() * 9 : minZ - 8 - rand() * 18;
    if (Math.abs(x - cx) < W / 2 + unitW + 2 && z > minZ - 3 && z < zF + 3) continue;
    spots.push([x, z]);
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 2.6, 6), lambert({ color: '#6b4f3a' }), spots.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.9, 0), lambert({ color: '#5d8a4c' }), spots.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach(([x, z], i) => {
    const s = 0.8 + rand() * 0.6;
    mtx.compose(new THREE.Vector3(x, groundY + 1.3 * s, z), q.identity(), new THREE.Vector3(s, s, s));
    trunk.setMatrixAt(i, mtx);
    e.set(0, rand() * Math.PI, 0);
    mtx.compose(new THREE.Vector3(x, groundY + 3.4 * s, z), q.setFromEuler(e), new THREE.Vector3(s, s * 1.15, s));
    crown.setMatrixAt(i, mtx);
  });
  group.add(trunk, crown);

  // 산 능선 세 겹 — 가까운 것은 짙은 초록, 먼 것은 푸르스름하게 (안개가 더 흐리게 만든다)
  const ridge = (R, hMin, hMax, color, seed) => {
    const r2 = rng(seed), N = 240, pos = [];
    const ph = [r2() * 6.28, r2() * 6.28, r2() * 6.28];
    const height = (a) => {
      const n = 0.5 + 0.3 * Math.sin(a * 3 + ph[0]) + 0.15 * Math.sin(a * 7 + ph[1]) + 0.08 * Math.sin(a * 17 + ph[2]);
      return hMin + (hMax - hMin) * Math.max(0, Math.min(1, n));
    };
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const p = (a, r, y) => [cx + Math.cos(a) * r, y, (minZ + maxZ) / 2 + Math.sin(a) * r];
      const b0 = p(a0, R, groundY - 5), b1 = p(a1, R, groundY - 5);
      const t0 = p(a0, R + 250, groundY + height(a0)), t1 = p(a1, R + 250, groundY + height(a1));
      pos.push(...b0, ...t0, ...b1, ...b1, ...t0, ...t1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    group.add(m);
  };
  ridge(1500, 60, 260, '#5f7a5a', 11);
  ridge(2300, 120, 420, '#748f86', 23);
  ridge(3200, 200, 620, '#93a9b3', 37);

  // 하늘: 지평선은 옅고 위로 갈수록 파란 둥근 지붕
  const sky = new THREE.SphereGeometry(4600, 32, 16);
  const cols = [], lo = new THREE.Color('#e3edf4'), hi = new THREE.Color('#7fb0e0'), tmp = new THREE.Color();
  const sp = sky.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const k = Math.max(0, sp.getY(i) / 4600);
    tmp.copy(lo).lerp(hi, Math.pow(k, 0.6));
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const skyM = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyM.position.set(cx, 0, (minZ + maxZ) / 2);
  skyM.renderOrder = -1;
  group.add(skyM);

  return {
    group,
    groundY,
    dispose() { textures.forEach((t) => t.dispose()); },
  };
}
