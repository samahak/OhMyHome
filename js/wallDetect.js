// 도면 이미지에서 벽을 찾는다. DOM 없이 { data, width, height } (RGBA) 만으로 돈다.
//
// 1) 벽 후보 픽셀: 어두운 픽셀(mode 'dark') 또는 찍은 벽 색과 가까운 픽셀(mode 'color')
// 2) 열림 연산(침식 → 팽창): 정사각형 k×k가 통째로 들어가지 않는 얇은 것(글자·치수선·문 호)을 지운다
// 3) 남은 덩어리를 축에 나란한 사각형 여러 개로 쪼갠다 → 사각형 하나가 벽 하나

export function buildMask(img, { mode = 'dark', threshold = 110, color = null, tolerance = 40 }) {
  const { data, width, height } = img;
  const mask = new Uint8Array(width * height);
  const tol2 = tolerance * tolerance * 3;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const a = data[p + 3];
    if (a < 128) continue;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (mode === 'color' && color) {
      const dr = r - color.r, dg = g - color.g, db = b - color.b;
      mask[i] = dr * dr + dg * dg + db * db <= tol2 ? 1 : 0;
    } else {
      mask[i] = 0.299 * r + 0.587 * g + 0.114 * b < threshold ? 1 : 0;
    }
  }
  return mask;
}

/**
 * 1차원 창 연산을 가로→세로로 한 번씩 적용한다.
 * erode: 창이 모두 1일 때만 1, dilate: 창에 1이 하나라도 있으면 1.
 * 창은 [i - lo, i + hi]. 침식과 팽창의 창을 서로 뒤집어 써야 제자리에 돌아온다(열림).
 */
function morph(mask, width, height, k, erode) {
  const lo = erode ? Math.floor((k - 1) / 2) : k - 1 - Math.floor((k - 1) / 2);
  const hi = k - 1 - lo;
  const pass = (src, len, count, stride, step) => {
    const out = new Uint8Array(src.length);
    const pre = new Int32Array(len + 1);
    for (let line = 0; line < count; line++) {
      const base = line * stride;
      for (let i = 0; i < len; i++) pre[i + 1] = pre[i] + src[base + i * step];
      for (let i = 0; i < len; i++) {
        const a = i - lo, b = i + hi;
        if (erode) {
          if (a < 0 || b >= len) continue;
          out[base + i * step] = pre[b + 1] - pre[a] === k ? 1 : 0;
        } else {
          const s = pre[Math.min(len - 1, b) + 1] - pre[Math.max(0, a)];
          out[base + i * step] = s > 0 ? 1 : 0;
        }
      }
    }
    return out;
  };
  const h = pass(mask, width, height, width, 1);
  return pass(h, height, width, 1, width);
}

export function openMask(mask, width, height, k) {
  if (k <= 1) return mask;
  return morph(morph(mask, width, height, k, true), width, height, k, false);
}

/**
 * 이어진 덩어리(4방향) 가운데 가로·세로 모두 minSpanPx보다 작은 것을 지운다.
 * 벽은 서로 이어져 큰 덩어리가 되지만, 굵은 글자는 한 글자씩 떨어진 작은 덩어리라 여기서 걸러진다.
 */
export function dropSmallPieces(mask, width, height, minSpanPx) {
  if (minSpanPx <= 1) return mask;
  const out = mask.slice();
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const piece = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0, minX = width, maxX = 0, minY = height, maxY = 0;
    piece.length = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const i = stack[--top];
      piece.push(i);
      const x = i % width, y = (i - x) / width;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < width - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0 && mask[i - width] && !seen[i - width]) { seen[i - width] = 1; stack[top++] = i - width; }
      if (y < height - 1 && mask[i + width] && !seen[i + width]) { seen[i + width] = 1; stack[top++] = i + width; }
    }
    if (Math.max(maxX - minX + 1, maxY - minY + 1) < minSpanPx) {
      for (const i of piece) out[i] = 0;
    }
  }
  return out;
}

/** 1인 픽셀을 겹치지 않는 사각형으로 덮는다 (가로로 먼저 늘리고, 그 폭 그대로 아래로 늘린다) */
export function maskToRects(mask, width, height) {
  const used = new Uint8Array(mask.length);
  const rects = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i] || used[i]) continue;
      let x2 = x;
      while (x2 + 1 < width && mask[i + (x2 + 1 - x)] && !used[i + (x2 + 1 - x)]) x2++;
      let y2 = y;
      outer: while (y2 + 1 < height) {
        const row = (y2 + 1) * width;
        for (let xx = x; xx <= x2; xx++) if (!mask[row + xx] || used[row + xx]) break outer;
        y2++;
      }
      for (let yy = y; yy <= y2; yy++) used.fill(1, yy * width + x, yy * width + x2 + 1);
      rects.push({ x, y, w: x2 - x + 1, h: y2 - y + 1 });
    }
  }
  return rects;
}

/** 같은 폭으로 위아래 붙어 있거나, 같은 높이로 좌우 붙어 있는 사각형을 하나로 합친다 */
export function mergeRects(rects) {
  let list = rects.slice();
  let changed = true;
  while (changed) {
    changed = false;
    list.sort((a, b) => a.x - b.x || a.y - b.y);
    const out = [];
    for (const r of list) {
      const prev = out[out.length - 1];
      if (prev && prev.x === r.x && prev.w === r.w && prev.y + prev.h === r.y) { prev.h += r.h; changed = true; continue; }
      out.push({ ...r });
    }
    out.sort((a, b) => a.y - b.y || a.x - b.x);
    list = [];
    for (const r of out) {
      const prev = list[list.length - 1];
      if (prev && prev.y === r.y && prev.h === r.h && prev.x + prev.w === r.x) { prev.w += r.w; changed = true; continue; }
      list.push(r);
    }
  }
  return list;
}

/**
 * 벽 사각형을 찾는다 (픽셀 단위).
 * minThickPx: 이보다 얇은 선은 벽이 아니라고 본다.
 * minPiecePx: 이어진 덩어리가 가로·세로 모두 이보다 작으면 글자 같은 것으로 보고 버린다.
 */
export function detectWallRects(img, opts) {
  const k = Math.max(1, Math.round(opts.minThickPx));
  const mask = buildMask(img, opts);
  const opened = dropSmallPieces(openMask(mask, img.width, img.height, k), img.width, img.height, opts.minPiecePx || 0);
  const rects = mergeRects(maskToRects(opened, img.width, img.height));
  // 짧은 자투리(굵은 글자·기둥 표시의 조각)는 버린다
  return rects.filter((r) => Math.max(r.w, r.h) >= k * 2 && Math.min(r.w, r.h) >= Math.max(1, k * 0.5));
}

/** 픽셀 사각형 → 벽(중심선 + 두께, mm). 긴 쪽을 벽 방향으로 본다. */
export function rectToWall(r, mmPerPx) {
  const s = mmPerPx;
  if (r.w >= r.h) {
    const y = (r.y + r.h / 2) * s;
    return { a: { x: r.x * s, y }, b: { x: (r.x + r.w) * s, y }, t: r.h * s };
  }
  const x = (r.x + r.w / 2) * s;
  return { a: { x, y: r.y * s }, b: { x, y: (r.y + r.h) * s }, t: r.w * s };
}
