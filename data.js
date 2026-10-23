/* =========================================================================
   여기만 고치면 됩니다.

   새 걸 만들 때마다:
   1. 아래 배열 맨 위에 한 덩어리 추가한다
   2. 표지 이미지를 넣는다  →  /covers/이름.png   (가로세로 4:3 권장)
   3. git push  → 1~2분 뒤 자동 반영

   no    번호. 만든 순서대로 1, 2, 3... 카드 표지에 빨간 #번호로 찍힙니다.
         빼면 스탬프 없이 나옵니다.
   date  "YYYY-MM-DD" 형식으로만. 번호가 같거나 없을 때 정렬에 쓰입니다.
   href  바깥 주소(https://...)면 새 탭으로 열립니다.
   input 생략 가능. (마우스 / 터치 / 카메라 / 마이크 / 키보드 / 센서)
   ========================================================================= */

const PROJECTS = [

  {
    no: 5,
    title: "라임놀이",
    desc: "비트 위로 단어·모음·제시어·초성이 떨어지는 한글 프리스타일 랩 놀이. 혼자도, 둘이 주고받기도 됩니다.",
    date: "2026-10-19",
    href: "/rhyme/",
    cover: "/covers/rhyme.png",
    input: "터치 / 마우스",
  },

  {
    no: 4,
    title: "범퍼카 2026",
    desc: "불구덩이 무대 위 범퍼카 싸움. 드리프트 끝에 부스터로 들이받아 상대를 무대 밖으로 밀어내세요.",
    date: "2026-10-14",
    href: "/bumpercar/",
    cover: "/covers/bumpercar.png",
    input: "키보드",
  },

  {
    no: 3,
    title: "학사모 비프리의 아파트 건설현장",
    desc: "로보트보다 빠르게 아파트를 몇 층까지 지을 수 있을까. 두 버튼으로 계단을 올라가는 아케이드 게임입니다.",
    date: "2026-09-10",
    href: "/game/",
    cover: "/covers/bfree-construction.png",
    input: "키보드 / 터치",
  },

  {
    no: 2,
    title: "Snake Pet",
    desc: "화면 위를 돌아다니는 애완 뱀. 먹이를 주면 잡아먹고 몸이 길어집니다.",
    date: "2026-09-04",
    href: "https://github.com/gmk4513/snake-pet/releases/latest",
    cover: "/covers/snake-pet.png",
    input: "마우스",
  },

  {
    no: 1,
    title: "Bamti Bomb",
    desc: "크레이지아케이드에서 출발한 웹 봄버맨. 한 컴퓨터 2인용과 온라인 멀티플레이를 지원합니다.",
    date: "2026-08-22",
    href: "https://bamti-bomb.fly.dev/",
    cover: "/covers/bamti-bomb.png",
    input: "키보드",
  },

];


/* 출시 앱 — 스토어에 올라간 앱. 프로젝트 아래 칸에 따로 나옵니다.
   번호(no)는 붙이지 않습니다. 릴스 번호와 상관없는 칸입니다.
   cta   카드 오른쪽 아래 글자. 생략하면 "열기 ↗"  */
const APPS = [

  {
    title: "학창시절 다이어리",
    desc: "그림일기·독후감·방학숙제·급식표·가정통신문. 그 시절 감성 그대로 쓰는 다이어리 앱입니다.",
    date: "2026-09-28",
    href: "https://apps.apple.com/kr/app/id6814397558",
    cover: "/covers/school-diary.jpg",
    input: "iPhone",
    cta: "App Store ↗",
  },

  {
    title: "속마음 번역기",
    desc: "짧아진 답장, 애매한 한마디. 상황과 MBTI만 적으면 상대와 나의 속마음을 번역해 줍니다. 친구와 함께 만들었어요.",
    date: "2026-07-17",
    href: "https://sokmaeum.loothapp.com",
    cover: "/covers/sokmaeum.jpg",
    input: "iPhone / Android",
  },

];
