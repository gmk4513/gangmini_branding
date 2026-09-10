"use strict";
/* ============================================================
   에셋
   ============================================================ */
const SRC = {
  idle:   "assets/sprites/idle.png",
  crawl:  "assets/sprites/crawl2.png",
  hit:    "assets/sprites/hit.png",
  b1:     "assets/sprites/home1.png",
  b2:     "assets/sprites/home2.png",
  b3:     "assets/sprites/home3.png",
  bgFar:  "assets/bg/bg_far.png",
  bgStrip:"assets/bg/bg_strip.png",
  block:  "assets/sprites/block.png",
  flex:   "assets/sprites/flex.png",
  rb1:    "assets/sprites/rb1.png",
  rb2:    "assets/sprites/rb2.png",
  rb3:    "assets/sprites/rb3.png",
  rcrawl: "assets/sprites/rcrawl.png",
  overbg: "assets/bg/overbg.png",
  fhuman: "assets/sprites/fhuman.png",
  frobot: "assets/sprites/frobot.png"
};
const IMG = {};
let assetsReady = false;

function loadAssets(){
  const keys = Object.keys(SRC);
  let n = 0;
  return new Promise(res=>{
    keys.forEach(k=>{
      const im = new Image();
      im.onload = im.onerror = ()=>{ if(++n===keys.length){ assetsReady=true; res(); } };
      im.src = SRC[k];
      IMG[k]=im;
    });
  });
}

/* ============================================================
   말풍선 대사 — 나중에 이 배열만 교체하면 됩니다
   ============================================================ */
const LINES = [
  "아파트는 뭐 로보트가 짓는줄아냐?",
  "니네가 왜 노인들보다 못해?",
  "그렇게 일하기가 싫으냐?",
  "내가 여기있는 사람들 모두 일자리를 뺏어버릴거다!",
  "건강하지, 젊지, 돈 벌며는 고마운거야~",
  "그게 그렇게 두려워 너네는?",
  "60살 할배를 못이겨?"
];

/* ============================================================
   게임 상수
   ============================================================ */
const VH = 900;              // 가상 세로 해상도
const BLOCK_W = 102, BLOCK_H = 51;   // 3x3 타일 (타일 크기 유지, 한 단 추가)
const STEP_X = 92, STEP_Y = 44;      // 세로 7px 겹침 → 계단이 끊기지 않음
const CHAR_H = 190;
const LEAD_MAX = 14;         // 로봇과 벌릴 수 있는 최대 거리(블록). 12.2칸 이상이어야 화면 밖
const LEAD_START = 14;
const ROBOT_V0 = 1.45;       // 블록/초
const ROBOT_K  = 0.019;      // 층당 가속
const ROBOT_VMAX = 9.0;
const HOP_MS = 95;
const BASE = 30;             // 시작 지점 아래로도 탑을 만들어 둔다 (로봇이 딛고 올라올 자리)

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let cw=0, ch=0, dpr=1, sc=1, VW=560;

function resize(){
  const st = document.getElementById('stage');
  cw = st.clientWidth; ch = st.clientHeight;
  dpr = Math.min(window.devicePixelRatio||1, 2);
  cv.width = Math.round(cw*dpr); cv.height = Math.round(ch*dpr);
  sc = cv.height / VH;
  VW = cv.width / sc;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize,120));

/* ============================================================
   상태
   ============================================================ */
let S = null;
let mode = 'title';   // title | play | over
let last = 0;

function makeDirs(n, seedArr){
  const a = seedArr ? seedArr.slice() : [];
  while(a.length < n){
    // 처음 6칸은 같은 방향으로 완만하게 시작
    if(a.length < 6) a.push(1);
    else a.push(Math.random() < 0.5 ? -1 : 1);
  }
  return a;
}

function colOf(i){
  // dirs[k] = 블록 k-1 -> k 로 가는 방향
  return S.cols[i];
}

function extend(upto){
  while(S.dirs.length <= upto){
    const i = S.dirs.length;
    // 플레이어가 처음 밟는 5칸만 완만하게, 나머지는 무작위
    S.dirs.push((i>BASE && i<=BASE+5) ? 1 : (Math.random()<0.5?-1:1));
  }
  while(S.cols.length <= upto){
    const i = S.cols.length;
    S.cols.push(S.cols[i-1] + S.dirs[i]);
  }
}

function newGame(){
  S = {
    dirs:[0], cols:[0],
    idx:BASE, facing:1,
    animIdx:0,
    hopT:1, hopFrom:{x:0,y:0}, hopTo:{x:0,y:0},
    robot:BASE-LEAD_START,
    camX:0, camY:0, camInit:false,
    score:0, best:0,
    bubble:null, lineIdx:0, nextBubbleAt: 8 + (Math.random()*10|0),
    dead:false, deadReason:'', deadT:0, missNeed:1,
    fallV:0, fallY:0, shake:0,
    t:0, dust:[]
  };
  extend(BASE+50);
  mode='play';
  document.getElementById('btns').style.display='flex';
}

function worldOf(i){ return { x: S.cols[i]*STEP_X, y: i*STEP_Y }; }

function step(dir){
  if(mode!=='play' || S.dead) return;
  S.facing = dir;
  const need = S.dirs[S.idx+1];
  if(dir === need){
    // 성공
    const from = worldOf(S.idx);
    S.idx++;
    extend(S.idx+40);
    const to = worldOf(S.idx);
    S.hopFrom = from; S.hopTo = to; S.hopT = 0;
    S.animIdx = (S.animIdx+1)%3;
    S.score = S.idx - BASE;
    for(let k=0;k<3;k++) S.dust.push({x:from.x+(Math.random()*60-30),y:from.y,vx:(Math.random()*60-30),vy:40+Math.random()*50,life:0.45,max:0.45});
    if(S.score >= S.nextBubbleAt){
      S.bubble = { text: LINES[S.lineIdx % LINES.length], t: 2.3 };
      S.lineIdx++;
      S.nextBubbleAt = S.score + 10 + (Math.random()*16|0);
    }
  } else {
    S.missNeed = need;
    die('wall');
  }
}

function die(reason){
  if(S.dead) return;
  S.dead = true; S.deadReason = reason; S.deadT = 0; S.shake = 1;
  S.bubble = null;
  document.getElementById('btns').style.display='none';
}

/* ============================================================
   입력
   ============================================================ */
const ctrlMode = 'rel';   // TURN / CLIMB 고정

function leftBtn(){  step(-S.facing); }   // TURN
function rightBtn(){ step( S.facing); }   // CLIMB

function bind(el, fn){
  el.addEventListener('pointerdown', e=>{ e.preventDefault(); fn(); }, {passive:false});
}
bind(document.getElementById('bTurn'),  leftBtn);
bind(document.getElementById('bClimb'), rightBtn);
window.addEventListener('keydown', e=>{
  const isTurn  = (e.code==='Space' || e.key===' ');
  const isClimb = (e.key==='ArrowRight');
  if(!isTurn && !isClimb) return;
  e.preventDefault();              // 스페이스 스크롤 / 버튼 click 중복 방지
  if(e.repeat) return;             // 키를 누르고 있어도 자동 연타되지 않도록
  if(mode!=='play') return;
  if(isTurn) leftBtn(); else rightBtn();
}, {passive:false});

/* ============================================================
   홈 화면 장면
   ============================================================ */
const HOME_LINE_A = "아파트는 뭐 로보트가 짓는 줄 아냐?";
const HOME_LINES_B = [
  "니네가 왜 노인들보다 못해?",
  "그렇게 일하기가 싫으냐?",
  "내가 여기 있는 사람들 모두 일자리를 뺏어버릴 거다!",
  "건강하지, 젊지, 돈 벌면은 고마운 거야~",
  "그게 그렇게 두려워 너네는?",
  "60살 할배를 못 이겨?"
];
const HOME_FRAMES = [['b1',0.40],['b2',0.40],['b3',0.55]];   // 게임과 동일 프레임(벽돌 포함)
const HOME_HOLD = 3.2;

const H = { t:0, fi:0, ft:0, bi:0, bt:0 };

function updateHome(dt){
  H.t += dt;
  H.ft += dt;
  if(H.ft >= HOME_FRAMES[H.fi][1]){ H.ft = 0; H.fi = (H.fi+1)%HOME_FRAMES.length; }
  H.bt += dt;
  if(H.bt >= HOME_HOLD){ H.bt = 0; H.bi = (H.bi+1)%HOME_LINES_B.length; }
}

function wrapText(text, maxW){
  const words = text.split(' ');
  const lines = []; let cur = '';
  for(const w of words){
    const t = cur ? cur+' '+w : w;
    if(ctx.measureText(t).width > maxW && cur){ lines.push(cur); cur = w; }
    else cur = t;
  }
  if(cur) lines.push(cur);
  return lines;
}

function bubbleAt(cx, bottomY, text, maxW, alpha, fs){
  ctx.font = '700 '+fs+'px system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif';
  const lines = wrapText(text, maxW);
  const lh = fs*1.32;
  const tw = Math.max(...lines.map(l=>ctx.measureText(l).width));
  const w = tw+34, h = lines.length*lh+24;
  let x = cx-w/2;
  x = Math.max(10, Math.min(VW-w-10, x));            // 화면 밖으로 안 나가게
  const tipX = Math.max(x+22, Math.min(x+w-22, cx));
  const y = bottomY-h;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle='#fff'; ctx.strokeStyle='#20242f'; ctx.lineWidth=4;
  const r=14;
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(tipX+11,y+h); ctx.lineTo(tipX,y+h+15); ctx.lineTo(tipX-11,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#20242f'; ctx.textAlign='center'; ctx.textBaseline='middle';
  lines.forEach((l,i)=> ctx.fillText(l, x+w/2, y+12+lh*(i+0.5)));
  ctx.restore();
  return y;
}

// 두 캐릭터의 원본 배치 (누끼 전 장면 기준)
const OVER_LINE = '내가 여기있는 사람들 모두 일자리를 뺏어버릴거다!';
const FGT = { UW:422, UH:293,
  parts:[ {k:'fhuman', ox:0,   oy:15, w:227, h:279, ph:0.0 },
          {k:'frobot', ox:234, oy:0,  w:188, h:292, ph:2.3 } ] };
// 결과 화면 배경(노인 인부는 배경에 이미 그려져 있음) 안에서 비어 있는 평평한 바닥 위치
const SCENE = {
  anchorX : 0.45,   // 배경의 이 가로 지점이 화면 중앙에 오도록 맞춘다
  figCX   : 0.368,  // 싸우는 두 캐릭터의 가로 중심 (노인들 사이 빈 바닥)
  figGY   : 0.86,   // 발이 닿는 바닥선
  figW    : 0.41    // 가로 폭 — 왼쪽 파이프 노인과 오른쪽 벽돌 노인 사이에 딱 들어간다
};

function drawOver(){
  ctx.fillStyle='#171310'; ctx.fillRect(0,0,VW,VH);
  const bg=IMG.overbg;
  let bgX=0, bgW=VW, bgH=VH;
  if(bg && bg.width){
    const s2=Math.max(VW/bg.width, VH/bg.height);
    bgW=bg.width*s2; bgH=bg.height*s2;
    bgX=VW/2 - SCENE.anchorX*bgW;                 // 위쪽은 자르지 않고 상단에 붙인다
    const figL = bgX + (SCENE.figCX - SCENE.figW/2)*bgW;
    if(figL < 6) bgX += (6 - figL);               // 아주 좁은 화면에서도 캐릭터가 잘리지 않게
    ctx.drawImage(bg, bgX, 0, bgW, bgH);
    if(bgH < VH) ctx.drawImage(bg,0,bg.height-2,bg.width,2,bgX,bgH-1,bgW,VH-bgH+1);
  }
  let g=ctx.createLinearGradient(0,0,0,VH*0.28);
  g.addColorStop(0,'rgba(9,12,19,.78)'); g.addColorStop(1,'rgba(9,12,19,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH*0.28);
  g=ctx.createLinearGradient(0,VH*0.24,0,VH*0.62);
  g.addColorStop(0,'rgba(9,12,19,0)'); g.addColorStop(.5,'rgba(9,12,19,.44)'); g.addColorStop(1,'rgba(9,12,19,0)');
  ctx.fillStyle=g; ctx.fillRect(0,VH*0.24,VW,VH*0.38);

  // 싸우는 두 캐릭터 — 빈 바닥 위, 서로 다른 박자로 숨쉬기
  const wFig = SCENE.figW*bgW;
  const scale = wFig/FGT.UW;
  const groundY = SCENE.figGY*bgH;
  const X0 = bgX + SCENE.figCX*bgW - wFig/2;
  const Y0 = groundY - FGT.UH*scale;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.26)';
  ctx.beginPath(); ctx.ellipse(X0+wFig/2, groundY-2, wFig*0.40, 7, 0,0,Math.PI*2); ctx.fill();
  ctx.restore();
  for(const p of FGT.parts){
    const im=IMG[p.k]; if(!im || !im.width) continue;
    const br = 1 + Math.sin(H.t*1.35 + p.ph)*0.014;
    const bob = Math.sin(H.t*1.35 + p.ph + 0.6)*2.0;
    const ccx = X0 + (p.ox + p.w/2)*scale;
    const by = Y0 + (p.oy + p.h)*scale;
    const w = p.w*scale*br, h = p.h*scale*br;
    ctx.drawImage(im, ccx-w/2, by-h+bob, w, h);
  }
  // 사람 캐릭터 머리 위 말풍선
  const hp = FGT.parts[0];
  bubbleAt(X0 + (hp.ox + hp.w/2)*scale, Y0 + hp.oy*scale - 6,
           OVER_LINE, VW*0.58, 1, VW<470?15:17);
}

function drawHome(){
  ctx.fillStyle='#0d1017'; ctx.fillRect(0,0,VW,VH);
  const GY = VH*0.965;                                 // 캐릭터 발밑(화면 맨 아래)

  // 배경: 화면 전체를 덮고, 사진 아래쪽(공사장 바닥)을 화면 바닥에 맞춤
  const far = IMG.bgFar;
  if(far && far.width){
    const s = Math.max(VW/far.width, VH/far.height) * 1.02;
    const w = far.width*s, h = far.height*s;
    ctx.drawImage(far, (VW-w)/2, VH-h, w, h);
  }
  // 위쪽: 타이틀 가독성용 스크림
  let g = ctx.createLinearGradient(0,0,0,VH*0.22);
  g.addColorStop(0,'rgba(9,12,19,.78)'); g.addColorStop(1,'rgba(9,12,19,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH*0.22);
  // 가운데: 버튼 뒤 살짝만 눌러주기(패널처럼 보이지 않게)
  g = ctx.createLinearGradient(0,VH*0.16,0,VH*0.58);
  g.addColorStop(0,'rgba(9,12,19,0)'); g.addColorStop(.45,'rgba(9,12,19,.34)'); g.addColorStop(1,'rgba(9,12,19,0)');
  ctx.fillStyle=g; ctx.fillRect(0,VH*0.16,VW,VH*0.42);
  // 아래쪽: 바닥 쪽만 은은하게 어둡게(캐릭터 실루엣 살리기)
  g = ctx.createLinearGradient(0,VH*0.72,0,VH);
  g.addColorStop(0,'rgba(9,12,19,0)'); g.addColorStop(1,'rgba(9,12,19,.55)');
  ctx.fillStyle=g; ctx.fillRect(0,VH*0.72,VW,VH*0.28);

  const x1 = VW*0.25, x2 = VW*0.75;
  const bob = Math.sin(H.t*1.9)*3;

  ctx.fillStyle='rgba(0,0,0,.38)';
  ctx.beginPath(); ctx.ellipse(x1, GY+3, 76, 13, 0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x2, GY+3, 62, 12, 0,0,Math.PI*2); ctx.fill();

  drawImgH(IMG.flex, x1, GY+bob, 252, false);
  // 세 프레임 모두 동일 캔버스(캐릭터 중심·발 높이 정렬)이므로 높이 하나로 충분
  drawImgH(IMG[HOME_FRAMES[H.fi][0]], x2, GY+2, 242, false);

  const fs   = VW<470 ? 17 : 20;
  const maxW = VW*0.36;
  bubbleAt(x1, GY-264, HOME_LINE_A, maxW, 1, fs);
  const fade = Math.min(1, H.bt*4, (HOME_HOLD-H.bt)*4);
  bubbleAt(x2, GY-248, HOME_LINES_B[H.bi], maxW, Math.max(0,fade), fs);
}

/* ============================================================
   업데이트
   ============================================================ */
function update(dt){
  if(mode==='title'){ updateHome(dt); return; }
  if(mode==='over'){ H.t += dt; return; }
  if(mode!=='play') return;
  S.t += dt;

  if(!S.dead){
    // 로봇 전진
    const v = Math.min(ROBOT_VMAX, ROBOT_V0 + S.score*ROBOT_K);
    S.robot += v*dt;
    if(S.idx - S.robot > LEAD_MAX) S.robot = S.idx - LEAD_MAX;
    if(S.robot >= S.idx - 0.02) die('robot');
  } else {
    S.deadT += dt;
    if(S.deadReason==='wall'){ S.fallV += 1900*dt; S.fallY += S.fallV*dt; }
    else { S.robot += 1.6*dt; }
    if(S.deadT > 1.15 && mode==='play'){ mode='over'; showOver(); }
  }

  // 홉 보간
  if(S.hopT < 1){ S.hopT = Math.min(1, S.hopT + dt*1000/HOP_MS); }

  // 말풍선
  if(S.bubble){ S.bubble.t -= dt; if(S.bubble.t<=0) S.bubble=null; }

  // 먼지
  for(let i=S.dust.length-1;i>=0;i--){
    const p=S.dust[i]; p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy-=90*dt;
    if(p.life<=0) S.dust.splice(i,1);
  }

  // 카메라
  const pp = playerPos();
  if(!S.camInit){ S.camX=pp.x; S.camY=pp.y; S.camInit=true; }
  const k = Math.min(1, dt*13);
  S.camX += (pp.x - S.camX)*k;
  S.camY += (pp.y - S.camY)*k;
  if(S.shake>0) S.shake = Math.max(0, S.shake - dt*2.2);
}

function playerPos(){
  if(S.hopT>=1){ const w=worldOf(S.idx); return {x:w.x,y:w.y - (S.dead&&S.deadReason==='wall'?S.fallY:0)}; }
  const t=S.hopT, e=t*t*(3-2*t);
  return {
    x: S.hopFrom.x + (S.hopTo.x-S.hopFrom.x)*e,
    y: S.hopFrom.y + (S.hopTo.y-S.hopFrom.y)*e + Math.sin(t*Math.PI)*5
  };
}

/* ============================================================
   그리기
   ============================================================ */
function sx(wx){ return VW/2 + (wx - S.camX); }
function sy(wy){ return VH*0.63 - (wy - S.camY); }

function drawImgH(im, cx, bottomY, h, flip){
  if(!im || !im.width) return;
  const w = im.width * (h/im.height);
  ctx.save();
  ctx.translate(cx, bottomY);
  if(flip) ctx.scale(-1,1);
  ctx.drawImage(im, -w/2, -h, w, h);
  ctx.restore();
}

function drawBG(){
  ctx.fillStyle='#8fa4bb';
  ctx.fillRect(0,0,VW,VH);
  // 원경(고정)
  const far=IMG.bgFar;
  if(far && far.width){
    const s=Math.max(VW/far.width, VH/far.height);
    const w=far.width*s, h=far.height*s;
    ctx.globalAlpha=1;
    ctx.drawImage(far,(VW-w)/2,(VH-h)/2 - 30,w,h);
  }
  // 중경(패럴랙스 스크롤 + 세로 무한 타일)
  const st=IMG.bgStrip;
  if(st && st.width){
    const s=VW/st.width*1.25;
    const w=st.width*s, h=st.height*s;
    const off=((-S.camY*0.28)%h+h)%h;
    ctx.globalAlpha=0.62;
    for(let y=off-h; y<VH+h; y+=h) ctx.drawImage(st,(VW-w)/2,y,w,h);
    ctx.globalAlpha=1;
  }
  // 안개 그라디언트(위로 갈수록 밝게)
  // 배경을 눌러 블록과 명도 차를 벌린다 (블록 밝은면 185 vs 배경 90 안팎)
  const g=ctx.createLinearGradient(0,0,0,VH);
  g.addColorStop(0,'rgba(40,54,78,.30)');
  g.addColorStop(0.5,'rgba(30,40,60,.40)');
  g.addColorStop(1,'rgba(14,18,30,.58)');
  ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);
}

function drawBlock(i){
  const w=worldOf(i);
  const X=sx(w.x), Y=sy(w.y);
  if(Y<-BLOCK_H*3 || Y>VH+BLOCK_H*4) return;
  const bx=X-BLOCK_W/2;
  ctx.fillStyle='rgba(0,0,0,.30)';
  ctx.fillRect(bx+5, Y+BLOCK_H, BLOCK_W, 7);
  const im=IMG.block;
  if(im && im.width) ctx.drawImage(im, bx, Y, BLOCK_W, BLOCK_H);
  else { ctx.fillStyle='#8f959f'; ctx.fillRect(bx,Y,BLOCK_W,BLOCK_H); }
  ctx.fillStyle='rgba(255,255,255,.22)'; ctx.fillRect(bx+2,Y+1,BLOCK_W-4,2);
  ctx.strokeStyle='rgba(8,11,18,.9)'; ctx.lineWidth=2;
  ctx.strokeRect(bx+1,Y+1,BLOCK_W-2,BLOCK_H-2);
}

const ROBOT_H = 202;

function drawRobot(){
  const ri = S.robot;
  const i0 = Math.max(0, Math.floor(ri));
  const f = ri - Math.floor(ri);
  const a = worldOf(Math.min(i0, S.cols.length-1));
  const b = worldOf(Math.min(i0+1, S.cols.length-1));
  const wx = a.x + (b.x-a.x)*f, wy = a.y + (b.y-a.y)*f;
  const X=sx(wx), Y=sy(wy);

  if(Y > VH + ROBOT_H){
    const lead = S.idx - S.robot;
    const al = Math.max(.25, 1 - lead/LEAD_MAX);
    ctx.save();
    ctx.globalAlpha = al*(0.55+0.45*Math.abs(Math.sin(S.t*6)));
    ctx.fillStyle='#ff4d2e';
    ctx.beginPath();
    ctx.moveTo(X, VH-26); ctx.lineTo(X-26, VH-64); ctx.lineTo(X+26, VH-64);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    return;
  }

  // 플레이어와 같은 모션 구성: 칸 사이 이동 = 기어오르기, 칸 위 = 블록 쌓기 3프레임
  // 칸에 올라선 직후 웅크렸다가 펴고, 다음 칸으로 기어오른다
  // rcrawl 은 원본 스케일이 rb 프레임의 0.856배라 높이를 따로 보정
  let im, h=ROBOT_H;
  if(f < 0.20){ im = IMG.rb1; }
  else if(f < 0.38){ im = IMG.rb2; }
  else if(f < 0.58){ im = IMG.rb3; }
  else { im = IMG.rcrawl; h = ROBOT_H*0.995; }
  const dir = S.dirs[Math.min(i0+1, S.dirs.length-1)] || 1;

  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.34)';
  ctx.beginPath(); ctx.ellipse(X, Y+4, 46, 9, 0,0,Math.PI*2); ctx.fill();
  // 가까워지면 붉은 기운
  const lead = Math.max(0, S.idx - S.robot);
  if(lead < LEAD_MAX*0.4){
    const g=ctx.createRadialGradient(X, Y-h*0.55, 10, X, Y-h*0.55, h*0.85);
    const k=(1-lead/(LEAD_MAX*0.4))*0.5;
    g.addColorStop(0,'rgba(255,60,40,'+k.toFixed(3)+')');
    g.addColorStop(1,'rgba(255,60,40,0)');
    ctx.fillStyle=g; ctx.fillRect(X-h, Y-h*1.5, h*2, h*1.6);
  }
  ctx.restore();
  drawImgH(im, X, Y+2, h, dir<0);
}

function drawPlayer(){
  const p = playerPos();
  const X=sx(p.x), Y=sy(p.y);
  // 발밑 방향 표시 (TURN/CLIMB 모드에서 지금 보고 있는 방향)
  if(!S.dead && ctrlMode==='rel'){
    const d=S.facing, ax=X+d*46, ay=Y-8;
    ctx.save();
    ctx.globalAlpha=0.9;
    ctx.fillStyle='#ffd257'; ctx.strokeStyle='#4a3200'; ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(ax+d*17, ay); ctx.lineTo(ax-d*7, ay-13); ctx.lineTo(ax-d*7, ay+13);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  let im, h=CHAR_H;
  if(S.dead){ im = IMG.hit; h = CHAR_H*0.95; }
  else if(S.hopT<1){ im = IMG.crawl; h = CHAR_H*0.82; }   // 칸 이동 중에는 기어오르기
  else { im = [IMG.b1, IMG.b2, IMG.b3][S.animIdx]; }      // 벽돌 포함, 세 프레임 동일 캔버스
  if(!im) im = IMG.idle;
  drawImgH(im, X, Y+2, h, S.facing<0);
}

function drawBubble(){
  if(!S.bubble) return;
  const p=playerPos();
  const X=sx(p.x), Y=sy(p.y)-CHAR_H-14;
  const a=Math.min(1, S.bubble.t*3);
  bubbleAt(X, Y, S.bubble.text, VW*0.62, a, VW<470?19:22);
}

function drawHUD(){
  const lead = Math.max(0, S.idx - S.robot);
  const r = Math.max(0, Math.min(1, lead/LEAD_MAX));
  const pad=26, barW=VW-pad*2, barH=26, y=30;
  // 게이지 배경
  ctx.fillStyle='rgba(10,14,22,.62)';
  roundRect(pad-4, y-4, barW+8, barH+8, 8); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.10)';
  roundRect(pad, y, barW, barH, 6); ctx.fill();
  // 채움
  const col = r>0.5 ? '#4ad07a' : (r>0.25 ? '#ffc53d' : '#ff4d2e');
  ctx.fillStyle=col;
  roundRect(pad, y, Math.max(4, barW*r), barH, 6); ctx.fill();
  // 위험 점멸
  if(r<0.25){
    ctx.globalAlpha=0.35*Math.abs(Math.sin(S.t*9));
    ctx.fillStyle='#ff4d2e'; roundRect(pad,y,barW,barH,6); ctx.fill();
    ctx.globalAlpha=1;
  }
  // 라벨
  ctx.font='800 19px system-ui,-apple-system,sans-serif';
  ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillStyle='rgba(255,255,255,.92)';
  ctx.fillText('🤖 '+lead.toFixed(1)+' 칸', pad+10, y+barH/2+1);

  // 점수
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.font='900 74px system-ui,-apple-system,sans-serif';
  ctx.lineWidth=8; ctx.strokeStyle='rgba(10,14,22,.75)';
  ctx.strokeText(S.score, VW/2, y+44);
  ctx.fillStyle='#fff'; ctx.fillText(S.score, VW/2, y+44);
  ctx.font='800 20px system-ui,-apple-system,sans-serif';
  ctx.strokeText('층', VW/2, y+124); ctx.fillStyle='rgba(255,255,255,.85)';
  ctx.fillText('층', VW/2, y+124);
}

function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

function draw(){
  ctx.setTransform(sc,0,0,sc,0,0);
  ctx.imageSmoothingEnabled=false;
  if(mode==='title' || !S){ drawHome(); return; }
  if(mode==='over'){ drawOver(); return; }

  ctx.save();
  if(S.shake>0){
    const m=S.shake*11;
    ctx.translate((Math.random()*2-1)*m,(Math.random()*2-1)*m);
  }
  drawBG();

  const lo=Math.max(0, S.idx-24), hi=S.idx+26;
  extend(hi+2);
  for(let i=lo;i<=hi;i++) drawBlock(i);

  // 먼지
  for(const p of S.dust){
    const X=sx(p.x), Y=sy(p.y);
    ctx.globalAlpha=Math.max(0,p.life/p.max)*0.55;
    ctx.fillStyle='#d9d2c4';
    ctx.fillRect(X-5,Y-5,10,10);
  }
  ctx.globalAlpha=1;

  drawRobot();
  drawPlayer();
  drawBubble();
  drawHUD();
  ctx.restore();
}

function loop(ts){
  // 다음 프레임을 먼저 잡아 둔다. 아래에서 예외가 나도 루프가 끊기지 않는다.
  // 끝에서 잡으면 update/draw 의 오류 하나가 게임을 영구히 멈춰 세운다 (실제로 겪었다)
  requestAnimationFrame(loop);
  if(!last) last=ts;
  let dt=(ts-last)/1000; last=ts;
  if(dt>0.05) dt=0.05;
  update(dt);
  draw();
}

/* ============================================================
   화면 전환 / 랭킹
   ============================================================ */
const $ = id=>document.getElementById(id);
function setLabel(id, text){                 // span 을 유지해야 글자색 규칙이 살아있다
  const el=$(id), sp=el.querySelector('span');
  if(sp) sp.textContent=text; else el.textContent=text;
}
// 순위표 백엔드는 js/leaderboard.js 에서 갈아끼운다 (local / supabase)

const SCREENS=['scTitle','scOver','scRank','scHelp','scName'];
function show(id){ SCREENS.forEach(x=> $(x).classList.toggle('hidden', x!==id)); }
function hideAll(){ SCREENS.forEach(x=> $(x).classList.add('hidden')); }

$('nick').value = localStorage.getItem('bb_nick') || '';

// 이번 판의 기록을 이미 저장했는가 (한 판에 한 번만 저장 버튼이 먹도록)
// 선언을 빠뜨리면 "use strict" 아래에서 showOver() 가 ReferenceError 로 죽는다
let pendingSaved = false;

$('bStart').onclick = ()=>{ hideAll(); newGame(); };
$('bAgain').onclick = ()=>{ hideAll(); newGame(); };
$('bRank').onclick  = ()=>{ openRank(); };
$('bHelp').onclick  = ()=>{ show('scHelp'); };
$('bHelpBack').onclick = ()=>{ show('scTitle'); };
$('bRank2').onclick = ()=>{ openRank(); };
$('bHome').onclick  = ()=>{ mode='title'; S=null; document.getElementById('btns').style.display='none'; show('scTitle'); };
$('bBack').onclick  = ()=>{ show(mode==='over'?'scOver':'scTitle'); };

function showOver(){
  $('ovScore').innerHTML = S.score + '<small> 층</small>';
  $('ovRsn').textContent = S.deadReason==='robot'
    ? '로봇에게 잡혔습니다.'
    : '다음 블록은 ' + (S.missNeed<0 ? '왼쪽' : '오른쪽') + '에 있었습니다.';
  $('ovErr').textContent='';
  pendingSaved=false;
  $('bSave').disabled=false;
  setLabel('bSave','기록 저장');
  const b=parseInt(localStorage.getItem('bb_best')||'0',10);
  if(S.score>b) localStorage.setItem('bb_best', String(S.score));
  show('scOver');
  document.getElementById('btns').style.display='none';
}

const MAXE = 100;
async function loadBoard(){ return Leaderboard.top(MAXE); }
async function saveScore(name, score){ return Leaderboard.submit(name, score); }

$('bSave').onclick = ()=>{
  if(pendingSaved) return;
  $('nmScore').textContent = S ? S.score + '층 기록을 남깁니다' : '';
  $('nmErr').textContent = '';
  $('nick').value = localStorage.getItem('bb_nick') || '';
  show('scName');
  setTimeout(()=>{ try{ $('nick').focus(); }catch(_){ } }, 60);
};
$('bNameCancel').onclick = ()=>{ show('scOver'); };
$('nick').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); $('bNameOk').click(); } });

$('bNameOk').onclick = async ()=>{
  const name = $('nick').value.trim();
  if(!name){ $('nmErr').textContent='닉네임을 입력해 주세요.'; return; }
  const score = S ? S.score : 0;
  $('bNameOk').disabled = true; $('bNameOk').textContent='저장 중…';
  try{
    localStorage.setItem('bb_nick', name.slice(0,10));
    await saveScore(name.slice(0,10), score);
    pendingSaved = true;
    setLabel('bSave','저장 완료');
    $('bSave').disabled = true;
    $('bNameOk').disabled=false; $('bNameOk').textContent='저장하기';
    openRank();
  }catch(e){
    $('bNameOk').disabled=false; $('bNameOk').textContent='저장하기';
    const c = e && e.code;
    $('nmErr').textContent =
      c==='off'                ? '이 환경에서는 랭킹 저장을 쓸 수 없습니다.' :
      c==='resource_exhausted' ? '요청이 너무 잦습니다. 잠시 후 다시 눌러 주세요.' :
      c==='quota_exceeded'     ? '랭킹 저장 공간이 가득 찼습니다.' :
      c==='revoked'            ? '이 화면의 접근 권한이 해제되었습니다.' :
                                 '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  }
};

async function openRank(){
  show('scRank');
  $('rkSub').textContent='불러오는 중…';
  $('rkList').innerHTML='';
  $('rkNote').textContent='';
  if(!Leaderboard.available()){
    $('rkSub').textContent='랭킹을 사용할 수 없습니다.';
    $('rkNote').textContent='js/leaderboard.js 설정을 확인하세요.';
    return;
  }
  try{
    const list = await loadBoard();
    const me = (localStorage.getItem('bb_nick')||'').trim();
    if(!list.length){ $('rkSub').textContent='아직 기록이 없습니다. 첫 기록의 주인공이 되어보세요.'; return; }
    $('rkSub').textContent='상위 '+list.length+'명';
    $('rkList').innerHTML = list.map((e,i)=>{
      const cls = 'row'+(i<3?' r'+(i+1):'')+(e.n===me?' me':'');
      const nm = String(e.n||'').replace(/[<>&]/g,'');
      return '<div class="'+cls+'"><span class="rk">'+(i+1)+'</span><span class="nm">'+nm+'</span><span class="sc">'+e.s+'</span></div>';
    }).join('');
    $('rkNote').textContent='내 최고 기록: '+(localStorage.getItem('bb_best')||0)+'층';
  }catch(e){
    $('rkSub').textContent='랭킹을 불러오지 못했습니다.';
  }
}

/* ============================================================
   노동요 (탭이 열려 있는 동안 무한 반복)
   ============================================================ */
const BGM = new Audio();
BGM.src = 'assets/audio/bgm.mp3';
BGM.loop = true;
BGM.preload = 'auto';
BGM.volume = 0;
let bgmOn = false, bgmFade = null;

function bgmPaint(){
  const b=$('bBgm');
  b.classList.toggle('on', bgmOn);
  $('bgmIco').textContent = bgmOn ? '♫' : '♪';
  $('bgmTxt').textContent = bgmOn ? '노동요 끄기' : '노동요 틀기';
  b.setAttribute('aria-label', bgmOn ? '노동요 끄기' : '노동요 틀기');
}
function bgmRamp(to){
  clearInterval(bgmFade);
  bgmFade = setInterval(()=>{
    const d = to - BGM.volume;
    if(Math.abs(d) < 0.03){ BGM.volume = to; clearInterval(bgmFade); if(to===0) BGM.pause(); return; }
    BGM.volume = Math.max(0, Math.min(1, BGM.volume + Math.sign(d)*0.03));
  }, 40);
}
function bgmToggle(){
  bgmOn = !bgmOn;
  localStorage.setItem('bb_bgm', bgmOn ? '1' : '0');
  if(bgmOn){
    const pr = BGM.play();
    if(pr && pr.catch) pr.catch(err=>{           // 실패하면 이유를 보여준다 (조용히 꺼지지 않게)
      bgmOn=false; bgmPaint();
      $('bgmTxt').textContent = '재생 불가';
      setTimeout(()=>{ if(!bgmOn) $('bgmTxt').textContent='노동요 틀기'; }, 2500);
    });
    bgmRamp(0.45);
  } else {
    bgmRamp(0);
  }
  bgmPaint();
}
$('bBgm').addEventListener('click', bgmToggle);
bgmPaint();
// 이전에 켜둔 사람은 첫 조작이 일어나는 순간 자동으로 이어서 재생 (브라우저 자동재생 정책)
if(localStorage.getItem('bb_bgm')==='1'){
  const resume = (e)=>{
    if(e && e.target && e.target.closest && e.target.closest('#bBgm')) return;  // 버튼은 자기 핸들러에 맡긴다
    document.removeEventListener('pointerdown', resume);
    document.removeEventListener('keydown', resume);
    if(!bgmOn) bgmToggle();
  };
  document.addEventListener('pointerdown', resume);
  document.addEventListener('keydown', resume);
}

/* ============================================================
   시작
   ============================================================ */
document.querySelectorAll('.brick').forEach(b=>{ b.style.backgroundImage='url('+SRC.block+')'; });

resize();
loadAssets().then(()=>{ /* ready */ });
requestAnimationFrame(loop);
