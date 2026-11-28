/*
 * 吟遊詩人敲桌：規則核心（純邏輯，不碰畫面與聲音）。
 * 瀏覽器：全域 BardRules；Node：module.exports。設計見 docs/design/2026-11-22-bard-table.md。
 *
 * 一拍一格：格子是「字」就要敲，格子上有手、食物、酒杯就不能敲。
 * 判定寬度沿用木馬之夜（risset.js）：±STEP_WIN 算準，±CROUCH_STEP_WIN 算差一點，不另訂一套。
 *
 * 判定結果：
 *   perfect／good  字格敲中
 *   struck         障礙格上敲了（kind 分手、食物、酒杯）
 *   dodge          障礙格忍住沒敲
 *   miss           字格該敲沒敲
 *   off            不在任何可判定的拍上（side：early 太早、late 太晚）
 *   idle           開場數拍或全曲結束後的敲擊，那裡沒有呈現拍點，不判定
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
  };
  const KINDS = { H: 'hand', F: 'food', C: 'cup' };

  // 原創詩句，每行 8 拍。H＝求婚者的手、F＝食物、C＝酒杯。
  // 【經典】求婚者占據伊薩卡大廳、吟遊詩人在宴上被迫歌唱、乞丐坐在門檻、弓。【改編】敲桌玩法與詩句。
  const CHART = [
    '歌唱吧繆斯請開口',
    '唱那漂泊的歸鄉人',
    '海風吹過F伊薩卡',
    '大廳滿是C求婚者',
    '他們喝光H主人酒',
    '他們吃盡F主人羊',
    '琴聲C不敢H停歇',
    '詩人F低頭C輕敲',
    '手掌H伸來F又去',
    '桌面C留下H空隙',
    'HF等那一拍CH',
    '靜候FC歸人HF',
    '門檻H坐著C乞丐',
    '他抬頭FC弓將鳴',
  ];
  // 試驗場固定場景：兩行含全部三種障礙，循環播放
  const LAB_CHART = ['歌聲H起落F再C', '敲在C空位H上F'];

  function sanitize(p) {
    const P = Object.assign({}, DEFAULTS, p);
    P.beat = Math.max(0.3, P.beat);
    P.perfect = Math.max(0.01, P.perfect);
    // 判定窗不能超過半拍，否則相鄰兩格會搶同一下
    P.good = Math.min(Math.max(P.good, P.perfect), P.beat * 0.45);
    P.perfect = Math.min(P.perfect, P.good);
    return P;
  }

  function parseChart(lines, P) {
    const cells = [];
    lines.forEach((text, line) => {
      const toks = Array.from(text);
      if (toks.length !== 8) throw new Error(`第 ${line + 1} 行不是 8 拍：${text}`);
      toks.forEach((ch, pos) => {
        const i = cells.length;
        cells.push({ i, line, pos, kind: KINDS[ch] || 'word', ch: KINDS[ch] ? '' : ch, t: (P.lead + i) * P.beat, res: null, dt: null });
      });
    });
    return cells;
  }

  function createGame(lines, params) {
    const P = sanitize(params);
    const cells = parseChart(lines || CHART, P);
    return {
      P, cells, next: 0, phase: 'play', combo: 0, best: 0,
      counts: { perfect: 0, good: 0, dodge: 0, miss: 0, off: 0, struck: { hand: 0, food: 0, cup: 0 } },
      duration: (P.lead + cells.length + 1) * P.beat,
    };
  }

  function bump(g) { g.combo++; if (g.combo > g.best) g.best = g.combo; }

  /** 時間推進到 t：走過判定窗還沒結果的格子定案。回傳這次定案的事件。 */
  function advance(g, t) {
    const out = [];
    while (g.next < g.cells.length) {
      const c = g.cells[g.next];
      if (c.res) { g.next++; continue; }
      if (t <= c.t + g.P.good) break;
      if (c.kind === 'word') { c.res = 'miss'; g.counts.miss++; g.combo = 0; out.push({ type: 'miss', cell: c }); }
      else { c.res = 'dodge'; g.counts.dodge++; bump(g); out.push({ type: 'dodge', cell: c }); }
      g.next++;
    }
    if (g.phase === 'play' && t >= g.duration) g.phase = 'end';
    return out;
  }

  /** 在時間 t 敲一下。回傳 { events：先定案的格子, result：這一下的判定 }。 */
  function press(g, t) {
    const events = advance(g, t);
    const P = g.P, n = g.cells.length;
    if (!n || t < g.cells[0].t - P.beat / 2 || t > g.cells[n - 1].t + P.good) return { events, result: { type: 'idle' } };
    const idx = Math.max(0, Math.min(n - 1, Math.round(t / P.beat - P.lead)));
    const c = g.cells[idx], dt = t - c.t;
    let result;
    if (Math.abs(dt) <= P.good + 1e-9 && !c.res) {
      c.dt = dt;
      if (c.kind === 'word') {
        const type = Math.abs(dt) <= P.perfect + 1e-9 ? 'perfect' : 'good';
        c.res = type; g.counts[type]++; bump(g);
        result = { type, cell: c, dt };
      } else {
        c.res = 'struck'; g.counts.struck[c.kind]++; g.combo = 0;
        result = { type: 'struck', kind: c.kind, cell: c, dt };
      }
    } else {
      g.counts.off++; g.combo = 0;
      result = { type: 'off', side: dt < 0 ? 'early' : 'late', cell: c, dt };
    }
    return { events, result };
  }

  /** 正確率 0～1：敲到東西扣一格、錯拍扣半格，所以閉眼連打或完全不敲都拿不到高分。 */
  function accuracy(g) {
    const s = g.counts, struck = s.struck.hand + s.struck.food + s.struck.cup;
    return Math.max(0, Math.min(1, (s.perfect + 0.7 * s.good + s.dodge - struck - 0.5 * s.off) / g.cells.length));
  }

  function verdict(a) {
    if (a >= 0.9) return { rank: 3, title: '滿堂靜聽', text: '全廳安靜下來。連求婚者也忘了舉杯。' };
    if (a >= 0.7) return { rank: 2, title: '歌沒有斷', text: '歌一路唱到最後。吟遊詩人保住了今晚的飯。' };
    if (a >= 0.45) return { rank: 1, title: '勉強唱完', text: '幾個求婚者皺起眉。歌還是唱完了。' };
    return { rank: 0, title: '被轟下桌', text: '骨頭飛過大廳。吟遊詩人抱著琴退到牆邊。' };
  }

  return { DEFAULTS, CHART, LAB_CHART, KINDS, sanitize, parseChart, createGame, advance, press, accuracy, verdict };
});
