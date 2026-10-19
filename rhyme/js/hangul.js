/* 한글 음절 분해 — 완성형(가~힣)만 다룬다.
   음절 코드 = 0xAC00 + (초성 * 21 + 중성) * 28 + 종성 */

export const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
export const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
export const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

// 소리로는 같은 모음. 요즘 발음에서 ㅔ/ㅐ, ㅚ/ㅙ/ㅞ 는 거의 구분되지 않아서
// 라임을 맞출 때는 하나로 본다 (바지·배지가 아니라 "개미·메리" 쪽 이야기).
const SAME = { "ㅔ": "ㅐ", "ㅖ": "ㅒ", "ㅚ": "ㅙ", "ㅞ": "ㅙ" };

export function split(ch) {
  const c = ch.charCodeAt(0) - 0xAC00;
  if (c < 0 || c > 11171) return null;
  return { cho: CHO[Math.floor(c / 588)], jung: JUNG[Math.floor((c % 588) / 28)], jong: JONG[c % 28] };
}

/** 운 — 음절마다 모음. "바지" → "ㅏㅣ" */
export function vowels(word) {
  let out = "";
  for (const ch of word) {
    const s = split(ch);
    if (s) out += SAME[s.jung] || s.jung;
  }
  return out;
}

/** 초성. "축제" → "ㅊㅈ" */
export function initials(word) {
  let out = "";
  for (const ch of word) {
    const s = split(ch);
    if (s) out += s.cho;
  }
  return out;
}

/** 음절 수 (한글만 센다) */
export const syllables = word => [...word].filter(ch => split(ch)).length;
