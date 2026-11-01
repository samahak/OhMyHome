// 체험용 샘플 도면을 캔버스로 그린다. 1px = 10mm (MM_PER_PX).
// 실제 도면처럼 굵은 벽, 얇은 창·문 기호, 치수선, 방 이름을 함께 넣어 벽 자동 인식을 시험해 볼 수 있다.

export const SAMPLE_MM_PER_PX = 10;

const MARGIN = 90; // px — 치수선 자리

export function drawSamplePlan() {
  const OUT_W = 10400, OUT_H = 8300; // 바깥 치수 mm
  const px = (mm) => mm / SAMPLE_MM_PER_PX;
  const cv = document.createElement('canvas');
  cv.width = px(OUT_W) + MARGIN * 2;
  cv.height = px(OUT_H) + MARGIN * 2;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.translate(MARGIN, MARGIN);

  // 방 바닥 색 (옅게)
  const floor = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(px(x), px(y), px(w), px(h)); };
  floor(200, 200, 3340, 3940, '#f7efe2');   // 안방
  floor(200, 4260, 3340, 3840, '#f7efe2');  // 침실2
  floor(3660, 200, 3480, 5540, '#fbf6ee');  // 거실
  floor(7260, 200, 2940, 3540, '#f7efe2');  // 침실3
  floor(7260, 3860, 2940, 4240, '#eef3f6'); // 주방
  floor(3660, 5860, 2080, 2240, '#e9f1f7'); // 욕실

  // 벽: 중심선 기준 (x1,y1)-(x2,y2), 두께 t. gaps = 벽 위 [시작, 끝] 구간(mm)은 비운다.
  const wall = (x1, y1, x2, y2, t, gaps = []) => {
    g.fillStyle = '#222';
    const horiz = y1 === y2;
    const from = horiz ? Math.min(x1, x2) - t / 2 : Math.min(y1, y2) - t / 2;
    const to = horiz ? Math.max(x1, x2) + t / 2 : Math.max(y1, y2) + t / 2;
    const cuts = [...gaps].sort((a, b) => a[0] - b[0]);
    let cur = from;
    for (const [s, e] of [...cuts, [to, to]]) {
      if (s > cur) {
        if (horiz) g.fillRect(px(cur), px(y1 - t / 2), px(s - cur), px(t));
        else g.fillRect(px(x1 - t / 2), px(cur), px(t), px(s - cur));
      }
      cur = Math.max(cur, e);
    }
  };
  const EXT = 200, INT = 120;
  wall(100, 100, 10300, 100, EXT, [[1000, 2800], [4500, 6500], [8000, 9600]]);
  wall(10300, 100, 10300, 8200, EXT, [[5000, 7000]]);
  wall(100, 8200, 10300, 8200, EXT, [[1000, 2600], [6200, 7100]]);
  wall(100, 100, 100, 8200, EXT);
  wall(3600, 100, 3600, 8200, INT, [[3200, 4100], [4800, 5700]]);
  wall(100, 4200, 3600, 4200, INT);
  wall(7200, 100, 7200, 3800, INT);
  wall(7200, 3800, 10300, 3800, INT, [[7400, 8300]]);
  wall(3600, 5800, 5800, 5800, INT, [[4600, 5400]]);
  wall(5800, 5800, 5800, 8200, INT);

  // 창문 (외벽 틈에 얇은 선 세 줄)
  g.strokeStyle = '#444';
  g.lineWidth = 1.5;
  const win = (x1, y1, x2, y2) => {
    const horiz = y1 === y2;
    for (const o of [-70, 0, 70]) {
      g.beginPath();
      if (horiz) { g.moveTo(px(x1), px(y1 + o)); g.lineTo(px(x2), px(y2 + o)); }
      else { g.moveTo(px(x1 + o), px(y1)); g.lineTo(px(x2 + o), px(y2)); }
      g.stroke();
    }
  };
  win(1000, 100, 2800, 100); win(4500, 100, 6500, 100); win(8000, 100, 9600, 100);
  win(10300, 5000, 10300, 7000); win(1000, 8200, 2600, 8200);

  // 문 (문짝 선 + 여닫는 호)
  const door = (hx, hy, len, startDeg, endDeg) => {
    g.beginPath();
    g.moveTo(px(hx), px(hy));
    const a0 = (startDeg * Math.PI) / 180, a1 = (endDeg * Math.PI) / 180;
    g.lineTo(px(hx + Math.cos(a0) * len), px(hy + Math.sin(a0) * len));
    g.arc(px(hx), px(hy), px(len), a0, a1);
    g.stroke();
  };
  g.lineWidth = 1.2;
  door(3600, 4100, 900, 180, 270);   // 안방
  door(3600, 4800, 900, 180, 90);    // 침실2
  door(8300, 3800, 900, 270, 180);   // 침실3
  door(5400, 5800, 800, 270, 180);   // 욕실
  door(6200, 8200, 900, 270, 360);   // 현관

  // 방 이름
  g.fillStyle = '#555';
  g.font = '600 20px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const label = (t, x, y) => g.fillText(t, px(x), px(y));
  label('안방', 1850, 2150); label('침실2', 1850, 6200); label('거실', 5400, 2900);
  label('침실3', 8750, 1950); label('주방', 8750, 6000); label('욕실', 4700, 7000); label('현관', 6650, 7500);

  // 치수선
  g.strokeStyle = '#777';
  g.fillStyle = '#333';
  g.lineWidth = 1;
  g.font = '15px sans-serif';
  const dimH = (x1, x2, y, text) => {
    g.beginPath();
    g.moveTo(px(x1), y); g.lineTo(px(x2), y);
    g.moveTo(px(x1), y - 6); g.lineTo(px(x1), y + 6);
    g.moveTo(px(x2), y - 6); g.lineTo(px(x2), y + 6);
    g.stroke();
    g.fillText(text, (px(x1) + px(x2)) / 2, y - 11);
  };
  const dimV = (y1, y2, x, text) => {
    g.beginPath();
    g.moveTo(x, px(y1)); g.lineTo(x, px(y2));
    g.moveTo(x - 6, px(y1)); g.lineTo(x + 6, px(y1));
    g.moveTo(x - 6, px(y2)); g.lineTo(x + 6, px(y2));
    g.stroke();
    g.save();
    g.translate(x - 12, (px(y1) + px(y2)) / 2);
    g.rotate(-Math.PI / 2);
    g.fillText(text, 0, 0);
    g.restore();
  };
  dimH(0, 10400, -60, '10,400');
  dimH(0, 3600, -30, '3,600'); dimH(3600, 7200, -30, '3,600'); dimH(7200, 10400, -30, '3,200');
  dimV(0, 8300, -60, '8,300');
  dimV(0, 4200, -30, '4,200'); dimV(4200, 8300, -30, '4,100');

  return { src: cv.toDataURL('image/png'), width: cv.width, height: cv.height, mmPerPx: SAMPLE_MM_PER_PX };
}
