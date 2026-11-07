// 욕실·주방·현관 설비 자동 배치 — DOM 없이 돈다.
// 방 이름에 '욕실/화장실'이 있으면 변기·세면대(가장 큰 욕실에는 욕조까지), '주방/부엌'이면 주방 싱크대를 놓는다.
// 현관문(plan.entrance)이 정해져 있으면 현관 옆벽에 신발장을 놓는다. 방 이름이 없어도 된다.
// 그 방(현관) 안에 같은 종류 설비가 이미 있으면 건드리지 않는다. 벽·가구와 겹치는 설비는 놓지 않는다.
// 주방은 도면의 기본 싱크대(plan.fixtures — 도면 파일에 '기본 포함'으로 들어 있던 싱크대, 예: A2-real의 ㄱ자)가 있으면 그것을, 없으면 1자 싱크대를 놓는다.
//
// 놓는 자리: 방 가운데에서 벽까지 재어 안쪽 상자를 구하고, 네 변 가운데 벽이 가장 많이 끊긴 변을 문 쪽으로 본다.
// 설비는 그 반대 변(문이 없는 벽)에 등을 대고 놓는다. 욕조가 들어가면 욕조는 짧은 막힌 벽에,
// 세면대·변기는 그 옆 막힌 벽에 놓는다.
import * as G from './geometry.js';
import { defaultsFor } from './catalog.js';

const BATH = /욕실|화장실|파우더/;
const NO_TUB = /부부|안방|마스터|파우더/;   // 보통 샤워부스만 두는 욕실
const KITCHEN = /주방|부엌|키친/;
const BATH_TYPES = new Set(['toilet', 'basin', 'bathtub']);
const KITCHEN_TYPES = new Set(['kitchen_counter', 'kitchen_l']);
const SHOE = /신발/;

/** 방 안쪽 상자: 가운데에서 벽까지 잰 칸을 방 경계로 자른다 */
export function innerBox(room, walls) {
  const b = G.boundsOf(room.pts);
  let c = G.polygonCentroid(room.pts);
  if (!G.pointInPoly(c, room.pts)) c = { x: b.minX + b.w / 2, y: b.minY + b.h / 2 };
  const s = G.spanAt(c, walls);
  const box = { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY };
  if (s?.h) { box.minX = Math.max(box.minX, Math.min(s.h.a.x, s.h.b.x)); box.maxX = Math.min(box.maxX, Math.max(s.h.a.x, s.h.b.x)); }
  if (s?.v) { box.minY = Math.max(box.minY, Math.min(s.v.a.y, s.v.b.y)); box.maxY = Math.min(box.maxY, Math.max(s.v.a.y, s.v.b.y)); }
  return box.maxX - box.minX > 300 && box.maxY - box.minY > 300 ? box : null;
}

/** 상자의 네 변: 시작점, 방향(u), 안쪽 방향(n), 길이 */
function sides(box) {
  const w = box.maxX - box.minX, h = box.maxY - box.minY;
  return [
    { name: 'top', o: { x: box.minX, y: box.minY }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, len: w },
    { name: 'bottom', o: { x: box.minX, y: box.maxY }, u: { x: 1, y: 0 }, n: { x: 0, y: -1 }, len: w },
    { name: 'left', o: { x: box.minX, y: box.minY }, u: { x: 0, y: 1 }, n: { x: 1, y: 0 }, len: h },
    { name: 'right', o: { x: box.maxX, y: box.minY }, u: { x: 0, y: 1 }, n: { x: -1, y: 0 }, len: h },
  ];
}
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** 변 바로 바깥(25mm — 얇은 샤프트 벽 60mm도 넘지 않게)을 따라 벽이 없는 비율 = 열린 정도 */
function openness(side, polys) {
  let open = 0, total = 0;
  for (let t = 100; t < side.len - 100; t += 100) {
    const p = { x: side.o.x + side.u.x * t - side.n.x * 25, y: side.o.y + side.u.y * t - side.n.y * 25 };
    total++;
    if (!polys.some((poly) => G.pointInPoly(p, poly))) open++;
  }
  return total ? open / total : 1;
}

/** 앞면이 front 방향을 보도록 하는 회전(도) — 가구 앞면은 로컬 +y */
const facing = (front) => G.normDeg(Math.atan2(-front.x, front.y) / G.DEG);

/** 변을 따라 t(mm) 지점에 깊이 d인 가구를 벽에 붙여 놓을 때의 중심과 회전 */
function place(side, t, d) {
  return {
    x: side.o.x + side.u.x * t + side.n.x * (d / 2 + 5),
    y: side.o.y + side.u.y * t + side.n.y * (d / 2 + 5),
    rot: facing(side.n),
  };
}

const item = (type, pos, uid, extra = {}) => {
  const d = defaultsFor(type);
  return { id: uid('f'), type, name: d.name, w: d.w, d: d.d, h: d.h, x: pos.x, y: pos.y, rot: pos.rot, elev: 0, color: d.color, libId: null, usePhoto: false, ...extra };
};

/** 벽·기존 가구와 겹치지 않는가 */
function fits(f, plan, others) {
  return !G.findCollisions(others.concat([f]), plan.walls).has(f.id);
}

/**
 * 욕실 하나. 욕조를 놓을 욕실이면 문이 없는 벽 가운데 짧은 벽부터 욕조를 벽 끝까지 대 보고,
 * 그 벽과 맞닿은 막힌 옆벽에 욕조 쪽부터 세면대 → 변기 순으로 놓는다.
 * 안 되면 변기·세면대만 안쪽 벽(back)에 놓는다.
 */
function bathLayout(ss, door, back, withTub, uid) {
  const toilet = defaultsFor('toilet'), basin = defaultsFor('basin'), tub = defaultsFor('bathtub');
  const lowEnd = (s) => s.name === 'top' || s.name === 'left';   // 변의 t=0 끝에 맞닿은 변
  const perp = (a, b) => (a.u.x !== 0) !== (b.u.x !== 0);
  if (withTub) {
    const walls = ss.filter((s) => s !== door && s.open < 0.3 && s.len >= 1300).sort((a, b) => a.len - b.len);
    for (const T of walls) {
      for (const S of ss.filter((s) => perp(s, T) && s.open < 0.3).sort((a, b) => a.open - b.open)) {
        if (S.len < tub.d + 400 + toilet.w / 2 + 300) continue;
        const tw = Math.min(Math.round(T.len - 10), 1700);
        const tubT = lowEnd(S) ? tw / 2 + 5 : T.len - tw / 2 - 5;
        const from = (t) => (lowEnd(T) ? t : S.len - t);       // 욕조 쪽 끝에서 잰 거리 → S 위의 t
        const out = [item('bathtub', place(T, tubT, tub.d), uid, { w: tw })];
        const tBasin = tub.d + 100 + basin.w / 2, tToilet = tBasin + basin.w / 2 + 150 + toilet.w / 2;
        if (S.len >= tToilet + toilet.w / 2 + 150) {
          out.push(item('basin', place(S, from(tBasin), basin.d), uid), item('toilet', place(S, from(tToilet), toilet.d), uid));
        } else {
          out.push(item('toilet', place(S, from(tub.d + 400), toilet.d), uid));
        }
        return out;
      }
    }
  }
  if (back.len < toilet.w + 200) return [];
  const out = [item('toilet', place(back, 120 + toilet.w / 2 + 100, toilet.d), uid)];
  if (back.len >= toilet.w + basin.w + 450) out.push(item('basin', place(back, back.len - 100 - basin.w / 2, basin.d), uid));
  return out;
}

/**
 * 현관 신발장: 현관문 안쪽 옆벽(문 폭 바깥)을 따라 문틀에서부터 세운다.
 * 문짝이 열리는 길(문 폭)과 들어가는 통로(800mm)를 비우고, 벽이 곧게 이어지는 만큼만 길이를 잡는다.
 */
function shoeCabinet(plan, furniture, polys, uid) {
  const e = plan.entrance;
  if (!e) return null;
  const c = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
  if (furniture.some((f) => (f.type === 'shoe_cabinet' || SHOE.test(f.name)) && Math.hypot(f.x - c.x, f.y - c.y) < 3000)) return null;
  const width = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y), half = width / 2;
  const u = { x: (e.b.x - e.a.x) / width, y: (e.b.y - e.a.y) / width }, n = { x: -e.out.x, y: -e.out.y };
  const def = defaultsFor('shoe_cabinet'), D = def.d;
  const at = (depth) => ({ x: c.x + n.x * depth, y: c.y + n.y * depth });
  const reach = (p, v) => Math.min(...polys.map((poly) => G.rayHit(p, v.x, v.y, poly)));
  const d0 = (e.t || 200) / 2 + 20;
  const tries = [];
  for (const s of [1, -1]) {                       // b 쪽(경첩 반대편)을 먼저 본다
    const v = { x: u.x * s, y: u.y * s }, back = { x: -v.x, y: -v.y };
    const r0 = reach(at(d0 + 50), v), across = reach(at(d0 + 50), back);
    // 옆벽이 문틀에서 1.5m 넘게 떨어져 있으면 현관이 아니라 거실 같은 넓은 곳이다
    if (!isFinite(r0) || r0 - D < half + 30 || r0 - half > 1500 || r0 + across - D < 800) continue;
    let len = 0;                                   // 옆벽이 r0 거리로 곧게 이어지는 길이
    for (let t = d0 + 50; t <= d0 + def.w + 50; t += 50) {
      const r = reach(at(t), v);
      if (Math.abs(r - r0) > 30) break;
      len = t - d0;
    }
    len = Math.min(def.w, Math.floor(len / 50) * 50);
    if (len < 600) continue;
    const mid = at(d0 + len / 2);
    tries.push({ len, f: item('shoe_cabinet', { x: mid.x + v.x * (r0 - D / 2 - 5), y: mid.y + v.y * (r0 - D / 2 - 5), rot: facing(back) }, uid, { w: len }) });
  }
  tries.sort((a, b) => b.len - a.len);
  return tries.find((t) => fits(t.f, plan, furniture))?.f || null;
}

/** 가구가 방에 걸쳐 있는가 — 가운데 또는 바닥 모양 꼭짓점 하나라도 방 안이면 (ㄱ자처럼 가운데가 방 끝에 걸려도 놓친 것으로 보지 않게) */
const inRoom = (f, room) => G.pointInPoly(f, room.pts) || G.furnitureParts(f).some((poly) => poly.some((p) => G.pointInPoly(p, room.pts)));

/**
 * 도면의 기본 싱크대(plan.fixtures) 가운데 그 주방 방에 든 것을 새 id로 꺼낸다.
 * 도면 파일에 ㄱ자 싱크대가 있으면 둘러보기·도면만 바꾸기도 1자 대신 그것을 놓는다.
 */
function planSinksFor(plan, room, uid) {
  return (plan.fixtures || []).filter((f) => KITCHEN_TYPES.has(f.type) && G.pointInPoly(f, room.pts))
    .map((f) => ({ libId: null, usePhoto: false, ...f, id: uid('f'), builtin: true }));
}

/**
 * 싱크대가 없는 주방 방에 도면의 기본 싱크대를 놓는다(도면만 바꾸기 뒤). 새로 놓을 것만 돌려준다.
 * 벽·가구와 겹치면 놓지 않는다.
 */
export function missingPlanSinks(plan, furniture, uid) {
  const out = [];
  for (const room of plan.rooms) {
    if (!KITCHEN.test(room.name) || room.pts.length < 3) continue;
    if (furniture.some((f) => KITCHEN_TYPES.has(f.type) && inRoom(f, room))) continue;
    for (const f of planSinksFor(plan, room, uid)) if (fits(f, plan, furniture.concat(out))) out.push(f);
  }
  return out;
}

/** 이름으로 설비를 놓을 수 있는 방(욕실·주방)이 하나라도 있는가 */
export function hasFixtureRooms(plan) {
  return plan.rooms.some((r) => BATH.test(r.name) || KITCHEN.test(r.name));
}

/**
 * 새로 놓을 설비 목록을 돌려준다 (state는 바꾸지 않는다).
 * @param uid 가구 id를 만드는 함수 (store.uid)
 */
export function autoFixtures(plan, furniture, uid) {
  const polys = plan.walls.map((w) => G.wallCorners(w));
  const out = [];
  const keep = (list) => { for (const f of list) if (fits(f, plan, furniture.concat(out))) out.push(f); };

  const shoe = shoeCabinet(plan, furniture, polys, uid);
  if (shoe) out.push(shoe);

  // 욕조는 이름이 부부욕실 등이 아닌 욕실 가운데 가장 큰 곳 하나에만 둔다
  const jobs = [];
  for (const room of plan.rooms) {
    const kind = BATH.test(room.name) ? 'bath' : KITCHEN.test(room.name) ? 'kitchen' : null;
    if (!kind || room.pts.length < 3) continue;
    const types = kind === 'bath' ? BATH_TYPES : KITCHEN_TYPES;
    if (furniture.some((f) => types.has(f.type) && inRoom(f, room))) continue;
    const box = innerBox(room, plan.walls);
    if (box) jobs.push({ room, kind, box, area: (box.maxX - box.minX) * (box.maxY - box.minY) });
  }
  const tubRoom = jobs.filter((j) => j.kind === 'bath' && !NO_TUB.test(j.room.name)).sort((a, b) => b.area - a.area)[0];

  let own;
  for (const { room, kind, box } of jobs) {
    const ss = sides(box).map((s) => ({ ...s, open: openness(s, polys) }));
    const door = ss.reduce((a, b) => (b.open > a.open ? b : a));
    let back = ss.find((s) => s.name === OPPOSITE[door.name]);
    if (back.open > 0.3) back = ss.reduce((a, b) => (b.open < a.open ? b : a));

    if (kind === 'bath') {
      let list = bathLayout(ss, door, back, tubRoom?.room === room, uid);
      // 욕조 배치가 벽·가구에 걸리면 변기·세면대만 놓는다
      if (list.some((f) => f.type === 'bathtub') && !list.every((f) => fits(f, plan, furniture.concat(out)))) list = bathLayout(ss, door, back, false, uid);
      keep(list);
    } else if ((own = planSinksFor(plan, room, uid)).length) {
      // 도면 파일의 기본 싱크대(ㄱ자 등)가 있으면 그것만 놓는다 — 겹쳐서 못 놓아도 1자로 바꿔 놓지 않는다
      keep(own);
    } else {
      const k = defaultsFor('kitchen_counter');
      const len = Math.min(back.len, 3600);
      if (len >= 1200) keep([item('kitchen_counter', place(back, len / 2, k.d), uid, { w: Math.round(len) })]);
    }
  }
  return out;
}
