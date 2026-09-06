/* =========================================================================
   여기만 고치면 됩니다.

   새 걸 만들 때마다:
   1. 레포에 폴더를 만든다   →  /7/index.html
   2. 표지 이미지를 넣는다   →  /covers/7.png   (가로세로 4:3 권장)
   3. 아래 LOG 배열 맨 위에 한 덩어리 추가한다
   4. git push  → 1~2분 뒤 자동 반영

   date 는 "YYYY-MM-DD" 형식으로만 적으세요. 정렬과 "최근" 표시에 쓰입니다.
   input 은 생략 가능합니다. (마우스 / 터치 / 카메라 / 마이크 / 키보드 / 센서)
   ========================================================================= */

const LOG = [

  // ↓ 첫 번째 걸 만들면 이 주석을 풀고 내용만 바꾸세요.
  //
  // {
  //   no: 1,
  //   title: "제목",
  //   desc: "한 줄 설명. 뭘 하는 건지 릴스 안 본 사람도 알게.",
  //   date: "2026-08-28",
  //   href: "/1/",
  //   cover: "/covers/1.png",
  //   input: "마우스",
  // },

];

const PROJECTS = [

  {
    title: "Snake Pet",
    desc: "화면 위를 돌아다니는 애완 뱀. 먹이를 주면 잡아먹고 몸이 길어집니다.",
    date: "2026-09-04",
    href: "https://github.com/gmk4513/snake-pet/releases/latest",
    cover: "/covers/snake-pet.png",
    input: "마우스",
  },

  {
    title: "Bamti Bomb",
    desc: "크레이지아케이드에서 출발한 웹 봄버맨. 한 컴퓨터 2인용과 온라인 멀티플레이를 지원합니다.",
    date: "2026-08-22",
    href: "https://bamti-bomb.fly.dev/",
    cover: "/covers/bamti-bomb.png",
    input: "키보드",
  },

];
