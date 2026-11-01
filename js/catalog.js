// 샘플 가구 — 크기는 mm (가로 W × 깊이 D × 높이 H). 시판 제품의 흔한 크기를 기본값으로 둔다.
// shape는 models3d.js의 3D 모양 이름이고, 사진 가구도 이 중 하나를 골라 그 모양으로 그린다.
// photoFront: 사진을 앞면에 입혀도 자연스러운(앞면이 평평한) 모양인지

export const SHAPES = {
  fridge_side: { label: '양문형 냉장고', photoFront: true },
  fridge_top: { label: '일반 냉장고', photoFront: true },
  kimchi: { label: '뚜껑형 김치냉장고', photoFront: true },
  washer: { label: '드럼 세탁기/건조기', photoFront: true },
  top_washer: { label: '통돌이 세탁기', photoFront: true },
  wardrobe: { label: '붙박이장/옷장', photoFront: true },
  drawer: { label: '서랍장', photoFront: true },
  shelf: { label: '책장', photoFront: true },
  tvstand: { label: '거실장', photoFront: true },
  tv: { label: 'TV', photoFront: true },
  aircon: { label: '스탠드 에어컨', photoFront: true },
  bed: { label: '침대', photoFront: false },
  sofa: { label: '소파', photoFront: false },
  table: { label: '식탁/테이블', photoFront: false },
  desk: { label: '책상', photoFront: false },
  chair: { label: '의자', photoFront: false },
  box: { label: '상자(기본)', photoFront: true },
};

export const CATALOG = [
  { type: 'fridge_side', name: '양문형 냉장고', icon: '🧊', w: 912, d: 928, h: 1793, color: '#c9ced6' },
  { type: 'fridge_top', name: '일반 냉장고', icon: '🧊', w: 700, d: 700, h: 1800, color: '#e8eaee' },
  { type: 'kimchi', name: '김치냉장고', icon: '🥬', w: 950, d: 650, h: 850, color: '#e9e4dc' },
  { type: 'washer', name: '드럼 세탁기', icon: '🫧', w: 686, d: 830, h: 990, color: '#f1f2f4' },
  { type: 'washer', name: '건조기', icon: '🌀', w: 686, d: 800, h: 990, color: '#5b616b' },
  { type: 'top_washer', name: '통돌이 세탁기', icon: '🫧', w: 650, d: 690, h: 1050, color: '#eef0f3' },
  { type: 'wardrobe', name: '붙박이장', icon: '🚪', w: 2400, d: 600, h: 2300, color: '#efe9df' },
  { type: 'wardrobe', name: '옷장', icon: '🚪', w: 1200, d: 600, h: 2000, color: '#cfb497' },
  { type: 'bed', name: '싱글 침대', icon: '🛏️', w: 1000, d: 2050, h: 900, color: '#b89a7a' },
  { type: 'bed', name: '슈퍼싱글 침대', icon: '🛏️', w: 1150, d: 2050, h: 900, color: '#b89a7a' },
  { type: 'bed', name: '퀸 침대', icon: '🛏️', w: 1550, d: 2100, h: 1000, color: '#9c7b5b' },
  { type: 'bed', name: '킹 침대', icon: '🛏️', w: 1700, d: 2100, h: 1000, color: '#9c7b5b' },
  { type: 'sofa', name: '3인 소파', icon: '🛋️', w: 2100, d: 900, h: 850, color: '#8a9bb0' },
  { type: 'table', name: '4인 식탁', icon: '🍽️', w: 1400, d: 800, h: 750, color: '#a7825c' },
  { type: 'desk', name: '책상', icon: '🖥️', w: 1200, d: 600, h: 740, color: '#d8c7b0' },
  { type: 'chair', name: '의자', icon: '🪑', w: 450, d: 500, h: 850, color: '#6f7d8c' },
  { type: 'tvstand', name: '거실장', icon: '🗄️', w: 1800, d: 400, h: 450, color: '#f0ece6' },
  { type: 'tv', name: '65인치 TV', icon: '📺', w: 1450, d: 60, h: 840, color: '#1d2025', elev: 500 },
  { type: 'shelf', name: '책장', icon: '📚', w: 800, d: 300, h: 1800, color: '#e3d3bd' },
  { type: 'drawer', name: '서랍장', icon: '🗃️', w: 800, d: 450, h: 900, color: '#efe6da' },
  { type: 'aircon', name: '스탠드 에어컨', icon: '❄️', w: 400, d: 400, h: 1850, color: '#f6f7f9' },
  { type: 'box', name: '상자(직접 입력)', icon: '📦', w: 600, d: 600, h: 600, color: '#c9b38e' },
];

/** 모양별 기본 크기 — 사진 가구의 깊이를 정할 때 쓴다 */
export function defaultsFor(type) {
  return CATALOG.find((c) => c.type === type) || CATALOG[CATALOG.length - 1];
}

export function iconFor(type) {
  return defaultsFor(type).icon;
}

/**
 * 정면 사진의 높이/가로 비율로 어떤 모양일지 짐작한다. 어디까지나 제안이다.
 * widthMm이 있으면 크기도 함께 본다.
 */
export function suggestShape(ratio, widthMm) {
  if (!isFinite(ratio) || ratio <= 0) return 'box';
  if (ratio >= 3) return 'aircon';
  if (ratio >= 1.6) {
    if (widthMm && widthMm >= 1000) return 'wardrobe';
    if (widthMm && widthMm >= 850) return 'fridge_side';
    return widthMm ? 'fridge_top' : 'fridge_side';
  }
  if (ratio >= 1.2) return 'washer';
  if (ratio >= 0.85) return widthMm && widthMm > 1000 ? 'wardrobe' : 'drawer';
  if (ratio >= 0.5) return widthMm && widthMm > 1600 ? 'sofa' : 'kimchi';
  if (ratio >= 0.3) return 'tvstand';
  return 'bed';
}
