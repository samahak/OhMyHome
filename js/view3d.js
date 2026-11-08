// 3D 보기 — 도면 mm를 m로 바꿔 x=도면 x, z=도면 y 로 놓는다. 가구는 바닥에서 끌어 옮긴다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  state, on, select, selectedFurnitureIds, isFurnitureSelected, toggleFurnitureSelection, beginFurnitureDrag, dragFurnitureTo,
} from './store.js';
import {
  buildFurniture, buildWindow, buildDoorFrame, buildDoorLeaf, buildSlidingLeaf, buildGlassLeaf, buildTransom, setGhost, disposeObject, MIDDLE_FRAME,
} from './models3d.js';
import { DOOR } from './catalog.js';
import { doorGeometry, slidingPanels, doorStyle, isHinged, swingLeaves, SLIDE } from './doors.js';
import * as G from './geometry.js';
import { ROOM_COLORS, fmtMM } from './plan2d.js';
import { Tour } from './tour.js';

const M = 0.001;
/** 3D 캡처 묶음: 위에서 · 앞 왼쪽 비스듬히 · 앞 오른쪽 비스듬히 (dir: 집에서 카메라 쪽 방향, +z가 도면 아래쪽 = 앞) */
export const SHOTS = [
  { name: '위', dir: [0, 1, 0] },
  { name: '왼쪽', dir: [-0.6, 0.75, 0.62] },
  { name: '오른쪽', dir: [0.6, 0.75, 0.62] },
];
const LOW_WALL_MM = 1000;
/** 둘러보기에서 바닥을 내리는 곳 (mm): 현관(신발 벗는 곳)과 욕실·화장실. 회색 타일로 깐다 */
export const SUNKEN = { entry: 120, bath: 60, entryDepth: 1200, tile: 600 };

/**
 * 바닥을 내리는 구역 [{ pts, drop }] (mm). 이름이 '현관'(현관창고 등은 빼고)·'욕실'·'화장실'인 방 영역.
 * 현관 방 영역이 없으면 현관문 안쪽으로 문 폭 × SUNKEN.entryDepth를 현관으로 본다.
 */
export function sunkenZones(plan) {
  const zones = [];
  const isEntry = (n) => /현관/.test(n) && !/창고|중문|팬트리|펜트리/.test(n);
  for (const r of plan.rooms || []) {
    if (r.pts.length < 3) continue;
    if (/욕실|화장실/.test(r.name)) zones.push({ pts: r.pts, drop: SUNKEN.bath, kind: 'bath' });
    else if (isEntry(r.name)) zones.push({ pts: r.pts, drop: SUNKEN.entry, kind: 'entry' });
  }
  const e = plan.entrance;
  if (e && !zones.some((z) => z.kind === 'entry')) {
    const ix = -e.out.x, iy = -e.out.y, f = e.t / 2, k = f + SUNKEN.entryDepth;
    zones.push({ pts: [
      { x: e.a.x + ix * f, y: e.a.y + iy * f }, { x: e.b.x + ix * f, y: e.b.y + iy * f },
      { x: e.b.x + ix * k, y: e.b.y + iy * k }, { x: e.a.x + ix * k, y: e.a.y + iy * k },
    ], drop: SUNKEN.entry, kind: 'entry' });
  }
  return zones;
}

let tileTex = null;
/** 회색 바닥 타일 (1칸 = 1m, 줄눈 포함) — 바닥 UV가 m 단위라 repeat로 SUNKEN.tile 크기를 맞춘다 */
function tileTexture() {
  if (tileTex) return tileTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#b8bbbe'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {   // 돌 무늬 얼룩
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '90,95,100'},${0.04 + Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 10, 2 + Math.random() * 10);
  }
  g.fillStyle = '#8f9397'; g.fillRect(0, 0, 256, 4); g.fillRect(0, 0, 4, 256);   // 줄눈
  tileTex = new THREE.CanvasTexture(cv);
  tileTex.colorSpace = THREE.SRGBColorSpace;
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(1000 / SUNKEN.tile, 1000 / SUNKEN.tile);
  return tileTex;
}

export class View3D {
  constructor(container) {
    this.el = container;
    this.wallOpacity = 1;
    this.floorImage = true;
    this.lowWalls = false;
    this.tourMode = false;     // 둘러보기 중: 나무 바닥, 천장 높이 벽, 이름표 숨김
    this.tour = null;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    Object.assign(this.labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9edf2');
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    this.camera.position.set(5, 9, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('start', () => { this.userMoved = true; });
    this.controls.addEventListener('change', () => this.invalidate());

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a96a8', 1.1));
    this.sun = new THREE.DirectionalLight('#ffffff', 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    this.planGroup = new THREE.Group();
    this.furnGroup = new THREE.Group();
    this.scene.add(this.planGroup, this.furnGroup);
    this.fmap = new Map();      // 가구 id → { obj, key }
    this.textures = new Map();  // 내 가구 id → THREE.Texture
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.raycaster = new THREE.Raycaster();

    this.label = new CSS2DObject(document.createElement('div'));
    this.label.element.className = 'label3d';
    this.label.visible = false;
    this.scene.add(this.label);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => this.onDown(e));
    dom.addEventListener('pointermove', (e) => { this.invalidate(); this.onMove(e); });
    dom.addEventListener('pointerup', (e) => this.onUp(e));

    new ResizeObserver(() => this.resize()).observe(container);
    on('plan', () => { this.buildPlan(); this.syncFurniture(); });
    on('furniture', () => this.syncFurniture());
    on('library', () => { this.textures.clear(); this.syncFurniture(true); });
    on('selection', () => this.syncFurniture());
    on('layouts', () => this.invalidate());
    // 화면을 바꿀 수 있는 입력(버튼·슬라이더·체크·키·휠)이 오면 몇 장 더 그린다 — 장면을 직접 바꾸는 곳을 하나하나 다 챙기지 않아도 되게
    for (const t of ['pointerdown', 'pointerup', 'click', 'input', 'change', 'keydown', 'keyup', 'wheel']) {
      document.addEventListener(t, () => this.invalidate(), { capture: true, passive: true });
    }

    this.buildPlan();
    this.syncFurniture();
    this.resetCamera('persp');
    // 그릴 일이 있을 때만 그린다(dirty 프레임 수). 가만히 있을 때도 그림자·1,000번 넘는 그리기를 초당 60번 하면
    // 노트북이 계속 바빠져 화면 전체가 가끔 버벅인다. 둘러보기 중에는 늘 움직이므로 매 프레임 그린다
    this.dirty = 3;
    this.renderer.setAnimationLoop(() => this.tick());
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // 사용자가 아직 카메라를 돌리지 않았으면 새 화면 비율에 맞춰 다시 잡는다 (둘러보기 중에는 카메라를 tour.js가 쥐고 있다 —
    // 여기서 다시 잡으면 먼 풍경용 far가 500m로 돌아가 하늘·산이 잘린다)
    if (!this.userMoved && !this.tour) this.resetCamera(this.camMode);
    this.invalidate();
  }

  /** 다음 몇 프레임을 다시 그리게 한다 — 장면·카메라·화면 크기가 바뀌면 부른다 */
  invalidate(frames = 3) { this.dirty = Math.max(this.dirty || 0, frames); }

  tick() {
    const dt = this.clock.getDelta();
    if (!this.el.clientWidth) return;
    if (this.tour) { this.tour.update(dt); this.invalidate(1); }   // 둘러보기는 늘 움직인다
    else if (this.controls.update()) this.invalidate(1);           // 돌리고 난 뒤 감속(damping)하는 동안
    if (this.dirty <= 0) return;
    this.dirty--;
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  /** 도면 범위 (m) */
  bounds() {
    const p = state.plan;
    const pts = [];
    if (p.image) pts.push({ x: 0, y: 0 }, { x: p.image.width * p.mmPerPx, y: p.image.height * p.mmPerPx });
    for (const w of p.walls) pts.push(w.a, w.b);
    for (const f of state.furniture) pts.push(f);
    const b = G.boundsOf(pts) || { minX: 0, minY: 0, w: 10000, h: 8000 };
    return { cx: (b.minX + b.w / 2) * M, cz: (b.minY + b.h / 2) * M, size: Math.max(b.w, b.h, 3000) * M, b };
  }

  resetCamera(mode = 'persp') {
    this.invalidate();
    const { cx, cz, size } = this.bounds();
    // 도면 전체가 화면 폭·높이 안에 들어오는 거리
    const half = Math.tan((this.camera.fov * G.DEG) / 2);
    const dist = (size * 0.62) / half / Math.min(1, this.camera.aspect);
    this.controls.target.set(cx, 0, cz);
    if (mode === 'top') this.camera.position.set(cx, dist, cz + 0.001);
    else {
      const dir = new THREE.Vector3(0.2, 0.85, 0.62).normalize().multiplyScalar(dist);
      this.camera.position.set(cx + dir.x, dir.y, cz + dir.z);
    }
    this.camera.far = Math.max(500, dist * 6);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.camMode = mode;
    this.userMoved = false;
  }

  /** 새 가구를 놓을 자리: 지금 바라보는 곳 */
  viewCenter() {
    const t = this.controls.target;
    return { x: t.x / M, y: t.z / M };
  }

  setWallOpacity(v) {
    this.wallOpacity = v;
    this.planGroup.traverse((o) => {
      if (o.userData.isWall) {
        o.material.opacity = v;
        // 불투명 ↔ 투명이 바뀌면 셰이더를 다시 만들어야 한다 (three.js는 불투명 재질이면 opacity를 무시하는 셰이더로 그린다)
        if (o.material.transparent !== v < 1) o.material.needsUpdate = true;
        o.material.transparent = v < 1;
        o.material.depthWrite = v >= 1;
        o.castShadow = v >= 0.6;
      }
    });
    this.invalidate();
  }

  /** 벽 토막 하나: o에서 u 방향으로 s0~s1(mm), 높이 y0~y1(mm), 두께 t(mm) */
  wallPiece(o, u, s0, s1, y0, y1, t, mat) {
    const len = (s1 - s0) * M, h = (y1 - y0) * M, sm = (s0 + s1) / 2;
    if (len <= 0 || h <= 0) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, h, t * M), mat);
    mesh.position.set((o.x + u.x * sm) * M, y0 * M + h / 2, (o.y + u.y * sm) * M);
    mesh.rotation.y = -Math.atan2(u.y, u.x);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.isWall = true;
    // 모서리를 진하게 보여 줘서 위에서 볼 때 벽 두께가 읽히게 한다
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#9aa3ad' })));
    this.planGroup.add(mesh);
  }

  setLowWalls(v) {
    this.lowWalls = v;
    this.buildPlan();
  }

  /** 둘러보기를 시작한다. 현관(state.plan.entrance)이 정해져 있어야 한다. */
  startTour(hooks) {
    if (this.tour) return;
    select(null);
    this.tour = new Tour(this, {
      ...hooks,
      onExit: () => { this.tour = null; this.invalidate(); hooks.onExit?.(); },
    });
    this.tour.start();
  }

  setTourMode(v) {
    this.tourMode = v;
    if (!v) this.doorsGhost = false;
    this.scene.background = new THREE.Color(v ? '#cfe2f3' : '#e9edf2');   // 둘러보기: 창밖 하늘
    this.labels.domElement.style.display = v ? 'none' : '';
    this.buildPlan();
    this.syncFurniture(true);
  }

  /** 내린 바닥(타일) + 가장자리 단차 옆면 */
  buildSunken() {
    const tile = new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.45 });
    const side = new THREE.MeshStandardMaterial({ color: '#a9adb1', roughness: 0.6, side: THREE.DoubleSide });
    for (const z of this.sunken) {
      const sh = new THREE.Shape(z.pts.map((q) => new THREE.Vector2(q.x * M, -q.y * M)));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), tile);
      m.rotation.x = -Math.PI / 2;
      m.position.y = -z.drop * M;
      m.receiveShadow = true;
      this.planGroup.add(m);
      z.pts.forEach((a, i) => {
        const b = z.pts[(i + 1) % z.pts.length], len = G.dist(a, b);
        if (len < 1) return;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(len * M, z.drop * M), side);
        f.position.set(((a.x + b.x) / 2) * M, (-z.drop / 2) * M, ((a.y + b.y) / 2) * M);
        f.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
        this.planGroup.add(f);
      });
    }
  }

  /** 둘러보기에서 도면 점 p(mm)의 바닥 높이 (m, 내린 곳이면 음수) */
  floorAt(p) {
    for (const z of this.sunken || []) if (G.pointInPoly(p, z.pts)) return -z.drop * M;
    return 0;
  }

  setFloorImage(v) {
    this.floorImage = v;
    this.buildPlan();
  }

  buildPlan() {
    this.invalidate();
    disposeObject(this.planGroup);
    this.planGroup.clear();
    const p = state.plan;
    const { cx, cz, size } = this.bounds();
    this.floorTex?.dispose();
    this.floorTex = null;

    // 바닥
    const floorMat = new THREE.MeshStandardMaterial({ color: this.tourMode ? '#cdb08a' : '#f4f1ec', roughness: this.tourMode ? 0.7 : 0.95 });
    let fw = size * 3, fd = size * 3, fx = cx, fz = cz;
    const wb = this.tourMode && p.walls.length && G.boundsOf(p.walls.flatMap((w) => [w.a, w.b]));
    if (wb) {
      // 둘러보기: 나무 바닥은 집 안에만 깐다. 창밖 땅·건물은 tour.js가 층수에 맞춰 놓는다(scenery.js)
      fw = wb.w * M + 0.4; fd = wb.h * M + 0.4;
      fx = (wb.minX + wb.w / 2) * M; fz = (wb.minY + wb.h / 2) * M;
    }
    if (p.image && this.floorImage && !this.tourMode) {
      fw = p.image.width * p.mmPerPx * M;
      fd = p.image.height * p.mmPerPx * M;
      fx = fw / 2; fz = fd / 2;
      const tex = new THREE.TextureLoader().load(p.image.src, () => this.invalidate());   // 그림을 다 읽으면 다시 그린다
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      floorMat.map = tex;
      this.floorTex = tex;
      floorMat.color.set('#ffffff');
      // 도면 바깥 바닥
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size * 4), new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 1 }));
      outer.rotation.x = -Math.PI / 2;
      outer.position.set(cx, -0.004, cz);
      outer.receiveShadow = true;
      this.planGroup.add(outer);
    }
    // 둘러보기: 현관·욕실은 나무 바닥에 구멍을 내고 그 자리에 회색 타일을 내려 깐다(단차)
    this.sunken = this.tourMode ? sunkenZones(p) : [];
    let floor;
    if (this.sunken.length) {
      const sh = new THREE.Shape([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => new THREE.Vector2(fx + (sx * fw) / 2, -(fz + (sz * fd) / 2))));
      for (const z of this.sunken) sh.holes.push(new THREE.Path(z.pts.map((q) => new THREE.Vector2(q.x * M, -q.y * M))));
      floor = new THREE.Mesh(new THREE.ShapeGeometry(sh), floorMat);
      floor.rotation.x = -Math.PI / 2;
      this.buildSunken();
    } else {
      floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(fx, 0, fz);
    }
    floor.receiveShadow = true;
    this.planGroup.add(floor);
    if ((!p.image || !this.floorImage) && !this.tourMode) {
      const grid = new THREE.GridHelper(Math.ceil(size * 3), Math.ceil(size * 3), '#c9d0d8', '#dde2e8');
      grid.position.set(Math.round(cx), 0.001, Math.round(cz));
      this.planGroup.add(grid);
    }

    // 방 바닥 + 이름
    p.rooms.forEach((r, i) => {
      if (r.pts.length < 3 || r.hidden) return;
      const shape = new THREE.Shape(r.pts.map((q) => new THREE.Vector2(q.x * M, -q.y * M)));
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({ color: ROOM_COLORS[i % ROOM_COLORS.length], transparent: true, opacity: 0.4, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
      );
      const c = G.polygonCentroid(r.pts);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.003 + this.floorAt(c);   // 둘러보기에서 내린 바닥(현관·욕실)이면 그 높이에
      mesh.receiveShadow = true;
      this.planGroup.add(mesh);
      const el = document.createElement('div');
      el.className = 'label3d room';
      el.textContent = `${r.name} ${(G.polygonArea(r.pts) / 1e6).toFixed(1)}㎡`;
      const lab = new CSS2DObject(el);
      lab.position.set(c.x * M, 0.05, c.y * M);
      this.planGroup.add(lab);
    });

    // 벽
    // '벽 낮게'는 안이 잘 보이도록 벽을 허리 높이로 잘라 보여 준다 (단면도처럼)
    const Hmm = this.lowWalls && !this.tourMode ? Math.min(p.wallHeight, LOW_WALL_MM) : p.wallHeight;
    const wins = p.windows || [];
    // 벽은 창 자리만큼 잘라 여러 토막으로 세운다 (창 아래·위 벽은 창 쪽에서 채운다)
    for (const w of p.walls) {
      const len = G.wallLength(w), d = G.dist(w.a, w.b);
      if (len <= 0 || !d) continue;
      const mat = new THREE.MeshStandardMaterial({ color: w.auto ? '#f2efe9' : '#f5f2ec', roughness: 0.9 });
      const u = { x: (w.b.x - w.a.x) / d, y: (w.b.y - w.a.y) / d }, ext = w.cap ? w.t / 2 : 0;
      const o = { x: w.a.x - u.x * ext, y: w.a.y - u.y * ext };
      const cuts = wins.map((win) => G.windowSpanOnWall(win, w)).filter(Boolean).sort((a, b) => a[0] - b[0]);
      let at = 0;
      for (const [c0, c1] of cuts) {
        if (c0 > at) this.wallPiece(o, u, at, c0, 0, Hmm, w.t, mat);
        at = Math.max(at, c1);
      }
      if (len > at) this.wallPiece(o, u, at, len, 0, Hmm, w.t, mat);
    }
    // 창: 창 아래 벽 + 창틀·유리 + 창 위 벽 ('벽 낮게'에서는 잘린 높이까지만)
    for (const win of wins) {
      const len = G.dist(win.a, win.b);
      if (!len) continue;
      const u = { x: (win.b.x - win.a.x) / len, y: (win.b.y - win.a.y) / len };
      const mat = new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.9 });
      const sill = Math.min(win.sill, Hmm), top = Math.min(win.sill + win.h, Hmm);
      if (sill > 0) this.wallPiece(win.a, u, 0, len, 0, sill, win.t, mat);
      if (top < Hmm) this.wallPiece(win.a, u, 0, len, top, Hmm, win.t, mat);
      if (top - sill < 50) continue;
      const g = buildWindow(len * M, (top - sill) * M, win.t * M, sill * M);
      g.position.set(((win.a.x + win.b.x) / 2) * M, sill * M, ((win.a.y + win.b.y) / 2) * M);
      g.rotation.y = -Math.atan2(u.y, u.x);
      this.planGroup.add(g);
    }
    // 문: 문 위 벽(문 높이 ~ 천장) + 문틀 + 도면 기호대로 90° 열린 문짝(미닫이는 벽 면을 따라 끝까지 연 문짝 + 레일).
    // 둘러보기 중 현관문은 tour.js가 따로 여닫는다. 문짝은 doorLeaves에 모아 둘러보기 중 형태만 보이게 한다(setDoorsGhost)
    const e = p.entrance;
    this.doorLeaves = [];
    for (const d of p.doors || []) {
      const g = doorGeometry(d), mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
      if (this.tourMode && e && G.distToSegment(mid, e.a, e.b).dist < 200) continue;
      const doorH = Math.min(DOOR.h, Hmm), style = doorStyle(d), rot = -Math.atan2(g.u.y, g.u.x);
      if (style === 'middle' && Hmm - DOOR.h > 60) {   // 중문: 문 위는 벽 대신 고정 유리
        const tr = buildTransom(g.len * M, (Hmm - DOOR.h) * M, 0.05);
        tr.position.set(mid.x * M, DOOR.h * M, mid.y * M);
        tr.rotation.y = rot;
        this.planGroup.add(tr);
      } else if (Hmm > DOOR.h) this.wallPiece(d.a, g.u, 0, g.len, DOOR.h, Hmm, d.t, new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.9 }));
      const frame = buildDoorFrame(g.len * M, doorH * M, d.t * M, style === 'middle' ? MIDDLE_FRAME : undefined);
      frame.position.set(mid.x * M, 0, mid.y * M);
      frame.rotation.y = rot;
      this.planGroup.add(frame);
      if (!isHinged(d)) { this.slidingDoor(d, doorH); continue; }
      // 문짝: 로컬 +x → 도면 n(문짝이 뻗는 쪽). 로컬 +z는 도면 (-n.y, n.x) = -swing·u 이므로 두께는 틈 안쪽(+u)으로 둔다.
      // 양여닫이는 양 끝 경첩에 반쪽 짝 둘 (swingLeaves)
      for (const { door: h, g: lg } of swingLeaves(d)) {
        const leaf = buildDoorLeaf(lg.len * M, doorH * M, -h.swing);
        leaf.position.set((lg.hinge.x + lg.u.x * 40) * M, 0, (lg.hinge.y + lg.u.y * 40) * M);
        leaf.rotation.y = -Math.atan2(lg.n.y, lg.n.x);
        this.planGroup.add(leaf);
        this.doorLeaves.push(leaf);
      }
    }
    if (this.doorsGhost) this.setDoorsGhost(true);
    this.setWallOpacity(this.tourMode ? 1 : this.wallOpacity);

    // 그림자 범위를 도면에 맞춘다
    const half = size * 0.75;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: size * 4 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.position.set(cx + size * 0.4, size * 1.2, cz + size * 0.6);
    this.sun.target.position.set(cx, 0, cz);
  }

  /** 문짝을 형태(모서리 선)만 보이게 / 원래대로. 도면을 다시 그려도 이 상태를 지킨다 */
  setDoorsGhost(on) {
    this.doorsGhost = on;
    for (const leaf of this.doorLeaves || []) setGhost(leaf, on);
    this.invalidate();
  }

  /**
   * 미닫이·미서기·중문: 문짝마다 열린 자리(shift)로 밀어 둔다 — 미닫이는 문짝 폭의 92%, 미서기는 b 쪽 짝이 a 쪽 짝 위로,
   * 중문은 세 짝이 a 끝에 겹쳐 모인다.
   * 문 높이에 닫힌 자리 ~ 열린 자리를 덮는 레일(중문은 레일 셋 폭)
   */
  slidingDoor(d, doorH) {
    const s = slidingPanels(d), rot = -Math.atan2(s.u.y, s.u.x), T = SLIDE.t * M, glass = doorStyle(d) === 'middle';
    let lo = Infinity, hi = -Infinity;
    for (const pn of s.panels) {
      const w = pn.s1 - pn.s0, m = (pn.s0 + pn.s1) / 2 + pn.shift, edge = pn.shift > 0 ? -1 : 1;   // 손잡이는 열린 뒤 틈 쪽 끝
      lo = Math.min(lo, pn.s0, pn.s0 + pn.shift); hi = Math.max(hi, pn.s1, pn.s1 + pn.shift);
      const leaf = glass ? buildGlassLeaf(w * M, (doorH - 15) * M, T, edge) : buildSlidingLeaf(w * M, (doorH - 15) * M, T, edge);
      const c = s.at(m, pn.off);
      leaf.position.set(c.x * M, 0.005, c.y * M);
      leaf.rotation.y = rot;
      this.planGroup.add(leaf);
      this.doorLeaves.push(leaf);
    }
    // 레일: 문짝 레일들을 덮는 폭. 벽 면 밖에 붙는 미닫이·중문은 벽 면까지 이어 붙인다(미서기는 벽 두께 안)
    const offs = s.panels.map((pn) => pn.off);
    let o0 = Math.min(...offs) - SLIDE.t / 2 - 5, o1 = Math.max(...offs) + SLIDE.t / 2 + 5;
    if (doorStyle(d) !== 'bypass') o0 = Math.min(o0, d.t / 2);
    const rail = new THREE.Mesh(new THREE.BoxGeometry((hi - lo) * M, 0.04, (o1 - o0) * M),
      new THREE.MeshStandardMaterial({ color: glass ? MIDDLE_FRAME : '#e9e3da', roughness: 0.6 }));
    const c = s.at((lo + hi) / 2, (o0 + o1) / 2);
    rail.position.set(c.x * M, doorH * M + 0.02, c.y * M);
    rail.rotation.y = rot;
    rail.castShadow = true;
    this.planGroup.add(rail);
  }

  textureFor(f) {
    if (!f.libId || !f.usePhoto) return null;
    const lib = state.library.find((l) => l.id === f.libId);
    if (!lib?.image) return null;
    if (!this.textures.has(lib.id)) {
      const t = new THREE.TextureLoader().load(lib.image, () => this.invalidate());
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(lib.id, t);
    }
    return this.textures.get(lib.id);
  }

  syncFurniture(force = false) {
    this.invalidate();
    const bad = G.findCollisions(state.furniture, state.plan.walls);
    const alive = new Set();
    const selIds = new Set(selectedFurnitureIds());
    for (const f of state.furniture) {
      alive.add(f.id);
      const picked = selIds.has(f.id);
      const key = [f.type, f.w, f.d, f.h, f.seats, f.people, f.mirror, f.counterD, f.legD, f.plant, f.wstyle, f.wstyle === 'mix' && f.mix, f.noDoor, f.stool, f.type === 'plant' && f.elev, f.color, f.libId, f.usePhoto, f.disabled, picked, bad.has(f.id)].join('|');
      let e = this.fmap.get(f.id);
      if (!e || e.key !== key || force) {
        if (e) { this.furnGroup.remove(e.obj); disposeObject(e.obj); }
        const obj = buildFurniture(f, this.textureFor(f));
        obj.traverse((o) => { o.userData.fid = f.id; });
        if (f.disabled) setGhost(obj, true);   // 비활성화한 가구: 거의 투명한 면 + 모서리 선
        if (!this.tourMode && (picked || bad.has(f.id))) {
          const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(f.w * M + 0.02, f.h * M + 0.02, f.d * M + 0.02)),
            new THREE.LineBasicMaterial({ color: bad.has(f.id) ? '#e03b30' : '#2f6fed', depthTest: false, transparent: true }),
          );
          outline.position.y = (f.h * M) / 2;
          outline.renderOrder = 10;
          obj.add(outline);
        }
        e = { obj, key };
        this.fmap.set(f.id, e);
        this.furnGroup.add(obj);
      }
      e.obj.position.set(f.x * M, (f.elev || 0) * M + (this.tourMode ? this.floorAt(f) : 0), f.y * M);   // 내린 바닥 위 가구도 함께
      e.obj.rotation.y = -f.rot * G.DEG;
    }
    for (const [id, e] of this.fmap) {
      if (!alive.has(id)) { this.furnGroup.remove(e.obj); disposeObject(e.obj); this.fmap.delete(id); }
    }

    // 치수 이름표는 하나만 골랐을 때 보인다
    const sel = !this.tourMode && selIds.size === 1 && state.furniture.find((f) => selIds.has(f.id));
    this.label.visible = !!sel;
    if (sel) {
      this.label.element.className = `label3d${bad.has(sel.id) ? ' bad' : ''}`;
      this.label.element.innerHTML = `<b>${escapeHtml(sel.name)}</b><br>${fmtMM(sel.w)} × ${fmtMM(sel.d)} × ${fmtMM(sel.h)} mm${bad.has(sel.id) ? '<br>⚠ 벽·가구와 겹침' : ''}`;
      this.label.position.set(sel.x * M, ((sel.elev || 0) + sel.h) * M + 0.25, sel.y * M);
    }
  }

  /* ---------- 마우스: 가구 끌기 ---------- */
  ndc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  pickFurniture(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hit = this.raycaster.intersectObjects(this.furnGroup.children, true).find((h) => h.object.isMesh);
    return hit ? hit.object.userData.fid : null;
  }

  floorPoint(e, height = 0) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    this.floorPlane.constant = -height;
    const v = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, v) ? { x: v.x / M, y: v.z / M } : null;
  }

  onDown(e) {
    if (this.tour || e.button !== 0) return;
    this.down = { x: e.clientX, y: e.clientY };
    const fid = this.pickFurniture(e);
    if (!fid) return;
    // Shift+클릭: 선택에 더하거나 빼기. 이미 고른 가구를 누르면 고른 것 전체를 함께 끈다
    if (e.shiftKey) { if (!toggleFurnitureSelection(fid)) { this.down = null; return; } }   // 뺀 경우: 놓을 때 전체 해제로 읽지 않게
    else if (!isFurnitureSelected(fid)) select({ kind: 'furniture', id: fid });
    const p = this.floorPoint(e);
    if (!p) return;
    this.drag = beginFurnitureDrag(selectedFurnitureIds(), p);
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.renderer.domElement.style.cursor = 'grabbing';
  }

  onMove(e) {
    if (this.tour) return;
    if (this.drag) {
      const p = this.floorPoint(e);
      if (!p) return;
      dragFurnitureTo(this.drag, p);
      return;
    }
    if (e.buttons === 0) this.renderer.domElement.style.cursor = this.pickFurniture(e) ? 'grab' : 'default';
  }

  onUp(e) {
    if (this.tour) return;
    if (this.drag) {
      this.drag = null;
      this.controls.enabled = true;
      this.renderer.domElement.style.cursor = 'grab';
      return;
    }
    // 빈 곳을 '클릭'하면(끌지 않고) 선택 해제
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 4) select(null);
    this.down = null;
  }

  /**
   * 캡처용 카메라 자리: dir 쪽에서 집(벽·가구 범위)이 가로 화면에 꽉 차게. 위에서(dir가 거의 위)는 바닥 사각형을,
   * 비스듬히는 집을 감싸는 공을 화면 짧은 쪽에 맞춘다.
   */
  shotCamera(dir, aspect) {
    const p = state.plan, pts = p.walls.flatMap((w) => [w.a, w.b]).concat(state.furniture);
    const b = pts.length ? G.boundsOf(pts) : this.bounds().b;
    const w = Math.max(b.w, 1000) * M, d = Math.max(b.h, 1000) * M, Hm = p.wallHeight * M;
    const c = new THREE.Vector3((b.minX + b.w / 2) * M, 0, (b.minY + b.h / 2) * M);
    const half = Math.tan((this.camera.fov * G.DEG) / 2), halfW = half * aspect;
    const v = new THREE.Vector3(...dir).normalize();
    if (v.y > 0.99) {
      const dist = Math.max(d / 2 / half, w / 2 / halfW) * 1.15 + Hm;
      return { pos: new THREE.Vector3(c.x, dist, c.z + 0.001), target: c, dist };
    }
    const target = c.clone().setY(Hm * 0.3), dist = ((0.5 * Math.hypot(w, d, Hm)) / Math.min(half, halfW)) * 1.05;
    return { pos: target.clone().addScaledVector(v, dist), target, dist };
  }

  /** 지금 3D 화면 한 장 (가로). 둘러보기 중에는 1인칭 화면 그대로 */
  capture(W = 1920, H = 1080) {
    return this.captureShots([{ name: '' }], W, H)[0].url;
  }

  /**
   * 3D를 가로 그림(W×H px) 여러 장으로. 화면 칸이 세로로 길어도 가로로 찍는다.
   * shot.dir가 있으면 그 방향에서 집이 꽉 차게 잡아 찍고(shotCamera), 없으면 지금 카메라로 찍는다
   * (아직 돌리지 않았으면 가로에 맞춰 다시 잡고 조금 다가간다). 화면 크기·카메라는 그대로 돌려 놓는다.
   * shot.W·shot.H가 있으면 그 장만 그 크기로 찍는다. floorImage: false면 바닥의 도면 그림(제목·설명·치수)을 잠시 끄고 찍는다.
   * @returns [{ name, url, width, height }]
   */
  captureShots(shots, W = 1920, H = 1080, { type = 'image/png', quality = 0.92, floorImage } = {}) {
    const r = this.renderer, cam = this.camera;
    const size = r.getSize(new THREE.Vector2()), ratio = r.getPixelRatio();
    const saved = { aspect: cam.aspect, pos: cam.position.clone(), target: this.controls.target.clone(), far: cam.far, mode: this.camMode, moved: this.userMoved };
    const floorSwap = floorImage !== undefined && floorImage !== this.floorImage && !this.tour;
    if (floorSwap) { this.floorImage = floorImage; this.buildPlan(); }
    r.setPixelRatio(1);
    const out = shots.map((shot) => {
      const w = shot.W || W, h = shot.H || H;
      r.setSize(w, h, false);   // false: 화면의 캔버스 CSS 크기는 건드리지 않는다
      cam.aspect = w / h;
      if (shot.dir && !this.tour) {
        const s = this.shotCamera(shot.dir, cam.aspect);
        cam.position.copy(s.pos);
        cam.far = Math.max(500, s.dist * 6);
        cam.lookAt(s.target);
      } else if (!this.userMoved && !this.tour) {
        this.resetCamera(this.camMode);
        // 화면용 맞춤은 여유가 넉넉해서 그림에서는 집이 작다 → 조금 다가가 찍는다
        cam.position.lerp(this.controls.target, 0.2);
        cam.lookAt(this.controls.target);
      }
      cam.updateProjectionMatrix();
      r.render(this.scene, cam);
      return { name: shot.name, url: r.domElement.toDataURL(type, quality), width: w, height: h };
    });
    if (floorSwap) { this.floorImage = !floorImage; this.buildPlan(); }
    r.setPixelRatio(ratio);
    r.setSize(size.x, size.y, false);
    cam.aspect = saved.aspect;
    cam.position.copy(saved.pos);
    this.controls.target.copy(saved.target);
    cam.far = saved.far;
    cam.updateProjectionMatrix();
    if (!this.tour) this.controls.update();
    this.camMode = saved.mode;
    this.userMoved = saved.moved;
    r.render(this.scene, cam);
    return out;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
