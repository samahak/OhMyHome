// 2D 도면 편집기 — 캔버스 하나에 도면 이미지·방·벽·가구를 그리고 도구별 마우스 입력을 받는다.
// 좌표: 도면 mm. 화면 px = mm * view.s + view.o
import { state, ui, on, checkpoint, select, uid, removeItem, emit, updateFurniture } from './store.js';
import * as G from './geometry.js';

export const ROOM_COLORS = ['#f6c48b', '#9fd3c7', '#b5c7f2', '#f2a9b5', '#c9e29b', '#d7b8f0', '#f5dd8b'];
const SNAP_PX = 12;

export const fmtMM = (v) => `${Math.round(v).toLocaleString('ko-KR')}`;

const HINTS = {
  select: '가구·벽·방을 눌러 선택하고, 가구는 끌어서 옮깁니다. 빈 곳을 끌면 화면 이동, 휠로 확대·축소.',
  wall: '클릭할 때마다 벽이 이어집니다. 더블클릭·Esc·오른쪽 클릭으로 끝. Shift를 누르면 자유 각도.',
  room: '방 꼭짓점을 차례로 찍으세요. 첫 점을 다시 누르거나 더블클릭하면 방이 완성됩니다.',
  scale: '방 안을 한 번 누르면 벽 사이 가로·세로가 지금 몇 mm로 보이는지 나옵니다. 도면 치수로 고치면 전체 크기가 바뀝니다. (Shift+클릭: 두 점으로 재기)',
  measure: '두 점을 찍어 길이를 잽니다. Shift를 누르면 자유 각도.',
  erase: '지울 가구·벽·방을 누르세요.',
  pick: '도면에서 벽 부분을 누르면 그 색과 비슷한 곳을 벽으로 찾습니다.',
};

export class PlanEditor {
  constructor(canvas, hooks = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.view = { s: 0.06, ox: 40, oy: 40 };
    this.tool = 'select';
    this.temp = null;
    this.mouse = null;     // 마지막 커서 위치 (mm)
    this.snapMark = null;
    this.shift = false;
    this.space = false;
    this.img = null;
    this.imgSrc = null;
    this.imageOpacity = 0.75;
    this.showDims = true;
    this.collisions = new Set();

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointerleave', () => { this.mouse = null; this.hooks.cursor?.(''); this.draw(); });
    canvas.addEventListener('dblclick', (e) => this.onDblClick(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => { this.shift = e.shiftKey; if (e.code === 'Space' && !isTyping()) this.space = true; });
    window.addEventListener('keyup', (e) => { this.shift = e.shiftKey; if (e.code === 'Space') this.space = false; });

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    on('plan', () => { this.syncImage(); this.draw(); });
    on('furniture', () => this.draw());
    on('selection', () => this.draw());
    this.syncImage();
  }

  /* ---------- 좌표 ---------- */
  toMM(sx, sy) { return { x: (sx - this.view.ox) / this.view.s, y: (sy - this.view.oy) / this.view.s }; }
  toScr(p) { return { x: p.x * this.view.s + this.view.ox, y: p.y * this.view.s + this.view.oy }; }
  evtPt(e) {
    const r = this.cv.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  resize() {
    const p = this.cv.parentElement;
    if (!p.clientWidth || !p.clientHeight) return;
    const dpr = window.devicePixelRatio || 1;
    const first = !this.w;
    this.w = p.clientWidth; this.h = p.clientHeight;
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.dpr = dpr;
    if (first) this.fit();
    this.draw();
  }

  /** 도면 전체가 보이게 맞춘다 */
  fit() {
    if (!this.w) return;
    const b = this.contentBounds();
    const pad = 40;
    const s = Math.min((this.w - pad * 2) / Math.max(b.w, 1000), (this.h - pad * 2) / Math.max(b.h, 1000));
    this.view.s = s;
    this.view.ox = (this.w - b.w * s) / 2 - b.minX * s;
    this.view.oy = (this.h - b.h * s) / 2 - b.minY * s;
    this.draw();
  }

  contentBounds() {
    const p = state.plan;
    const pts = [];
    if (p.image) pts.push({ x: 0, y: 0 }, { x: p.image.width * p.mmPerPx, y: p.image.height * p.mmPerPx });
    for (const w of p.walls) pts.push(w.a, w.b);
    for (const r of p.rooms) pts.push(...r.pts);
    for (const f of state.furniture) pts.push({ x: f.x - f.w / 2, y: f.y - f.d / 2 }, { x: f.x + f.w / 2, y: f.y + f.d / 2 });
    return G.boundsOf(pts) || { minX: 0, minY: 0, w: 10000, h: 8000 };
  }

  /** 화면 가운데의 도면 좌표 — 새 가구를 놓을 자리 */
  viewCenter() {
    return this.w ? this.toMM(this.w / 2, this.h / 2) : null;
  }

  syncImage() {
    const src = state.plan.image?.src || null;
    if (src === this.imgSrc) return;
    this.imgSrc = src;
    this.img = null;
    if (!src) return;
    const im = new Image();
    im.onload = () => { if (this.imgSrc === src) { this.img = im; this.draw(); } };
    im.src = src;
  }

  setTool(tool) {
    this.tool = tool;
    this.temp = null;
    this.hooks.closeMeasure?.();
    this.cv.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    this.hooks.toolChanged?.(tool);
    this.hooks.status?.(HINTS[tool] || '');
    this.draw();
  }

  /** 진행 중인 그리기를 끝낸다 (Esc) */
  cancel() {
    this.hooks.closeMeasure?.();
    if (this.temp) { this.temp = null; this.draw(); return true; }
    return false;
  }

  /* ---------- 스냅 ---------- */
  snap(p, from, ortho = true) {
    let q = { x: p.x, y: p.y };
    if (from && ortho && !this.shift) {
      if (Math.abs(q.x - from.x) > Math.abs(q.y - from.y)) q.y = from.y; else q.x = from.x;
    }
    const tol = SNAP_PX / this.view.s;
    let best = null;
    const cand = [];
    for (const w of state.plan.walls) cand.push(w.a, w.b);
    for (const r of state.plan.rooms) cand.push(...r.pts);
    if (this.temp?.pts) cand.push(...this.temp.pts);
    for (const c of cand) {
      const d = G.dist(p, c);
      if (d < tol && (!best || d < best.d)) best = { d, c };
    }
    this.snapMark = null;
    if (best) { q = { x: best.c.x, y: best.c.y }; this.snapMark = q; }
    else { q.x = Math.round(q.x / 10) * 10; q.y = Math.round(q.y / 10) * 10; }
    return q;
  }

  /* ---------- 찾기 ---------- */
  hitFurniture(p) {
    for (let i = state.furniture.length - 1; i >= 0; i--) {
      const f = state.furniture[i];
      if (G.pointInPoly(p, G.furnitureCorners(f))) return f;
    }
    return null;
  }
  hitWall(p) {
    const tol = 4 / this.view.s;
    for (let i = state.plan.walls.length - 1; i >= 0; i--) {
      const w = state.plan.walls[i];
      if (G.pointInPoly(p, G.wallCorners(w, -tol))) return w;
    }
    return null;
  }
  hitRoom(p) {
    for (let i = state.plan.rooms.length - 1; i >= 0; i--) {
      if (G.pointInPoly(p, state.plan.rooms[i].pts)) return state.plan.rooms[i];
    }
    return null;
  }
  hitAny(p) {
    const f = this.hitFurniture(p);
    if (f) return { kind: 'furniture', id: f.id, obj: f };
    const w = this.hitWall(p);
    if (w) return { kind: 'wall', id: w.id, obj: w };
    const r = this.hitRoom(p);
    if (r) return { kind: 'room', id: r.id, obj: r };
    return null;
  }

  /* ---------- 마우스 ---------- */
  onDown(e) {
    const { sx, sy } = this.evtPt(e);
    const p = this.toMM(sx, sy);
    this.cv.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || this.space) {
      this.pan = { sx, sy, ox: this.view.ox, oy: this.view.oy, moved: false, button: e.button };
      return;
    }
    if (e.button !== 0) return;

    switch (this.tool) {
      case 'select': {
        const hit = this.hitAny(p);
        select(hit ? { kind: hit.kind, id: hit.id } : null);
        if (hit?.kind === 'furniture') {
          this.drag = { id: hit.id, dx: hit.obj.x - p.x, dy: hit.obj.y - p.y, started: false };
          this.cv.style.cursor = 'grabbing';
        } else {
          this.pan = { sx, sy, ox: this.view.ox, oy: this.view.oy, moved: false, button: 0 };
        }
        break;
      }
      case 'erase': {
        const hit = this.hitAny(p);
        if (hit) { checkpoint(); removeItem(hit.kind, hit.id); }
        break;
      }
      case 'wall': {
        const last = this.temp?.pts?.[this.temp.pts.length - 1];
        const q = this.snap(p, last);
        if (!this.temp) { this.temp = { pts: [q] }; break; }
        if (G.dist(last, q) >= 20) {
          checkpoint();
          state.plan.walls.push({ id: uid('w'), a: last, b: q, t: this.hooks.wallThickness?.() || 150, cap: true, auto: false });
          this.temp.pts.push(q);
          emit('plan');
        }
        break;
      }
      case 'room': {
        const pts = this.temp?.pts || [];
        const q = this.snap(p, pts[pts.length - 1], false);
        if (pts.length >= 3 && G.dist(this.toScr(q), this.toScr(pts[0])) < SNAP_PX) { this.finishRoom(); break; }
        if (!this.temp) this.temp = { pts: [] };
        const prev = pts[pts.length - 1];
        if (!prev || G.dist(prev, q) > 1) this.temp.pts.push(q);
        break;
      }
      case 'scale': {
        if (this.temp?.a && !this.temp.b) {
          // 두 점 모드의 두 번째 점
          this.temp.b = this.snap(p, this.temp.a);
          this.temp.lines = [{ label: '길이', a: this.temp.a, b: this.temp.b }];
          this.hooks.openMeasure?.(this.temp.lines, sx, sy);
          break;
        }
        this.measureAt(p, sx, sy);
        break;
      }
      case 'measure': {
        if (!this.temp || this.temp.b) { this.temp = { a: this.snap(p, null) }; break; }
        this.temp.b = this.snap(p, this.temp.a);
        break;
      }
      case 'pick':
        this.hooks.pickColor?.(p);
        break;
    }
    this.draw();
  }

  onMove(e) {
    const { sx, sy } = this.evtPt(e);
    const p = this.toMM(sx, sy);
    this.mouse = p;
    this.hooks.cursor?.(`${fmtMM(p.x)}, ${fmtMM(p.y)} mm`);

    if (this.pan) {
      const dx = sx - this.pan.sx, dy = sy - this.pan.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.pan.moved = true;
      if (this.pan.moved) {
        this.view.ox = this.pan.ox + dx;
        this.view.oy = this.pan.oy + dy;
        this.cv.style.cursor = 'grabbing';
      }
      this.draw();
      return;
    }
    if (this.drag) {
      if (!this.drag.started) { checkpoint(); this.drag.started = true; }
      updateFurniture(this.drag.id, {
        x: Math.round((p.x + this.drag.dx) / 10) * 10,
        y: Math.round((p.y + this.drag.dy) / 10) * 10,
      });
      return;
    }
    if (this.tool === 'select') {
      this.cv.style.cursor = this.hitFurniture(p) ? 'grab' : 'default';
    }
    if (this.temp) {
      const last = this.temp.pts?.[this.temp.pts.length - 1] || (this.temp.b ? null : this.temp.a);
      this.temp.cursor = this.snap(p, last, this.tool === 'wall' || this.tool === 'measure');
    } else if (['wall', 'room', 'scale', 'measure'].includes(this.tool)) {
      this.snap(p, null);
    } else {
      this.snapMark = null;
    }
    this.draw();
  }

  onUp(e) {
    if (this.pan) {
      const wasClick = !this.pan.moved;
      const btn = this.pan.button;
      this.pan = null;
      this.cv.style.cursor = this.tool === 'select' ? 'default' : 'crosshair';
      if (wasClick && btn === 2 && (this.tool === 'wall' || this.tool === 'room')) this.onDblClick(e);
      return;
    }
    if (this.drag) {
      this.drag = null;
      this.cv.style.cursor = 'grab';
    }
  }

  onDblClick() {
    if (this.tool === 'wall') { this.temp = null; this.draw(); }
    if (this.tool === 'room' && this.temp?.pts?.length >= 3) this.finishRoom();
  }

  onWheel(e) {
    e.preventDefault();
    const { sx, sy } = this.evtPt(e);
    const before = this.toMM(sx, sy);
    const k = Math.exp(-e.deltaY * 0.0015);
    this.view.s = Math.min(2, Math.max(0.005, this.view.s * k));
    this.view.ox = sx - before.x * this.view.s;
    this.view.oy = sy - before.y * this.view.s;
    this.draw();
  }

  finishRoom() {
    const pts = this.temp.pts;
    this.temp = null;
    const area = G.polygonArea(pts) / 1e6;
    const name = window.prompt(`방 이름을 입력하세요 (면적 ${area.toFixed(2)}㎡)`, `방 ${state.plan.rooms.length + 1}`);
    if (name === null) { this.draw(); return; }
    checkpoint();
    const room = { id: uid('r'), name: name.trim() || `방 ${state.plan.rooms.length + 1}`, pts };
    state.plan.rooms.push(room);
    emit('plan');
    select({ kind: 'room', id: room.id });
  }

  /**
   * 치수 도구: 누른 자리에서 좌우·위아래 벽까지 재어 지금 보이는 크기를 띄운다.
   * 벽 사이가 아니면(또는 Shift) 두 점으로 재는 방식으로 넘어간다. 값을 고쳐 적용하는 것은 main.js가 한다.
   */
  async measureAt(p, sx, sy) {
    this.hooks.closeMeasure?.();
    this.temp = null;
    const span = this.shift ? null : await this.hooks.spanAt?.(p);
    if (this.tool !== 'scale') return;
    if (span) {
      const lines = [];
      if (span.h) lines.push({ label: '가로', ...span.h });
      if (span.v) lines.push({ label: '세로', ...span.v });
      this.temp = { lines };
      const missing = [!span.h && '가로', !span.v && '세로'].filter(Boolean);
      this.hooks.openMeasure?.(lines, sx, sy, missing);
    } else {
      this.temp = { a: this.snap(p, null) };
      this.hooks.status?.('두 점으로 잽니다. 끝점을 한 번 더 찍으세요. (방 안을 누르면 벽 사이를 바로 잽니다)');
    }
    this.draw();
  }

  /* ---------- 그리기 ---------- */
  draw() {
    if (!this.w) return;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  render() {
    const c = this.ctx, v = this.view, plan = state.plan;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#fbfcfd';
    c.fillRect(0, 0, this.w, this.h);
    this.drawGrid();

    if (this.img && plan.image) {
      c.globalAlpha = this.imageOpacity;
      const o = this.toScr({ x: 0, y: 0 });
      c.imageSmoothingQuality = 'high';
      c.drawImage(this.img, o.x, o.y, plan.image.width * plan.mmPerPx * v.s, plan.image.height * plan.mmPerPx * v.s);
      c.globalAlpha = 1;
    }

    const sel = ui.selection;
    // 방
    plan.rooms.forEach((r, i) => {
      const color = ROOM_COLORS[i % ROOM_COLORS.length];
      this.poly(r.pts);
      c.fillStyle = hexA(color, 0.35);
      c.fill();
      c.lineWidth = sel?.id === r.id ? 2.5 : 1;
      c.strokeStyle = sel?.id === r.id ? '#2f6fed' : hexA(color, 0.9);
      c.stroke();
      const ct = this.toScr(G.polygonCentroid(r.pts));
      const area = G.polygonArea(r.pts) / 1e6;
      c.fillStyle = '#334';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '600 13px sans-serif';
      c.fillText(r.name, ct.x, ct.y - 8);
      c.font = '12px sans-serif';
      c.fillText(`${area.toFixed(1)}㎡ · ${(area / 3.3058).toFixed(1)}평`, ct.x, ct.y + 8);
    });

    // 벽
    for (const w of plan.walls) {
      this.poly(G.wallCorners(w));
      const on = sel?.id === w.id;
      c.fillStyle = on ? '#2f6fed' : w.auto ? 'rgba(60,70,85,.82)' : 'rgba(40,45,55,.92)';
      c.fill();
    }
    if (this.showDims) {
      for (const w of plan.walls) {
        if (w.auto && sel?.id !== w.id) continue;
        this.wallLabel(w);
      }
    } else if (sel?.kind === 'wall') {
      const w = plan.walls.find((x) => x.id === sel.id);
      if (w) this.wallLabel(w);
    }

    this.drawScaleRef();

    // 가구
    this.collisions = G.findCollisions(state.furniture, plan.walls);
    const sorted = [...state.furniture].sort((a, b) => a.elev - b.elev);
    for (const f of sorted) this.drawFurniture(f, sel?.id === f.id, this.collisions.has(f.id));

    this.drawTool();

    if (this.snapMark) {
      const s = this.toScr(this.snapMark);
      c.strokeStyle = '#e8590c';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(s.x, s.y, 6, 0, Math.PI * 2);
      c.stroke();
    }
    this.drawScaleBar();
  }

  drawGrid() {
    const c = this.ctx, s = this.view.s;
    const tl = this.toMM(0, 0), br = this.toMM(this.w, this.h);
    const lines = (step, color) => {
      if (step * s < 6) return;
      c.strokeStyle = color;
      c.lineWidth = 1;
      c.beginPath();
      for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
        const X = Math.round(x * s + this.view.ox) + 0.5;
        c.moveTo(X, 0); c.lineTo(X, this.h);
      }
      for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) {
        const Y = Math.round(y * s + this.view.oy) + 0.5;
        c.moveTo(0, Y); c.lineTo(this.w, Y);
      }
      c.stroke();
    };
    lines(100, '#f0f2f5');
    lines(1000, '#dfe4ea');
  }

  /** 축척을 맞춘 기준 치수선 */
  drawScaleRef() {
    const r = state.plan.scaleRef;
    if (!r || !state.plan.image) return;
    const c = this.ctx, a = this.toScr(r.a), b = this.toScr(r.b);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len * 7, ny = (b.x - a.x) / len * 7;
    c.strokeStyle = '#e8590c';
    c.lineWidth = 2;
    c.setLineDash([6, 4]);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    c.setLineDash([]);
    c.beginPath();
    for (const p of [a, b]) { c.moveTo(p.x - nx, p.y - ny); c.lineTo(p.x + nx, p.y + ny); }
    c.stroke();
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    this.tag(`기준 ${fmtMM(r.mm)}mm`, (a.x + b.x) / 2 - nx * 2.2, (a.y + b.y) / 2 - ny * 2.2, ang, '#e8590c');
  }

  drawScaleBar() {
    const c = this.ctx;
    const steps = [100, 200, 500, 1000, 2000, 5000, 10000];
    const len = steps.find((m) => m * this.view.s >= 70) || 10000;
    const L = len * this.view.s, x = 14, y = this.h - 16;
    c.strokeStyle = '#334';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y - 5); c.lineTo(x, y); c.lineTo(x + L, y); c.lineTo(x + L, y - 5);
    c.stroke();
    c.fillStyle = '#334';
    c.font = '11px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    c.fillText(len >= 1000 ? `${len / 1000}m` : `${len}mm`, x + L / 2, y - 3);
  }

  poly(pts) {
    const c = this.ctx;
    c.beginPath();
    pts.forEach((p, i) => { const s = this.toScr(p); i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); });
    c.closePath();
  }

  wallLabel(w) {
    const len = G.wallLength(w);
    if (len * this.view.s < 40) return;
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const s = this.toScr(mid);
    const off = (w.t / 2) * this.view.s + 10;
    let ang = Math.atan2(dy, dx);
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    this.tag(fmtMM(len), s.x - nx * off, s.y - ny * off, ang, '#2b3440');
  }

  tag(text, x, y, ang = 0, color = '#2b3440') {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.font = '600 11px sans-serif';
    const tw = c.measureText(text).width + 8;
    c.fillStyle = 'rgba(255,255,255,.88)';
    c.fillRect(-tw / 2, -8, tw, 16);
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 0, 0);
    c.restore();
  }

  drawFurniture(f, selected, bad) {
    const c = this.ctx;
    const pts = G.furnitureCorners(f);
    this.poly(pts);
    c.fillStyle = bad ? 'rgba(229,72,64,.45)' : hexA(f.color || '#cccccc', f.elev > 0 ? 0.55 : 0.85);
    c.fill();
    c.lineWidth = selected ? 2.5 : 1.2;
    c.strokeStyle = selected ? '#2f6fed' : bad ? '#d9443b' : 'rgba(30,40,50,.75)';
    c.setLineDash(f.elev > 0 ? [5, 3] : []);
    c.stroke();
    c.setLineDash([]);
    // 앞면 표시 (로컬 +y 변)
    const a = this.toScr(pts[2]), b = this.toScr(pts[3]);
    c.strokeStyle = selected ? '#2f6fed' : '#1f2833';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();

    const ct = this.toScr(f);
    const minSide = Math.min(f.w, f.d) * this.view.s;
    if (minSide > 18) {
      c.fillStyle = '#1f2833';
      c.font = `600 ${Math.min(13, Math.max(10, minSide / 4))}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(f.name, ct.x, ct.y - (selected ? 7 : 0));
      if (selected) {
        c.font = '11px sans-serif';
        c.fillText(`${fmtMM(f.w)}×${fmtMM(f.d)}`, ct.x, ct.y + 8);
      }
    }
  }

  drawTool() {
    const c = this.ctx, t = this.temp;
    if (!t) return;
    c.strokeStyle = '#e8590c';
    c.fillStyle = '#e8590c';
    c.lineWidth = 2;
    if (this.tool === 'wall' && t.pts.length && t.cursor) {
      const a = t.pts[t.pts.length - 1], b = t.cursor;
      const th = this.hooks.wallThickness?.() || 150;
      this.poly(G.wallCorners({ a, b, t: th, cap: true }));
      c.fillStyle = 'rgba(232,89,12,.35)';
      c.fill();
      const sa = this.toScr(a), sb = this.toScr(b);
      this.tag(`${fmtMM(G.dist(a, b))} mm`, (sa.x + sb.x) / 2, (sa.y + sb.y) / 2 - 16, 0, '#e8590c');
    }
    if (this.tool === 'room' && t.pts.length) {
      const pts = t.cursor ? [...t.pts, t.cursor] : t.pts;
      c.beginPath();
      pts.forEach((p, i) => { const s = this.toScr(p); i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); });
      c.setLineDash([6, 4]);
      c.stroke();
      c.setLineDash([]);
      for (const p of t.pts) { const s = this.toScr(p); c.fillRect(s.x - 3, s.y - 3, 6, 6); }
      if (pts.length >= 3) {
        const area = G.polygonArea(pts) / 1e6;
        const s = this.toScr(G.polygonCentroid(pts));
        this.tag(`${area.toFixed(2)}㎡`, s.x, s.y, 0, '#e8590c');
      }
    }
    if (t.lines) {
      for (const l of t.lines) this.dimLine(l.a, l.b, `${l.label} ${fmtMM(G.dist(l.a, l.b))}`);
    } else if ((this.tool === 'scale' || this.tool === 'measure') && t.a) {
      const b = t.b || t.cursor;
      if (!b) return;
      const d = G.dist(t.a, b);
      this.dimLine(t.a, b, `${fmtMM(d)} mm (${(d / 1000).toFixed(2)} m)`);
    }
  }

  /** 주황 치수선: 양 끝 눈금 + 가운데 길이 */
  dimLine(a, b, text) {
    const c = this.ctx, sa = this.toScr(a), sb = this.toScr(b);
    const len = Math.hypot(sb.x - sa.x, sb.y - sa.y) || 1;
    const nx = (-(sb.y - sa.y) / len) * 7, ny = ((sb.x - sa.x) / len) * 7;
    c.strokeStyle = '#e8590c';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(sa.x, sa.y); c.lineTo(sb.x, sb.y);
    for (const s of [sa, sb]) { c.moveTo(s.x - nx, s.y - ny); c.lineTo(s.x + nx, s.y + ny); }
    c.stroke();
    let ang = Math.atan2(sb.y - sa.y, sb.x - sa.x);
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    this.tag(text, (sa.x + sb.x) / 2 - nx * 2, (sa.y + sb.y) / 2 - ny * 2, ang, '#e8590c');
  }
}

export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
