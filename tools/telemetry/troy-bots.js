// 木馬之夜程式玩家（整夜批次驗證用；Node 直接跑規則層 prototypes/troy-prologue/risset.js，不開瀏覽器）
//
// 來源：makeBot（含 opts.sigma 起步誤差）與 activeNow（含 ruler）**逐字照搬** prototypes/troy-prologue/risset.test.js（規則角色，提交 0f21bf8：路線點不停、起步判定涵蓋幀率抖動），
// 因為測試檔沒有匯出、本角色不改 prototypes/。規則角色改了那邊，這裡要重新照搬（docs/process/agent-notes/tools.md 第 2 節）。
// 本檔自己的部分只有：BOTS 清單（加 σ 0.25）、runGame 多記死因代號、每區停留時間、進高度警覺次數（sfx 'alerted'）、兩把尺的 N1。
'use strict';
const path = require('node:path');

const RULES_PATH = path.resolve(__dirname, '../../prototypes/troy-prologue/risset.js');
const R = require(RULES_PATH);
const DT = 1 / 60;

// ---------- 以下逐字照搬 risset.test.js ----------
/*
 * opts.cover：COVER_MODE 下多一條路——p > COVER_EAR_P 時，只要範圍內沒有衛兵看得到下一步的位置，就踩著鼓點走。
 * opts.sigma：起步誤差。每次從停下到起步抽一個 e ~ N(0, sigma)，用「t − e 那一刻」的狀態決定要不要起步：e < 0 太早、e > 0 太晚；
 *   走著的時候、停下、衝刺與暗殺都用真實狀態（只模擬「起步」這一下的手誤）。opts.seed 決定誤差序列。
 * activeNow ruler：'own'＝各版照自己的規則量 N1；'cover'＝新版量法（設計席 7.6：舊版也照算踩拍走），兩版同一把尺。
 */
function makeBot(opts = {}) {
  const WP = {
    1: [{ x: 11, z: 15 }],
    2: [{ x: 14, z: 22 }, { x: 17, z: 26.5 }, { x: 28, z: 25.5 }, { x: 31, z: 22.5 }],
    3: [{ x: 34, z: 25.5 }, { x: 36.4, z: 23 }, { x: 38.5, z: 26.5 }, { x: 46.8, z: 24.5 }],
    4: [{ x: 50, z: 26 }, { x: 56, z: 24 }, { x: 58.2, z: 15.5 }]
  };
  let zone = -1, wi = 0, calmBeat = null, walkingPrev = false;
  const erng = R.mulberry32((opts.seed || 1) * 97 + 13);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = erng(); v = erng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  let curErr = opts.sigma ? gauss() * opts.sigma : 0;
  const inner = function (g) {
    const K = g.T, t = g.time, pl = g.player, c = g.cycle, p = c.p, blind = c.blind;
    const inp = { mx: 0, mz: 0 };
    // 起步誤差：停著的時候，用 t − e 那一刻的狀態判斷「現在起步可不可以」
    const err = (walkingPrev || !opts.sigma) ? 0 : curErr;
    const tv = t - err;
    const pV = err === 0 ? p : (((p + (tv - t) / c.T) % 1) + 1) % 1;
    const blindV = err === 0 ? blind : R.blindWindows(tv - 1e-6, tv + 1e-6, g).some((w) => tv >= w.from && tv < w.to);
    if (g.zone !== zone) { zone = g.zone; wi = 0; }
    const act = g.guards.filter(q => q.active);
    const r = (q, pp = p) => R.radiusAt(pp, q.state !== 'patrol', K);
    const d3 = (q, x = pl.x, z = pl.z) => Math.hypot(q.x - x, q.z - z, pl.y || 0);
    const wantBreath = () => act.some(q => d3(q) <= r(q, Math.min(1, p + 0.05)) * K.BREATH_HEAR + 0.8);
    // 追殺：躲到最近陰影深處
    if (g.hunted) {
      let best = null, bd = 1e9;
      for (const s of g.level.shadows) {
        const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, d = Math.hypot(cx - pl.x, cz - pl.z);
        if (d < bd) { bd = d; best = { x: cx, z: cz }; }
      }
      if (bd > 0.3) { inp.mx = (best.x - pl.x) / bd; inp.mz = (best.z - pl.z) / bd; if (blind) inp.dash = true; }
      return inp;
    }
    if (g.panic.active) {
      const b = R.bassBeatNear(t, g.bass.anchor, K.BASS_PERIOD, K.BASS_WIN);
      if (Math.abs(b.off) < 0.03 && calmBeat !== b.beat) { inp.calm = true; calmBeat = b.beat; }
      inp.breath = pl.breathT < K.BREATH_MAX - 0.5 && (pl.breathing || pl.breathT < 2) && wantBreath();
      return inp;
    }
    // 城門
    if (g.zone === 4 && wi >= WP[4].length) {
      const quiet = p <= K.GATE_LOW_P - 0.02 && act.every(q => d3(q) > r(q) * K.BREATH_HEAR + 0.5);
      if (quiet) inp.interact = true;
      else inp.breath = pl.breathT < K.BREATH_MAX - 0.5 && wantBreath();
      return inp;
    }
    let w = WP[g.zone][wi];
    let dx = w.x - pl.x, dz = w.z - pl.z, dw = Math.hypot(dx, dz);
    // 11/11 修：到了路線點同一幀就轉向下一個點，不停一幀（停了再起步，幀率抖動時起步那一步可能離拍出聲；
    // 整夜驗證 seed 191、315 就是這樣在窄巷驚動 g3a、之後被盯著站在他面前而被抓）
    while (dw < 0.35) {
      wi++;
      if (!WP[g.zone][wi]) return inp;
      w = WP[g.zone][wi]; dx = w.x - pl.x; dz = w.z - pl.z; dw = Math.hypot(dx, dz);
    }
    const ux = dx / dw, uz = dz / dw;
    // 暗殺目標：區 3 的站崗衛兵
    const tgt = act.find(q => q.id === 'g3a');
    if (tgt && g.zone === 3 && wi >= 2) {
      const dd = Math.hypot(tgt.x - pl.x, tgt.z - pl.z);
      if (blind && dd <= K.TAKEDOWN_R) { inp.takedown = true; return inp; }
      if (blind) { inp.mx = (tgt.x - pl.x) / dd; inp.mz = (tgt.z - pl.z) / dd; return inp; }
    }
    const nx = pl.x + ux * 0.3, nz = pl.z + uz * 0.3;
    const safe = act.every(q => {
      const mg = q === tgt ? 0.25 : 0.6;
      return Math.hypot(q.x - nx, q.z - nz, pl.y || 0) > r(q, Math.min(1, p + 0.03)) + mg;
    });
    // 殘響掩護：範圍內的衛兵都看不到下一步的位置（在陰影裡，或在視野外留 0.2 rad 餘裕）
    const hiddenAt = (x, z) => g.level.shadows.some((s) => R.inRect(x, z, s));
    const unseen = act.every((q) => {
      const d = Math.hypot(q.x - nx, q.z - nz, pl.y || 0);
      if (d > r(q, Math.min(1, p + 0.03)) + 0.6) return true;
      if (hiddenAt(nx, nz)) return true;
      const f = R.forward(q.yaw);
      return R.angDiff(Math.atan2(nx - q.x, nz - q.z), Math.atan2(f.x, f.z)) > K.FOV + 0.2;
    });
    // 11/11：起步要看「下一幀」會不會踩在鼓點上，而下一幀可能在 1/144～1/30 秒後（幀率抖動），整段都踩得到才起步
    const coverStep = !!opts.cover && K.COVER_MODE && pV > K.COVER_EAR_P + 0.01 && unseen &&
      (walkingPrev || [1 / 144, 1 / 60, 1 / 30].every((d) => R.stepMasked(tv + d, g))) && act.every((q) => Math.hypot(q.x - nx, q.z - nz) > K.STEP_R);
    const canMove = blindV || (pV <= 0.57 && safe) || coverStep;
    if (canMove) {
      inp.mx = ux; inp.mz = uz;
      if (blind && dw > 1.5 && !(tgt && g.zone === 3)) inp.dash = true;
    } else {
      inp.breath = pl.breathT < K.BREATH_MAX - 0.4 && wantBreath();
    }
    return inp;
  };
  return function (g) {
    const out = inner(g);
    const moving = !!(out.mx || out.mz);
    if (moving && !walkingPrev && opts.sigma) curErr = gauss() * opts.sigma;   // 起步了：下一次起步重新抽誤差
    walkingPrev = moving;
    return out;
  };
}

function activeNow(g, ruler = 'own') {
  const K = g.T, pl = g.player, p = g.cycle.p;
  if (g.cycle.blind) return true;
  if (g.panic.active) return false;
  const act = g.guards.filter((q) => q.active);
  const rq = (q) => R.radiusAt(p, q.state !== 'patrol', K);
  const d = (q) => Math.hypot(q.x - pl.x, q.z - pl.z, pl.y || 0);
  const L = g.level.gate && g.level.gate.latch;
  if (g.zone === 4 && L && Math.hypot(L.x - pl.x, L.z - pl.z) <= K.LATCH_R && p <= K.GATE_LOW_P) return true;
  const stepRule = ruler === 'cover' || !!K.COVER_MODE;
  const earP = (ruler === 'own' && K.COVER_MODE) ? K.COVER_EAR_P : 0;
  return act.every((q) => {
    if (p <= K.HIGH_P && d(q) > rq(q)) return true;
    if (!stepRule || p <= earP) return false;
    if (d(q) > rq(q) || pl.hidden) return true;
    const f = R.forward(q.yaw);
    return R.angDiff(Math.atan2(pl.x - q.x, pl.z - q.z), Math.atan2(f.x, f.z)) > K.FOV;
  });
}
// ---------- 照搬結束 ----------

/** 只按住前進鍵：照路線點一直走，不看衛兵、不屏息、不衝刺、不安撫、不暗殺；到城門就一直按住 E（照搬）。 */
function makeForwardBot() {
  const WP = {
    1: [{ x: 11, z: 15 }],
    2: [{ x: 14, z: 22 }, { x: 17, z: 26.5 }, { x: 28, z: 25.5 }, { x: 31, z: 22.5 }],
    3: [{ x: 34, z: 25.5 }, { x: 36.4, z: 23 }, { x: 38.5, z: 26.5 }, { x: 46.8, z: 24.5 }],
    4: [{ x: 50, z: 26 }, { x: 56, z: 24 }, { x: 58.2, z: 15.5 }]
  };
  let zone = -1, wi = 0;
  return function (g) {
    const pl = g.player;
    if (g.zone !== zone) { zone = g.zone; wi = 0; }
    const w = (WP[g.zone] || [])[wi];
    if (!w) return { interact: true };
    const dx = w.x - pl.x, dz = w.z - pl.z, dw = Math.hypot(dx, dz);
    if (dw < 0.35) { wi++; return {}; }
    return { mx: dx / dw, mz: dz / dw };
  };
}

/** 玩家清單。make(cover, seed)；舊版（cover = false）沒有踩拍走，「完美」就是完美時機的固定策略。 */
const BOTS = {
  forward: { name: '只按前進', make: () => makeForwardBot() },
  perfect: { name: '完美踩拍', make: (cover) => makeBot({ cover }) },
  sigma12: { name: 'σ 0.12 起步誤差', make: (cover, seed) => makeBot({ cover, sigma: 0.12, seed }) },
  sigma25: { name: 'σ 0.25 起步誤差', make: (cover, seed) => makeBot({ cover, sigma: 0.25, seed }) }
};

/**
 * 一局（和規則測試 runGame 同樣的 t0、幀率抖動取法；一條命：第一次 fail 就結束），最多 maxT 秒。
 * 回傳 {win, t, n1, n1c, zone, cause, zoneTime, alerted}：n1＝自己規則的 N1、n1c＝同一把尺（新版量法）、alerted＝進高度警覺次數。
 */
function runGame(cover, seed, bot, opts = {}) {
  const maxT = opts.maxT || 420;
  const t0 = (seed * 1.37) % 10, jitter = seed % 2 === 1;
  const g = R.createLevel({ t0, seed, T: Object.assign({ COVER_MODE: cover }, opts.T || {}) });
  const jr = R.mulberry32(seed * 7 + 3);
  let t = 2, act = 0, actC = 0, all = 0, alerted = 0;
  const zoneTime = {};
  g.step(t, {}); g.step(t, { start: true });
  while (g.phase === 'play' || g.phase === 'intro') {
    if (t > maxT) break;
    const dt = jitter ? 1 / 144 + jr() * (1 / 30 - 1 / 144) : DT;
    t += dt;
    g.step(t, bot(g));
    for (const e of g.drain()) if (e.type === 'sfx' && e.a === 'alerted') alerted++;
    if (g.phase === 'play') {
      all += dt; if (activeNow(g)) act += dt; if (activeNow(g, 'cover')) actC += dt;
      zoneTime[g.zone] = (zoneTime[g.zone] || 0) + dt;
    }
  }
  const win = g.phase === 'win';
  const cause = win ? null : g.phase === 'fail' ? (g.failCode || 'unknown') : 'timeout';
  return { win, t: t - 2, n1: all > 0 ? act / all : 0, n1c: all > 0 ? actC / all : 0, zone: g.zone, cause, zoneTime, alerted };
}

/** 常態分布亂數（Box–Muller，和規則測試同式），給測試驗抽樣。 */
function gauss(rnd) { let u = 0; while (u === 0) u = rnd(); const v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

module.exports = { R, RULES_PATH, makeBot, makeForwardBot, activeNow, runGame, BOTS, gauss };
