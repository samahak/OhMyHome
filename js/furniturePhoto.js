// 가구 사진 → 크기 측정 → 샘플 모양 선택 → 내 가구로 저장
//
// 정면 사진 한 장으로는 실제 크기를 알 수 없으므로 기준이 하나 필요하다.
//   - 아는 치수 하나(제품 스펙의 가로 또는 높이)를 넣으면 가구 영역의 비율로 나머지를 구한다.
//   - 사진 속 기준 물체(A4 용지 등)에 선을 그으면 mm/px를 구해 가로·높이를 함께 잰다.
// 깊이는 정면에서 보이지 않으므로 고른 샘플 모양의 기본 깊이로 채우고, 사용자가 고칠 수 있다.
import { SHAPES, defaultsFor, suggestShape } from './catalog.js';
import { uid } from './store.js';

const MAX_W = 640, MAX_H = 480, HANDLE = 9;
const $ = (id) => document.getElementById(id);

export function initPhotoDialog({ onSave, status }) {
  const dlg = $('photo-dialog');
  const cv = $('photo-canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const s = { img: null, k: 1, box: null, ref: null, mode: 'box', drag: null, typeTouched: false };

  // 샘플 모양 목록
  $('ph-type').innerHTML = Object.entries(SHAPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

  function open() {
    s.img = null; s.box = null; s.ref = null; s.mode = 'box'; s.typeTouched = false;
    $('ph-name').value = '';
    $('ph-type').value = 'fridge_side';
    $('ph-known-mm').value = '';
    for (const id of ['ph-w', 'ph-d', 'ph-h']) $(id).value = '';
    $('ph-suggest').textContent = '';
    $('photo-empty').hidden = false;
    cv.width = MAX_W; cv.height = 360;
    redraw();
    dlg.showModal();
  }

  function loadFile(file) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      s.img = im;
      s.k = Math.min(MAX_W / im.width, MAX_H / im.height, 1);
      cv.width = Math.round(im.width * s.k);
      cv.height = Math.round(im.height * s.k);
      $('photo-empty').hidden = true;
      if (!$('ph-name').value) $('ph-name').value = file.name.replace(/\.[^.]+$/, '').slice(0, 20);
      s.ref = null;
      autoDetect();
    };
    im.src = url;
  }

  /* ---------- 가구 영역 자동 찾기 ---------- */
  // 테두리 픽셀의 중앙값을 배경색으로 보고, 그와 다른 픽셀이 몰린 가로·세로 구간을 찾는다.
  function autoDetect() {
    if (!s.img) return;
    ctx.drawImage(s.img, 0, 0, cv.width, cv.height);
    const { width: W, height: H } = cv;
    const d = ctx.getImageData(0, 0, W, H).data;
    const border = [[], [], []];
    const pushPx = (x, y) => { const i = (y * W + x) * 4; border[0].push(d[i]); border[1].push(d[i + 1]); border[2].push(d[i + 2]); };
    for (let x = 0; x < W; x += 2) { pushPx(x, 1); pushPx(x, H - 2); }
    for (let y = 0; y < H; y += 2) { pushPx(1, y); pushPx(W - 2, y); }
    const bg = border.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
    const tol = +$('photo-tol').value;
    const cols = new Uint32Array(W), rows = new Uint32Array(H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const dd = Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
        if (dd > tol) { cols[x]++; rows[y]++; }
      }
    }
    const span = (arr, len, other) => {
      const th = Math.max(2, other * 0.04);
      let best = null, cur = null;
      for (let i = 0; i < len; i++) {
        if (arr[i] > th) {
          if (!cur) cur = { a: i, b: i, sum: 0 };
          cur.b = i; cur.sum += arr[i];
        } else if (cur && i - cur.b > len * 0.02) {
          if (!best || cur.sum > best.sum) best = cur;
          cur = null;
        }
      }
      if (cur && (!best || cur.sum > best.sum)) best = cur;
      return best;
    };
    const cx = span(cols, W, H), cy = span(rows, H, W);
    if (cx && cy && cx.b - cx.a > 10 && cy.b - cy.a > 10) {
      s.box = { x: cx.a, y: cy.a, w: cx.b - cx.a + 1, h: cy.b - cy.a + 1 };
    } else {
      s.box = { x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.8 };
      status?.('배경과 가구를 구분하지 못했습니다. 초록 상자를 직접 맞춰 주세요.');
    }
    pickColor();
    recompute();
    redraw();
  }

  function pickColor() {
    if (!s.img || !s.box) return;
    ctx.drawImage(s.img, 0, 0, cv.width, cv.height);
    const b = s.box;
    const x = Math.round(b.x + b.w * 0.25), y = Math.round(b.y + b.h * 0.25);
    const w = Math.max(1, Math.round(b.w * 0.5)), h = Math.max(1, Math.round(b.h * 0.5));
    const d = ctx.getImageData(x, y, w, h).data;
    let r = 0, g = 0, bl = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; }
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
    $('ph-color').value = `#${hex(r)}${hex(g)}${hex(bl)}`;
  }

  /* ---------- 크기 계산 ---------- */
  function recompute() {
    if (!s.box) return;
    const bw = s.box.w / s.k, bh = s.box.h / s.k; // 원본 사진 px
    const refMode = document.querySelector('input[name=ph-ref]:checked').value;
    let W = null, H = null, note = '';
    if (refMode === 'known') {
      const v = +$('ph-known-mm').value;
      if (v > 0) {
        if ($('ph-known-axis').value === 'w') { W = v; H = v * bh / bw; }
        else { H = v; W = v * bw / bh; }
      } else note = '가로나 높이 중 아는 값 하나를 넣으면 나머지를 계산합니다.';
    } else if (s.ref) {
      const lenPx = Math.hypot(s.ref.b.x - s.ref.a.x, s.ref.b.y - s.ref.a.y) / s.k;
      const mm = +$('ph-ref-mm').value;
      if (lenPx > 2 && mm > 0) {
        const mmPerPx = mm / lenPx;
        W = bw * mmPerPx; H = bh * mmPerPx;
        note = `기준선 ${Math.round(lenPx)}px = ${mm}mm → 1px ≈ ${mmPerPx.toFixed(2)}mm. 기준 물체가 가구와 같은 거리에 있어야 정확합니다.`;
      }
    } else note = '사진 속 기준 물체 위에 기준선을 그어 주세요.';

    const ratio = bh / bw;
    const sug = suggestShape(ratio, W);
    if (!s.typeTouched) $('ph-type').value = sug;
    $('ph-suggest').textContent = `가구 영역 비율 높이/가로 = ${ratio.toFixed(2)} → 추천 모양: ${SHAPES[sug].label}`;

    if (W && H) {
      $('ph-w').value = Math.round(W);
      $('ph-h').value = Math.round(H);
      fillDepth();
    }
    $('ph-measure-note').textContent = note || '깊이는 정면 사진으로 알 수 없어 샘플 모양의 기본 깊이로 채웁니다. 실측값이 있으면 고쳐 주세요.';
  }

  function fillDepth() {
    const def = defaultsFor($('ph-type').value);
    // TV처럼 얇은 것은 그대로, 나머지는 가로가 커지면 깊이도 조금 따라 커지게 한다
    let d = def.d;
    const W = +$('ph-w').value;
    if (W > 0 && def.type === 'box') d = Math.round(Math.min(W, 600));
    $('ph-d').value = d;
    $('ph-use-photo').checked = SHAPES[$('ph-type').value].photoFront;
  }

  /* ---------- 그리기 ---------- */
  function redraw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!s.img) return;
    ctx.drawImage(s.img, 0, 0, cv.width, cv.height);
    if (s.box) {
      const b = s.box;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(0, 0, cv.width, b.y);
      ctx.fillRect(0, b.y + b.h, cv.width, cv.height - b.y - b.h);
      ctx.fillRect(0, b.y, b.x, b.h);
      ctx.fillRect(b.x + b.w, b.y, cv.width - b.x - b.w, b.h);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#22c55e';
      for (const [x, y] of corners(b)) ctx.fillRect(x - 5, y - 5, 10, 10);
      const W = $('ph-w').value, H = $('ph-h').value;
      if (W && H) {
        tag(`${W} mm`, b.x + b.w / 2, Math.max(12, b.y - 12));
        tag(`${H} mm`, Math.min(cv.width - 40, b.x + b.w + 40), b.y + b.h / 2);
      }
    }
    if (s.ref) {
      const b = s.ref.b || s.cursor;
      ctx.strokeStyle = '#f97316';
      ctx.fillStyle = '#f97316';
      ctx.lineWidth = 3;
      if (b) { ctx.beginPath(); ctx.moveTo(s.ref.a.x, s.ref.a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      for (const p of [s.ref.a, s.ref.b].filter(Boolean)) { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); }
      if (s.ref.b) tag(`기준 ${$('ph-ref-mm').value}mm`, (s.ref.a.x + s.ref.b.x) / 2, (s.ref.a.y + s.ref.b.y) / 2 - 14, '#f97316');
    }
  }
  function tag(t, x, y, color = '#16a34a') {
    ctx.font = '600 12px sans-serif';
    const w = ctx.measureText(t).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillRect(x - w / 2, y - 9, w, 18);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  }
  const corners = (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];

  /* ---------- 마우스 ---------- */
  function pt(e) {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height };
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!s.img) return;
    const p = pt(e);
    cv.setPointerCapture(e.pointerId);
    if (s.mode === 'ref') {
      if (!s.ref || s.ref.b) s.ref = { a: p, b: null };
      else {
        s.ref.b = p;
        s.mode = 'box';
        cv.style.cursor = 'crosshair';
        recompute();
      }
      redraw();
      return;
    }
    const b = s.box;
    if (b) {
      const ci = corners(b).findIndex(([x, y]) => Math.abs(p.x - x) < HANDLE && Math.abs(p.y - y) < HANDLE);
      if (ci >= 0) { s.drag = { type: 'corner', ci }; return; }
      if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) { s.drag = { type: 'move', ox: p.x - b.x, oy: p.y - b.y }; return; }
    }
    s.drag = { type: 'new', a: p };
    s.box = { x: p.x, y: p.y, w: 1, h: 1 };
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pt(e);
    if (s.mode === 'ref' && s.ref && !s.ref.b) { s.cursor = p; redraw(); return; }
    if (!s.drag) return;
    const b = s.box, cl = (v, max) => Math.max(0, Math.min(max, v));
    p.x = cl(p.x, cv.width); p.y = cl(p.y, cv.height);
    if (s.drag.type === 'move') {
      b.x = cl(p.x - s.drag.ox, cv.width - b.w);
      b.y = cl(p.y - s.drag.oy, cv.height - b.h);
    } else {
      const fixed = s.drag.type === 'new' ? s.drag.a : (() => { const c = corners(b)[(s.drag.ci + 2) % 4]; return { x: c[0], y: c[1] }; })();
      if (s.drag.type === 'corner') s.drag = { type: 'new', a: fixed };
      b.x = Math.min(fixed.x, p.x); b.y = Math.min(fixed.y, p.y);
      b.w = Math.abs(p.x - fixed.x); b.h = Math.abs(p.y - fixed.y);
    }
    recompute();
    redraw();
  });
  cv.addEventListener('pointerup', () => {
    if (s.drag && s.box && (s.box.w < 5 || s.box.h < 5)) autoDetect();
    else if (s.drag) pickColor();
    s.drag = null;
    redraw();
  });

  /* ---------- 입력 ---------- */
  $('file-photo').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadFile(f);
    e.target.value = '';
  });
  $('photo-auto').addEventListener('click', autoDetect);
  $('photo-tol').addEventListener('change', autoDetect);
  for (const el of document.querySelectorAll('input[name=ph-ref]')) {
    el.addEventListener('change', () => {
      const obj = el.value === 'object' && el.checked;
      $('ref-object').hidden = !obj;
      $('ref-known').hidden = obj;
      recompute(); redraw();
    });
  }
  for (const id of ['ph-known-mm', 'ph-known-axis', 'ph-ref-mm']) {
    $(id).addEventListener('input', () => { recompute(); redraw(); });
  }
  $('ph-ref-preset').addEventListener('change', (e) => {
    if (+e.target.value > 0) $('ph-ref-mm').value = e.target.value;
    else $('ph-ref-mm').focus();
    recompute(); redraw();
  });
  $('ph-draw-ref').addEventListener('click', () => {
    if (!s.img) return;
    s.mode = 'ref';
    s.ref = null;
    status?.('사진 속 기준 물체의 양 끝을 차례로 누르세요.');
    redraw();
  });
  $('ph-type').addEventListener('change', () => { s.typeTouched = true; fillDepth(); });
  $('ph-color-auto').addEventListener('click', pickColor);
  for (const id of ['ph-w', 'ph-h']) $(id).addEventListener('input', redraw);

  /** 가구 영역을 잘라 텍스처용으로 줄인다 */
  function cropImage() {
    if (!s.img || !s.box) return null;
    const b = s.box, k = s.k;
    const sx = b.x / k, sy = b.y / k, sw = b.w / k, sh = b.h / k;
    const scale = Math.min(1, 512 / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    c.getContext('2d').drawImage(s.img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }

  function save(place) {
    const w = +$('ph-w').value, d = +$('ph-d').value, h = +$('ph-h').value;
    if (!(w > 0 && d > 0 && h > 0)) {
      alert('가로·깊이·높이를 모두 채워 주세요.\n(아는 치수 하나를 넣거나 기준선을 그으면 자동으로 채워집니다)');
      return;
    }
    const type = $('ph-type').value;
    const item = {
      id: uid('lib'),
      type,
      name: $('ph-name').value.trim() || SHAPES[type].label,
      w: Math.round(w), d: Math.round(d), h: Math.round(h),
      color: $('ph-color').value,
      image: cropImage(),
      usePhoto: $('ph-use-photo').checked,
    };
    dlg.close();
    onSave(item, place);
  }
  $('ph-save').addEventListener('click', () => save(false));
  $('ph-place').addEventListener('click', () => save(true));

  return { open };
}
