// 3D 보기 — 도면 mm를 m로 바꿔 x=도면 x, z=도면 y 로 놓는다. 가구는 바닥에서 끌어 옮긴다.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { state, ui, on, checkpoint, select, updateFurniture } from './store.js';
import { buildFurniture, buildWindow, disposeObject } from './models3d.js';
import * as G from './geometry.js';
import { ROOM_COLORS, fmtMM } from './plan2d.js';

const M = 0.001;
const LOW_WALL_MM = 1000;

export class View3D {
  constructor(container) {
    this.el = container;
    this.wallOpacity = 1;
    this.floorImage = true;
    this.lowWalls = false;

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
    dom.addEventListener('pointermove', (e) => this.onMove(e));
    dom.addEventListener('pointerup', (e) => this.onUp(e));

    new ResizeObserver(() => this.resize()).observe(container);
    on('plan', () => { this.buildPlan(); this.syncFurniture(); });
    on('furniture', () => this.syncFurniture());
    on('library', () => { this.textures.clear(); this.syncFurniture(true); });
    on('selection', () => this.syncFurniture());

    this.buildPlan();
    this.syncFurniture();
    this.resetCamera('persp');
    this.renderer.setAnimationLoop(() => this.tick());
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // 사용자가 아직 카메라를 돌리지 않았으면 새 화면 비율에 맞춰 다시 잡는다
    if (!this.userMoved) this.resetCamera(this.camMode);
  }

  tick() {
    if (!this.el.clientWidth) return;
    this.controls.update();
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
        o.material.transparent = v < 1;
        o.material.depthWrite = v >= 1;
        o.castShadow = v >= 0.6;
      }
    });
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

  setFloorImage(v) {
    this.floorImage = v;
    this.buildPlan();
  }

  buildPlan() {
    disposeObject(this.planGroup);
    this.planGroup.clear();
    const p = state.plan;
    const { cx, cz, size } = this.bounds();
    this.floorTex?.dispose();
    this.floorTex = null;

    // 바닥
    const floorMat = new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 0.95 });
    let fw = size * 3, fd = size * 3, fx = cx, fz = cz;
    if (p.image && this.floorImage) {
      fw = p.image.width * p.mmPerPx * M;
      fd = p.image.height * p.mmPerPx * M;
      fx = fw / 2; fz = fd / 2;
      const tex = new THREE.TextureLoader().load(p.image.src);
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
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(fx, 0, fz);
    floor.receiveShadow = true;
    this.planGroup.add(floor);
    if (!p.image || !this.floorImage) {
      const grid = new THREE.GridHelper(Math.ceil(size * 3), Math.ceil(size * 3), '#c9d0d8', '#dde2e8');
      grid.position.set(Math.round(cx), 0.001, Math.round(cz));
      this.planGroup.add(grid);
    }

    // 방 바닥 + 이름
    p.rooms.forEach((r, i) => {
      if (r.pts.length < 3) return;
      const shape = new THREE.Shape(r.pts.map((q) => new THREE.Vector2(q.x * M, -q.y * M)));
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshStandardMaterial({ color: ROOM_COLORS[i % ROOM_COLORS.length], transparent: true, opacity: 0.4, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.003;
      mesh.receiveShadow = true;
      this.planGroup.add(mesh);
      const c = G.polygonCentroid(r.pts);
      const el = document.createElement('div');
      el.className = 'label3d room';
      el.textContent = `${r.name} ${(G.polygonArea(r.pts) / 1e6).toFixed(1)}㎡`;
      const lab = new CSS2DObject(el);
      lab.position.set(c.x * M, 0.05, c.y * M);
      this.planGroup.add(lab);
    });

    // 벽
    // '벽 낮게'는 안이 잘 보이도록 벽을 허리 높이로 잘라 보여 준다 (단면도처럼)
    const Hmm = this.lowWalls ? Math.min(p.wallHeight, LOW_WALL_MM) : p.wallHeight;
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
    this.setWallOpacity(this.wallOpacity);

    // 그림자 범위를 도면에 맞춘다
    const half = size * 0.75;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: size * 4 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.position.set(cx + size * 0.4, size * 1.2, cz + size * 0.6);
    this.sun.target.position.set(cx, 0, cz);
  }

  textureFor(f) {
    if (!f.libId || !f.usePhoto) return null;
    const lib = state.library.find((l) => l.id === f.libId);
    if (!lib?.image) return null;
    if (!this.textures.has(lib.id)) {
      const t = new THREE.TextureLoader().load(lib.image);
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(lib.id, t);
    }
    return this.textures.get(lib.id);
  }

  syncFurniture(force = false) {
    const bad = G.findCollisions(state.furniture, state.plan.walls);
    const alive = new Set();
    const selId = ui.selection?.kind === 'furniture' ? ui.selection.id : null;
    for (const f of state.furniture) {
      alive.add(f.id);
      const key = [f.type, f.w, f.d, f.h, f.seats, f.people, f.color, f.libId, f.usePhoto, f.id === selId, bad.has(f.id)].join('|');
      let e = this.fmap.get(f.id);
      if (!e || e.key !== key || force) {
        if (e) { this.furnGroup.remove(e.obj); disposeObject(e.obj); }
        const obj = buildFurniture(f, this.textureFor(f));
        obj.traverse((o) => { o.userData.fid = f.id; });
        if (f.id === selId || bad.has(f.id)) {
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
      e.obj.position.set(f.x * M, (f.elev || 0) * M, f.y * M);
      e.obj.rotation.y = -f.rot * G.DEG;
    }
    for (const [id, e] of this.fmap) {
      if (!alive.has(id)) { this.furnGroup.remove(e.obj); disposeObject(e.obj); this.fmap.delete(id); }
    }

    const sel = state.furniture.find((f) => f.id === selId);
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
    if (e.button !== 0) return;
    this.down = { x: e.clientX, y: e.clientY };
    const fid = this.pickFurniture(e);
    if (!fid) return;
    const f = state.furniture.find((x) => x.id === fid);
    select({ kind: 'furniture', id: fid });
    const p = this.floorPoint(e);
    if (!p) return;
    this.drag = { id: fid, dx: f.x - p.x, dy: f.y - p.y, started: false };
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.renderer.domElement.style.cursor = 'grabbing';
  }

  onMove(e) {
    if (this.drag) {
      const p = this.floorPoint(e);
      if (!p) return;
      if (!this.drag.started) { checkpoint(); this.drag.started = true; }
      updateFurniture(this.drag.id, {
        x: Math.round((p.x + this.drag.dx) / 10) * 10,
        y: Math.round((p.y + this.drag.dy) / 10) * 10,
      });
      return;
    }
    if (e.buttons === 0) this.renderer.domElement.style.cursor = this.pickFurniture(e) ? 'grab' : 'default';
  }

  onUp(e) {
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

  capture() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
