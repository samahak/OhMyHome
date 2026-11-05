// 샘플 가구 — 크기는 mm (가로 W × 깊이 D × 높이 H). 시판 제품의 흔한 크기를 기본값으로 둔다.
// shape는 models3d.js의 3D 모양 이름이다. 예전에 사진으로 만든 '내 가구'(library)도 이 중 하나의 모양으로 그린다.

export const SHAPES = {
  fridge_side: { label: '양문형 냉장고' },
  fridge_top: { label: '일반 냉장고' },
  kimchi: { label: '뚜껑형 김치냉장고' },
  kimchi_stand: { label: '스탠드형 김치냉장고' },
  washer: { label: '드럼 세탁기/건조기' },
  top_washer: { label: '통돌이 세탁기' },
  wash_tower: { label: '타워형 세탁건조기' },
  wardrobe: { label: '붙박이장/옷장' },
  shoe_cabinet: { label: '신발장' },
  microwave_cabinet: { label: '전자레인지 장' },
  curtain: { label: '커튼' },
  drawer: { label: '서랍장' },
  vanity: { label: '화장대' },
  shelf: { label: '책장' },
  wood_shelf: { label: '나무 선반' },
  plant: { label: '식물' },
  tvstand: { label: '거실장' },
  tv: { label: 'TV' },
  wallpad: { label: '월패드' },
  aircon: { label: '스탠드 에어컨' },
  aircon_outdoor: { label: '에어컨 실외기' },
  bed: { label: '침대' },
  sofa: { label: '소파' },
  table: { label: '식탁/테이블' },
  desk: { label: '책상' },
  chair: { label: '의자' },
  toilet: { label: '변기' },
  basin: { label: '세면대' },
  bathtub: { label: '욕조' },
  bath_shelf: { label: '철제 선반' },
  kitchen_counter: { label: '주방 싱크대' },
  kitchen_l: { label: 'ㄱ자 주방 싱크대', dims: { w: '가로 길이 (뒤쪽)', d: '세로 길이 (꺾인 쪽)' } },
  box: { label: '상자(기본)' },
};

/** TV 화면 크기(인치, 16:9 대각선) → 겉 크기(mm). 베젤은 가로 12mm · 세로 22mm로 어림한다. */
export const TV_INCHES = [43, 50, 55, 65, 75, 85];
const TV_DIAG = Math.hypot(16, 9);
export function tvSizeFromInch(inch) {
  const diag = inch * 25.4;
  return { w: Math.round((diag * 16) / TV_DIAG + 12), h: Math.round((diag * 9) / TV_DIAG + 22) };
}
/** 가로 크기로 거꾸로 짐작한 인치 (크기를 직접 고쳤을 때 보여 주는 값) */
export function inchFromTvWidth(w) {
  return Math.round((((w - 12) * TV_DIAG) / 16 / 25.4) * 10) / 10;
}

/** 소파 인원 → 가로(mm). 한 자리 580mm + 양쪽 팔걸이 180mm씩 (3인 2,100mm) */
const SOFA_SEAT_MM = 580, SOFA_ARMS_MM = 360;
export function sofaWidthFromSeats(n) { return SOFA_ARMS_MM + SOFA_SEAT_MM * n; }
export function seatsFromSofaWidth(w) { return Math.max(1, Math.round((w - SOFA_ARMS_MM) / SOFA_SEAT_MM)); }

/** 식탁 인원 → 크기(mm). 긴 변 한 자리 600mm + 여유 200mm, 인원이 많을수록 조금 깊게 (4인 1,400×800) */
export function tableSizeFromPeople(n) {
  return { w: Math.max(800, Math.ceil(n / 2) * 600 + 200), d: n <= 2 ? 750 : n <= 4 ? 800 : n <= 6 ? 900 : 1000 };
}
export function peopleFromTableWidth(w) { return Math.max(2, Math.round((w - 200) / 600) * 2); }

/**
 * 숫자 하나로 크기를 정하는 가구 (TV 인치, 소파 인원).
 * 속성 패널은 이 표를 보고 입력칸과 빠른 선택 버튼을 그린다. 가구 항목에는 f[key]로 남는다.
 *   size(v)  → 바꿀 크기 { w, h, ... }      guess(f) → key가 없을 때(크기를 직접 고친 뒤) 짐작한 값
 *   affects  → 이 칸을 직접 고치면 f[key]를 지운다
 */
export const SIZE_PRESETS = {
  tv: {
    key: 'inch', label: '화면 크기 (인치)', unit: '"', unitText: '인치', card: 'TV', pick: '인치 선택',
    options: TV_INCHES, min: 10, max: 150,
    size: tvSizeFromInch, guess: (f) => inchFromTvWidth(f.w), affects: ['w', 'h'],
    name: (v) => `${v}인치 TV`, namePattern: /^\d+(\.\d+)?인치 TV$/, note: '16:9 화면 + 베젤 어림값',
  },
  sofa: {
    key: 'seats', label: '인원 (인용)', unit: '인', unitText: '인', card: '소파', pick: '인원 선택',
    options: [2, 3, 4, 5, 6], min: 1, max: 8,
    size: (n) => ({ w: sofaWidthFromSeats(n) }), guess: (f) => seatsFromSofaWidth(f.w), affects: ['w'],
    name: (v) => `${v}인 소파`, namePattern: /^\d+인 소파$/, note: '한 자리 580mm + 팔걸이',
  },
  table: {
    key: 'people', label: '인원 (인용)', unit: '인', unitText: '인', card: '식탁', pick: '인원 선택',
    options: [2, 4, 6, 8], min: 1, max: 12,
    size: tableSizeFromPeople, guess: (f) => peopleFromTableWidth(f.w), affects: ['w', 'd'],
    name: (v) => `${v}인 식탁`, namePattern: /^\d+인 식탁$/, note: '긴 변 한 자리 600mm',
  },
};

/**
 * ㄱ자 주방 싱크대: w = 가로(뒤쪽) 길이, d = 세로(꺾인 쪽) 길이 — 세로가 가로보다 길어도 된다. 상판 깊이는 f.counterD(없으면 기본 600).
 * 꺾인 쪽은 앞에서 볼 때 오른쪽, f.mirror면 왼쪽.
 */
export const L_COUNTER = { depth: 600, minDepth: 400, maxDepth: 900, minArm: 300 };
export function lCounterDepth(f) { return f.counterD || L_COUNTER.depth; }

/**
 * 식물 종류 — 놓은 뒤 속성 패널에서 바꾼다. 가구 항목에는 f.plant(키)로 남고, 크기는 화분 포함 겉 크기(mm).
 * 색상(f.color)은 화분 색이다. 3D 모양은 models3d.js의 PLANT_SHAPES.
 */
export const PLANTS = {
  monstera: { label: '몬스테라', w: 750, d: 750, h: 1100 },
  strelitzia: { label: '여인초', w: 650, d: 650, h: 1700 },
  olive: { label: '올리브나무', w: 550, d: 550, h: 1500 },
  rubber: { label: '고무나무', w: 500, d: 500, h: 1300 },
  areca: { label: '아레카야자', w: 850, d: 850, h: 1500 },
  sansevieria: { label: '산세베리아', w: 350, d: 350, h: 800 },
  zamioculcas: { label: '금전수', w: 550, d: 550, h: 800 },
  pothos: { label: '스킨답서스', w: 400, d: 400, h: 350 },
};
export function plantOf(f) { return PLANTS[f?.plant] ? f.plant : 'monstera'; }

/** 문 높이(mm) — 3D에서 문 위로는 천장까지 벽을 채운다 */
export const DOOR = { h: 2100 };

/** 창 기본 높이(mm) — sill: 바닥에서 창 아래까지, h: 창 높이. 폭 2.6m 이상인 창은 바닥까지 내려오는 큰 창(거실·발코니)으로 본다 */
export function windowDefaults(width) {
  return width >= 2600 ? { sill: 0, h: 2100 } : { sill: 900, h: 1200 };
}

export const CATALOG = [
  { type: 'fridge_side', name: '양문형 냉장고', icon: '🧊', w: 912, d: 928, h: 1793, color: '#c9ced6' },
  { type: 'fridge_top', name: '일반 냉장고', icon: '🧊', w: 700, d: 700, h: 1800, color: '#e8eaee' },
  { type: 'kimchi', name: '뚜껑형 김치냉장고', icon: '🥬', w: 950, d: 650, h: 850, color: '#e9e4dc' },
  { type: 'kimchi_stand', name: '스탠드형 김치냉장고', icon: '🥬', w: 795, d: 800, h: 1855, color: '#e6e1d8' },
  { type: 'washer', name: '드럼 세탁기', icon: '🫧', w: 686, d: 830, h: 990, color: '#f1f2f4' },
  { type: 'washer', name: '건조기', icon: '🌀', w: 686, d: 800, h: 990, color: '#5b616b' },
  { type: 'top_washer', name: '통돌이 세탁기', icon: '🫧', w: 650, d: 690, h: 1050, color: '#eef0f3' },
  { type: 'wash_tower', name: '타워형 세탁건조기', icon: '🧺', w: 700, d: 830, h: 1890, color: '#e9e7e2' },
  { type: 'wardrobe', name: '붙박이장', icon: '🚪', w: 2400, d: 600, h: 2300, color: '#efe9df' },
  { type: 'wardrobe', name: '옷장', icon: '🚪', w: 1200, d: 600, h: 2000, color: '#cfb497' },
  { type: 'shoe_cabinet', name: '신발장', icon: '👟', w: 1200, d: 380, h: 2300, color: '#efe9df' },
  // 키큰 렌지대: 아래 수납 · 전자레인지 칸 · 밥솥 칸 · 위 수납
  { type: 'microwave_cabinet', name: '전자레인지 장', icon: '♨️', w: 600, d: 450, h: 1800, color: '#f2efea' },
  // 커튼: 창을 덮는 폭 × 레일 깊이 × 천장 높이. 등(-y)을 창 쪽 벽에 대고(🧲 벽에 붙이기) 쓴다. 색은 겉 커튼 천 색
  { type: 'curtain', name: '커튼', icon: '🪟', w: 2400, d: 150, h: 2300, color: '#c9b9a3' },
  { type: 'bed', name: '싱글 침대', icon: '🛏️', w: 1000, d: 2050, h: 900, color: '#b89a7a' },
  { type: 'bed', name: '슈퍼싱글 침대', icon: '🛏️', w: 1150, d: 2050, h: 900, color: '#b89a7a' },
  { type: 'bed', name: '퀸 침대', icon: '🛏️', w: 1550, d: 2100, h: 1000, color: '#9c7b5b' },
  { type: 'bed', name: '킹 침대', icon: '🛏️', w: 1700, d: 2100, h: 1000, color: '#9c7b5b' },
  { type: 'sofa', name: '3인 소파', icon: '🛋️', seats: 3, w: sofaWidthFromSeats(3), d: 900, h: 850, color: '#8a9bb0' },
  { type: 'table', name: '4인 식탁', icon: '🍽️', people: 4, ...tableSizeFromPeople(4), h: 750, color: '#a7825c' },
  { type: 'desk', name: '책상', icon: '🖥️', w: 1200, d: 600, h: 740, color: '#d8c7b0' },
  { type: 'chair', name: '의자', icon: '🪑', w: 450, d: 500, h: 850, color: '#6f7d8c' },
  { type: 'tvstand', name: '거실장', icon: '🗄️', w: 1800, d: 400, h: 450, color: '#f0ece6' },
  { type: 'tv', name: '65인치 TV', icon: '📺', inch: 65, ...tvSizeFromInch(65), d: 60, color: '#1d2025', elev: 500 },
  // 월패드(세대 단말기): 10인치 화면급, 화면 가운데가 눈높이(약 1.4m)쯤 오게 벽에 단다
  { type: 'wallpad', name: '월패드', icon: '📟', w: 270, d: 25, h: 190, color: '#f4f5f7', elev: 1300 },
  { type: 'shelf', name: '책장', icon: '📚', w: 800, d: 300, h: 1800, color: '#e3d3bd' },
  { type: 'wood_shelf', name: '나무 선반', icon: '🪵', w: 800, d: 350, h: 1500, color: '#c49a6c' },
  { type: 'plant', name: PLANTS.monstera.label, icon: '🪴', plant: 'monstera', w: PLANTS.monstera.w, d: PLANTS.monstera.d, h: PLANTS.monstera.h, color: '#e3dbd0' },
  { type: 'drawer', name: '서랍장', icon: '🗃️', w: 800, d: 450, h: 900, color: '#efe6da' },
  { type: 'vanity', name: '화장대', icon: '🪞', w: 800, d: 400, h: 1450, color: '#efe6da' },
  { type: 'aircon', name: '스탠드 에어컨', icon: '❄️', w: 400, d: 400, h: 1850, color: '#f6f7f9' },
  { type: 'aircon_outdoor', name: '에어컨 실외기', icon: '🌬️', w: 880, d: 330, h: 640, color: '#e8e9eb' },
  { type: 'kitchen_counter', name: '주방 싱크대', icon: '🍳', w: 2400, d: 600, h: 2200, color: '#eeeae4' },
  { type: 'kitchen_l', name: 'ㄱ자 주방 싱크대', icon: '🍳', w: 2700, d: 1800, h: 2200, color: '#eeeae4' },
  { type: 'toilet', name: '변기', icon: '🚽', w: 400, d: 700, h: 780, color: '#f7f7f5' },
  { type: 'basin', name: '세면대', icon: '🚰', w: 600, d: 450, h: 850, color: '#f1efea' },
  { type: 'bathtub', name: '욕조', icon: '🛁', w: 1500, d: 750, h: 550, color: '#f7f7f5' },
  { type: 'bath_shelf', name: '욕실 철제 선반', icon: '🧴', w: 450, d: 300, h: 1400, color: '#c9ccd1' },
  { type: 'box', name: '상자(직접 입력)', icon: '📦', w: 600, d: 600, h: 600, color: '#c9b38e' },
];

/** 모양별 기본 크기 — 사진 가구의 깊이를 정할 때 쓴다 */
export function defaultsFor(type) {
  return CATALOG.find((c) => c.type === type) || CATALOG[CATALOG.length - 1];
}

export function iconFor(type) {
  return defaultsFor(type).icon;
}

