/* playtest-recorder 設定檔：比箭・Risset 版（prototypes/bow-risset/）
 *
 * 程式玩家在頁面裡跑（window.bowRissetDebug.autoplay，邏輯是 BowRissetRules.createBot）：
 *   上弦（把指針往中間推）→ 轉到瞄準窗中心 → 按住拉弓 → 等心跳驟降 → 驟降裡 0.15 秒放手。
 *   預設一輪「抓驟降」（等第 2 次驟降，讓第 1 次驟降錄得乾淨）、一輪「抓最高速」（p ≥ 0.85 就放），交替，方便比較。
 *   --no-bot 時不開程式玩家。
 * probe：t＝音訊時鐘；blind＝心跳驟降（全場靜止的 0.5 秒，給分析檢查「驟降時整體音量比前後低」）；
 *   alert＝求婚者起鬨最兇（人聲 > 0.85）；beats＝這一幀新排進音訊時鐘的心跳拍（給 expectedBeats）。
 */

export default {
  name: 'bow-risset',
  title: '比箭・Risset 版',
  dir: '../../../prototypes/bow-risset',
  page: 'index.html',
  viewport: { width: 960, height: 540 },
  renderScale: 0.5,
  defaults: { duration: 60 },

  async prepare(page) {
    await page.waitForFunction(() => window.BowRissetRules && window.BowRissetAudio && window.bowRissetDebug, null, { timeout: 30000 });
    await page.evaluate(() => { window.__bowEvents = []; window.bowRissetDebug.startAudio(); });
    await page.waitForFunction(() => { const a = window.bowRissetDebug.audio; return a && a.ctx.state === 'running'; }, null, { timeout: 15000 });
    return page.evaluate(() => {
      const T = window.BowRissetRules.TUNING;
      return { rules: { BLIND: T.heart.dropLen, firstDrop: T.heart.firstDrop, cycle0: T.heart.cycle0, cycleMin: T.heart.cycleMin, M: T.heart.M, layers: T.heart.layers },
               audioConst: window.BowRissetAudio.CONST };
    });
  },

  probe: function () {
    const D = window.bowRissetDebug, round = D && D.state, a = D && D.audio;
    if (!round || !a || D.offset === null) return null;
    const evs = [];
    const NAME = { fire: 'twang', strung: 'thunder', heckleCue: 'heckle_cue', heckleHit: 'heckle_hit', stop: 'stop', slip: 'slip' };
    for (const e of (window.__bowEvents || []).splice(0)) {
      if (NAME[e.type]) evs.push({ type: 'cue', name: NAME[e.type] + (e.kind ? '_' + e.kind : ''), at: e.at });
      if (e.type === 'dropStart' || e.type === 'result' || e.type === 'drawStart') evs.push({ type: 'state', key: e.type, to: e.j != null ? e.j : 1, at: e.at });
    }
    const beats = a.drainLog().filter(x => x.type === 'beat').map(x => [+x.t.toFixed(4), x.gain]);
    const hb = round.hb || { mode: 'rest', p: 0, drop: false, j: 0, s: 0 };
    const drop = round.phase === 'aim' && hb.mode === 'risset' && !!hb.drop;
    return {
      t: +a.now().toFixed(4), phase: round.phase, mode: hb.mode, p: +hb.p.toFixed(4), j: hb.j,
      blind: drop, dropS: drop ? +(hb.s + D.offset).toFixed(4) : null,
      alert: round.phase === 'aim' && round.crowd > 0.85, hunted: false, crowd: +(round.crowd || 0).toFixed(3),
      power: +round.draw.power.toFixed(2), stage: round.draw.stage, tension: +round.str.tension.toFixed(2),
      sway: +(Math.hypot(round.draw.sway.yaw, round.draw.sway.pitch) * 1000).toFixed(3),
      win: round.result ? !!round.result.win : null,
      beats, events: evs
    };
  },

  bot: function (api, s, st) {
    const D = window.bowRissetDebug;
    if (!st.on) { D.autoplay({ release: 'drop', dropIndex: 1, peakP: 0.85, alternate: true }); st.on = true; api.log('autoplay', 'drop/peak 交替'); }
    const r = D.state.result;
    if (r && !st.logged) { st.logged = true; api.log('result', { win: r.win, passed: r.passed, inDrop: r.inDrop, stage: r.stage }); }
    if (!r) st.logged = false;
  },

  intervals(timeline) {
    const blind = [], alert = [];
    let cur = null;
    for (const s of timeline) {
      if (s.blind && s.dropS != null) { if (!cur || cur[0] !== s.dropS) { cur = [s.dropS, s.dropS + 0.5]; blind.push(cur); } }
    }
    let a = null;
    for (const s of timeline) {
      if (s.alert && !a) a = [s.t, s.t]; else if (s.alert) a[1] = s.t; else if (a) { a[1] = s.t; alert.push(a); a = null; }
    }
    if (a) alert.push(a);
    return { blind, alert, hunted: [] };
  },

  expectedBeats(timeline) {
    const out = [];
    for (const s of timeline) for (const [t, w] of s.beats || []) out.push({ t, w, kind: 'risset' });
    out.sort((x, y) => x.t - y.t);
    return out;
  }
};
