// 온라인 순위 (bamti-bomb 서버의 일반 순위표, 칸 이름 pov)
// 점수 = 걸린 시간(ms). 서버가 짧은 순으로 정렬하고, 15초 ~ 1시간 밖의 값은 받지 않는다.
// 서버가 판을 다시 돌려 검증하지 않으니 조작한 기록은 못 막는다 (다른 게임과 같은 방식).
// ?api=http://127.0.0.1:8080 으로 다른 서버를 시험할 수 있다
const Q = new URLSearchParams(location.search);
export const API = Q.get("api") || "https://bamti-bomb.fly.dev";
const BOARD = "pov";
export const RANK_N = 50;
export const MIN_MS = 15000;

async function fetchT(url, opt, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ac.signal }); } finally { clearTimeout(t); }
}

export async function loadTop() {
  const r = await (await fetchT(`${API}/api/scores/${BOARD}?limit=${RANK_N}`, {}, 6000)).json();
  return r.rows || [];
}

// 등록 → 갱신된 목록. 실패하면 Error(message = 서버 오류 코드)
export async function submit(name, ms) {
  const res = await fetchT(`${API}/api/scores/${BOARD}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, score: Math.round(ms) }),
  }, 8000);
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.rows) throw new Error((r && r.error) || "fail");
  return r.rows;
}

export const loadName = () => { try { return localStorage.getItem("pov-name") || ""; } catch (e) { return ""; } };
export const saveName = (n) => { try { localStorage.setItem("pov-name", n); } catch (e) { } };

export const ERR_TEXT = {
  too_many: "잠깐 뒤에 다시 눌러 주세요",
  bad_name: "닉네임을 다시 적어 주세요",
  bad_score: "기록이 이상해서 올리지 못했어요",
};
