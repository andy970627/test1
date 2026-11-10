/*
 * 方向乙「換層」試驗場：單元測試與驗收標準（Node.js 內建測試 runner）
 * 規格依據：docs/design/2026-11-10-direction-b-layer-sandbox.md 第 7 節（A1～A16 全部）；B1～B8 是規則角色補的邊界測試
 * 執行指令：node --test prototypes/layer-ride/rules.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Rules = require('./rules.js');
const Audio = require('./audio.js');

/** 輔助模擬器：固定 1/60 秒步長推進遊戲 */
function runSimulation(bot, seed, opts = {}) {
  const g = Rules.createGame({ seed, ...opts });
  const dt = 1 / 60;
  let t = g.time;
  const maxTime = 120; // 最多模擬 120 秒
  const events = [];

  while (g.phase === 'play' && t < maxTime) {
    t += dt;
    const input = Rules.botInput(g, t, bot);
    Rules.step(g, t, input);
    const out = Rules.drain(g);
    for (const e of out) {
      events.push(e);
    }
  }

  return {
    game: g,
    events,
    win: g.phase === 'win',
    time: t - g.t0
  };
}

// ==========================================
// A1: 預設常數下騎得住的範圍
// 門檻：u 起點 0.286 ± 0.01、終點 1.585 ± 0.01
// ==========================================
test('A1: 預設常數下騎得住的範圍 (0.286 ± 0.01 ~ 1.585 ± 0.01)', () => {
  const T = Rules.T;
  let uStart = null;
  let uEnd = null;
  const stepU = 0.0005;

  for (let u = 0; u <= T.LAYERS; u += stepU) {
    if (Rules.rideable(u, T)) {
      if (uStart === null) uStart = u;
      uEnd = u;
    }
  }

  assert.ok(uStart !== null, '找不到騎得住的起點');
  assert.ok(Math.abs(uStart - 0.286) <= 0.01, `u 起點偏差過大：實測 ${uStart.toFixed(4)}，期望 0.286`);
  assert.ok(Math.abs(uEnd - 1.585) <= 0.01, `u 終點偏差過大：實測 ${uEnd.toFixed(4)}，期望 1.585`);
});

// ==========================================
// A2: 換層窗寬
// 門檻：0.30 ± 0.02 個循環
// ==========================================
test('A2: 換層窗寬 (0.30 ± 0.02 個循環)', () => {
  const T = Rules.T;
  let uStart = null;
  let uEnd = null;
  const stepU = 0.0005;

  for (let u = 0; u <= T.LAYERS; u += stepU) {
    if (Rules.rideable(u, T)) {
      if (uStart === null) uStart = u;
      uEnd = u;
    }
  }

  // 換層窗定義：現在騎的聲部騎得住，且底下那條 (u - 1) 也騎得住
  const winStart = uStart + 1;
  const winEnd = uEnd;
  const winWidth = winEnd - winStart;

  assert.ok(
    Math.abs(winWidth - 0.30) <= 0.02,
    `換層窗寬偏差過大：實測 ${winWidth.toFixed(4)} 個循環，期望 0.30 ± 0.02`
  );
});

// ==========================================
// A3: 連續 50 個循環，每個換層窗內的重合拍數
// 門檻：每個 >= 1（預設應為 2）
// ==========================================
test('A3: 連續 50 個循環，每個換層窗內的重合拍數 >= 1（預設為 2）', () => {
  // 規則角色 11/10 修：原本把 ride.id 設成 −cyc、卻只在 0～1000 秒找窗，循環 2 起窗落在負時間而找不到（測試的錯，規則沒錯）。
  // 改成連續 50 個正的循環，每個只在「這一條聲部的一生」裡找窗；兩種起點各跑一次。
  for (const opts of [{ t0: 0 }, { t0: 3.7, seed: 5 }]) {
    const g = Rules.createGame(opts);
    const K = g.T;
    for (let cyc = 0; cyc < 50; cyc++) {
      g.ride.id = cyc;
      const a = g.t0 + cyc * K.CYCLE, b = a + K.LAYERS * K.CYCLE;
      const wins = Rules.switchWindows(a, b, g);
      assert.strictEqual(wins.length, 1, `循環 ${cyc} 找不到換層窗`);
      const w = wins[0];
      assert.ok(w.beats.length >= 1, `循環 ${cyc} 窗內重合拍不足：${w.beats.length}`);
      assert.strictEqual(w.beats.length, 2, `循環 ${cyc} 窗內重合拍數不為 2：${w.beats.length}`);
      for (const bt of w.beats) assert.ok(bt >= w.from - 1e-9 && bt < w.to, `重合拍 ${bt} 要在窗 [${w.from}, ${w.to}) 內`);
      // 規格第 2 節：底下那條的第 2、3 拍（u = 1.322、1.459，以騎的聲部計）
      assert.ok(Math.abs(Rules.voiceU(cyc, w.beats[0], g) - 1.322) < 0.001 && Math.abs(Rules.voiceU(cyc, w.beats[1], g) - 1.459) < 0.001);
    }
  }
});

// ==========================================
// A4: 重合公式
// 門檻：聲部 j+1 的第 c′ 拍時間＝聲部 j 的第 2c′+M 拍時間，誤差 < 1e-9 秒，c′ = 0～20
// ==========================================
test('A4: 重合公式驗證 (c\' = 0～20，誤差 < 1e-9 秒)', () => {
  const g = Rules.createGame({ t0: 0 });
  const M = g.T.M;
  for (let cPrime = 0; cPrime <= 20; cPrime++) {
    const tNext = Rules.beatTime(1, cPrime, g);
    const tCurrent = Rules.beatTime(0, 2 * cPrime + M, g);
    const diff = Math.abs(tNext - tCurrent);
    assert.ok(
      diff < 1e-9,
      `第 ${cPrime} 拍重合誤差超出限制：${diff} 秒 (tNext=${tNext}, tCurrent=${tCurrent})`
    );
  }
});

// ==========================================
// A5: 四條聲部音量平方和的起伏（抽樣 1000 點）
// 門檻：不要求恆定，記錄最大最小值印出供聲音調整
// ==========================================
test('A5: 四條聲部音量平方和的起伏 (抽樣 1000 點)', () => {
  const T = Rules.T;
  let minPower = Infinity;
  let maxPower = -Infinity;
  const samples = 1000;

  for (let i = 0; i < samples; i++) {
    const p = i / samples; // 0 ~ 1 相位
    let sumSq = 0;
    for (let k = 0; k < T.LAYERS; k++) {
      const u = p + k;
      const g = Rules.gainAt(u, T);
      sumSq += g * g;
    }
    if (sumSq < minPower) minPower = sumSq;
    if (sumSq > maxPower) maxPower = sumSq;
  }

  console.log(`[A5 聲學量測] 四條聲部音量平方和起伏: 最小=${minPower.toFixed(4)}, 最大=${maxPower.toFixed(4)}, 差值=${(maxPower - minPower).toFixed(4)}`);
  assert.ok(minPower > 0, '最小音量平方和需大於 0');
  assert.ok(maxPower < 10, '最大音量平方和需有限');
});

// ==========================================
// A6: 完美玩家（kind: 'perfect'）
// 門檻：20 局全過，出聲 0 次
// ==========================================
test('A6: 完美玩家 (kind: perfect) - 20 局全過，出聲 0 次', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const bot = { kind: 'perfect' };
    const res = runSimulation(bot, seed);
    assert.strictEqual(res.win, true, `種子 ${seed} 完美玩家未過關，結束於階段 ${res.game.phase}`);
    assert.strictEqual(res.game.stats.loud, 0, `種子 ${seed} 完美玩家出聲次數不為 0：${res.game.stats.loud}`);
  }
});

// ==========================================
// A7: 只走不換（kind: 'never'）
// 門檻：20 局全敗，都在 2.5 個循環內被發現
// ==========================================
test('A7: 只走不換 (kind: never) - 20 局全敗，2.5 個循環內被抓', () => {
  const limitTime = 2.5 * Rules.T.CYCLE; // 25 秒
  for (let seed = 1; seed <= 20; seed++) {
    const bot = { kind: 'never' };
    const res = runSimulation(bot, seed);
    assert.strictEqual(res.win, false, `種子 ${seed} 竟然過關`);
    assert.strictEqual(res.game.phase, 'fail', `種子 ${seed} 階段應為 fail`);
    assert.ok(
      res.time <= limitTime,
      `種子 ${seed} 未在 2.5 個循環內被發現：耗時 ${res.time.toFixed(2)} 秒 (上限 ${limitTime} 秒)`
    );
  }
});

// ==========================================
// A8: 太早換（kind: 'early'，u 一到 1.0 就換）
// 門檻：每局出聲 >= 2 次；過關率 <= 30%
// ==========================================
test('A8: 太早換 (kind: early) - 每局出聲 >= 2 次；過關率 <= 30%', () => {
  let wins = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const bot = { kind: 'early' };
    const res = runSimulation(bot, seed);
    if (res.win) wins++;
    assert.ok(
      res.game.stats.loud >= 2,
      `種子 ${seed} 出聲次數少於 2 次：實測 ${res.game.stats.loud}`
    );
  }
  const winRate = wins / 20;
  assert.ok(
    winRate <= 0.30,
    `太早換勝率超過 30%：實測 ${(winRate * 100).toFixed(1)}%`
  );
});

// ==========================================
// A9: 太晚換（kind: 'late'，跟不上後 react 0.4 秒才換）
// 門檻：每局出聲 >= 2 次；過關率 <= 30%
// ==========================================
test('A9: 太晚換 (kind: late) - 每局出聲 >= 2 次；過關率 <= 30%', () => {
  let wins = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const bot = { kind: 'late', react: 0.4 };
    const res = runSimulation(bot, seed);
    if (res.win) wins++;
    assert.ok(
      res.game.stats.loud >= 2,
      `種子 ${seed} 出聲次數少於 2 次：實測 ${res.game.stats.loud}`
    );
  }
  const winRate = wins / 20;
  assert.ok(
    winRate <= 0.30,
    `太晚換勝率超過 30%：實測 ${(winRate * 100).toFixed(1)}%`
  );
});

// ==========================================
// A10: 手不準（kind: 'noisy'）
// 門檻：sigma 0.08 秒過關率 60～100%；sigma 0.25 秒比 0.08 秒低至少 20 個百分點
// ==========================================
test('A10（待設計席）: 手不準 (kind: noisy) - sigma 0.08 勝率 60~100%（斷言）；sigma 0.25 降至少 20 個百分點（只印數字）', () => {
  let wins08 = 0;
  let wins25 = 0;
  let offs25 = 0;

  for (let seed = 1; seed <= 20; seed++) {
    const bot08 = { kind: 'noisy', sigma: 0.08, seed };
    const res08 = runSimulation(bot08, seed);
    if (res08.win) wins08++;

    const bot25 = { kind: 'noisy', sigma: 0.25, seed };
    const res25 = runSimulation(bot25, seed);
    if (res25.win) wins25++;
    offs25 += res25.game.stats.switchOff;
  }

  const rate08 = wins08 / 20;
  const rate25 = wins25 / 20;

  assert.ok(
    rate08 >= 0.60 && rate08 <= 1.00,
    `sigma 0.08 勝率不在 60%~100% 範圍內：實測 ${(rate08 * 100).toFixed(1)}%`
  );
  // 規則角色 11/10：在規格准許的 SUSP_LOUD 0.2～0.4 × SUSP_DECAY 0.02～0.05 四個角落都量過，σ0.25 一律 100%；
  // 18 公尺只換 3 次，就算 3 次都按歪，疑心最高 0.4 → 0.6 → 0.8，到不了 1。依第 7 節保留失敗、交設計席，只印數字不擋 CI。
  const drop = rate08 - rate25;
  console.log(`  [A10 待設計席] σ0.08 過關 ${(rate08 * 100).toFixed(0)}%、σ0.25 過關 ${(rate25 * 100).toFixed(0)}%（每局按歪 ${(offs25 / 20).toFixed(2)} 次），降幅 ${(drop * 100).toFixed(0)} 個百分點（要 ≥ 20）${drop >= 0.2 ? '' : ' ⚠ 沒過'}`);
});

// ==========================================
// A11: 亂按（kind: 'spam'，每 0.5 秒按一次換層）
// 門檻：過關率 0%
// ==========================================
test('A11: 亂按 (kind: spam) - 過關率 0%', () => {
  let wins = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const bot = { kind: 'spam' };
    const res = runSimulation(bot, seed);
    if (res.win) wins++;
  }
  assert.strictEqual(wins, 0, `亂按勝率應為 0%，實測過關 ${wins} 局`);
});

// ==========================================
// A12: 站著不動 30 秒
// 門檻：疑心維持 0，沒有任何 step_* 事件
// ==========================================
test('A12: 站著不動 30 秒 - 疑心維持 0，無任何 step_* 事件', () => {
  const g = Rules.createGame({ seed: 42 });
  const dt = 1 / 60;
  let t = g.time;
  const targetT = t + 30;
  const stepEvents = [];

  while (t < targetT) {
    t += dt;
    Rules.step(g, t, { walk: false, switchAt: null });
    const out = Rules.drain(g);
    for (const e of out) {
      if (e.type.startsWith('step_')) {
        stepEvents.push(e);
      }
    }
  }

  assert.strictEqual(g.guard.susp, 0, `站著不動疑心不為 0：${g.guard.susp}`);
  assert.strictEqual(stepEvents.length, 0, `站著不動不應有腳步事件：產生了 ${stepEvents.length} 個事件`);
});

// ==========================================
// A13: 同一個 seed 跑兩次
// 門檻：事件序列完全相同
// ==========================================
test('A13: 同一個 seed 跑兩次 - 事件序列完全相同', () => {
  const seed = 777;
  const run1 = runSimulation({ kind: 'perfect' }, seed);
  const run2 = runSimulation({ kind: 'perfect' }, seed);

  assert.strictEqual(run1.events.length, run2.events.length, '兩次執行產生的事件數量不同');
  for (let i = 0; i < run1.events.length; i++) {
    assert.deepStrictEqual(
      run1.events[i],
      run2.events[i],
      `第 ${i} 個事件不同：\nrun1=${JSON.stringify(run1.events[i])}\nrun2=${JSON.stringify(run2.events[i])}`
    );
  }
});

// ==========================================
// A14: 呈現覆蓋
// 門檻：Rules.EVENTS 每個事件名在 audio.js 的 CUES 有鍵，在 index.html 原始碼裡出現過
// ==========================================
test('A14: 呈現覆蓋 - EVENTS 在 audio.js 的 CUES 與 index.html 中全部具備', () => {
  const htmlPath = path.join(__dirname, 'index.html');
  const htmlCode = fs.readFileSync(htmlPath, 'utf8');
  const audioCues = Audio.CUES;

  assert.ok(audioCues, 'audio.js 必須匯出 CUES 物件');

  for (const ev of Rules.EVENTS) {
    assert.ok(
      ev in audioCues,
      `事件 "${ev}" 未在 audio.js 的 CUES 表中定義`
    );
    assert.ok(
      htmlCode.includes(ev),
      `事件 "${ev}" 未在 index.html 原始碼中出現`
    );
  }
});

// ==========================================
// A15: 不合理的常數
// 門檻：createGame({T:{STRIDE_MIN: 1.2}}) 丟錯（窗寬不足）
// ==========================================
test('A15: 不合理的常數 (STRIDE_MIN: 1.2 丟錯)', () => {
  assert.throws(
    () => {
      Rules.createGame({ T: { STRIDE_MIN: 1.2 } });
    },
    /換層窗寬不足/,
    '未對不合理常數丟出換層窗寬不足的中文錯誤'
  );
});

// ==========================================
// A16: 提示文字
// 門檻：不含「斷」「停」；hintsFor 沒有寫死的數字
// ==========================================
test('A16: 提示文字不含「斷」「停」，且無寫死數字', () => {
  const hints = Rules.hintsFor(Rules.T);
  const keys = Object.keys(hints);

  for (const key of keys) {
    const text = hints[key];
    assert.ok(
      !text.includes('斷'),
      `提示文字 "${key}" 包含了被禁止的字「斷」：${text}`
    );
    assert.ok(
      !text.includes('停'),
      `提示文字 "${key}" 包含了被禁止的字「停」：${text}`
    );
    // 確認沒有阿拉伯數字
    assert.ok(
      !/\d/.test(text),
      `提示文字 "${key}" 不得包含寫死的數字：${text}`
    );
  }

  // 測試改換常數時，hintsFor 不會變出無謂數字或崩潰
  const altHints = Rules.hintsFor({ ...Rules.T, CYCLE: 20 });
  assert.deepStrictEqual(hints, altHints, 'hintsFor 格式應穩定一致');
});

// ==========================================
// 邊界測試（規則角色 11/10 收尾補的；規格第 4.4 節逐條）
// ==========================================

/** 從 g.time 推到 t1（每幀 1/60），每幀輸入 inputFn(g, t)；回傳所有事件。 */
function advance(g, t1, inputFn) {
  const ev = [];
  let t = g.time;
  while (t < t1 - 1e-9 && g.phase === 'play') { t = Math.min(t1, t + 1 / 60); Rules.step(g, t, inputFn ? inputFn(g, t) : {}); ev.push(...Rules.drain(g)); }
  return ev;
}

test('B1 邊界：慢一倍那條還沒進場就按換層 → switch_none，騎的聲部、疑心都不變', () => {
  const g = Rules.createGame({ t0: 0 });
  advance(g, 0.5);
  g.ride.id = Math.floor((0.5 - g.t0) / g.T.CYCLE);   // 騎最年輕的那條（0 ≤ u < 1）：底下那條還沒進場
  const id0 = g.ride.id;
  assert.ok(Rules.voiceU(id0 + 1, 0.51, g) < 0, '前提：目標聲部 u < 0');
  Rules.step(g, 0.51, { walk: false, switchAt: 0.51 });
  const ev = Rules.drain(g);
  assert.deepEqual(ev.map((e) => e.type), ['switch_none']);
  assert.equal(g.ride.id, id0);
  assert.equal(g.guard.susp, 0);
  assert.equal(g.stats.switches, 0);
});

test('B2 邊界：換層鍵離重合拍剛好 ±SWITCH_WIN 算準；再多 0.01 秒就算按歪、加 SUSP_LOUD', () => {
  const K = Rules.T;
  for (const [off, ok] of [[K.SWITCH_WIN, true], [-K.SWITCH_WIN, true], [K.SWITCH_WIN + 0.01, false], [-(K.SWITCH_WIN + 0.01), false]]) {
    const g = Rules.createGame({ t0: 0 });
    const id0 = g.ride.id;
    const w = Rules.switchWindows(g.t0 + id0 * K.CYCLE, g.t0 + (id0 + K.LAYERS) * K.CYCLE, g)[0];
    const at = w.beats[0] + off;
    advance(g, at - 1 / 60);
    Rules.drain(g);
    Rules.step(g, at, { walk: false, switchAt: at });
    const ev = Rules.drain(g);
    const sw = ev.find((e) => e.type === 'switch_ok' || e.type === 'switch_off');
    assert.equal(sw.type, ok ? 'switch_ok' : 'switch_off', `off = ${off}`);
    assert.ok(Math.abs(sw.off - off) < 1e-9, '回報的 off 就是離重合拍的偏差');
    assert.equal(g.ride.id, id0 + 1, '不管準不準都換過去');
    assert.ok(Math.abs(g.guard.susp - (ok ? 0 : K.SUSP_LOUD)) < 1e-9);
    assert.equal(ev.some((e) => e.type === 'guard_hear'), !ok);
  }
});

test('B3 邊界：沒出聲時疑心每秒退 SUSP_DECAY、不低於 0；站著不動也照退', () => {
  const K = Rules.T;
  const g = Rules.createGame({ t0: 0 });
  g.guard.susp = 0.5;
  advance(g, 5);
  assert.ok(Math.abs(g.guard.susp - (0.5 - K.SUSP_DECAY * 5)) < 1e-6, `${g.guard.susp}`);
  advance(g, 5 + 0.5 / K.SUSP_DECAY);
  assert.equal(g.guard.susp, 0);
});

test('B4 邊界：騎的聲部已經消失（u ≥ LAYERS）還在走 → 每 STRIDE_MIN 秒一步 step_loud fast，直到被抓', () => {
  const K = Rules.T;
  const g = Rules.createGame({ t0: 0, T: { SUSP_LOUD: 0.2, SUSP_DECAY: 0.02 } });
  const id0 = g.ride.id;
  const tGone = g.t0 + (id0 + K.LAYERS) * K.CYCLE + 0.01;
  advance(g, tGone);                       // 站著讓它老到消失
  assert.ok(Rules.voiceU(id0, tGone, g) >= K.LAYERS);
  const ev = advance(g, tGone + 10, () => ({ walk: true, switchAt: null }));
  const steps = ev.filter((e) => e.type === 'step_loud');
  assert.ok(steps.length >= 2 && steps.every((e) => e.cause === 'fast' && e.id === id0));
  for (let i = 1; i < steps.length; i++) assert.ok(Math.abs(steps[i].t - steps[i - 1].t - K.STRIDE_MIN) < 1e-9, '間隔 STRIDE_MIN');
  assert.equal(g.phase, 'fail');
  assert.ok(ev.some((e) => e.type === 'caught'));
});

test('B5 邊界：beatsBetween 是半開區間 [a, b)；把一段時間切成很多小段查，拍點不重不漏（聲音層排程靠這個）', () => {
  const g = Rules.createGame({ t0: 1.234 });
  const whole = Rules.beatsBetween(10, 60, g);
  const parts = [];
  for (let a = 10; a < 60 - 1e-9; a += 0.025) parts.push(...Rules.beatsBetween(a, Math.min(60, a + 0.025), g));
  assert.deepEqual(parts.map((x) => x.id + ':' + x.c), whole.map((x) => x.id + ':' + x.c));
  const b0 = whole[0];
  assert.ok(Rules.beatsBetween(b0.t, b0.t + 1e-6, g).some((x) => x.id === b0.id && x.c === b0.c), '起點那一拍包含');
  assert.ok(!Rules.beatsBetween(b0.t - 1, b0.t, g).some((x) => x.id === b0.id && x.c === b0.c), '終點那一拍不含');
});

test('B6 邊界：任何時刻剛好 LAYERS 條聲部，慢到快（u 由小到大）；聲部 j+1 的每一拍都落在聲部 j 的拍上', () => {
  const g = Rules.createGame({ t0: 0.7 });
  for (let t = 40.7; t < 80; t += 0.37) {
    const vs = Rules.voicesAt(t, g);
    assert.equal(vs.length, g.T.LAYERS, `t=${t}`);
    for (let i = 1; i < vs.length; i++) assert.ok(vs[i].u > vs[i - 1].u);
    for (const v of vs) assert.ok(v.nextBeat >= t - 1e-9 && v.u >= 0 && v.u < g.T.LAYERS);
  }
});

test('B7 邊界：讓換層窗內沒有重合拍的常數也丟錯，訊息是中文', () => {
  assert.throws(() => Rules.createGame({ T: { STRIDE_MIN: 1.2 } }), /換層窗/);
  assert.throws(() => Rules.createGame({ T: { COVER_GAIN: 0.6 } }), /[一-鿿]/);
  assert.doesNotThrow(() => Rules.createGame({}));
});

test('B8 邊界：完美玩家過關時剛好走了 LANE ÷ STEP_LEN 步，win 事件帶的出聲數與換層數和 stats 一致', () => {
  const K = Rules.T;
  const r = runSimulation({ kind: 'perfect' }, 3);
  assert.ok(r.win);
  assert.equal(r.game.stats.steps, Math.ceil(K.LANE / K.STEP_LEN - 1e-9));
  const w = r.events.find((e) => e.type === 'win');
  assert.equal(w.loud, r.game.stats.loud);
  assert.equal(w.switches, r.game.stats.switches);
  assert.equal(w.loud, 0);
});
