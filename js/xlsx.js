/**
 * 아주 작은 엑셀(.xlsx) 쓰기 — 시트 하나, 글자·숫자·수식 칸, 몇 가지 서식만.
 * 외부 라이브러리 없이 xlsx(=zip 안의 XML 몇 개)를 무압축 zip으로 묶는다. DOM 없음 (Node에서 시험할 수 있다).
 */

/** 칸 서식 번호 (styles.xml의 cellXfs 순서) */
export const STYLE = {
  text: 0,
  header: 1,    // 굵게 + 연한 파랑 바탕 + 아래 테두리
  won: 2,       // #,##0
  totalLabel: 3, // 굵게 + 위 테두리
  totalWon: 4,  // 굵게 #,##0 + 위 테두리
  section: 5,   // 굵게 회색 (구역 제목)
  muted: 6,     // 회색 글자
  mutedWon: 7,  // 회색 #,##0
  title: 8,     // 굵게 큰 글자
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // XML 1.0에 넣을 수 없는 제어 문자는 뺀다
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** 0 → A, 25 → Z, 26 → AA */
export function colName(i) {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

/**
 * 칸: null/undefined(빈칸) · 문자열 · 숫자 · { v, s?, f? } (s: STYLE 번호, f: 수식 — v는 미리 계산한 값)
 * @param {{ name?: string, cols?: number[], rows: any[][], freeze?: number }} sheet
 *   cols: 열 너비(글자 수), freeze: 위에서 고정할 줄 수
 * @returns {Uint8Array} .xlsx 파일 내용
 */
export function makeXlsx({ name = 'Sheet1', cols = [], rows, freeze = 0 }) {
  const cell = (c, ref) => {
    if (c == null || c === '') return '';
    const o = typeof c === 'object' ? c : { v: c };
    const s = o.s ? ` s="${o.s}"` : '';
    if (o.f) return `<c r="${ref}"${s}><f>${esc(o.f)}</f>${o.v != null ? `<v>${+o.v}</v>` : ''}</c>`;
    if (typeof o.v === 'number' && isFinite(o.v)) return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
    if (o.v == null || o.v === '') return s ? `<c r="${ref}"${s}/>` : '';
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(o.v)}</t></is></c>`;
  };
  const sheetData = rows.map((row, r) =>
    `<row r="${r + 1}">${(row || []).map((c, i) => cell(c, `${colName(i)}${r + 1}`)).join('')}</row>`).join('');
  const colsXml = cols.length
    ? `<cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const pane = freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS = 'http://schemas.openxmlformats.org';
  const files = {
    '[Content_Types].xml': `${XML}<Types xmlns="${NS}/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>',
    '_rels/.rels': `${XML}<Relationships xmlns="${NS}/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML}<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships">`
      + `<sheets><sheet name="${esc(name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="${NS}/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES_XML(XML, NS),
    'xl/worksheets/sheet1.xml': `${XML}<worksheet xmlns="${NS}/spreadsheetml/2006/main">${pane}${colsXml}<sheetData>${sheetData}</sheetData></worksheet>`,
  };
  const enc = new TextEncoder();
  return zipStore(Object.entries(files).map(([n, t]) => [n, enc.encode(t)]));
}

// numFmtId 3 = '#,##0' (엑셀 기본 서식)
const STYLES_XML = (XML, NS) => `${XML}<styleSheet xmlns="${NS}/spreadsheetml/2006/main">`
  + '<fonts count="4">'
  + '<font><sz val="11"/><name val="맑은 고딕"/></font>'
  + '<font><b/><sz val="11"/><name val="맑은 고딕"/></font>'
  + '<font><sz val="11"/><color rgb="FF808080"/><name val="맑은 고딕"/></font>'
  + '<font><b/><sz val="14"/><name val="맑은 고딕"/></font>'
  + '</fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F0FE"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left/><right/><top/><bottom style="thin"><color rgb="FF8EA6D8"/></bottom><diagonal/></border>'
  + '<border><left/><right/><top style="thin"><color rgb="FF333333"/></top><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="9">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>'
  + '<xf numFmtId="3" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="3" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

/* ---------- 무압축 zip ---------- */
let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** [[이름, Uint8Array]] → zip (저장 방식 0 = 압축 없음) */
function zipStore(entries) {
  const enc = new TextEncoder();
  const DOS_TIME = 0, DOS_DATE = (2020 - 1980) << 9 | 1 << 5 | 1;   // 2020-01-01 00:00
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nm = enc.encode(name), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);   // UTF-8 이름
    head.setUint16(8, 0, true); head.setUint16(10, DOS_TIME, true); head.setUint16(12, DOS_DATE, true);
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true);
    head.setUint16(26, nm.length, true); head.setUint16(28, 0, true);
    parts.push(new Uint8Array(head.buffer), nm, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true); cd.setUint16(12, DOS_TIME, true); cd.setUint16(14, DOS_DATE, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, nm.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
