/* playtest-recorder 設定檔：序章《特洛伊的迴響》木馬之夜（prototypes/troy-prologue/）
 *
 * 設定檔介面（其他原型照抄這個形狀即可）：
 *   dir / page        要服務的資料夾（相對本檔）與入口頁
 *   prepare(page,o)   載入後的準備：調參、按「開始」；o 是命令列選項
 *   probe()           在頁面裡每幀執行，回傳一筆狀態（必須含 t＝音訊時間；可含 blind、alert、events）
 *   bot(api,s,st)     程式玩家，每幀在頁面裡執行；api.down/up/press(code) 派送鍵盤事件
 *   expectedBeats(tl) 在 Node 端由時間軸算出「規則上的拍點」{t, w, kind}，給分析比對起音
 * probe 與 bot 會被 toString() 送進頁面，所以只能用頁面裡的全域變數，不能引用本檔的東西。
 */

export default {
  name: 'troy-prologue',
  title: '木馬之夜',
  dir: '../../../prototypes/troy-prologue',
  page: 'index.html',
  viewport: { width: 960, height: 540 },
  renderScale: 0.5,                     // 無 GPU 的雲端：三維場景以半解析度算圖，幀率約 2 倍
  defaults: { duration: 80 },

  async prepare(page, o) {
    await page.waitForFunction(() => window.TroyDebug && window.RissetRules && window.RissetAudio, null, { timeout: 30000 });
    const cycle = o.cycle ? +o.cycle : null;
    await page.evaluate(({ cycle, phaseBar }) => {
      const sel = document.getElementById('oT');
      if (cycle && sel) {               // 放慢循環：在難度選單加一個選項（遊戲本身把它同時交給規則與聲音）
        if (![...sel.options].some(x => +x.value === cycle)) {
          const op = document.createElement('option'); op.value = String(cycle); op.textContent = cycle + ' 秒（錄製用）'; sel.appendChild(op);
        }
        sel.value = String(cycle);
      }
      const ph = document.getElementById('oPhase');
      if (ph && phaseBar) { ph.checked = true; ph.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { cycle, phaseBar: o.phaseBar !== false });
    await page.click('#btnStart');
    await page.waitForFunction(() => window.TroyDebug.game && window.TroyDebug.audio && window.TroyDebug.game.time != null, null, { timeout: 15000 });
    return page.evaluate(() => {
      const C = window.RissetAudio.CONST || {};
      const g = window.TroyDebug.game;
      return { audioConst: { M: C.M, LAYERS: C.LAYERS, BELL_SIGMA: C.BELL_SIGMA, MIN_GAIN: C.MIN_GAIN, BLIND: C.BLIND },
        rules: { CYCLE: g.T.CYCLE, BLIND: g.T.BLIND_LEN != null ? g.T.BLIND_LEN : g.T.BLIND, BASS_PERIOD: g.T.BASS_PERIOD, BASS_WIN: g.T.BASS_WIN } };
    });
  },

  probe: function () {
    const D = window.TroyDebug, g = D && D.game, a = D && D.audio;
    if (!g || g.time == null || !a) return null;
    const R = window.__rec;
    const evs = [];
    if (!a.__recHooked) {               // 記錄每一個送進聲音層的 cue（實際音訊時間）
      const orig = a.cue;
      a.cue = function (n) { (R._cues || (R._cues = [])).push({ type: 'cue', name: String(n), at: a.now() }); return orig.apply(this, arguments); };
      a.__recHooked = true;
    }
    if (R._cues && R._cues.length) { for (const c of R._cues.splice(0)) evs.push(c); }
    const ps = R._ps || (R._ps = {});
    const P = g.player || {};
    const now = {
      phase: g.phase, zone: g.zone, panic: !!(g.panic && g.panic.active), hunted: !!g.hunted,
      calm: g.panic ? g.panic.count : 0, cycle: g.cycle.index
    };
    for (const k in now) if (ps[k] !== undefined && ps[k] !== now[k]) evs.push({ type: 'state', key: k, from: ps[k], to: now[k] });
    Object.assign(ps, now);
    let near = null, nd = 1e9;
    for (const q of g.guards || []) {
      if (!q.active) continue;
      const d = Math.hypot(q.x - P.x, q.z - P.z, P.y || 0);
      if (d < nd) { nd = d; near = q; }
    }
    return {
      t: +a.now().toFixed(4), gt: +g.time.toFixed(4),   // t＝音訊時鐘（暫停、失敗畫面時也繼續走）；gt＝規則最後一次 step 的時間
      p: +g.cycle.p.toFixed(4), blind: !!g.cycle.blind, cyc: g.cycle.index,
      alert: now.panic, hunted: now.hunted, alarm: +(g.alarm || 0).toFixed(3),
      phase: g.phase, zone: g.zone, calm: now.calm,
      x: +(P.x || 0).toFixed(2), z: +(P.z || 0).toFixed(2), breath: !!P.breathing, breathT: +(P.breathT || 0).toFixed(2),
      hidden: !!P.hidden, moving: !!P.moving,
      gd: near ? +nd.toFixed(2) : null, gs: near ? near.state : null, gsusp: near ? +near.susp.toFixed(2) : null,
      bassAnchor: +g.bass.anchor.toFixed(4), bassNext: +g.bass.nextBeat.toFixed(4), bassPer: g.bass.period,
      cT: g.cycle.T, ct0: g.cycle.t0,
      events: evs
    };
  },

  /* 程式玩家：
   *   區 1（木馬腹中）：低相位時朝木馬下的衛兵移動，故意讓他起疑 → 跟著低音 bass.nextBeat 按 Q 安撫 4 次
   *   → 安撫完的下一個盲區按住 W＋Shift 衝刺到暗門 → 區 2 躲在木馬的影子裡，高相位屏息。
   *   相位 > 0.56 一律停下（p > 0.6 亂動會被立即追殺）；p > 0.62 到下一輪 p < 0.12 屏息（吐氣聲落在盲區之後）；
   *   屏息快滿 6 秒就放開，避免喘氣。
   *   失敗時等 1.5 秒按 R 重來。 */
  bot: function (api, s, st) {
    const D = window.TroyDebug, g = D.game;
    if (!g) return;
    const t = s.t, p = s.p, P = g.player;
    const fdt = Math.min(0.12, Math.max(0.008, (s.fdt || 16) / 1000));
    st.fd = st.fd ? st.fd * 0.8 + fdt * 0.2 : fdt;     // 平滑後的幀間隔，預測「下一幀」的音訊時間
    if (g.phase === 'fail') {
      api.releaseAll();
      if (!st.failAt) { st.failAt = s.wall; api.log('fail', g.failReason); }
      if (s.wall - st.failAt > 1500) {   // 失敗畫面停 1.5 秒後按 R；程式玩家狀態歸零（重新引起注意、重新安撫）
        for (const k of Object.keys(st)) delete st[k];
        api.press('KeyR'); api.log('retry');
      }
      return;
    }
    if (g.phase !== 'play') { api.releaseAll(); return; }
    D.V.yaw = -Math.PI / 2; D.V.pitch = g.zone === 1 ? -0.35 : -0.12;   // 面向東：W＝往城門方向

    let fwd = 0, breath = false;
    const highP = p > 0.56;
    const canBreath = P.breathT < 5.2 && !P.breathLock;
    // 屏息時段跨過盲區（p > 0.62 或 p < 0.12），讓「吐氣」聲落在盲區之後，不污染盲區的音量量測
    const holdWrap = (p > 0.62 || p < 0.12) && canBreath;

    // 安撫：每一個低音拍按一次 Q。注入的取樣迴圈比遊戲的 rAF 先註冊，同一幀裡先跑 bot 再跑 game.step，
    // 所以按下的效果就在「這一幀」的音訊時間生效。無頭環境常卡頓數百毫秒，所以不等「最準的那一幀」：
    // 早 0.10～晚 0.12 秒內（規則容許 ±0.15）就按。
    if (g.panic.active) {
      st.sawPanic = true;
      const per = g.bass.period, an = g.bass.anchor;
      const b = an + Math.round((t - an) / per) * per;
      const off = t - b;
      const fresh = st.pressedBeat == null || Math.abs(b - st.pressedBeat) > 0.5;
      if (b >= an - 1e-6 && off >= -0.10 && off <= 0.12 && fresh && (st.lastQ == null || t - st.lastQ > 1.2)) {
        api.press('KeyQ'); st.lastQ = t; st.pressedBeat = b;
        api.log('calm_press', { beat: +b.toFixed(4), off: +off.toFixed(4) });
      }
      breath = holdWrap;
    } else if (g.zone === 1) {
      if (!st.sawPanic) {               // 引起注意
        const q = g.guards.find(x => x.active);
        if (!highP && p > 0.08 && q) {
          const tx = Math.max(5.7, Math.min(10.0, q.x));
          if (tx > P.x + 0.3) fwd = 1; else if (tx < P.x - 0.3) fwd = -1;
          else fwd = (Math.floor(t * 4) % 2) ? 1 : -1;      // 已在正上方：小幅來回挪動
          if (P.x > 9.9 && fwd > 0) fwd = -1;
        }
        breath = holdWrap;
      } else {                          // 安撫完：下一個盲區衝刺到暗門
        if (s.blind) {
          fwd = 1;
          if (st.dashCycle !== s.cyc) { st.dashCycle = s.cyc; api.press('ShiftLeft'); api.log('dash_press'); }
        } else breath = p > 0.56 && p < 0.9 && canBreath;   // 要衝刺的那一輪：盲區前先換好氣
      }
    } else {                            // 區 2 之後：躲在影子裡不動，高相位屏息
      breath = holdWrap;
    }
    if (breath) fwd = 0;
    api.set('Space', breath);
    api.set('KeyW', fwd > 0);
    api.set('KeyS', fwd < 0);
  },

  /* 精確區段（給分析）：盲區由 (t0, CYCLE, BLIND) 算出；警戒＝panic.active、追殺＝hunted（以取樣幀為界，起點用 alert cue 的實際時間）。 */
  intervals(timeline, meta, events) {
    const B = ((meta.prepared || {}).rules || {}).BLIND || 0.5;
    const blind = [];
    const segs = [];
    for (const s of timeline) {
      const L = segs[segs.length - 1];
      if (!L || L.t0 !== s.ct0 || L.T !== s.cT) segs.push({ t0: s.ct0, T: s.cT, a: s.t, b: s.t }); else L.b = s.t;
    }
    for (const S of segs) for (let c = Math.floor((S.a - S.t0) / S.T); S.t0 + c * S.T <= S.b; c++) {
      const a = S.t0 + c * S.T; if (a + B >= S.a) blind.push([a, a + B]);
    }
    const run = (key) => {
      const out = []; let cur = null;
      for (const s of timeline) {
        const on = s[key] && s.phase === 'play';     // 失敗畫面不算
        if (on && !cur) cur = [s.t, s.t]; else if (on) cur[1] = s.t; else if (cur) { cur[1] = s.t; out.push(cur); cur = null; }
      }
      if (cur) out.push(cur);
      return out;
    };
    const alert = run('alert');
    const cues = (events || []).filter(e => e.type === 'cue' && /^alert$/i.test(e.name));
    for (const iv of alert) { const c = cues.find(e => e.at <= iv[0] + 1e-3 && e.at > iv[0] - 1); if (c) iv[0] = c.at; }
    return { blind, alert, hunted: run('hunted') };
  },

  /* 規則上的拍點（給分析比對）：Risset 4 層（盲區不排）＋低音網格。常數取自 prepare 回傳的 RissetAudio.CONST。 */
  expectedBeats(timeline, meta) {
    const C = Object.assign({ M: 7, LAYERS: 4, BELL_SIGMA: 0.22, MIN_GAIN: 0.02, BLIND: 0.5 }, (meta.prepared || {}).audioConst || {});
    for (const k in C) if (C[k] == null) delete C[k];
    const Cd = Object.assign({ M: 7, LAYERS: 4, BELL_SIGMA: 0.22, MIN_GAIN: 0.02, BLIND: 0.5 }, C);
    const out = [];
    if (!timeline.length) return out;
    const tA = timeline[0].t, tB = timeline[timeline.length - 1].t;
    // 依 (t0, T) 分段（重新開局時會變）
    const segs = [];
    for (const s of timeline) {
      const L = segs[segs.length - 1];
      if (!L || L.t0 !== s.ct0 || L.T !== s.cT) segs.push({ t0: s.ct0, T: s.cT, a: s.t, b: s.t, hunted: [] });
      else L.b = s.t;
    }
    const bell = (x) => { const d = (x - 0.5) / Cd.BELL_SIGMA; return Math.exp(-d * d); };
    for (const S of segs) {
      const c0 = Math.floor((S.a - S.t0) / S.T), c1 = Math.floor((S.b - S.t0) / S.T);
      for (let c = c0; c <= c1; c++) for (let k = 0; k < Cd.LAYERS; k++) {
        const Mk = Cd.M * Math.pow(2, k);
        for (let n = 0; n < Mk; n++) {
          const ph = Math.log2(1 + n / Mk), t = S.t0 + (c + ph) * S.T;
          if (t < S.a || t > S.b || ph * S.T < Cd.BLIND) continue;
          const w = bell((k + ph) / Cd.LAYERS);
          if (w < Cd.MIN_GAIN) continue;
          out.push({ t, w, kind: 'risset', layer: k });
        }
      }
    }
    // 低音：每段相同 anchor 的網格
    let i = 0;
    while (i < timeline.length) {
      const an = timeline[i].bassAnchor, per = timeline[i].bassPer || 2.4;
      let j = i; while (j + 1 < timeline.length && timeline[j + 1].bassAnchor === an) j++;
      const a = timeline[i].t, b = timeline[j].t;
      for (let m = Math.ceil((a - an) / per); an + m * per <= b; m++) {
        const t = an + m * per; if (t >= an - 1e-6 && t >= tA && t <= tB) out.push({ t, w: 1, kind: 'bass' });
      }
      i = j + 1;
    }
    out.sort((x, y) => x.t - y.t);
    return out;
  }
};
