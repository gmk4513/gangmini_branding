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
   topic/group/order  어느 큰 주제·소주제에 몇 번째로 놓을지 (아래 TOPICS)
   ========================================================================= */

const NOTE_BASE = "/learn/";

const CATS = [
  { id: "theory",  label: "이론",   note: "원리. 외우는 게 아니라 이해하는 것" },
  { id: "term",    label: "용어",   note: "면접과 문서에서 만나는 말" },
  { id: "role",    label: "직무",   note: "회사에서 이 일을 뭐라고 부르나" },
  { id: "where",   label: "쓰임새", note: "이 기술은 어디에 쓰이나" },
  { id: "practice", label: "실습",  note: "직접 따라 해 보는 튜토리얼" },
];

/* 큰 주제 → 소주제. 목록 화면은 이 순서대로 묶어서 보여 준다 (learn-app.js).
   글마다 topic(큰 주제 id), group(소주제 id), order(주제 안에서 읽는 순서)를 단다.
   order 는 "처음 읽는 사람이 이 순서로 읽으면 된다"는 뜻이다. 주제 안에서 1 부터.
   어느 주제에도 안 맞으면 topic 을 비워 둔다 → 맨 아래 "그 밖의 글"로 간다. */
const TOPICS = [
  { id: "web",  label: "웹 기초",
    note: "브라우저와 자바스크립트가 실제로 어떻게 도는지",
    groups: [ { id: "js", label: "자바스크립트와 브라우저" } ] },
  { id: "team", label: "팀에서 일하기",
    note: "AI 로 만들어도 사람끼리 이어받을 수 있게. 1 번이 전체 지도다",
    groups: [
      { id: "start",  label: "먼저 읽기" },
      { id: "code",   label: "코드를 다루는 습관" },
      { id: "people", label: "사람과 맞추기" },
    ] },
  { id: "git",  label: "Git · GitHub 실습",
    note: "직접 따라 치는 튜토리얼. 위에서부터 순서대로 하면 된다",
    groups: [
      { id: "solo",     label: "혼자 쓰기" },
      { id: "together", label: "같이 쓰기 — 브랜치·충돌·최신 따라가기" },
      { id: "github",   label: "GitHub 기능" },
    ] },
  { id: "arch", label: "코드 구조와 설계",
    note: "서버 코드를 층으로 나누고, 의존성을 주입하고, 읽히게 쓰기. 예제 하나(메모 API)로 끝까지 따라 간다",
    groups: [
      { id: "big",      label: "큰 그림" },
      { id: "build",    label: "따라 만들기" },
      { id: "readable", label: "읽히는 코드" },
      { id: "auto",     label: "자동화" },
    ] },
  { id: "ai",   label: "AI 기술 기초",
    note: "AI 서비스 뒤에서 실제로 도는 기술들",
    groups: [ { id: "rag", label: "검색 증강 생성(RAG)" } ] },
];

const NOTES = [

  // ── 코드 구조와 설계 · AI 기술 기초 · main/dev (2026-10-28) ──
  {
    slug: "arch-overview",
    topic: "arch", group: "big", order: 1,
    title: "코드 구조 한눈에 — 레이어드 아키텍처와 KISS",
    desc: "서버 코드를 왜 층으로 나누나. 모놀리스와 MSA, KISS 원칙, 표현·비즈니스·영속 세 층, DTO·도메인·엔티티의 차이, 한 방향 의존, 그리고 시리즈 지도.",
    date: "2026-10-28", cat: "theory",
    tags: ["레이어드 아키텍처", "KISS", "모놀리스", "MSA", "DTO", "도메인"],
    mine: false,
  },
  {
    slug: "arch-modules",
    topic: "arch", group: "big", order: 2,
    title: "패키지와 모듈 나누기 — 기능별? 도메인별? 그리고 참조 방향",
    desc: "src 와 webapp 을 왜 나누나, 참조가 거꾸로 가면 파이썬에서 실제로 나는 순환 참조 에러, 로그의 내용(src)과 형식(webapp) 나누기, 기능별 vs 도메인별 폴더.",
    date: "2026-10-28", cat: "theory",
    tags: ["Python", "순환 참조", "logging", "패키지 구조", "도메인"],
    mine: false,
  },
  {
    slug: "arch-layers",
    topic: "arch", group: "build", order: 3,
    title: "레이어드 아키텍처 따라 만들기 — router · service · repository",
    desc: "한 파일에 섞여 있던 HTTP·규칙·SQL 을 세 층으로 나눠 메모 API 를 직접 만든다. DTO·도메인·엔티티가 오가는 길, 데이터 주권, 저장소 바꿔 끼우기, 로거로 보는 참조 방향까지.",
    date: "2026-10-28", cat: "practice",
    tags: ["Python", "FastAPI", "레이어드 아키텍처", "DTO", "Repository", "OCP"],
    mine: false,
  },
  {
    slug: "arch-di",
    topic: "arch", group: "build", order: 4,
    title: "의존성 주입(DI) — 직접 넣기부터 컨테이너까지",
    desc: "서비스가 저장소를 직접 만들면 무엇이 막히나. 생성자 주입, 가짜 저장소 테스트, dependency-injector 컨테이너, Singleton·Factory, 앱 수명 vs 요청 수명을 직접 세어 보고 테스트에서 override 까지.",
    date: "2026-10-28", cat: "practice",
    tags: ["DI", "dependency-injector", "FastAPI", "pytest", "Singleton"],
    mine: false,
  },
  {
    slug: "arch-refactor-practice",
    topic: "arch", group: "build", order: 5,
    title: "실습: 브랜치 따서 한 파일짜리 API 를 계층 + DI 로 정리하기",
    desc: "main(운영)·dev(개발)에서 refactor 브랜치를 따고, 78줄짜리 API 를 커밋 다섯 개로 계층 + DI 구조로 바꾼 뒤 PR 로 dev 에, v0.2.0 으로 main 에. 커밋마다 smoke 확인까지 실제 출력으로.",
    date: "2026-10-28", cat: "practice",
    tags: ["Git", "리팩터링", "브랜치 전략", "FastAPI", "DI", "태그"],
    mine: false,
  },
  {
    slug: "arch-code-principles",
    topic: "arch", group: "readable", order: 6,
    title: "읽히는 코드의 원칙 — SLAP · 동형원리 · 선형원리 · 생성원칙",
    desc: "한 함수 안의 줄 높이 맞추기, get/find/_by_ 이름 규칙과 매개변수 순서, 중첩 if 대신 validate 에서 raise, OpenAPI 로 클라이언트 코드 생성하기.",
    date: "2026-10-28", cat: "theory",
    tags: ["SLAP", "이름 규칙", "예외 처리", "OpenAPI", "코드 생성"],
    mine: false,
  },
  {
    slug: "arch-test-cicd",
    topic: "arch", group: "auto", order: 7,
    title: "테스트와 CI/CD — 손으로 하던 확인을 자동으로",
    desc: "테스트는 일일이 눌러 보던 확인을 코드로 옮긴 것이다. given/when/then, 단위·통합·E2E, 가짜 저장소와 진짜 DB, 그리고 CI(합쳐도 되나)와 CD(이미지에 버전을 붙여 내보내고 되돌리기).",
    date: "2026-10-28", cat: "theory",
    tags: ["테스트", "pytest", "CI/CD", "Docker", "testcontainers", "GitHub Actions"],
    mine: false,
  },
  {
    slug: "git-main-dev",
    topic: "git", group: "together", order: 6,
    title: "운영 브랜치와 개발 브랜치 — main 과 dev 로 일하기",
    desc: "main 은 운영 서버에 나간 것, dev 는 다음에 나갈 것. 기능 브랜치 → dev → 개발 서버 확인 → 릴리스 → 태그 → 배포, 급한 불은 hotfix. 내 컴퓨터에서 한 바퀴 따라 하고 Git Flow · GitHub Flow · 트렁크 기반과 비교한다.",
    date: "2026-10-28", cat: "practice",
    tags: ["Git", "브랜치 전략", "Git Flow", "태그", "hotfix", "릴리스"],
    mine: false,
  },
  {
    slug: "rag-vector-search",
    topic: "ai", group: "rag", order: 1,
    title: "RAG 와 벡터 검색 기초 — 임베딩, 코사인 거리, pgvector",
    desc: "LLM 이 모르는 문서로 답하게 하는 오픈북 방식. 뜻을 좌표로 바꾸는 임베딩, 직접 계산해 본 코사인 거리와 top-k, pgvector 쿼리와 인덱스, 자르기와 잘 안 되는 경우.",
    date: "2026-10-28", cat: "theory",
    tags: ["RAG", "임베딩", "벡터 검색", "pgvector", "LLM"],
    mine: false,
  },

  // ── 팀에서 일하기 (2026-10-28) ──
  {
    slug: "team-ai-ownership",
    topic: "team", group: "start", order: 1,
    title: "AI 로 만든 코드의 주인 되기 — 팀에서 문제가 되는 순간",
    desc: "AI 로 만든 코드가 팀에서 문제가 되는 건 품질보다 아무도 설명하지 못할 때다. 내 프로젝트에서 본 위험 신호 넷과, 기르려는 여섯 가지 역량의 지도.",
    date: "2026-10-28", cat: "role",
    tags: ["팀에서 일하기", "AI 코딩", "Git", "코드 리뷰", "인수인계"],
    mine: false,
  },
  {
    slug: "team-explain-diff",
    topic: "team", group: "code", order: 2,
    title: "내가 올린 코드를 설명하는 능력 — diff 를 한 줄씩 읽기",
    desc: "모든 줄에 '이게 없으면?'을 답할 수 있게. diff 읽는 법, 리뷰 요청 전 점검표, AI 에게 던질 질문, R8 설정 변경을 한 줄씩 풀어 본 예와 PR 본문.",
    date: "2026-10-28", cat: "role",
    tags: ["팀에서 일하기", "코드 리뷰", "diff", "PR", "AI 코딩"],
    mine: false,
  },
  {
    slug: "team-git-habits",
    topic: "team", group: "code", order: 3,
    title: "커밋 습관 — 리뷰어가 읽을 수 있는 변경",
    desc: "3,316줄이 바뀐 줄 알았는데 진짜는 86줄이었다. 변경 하나에 커밋 하나, 메시지에 '왜', .gitattributes 로 줄바꿈 고정, 비밀 값과 큰 파일 빼기, 브랜치 이름.",
    date: "2026-10-28", cat: "role",
    tags: ["팀에서 일하기", "Git", "커밋 메시지", ".gitattributes", ".gitignore"],
    mine: false,
  },
  {
    slug: "team-system-map",
    topic: "team", group: "code", order: 4,
    title: "시스템의 큰 그림 — 버그가 어느 층에 있나",
    desc: "소스 · 빌드 · 실행 · 네트워크 · 배포. 릴리스에서만 죽는 앱(R8), 아이폰에서만 안 나는 소리, 첫 요청만 느린 서버, 고쳤는데 그대로인 화면(캐시)으로 층을 좁히는 법.",
    date: "2026-10-28", cat: "role",
    tags: ["팀에서 일하기", "디버깅", "빌드", "R8", "캐시", "Web Audio"],
    mine: false,
  },
  {
    slug: "team-verification",
    topic: "team", group: "code", order: 5,
    title: "검증을 남기는 능력 — \"고쳤다\"를 다음 사람도 확인할 수 있게",
    desc: "손으로 눌러 본 확인은 나만 안다. 체크리스트, 테스트 피라미드, 무엇부터 자동화하나, 헤드리스 브라우저로 숫자 남기기.",
    date: "2026-10-28", cat: "role",
    tags: ["팀에서 일하기", "테스트", "체크리스트", "E2E", "헤드리스 브라우저", "CI"],
    mine: false,
  },
  {
    slug: "team-conventions",
    topic: "team", group: "people", order: 6,
    title: "팀 규칙에 맞추는 능력 — 사람도 AI 도 같은 규칙을 따르게",
    desc: "린터·포매터·EditorConfig, 이름과 폴더 규칙, README·CONTRIBUTING·CLAUDE.md, PR 템플릿. 규칙을 기억이 아니라 도구와 문서에.",
    date: "2026-10-28", cat: "role",
    tags: ["팀에서 일하기", "ESLint", "Prettier", "EditorConfig", "컨벤션", "CLAUDE.md"],
    mine: false,
  },
  {
    slug: "team-communication",
    topic: "team", group: "people", order: 7,
    title: "일을 나누고 말로 맞추는 능력 — 이슈, PR 설명, 결정 기록",
    desc: "큰 일을 하루 크기로 나누기, 범위로 추정하기, 재현되는 이슈와 PR 설명 쓰기, 선택지를 장단점으로, 결정을 ADR 로 남기기.",
    date: "2026-10-28", cat: "role",
    tags: ["팀에서 일하기", "이슈", "PR", "추정", "ADR"],
    mine: false,
  },

  // ── Git · GitHub 실습 (2026-10-28) ──
  {
    slug: "git-basics",
    topic: "git", group: "solo", order: 1,
    title: "Git 첫걸음 — 저장소 만들고 커밋하기",
    desc: "git init 부터 첫 push 까지 직접 따라 해 보는 실습. 작업 폴더·스테이징·저장소 세 칸, status·add·commit·diff·log, .gitignore 까지.",
    date: "2026-10-28", cat: "practice",
    tags: ["Git", "GitHub", "커밋", ".gitignore", "gh CLI"],
    mine: false,
  },
  {
    slug: "git-branch-pr",
    topic: "git", group: "together", order: 3,
    title: "브랜치와 Pull Request — 회사에서 매일 하는 흐름",
    desc: "브랜치 따기 → 커밋 → push → PR → 리뷰 → 합치기(merge·squash·rebase) → 뒷정리. 회사에서 하루에도 몇 번씩 도는 한 바퀴를 따라 해 본다.",
    date: "2026-10-28", cat: "practice",
    tags: ["Git", "GitHub", "브랜치", "Pull Request", "코드 리뷰", "gh CLI"],
    mine: false,
  },
  {
    slug: "git-conflict",
    topic: "git", group: "together", order: 4,
    title: "충돌 일부러 만들고 풀기 — merge conflict 실습",
    desc: "두 브랜치가 같은 줄을 고치면 Git 은 사람에게 묻는다. 충돌을 일부러 만들고, 표시를 읽고, 풀고, 취소하는 법. PR 이 conflicts 로 막혔을 때까지.",
    date: "2026-10-28", cat: "practice",
    tags: ["Git", "merge", "conflict", "Pull Request"],
    mine: false,
  },
  {
    slug: "git-undo",
    topic: "git", group: "solo", order: 2,
    title: "되돌리기 — 실수했을 때 쓰는 명령 6개",
    desc: "파일을 망쳤을 때, 잘못 add 했을 때, 커밋 메시지 오타, 이미 올린 커밋, 최근 커밋 몇 개, 하던 일 치우기. restore·amend·revert·reset·stash 를 따라 치고, 날린 커밋은 reflog 로 살린다.",
    date: "2026-10-28", cat: "practice",
    tags: ["Git", "restore", "revert", "reset", "stash", "reflog"],
    mine: false,
  },
  {
    slug: "git-sync-rebase",
    topic: "git", group: "together", order: 5,
    title: "최신 main 따라가기 — fetch, pull, rebase",
    desc: "동료가 main 을 바꾸는 동안 내 브랜치를 최신으로 맞추기. fetch 와 pull 의 차이, rebase, rebase -i 로 커밋 합치기, --force-with-lease 가 동료 커밋을 지켜 주는 장면까지.",
    date: "2026-10-28", cat: "practice",
    tags: ["Git", "fetch", "pull", "rebase", "force-with-lease"],
    mine: false,
  },
  {
    slug: "github-collab",
    topic: "git", group: "github", order: 7,
    title: "GitHub 협업 기능 실습 — 이슈 · 리뷰 · 보호 규칙",
    desc: "연습 저장소 하나로 따라 하기: 이슈와 라벨, Closes #1, 리뷰와 suggestion, Squash merge, Ruleset, CODEOWNERS, 템플릿, gh 명령.",
    date: "2026-10-28", cat: "practice",
    tags: ["GitHub", "gh CLI", "코드 리뷰", "브랜치 보호", "CODEOWNERS"],
    mine: false,
  },
  {
    slug: "github-actions",
    topic: "git", group: "github", order: 8,
    title: "GitHub Actions 첫걸음 — PR 마다 자동 검사",
    desc: "워크플로 파일 하나로 PR 마다 lint·test 를 자동으로. 일부러 실패시켜 로그 읽기, 통과해야만 합치게 막기, 비밀값 넘기기, 정적 사이트의 깨진 링크 검사까지.",
    date: "2026-10-28", cat: "practice",
    tags: ["GitHub Actions", "CI", "YAML", "브랜치 보호", "Secrets"],
    mine: false,
  },

  {
    slug: "es-modules",
    topic: "web", group: "js", order: 1,
    title: "ES 모듈과 클래식 스크립트 — type=\"module\" 한 줄의 차이",
    desc: "자바스크립트가 무엇인지부터, 파일을 불러오는 두 방식까지. 왜 모듈은 더블클릭으로 안 열리고 서버가 있어야 하는지.",
    date: "2026-10-15",
    cat: "theory",
    tags: ["JavaScript", "브라우저", "CORS", "import map", "Node.js"],
    mine: false,   // "내 프로젝트" 표시는 기록 쪽 글에만
  },

];
