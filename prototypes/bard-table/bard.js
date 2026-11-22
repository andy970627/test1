/*
 * 吟遊詩人敲桌：規則核心（純邏輯，不碰畫面與聲音）。
 * 瀏覽器：全域 BardRules；Node：module.exports。設計見 docs/design/2026-11-22-bard-table.md。
 *
 * 一拍一格：格子是「字」就要敲，格子上有手、食物、酒杯、牛蹄就不能敲。
 * 判定寬度沿用木馬之夜（risset.js）：±STEP_WIN 算準，±CROUCH_STEP_WIN 算差一點，不另訂一套。
 *
 * 第二版三個機制：
 *   禁忌之名  「奧德修斯」四格可敲可不敲。敲了加分、怒氣上升；不敲不扣分。怒氣滿就被轟下桌。
 *   活的餐桌  格子會中途改變：手或杯子移開（變成要敲）、牛蹄飛來（變成不能敲）。提前兩拍預告。
 *   弓弦終章  最後幾行越來越快，最後一拍是放箭。
 *
 * 判定結果：
 *   perfect／good  字格敲中
 *   sung           名字格敲了（perfect 標明是否正中）
 *   held           名字格忍住沒唱（不扣分）
 *   struck         障礙格上敲了（kind 分手、食物、酒杯、牛蹄）
 *   dodge          障礙格忍住沒敲
 *   miss           字格該敲沒敲
 *   off            不在任何可判定的拍上（side：early 太早、late 太晚）
 *   idle           開場數拍或全曲結束後的敲擊，那裡沒有呈現拍點，不判定
 * advance 另外回傳 warn（開始預告）與 change（格子真的變了）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../troy-prologue/risset.js'));
  else root.BardRules = factory(root.RissetRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';
  const K = (R && R.T) || {};
  const DEFAULTS = {
    beat: 0.625,                                      // 一拍幾秒（96 BPM）
    lead: 4,                                          // 開場數幾拍
    perfect: K.STEP_WIN != null ? K.STEP_WIN : 0.08,
    good: K.CROUCH_STEP_WIN != null ? K.CROUCH_STEP_WIN : 0.16,
    comboLyre: 8,                                     // 連擊到這裡，琴聲加入
    comboChorus: 20,                                  // 連擊到這裡，眾人和聲加入
    finale: 0.6,                                      // 終章最快時，一拍是原本的幾倍長
    angerName: 10,                                    // 唱一格名字加多少怒氣（滿分 100）
    angerStruck: 12,                                  // 敲到東西加多少怒氣
    angerOff: 3,                                      // 錯拍加多少怒氣
    angerCalm: 0.7,                                   // 每做對一格普通格，怒氣降多少
  };
  const KINDS = { H: 'hand', F: 'food', C: 'cup' };
  const NAME = ['奧', '德', '修', '斯'];

  // 原創詩句，每行 8 拍。H＝求婚者的手、F＝食物、C＝酒杯。
  // (C字)＝一開始被杯子蓋住，開拍前移開露出字；(!字)＝一開始是字，開拍前牛蹄飛來蓋住。
  // 【經典】求婚者占據伊薩卡大廳、吟遊詩人在宴上被迫歌唱、乞丐坐在門檻、弓。
  // 【原典】求婚者丟牛蹄打乞丐（第 20 卷）。【電影，待確認】詩人在求婚者面前唱奧德修斯的戰功。
  // 【改編】敲桌玩法、詩句、唱名字會激怒求婚者。
  const CHART = [
    '歌唱吧繆斯請開口',
    '唱那漂泊的歸鄉人',
    '海風吹過F伊薩卡',
    '大廳滿是C求婚者',
    '他們喝光H主人酒',
    '他們吃盡F主人羊',
    '琴聲C不敢H停歇',
    '詩人唱起奧德修斯',
    '手掌(H伸)來F又縮回',
    '桌面(C留)下H一道隙',
    '有人(!舉)杯CH怒罵',
    '誰敢再提奧德修斯',
    '碗盤(!飛)過FC門檻',
    '乞丐(H抬)起HF雙眼',
    '奧德修斯拉滿長弓',
    '弦響FC一箭H穿',
  ];
  const RAMP_LINES = 3;
  // 試驗場固定場景：每個機制一個，循環播放
  const LAB_SCENES = {
    basic: { name: '基本：字與障礙', lines: ['歌聲H起落F再C', '敲在C空位H上F'], ramp: 0 },
    name: { name: '禁忌之名', lines: ['詩人唱起奧德修斯', '敢唱F奧德修斯H'], ramp: 0 },
    live: { name: '活的餐桌', lines: ['手掌(H伸)來F又縮回', '有人(!舉)杯CH怒罵'], ramp: 0 },
    finale: { name: '弓弦終章', lines: ['奧德修斯拉滿長弓', '弦響FC一箭H穿'], ramp: 2 },
  };

  function sanitize(p) {
    const P = Object.assign({}, DEFAULTS, p);
    P.beat = Math.max(0.3, P.beat);
    P.finale = Math.max(0.4, Math.min(1, P.finale));
    P.perfect = Math.max(0.01, P.perfect);
    // 判定窗不能超過最快那一拍的一半，否則相鄰兩格會搶同一下
    P.good = Math.min(Math.max(P.good, P.perfect), P.beat * P.finale * 0.45);
    P.perfect = Math.min(P.perfect, P.good);
    return P;
  }

  function tokens(text) { return text.match(/\([HFC!][^)]\)|[\s\S]/gu) || []; }

  function parseChart(lines, P) {
    const cells = [];
    lines.forEach((text, line) => {
      const toks = tokens(text);
      if (toks.length !== 8) throw new Error(`第 ${line + 1} 行不是 8 拍：${text}`);
      const nameAt = new Set();
      for (let p = 0; p <= 4; p++) if (NAME.every((ch, k) => toks[p + k] === ch)) for (let k = 0; k < 4; k++) nameAt.add(p + k);
      toks.forEach((tok, pos) => {
        let kind, ch, to = null;
        if (tok.length > 1) {
          const m = Array.from(tok); ch = m[2];
          if (m[1] === '!') { kind = 'word'; to = 'hoof'; } else { kind = KINDS[m[1]]; to = 'word'; }
        } else if (KINDS[tok]) { kind = KINDS[tok]; ch = ''; }
        else { kind = nameAt.has(pos) ? 'name' : 'word'; ch = tok; }
        cells.push({ i: cells.length, line, pos, kind, from: kind, ch, to, t: 0, warnAt: null, changeAt: null, warned: false, changed: false, res: null, dt: null });
      });
    });
    // 排時間：終章每拍逐漸變短
    const n = cells.length, ramp = (P.ramp || 0) * 8, start = n - ramp;
    let T = P.lead * P.beat;
    cells.forEach((c, i) => {
      c.t = T;
      const k = ramp && i >= start ? (i - start + 1) / ramp : 0;
      T += P.beat * (1 - (1 - P.finale) * k);
    });
    // 會變的格子：前三拍開始預告，前一拍真的變，所以有兩拍可以看
    cells.forEach((c, i) => {
      if (!c.to) return;
      c.warnAt = i >= 3 ? cells[i - 3].t : c.t - 3 * P.beat;
      c.changeAt = i >= 1 ? cells[i - 1].t : c.t - P.beat;
    });
    return cells;
  }

  function createGame(lines, params) {
    const chart = lines || CHART, P = sanitize(params);
    if (P.ramp == null) P.ramp = chart === CHART ? RAMP_LINES : 0;
    const cells = parseChart(chart, P);
    return {
      P, cells, next: 0, phase: 'play', combo: 0, best: 0, anger: 0, thrown: false,
      names: cells.filter((c) => c.from === 'name').length,
      counts: { perfect: 0, good: 0, dodge: 0, miss: 0, off: 0, sung: 0, held: 0, struck: { hand: 0, food: 0, cup: 0, hoof: 0 } },
      duration: cells[cells.length - 1].t + P.beat,
    };
  }

  function bump(g) { g.combo++; if (g.combo > g.best) g.best = g.combo; }
  function calm(g) { g.anger = Math.max(0, g.anger - g.P.angerCalm); }
  function rage(g, n) {
    g.anger = Math.min(100, g.anger + n);
    if (g.anger >= 100) { g.thrown = true; g.phase = 'end'; }
  }

  /** 時間推進到 t：處理格子變化，走過判定窗還沒結果的格子定案。回傳這次的事件。 */
  function advance(g, t) {
    const out = [];
    for (let j = g.next; j < g.cells.length; j++) {
      const c = g.cells[j];
      if (c.t - 4 * g.P.beat > t) break;
      if (!c.to || c.res) continue;
      if (!c.warned && t >= c.warnAt) { c.warned = true; out.push({ type: 'warn', cell: c }); }
      if (!c.changed && t >= c.changeAt) { c.changed = true; c.kind = c.to; out.push({ type: 'change', cell: c }); }
    }
    while (g.next < g.cells.length) {
      const c = g.cells[g.next];
      if (c.res) { g.next++; continue; }
      if (t <= c.t + g.P.good) break;
      if (c.kind === 'word') { c.res = 'miss'; g.counts.miss++; g.combo = 0; out.push({ type: 'miss', cell: c }); }
      else if (c.kind === 'name') { c.res = 'held'; g.counts.held++; out.push({ type: 'held', cell: c }); }
      else { c.res = 'dodge'; g.counts.dodge++; bump(g); calm(g); out.push({ type: 'dodge', cell: c }); }
      g.next++;
    }
    if (g.phase === 'play' && t >= g.duration) g.phase = 'end';
    return out;
  }

  function nearest(g, t) {
    let lo = 0, hi = g.cells.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g.cells[m].t <= t) lo = m; else hi = m; }
    return Math.abs(g.cells[lo].t - t) <= Math.abs(g.cells[hi].t - t) ? g.cells[lo] : g.cells[hi];
  }

  /** 在時間 t 敲一下。回傳 { events：先定案的事件, result：這一下的判定 }。 */
  function press(g, t) {
    const events = advance(g, t);
    const P = g.P, n = g.cells.length;
    if (g.phase !== 'play' || t < g.cells[0].t - P.beat / 2 || t > g.cells[n - 1].t + P.good) return { events, result: { type: 'idle' } };
    const c = nearest(g, t), dt = t - c.t;
    let result;
    if (Math.abs(dt) <= P.good + 1e-9 && !c.res) {
      c.dt = dt;
      const exact = Math.abs(dt) <= P.perfect + 1e-9;
      if (c.kind === 'word') {
        const type = exact ? 'perfect' : 'good';
        c.res = type; g.counts[type]++; bump(g); calm(g);
        result = { type, cell: c, dt };
      } else if (c.kind === 'name') {
        c.res = 'sung'; g.counts.sung++; bump(g); rage(g, P.angerName);
        result = { type: 'sung', perfect: exact, cell: c, dt };
      } else {
        c.res = 'struck'; g.counts.struck[c.kind]++; g.combo = 0; rage(g, P.angerStruck);
        result = { type: 'struck', kind: c.kind, cell: c, dt };
      }
    } else {
      g.counts.off++; g.combo = 0; rage(g, P.angerOff);
      result = { type: 'off', side: dt < 0 ? 'early' : 'late', cell: c, dt };
    }
    return { events, result };
  }

  /** 目前時間對應第幾格（可有小數），畫面用來捲動桌子。 */
  function posAt(g, t) {
    const c = g.cells, n = c.length;
    if (t <= c[0].t) return (t - c[0].t) / g.P.beat;
    if (t >= c[n - 1].t) return n - 1 + (t - c[n - 1].t) / g.P.beat;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m].t <= t) lo = m; else hi = m; }
    return lo + (t - c[lo].t) / (c[hi].t - c[lo].t);
  }

  function struckCount(g) { const s = g.counts.struck; return s.hand + s.food + s.cup + s.hoof; }

  /** 正確率 0～1，不算名字格（不唱也能滿分）：敲到東西扣一格、錯拍扣半格。 */
  function accuracy(g) {
    const s = g.counts, total = g.cells.length - g.names;
    return Math.max(0, Math.min(1, (s.perfect + 0.7 * s.good + s.dodge - struckCount(g) - 0.5 * s.off) / total));
  }

  function score(g) { return Math.round(accuracy(g) * 1000) + g.counts.sung * 100; }

  function verdict(g) {
    const a = accuracy(g);
    if (g.thrown) return { rank: 0, title: '被轟下桌', text: '骨頭飛過大廳。吟遊詩人抱著琴退到牆邊。' };
    if (a >= 0.9 && g.names > 0 && g.counts.sung === g.names) return { rank: 4, title: '唱響他的名字', text: '那個名字迴盪在大廳。門檻上的乞丐，拉開了弓。' };
    if (a >= 0.9) return { rank: 3, title: '滿堂靜聽', text: '全廳安靜下來。連求婚者也忘了舉杯。' };
    if (a >= 0.7) return { rank: 2, title: '歌沒有斷', text: '歌一路唱到最後。吟遊詩人保住了今晚的飯。' };
    if (a >= 0.45) return { rank: 1, title: '勉強唱完', text: '幾個求婚者皺起眉。歌還是唱完了。' };
    return { rank: 1, title: '走音連連', text: '歌斷斷續續。求婚者的笑聲蓋過了琴。' };
  }

  return { DEFAULTS, CHART, LAB_SCENES, KINDS, RAMP_LINES, sanitize, parseChart, createGame, advance, press, posAt, accuracy, score, verdict, struckCount };
});
