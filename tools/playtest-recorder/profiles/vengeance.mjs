/* playtest-recorder 設定檔：大廳復仇（prototypes/vengeance/）
 *
 * 形狀照抄 profiles/troy-prologue.mjs：
 *   prepare  按「開始」；probe 每幀回傳狀態（t＝音訊時間、blind＝驟降空檔）；bot 程式玩家；
 *   intervals 給分析的精確空檔區段；expectedBeats 規則上的 Risset 拍與低音拍。
 * probe 與 bot 會被 toString() 送進頁面，只能用頁面全域變數（VengeanceRules、VengeanceDebug）。
 *
 * 程式玩家直接用規則模組裡的 VengeanceRules.botInput（和 node 測試裡通關的是同一個）：
 *   只在空檔射箭、照低音按 Q、看預備動作閃避或屏息、箭少了去撿。
 *   瞄準：直接設定鏡頭 V.yaw／V.pitch 再呼叫 VengeanceDebug.shoot()（等於點左鍵）；其他動作派送鍵盤事件。
 *   通關或失敗後等 4 秒按 R 再來一輪，讓 90 秒錄得到第二輪開頭。
 */

export default {
  name: 'vengeance',
  title: '大廳復仇',
  dir: '../../../prototypes/vengeance',
  page: 'index.html',
  viewport: { width: 960, height: 540 },
  renderScale: 0.5,
  defaults: { duration: 90 },
  // 玩家自己的動作音（放箭、倒地、桌板、屏息、閃避、盾…）走提示音匯流排、空檔不壓：有這些 cue 的那次空檔照列但不計入
  analysis: { thresholds: { blindConfoundCues: '^(shoot|down|shield_hit|miss|breath_in|breath_out|breath_ok|dodge|dodge_ok|block|hurt|tele_ok|tele_miss|gasp|pick|surrender|win|fall|empty|bow_busy)$' } },

  async prepare(page, o) {
    await page.waitForFunction(() => window.VengeanceDebug && window.VengeanceRules && window.VengeanceAudio, null, { timeout: 30000 });
    await page.click('#btnStart');
    await page.waitForFunction(() => window.VengeanceDebug.game && window.VengeanceDebug.audio, null, { timeout: 15000 });
    return page.evaluate(() => {
      const C = window.VengeanceAudio.CONST, g = window.VengeanceDebug.game;
      return { audioConst: { M: C.M, LAYERS: C.LAYERS, BELL_SIGMA: C.BELL_SIGMA, MIN_GAIN: C.MIN_GAIN, BLIND: g.T.GAP_LEN },
        rules: { CYCLE: g.T.CYCLE, BLIND: g.T.GAP_LEN, BASS_PERIOD: g.T.BASS_PERIOD, BASS_WIN: g.T.BASS_WIN } };
    });
  },

  probe: function () {
    const D = window.VengeanceDebug, g = D && D.game, a = D && D.audio;
    if (!g || !a || !D.actx) return null;
    const R = window.__rec, evs = [];
    if (!a.__recHooked) {               // 記錄每一個送進聲音層的 cue（實際音訊時間）
      const orig = a.cue;
      a.cue = function (n) { (R._cues || (R._cues = [])).push({ type: 'cue', name: String(n), at: a.now() }); return orig.apply(this, arguments); };
      a.__recHooked = true;
    }
    if (R._cues && R._cues.length) for (const c of R._cues.splice(0)) evs.push(c);
    const t = D.actx.currentTime, cy = window.VengeanceRules.cycleAt(t, g.t0, g.T);
    const act = window.VengeanceRules.activeAttacks(g, t);
    const ps = R._ps || (R._ps = {});
    const now = { phase: g.phase, hp: g.player.hp, left: window.VengeanceRules.leadersLeft(g) };
    for (const k in now) if (ps[k] !== undefined && ps[k] !== now[k]) evs.push({ type: 'state', key: k, from: ps[k], to: now[k] });
    Object.assign(ps, now);
    return {
      t: +t.toFixed(4), gt: +g.time.toFixed(4),
      p: +cy.p.toFixed(4), blind: !!(cy.gap && g.phase === 'play'), cyc: cy.index,
      alert: false, hunted: false, warn: act.length > 0,
      phase: g.phase, hp: g.player.hp, arrows: g.player.arrows, floor: g.floorArrows.length,
      left: now.left, shield: g.tele.until >= t && t >= g.tele.coolUntil,
      x: +g.player.x.toFixed(2), z: +g.player.z.toFixed(2), breath: !!g.player.breathing,
      bassAnchor: +g.bass.anchor.toFixed(4), bassPer: g.bass.period, cT: g.T.CYCLE, ct0: g.t0,
      events: evs
    };
  },

  bot: function (api, s, st) {
    const D = window.VengeanceDebug, g = D.game, R = window.VengeanceRules;
    if (!g) return;
    if (g.phase !== 'play') {
      api.releaseAll();
      if (!st.endAt) { st.endAt = s.wall; api.log(g.phase, g.stats); }
      if (s.wall - st.endAt > 4000) {
        for (const k of Object.keys(st)) delete st[k];
        api.press('KeyR'); api.log('retry');
      }
      return;
    }
    st.mem = st.mem || {};
    const t = D.actx.currentTime;
    const inp = R.botInput(g, t, st.mem);
    // 鏡頭：沒有要射、沒有要走時慢慢轉回正前方
    if (inp.shoot) { D.V.yaw = inp.yaw; D.V.pitch = inp.pitch; }
    else if (inp.mx || inp.mz) { D.V.yaw = R.yawTo(inp.mx, inp.mz); D.V.pitch = inp.pitch != null ? inp.pitch : -0.3; }
    else { D.V.yaw *= 0.9; D.V.pitch += (-0.04 - D.V.pitch) * 0.1; }
    if (inp.shoot) { D.shoot(); api.log('shoot_press', { target: st.mem.lastTarget, inGap: R.inGap(t, g.t0, g.T) }); }
    if (inp.tele) { api.press('KeyQ'); api.log('tele_press', { off: +R.bassBeatNear(t, g.bass.anchor, g.bass.period).off.toFixed(3) }); }
    if (inp.dodge) { api.press('ShiftLeft'); api.log('dodge_press'); }
    if (inp.pick) api.press('KeyE');
    api.set('Space', !!inp.breath);
    // 世界座標的移動方向 → 鏡頭朝向下的 W/S/A/D（已經把鏡頭轉向目標，所以按 W）
    api.set('KeyW', !!(inp.mx || inp.mz));
  },

  intervals(timeline, meta) {
    const blind = [];
    let cur = null;
    for (const s of timeline) {
      if (s.blind && !cur) {                // 用規則算精確起點：t0 + c·CYCLE
        const a = s.ct0 + s.cyc * s.cT;
        cur = [a, a + (((meta.prepared || {}).rules || {}).BLIND || 0.6)];
        blind.push(cur);
      } else if (!s.blind) cur = null;
    }
    return { blind, alert: [], hunted: [] };
  },

  expectedBeats(timeline, meta) {
    const Cd = Object.assign({ M: 7, LAYERS: 4, BELL_SIGMA: 0.22, MIN_GAIN: 0.02, BLIND: 0.6 }, (meta.prepared || {}).audioConst || {});
    const out = [];
    if (!timeline.length) return out;
    const bell = (x) => { const d = (x - 0.5) / Cd.BELL_SIGMA; return Math.exp(-d * d); };
    // 依 (t0, T) 分段（按 R 重來時 t0 會變），只算對局中的時段
    const segs = [];
    for (const s of timeline) {
      const L = segs[segs.length - 1];
      const on = s.phase === 'play';
      if (!L || L.t0 !== s.ct0) segs.push({ t0: s.ct0, T: s.cT, a: s.t, b: s.t, on });
      else if (on) L.b = s.t;
    }
    for (const S of segs) {
      const c0 = Math.max(0, Math.floor((S.a - S.t0) / S.T)), c1 = Math.floor((S.b - S.t0) / S.T);
      for (let c = c0; c <= c1; c++) for (let k = 0; k < Cd.LAYERS; k++) {
        const Mk = Cd.M * Math.pow(2, k);
        for (let n = 0; n < Mk; n++) {
          const ph = Math.log2(1 + n / Mk), t = S.t0 + (c + ph) * S.T;
          if (t < S.a || t > S.b || (c >= 1 && ph * S.T < Cd.BLIND)) continue;
          const w = bell((k + ph) / Cd.LAYERS);
          if (w < Cd.MIN_GAIN) continue;
          out.push({ t, w, kind: 'risset', layer: k });
        }
      }
      const per = timeline[0].bassPer || 2.4;
      const an = (timeline.find((s) => s.ct0 === S.t0) || timeline[0]).bassAnchor;   // 低音網格錯開半拍：anchor = t0 + 1.2
      for (let m = Math.max(0, Math.ceil((S.a - an) / per)); an + m * per <= S.b; m++) out.push({ t: an + m * per, w: 1, kind: 'bass' });
    }
    out.sort((x, y) => x.t - y.t);
    return out;
  }
};
