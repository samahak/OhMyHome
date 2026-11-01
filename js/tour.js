// 둘러보기 — 현관 앞에서 문을 열고 들어가 방들을 차례로 돌아본다. 언제든 직접 걸을 수 있다.
//   자동: 현관 앞 → 문 열기 → 현관 안쪽 → 들를 곳마다 걸어가서 한 바퀴 둘러보기
//   직접: WASD·방향키로 걷기, 화면을 끌어서 고개 돌리기 (벽·가구는 통과하지 않는다)
// 좌표는 도면 mm(x, y), 카메라는 3D m(x, 눈높이, y)로 바꿔 쓴다.
import * as THREE from 'three';
import { state } from './store.js';
import * as G from './geometry.js';
import { buildGrid, isFree, nearestFree, findPath, roomCenters, orderByWalk } from './walkGrid.js';
import { innerBox } from './fixtures.js';
import { buildScenery } from './scenery.js';

const M = 0.001;
const EYE = 1.55;          // 눈높이 m
const SPEED = 1100;        // 자동으로 걷는 속도 mm/s
const WALK = 1400;         // 직접 걸을 때 mm/s
const TURN = 1.6;          // 방향키로 돌 때 rad/s
const LOOK_SEC = 7;        // 한 곳에서 한 바퀴 둘러보는 시간
const DOOR_SEC = 1.8;
const DOOR_H = 2.1;        // 문 높이 m
const COFFER_INSET = 450;  // 우물천장: 벽에서 안쪽으로 들어온 폭 mm
const COFFER_DEPTH = 0.15; // 우물천장: 가운데가 올라간 높이 m
const COFFER_ROOMS = /거실/;      // 우물천장은 거실만(이 이름의 방, 없으면 아래쪽에서 가로가 가장 넓은 공간). 다른 방은 네모난 LED 방등

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Tour {
  constructor(view, { onExit, onRepick }) {
    this.view = view;
    this.onExit = onExit;
    this.onRepick = onRepick;
    this.keys = new Set();
    this.group = new THREE.Group();
  }

  /* ---------- 시작 · 끝 ---------- */
  start() {
    const plan = state.plan, e = plan.entrance;
    this.door = e;
    this.mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    // 들어온 뒤에는 현관문을 닫힌 것으로 쳐서 다시 밖으로 나가지 않게 한다. 창(틈에 낸 창 포함)도 벽으로 친다
    const solid = plan.walls.concat(plan.windows.map((w) => ({ a: w.a, b: w.b, t: w.t, cap: false })));
    const closed = solid.concat([{ a: e.a, b: e.b, t: e.t, cap: false }]);
    this.grid = buildGrid(closed, state.furniture);
    this.closedWalls = closed;
    this._closedPolys = null;
    // 직접 걷기는 현관문이 열린 지도로 — 닫힌 지도를 쓰면 현관 앞(빈 칸)에서 문으로 못 들어간다
    this.walkGrid = buildGrid(solid, state.furniture);
    this.outside = { x: this.mid.x + e.out.x * 1400, y: this.mid.y + e.out.y * 1400 };
    this.inside = nearestFree(this.grid, { x: this.mid.x - e.out.x * 900, y: this.mid.y - e.out.y * 900 })
      || { x: this.mid.x - e.out.x * 900, y: this.mid.y - e.out.y * 900 };
    // '같은 방' 판단은 가구를 빼고 벽만 본다 (침대가 방 가운데를 가로막아도 한 방이다)
    const sight = buildGrid(closed, []);
    const seen = new Set();
    const places = roomCenters(this.grid, this.inside, { sightGrid: sight })
      .map((p, i) => ({ ...p, name: this.placeName(p, i) }))
      .filter((p) => !seen.has(p.name) && seen.add(p.name));   // 이름이 같은 방은 한 번만
    // 이름 붙은 방은 꼭 들른다 — 욕실처럼 설비로 좁아져 '방 한가운데'가 안 잡히는 방도 변기·세면대를 보여 준다
    for (const r of plan.rooms) {
      if (seen.has(r.name) || /복도|현관/.test(r.name) || G.polygonArea(r.pts) < 1.5e6) continue;
      const p = this.roomSpot(r);
      if (p && findPath(this.grid, this.inside, p)) { places.push({ ...p, name: r.name }); seen.add(r.name); }
    }
    this.places = orderByWalk(this.grid, this.inside, places);
    this.living = this.findLiving();
    if (this.living?.place && /^공간 \d+$/.test(this.living.place.name)) this.living.place.name = '거실';

    this.pos = { ...this.outside };
    this.yaw = Math.atan2(-e.out.y, -e.out.x);
    this.pitch = -0.04;
    this.steps = [
      { type: 'wait', t: 0.9, text: '현관 앞에 섰습니다' },
      { type: 'door', t: DOOR_SEC, text: '현관문을 엽니다' },
      { type: 'go', via: [this.mid], to: this.inside, text: '들어갑니다' },
      ...this.places.flatMap((p, i) => [
        { type: 'go', to: p, text: `${p.name}(으)로 갑니다`, place: i },
        { type: 'look', t: LOOK_SEC, text: `${p.name} 둘러보는 중`, place: i },
      ]),
    ];
    this.si = 0;
    this.auto = true;
    this.finished = false;

    const v = this.view;
    this.saved = { pos: v.camera.position.clone(), target: v.controls.target.clone(), fov: v.camera.fov, far: v.camera.far };
    v.controls.enabled = false;
    v.camera.fov = 70;
    v.camera.far = 6000;            // 창밖 먼 산까지
    v.camera.updateProjectionMatrix();
    v.scene.fog = new THREE.Fog('#dbe6ee', 500, 4200);   // 먼 산·시가지는 뿌옇게
    v.setTourMode(true);
    this.buildScene();
    v.scene.add(this.group);

    this.makeHud();
    this.bind();
    this.applyCamera();
    this.updateHud();
  }

  exit() {
    const v = this.view;
    this.unbind();
    this.hud?.remove();
    v.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
    });
    this.scenery?.dispose();
    v.scene.fog = null;
    v.setTourMode(false);
    v.camera.fov = this.saved.fov;
    v.camera.far = this.saved.far;
    v.camera.position.copy(this.saved.pos);
    v.controls.target.copy(this.saved.target);
    v.camera.updateProjectionMatrix();
    v.controls.enabled = true;
    v.controls.update();
    this.onExit?.();
  }

  /** 방 안에서 설 자리: 방 가운데에 가장 가까운 빈 칸 (방이 꽉 찼으면 문 앞쯤) */
  roomSpot(room) {
    const g = this.grid, b = G.boundsOf(room.pts);
    let c = G.polygonCentroid(room.pts);
    if (!G.pointInPoly(c, room.pts)) c = { x: b.minX + b.w / 2, y: b.minY + b.h / 2 };
    let best = null;
    for (let y = b.minY + g.cell / 2; y < b.maxY; y += g.cell) {
      for (let x = b.minX + g.cell / 2; x < b.maxX; x += g.cell) {
        const p = { x, y };
        if (!isFree(g, p) || !G.pointInPoly(p, room.pts)) continue;
        const d = Math.hypot(x - c.x, y - c.y);
        if (!best || d < best.d) best = { p, d };
      }
    }
    if (best) return best.p;
    const p = nearestFree(g, c, 15);
    return p && Math.hypot(p.x - c.x, p.y - c.y) < 1500 ? p : null;
  }

  /** 방 이름: 그려 둔 방 안이면 그 이름, 아니면 '공간 n' */
  /**
   * 거실 자리. 이름이 '거실'인 방이 있으면 그 방, 없으면 **도면 아래쪽(아래 바깥벽에 닿은) 공간 가운데 가로가 가장 넓은 곳**.
   * 가로·세로 2.4m가 안 되는 곳(긴 발코니 등)은 뺀다. 반환: { room } | { box, place? } | null
   */
  findLiving() {
    const plan = state.plan;
    const named = plan.rooms.find((r) => COFFER_ROOMS.test(r.name));
    if (named) return { room: named };
    const bottom = this.grid.bounds.maxY;   // 벽 중심선의 바깥 사각형 아랫변
    if (plan.rooms.length) {
      const c = plan.rooms.map((room) => ({ room, b: innerBox(room, plan.walls) }))
        .filter(({ b }) => b && bottom - b.maxY < 800 && b.maxX - b.minX >= 2400 && b.maxY - b.minY >= 2400)
        .sort((x, y) => (y.b.maxX - y.b.minX) - (x.b.maxX - x.b.minX))[0];
      return c ? { room: c.room } : null;
    }
    // 방이 없으면 아래 바깥벽 80cm 안쪽 줄을 가로로 훑어 벽 사이 구간을 공간으로 본다. 아래쪽 방들은 바깥벽까지 닿는
    // 칸막이벽으로 나뉘므로 이 줄에서는 문 틈으로 새지 않는다 (방 가운데에서 재면 문 틈으로 옆방까지 잰다)
    const polys = this.closedPolys(), b = this.grid.bounds, y0 = bottom - 800;
    const free = (x) => !polys.some((poly) => G.pointInPoly({ x, y: y0 }, poly));
    let best = null, start = null;
    for (let x = b.minX; x <= b.maxX + 50; x += 50) {
      const f = x <= b.maxX && free(x);
      if (f && start === null) start = x;
      if (!f && start !== null) { if (!best || x - start > best.w) best = { x0: start, x1: x - 50, w: x - 50 - start }; start = null; }
    }
    if (!best || best.w < 2400) return null;
    const p = { x: (best.x0 + best.x1) / 2, y: y0 };
    const reach = (dx, dy) => Math.min(...polys.map((poly) => G.rayHit(p, dx, dy, poly)));
    const down = reach(0, 1), up = reach(0, -1);
    if (!isFinite(down) || !isFinite(up) || up + down < 2400) return null;
    // 위쪽이 주방으로 트여 있으면 끝없이 길어지므로 깊이는 가로의 1.2배(최소 3m)까지만
    const maxY = y0 + down, box = { minX: best.x0, maxX: best.x1, minY: maxY - Math.min(up + down, Math.max(3000, best.w * 1.2)), maxY };
    const inBox = (q) => q.x > box.minX && q.x < box.maxX && q.y > box.minY && q.y < box.maxY;
    const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
    const place = this.places.filter(inBox).sort((u, v) => Math.hypot(u.x - cx, u.y - cy) - Math.hypot(v.x - cx, v.y - cy))[0];
    return { box, place };
  }

  /** 창·현관문 틈까지 막은 벽 다각형 (재기용) */
  closedPolys() {
    return (this._closedPolys ||= this.closedWalls.map((w) => G.wallCorners(w)));
  }

  placeName(p, i) {
    const r = state.plan.rooms.find((room) => G.pointInPoly(p, room.pts));
    return r ? r.name : `공간 ${i + 1}`;
  }

  /* ---------- 3D: 현관문 · 문틀 위 벽 · 천장 ---------- */
  buildScene() {
    const e = this.door, H = state.plan.wallHeight * M;
    // 문짝: 경첩 끝을 축으로 돈다. 경첩은 a 끝이되, 신발장이 a 쪽에 있으면 열린 문짝이 가리지 않게 b 끝으로 옮긴다
    const shoe = state.furniture.find((f) => (f.type === 'shoe_cabinet' || /신발/.test(f.name)) && Math.hypot(f.x - this.mid.x, f.y - this.mid.y) < 3000);
    const [hinge, latch] = shoe && G.dist(shoe, e.a) < G.dist(shoe, e.b) ? [e.b, e.a] : [e.a, e.b];
    const dx = latch.x - hinge.x, dy = latch.y - hinge.y, len = Math.hypot(dx, dy);
    const ang = -Math.atan2(dy, dx);
    this.pivot = new THREE.Group();
    this.pivot.position.set(hinge.x * M, 0, hinge.y * M);
    this.pivot.rotation.y = ang;
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(len * M - 0.02, DOOR_H, 0.045),
      new THREE.MeshStandardMaterial({ color: '#6f6255', roughness: 0.6 }),
    );
    leaf.position.set((len * M) / 2, DOOR_H / 2, 0);
    leaf.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: '#c9ccd1', metalness: 0.8, roughness: 0.3 }));
    knob.position.set(len * M - 0.08, 1.0, 0.04);
    const knob2 = knob.clone();
    knob2.position.z = -0.04;
    this.pivot.add(leaf, knob, knob2);
    // 안쪽으로 열리도록 돌릴 방향을 고른다
    const inward = { x: -e.out.x, y: -e.out.y };
    const tryAng = (s) => {
      const r = ang + s * (Math.PI / 2);
      const cx = Math.cos(-r), cy = Math.sin(-r); // 문짝이 향하는 방향 (도면 좌표)
      return cx * inward.x + cy * inward.y;
    };
    this.doorOpen = (tryAng(1) > tryAng(-1) ? 1 : -1) * (Math.PI / 2) * 0.95;
    this.doorBase = ang;
    this.group.add(this.pivot);
    // 문 위 벽 (문 높이 ~ 천장)
    if (H > DOOR_H) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(len * M, H - DOOR_H, e.t * M), new THREE.MeshStandardMaterial({ color: '#f5f2ec', roughness: 0.9 }));
      head.position.set(this.mid.x * M, (H + DOOR_H) / 2, this.mid.y * M);
      head.rotation.y = ang;
      this.group.add(head);
    }
    this.buildCeiling(H);
    // 창밖 풍경: 층수만큼 아래에 땅, 앞 도로·빌라, 사방 아파트, 먼 산
    const b = this.grid.bounds, t = 100;   // 벽 중심선 바깥 사각형 + 바깥벽 두께 절반
    this.scenery = buildScenery({ minX: (b.minX - t) * M, maxX: (b.maxX + t) * M, minZ: (b.minY - t) * M, maxZ: (b.maxY + t) * M, floor: state.plan.floor || 10 });
    this.group.add(this.scenery.group);
    // 실내 조명: 은은한 전체광 + 눈 위에서 따라다니는 등
    this.group.add(new THREE.AmbientLight('#fffaf2', 0.35));
    this.lamp = new THREE.PointLight('#fff4e0', 1.8, 8, 1.2);
    this.group.add(this.lamp);
  }

  /**
   * 방을 안 그린 도면에서 들를 곳 p(공간 한가운데)를 둘러싼 칸. 창·현관문 틈은 막고, 축마다 양쪽 벽까지 잰 거리 중
   * **짧은 쪽**으로 p를 가운데 둔 칸을 만든다 — 반대쪽은 문 틈으로 새어 옆방 벽까지 잴 수 있어서다.
   */
  spanBox(p) {
    const polys = this.closedPolys();
    const reach = (dx, dy) => Math.min(...polys.map((poly) => G.rayHit(p, dx, dy, poly)));
    const hx = Math.min(reach(1, 0), reach(-1, 0)), hy = Math.min(reach(0, 1), reach(0, -1));
    if (!isFinite(hx) || !isFinite(hy)) return null;
    return { minX: p.x - hx, maxX: p.x + hx, minY: p.y - hy, maxY: p.y + hy };
  }

  /** 우물천장을 둘 칸: 거실 자리(findLiving). 그것도 없고 방을 하나도 안 그렸으면 가장 넓은 들를 곳(가로·세로 2.4m 이상) 하나 */
  cofferBoxes() {
    const plan = state.plan, raw = [], lv = this.living;
    if (lv?.room) {
      const b = innerBox(lv.room, plan.walls);
      if (b) raw.push(b);
    } else if (lv?.box) {
      raw.push(lv.box);
    } else if (!plan.rooms.length) {
      const big = this.places.map((p) => this.spanBox(p))
        .filter((b) => b && b.maxX - b.minX >= 2400 && b.maxY - b.minY >= 2400)
        .sort((a, b) => (b.maxX - b.minX) * (b.maxY - b.minY) - (a.maxX - a.minX) * (a.maxY - a.minY));
      if (big[0]) raw.push(big[0]);
    }
    const out = [];
    for (const b of raw) {
      const c = { minX: b.minX + COFFER_INSET, maxX: b.maxX - COFFER_INSET, minY: b.minY + COFFER_INSET, maxY: b.maxY - COFFER_INSET };
      if (c.maxX - c.minX < 1000 || c.maxY - c.minY < 1000) continue;
      if (out.some((o) => c.minX < o.maxX && o.minX < c.maxX && c.minY < o.maxY && o.minY < c.maxY)) continue;
      out.push(c);
    }
    return out;
  }

  /** 천장: 우물천장 자리는 구멍을 내고, 한 단 위에 판 + 옆면 + 간접조명 띠를 붙인다 */
  buildCeiling(H) {
    const b = this.grid.bounds, pad = 2000;
    const rect = (x0, y0, x1, y1) => [new THREE.Vector2(x0 * M, y0 * M), new THREE.Vector2(x1 * M, y0 * M), new THREE.Vector2(x1 * M, y1 * M), new THREE.Vector2(x0 * M, y1 * M)];
    const shape = new THREE.Shape(rect(b.minX - pad, b.minY - pad, b.maxX + pad, b.maxY + pad));
    const coffers = this.cofferBoxes();
    for (const c of coffers) shape.holes.push(new THREE.Path(rect(c.minX, c.minY, c.maxX, c.maxY).reverse()));
    // 천장은 조명과 무관하게 밝게 (MeshBasic). Shape의 (x, y)를 회전해 3D (x, H, y)에 놓는다.
    const flat = (geo, color, y) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      this.group.add(m);
      return m;
    };
    flat(new THREE.ShapeGeometry(shape), '#ebe7e0', H);
    for (const c of coffers) {
      flat(new THREE.ShapeGeometry(new THREE.Shape(rect(c.minX, c.minY, c.maxX, c.maxY))), '#f7f3ec', H + COFFER_DEPTH);
      const side = new THREE.MeshBasicMaterial({ color: '#ddd7cd', side: THREE.DoubleSide });
      const led = new THREE.MeshBasicMaterial({ color: '#ffe3b3' });
      const w = (c.maxX - c.minX) * M, d = (c.maxY - c.minY) * M, cx = (c.minX + c.maxX) / 2 * M, cz = (c.minY + c.maxY) / 2 * M;
      for (const [len, x, z, rotY, inX, inZ] of [
        [w, cx, c.minY * M, 0, 0, 1], [w, cx, c.maxY * M, 0, 0, -1],
        [d, c.minX * M, cz, Math.PI / 2, 1, 0], [d, c.maxX * M, cz, Math.PI / 2, -1, 0],
      ]) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(len, COFFER_DEPTH), side);
        face.position.set(x, H + COFFER_DEPTH / 2, z);
        face.rotation.y = rotY;
        this.group.add(face);
        // 간접조명: 올라간 판 가장자리를 따라 빛나는 띠
        const strip = new THREE.Mesh(new THREE.BoxGeometry(rotY ? 0.03 : len, 0.02, rotY ? len : 0.03), led);
        strip.position.set(x + inX * 0.05, H + COFFER_DEPTH - 0.02, z + inZ * 0.05);
        this.group.add(strip);
      }
    }
    this.coffers = coffers.length;
    this.buildLeds(H, coffers);
  }

  /**
   * 우물천장이 아닌 방마다 천장 가운데 네모난 LED 방등 (방 짧은 변에 따라 600 / 450 / 300mm).
   * 방 영역이 있으면 방마다(방 안쪽 상자 가운데), 없으면 들를 곳마다. 등 밑에 은은한 빛도 하나씩 둔다.
   */
  buildLeds(H, coffers) {
    const plan = state.plan;
    const inCoffer = (p) => coffers.some((c) => p.x > c.minX && p.x < c.maxX && p.y > c.minY && p.y < c.maxY);
    // 방 영역이 있으면 방 안쪽 상자 가운데, 없으면 들를 곳(그 공간의 한가운데) 자리. 크기는 둘레 칸의 짧은 변으로
    const cand = plan.rooms.length
      ? plan.rooms.filter((r) => r !== this.living?.room).map((r) => innerBox(r, plan.walls)).filter(Boolean)
        .map((b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, b }))
      : this.places.map((p) => ({ x: p.x, y: p.y, b: this.spanBox(p) }));
    const spots = [];
    for (const { x, y, b } of cand) {
      const short = b ? Math.min(b.maxX - b.minX, b.maxY - b.minY) : 2000;
      if (inCoffer({ x, y }) || spots.some((q) => Math.hypot(q.x - x, q.y - y) < 1200)) continue;
      spots.push({ x, y, size: short >= 2600 ? 600 : short >= 1600 ? 450 : 300 });
    }
    const frame = new THREE.MeshBasicMaterial({ color: '#f1f0ec' });
    const panel = new THREE.MeshBasicMaterial({ color: '#fffef8' });
    const edge = new THREE.MeshBasicMaterial({ color: '#dcd9d2' });
    for (const [i, s] of spots.entries()) {
      const L = s.size * M, x = s.x * M, z = s.y * M;
      const body = new THREE.Mesh(new THREE.BoxGeometry(L + 0.03, 0.035, L + 0.03), frame);   // 테두리 틀
      body.position.set(x, H - 0.0175, z);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(L + 0.012, 0.004, L + 0.012), edge);    // 틀과 발광면 사이 홈
      rim.position.set(x, H - 0.036, z);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(L, L), panel);                         // 발광면 (아래를 본다)
      face.rotation.x = Math.PI / 2;
      face.position.set(x, H - 0.039, z);
      this.group.add(body, rim, face);
      if (i < 10) {   // 빛은 열 개까지만 (많으면 셰이더가 무거워진다)
        const light = new THREE.PointLight('#fff6e8', 0.45, 4.5, 1.5);
        light.position.set(x, H - 0.25, z);
        this.group.add(light);
      }
    }
    this.leds = spots.length;
  }

  /* ---------- 매 프레임 ---------- */
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.manual(dt);
    if (this.auto && !this.finished) this.autoStep(dt);
    this.applyCamera();
  }

  autoStep(dt) {
    const s = this.steps[this.si];
    if (!s) { this.finish(); return; }
    s.elapsed = (s.elapsed || 0) + dt;
    if (s.type === 'wait') {
      if (s.elapsed >= s.t) this.nextStep();
    } else if (s.type === 'door') {
      const k = ease(Math.min(1, s.elapsed / s.t));
      this.pivot.rotation.y = this.doorBase + this.doorOpen * k;
      if (s.elapsed >= s.t + 0.3) this.nextStep();
    } else if (s.type === 'go') {
      if (!s.pts) {
        s.pts = s.via ? [this.pos, ...s.via, s.to] : findPath(this.grid, this.pos, s.to);
        s.seg = 1;
        if (!s.pts) { this.nextStep(); return; }   // 갈 길이 없으면 건너뛴다
      }
      this.follow(s, dt);
    } else if (s.type === 'look') {
      if (s.start === undefined) s.start = this.yaw;
      const k = Math.min(1, s.elapsed / s.t);
      this.yaw = s.start + Math.PI * 2 * ease(k);
      this.pitch += (-0.06 - this.pitch) * Math.min(1, dt * 2);
      if (k >= 1) this.nextStep();
    }
  }

  /** 꺾은선을 따라 걷는다. 고개는 가는 쪽으로 부드럽게 돌린다. */
  follow(s, dt) {
    let move = SPEED * dt;
    while (move > 0 && s.seg < s.pts.length) {
      const t = s.pts[s.seg];
      const dx = t.x - this.pos.x, dy = t.y - this.pos.y, d = Math.hypot(dx, dy);
      if (d < 1) { s.seg++; continue; }
      const want = Math.atan2(dy, dx);
      this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 4);
      // 너무 엇나간 방향이면 먼저 돌아선다
      if (Math.abs(angDiff(this.yaw, want)) > 1.2) break;
      const step = Math.min(move, d);
      this.pos = { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step };
      move -= step;
      if (step >= d) s.seg++;
    }
    this.pitch += (-0.04 - this.pitch) * Math.min(1, dt * 2);
    if (s.seg >= s.pts.length) this.nextStep();
  }

  nextStep() {
    this.si++;
    if (this.si >= this.steps.length) this.finish();
    this.updateHud();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.auto = false;
    this.updateHud();
  }

  /** 다음 들를 곳으로 건너뛴다 (지금 가는 중이면 그 곳 둘러보기를 건너뛴다) */
  skip() {
    if (this.si <= 2) {   // 아직 현관이면 문을 열고 안으로 바로 들어간다
      this.pivot.rotation.y = this.doorBase + this.doorOpen;
      this.pos = { ...this.inside };
      this.si = 3;
    } else {
      const cur = this.steps[this.si];
      let i = this.si + 1;
      while (i < this.steps.length && !(this.steps[i].type === 'go' && this.steps[i].place !== cur?.place)) i++;
      this.si = i;
    }
    this.resetStep();
    this.auto = true;
    this.finished = this.si >= this.steps.length;
    this.updateHud();
  }

  togglePause() {
    if (this.finished) return;
    this.auto = !this.auto;
    if (this.auto) this.resetStep();
    this.updateHud();
  }

  /** 지금 단계를 처음부터 (직접 걸은 뒤 이어 갈 때 길을 다시 찾는다) */
  resetStep() {
    const s = this.steps[this.si];
    if (!s) return;
    delete s.pts; delete s.elapsed; delete s.start;
    if (s.type === 'go' && s.via && !isFree(this.grid, this.pos)) return; // 아직 밖이면 문 쪽으로
    if (s.type === 'go' && s.via) delete s.via;                          // 이미 안이면 바로 길 찾기
  }

  /* ---------- 직접 걷기 ---------- */
  manual(dt) {
    const k = this.keys;
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    const turn = (k.has('arrowright') || k.has('e') ? 1 : 0) - (k.has('arrowleft') || k.has('q') ? 1 : 0);
    if (!fwd && !side && !turn) return;
    if (this.auto) { this.auto = false; this.updateHud(); }
    this.yaw += turn * TURN * dt;
    if (!fwd && !side) return;
    // 문이 아직 안 열렸으면 연다
    if (this.si <= 1) { this.pivot.rotation.y = this.doorBase + this.doorOpen; this.si = 2; }
    const cx = Math.cos(this.yaw), cy = Math.sin(this.yaw);
    let mx = (cx * fwd - cy * side), my = (cy * fwd + cx * side);
    const l = Math.hypot(mx, my) || 1;
    mx = (mx / l) * WALK * dt; my = (my / l) * WALK * dt;
    // 지금 자리가 막힌 칸(도면 밖 등)이면 자유롭게. 막히면 조금씩 비껴 가 보고(문틀에 걸리면 문 안쪽으로 끌려 들어간다),
    // 그래도 안 되면 벽을 따라 한 축씩 미끄러진다
    const g = this.walkGrid, here = isFree(g, this.pos);
    const ok = (p) => !here || isFree(g, p);
    const at = (deg) => {
      const r = deg * G.DEG, c = Math.cos(r), sn = Math.sin(r);
      return { x: this.pos.x + mx * c - my * sn, y: this.pos.y + mx * sn + my * c };
    };
    for (const deg of [0, 15, -15, 30, -30, 45, -45, 60, -60]) {
      const p = at(deg);
      if (ok(p) && (deg === 0 || !here || this.leadsOn(p.x - this.pos.x, p.y - this.pos.y))) { this.pos = p; return; }
    }
    if (ok({ x: this.pos.x + mx, y: this.pos.y })) this.pos = { x: this.pos.x + mx, y: this.pos.y };
    else if (ok({ x: this.pos.x, y: this.pos.y + my })) this.pos = { x: this.pos.x, y: this.pos.y + my };
  }

  /** 비껴 간 방향 (mx, my)로 40cm 앞까지 비어 있는가 — 문틀 앞에서 문 쪽으로 틀어 들어가게 한다 */
  leadsOn(mx, my) {
    const l = Math.hypot(mx, my) || 1, ux = mx / l, uy = my / l;
    for (let d = 100; d <= 400; d += 100) if (!isFree(this.walkGrid, { x: this.pos.x + ux * d, y: this.pos.y + uy * d })) return false;
    return true;
  }

  applyCamera() {
    const cam = this.view.camera;
    const x = this.pos.x * M, z = this.pos.y * M;
    cam.position.set(x, EYE, z);
    const cp = Math.cos(this.pitch);
    cam.lookAt(x + Math.cos(this.yaw) * cp, EYE + Math.sin(this.pitch), z + Math.sin(this.yaw) * cp);
    this.lamp?.position.set(x, EYE + 0.4, z);
  }

  /* ---------- 입력 ---------- */
  bind() {
    const dom = this.view.renderer.domElement;
    this.h = {
      down: (e) => {
        if (e.button !== 0) return;
        this.drag = { x: e.clientX, y: e.clientY };
        dom.setPointerCapture(e.pointerId);
      },
      move: (e) => {
        if (!this.drag) return;
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag = { x: e.clientX, y: e.clientY };
        if (Math.abs(dx) + Math.abs(dy) > 0 && this.auto) { this.auto = false; this.updateHud(); }
        this.yaw += dx * 0.004;
        this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - dy * 0.004));
      },
      up: () => { this.drag = null; },
      keydown: (e) => {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const key = e.key.toLowerCase();
        if (key === 'escape') { e.preventDefault(); this.exit(); return; }
        if (key === ' ') { e.preventDefault(); this.togglePause(); return; }
        if (key === 'n') { this.skip(); return; }
        if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
          e.preventDefault();
          this.keys.add(key);
        }
      },
      keyup: (e) => this.keys.delete(e.key.toLowerCase()),
      blur: () => this.keys.clear(),
    };
    dom.addEventListener('pointerdown', this.h.down);
    dom.addEventListener('pointermove', this.h.move);
    dom.addEventListener('pointerup', this.h.up);
    window.addEventListener('keydown', this.h.keydown, true);
    window.addEventListener('keyup', this.h.keyup, true);
    window.addEventListener('blur', this.h.blur);
  }

  unbind() {
    const dom = this.view.renderer.domElement;
    dom.removeEventListener('pointerdown', this.h.down);
    dom.removeEventListener('pointermove', this.h.move);
    dom.removeEventListener('pointerup', this.h.up);
    window.removeEventListener('keydown', this.h.keydown, true);
    window.removeEventListener('keyup', this.h.keyup, true);
    window.removeEventListener('blur', this.h.blur);
  }

  /* ---------- 화면 안내 ---------- */
  makeHud() {
    const el = document.createElement('div');
    el.className = 'tour-hud';
    el.innerHTML = `
      <div class="tour-top">
        <b>🚶 둘러보기</b><span data-text></span><span class="tour-count" data-count></span>
      </div>
      <div class="tour-btns">
        <button data-act="pause"></button>
        <button data-act="next" title="N">⏭ 다음 곳</button>
        <button data-act="repick" title="현관문 자리를 다시 고릅니다">🚪 현관 다시 지정</button>
        <button data-act="exit" class="primary" title="Esc">✕ 나가기</button>
      </div>
      <div class="tour-help">끌기: 고개 돌리기 · W/S·↑↓: 앞뒤 · A/D: 옆걸음 · ←→: 돌기 · Space: 멈춤/계속 · Esc: 나가기</div>`;
    el.querySelector('[data-act=pause]').addEventListener('click', () => this.togglePause());
    el.querySelector('[data-act=next]').addEventListener('click', () => this.skip());
    el.querySelector('[data-act=exit]').addEventListener('click', () => this.exit());
    el.querySelector('[data-act=repick]').addEventListener('click', () => { this.exit(); this.onRepick?.(); });
    this.view.el.appendChild(el);
    this.hud = el;
  }

  updateHud() {
    if (!this.hud) return;
    const s = this.steps[this.si];
    let text;
    if (this.finished) text = this.places.length ? '다 둘러봤습니다. 방향키·WASD로 자유롭게 걸어 보세요.' : '들를 곳을 찾지 못했습니다. 방향키·WASD로 걸어 보세요.';
    else if (!this.auto) text = '직접 걷는 중 — ▶ 자동 계속을 누르면 다시 안내합니다';
    else text = s?.text || '';
    this.hud.querySelector('[data-text]').textContent = text;
    const place = s?.place;
    this.hud.querySelector('[data-count]').textContent = place !== undefined && !this.finished ? `${place + 1} / ${this.places.length}` : '';
    const pb = this.hud.querySelector('[data-act=pause]');
    pb.textContent = this.auto ? '⏸ 멈춤' : '▶ 자동 계속';
    pb.disabled = this.finished;
  }
}
