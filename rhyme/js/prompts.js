/* 모드별 문제 만들기.
   게임은 마디 번호(bar, 1부터)만 알면 되고, 여기서 "그 마디에 무엇을 보여 줄지" 를 돌려준다.
   문제는 필요할 때 하나씩 만들어 쌓아 두므로 끝없이 이어진다. */

import { WORDS_2, WORDS_3 } from "./words.js";
import { vowels, initials } from "./hangul.js";

export const OBANG = ["blue", "red", "yellow", "white", "black"];   // 오방색 — 라임 묶음 색

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function groupBy(words, key) {
  const g = new Map();
  for (const w of words) {
    const k = key(w);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(w);
  }
  return g;
}

// 운(모음)이 같은 두 글자 단어 묶음. 모드1 은 4개 이상, 모드2 는 3개 이상인 운만 낸다
// — 그래야 받은 사람이 이어 갈 말이 실제로 있다.
const BY_VOWEL = groupBy(WORDS_2, vowels);
const RHYMES = [...BY_VOWEL].filter(([, w]) => w.length >= 4);
const VOWEL_SETS = [...BY_VOWEL].filter(([, w]) => w.length >= 3).map(([k]) => k);
// 초성도 실제 단어에서 뽑는다 (풀 수 없는 ㅃㅉ 같은 문제가 안 나오게)
const CHO_SETS = [...groupBy(WORDS_2, initials)].filter(([, w]) => w.length >= 2).map(([k]) => k);

/** 제시어 혼합 — 두 글자, 두 글자, 세 글자 순서로 되풀이 (글자 수마다 따로 섞은 더미) */
export const MIX = 23;
function mixDeck() {
  const two = deck(WORDS_2), three = deck(WORDS_3);
  let k = 0;
  return () => (k++ % 3 === 2 ? three() : two());
}

/** 카드 더미 — 섞어 두고 하나씩 뽑는다. 다 쓰면 다시 섞는다.
    그래서 전부 한 번씩 나오기 전엔 같은 문제가 다시 안 나오고, 새로 섞을 때도 방금 것과 이어지지 않게 한다. */
function deck(pool) {
  let bag = [], last;
  return () => {
    if (!bag.length) {
      bag = shuffle(pool);
      if (bag.length > 1 && bag[bag.length - 1] === last) bag.unshift(bag.pop());
    }
    return (last = bag.pop());
  };
}

/* 모드 설정
   period  문제 하나가 몇 마디 가는지
   turn    2인일 때 한 사람이 몇 마디씩 하는지 */
export function modeRule(mode, players, opts) {
  if (mode === 1) return { period: 4, turn: 2 };
  // 모드2 모음·모드3 제시어: 혼자면 4/8마디마다 바꾸기, 둘이면 한 사람당 2/4마디 → 같은 문제로 둘이 한 번씩
  if (mode === 2 || mode === 3) {
    if (players === 2) { const turn = opts.turn === 4 ? 4 : 2; return { period: turn * 2, turn }; }
    return { period: opts.every === 8 ? 8 : 4, turn: 4 };
  }
  // 모드4 초성: 혼자면 4/8마디 선택, 둘이면 한 사람당 4마디 고정 → 같은 초성으로 둘이 4마디씩
  if (players === 2) return { period: 8, turn: 4 };
  return { period: opts.every === 8 ? 8 : 4, turn: 4 };
}

/**
 * @param custom  주소로 넘긴 문제 목록(릴스 촬영용). 모드1 은 마디마다 단어 하나, 나머지는 문제 하나씩.
 */
export function createSequencer(mode, players, opts = {}, custom = null) {
  const rule = modeRule(mode, players, opts);
  const periods = [];          // 만들어 둔 문제들
  // 모드마다 카드 더미 하나. 모드1 은 운 묶음 더미 + 묶음마다 단어 더미(같은 운이 다시 와도 다른 단어부터)
  const next = mode === 1 ? deck(RHYMES.map(r => r[0]))
    : mode === 2 ? deck(VOWEL_SETS)
    : mode === 3 ? (opts.len === MIX ? mixDeck() : deck(opts.len === 3 ? WORDS_3 : WORDS_2))
    : deck(CHO_SETS);
  const wordDecks = new Map();
  const fourWords = key => {
    if (!wordDecks.has(key)) wordDecks.set(key, deck(BY_VOWEL.get(key)));
    const draw = wordDecks.get(key), out = [];
    while (out.length < 4) { const w = draw(); if (!out.includes(w)) out.push(w); }
    return out;
  };

  function make(k) {
    if (custom && custom.length) {
      if (mode === 1) {
        const words = [0, 1, 2, 3].map(i => custom[(k * 4 + i) % custom.length]);
        return { key: vowels(words[0]), words };
      }
      return { key: custom[k % custom.length], text: custom[k % custom.length] };
    }
    const key = next();
    if (mode === 1) return { key, words: fourWords(key) };
    if (mode === 2) return { key, text: [...key].join(" "), hint: BY_VOWEL.get(key).slice(0, 3) };
    return { key, text: key };
  }

  function period(k) {
    while (periods.length <= k) {
      const p = make(periods.length);
      p.color = OBANG[periods.length % OBANG.length];
      periods.push(p);
    }
    return periods[k];
  }

  return {
    rule,
    /** 마디(1부터)의 내용. bar 0 은 준비 마디. */
    at(bar) {
      if (bar < 1) return { ready: true, player: 0 };
      const i = bar - 1;
      const k = Math.floor(i / rule.period);
      const p = period(k);
      const inPeriod = i % rule.period;
      return {
        period: k,
        inPeriod,
        prompt: p,
        word: mode === 1 ? p.words[inPeriod % 4] : null,
        color: p.color,
        player: players === 2 ? Math.floor(i / rule.turn) % 2 : 0,
        turnStart: i % rule.turn === 0,
      };
    },
  };
}
