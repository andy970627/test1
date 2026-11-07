/*
 * 大廳復仇：規則模組（純邏輯）
 *
 * 不碰 DOM、不碰 Web Audio，只有數字進、數字出，之後可以一對一翻成 C#（Unity，用 dspTime 推進）。
 * 瀏覽器：全域 VengeanceRules；Node：module.exports。
 * 規格：docs/design/2026-11-07-risset-bow-vengeance.md 第 3 節。
 *
 * 出處（CLAUDE.md：大眾熟知的經典段落為主、自由改編、電影輔助）：
 *   乞丐射穿十二把斧頭、扯下破衣現身、在大廳射殺求婚者、忒勒馬科斯並肩作戰【經典】
 *   大廳的門被關上、求婚者拿桌板當盾【原典】（只當背景細節）
 *   最強的幾名求婚者倒下後其餘投降【電影】（細節待確認）
 *   Risset 節奏驅動逼近與出手、驟降空檔放箭、低音拍舉盾、屏息讓撲來的人撲空、撿箭【改編】
 *   求婚者頭目的名字（安提諾俄斯、歐律馬科斯、克特西波斯、阿革勞斯）【原典】：只當名字，加特徵稱號方便記人
 *
 * 座標（公尺、秒、弧度）：
 *   地面 x（向右）× z（向南），y 向上。門檻在 z = 0，大廳往 −z 延伸到 −20。
 *   朝向 yaw：正前方 forward(yaw) = (−sin yaw, −cos yaw)，和 three.js 相機 rotation.y 一致（yaw = 0 面向 −z）。
 *   pitch：往上為正。
 *
 * 時間：一律用音訊時鐘的絕對時間（AudioContext.currentTime）。
 *   循環長度固定 CYCLE（7.2 秒 = 3 個低音拍），循環 c 從 t0 + c·CYCLE 開始，相位 p = 經過秒數 ÷ CYCLE。
 *   空檔（驟降）＝第 1 個循環起，每個循環開頭的 GAP_LEN（0.6）秒：Risset 打擊斷掉、全場靜止。
 *   第 0 個循環沒有空檔（還沒有「驟降」），也沒有攻擊（求婚者慌忙找武器）。
 *   低音拍：t0 + BASS_OFFSET + k·BASS_PERIOD（錯開半拍）：一個循環 3 拍，落在 p = 1/6、1/2、5/6，
 *   空檔裡沒有低音（尾音約 1.15 秒，最後一拍在驟降前 1.2 秒），按 Q 和放箭也不會擠在同一瞬間。
 *
 * 一個循環裡（「越快越近越兇」）：
 *   求婚者從自己的位置往門檻逼近，前進量 a(p) = p²；空檔裡全場凍結在最近的位置（a = 1）。
 *   最高速時（p ≈ 0.9）有人出手：先預備 WARN_LEAD 秒（舉矛／蹲低要撲），再在 impact 時刻命中。
 *     擲矛 spear：Shift 閃避（impact −0.35 ～ +0.12 秒內按）。
 *     撲上來 lunge：Shift 閃避，或按住空白鍵屏息（impact 前 0.2 秒起憋住，他撲空）。
 *     都沒躲 → 忒勒馬科斯的盾舉著就替你擋下（盾被撞開，SHIELD_COOL 秒後才能再舉）；沒盾 → 受傷。
 *   頭目倒下 2 名以上：每個循環出手兩次（p ≈ 0.88、0.97）。
 *
 * 放箭：
 *   空檔內：準心最穩，箭照瞄準方向飛（SPREAD_GAP = 0）。一個空檔只能射一箭（拉弓要時間）。
 *   空檔外：弓手被節奏帶著晃，方向加上 ±SPREAD_OFF 的隨機偏差，而且弓弦聲暴露位置：
 *     EXPOSE_LEAD 秒後多一次擲矛（落在空檔裡就延到空檔結束後）。
 *   命中判定：從眼睛高度 EYE_Y 沿 (yaw, pitch) 射出，碰到最近的求婚者身體（半徑 BODY_R、高 BODY_BOTTOM～BODY_TOP）。
 *   頭目有的拿桌板當盾（hp 2）：第一箭釘在桌板上，第二箭才倒下。倒下＝悶響＋倒地動作，不寫血腥。
 *   沒射中、射在桌板上的箭彈落在門檻前的地上（可走到的範圍內），走過去按 E 撿起（PICK_R 內全部）。射倒人的箭不回收。
 *   箭共 ARROWS（12）支，呼應十二把斧頭。
 *
 * 忒勒馬科斯（借用木馬之夜的低音安撫）：低音拍 ±BASS_WIN 秒（晚按多給 LATENCY_GRACE）按 Q，他舉盾，
 *   舉到下一拍之後（beat + BASS_PERIOD + 容許），每拍都按就一直舉著；按錯拍他會慌，盾放下，0.6 秒內不能再按。
 *   判定時間：有 input.teleAt（按鍵當下的音訊時間減輸出延遲）就用它，沒有才用幀時間。放箭、閃避同理（shootAt、dodgeAt）。
 *
 * 勝利：四名頭目全部倒下 → 其餘求婚者投降。失敗：生命 HP（3）歸零，畫面層按 R 重新 createGame。
 *
 * 暗示階梯（docs/design/2026-11-07-hint-guidance.md 第 1、4 節）【改編】：
 *   每種機制記失敗次數（g.hints；重來時 createGame({hints}) 沿用上一局的）：
 *     attack 被攻擊打中｜dodge 按了閃避還是被打中（時機或方向不對）｜gap 空檔外放箭｜tele 按 Q 錯拍｜
 *     arrows 箭用完（射光那一下，和空箭袋還按放箭）。
 *   第 1 次失敗：只有世界內暗示；失敗 2 次：第 2 階（一行提示文字）；3 次以上：第 3 階（文字＋按鍵說明）。
 *   成功一次（閃過／屏息躲過、空檔裡放箭、對拍舉盾、撿到箭）就退回第 1 階。
 *   事件 hint：{key, level, text（第 2 階起）, keys（第 3 階）}。文字照設計文件第 4 節「提示文字」欄。
 * 世界內暗示的時機（規則保證，畫面與聲音照著演）：
 *   每輪的出手：預備（attack_warn，帶出手者位置 x、z）落在 p ≥ 0.75 的最高速、而且一定不在空檔裡；
 *   暴露位置引來的擲矛：預備若會落進空檔，延到空檔結束後（空檔裡不出預備聲）。
 *
 * 介面：
 *   createGame({t0, seed, cycle}) → game
 *   step(game, t, input) → game；本幀事件在 game.events（陣列，每筆 {type, t, ...}）
 *   input = { yaw, pitch, mx, mz（世界座標移動方向）, shoot, shootAt, dodge, dodgeAt, breath（按住）, tele, teleAt, pick }
 *   事件 type：shoot、miss、shield_hit、down、bow_busy、empty、exposed、attack_warn、dodge、dodge_ok、breath_ok、
 *     block、hurt、tele_ok、tele_miss、tele_busy、breath_in、breath_out、gasp、pick、pick_none、gap、pre_gap、
 *     surrender、win、fall、hint
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VengeanceRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 常數（全部可調） ----------
  const T = Object.freeze({
    CYCLE: 7.2,           // 循環秒數 = 3 個低音拍，驟降落在低音拍上
    GAP_LEN: 0.6,         // 空檔（驟降）秒數，以秒計
    PRE_GAP: 0.4,         // 空檔前幾秒發 pre_gap（預告）
    RISSET_LAYERS: 4,     // Risset 打擊層數（聲音層同值）
    RISSET_M: 7,          // 最慢層每循環拍數
    BELL_SIGMA: 0.22,     // 層音量鐘形曲線寬度
    BEAT_MIN_GAIN: 0.02,  // 低於這個音量的拍不排
    BASS_PERIOD: 2.4,     // 慢低音週期
    BASS_OFFSET: 1.2,     // 低音網格相對 t0 錯開半拍，避開空檔
    BASS_WIN: 0.15,       // 低音拍容許 ±0.15 秒
    LATENCY_GRACE: 0.05,  // 晚按那側多給的秒數
    TELE_LOCK: 0.6,       // 按錯拍後幾秒內不能再按
    SHIELD_COOL: 8,       // 盾擋下一次攻擊後，幾秒後才能再舉
    ARROWS: 12,           // 箭數（十二把斧頭）
    HP: 3,                // 生命
    SPREAD_GAP: 0,        // 空檔內方向偏差（弧度）
    SPREAD_OFF: 0.2,      // 空檔外水平偏差 ±0.2 弧度（約 ±11°）
    PITCH_SPREAD_OFF: 0.1,
    AIM_ASSIST: 0.03,     // 判定時多給的角度
    BODY_R: 0.32,         // 求婚者身體半徑
    BODY_BOTTOM: 0.2, BODY_TOP: 1.8,
    EYE_Y: 1.6,           // 玩家眼睛高度
    CHEST_Y: 1.2,         // 瞄準胸口的高度（程式玩家用）
    EXPOSE_LEAD: 1.3,     // 空檔外放箭、喘氣暴露位置後，幾秒後有人擲矛過來
    IMPACT_P1: [0.9],         // 一次出手：命中相位
    IMPACT_P2: [0.88, 0.97],  // 兩次出手（第一下的預備也落在 p ≥ 0.75 的最高速；兩下相隔 0.65 秒 > 閃避冷卻）
    TWO_ATTACKS_FROM: 2,  // 倒下幾名頭目後每循環出手兩次
    WARN_LEAD: 0.9,       // 預備（舉矛、蹲低）提早幾秒
    DODGE_EARLY: 0.35,    // 閃避：impact 前 0.35 秒內按
    DODGE_LATE: 0.12,     //       impact 後 0.12 秒內按也算（攻擊在 impact + DODGE_LATE 結算）
    DODGE_COOL: 0.6,      // 閃避冷卻
    BREATH_EARLY: 0.2,    // 屏息：impact 前 0.2 秒就要憋住
    BREATH_MAX: 4,        // 屏息上限，超過 = 喘氣（暴露）
    BREATH_RECOVER: 1.2,  // 不屏息時每秒恢復
    APPROACH_POW: 2,      // 前進量 a(p) = p^2
    MIN_DIST: 2.6,        // 逼近時離玩家至少這麼遠
    LUNGE_STOP: 0.9,      // 撲上來時停在離玩家幾公尺
    WALK: 2.2,            // 走路速度
    ZONE: Object.freeze({ x0: -3.5, x1: 3.5, z0: -6.5, z1: -0.3 }),   // 玩家能走的範圍（門檻前）
    DROP_ZONE: Object.freeze({ x0: -3, x1: 3, z0: -6, z1: -1.5 }),     // 箭彈落的範圍（都在走得到的地方）
    PICK_R: 1.3,          // 撿箭半徑
    MAX_DT: 0.1
  });

  // ---------- 暗示階梯【改編】 ----------
  // text：設計文件第 4 節「提示文字（第 2 階）」；keys：第 3 階加上的按鍵說明。
  const HINTS = Object.freeze({
    attack: { label: '求婚者出手的時機', text: '他舉起長矛時，下一拍就會出手：閃開或屏息。', keys: '看到舉矛、舉椅子，或聽到出鞘、吸氣聲，快命中時按 Shift 閃避；撲上來的人也可以按住空白鍵屏息。' },
    dodge:  { label: '閃避方向', text: '聽聲音從哪邊來，往另一邊閃。', keys: '戴耳機聽出手聲在左還是右，那一側的火把會閃一下；別太早按 Shift，命中前一瞬間再按。' },
    gap:    { label: '驟降空檔射箭', text: '鼓聲一斷，才是放箭的時候。', keys: '鼓聲斷掉、畫面泛藍凍結、箭頭發光時，按滑鼠左鍵（或 F）放箭。' },
    tele:   { label: '忒勒馬科斯舉盾', text: '跟著最低的聲音按 Q，你兒子會替你擋。', keys: '最低沉的那一聲鼓響、他的盾牌反光時按 Q（前後 0.15 秒內）。' },
    arrows: { label: '撿箭', text: '箭用完了，地上還有。', keys: '用 W A S D 走到地上發亮的箭旁邊，按 E 撿起來。' }
  });
  function createHints(prev) { return prev && prev.fails && prev.level ? prev : { fails: {}, level: {} }; }
  function hintLevel(h, key) { return (h && h.level[key]) || 1; }
  function hintData(key, level) {
    const H = HINTS[key] || {}, d = { key, level };
    if (level >= 2) d.text = H.text;
    if (level >= 3) d.keys = H.keys;
    return d;
  }
  function hintFail(g, key, t) {
    const h = g.hints;
    h.fails[key] = (h.fails[key] || 0) + 1;
    h.level[key] = h.fails[key] >= 3 ? 3 : h.fails[key] >= 2 ? 2 : 1;
    return emit(g, 'hint', t, hintData(key, h.level[key]));
  }
  function hintSuccess(g, key, t) {
    const h = g.hints, was = hintLevel(h, key);
    h.fails[key] = 0; h.level[key] = 1;
    return was > 1 ? emit(g, 'hint', t, hintData(key, 1)) : null;
  }

  // ---------- 小工具 ----------
  const pmod = (a, b) => ((a % b) + b) % b;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wrapAngle = (a) => pmod(a + Math.PI, Math.PI * 2) - Math.PI;
  const log2 = (v) => Math.log(v) / Math.LN2;
  /** 世界方向 (dx, dz) 的 yaw（forward(yaw) 的反函數）。 */
  function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }
  function forward(yaw) { return { x: -Math.sin(yaw), z: -Math.cos(yaw) }; }
  /** 可重現的亂數（mulberry32）。 */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 循環、空檔、低音 ----------
  /** 時間 t 的循環資訊：{index, p, start, sinceStart, gap}。t < t0 時 index = −1、p = 0。 */
  function cycleAt(t, t0, K) {
    K = K || T;
    const L = K.CYCLE;
    if (t < t0) return { index: -1, p: 0, start: t0 - L, sinceStart: 0, gap: false };
    const index = Math.floor((t - t0) / L);
    const start = t0 + index * L;
    const since = t - start;
    return { index, p: since / L, start, sinceStart: since, gap: index >= 1 && since < K.GAP_LEN };
  }
  /** 是否在空檔（驟降）。 */
  function inGap(t, t0, K) { return cycleAt(t, t0, K).gap; }
  /** [a, b] 之間的所有空檔區間 [[s, e]]。 */
  function gapsBetween(a, b, t0, K) {
    K = K || T;
    const out = [];
    for (let c = Math.max(1, Math.floor((a - t0) / K.CYCLE)); t0 + c * K.CYCLE <= b; c++) {
      const s = t0 + c * K.CYCLE, e = s + K.GAP_LEN;
      if (e >= a) out.push([s, e]);
    }
    return out;
  }
  /**
   * 離 t 最近的低音拍：{beat, off（t − beat，正 = 晚按）, ok, next}。
   * ok：−win ≤ off ≤ win + late。（照抄木馬之夜 risset.js 的 bassBeatNear）
   */
  function bassBeatNear(t, anchor, period, win, late) {
    period = period || T.BASS_PERIOD; win = win == null ? T.BASS_WIN : win; late = late || 0;
    const k = Math.round((t - anchor) / period);
    const beat = anchor + k * period;
    const off = t - beat;
    const next = anchor + Math.ceil((t - anchor) / period - 1e-9) * period;
    return { beat, off, ok: off >= -win - 1e-9 && off <= win + late + 1e-9, next };
  }

  // ---------- Risset 拍點（和木馬之夜同一套公式，聲音層與錄音分析共用） ----------
  /** 第 k 層每循環的拍數 M·2^k。 */
  function layerBeats(k, K) { return (K || T).RISSET_M * Math.pow(2, k); }
  /** 第 k 層第 n 拍的相位 log2(1 + n ÷ (M·2^k))；不給 n 回傳整層相位陣列。 */
  function beatPhases(k, n, K) {
    const Mk = layerBeats(k, K);
    if (n != null) return log2(1 + n / Mk);
    const out = [];
    for (let i = 0; i < Mk; i++) out.push(log2(1 + i / Mk));
    return out;
  }
  /** 第 k 層在相位 p 的音量：bell((k + p) ÷ LAYERS)。 */
  function layerGain(k, p, K) {
    K = K || T;
    const d = ((k + p) / K.RISSET_LAYERS - 0.5) / K.BELL_SIGMA;
    return Math.exp(-d * d);
  }
  /** [a, b) 之間要響的 Risset 拍：[{t, k, n, p, w, cycle}]，空檔裡不排。 */
  function beatsBetween(a, b, t0, K) {
    K = K || T;
    const out = [];
    const c0 = Math.max(0, Math.floor((a - t0) / K.CYCLE)), c1 = Math.floor((b - t0) / K.CYCLE);
    for (let c = c0; c <= c1; c++) {
      for (let k = 0; k < K.RISSET_LAYERS; k++) {
        const ph = beatPhases(k, null, K);
        for (let n = 0; n < ph.length; n++) {
          const p = ph[n], t = t0 + (c + p) * K.CYCLE;
          if (t < a || t >= b) continue;
          if (c >= 1 && p * K.CYCLE < K.GAP_LEN) continue;
          const w = layerGain(k, p, K);
          if (w < K.BEAT_MIN_GAIN) continue;
          out.push({ t, k, n, p, w, cycle: c });
        }
      }
    }
    out.sort((x, y) => x.t - y.t);
    return out;
  }

  // ---------- 關卡 ----------
  // 頭目：特徵稱號＋名字（名字只是背景細節）。hp 2 的會拿桌板當盾。
  const SUITORS = [
    { id: 'antinous', name: '安提諾俄斯', title: '傲慢的', leader: true, hp: 1, x: -1.5, z: -11, reach: 6.0, color: 0x8a3a2e },
    { id: 'eurymachus', name: '歐律馬科斯', title: '油嘴的', leader: true, hp: 2, x: 2.6, z: -13, reach: 6.0, color: 0x3e5c8a },
    { id: 'ctesippus', name: '克特西波斯', title: '擲牛蹄的', leader: true, hp: 1, x: -4.6, z: -14.5, reach: 6.5, color: 0x6e5232 },
    { id: 'agelaus', name: '阿革勞斯', title: '領頭的', leader: true, hp: 2, x: 4.4, z: -16.5, reach: 7.0, color: 0x5a3a6a },
    { id: 's1', leader: false, hp: 1, x: -5.4, z: -8.5, reach: 3.0, color: 0x4a5a3a },
    { id: 's2', leader: false, hp: 1, x: 5.4, z: -9.5, reach: 3.0, color: 0x3e5a5e },
    { id: 's3', leader: false, hp: 1, x: 0.8, z: -17.5, reach: 3.5, color: 0x6a3a52 },
    { id: 's4', leader: false, hp: 1, x: -2.2, z: -18.2, reach: 3.5, color: 0x58603a },
    { id: 's5', leader: false, hp: 1, x: 6.4, z: -13.5, reach: 3.0, color: 0x7a5a3a },
    { id: 's6', leader: false, hp: 1, x: -6.6, z: -12.0, reach: 3.0, color: 0x44486a },
    { id: 's7', leader: false, hp: 1, x: 2.8, z: -19.0, reach: 3.0, color: 0x7a3f3f },
    { id: 's8', leader: false, hp: 1, x: -6.2, z: -18.6, reach: 3.0, color: 0x5a4a6e }
  ];

  function createGame(opts) {
    opts = opts || {};
    const K = Object.assign({}, T, opts.cycle ? { CYCLE: +opts.cycle } : null, opts.K || null);
    const t0 = opts.t0 != null ? +opts.t0 : 0;
    const g = {
      T: K, t0, time: t0, phase: 'play', seed: opts.seed != null ? opts.seed : 7,
      rng: makeRng(opts.seed != null ? opts.seed : 7),
      cycle: cycleAt(t0, t0, K),
      player: { x: 0, z: -0.8, yaw: 0, pitch: 0, hp: K.HP, arrows: K.ARROWS,
        dodgeAt: -1e9, breathing: false, breathStart: -1e9, breathEnd: -1e9, breathT: 0, breathLock: false, hurtAt: -1e9 },
      tele: { until: -1e9, coolUntil: -1e9, lockUntil: -1e9, lastBeat: null, streak: 0, blocks: 0 },
      bass: { anchor: t0 + K.BASS_OFFSET, period: K.BASS_PERIOD, nextBeat: t0 + K.BASS_OFFSET },
      suitors: SUITORS.map((s) => Object.assign({}, s, { hpLeft: s.hp, down: false, downAt: null, dx: null, dz: null, surrender: false })),
      attacks: [], attackSeq: 0, plannedCycle: -1,
      floorArrows: [], arrowSeq: 0,
      lastShotCycle: -99, preGapSent: -1, gapSent: -1,
      stats: { shots: 0, gapShots: 0, offShots: 0, hits: 0, downs: 0, misses: 0, dodges: 0, breaths: 0, blocks: 0, hurts: 0,
        teleOk: 0, teleMiss: 0, picks: 0, exposed: 0, winAt: null, failAt: null },
      events: [], log: [],
      hints: createHints(opts.hints)
    };
    return g;
  }

  const leadersLeft = (g) => g.suitors.filter((s) => s.leader && !s.down).length;
  const leadersDown = (g) => g.suitors.filter((s) => s.leader && s.down).length;

  /** 求婚者 s 在時間 t 的位置 {x, z}（倒下的停在倒下處；撲上來的往玩家衝）。 */
  function suitorPos(g, s, t) {
    if (s.down) return { x: s.dx, z: s.dz };
    const K = g.T, P = g.player;
    const cy = cycleAt(t, g.t0, K);
    let a;
    if (g.phase === 'win') a = 0.35;                      // 投降：退開一點跪下
    else if (cy.index < 0) a = 0;
    else if (cy.gap) a = 1;                                // 空檔：凍結在最近的位置
    else a = Math.pow(cy.p, K.APPROACH_POW);
    const dx = P.x - s.x, dz = P.z - s.z, d = Math.hypot(dx, dz) || 1;
    const adv = Math.min(a * s.reach, Math.max(0, d - K.MIN_DIST));
    let x = s.x + dx / d * adv, z = s.z + dz / d * adv;
    // 撲上來：預備到命中之間衝向玩家
    const atk = g.attacks.find((A) => A.by === s.id && A.type === 'lunge' && !A.cancelled && t >= A.warn && t <= A.impact + 0.6);
    if (atk) {
      const f = clamp((t - atk.warn) / (atk.impact - atk.warn), 0, 1);
      const ex = P.x - x, ez = P.z - z, ed = Math.hypot(ex, ez) || 1;
      const go = Math.max(0, ed - K.LUNGE_STOP) * f * f;
      x += ex / ed * go; z += ez / ed * go;
    }
    return { x, z };
  }

  /** 沿 (yaw, pitch) 射出，回傳最近被碰到的求婚者 {s, dist} 或 null。 */
  function traceShot(g, yaw, pitch, t) {
    const K = g.T, P = g.player;
    let best = null;
    for (const s of g.suitors) {
      if (s.down) continue;
      const q = suitorPos(g, s, t);
      const dx = q.x - P.x, dz = q.z - P.z, d = Math.hypot(dx, dz);
      if (d < 0.1) continue;
      const diff = Math.abs(wrapAngle(yawTo(dx, dz) - yaw));
      const half = Math.atan(K.BODY_R / d) + K.AIM_ASSIST;
      if (diff > half) continue;
      const lo = Math.atan((K.BODY_BOTTOM - K.EYE_Y) / d) - K.AIM_ASSIST;
      const hi = Math.atan((K.BODY_TOP - K.EYE_Y) / d) + K.AIM_ASSIST;
      if (pitch < lo || pitch > hi) continue;
      if (!best || d < best.dist) best = { s, dist: d };
    }
    return best;
  }

  /** 程式玩家／瞄準輔助：挑一個射得到的目標 {id, yaw, pitch, leader}；優先頭目、沒被擋住、最近的。 */
  function pickTarget(g, t) {
    const K = g.T, P = g.player;
    const aim = (s) => {
      const q = suitorPos(g, s, t), dx = q.x - P.x, dz = q.z - P.z, d = Math.hypot(dx, dz);
      return { id: s.id, yaw: yawTo(dx, dz), pitch: Math.atan((K.CHEST_Y - K.EYE_Y) / d), dist: d, leader: s.leader };
    };
    const alive = g.suitors.filter((s) => !s.down);
    const leaders = alive.filter((s) => s.leader).map(aim).sort((a, b) => a.dist - b.dist);
    for (const L of leaders) {
      const hit = traceShot(g, L.yaw, L.pitch, t);
      if (hit && hit.s.id === L.id) return L;
    }
    if (leaders.length) {                    // 都被擋住：先射擋路的人
      const hit = traceShot(g, leaders[0].yaw, leaders[0].pitch, t);
      if (hit) return aim(hit.s);
      return leaders[0];
    }
    const rest = alive.map(aim).sort((a, b) => a.dist - b.dist);
    return rest[0] || null;
  }

  // ---------- 內部：事件、攻擊排程 ----------
  function emit(g, type, t, data) {
    const e = Object.assign({ type, t }, data || {});
    g.events.push(e);
    if (g.log.length < 4000) g.log.push(e);
    return e;
  }

  function chooseAttacker(g, exclude) {
    const pool = g.suitors.filter((s) => !s.down && exclude.indexOf(s.id) < 0);
    if (!pool.length) return null;
    let sum = 0;
    for (const s of pool) sum += s.leader ? 2 : 1;
    let r = g.rng() * sum;
    for (const s of pool) { r -= s.leader ? 2 : 1; if (r <= 0) return s; }
    return pool[pool.length - 1];
  }

  function planCycle(g, c) {
    const K = g.T;
    g.plannedCycle = c;
    if (c < 1) return;                       // 第 0 個循環：求婚者慌忙找武器，不出手
    const phases = leadersDown(g) >= K.TWO_ATTACKS_FROM ? K.IMPACT_P2 : K.IMPACT_P1;
    const used = [];
    const start = g.t0 + c * K.CYCLE;
    phases.forEach((ph, i) => {
      const s = chooseAttacker(g, used);
      if (!s) return;
      used.push(s.id);
      const type = phases.length === 2 ? (i === 0 ? 'spear' : (g.rng() < 0.5 ? 'lunge' : 'spear')) : (g.rng() < 0.5 ? 'spear' : 'lunge');
      const impact = start + ph * K.CYCLE;
      g.attacks.push({ id: ++g.attackSeq, by: s.id, type, warn: impact - K.WARN_LEAD, impact, warned: false, done: false, cancelled: false, cycle: c, reason: 'cycle' });
    });
  }

  /** 暴露位置：EXPOSE_LEAD 秒後有人擲矛（落在空檔就延到空檔結束後 0.3 秒）。 */
  function expose(g, t, why) {
    const K = g.T;
    let impact = t + K.EXPOSE_LEAD;
    const cy = cycleAt(impact, g.t0, K);
    if (cy.gap) impact = cy.start + K.GAP_LEN + 0.3;
    const busy = g.attacks.filter((A) => !A.done && !A.cancelled).map((A) => A.by);
    const s = chooseAttacker(g, busy);
    g.stats.exposed++;
    emit(g, 'exposed', t, { why, by: s ? s.id : null, impact });
    if (!s) return;
    let warn = Math.max(t + 0.2, impact - K.WARN_LEAD);
    const wc = cycleAt(warn, g.t0, K);
    if (wc.gap) warn = Math.min(impact - 0.05, wc.start + K.GAP_LEN + 0.02);   // 空檔裡不出預備（聲音、動作都延到空檔後）
    g.attacks.push({ id: ++g.attackSeq, by: s.id, type: 'spear', warn, impact, warned: false, done: false, cancelled: false, cycle: cy.index, reason: why });
  }

  function landArrow(g, x, z, t, why) {
    const Z = g.T.DROP_ZONE;
    const a = { id: ++g.arrowSeq, x: clamp(x, Z.x0, Z.x1), z: clamp(z, Z.z0, Z.z1), t, why };
    g.floorArrows.push(a);
    return a;
  }

  function checkWin(g, t) {
    if (leadersLeft(g) > 0 || g.phase !== 'play') return;
    g.phase = 'win';
    g.stats.winAt = t - g.t0;
    for (const s of g.suitors) if (!s.down) s.surrender = true;
    for (const A of g.attacks) if (!A.done) A.cancelled = true;
    emit(g, 'surrender', t, { count: g.suitors.filter((s) => !s.down).length });
    emit(g, 'win', t);
  }

  function shoot(g, t, at, yaw, pitch) {
    const K = g.T, P = g.player;
    if (P.arrows <= 0) { emit(g, 'empty', t); hintFail(g, 'arrows', t); return; }
    const cy = cycleAt(at, g.t0, K);
    if (cy.gap && g.lastShotCycle === cy.index) { emit(g, 'bow_busy', t); return; }
    P.arrows--;
    g.stats.shots++;
    let ay = yaw, ap = pitch;
    if (cy.gap) {
      g.lastShotCycle = cy.index;
      g.stats.gapShots++;
      if (K.SPREAD_GAP) { ay += (g.rng() * 2 - 1) * K.SPREAD_GAP; ap += (g.rng() * 2 - 1) * K.SPREAD_GAP; }
    } else {
      g.stats.offShots++;
      ay += (g.rng() * 2 - 1) * K.SPREAD_OFF;
      ap += (g.rng() * 2 - 1) * K.PITCH_SPREAD_OFF;
    }
    const hit = traceShot(g, ay, ap, t);
    emit(g, 'shoot', t, { gap: cy.gap, yaw: ay, pitch: ap, arrows: P.arrows, target: hit ? hit.s.id : null, dist: hit ? hit.dist : null });
    if (cy.gap) hintSuccess(g, 'gap', t); else hintFail(g, 'gap', t);
    if (P.arrows === 0) hintFail(g, 'arrows', t);          // 射光了（地上還有箭）
    if (hit) {
      const s = hit.s, q = suitorPos(g, s, t);
      g.stats.hits++;
      if (s.hpLeft > 1) {
        s.hpLeft--;
        const back = forward(ay);
        const a = landArrow(g, q.x - back.x * 0.8, q.z - back.z * 0.8, t, 'table');
        emit(g, 'shield_hit', t, { id: s.id, x: q.x, z: q.z, arrow: a.id });
      } else {
        s.hpLeft = 0; s.down = true; s.downAt = t; s.dx = q.x; s.dz = q.z;
        g.stats.downs++;
        for (const A of g.attacks) if (A.by === s.id && !A.done) A.cancelled = true;
        emit(g, 'down', t, { id: s.id, leader: s.leader, x: q.x, z: q.z, left: leadersLeft(g) });
      }
    } else {
      g.stats.misses++;
      // 落點：射向地面就落在那裡；太遠的撞上桌板、柱子彈回門檻前
      const f = forward(ay);
      const d = ap < -0.02 ? Math.min(K.EYE_Y / Math.tan(-ap), 5.5) : 4 + g.rng() * 1.5;
      const a = landArrow(g, P.x + f.x * d + (g.rng() - 0.5) * 1.2, P.z + f.z * d, t, 'miss');
      emit(g, 'miss', t, { x: a.x, z: a.z, arrow: a.id });
    }
    if (!cy.gap) expose(g, t, 'shot');
    checkWin(g, t);
  }

  function resolveAttack(g, A, t) {
    const K = g.T, P = g.player;
    A.done = true;
    const dodged = P.dodgeAt >= A.impact - K.DODGE_EARLY && P.dodgeAt <= A.impact + K.DODGE_LATE;
    const held = A.type === 'lunge' && P.breathStart <= A.impact - K.BREATH_EARLY && (P.breathing || P.breathEnd >= A.impact) && P.breathStart > -1e8;
    if (dodged) { A.result = 'dodge'; g.stats.dodges++; emit(g, 'dodge_ok', t, { attack: A.id, by: A.by, kind: A.type }); hintSuccess(g, 'attack', t); hintSuccess(g, 'dodge', t); return; }
    if (held) { A.result = 'breath'; g.stats.breaths++; emit(g, 'breath_ok', t, { attack: A.id, by: A.by, kind: A.type }); hintSuccess(g, 'attack', t); return; }
    if (g.tele.until >= A.impact && A.impact >= g.tele.coolUntil) {
      A.result = 'block';
      g.tele.until = -1e9; g.tele.coolUntil = t + K.SHIELD_COOL; g.tele.blocks++; g.stats.blocks++;
      emit(g, 'block', t, { attack: A.id, by: A.by, kind: A.type, cool: g.tele.coolUntil });
      return;
    }
    A.result = 'hurt';
    P.hp--; P.hurtAt = t; g.stats.hurts++;
    emit(g, 'hurt', t, { attack: A.id, by: A.by, kind: A.type, hp: P.hp });
    hintFail(g, 'attack', t);
    if (P.dodgeAt >= A.impact - 1 && P.dodgeAt <= A.impact + K.DODGE_LATE) hintFail(g, 'dodge', t);   // 按了閃避還是被打中
    if (P.hp <= 0 && g.phase === 'play') {
      g.phase = 'fail'; g.stats.failAt = t - g.t0;
      for (const B of g.attacks) if (!B.done) B.cancelled = true;
      emit(g, 'fall', t);
    }
  }

  // ---------- 主迴圈 ----------
  function step(g, t, input) {
    input = input || {};
    g.events = [];
    const K = g.T, P = g.player;
    const dt = clamp(t - g.time, 0, K.MAX_DT);
    g.time = Math.max(g.time, t);
    g.cycle = cycleAt(t, g.t0, K);
    const bb = bassBeatNear(t, g.bass.anchor, g.bass.period);
    g.bass.nextBeat = bb.next;
    if (g.phase !== 'play') return g;
    const cy = g.cycle;

    if (input.yaw != null) P.yaw = input.yaw;
    if (input.pitch != null) P.pitch = input.pitch;

    // 循環開始：排這一輪的攻擊；空檔與預告事件
    if (cy.index >= 0 && cy.index !== g.plannedCycle) planCycle(g, cy.index);
    if (cy.gap && g.gapSent !== cy.index) { g.gapSent = cy.index; emit(g, 'gap', t, { cycle: cy.index }); }
    const nextStart = cy.start + K.CYCLE;
    if (nextStart - t <= K.PRE_GAP && g.preGapSent !== cy.index + 1 && cy.index + 1 >= 1) { g.preGapSent = cy.index + 1; emit(g, 'pre_gap', t, { at: nextStart }); }

    // 走路（限制在門檻前）
    let mx = +input.mx || 0, mz = +input.mz || 0;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (ml > 0.01) {
      P.x = clamp(P.x + mx * K.WALK * dt, K.ZONE.x0, K.ZONE.x1);
      P.z = clamp(P.z + mz * K.WALK * dt, K.ZONE.z0, K.ZONE.z1);
    }

    // 屏息
    if (input.breath && !P.breathing && !P.breathLock) {
      P.breathing = true; P.breathStart = t; emit(g, 'breath_in', t);
    } else if (!input.breath && P.breathing) {
      P.breathing = false; P.breathEnd = t; emit(g, 'breath_out', t);
    }
    if (P.breathing) {
      P.breathT += dt;
      if (P.breathT >= K.BREATH_MAX) {
        P.breathing = false; P.breathEnd = t; P.breathLock = true;
        emit(g, 'gasp', t);
        expose(g, t, 'gasp');
      }
    } else {
      P.breathT = Math.max(0, P.breathT - dt * K.BREATH_RECOVER);
      if (P.breathLock && P.breathT <= 1) P.breathLock = false;
    }

    // 閃避
    if (input.dodge) {
      const at = input.dodgeAt != null ? Math.min(input.dodgeAt, t) : t;
      if (at - P.dodgeAt >= K.DODGE_COOL) { P.dodgeAt = at; emit(g, 'dodge', t); }
    }

    // 忒勒馬科斯（低音拍舉盾）
    if (input.tele) {
      const at = input.teleAt != null ? Math.min(input.teleAt, t) : t;
      const Tl = g.tele;
      if (at < Tl.coolUntil) emit(g, 'tele_busy', t, { until: Tl.coolUntil });
      else if (at >= Tl.lockUntil) {
        const b = bassBeatNear(at, g.bass.anchor, g.bass.period, K.BASS_WIN, K.LATENCY_GRACE);
        if (b.ok) {
          if (Tl.lastBeat == null || Math.abs(b.beat - Tl.lastBeat) > 1e-6) {
            Tl.lastBeat = b.beat; Tl.until = b.beat + g.bass.period + K.BASS_WIN + K.LATENCY_GRACE;
            g.stats.teleOk++;
            emit(g, 'tele_ok', t, { beat: b.beat, off: b.off, index: Tl.streak++ });
            hintSuccess(g, 'tele', t);
          }
        } else {
          Tl.until = -1e9; Tl.lockUntil = at + K.TELE_LOCK; Tl.streak = 0;
          g.stats.teleMiss++;
          emit(g, 'tele_miss', t, { off: b.off });
          hintFail(g, 'tele', t);
        }
      }
    }

    // 放箭
    if (input.shoot) {
      const at = input.shootAt != null ? Math.min(input.shootAt, t) : t;
      shoot(g, t, at, input.yaw != null ? input.yaw : P.yaw, input.pitch != null ? input.pitch : P.pitch);
      if (g.phase !== 'play') return g;
    }

    // 撿箭
    if (input.pick) {
      const near = g.floorArrows.filter((a) => Math.hypot(a.x - P.x, a.z - P.z) <= K.PICK_R);
      if (near.length) {
        g.floorArrows = g.floorArrows.filter((a) => near.indexOf(a) < 0);
        P.arrows += near.length; g.stats.picks += near.length;
        emit(g, 'pick', t, { n: near.length, arrows: P.arrows });
        hintSuccess(g, 'arrows', t);
      } else emit(g, 'pick_none', t);
    }

    // 攻擊：預備、結算
    for (const A of g.attacks) {
      if (A.done || A.cancelled) continue;
      if (!A.warned && t >= A.warn && !cy.gap) {           // 幀剛好跨進空檔時，預備延到空檔後（空檔裡不出預備聲）
        A.warned = true;
        const s = g.suitors.find((x) => x.id === A.by);
        const q = s ? suitorPos(g, s, t) : { x: 0, z: -10 };
        emit(g, 'attack_warn', t, { attack: A.id, by: A.by, kind: A.type, impact: A.impact, leader: !!(s && s.leader), x: q.x, z: q.z });
      }
      if (t >= A.impact + K.DODGE_LATE) {
        resolveAttack(g, A, t);
        if (g.phase !== 'play') return g;
      }
    }
    if (g.attacks.length > 40) g.attacks = g.attacks.filter((A) => !(A.done || A.cancelled) || t - A.impact < 3);
    return g;
  }

  /** 現在正在預備中的攻擊（給畫面、錄音）。 */
  function activeAttacks(g, t) {
    return g.attacks.filter((A) => !A.done && !A.cancelled && t >= A.warn);
  }

  /**
   * 程式玩家：只在空檔射箭、照低音按 Q、看預備動作閃避或屏息、箭少了去撿。
   * 回傳 input（含 shoot/yaw/pitch 等）；st 是程式玩家自己的記憶（跨幀）。
   * opts.relyShield：盾舉著時不閃，讓忒勒馬科斯擋（展示用，預設 true）。
   */
  function botInput(g, t, st, opts) {
    opts = opts || {};
    const relyShield = opts.relyShield !== false;
    const K = g.T, P = g.player, inp = { yaw: P.yaw, pitch: P.pitch };
    if (g.phase !== 'play') return inp;
    st.dodged = st.dodged || {};
    const cy = cycleAt(t, g.t0, K);
    // 忒勒馬科斯：每個低音拍按一次（早 0.08～晚 0.12 秒內）
    if (t >= g.tele.coolUntil) {
      const b = bassBeatNear(t, g.bass.anchor, g.bass.period);
      if (b.off >= -0.08 && b.off <= 0.12 && st.teleBeat !== b.beat) { inp.tele = true; inp.teleAt = t; st.teleBeat = b.beat; }
    }
    // 攻擊：盾舉著就交給盾；擲矛閃避；撲上來屏息
    let wantBreath = false;
    for (const A of g.attacks) {
      if (A.done || A.cancelled || t < A.warn) continue;
      const shield = relyShield && g.tele.until >= A.impact && A.impact >= g.tele.coolUntil &&
        !g.attacks.some((B) => B !== A && !B.done && !B.cancelled && B.impact < A.impact);
      if (shield) continue;
      if (A.type === 'lunge' && P.breathT < K.BREATH_MAX - 1.5 && !P.breathLock) {
        if (t >= A.impact - 0.75) wantBreath = true;
      } else if (!st.dodged[A.id] && t >= A.impact - 0.18 && t <= A.impact + 0.08) {
        inp.dodge = true; inp.dodgeAt = t; st.dodged[A.id] = true;
      }
    }
    if (P.breathing && P.breathT > K.BREATH_MAX - 0.4) wantBreath = false;
    inp.breath = wantBreath;
    // 撿箭：箭剩 2 支以下，而且這一輪還沒到出手的時候
    if (P.arrows <= 2 && g.floorArrows.length && cy.p < 0.7 && !cy.gap) {
      let best = null, bd = 1e9;
      for (const a of g.floorArrows) { const d = Math.hypot(a.x - P.x, a.z - P.z); if (d < bd) { bd = d; best = a; } }
      if (bd <= K.PICK_R * 0.8) { inp.pick = true; }
      else { const dx = best.x - P.x, dz = best.z - P.z; inp.mx = dx / bd; inp.mz = dz / bd; inp.yaw = yawTo(dx, dz); inp.pitch = -0.6; }
      return inp;
    }
    // 回門檻中央附近（撿完箭後）
    if (Math.hypot(P.x, P.z + 0.8) > 0.4 && !cy.gap && cy.p < 0.75) {
      const dx = -P.x, dz = -0.8 - P.z, d = Math.hypot(dx, dz);
      inp.mx = dx / d; inp.mz = dz / d;
    }
    // 空檔：射一箭（空檔開始 0.05 秒後，讓凍結的位置穩定）
    if (cy.gap && g.lastShotCycle !== cy.index && P.arrows > 0 && cy.sinceStart >= 0.05) {
      const tg = pickTarget(g, t);
      if (tg) { inp.shoot = true; inp.shootAt = t; inp.yaw = tg.yaw; inp.pitch = tg.pitch; st.lastTarget = tg.id; }
    }
    return inp;
  }

  return {
    T, SUITORS, HINTS, createHints, hintLevel,
    yawTo, forward, wrapAngle, makeRng,
    cycleAt, inGap, gapsBetween, bassBeatNear,
    layerBeats, beatPhases, layerGain, beatsBetween,
    createGame, step, suitorPos, traceShot, pickTarget, activeAttacks, botInput,
    leadersLeft, leadersDown
  };
});
