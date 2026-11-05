/**
 * 아주 작은 PDF 쓰기 — 쪽마다 JPEG 그림 한 장을 A4(그림이 가로로 길면 가로 A4)에 여백을 두고 꽉 차게 넣는다.
 * 외부 라이브러리 없이 JPEG 바이트를 그대로(DCTDecode) 담는다. DOM 없음 (Node에서 시험할 수 있다).
 */

const A4 = [595.28, 841.89];   // pt (세로 A4)
const MARGIN = 24;              // pt

/**
 * @param pages [{ jpeg: Uint8Array, width, height }] — width·height는 그림 px
 * @returns Uint8Array (PDF 파일)
 */
export function makePdf(pages) {
  const enc = new TextEncoder();
  const chunks = [];
  let size = 0;
  const offsets = [];
  const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); size += b.length; };
  // 객체 번호: 1 카탈로그, 2 쪽 목록, 그다음 쪽마다 [쪽, 내용, 그림] 셋
  const obj = (n, body) => { offsets[n] = size; put(`${n} 0 obj\n`); body(); put('\nendobj\n'); };
  const pageIds = pages.map((_, i) => 3 + i * 3);

  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  pages.forEach((pg, i) => {
    const id = pageIds[i];
    const [PW, PH] = pg.width >= pg.height ? [A4[1], A4[0]] : A4;
    const k = Math.min((PW - MARGIN * 2) / pg.width, (PH - MARGIN * 2) / pg.height);
    const w = pg.width * k, h = pg.height * k, x = (PW - w) / 2, y = (PH - h) / 2;
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    obj(id, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`));
    obj(id + 1, () => put(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(id + 2, () => {
      put(`<< /Type /XObject /Subtype /Image /Width ${pg.width} /Height ${pg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
      put(pg.jpeg);
      put('\nendstream');
    });
  });
  const n = 3 + pages.length * 3;
  const xref = size;
  put(`xref\n0 ${n}\n0000000000 65535 f \n`);
  for (let i = 1; i < n; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** 'data:image/jpeg;base64,...' → Uint8Array */
export function dataURLBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
