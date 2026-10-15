/* =========================================================================
   이론/용어 목록. 글을 추가할 때 고치는 곳은 여기 하나입니다.

   /notes/ 가 "만든 것과 엮인 기록"이라면, 여기는 일하기 전에 알아두려는 것 —
   이론, 용어, 직무, 이 기술이 실제로 어디에 쓰이는지를 모은다.
   목록을 그리는 코드는 기록과 같은 것(/notes/notes-app.js)을 쓴다.

   새 글을 올릴 때:
   1. learn/<slug>/index.html 을 만든다 (글 본문)
   2. 아래 배열 맨 위에 한 덩어리 추가한다
   3. learn/index.html 의 learn.js?v= 숫자를 올린다 (js 는 4시간 캐시)
   4. git push → 1~2분 뒤 자동 반영

   slug  주소가 된다. 영문 소문자·숫자·하이픈만.  → gangmini.com/learn/es-modules/
   cat   카테고리. 하나만. 아래 CATS 에 없는 값을 쓰면 칩이 안 생긴다.
   mine  내가 만든 것에서 직접 겪은 내용이 들어 있으면 true.
   ========================================================================= */

const NOTE_BASE = "/learn/";

const CATS = [
  { id: "theory",  label: "이론",   note: "원리. 외우는 게 아니라 이해하는 것" },
  { id: "term",    label: "용어",   note: "면접과 문서에서 만나는 말" },
  { id: "role",    label: "직무",   note: "회사에서 이 일을 뭐라고 부르나" },
  { id: "where",   label: "쓰임새", note: "이 기술은 어디에 쓰이나" },
];

const NOTES = [

  {
    slug: "es-modules",
    title: "ES 모듈과 클래식 스크립트 — type=\"module\" 한 줄의 차이",
    desc: "자바스크립트 파일을 불러오는 두 방식. 왜 모듈은 더블클릭으로 안 열리고 서버가 있어야 하는지까지.",
    date: "2026-10-15",
    cat: "theory",
    tags: ["JavaScript", "브라우저", "CORS", "import map"],
    mine: false,   // "내 프로젝트" 표시는 기록 쪽 글에만
  },

];
