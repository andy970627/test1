/*
 * 《回家的路》冥府：黑暗中認出亡魂（純邏輯）
 *
 * 不碰 DOM。瀏覽器：全域 OdysseyUnderworld（要先載入 series.js）；Node：module.exports。
 * 依據：docs/design/2026-11-06-underworld-concept.md
 *
 * 線索規則（使用者要求）：判斷亡魂用的線索，只能是玩家在岸邊點名時實際看過、聽過的——
 *   腳步節奏、聲音特徵、他說過的那句話（可只給前半句）、被岩石砸中前喊的那句。
 *   全部來自 series.js 的 CREW_TRAITS（岸邊和冥府用同一份資料）。
 *   選項名字也只用岸邊點名出現過的人（其他失去的同伴、活著上船的同伴當干擾）。
 *
 * 出處：
 *   冥府段落、西農的指責、阿伽門農的忠告【電影】（台詞細節待確認，句子依概念文件）
 *   在黑暗裡叫名字、叫對才安息、叫錯的跟到海上、時限【改編】
 *   沒在岸邊出現過的死者（例如洞裡死的）叫不出名字，直接跟到海上【改編】
 *   全部救出來的玩家也聽得到完整忠告（沒有人沒被叫到）【改編】
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./series.js'));
  else root.OdysseyUnderworld = factory(root.OdysseySeries);
}(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  var SHADE_TIME = 9;   // 秒：每個亡魂等你叫名字的時間
  var OPTIONS = 4;      // 每次最多給幾個名字

  var SINON = [
    { who: '西農', text: '「奧德修斯。你沒有尊敬過死去的同伴。」' },
    { who: '西農', text: '「他們都在這裡——你叫得出他們的名字嗎？」' }
  ];
  var SINON_SHORT = [
    { who: '西農', text: '「奧德修斯。這裡沒有你的同伴在等你。」' },
    { who: '西農', text: '「可是別以為死人會忘記你。我們都在這裡看著。」' }
  ];
  var AGAMEMNON_FULL = { who: '阿伽門農', text: '「別以國王的身分回家。以無名之人的身分回去。」' };
  var AGAMEMNON_CUT = { who: '阿伽門農', text: '「別以國王的身分回家……」' };
  var AGAMEMNON_CUT_AFTER = { who: '', text: '他的話被身後的哀號蓋了過去。你沒聽見後半句。' };

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function uniq(a) { return a.filter(function (n, i) { return a.indexOf(n) === i; }); }

  /** 只給前半句：「前半……」（讓玩家自己想起後半）。 */
  function halfLine(text) {
    var chars = Array.from(String(text));
    var n = Math.max(2, Math.ceil(chars.length / 2));
    return chars.slice(0, n).join('').replace(/[，。、！？—…]+$/, '') + '……';
  }
  /** 死在岸邊（岸邊有驚動巨人、他在點名名單裡）→ 'rock'；其餘 → 'cave'。 */
  function causeOf(name, save) {
    var s = S.normalize(save);
    return S.rollCall(s).indexOf(name) >= 0 && (s.shore === 'shoot' || s.shore === 'name') ? 'rock' : 'cave';
  }
  /** 冥府裡看得到的亡魂：失去的同伴中，岸邊點名時出現過的。 */
  function seenLost(save) {
    var s = S.normalize(save), seen = S.rollCall(s);
    return uniq(s.crewLost).filter(function (n) { return seen.indexOf(n) >= 0 && S.traitsOf(n); });
  }
  /** 失去了、但岸邊沒出現過的（叫不出名字，直接跟著）。 */
  function unseenLost(save) {
    var s = S.normalize(save), seen = seenLost(s);
    return uniq(s.crewLost).filter(function (n) { return seen.indexOf(n) < 0; });
  }

  /**
   * 從存檔排出亡魂名單（順序、左右、線索、選項都由 rng 決定；注入 rng 可重現）。
   * 每個亡魂：{ name, cause, step, voice, stepLabel, voiceLabel, clue: 'said'|'last', line, side: -1|1, options }
   *   砸死的：一半機會給死前那句（完整）、一半給點名時那句的前半；洞裡死的只會是 said（照理不會出現）。
   *   options：正確名字＋最多 1 個其他失去的同伴＋活著上船的同伴，全是點名時出現過的人。
   */
  function buildShades(save, rng) {
    rng = rng || Math.random;
    var s = S.normalize(save);
    var seen = S.rollCall(s), lost = seenLost(s);
    var alive = seen.filter(function (n) { return s.crewLost.indexOf(n) < 0; });
    return shuffle(lost, rng).map(function (name) {
      var t = S.traitsOf(name), cause = causeOf(name, s);
      var clue = cause === 'rock' && rng() < 0.5 ? 'last' : 'said';
      var others = shuffle(lost.filter(function (n) { return n !== name; }), rng).slice(0, 1);
      var pool = shuffle(alive, rng).slice(0, OPTIONS - 1 - others.length);
      if (others.length + pool.length < OPTIONS - 1) { // 活著的人不夠，再補失去的同伴
        others = others.concat(shuffle(lost.filter(function (n) { return n !== name && others.indexOf(n) < 0; }), rng)
          .slice(0, OPTIONS - 1 - others.length - pool.length));
      }
      return {
        name: name, cause: cause, step: t.step, voice: t.voice, stepLabel: t.stepLabel, voiceLabel: t.voiceLabel,
        clue: clue, line: clue === 'last' ? '「' + t.last + '」' : '「' + halfLine(t.said) + '」',
        side: rng() < 0.5 ? -1 : 1,
        options: shuffle([name].concat(others, pool), rng)
      };
    });
  }

  /** 判定：answer 是名字或選項索引；null／undefined＝時間到。回傳 'named' | 'wrong' | 'timeout'。 */
  function judge(shade, answer) {
    if (answer == null) return 'timeout';
    var picked = typeof answer === 'number' ? shade.options[answer] : answer;
    return picked === shade.name ? 'named' : 'wrong';
  }
  function isTimeout(elapsed, limit) {
    return Number(elapsed) >= (limit == null ? SHADE_TIME : limit);
  }
  /** 叫對一半以上（嚴格大於）才聽到完整忠告；一個都沒失去的也算。 */
  function isNameless(namedCount, total) {
    if (!total) return true;
    return namedCount * 2 > total;
  }
  /** results：[{ name, result }]；extraFollowing：沒在岸邊出現過的死者。 */
  function summarize(results, extraFollowing) {
    var named = [], following = [];
    (results || []).forEach(function (r) { (r.result === 'named' ? named : following).push(r.name); });
    following = following.concat(extraFollowing || []);
    return { shadesNamed: named, shadesFollowing: following, nameless: isNameless(named.length, named.length + following.length) };
  }
  /** 冥府結束：回傳往奧吉吉亞的新存檔。 */
  function finish(save, results) {
    return S.advance(save, 'ogygia', summarize(results, unseenLost(save)));
  }
  function opening(save) {
    return seenLost(save).length ? SINON : SINON_SHORT;
  }
  function closing(nameless) {
    return nameless ? [AGAMEMNON_FULL] : [AGAMEMNON_CUT, AGAMEMNON_CUT_AFTER];
  }

  return {
    SHADE_TIME: SHADE_TIME, OPTIONS: OPTIONS, AGAMEMNON_FULL: AGAMEMNON_FULL, AGAMEMNON_CUT: AGAMEMNON_CUT,
    halfLine: halfLine, causeOf: causeOf, seenLost: seenLost, unseenLost: unseenLost,
    buildShades: buildShades, judge: judge, isTimeout: isTimeout, isNameless: isNameless,
    summarize: summarize, finish: finish, opening: opening, closing: closing
  };
}));
