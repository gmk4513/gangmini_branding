/* 캔버스로 그리는 텍스처 (그림 파일 없이). 동네 분위기는 맵 구조 레퍼런스의 밝은 파스텔. */
import * as THREE from "../vendor/three.module.min.js";

function make(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const noise = (g, w, h, n, a, colors) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.globalAlpha = a * Math.random();
    const s = 1 + Math.random() * 2.5;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
};

export const asphalt = () => make(512, 512, (g, w, h) => {
  g.fillStyle = "#6d7178"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 14000, 0.5, ["#55585f", "#7f838b", "#62656c", "#8b8f96"]);
}, [1, 1]);

export const grass = () => make(512, 512, (g, w, h) => {
  g.fillStyle = "#8fca55"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 9000, 0.45, ["#7dbb46", "#a2d765", "#6fae3e", "#b4e07a"]);
}, [1, 1]);

export const pavers = () => make(256, 256, (g, w, h) => {
  g.fillStyle = "#c9b7ae"; g.fillRect(0, 0, w, h);
  const cols = ["#ecd9d2", "#f3e4dc", "#e6cfc9", "#efdcd0", "#e2cdc6"];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  }
}, [1, 1]);

export const plaza = () => make(512, 512, (g, w, h) => {
  g.fillStyle = "#d9c9bd"; g.fillRect(0, 0, w, h);
  const cols = ["#f1e6da", "#e9dccf", "#f5ecdf", "#e0cfc1"];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  }
}, [1, 1]);

export const sand = () => make(512, 512, (g, w, h) => {
  g.fillStyle = "#e0b47c"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 16000, 0.4, ["#cf9f64", "#edc792", "#d6a970", "#f3d4a6"]);
}, [1, 1]);

export const water = () => make(512, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, "#3fb4ea"); gr.addColorStop(1, "#2e9bdc");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(255,255,255,.34)"; g.lineCap = "round";
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w, y = Math.random() * h, l = 8 + Math.random() * 26;
    g.lineWidth = 1 + Math.random() * 1.6;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 3, x + l, y); g.stroke();
  }
}, [1, 1]);

/* 창문이 격자로 있는 벽. cols×rows 칸 */
export function windows(base, frame, glass, cols, rows, opts = {}) {
  return make(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.18, y = r * ch + ch * 0.2, ww = cw * 0.64, hh = ch * 0.56;
      g.fillStyle = frame; g.fillRect(x - 2, y - 2, ww + 4, hh + 4);
      const gg = g.createLinearGradient(x, y, x + ww, y + hh);
      gg.addColorStop(0, glass); gg.addColorStop(1, "#d8f0fa");
      g.fillStyle = gg; g.fillRect(x, y, ww, hh);
      g.fillStyle = frame; g.fillRect(x + ww / 2 - 1, y, 2, hh);
      if (opts.balcony) { g.fillStyle = opts.balcony; g.fillRect(c * cw + 2, y + hh + 1, cw - 4, ch * 0.08); }
    }
  });
}

/* 가게 앞면: 위 간판 + 줄무늬 차양 + 큰 유리 */
export function shopFront(color, stripe, name) {
  return make(512, 256, (g, w, h) => {
    g.fillStyle = "#efe6da"; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(0, 22, w, 56);
    g.fillStyle = "#fff"; g.font = "900 38px 'Noto Sans KR',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(name, w / 2, 51);
    const n = 12;
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? "#fff" : stripe; g.fillRect(i * w / n, 82, w / n, 34); }
    g.fillStyle = "#223"; g.fillRect(14, 118, w - 28, 134);
    const gg = g.createLinearGradient(0, 118, w, 252);
    gg.addColorStop(0, "#8fd0ea"); gg.addColorStop(1, "#d9f2fb");
    g.fillStyle = gg;
    g.fillRect(20, 124, w * 0.37, 124); g.fillRect(w * 0.59, 124, w * 0.37, 124);
    g.fillStyle = "#47311f"; g.fillRect(w * 0.42, 124, w * 0.16, 128);
    g.fillStyle = "#ffe08a"; g.fillRect(w * 0.54, 186, 8, 8);
  });
}

/* 학교 벽돌 + 넓은 창 */
export const brick = (cols, rows) => make(512, 256, (g, w, h) => {
  g.fillStyle = "#c87f5c"; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 7) for (let x = (y / 7) % 2 ? 0 : -8; x < w; x += 16) {
    g.fillStyle = ["#c47a57", "#cf8866", "#b96f4e"][(Math.random() * 3) | 0];
    g.fillRect(x, y, 15, 6);
  }
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    g.fillStyle = "#ecdfd0"; g.fillRect(0, r * ch + ch * 0.82, w, ch * 0.1);
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.1, y = r * ch + ch * 0.18;
      g.fillStyle = "#f4f4f0"; g.fillRect(x - 2, y - 2, cw * 0.8 + 4, ch * 0.6 + 4);
      const gg = g.createLinearGradient(x, y, x, y + ch * 0.6);
      gg.addColorStop(0, "#6fb8da"); gg.addColorStop(1, "#bfe4f2");
      g.fillStyle = gg; g.fillRect(x, y, cw * 0.8, ch * 0.6);
      g.fillStyle = "#f4f4f0"; g.fillRect(x + cw * 0.4 - 1, y, 2, ch * 0.6);
    }
  }
});

export const clockFace = () => make(128, 128, (g) => {
  g.fillStyle = "#fff"; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
  g.lineWidth = 5; g.strokeStyle = "#333"; g.stroke();
  g.lineWidth = 6; g.lineCap = "round";
  g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 24); g.moveTo(64, 64); g.lineTo(90, 76); g.stroke();
});

/* 경찰서 간판 — 파란 판에 글자와 별 (실제 경찰 로고는 쓰지 않는다) */
export const policeSign = () => make(1024, 200, (g, w, h) => {
  g.fillStyle = "#1f3f93"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#f6c52e"; g.font = "900 110px 'Noto Sans KR',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("★", 140, h / 2);
  g.fillStyle = "#fff"; g.font = "900 104px 'Noto Sans KR',sans-serif";
  g.fillText("경 찰 서   POLICE", w / 2 + 70, h / 2 + 6);
});

/* 축구장 선 */
export const fieldLines = () => make(1024, 640, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = "#fff"; g.lineWidth = 7;
  g.strokeRect(24, 24, w - 48, h - 48);
  g.beginPath(); g.moveTo(w / 2, 24); g.lineTo(w / 2, h - 24); g.stroke();
  g.beginPath(); g.arc(w / 2, h / 2, 90, 0, 7); g.stroke();
  g.strokeRect(24, h / 2 - 150, 150, 300); g.strokeRect(w - 174, h / 2 - 150, 150, 300);
  g.strokeRect(24, h / 2 - 70, 60, 140); g.strokeRect(w - 84, h / 2 - 70, 60, 140);
});

/* 분수 광장 무늬 — 동심원 */
export const plazaRings = () => make(1024, 1024, (g, w) => {
  g.clearRect(0, 0, w, w);
  const c = w / 2;
  const rings = [[500, "#dcc9b8"], [420, "#f0e3d3"], [340, "#e4d2c0"], [260, "#f4eadc"], [180, "#e2cfbd"]];
  for (const [r, col] of rings) { g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill(); }
  g.strokeStyle = "rgba(170,140,120,.5)"; g.lineWidth = 2;
  for (let a = 0; a < 72; a++) {
    const t = a / 72 * Math.PI * 2;
    g.beginPath(); g.moveTo(c + Math.cos(t) * 180, c + Math.sin(t) * 180); g.lineTo(c + Math.cos(t) * 500, c + Math.sin(t) * 500); g.stroke();
  }
  for (const r of [180, 220, 260, 300, 340, 380, 420, 460, 500]) { g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke(); }
});

/* 말·빛 스프라이트용 둥근 빛 */
export const glow = () => {
  const t = make(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  return t;
};

/* 차를 코드로 그릴 때 쓰는 옆면 무늬 — 경찰 파랑 띠 */
export const policeDoor = () => make(512, 128, (g, w, h) => {
  g.fillStyle = "#f2f3f5"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#1f3f93"; g.fillRect(0, 24, w, 34);
  g.fillStyle = "#f2c12e"; g.fillRect(0, 58, w, 8);
  g.fillStyle = "#1f3f93"; g.font = "900 46px 'Noto Sans KR',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("경찰  POLICE", w / 2, 96);
});
