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
  viewport: { width: 1280, height: 720 },
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
        rules: { CYCLE: g.T.CYCLE, BLIND: g.T.BLIND, BASS_PERIOD: g.T.BASS_PERIOD, BASS_WIN: g.T.BASS_WIN } };
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
      t: +g.time.toFixed(4),
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
   *   相位 > 0.56 一律停下並屏息（p > 0.6 亂動會被立即追殺）；屏息快滿 6 秒就放開，避免喘氣。
   *   失敗時等 1.5 秒按 R 重來。 */
  bot: function (api, s, st) {
    const D = window.TroyDebug, g = D.game;
    if (!g) return;
    const t = s.t, p = s.p, P = g.player;
    const fdt = Math.min(0.12, Math.max(0.008, (s.fdt || 16) / 1000));
    st.fd = st.fd ? st.fd * 0.8 + fdt * 0.2 : fdt;     // 平滑後的幀間隔，預測「下一幀」的音訊時間
    if (g.phase === 'fail') {
      api.releaseAll();
      if (!st.failAt) { st.failAt = t; api.log('fail', g.failReason); }
      if (t - st.failAt > 1.5) { st.failAt = 0; api.press('KeyR'); api.log('retry'); }
      return;
    }
    if (g.phase !== 'play') { api.releaseAll(); return; }
    D.V.yaw = -Math.PI / 2; D.V.pitch = g.zone === 1 ? -0.35 : -0.12;   // 面向東：W＝往城門方向

    let fwd = 0, breath = false;
    const highP = p > 0.56;
    const canBreath = P.breathT < 5.2 && !P.breathLock;

    // 安撫：每一個低音拍按一次 Q（按下的效果在下一幀的 step 才生效，所以挑「下一幀最接近拍點」的那一幀按）
    if (g.panic.active) {
      st.sawPanic = true;
      const b = g.bass.nextBeat;
      const lead = b - t;
      if (lead >= 0 && Math.abs(lead - st.fd) <= st.fd / 2 + 0.004 && (st.lastQ == null || t - st.lastQ > 1.6)) {
        api.press('KeyQ'); st.lastQ = t; api.log('calm_press', { beat: +b.toFixed(4), predicted: +(t + st.fd).toFixed(4) });
      }
      breath = highP && canBreath;
    } else if (g.zone === 1) {
      if (!st.sawPanic) {               // 引起注意
        const q = g.guards.find(x => x.active);
        if (!highP && p > 0.08 && q) {
          const tx = Math.max(5.7, Math.min(10.0, q.x));
          if (tx > P.x + 0.3) fwd = 1; else if (tx < P.x - 0.3) fwd = -1;
          else fwd = (Math.floor(t * 4) % 2) ? 1 : -1;      // 已在正上方：小幅來回挪動
          if (P.x > 9.9 && fwd > 0) fwd = -1;
        }
        breath = highP && canBreath;
      } else {                          // 安撫完：下一個盲區衝刺到暗門
        if (s.blind) {
          fwd = 1;
          if (st.dashCycle !== s.cyc) { st.dashCycle = s.cyc; api.press('ShiftLeft'); api.log('dash_press'); }
        } else breath = highP && canBreath;
      }
    } else {                            // 區 2 之後：躲在影子裡不動，高相位屏息
      breath = p > 0.5 && canBreath;
    }
    if (breath) fwd = 0;
    api.set('Space', breath);
    api.set('KeyW', fwd > 0);
    api.set('KeyS', fwd < 0);
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
