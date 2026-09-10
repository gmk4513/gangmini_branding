"use strict";
/* ============================================================
   순위표 백엔드 어댑터
   ------------------------------------------------------------
   프로토타입은 Claude 아티팩트 전용 저장소를 썼다. 그건 이 사이트에서는
   동작하지 않으므로, 여기서 실제 백엔드로 갈아끼운다.

   MODE = 'fly'      → 내 Fly.io 서버에 저장 (기본값). 모든 사용자가 같은 순위표를 본다
   MODE = 'local'    → 이 기기에만 저장. 백엔드 없이 굴러가므로 개발할 때 쓴다
   MODE = 'supabase' → Supabase(PostgREST) 테이블에 저장. 아래 SUPABASE 채우기

   왜 Supabase 가 아니라 내 서버인가:
   Supabase 는 anon 키를 페이지에 박아야 하고, 그 키로 누구나 insert 할 수 있다.
   막으려면 결국 Edge Function 을 따로 짜야 한다. 그럴 바에는 이미 돌아가고 있는
   Bamti Bomb 서버(판정을 안 해서 CPU 가 놀고 볼륨도 거의 비어 있다)에
   엔드포인트 하나 다는 쪽이 짧다. 점수 상한·요청 제한이 서버 코드 안에 있다.

   게임 쪽에서 쓰는 것은 이 세 개뿐이다.
     Leaderboard.available()      → boolean
     Leaderboard.top(n)           → Promise<[{n, s, t}, ...]>   점수 내림차순
     Leaderboard.submit(name, s)  → Promise<[{n, s, t}, ...]>
   ============================================================ */

const Leaderboard = (function () {
  const MODE = 'fly';                   // 'fly' | 'local' | 'supabase'

  const FLY = {
    base:  'https://bamti-bomb.fly.dev',
    board: 'bfree'                      // 서버가 게임별로 칸을 나눠 쓴다
  };

  const SUPABASE = {
    url:     'https://YOUR-PROJECT.supabase.co',
    anonKey: 'YOUR-ANON-KEY',
    table:   'scores'                   // 컬럼: name(text), score(int4), created_at(timestamptz default now())
  };

  const LOCAL_KEY = 'bb_board_local';
  const MAX_NAME = 10;

  function clean(name, score) {
    const n = String(name || '').trim().slice(0, MAX_NAME);
    const s = Math.max(0, Math.min(100000, Math.floor(Number(score) || 0)));
    return { n, s };
  }
  function sortTrim(rows, limit) {
    return rows
      .slice()
      .sort((a, b) => b.s - a.s || a.t - b.t)
      .slice(0, limit);
  }

  /* ---------- local ---------- */
  const local = {
    available: () => true,
    async top(limit) {
      try {
        const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
        return sortTrim(Array.isArray(raw) ? raw : [], limit);
      } catch (_) { return []; }
    },
    async submit(name, score) {
      const { n, s } = clean(name, score);
      const rows = await local.top(500);
      rows.push({ n, s, t: Date.now() });
      const out = sortTrim(rows, 200);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(out));
      return out.slice(0, 100);
    }
  };

  /* ---------- fly (내 Node 서버) ----------
     머신이 잠들어 있으면 첫 요청에서 깨어난다. 메모리를 얼려 두는 방식이라
     오래 걸리지는 않지만, 그래도 무한정 기다리지 않도록 시간을 끊는다 */
  const FLY_TIMEOUT_MS = 10000;

  async function flyFetch(path, init) {
    const ac = ('AbortController' in window) ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), FLY_TIMEOUT_MS) : 0;
    let res;
    try {
      res = await fetch(FLY.base + path, Object.assign({ signal: ac && ac.signal }, init || {}));
    } catch (e) {
      throw { code: (e && e.name === 'AbortError') ? 'timeout' : 'network', message: String(e) };
    } finally {
      if (timer) clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (_) { }
    if (!res.ok) {
      // 게임 쪽이 이미 알아듣는 코드로 옮긴다 (game.js 의 저장 실패 문구)
      const err = (data && data.error) || ('http_' + res.status);
      throw { code: err === 'too_many' ? 'resource_exhausted' : err, message: JSON.stringify(data) };
    }
    return data;
  }

  const fly = {
    available: () => typeof fetch === 'function',
    async top(limit) {
      const d = await flyFetch('/api/scores/' + FLY.board + '?limit=' + (limit || 100));
      return Array.isArray(d && d.rows) ? d.rows : [];
    },
    async submit(name, score) {
      const { n, s } = clean(name, score);
      const d = await flyFetch('/api/scores/' + FLY.board, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, score: s })
      });
      return Array.isArray(d && d.rows) ? d.rows : [];
    }
  };

  /* ---------- supabase (PostgREST) ---------- */
  const supa = {
    available: () =>
      !SUPABASE.url.includes('YOUR-PROJECT') && !SUPABASE.anonKey.includes('YOUR-ANON-KEY'),
    headers() {
      return {
        'apikey': SUPABASE.anonKey,
        'Authorization': 'Bearer ' + SUPABASE.anonKey,
        'Content-Type': 'application/json'
      };
    },
    async top(limit) {
      const url = `${SUPABASE.url}/rest/v1/${SUPABASE.table}` +
                  `?select=name,score,created_at&order=score.desc&limit=${limit}`;
      const res = await fetch(url, { headers: supa.headers() });
      if (!res.ok) throw { code: 'http_' + res.status, message: await res.text() };
      const rows = await res.json();
      return rows.map(r => ({
        n: r.name,
        s: r.score,
        t: r.created_at ? Date.parse(r.created_at) : 0
      }));
    },
    async submit(name, score) {
      const { n, s } = clean(name, score);
      const res = await fetch(`${SUPABASE.url}/rest/v1/${SUPABASE.table}`, {
        method: 'POST',
        headers: Object.assign(supa.headers(), { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ name: n, score: s })
      });
      if (!res.ok) throw { code: 'http_' + res.status, message: await res.text() };
      return supa.top(100);
    }
  };

  const impl =
    (MODE === 'fly'      && fly.available())  ? fly  :
    (MODE === 'supabase' && supa.available()) ? supa : local;

  return {
    mode: impl === fly ? 'fly' : impl === supa ? 'supabase' : 'local',
    available: () => impl.available(),
    top: (n) => impl.top(n || 100),
    submit: (name, score) => impl.submit(name, score)
  };
})();
