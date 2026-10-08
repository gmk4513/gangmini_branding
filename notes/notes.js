/* =========================================================================
   기록 목록. 글을 추가할 때 고치는 곳은 여기 하나입니다.

   새 글을 올릴 때:
   1. notes/<slug>/index.html 을 만든다 (글 본문)
   2. 아래 배열 맨 위에 한 덩어리 추가한다
   3. git push → 1~2분 뒤 자동 반영

   slug  주소가 된다. 영문 소문자·숫자·하이픈만.
         → gangmini.com/notes/expo-stack/
   cat   카테고리. 하나만. 아래 CATS에 없는 값을 쓰면 칩이 안 생긴다.
   tags  태그. 여러 개. 자유롭게 늘려도 된다.
   date  "YYYY-MM-DD" 고정. 정렬에 쓰인다.
   desc  목록에 보이는 한 줄. 글을 안 열어도 뭔지 알게 쓴다.
   mine  내가 만든 것과 직접 엮인 글이면 true. 목록에서 표시가 붙는다.
   ========================================================================= */

/* 카테고리는 적게 유지한다. 늘어나면 필터가 아니라 목록이 된다.
   순서가 화면에 그대로 나온다. */
const CATS = [
  { id: "stack",   label: "스택",   note: "내가 쓴 프레임워크와 도구" },
  { id: "money",   label: "수익화", note: "결제·구독이 실제로 도는 구조" },
  { id: "role",    label: "직무",   note: "회사에서 이 일을 뭐라고 부르나" },
  { id: "theory",  label: "이론",   note: "원리. 외우는 게 아니라 이해하는 것" },
  { id: "term",    label: "용어",   note: "면접과 문서에서 만나는 말" },
  { id: "where",   label: "쓰임새", note: "이 기술은 어디에 쓰이나" },
];

const NOTES = [

  {
    slug: "bfree-desktop-pet",
    title: "학사모 비프리 데스크톱 펫 — 바탕화면에 캐릭터를 살게 하기",
    desc: "모니터만 한 투명 창 하나로 바탕화면에 사는 캐릭터를. 클릭 통과, 키보드 소유권, 맥 없이 맥 검증하기까지.",
    date: "2026-10-09",
    cat: "stack",
    tags: ["Tauri", "Rust", "WebView", "GitHub Actions", "macOS"],
    mine: true,
  },

  {
    slug: "school-diary-stack",
    title: "학창시절 다이어리 — 무엇으로, 어떻게 만들었나",
    desc: "앱 하나를 두 스토어에 올리기까지. 세 번 갈아엎은 줄공책 입력, 데이터를 깨뜨리는 규칙들, 한 번 반려된 심사, 서버가 딱 하나인 이유.",
    date: "2026-10-02",
    cat: "stack",
    tags: ["Expo", "React Native", "Skia", "SQLite", "RevenueCat", "Vercel", "네이티브 모듈"],
    mine: true,
  },

];
