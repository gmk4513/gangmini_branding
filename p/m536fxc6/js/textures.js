/* 캔버스로 그리는 텍스처들. 참고 그림(파스텔 주택가)의 색을 그대로 옮겨 왔다.
   그림 파일을 따로 두지 않아 받을 것이 없고, 크기를 마음대로 바꿀 수 있다. */
import * as THREE from "../vendor/three.module.min.js";

// 결정론적 난수 — 새로 고칠 때마다 동네가 바뀌지 않게
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}

function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// 부드러운 얼룩 (도로·흙·잔디의 물감 번진 느낌)
function blotches(g, w, h, r, n, colors, alpha, rand) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, rr = r * (0.4 + rand());
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    const col = colors[(rand() * colors.length) | 0];
    grd.addColorStop(0, col.replace("A", alpha));
    grd.addColorStop(1, col.replace("A", 0));
    g.fillStyle = grd;
    // 이음매 없이 반복되게 네 귀퉁이에도 같이 찍는다
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      g.save(); g.translate(ox, oy); g.fillRect(x - rr, y - rr, rr * 2, rr * 2); g.restore();
    }
  }
}

function speckle(g, w, h, n, colors, size, rand) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rand() * colors.length) | 0];
    const s = size * (0.5 + rand());
    g.fillRect(rand() * w, rand() * h, s, s);
  }
}

/* 아스팔트 — 참고 그림의 연보라 회색. 밝고 어두운 얼룩이 번져 있다 */
export function asphalt() {
  const [c, g] = canvas(512, 512), rand = rng(11);
  g.fillStyle = "#b9b7dd"; g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 70, 26, ["rgba(214,212,240,A)", "rgba(160,156,206,A)"], 0.55, rand);
  speckle(g, 512, 512, 2600, ["rgba(140,136,190,0.35)", "rgba(230,228,250,0.45)"], 2.2, rand);
  return tex(c, true);
}

/* 담장 블록 — 베이지 벽돌. 아래 띠가 조금 더 진하다 */
export function blockWall(kind) {
  const [c, g] = canvas(256, 128), rand = rng(kind === "gray" ? 5 : 3);
  const base = kind === "gray" ? "#c9ccc6" : "#ecd8a6";
  const line = kind === "gray" ? "#a9ada6" : "#cdb37a";
  const hi = kind === "gray" ? "#dadcd6" : "#f6e6bd";
  g.fillStyle = base; g.fillRect(0, 0, 256, 128);
  const rows = 4, bh = 128 / rows, bw = kind === "gray" ? 64 : 42;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 256 + bw; x += bw) {
      g.fillStyle = hi; g.fillRect(x + off + 2, r * bh + 2, bw - 4, 3);
      g.strokeStyle = line; g.lineWidth = 2;
      g.strokeRect(x + off + 1, r * bh + 1, bw - 2, bh - 2);
    }
  }
  speckle(g, 256, 128, 500, ["rgba(0,0,0,0.05)", "rgba(255,255,255,0.12)"], 2, rand);
  return tex(c, true);
}

/* 창문 — 흰 틀, 하늘색 유리에 사선 반사, 가운데 창살 */
export function windowTex() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#f7f7f4"; g.fillRect(0, 0, 128, 128);
  const grd = g.createLinearGradient(0, 10, 0, 118);
  grd.addColorStop(0, "#7fb4e6"); grd.addColorStop(1, "#cfe7fb");
  g.fillStyle = grd; g.fillRect(10, 10, 108, 108);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath(); g.moveTo(20, 118); g.lineTo(60, 10); g.lineTo(78, 10); g.lineTo(38, 118); g.fill();
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.beginPath(); g.moveTo(50, 118); g.lineTo(90, 10); g.lineTo(98, 10); g.lineTo(58, 118); g.fill();
  g.fillStyle = "#f7f7f4"; g.fillRect(61, 10, 6, 108);
  g.strokeStyle = "#8a8fa3"; g.lineWidth = 3; g.strokeRect(9, 9, 110, 110);
  return tex(c);
}

/* 덧창 — 갈색 나무 루버 */
export function shutterTex() {
  const [c, g] = canvas(64, 128);
  g.fillStyle = "#b07a40"; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 124; y += 7) {
    g.fillStyle = "#8a5a2b"; g.fillRect(4, y, 56, 2);
    g.fillStyle = "#c99358"; g.fillRect(4, y + 2, 56, 2);
  }
  g.strokeStyle = "#7a4c22"; g.lineWidth = 4; g.strokeRect(2, 2, 60, 124);
  return tex(c);
}

/* 잔디 */
export function grass() {
  const [c, g] = canvas(256, 256), rand = rng(21);
  g.fillStyle = "#92cd6c"; g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 40, 18, ["rgba(170,220,120,A)", "rgba(110,175,85,A)"], 0.6, rand);
  speckle(g, 256, 256, 900, ["rgba(70,140,60,0.35)", "rgba(200,240,150,0.4)"], 2, rand);
  return tex(c, true);
}

/* 놀이터 모래 */
export function sand() {
  const [c, g] = canvas(256, 256), rand = rng(31);
  g.fillStyle = "#ebc98e"; g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 40, 14, ["rgba(246,220,170,A)", "rgba(214,176,118,A)"], 0.5, rand);
  speckle(g, 256, 256, 1600, ["rgba(170,130,80,0.35)", "rgba(255,240,210,0.5)"], 1.6, rand);
  return tex(c, true);
}

/* 기찻길 자갈 */
export function gravel() {
  const [c, g] = canvas(256, 256), rand = rng(41);
  g.fillStyle = "#a59c92"; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 4000, ["#8c837a", "#bdb5ab", "#958b80", "#cfc8bf"], 3, rand);
  return tex(c, true);
}

/* 마당 흙바닥 (담장 안쪽) */
export function yard() {
  const [c, g] = canvas(256, 256), rand = rng(51);
  g.fillStyle = "#c9d79e"; g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 50, 14, ["rgba(220,226,170,A)", "rgba(160,190,120,A)"], 0.5, rand);
  return tex(c, true);
}

/* 호수 물 */
export function water() {
  const [c, g] = canvas(256, 256), rand = rng(61);
  g.fillStyle = "#86c7e8"; g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 50, 16, ["rgba(170,222,245,A)", "rgba(100,170,215,A)"], 0.6, rand);
  g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const x = rand() * 256, y = rand() * 256, w = 10 + rand() * 18;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke();
  }
  return tex(c, true);
}

/* 하늘 — 위는 맑은 파랑, 지평선 쪽은 연보라 */
export function sky() {
  const [c, g] = canvas(16, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, "#5aa7ef"); grd.addColorStop(0.45, "#9fd0f8");
  grd.addColorStop(0.5, "#d9e6fb"); grd.addColorStop(1, "#e9e3f6");
  g.fillStyle = grd; g.fillRect(0, 0, 16, 512);
  const t = tex(c); t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

/* 뭉게구름 한 덩이 (빌보드용) */
export function cloud(seed) {
  const [c, g] = canvas(256, 128), rand = rng(seed);
  for (let i = 0; i < 14; i++) {
    const x = 40 + rand() * 176, y = 70 + (rand() - 0.5) * 30, r = 18 + rand() * 26;
    const grd = g.createRadialGradient(x, y - r * 0.3, r * 0.2, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.75, "rgba(250,250,255,0.95)");
    grd.addColorStop(1, "rgba(235,240,255,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return tex(c);
}

/* 글자 표지판 */
export function label(text, opt = {}) {
  const w = opt.w || 512, h = opt.h || 128;
  const [c, g] = canvas(w, h);
  g.fillStyle = opt.bg || "#ffffff"; g.fillRect(0, 0, w, h);
  if (opt.border) { g.strokeStyle = opt.border; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); }
  g.fillStyle = opt.color || "#222";
  g.font = `900 ${opt.size || 64}px "Noto Sans KR", sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  const lines = String(text).split("\n");
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (opt.size || 64) * 1.1));
  return tex(c);
}

/* 동전 — 금색 원판 앞면 */
export function coinFace() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(50, 44, 6, 64, 64, 62);
  grd.addColorStop(0, "#fff6b8"); grd.addColorStop(0.5, "#ffd23a"); grd.addColorStop(1, "#e2a412");
  g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#c98a0a"; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#c98a0a"; g.font = "900 56px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("₩", 64, 68);
  return tex(c);
}

/* 셀 셰이딩 단계 — 밝은 면·중간·그늘 세 단계. 그늘도 너무 어둡지 않게(애니 배경 톤) */
export function toonRamp() {
  const d = new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
