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
  // 11/17 期末七段地圖：opts.wp（{區號: 路線點}）、opts.gateZone（城門區號）、opts.takedown（{id, zone, from}：暗殺目標、在哪一區、走到第幾個路線點起動手）。
  // 沒給就是預設地圖原本的值（照搬部分的行為逐字不變）。forBotLevel(level) 從地圖的 botRoute 欄位組出這三項。
  const GATE_Z = opts.gateZone != null ? opts.gateZone : 4;
  const TK = opts.takedown || { id: 'g3a', zone: 3, from: 2 };
  const WP = opts.wp || {
    1: [{ x: 11, z: 15 }],
    2: [{ x: 14, z: 22 }, { x: 17, z: 26.5 }, { x: 28, z: 25.5 }, { x: 31, z: 22.5 }],
    3: [{ x: 34, z: 25.5 }, { x: 36.4, z: 23 }, { x: 38.5, z: 26.5 }, { x: 46.8, z: 24.5 }],
    4: [{ x: 50, z: 26 }, { x: 56, z: 24 }, { x: 58.2, z: 15.5 }]
  };
  let zone = -1, wi = 0, calmBeat = null, walkingPrev = false, hideAt = null, hideCk = null;
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
    // 第 12 節（MOVES_MODE）：追兵會進影子搜 → 聽著躲：走到最近那塊影子裡離搜索線最遠的角（內縮 0.4；第 17.3 節），
    // 到了以後追兵在 3 公尺內就屏息（快憋不住就放開），離開就換氣。報告版（開關關著）照舊。
    if (!g.hunted) hideAt = null;
    if (g.hunted && K.MOVES_MODE) {
      if (!hideAt) {
        let bs = null, bd2 = 1e9;
        for (const s of g.level.shadows) {
          const cx = Math.max(s.x0, Math.min(pl.x, s.x1)), cz = Math.max(s.z0, Math.min(pl.z, s.z1)), d = Math.hypot(cx - pl.x, cz - pl.z);
          if (d < bd2) { bd2 = d; bs = s; }
        }
        // 第 17.3 節：追兵會順著你進來的方向搜（消失點 → 影子中心 → 穿出去那端），所以躲在離那條線最遠的角落（同樣遠就取離自己較遠的）
        let fd = -1;
        const cx = (bs.x0 + bs.x1) / 2, cz = (bs.z0 + bs.z1) / 2, lx = cx - pl.x, lz = cz - pl.z, ll = Math.hypot(lx, lz) || 1;
        for (const [x, z] of [[bs.x0 + 0.4, bs.z0 + 0.4], [bs.x0 + 0.4, bs.z1 - 0.4], [bs.x1 - 0.4, bs.z0 + 0.4], [bs.x1 - 0.4, bs.z1 - 0.4]]) {
          const off = Math.abs((x - pl.x) * lz - (z - pl.z) * lx) / ll;   // 離搜索線多遠
          const d = off * 10 + Math.hypot(x - pl.x, z - pl.z); if (d > fd) { fd = d; hideAt = { x, z }; }
        }
      }
      const hx = hideAt.x - pl.x, hz = hideAt.z - pl.z, hd = Math.hypot(hx, hz);
      // 第 17.4 節：追兵在 4 公尺內先跑、拉開後改用走的進影子；在影子裡追兵進到 3 公尺內就停下屏息，等他走遠再挪
      let qd = 1e9;
      for (const q of g.guards) if (q.active && q.state === 'hunted') qd = Math.min(qd, Math.hypot(q.x - pl.x, q.z - pl.z));
      const holdOk = pl.breathT < K.BREATH_MAX - 0.2;
      if (pl.hidden && qd <= 3 && holdOk && (hd <= 0.3 || pl.breathing || qd <= 3)) { inp.breath = true; return inp; }
      if (hd > 0.3) {
        inp.mx = hx / hd; inp.mz = hz / hd;
        if (!pl.hidden && qd <= 4) inp.run = true;
        else if (blind && hd > K.DASH_HUNT) inp.dash = true;
      }
      return inp;
    }
    if (g.hunted) {
      let best = null, bd = 1e9;
      for (const s of g.level.shadows) {
        const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, d = Math.hypot(cx - pl.x, cz - pl.z);
        if (d < bd) { bd = d; best = { x: cx, z: cz }; }
      }
      if (bd > 0.3) { inp.mx = (best.x - pl.x) / bd; inp.mz = (best.z - pl.z) / bd; if (blind) inp.dash = true; }
      return inp;
    }
    // 第 13 節（MOVES_MODE）：衛兵過來查看 → 退開並屏息：踩著鼓點走到「離他要去的那一點 3 公尺以上」的影子角落（6 公尺內、直線走得到），
    // 沒有就退到離那一點 3 公尺外；到了以後他進到 3 公尺內就屏息（快憋不住就放開）。查看結束先沿原路走回躲之前的位置，再接著走路線。
    const chk = K.MOVES_MODE ? act.filter((q) => q.state === 'checking') : [];
    const clearPath = (x0, z0, x1, z1) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25));
      for (let k = 0; k <= n; k++) {
        const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
        if (g.level.walls.some((wl) => x > wl.x0 - 0.35 && x < wl.x1 + 0.35 && z > wl.z0 - 0.35 && z < wl.z1 + 0.35)) return false;
      }
      return true;
    };
    const stepOk = () => walkingPrev || [1 / 144, 1 / 60, 1 / 30].every((dd) => R.stepMasked(t + dd, g));
    if (chk.length && !g.hunted) {
      let cq = null, cd = 1e9;
      for (const q of chk) { const d = Math.hypot(q.x - pl.x, q.z - pl.z); if (d < cd) { cd = d; cq = q; } }
      const holdOk = pl.breathT < K.BREATH_MAX - 0.2;
      // 有任何一名查看中的衛兵要去的點落在躲點 3 公尺內，就換地方（走過的點記在 trail，回程倒著走）
      // 第 17.2 節後他停在離目標 CHECK_STOP_R 的地方、盯著目標：躲點要離「他走去的點」和「他盯著的目標」都 3 公尺以上
      const threat = (x, z) => chk.some((q) => q.check && (Math.hypot(q.check.walkTo.x - x, q.check.walkTo.z - z) < 3 || Math.hypot(q.check.target.x - x, q.check.target.z - z) < 3));
      if (!hideCk || (Math.hypot(hideCk.x - pl.x, hideCk.z - pl.z) <= 0.2 && threat(hideCk.x, hideCk.z) && !hideCk.moved2)) {
        if (hideCk) hideCk.moved2 = true;
        const w = cq.check ? cq.check.target : cq;
        let best = null, bt = 1e9;
        for (const s of g.level.shadows) {
          for (const [x, z] of [[s.x0 + 0.4, s.z0 + 0.4], [s.x0 + 0.4, s.z1 - 0.4], [s.x1 - 0.4, s.z0 + 0.4], [s.x1 - 0.4, s.z1 - 0.4], [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2]]) {
            const tr = Math.hypot(x - pl.x, z - pl.z);
            if (tr > 6 || tr >= bt || threat(x, z) || Math.hypot(x - w.x, z - w.z) < 3 || !clearPath(pl.x, pl.z, x, z)) continue;
            bt = tr; best = { x, z };
          }
        }
        if (!best) {
          // 沒有影子可躲：沿來時的路線往回退（上一個路線點，或這一區的起點），退到離那一點 3.2 公尺外
          const prev = wi > 0 ? WP[g.zone][wi - 1] : g.level.zones[g.zone].start;
          const ux = prev.x - pl.x, uz = prev.z - pl.z, ul = Math.hypot(ux, uz);
          if (Math.hypot(pl.x - w.x, pl.z - w.z) >= 3.2 || ul < 0.3) best = { x: pl.x, z: pl.z };
          else for (let k = 0.5, first = true; k <= Math.max(0.5, Math.min(6, ul)) + 1e-9; k += 0.5, first = false) {
            const x = pl.x + ux / ul * k, z = pl.z + uz / ul * k;
            best = { x, z };
            if (Math.hypot(x - w.x, z - w.z) >= 3.2) break;
          }
        }
        if (!hideCk) hideCk = { trail: [] };
        hideCk.trail.push({ x: pl.x, z: pl.z });
        hideCk.x = best.x; hideCk.z = best.z;
      }
      const mx = hideCk.x - pl.x, mz = hideCk.z - pl.z, ml = Math.hypot(mx, mz);
      if (ml > 0.2) {
        if (pl.breathing && cd <= 3 && holdOk) { inp.breath = true; return inp; }
        if (stepOk()) { inp.mx = mx / ml; inp.mz = mz / ml; }
      } else if (cd <= 3 && holdOk) inp.breath = true;
      return inp;
    }
    while (hideCk && !g.hunted && hideCk.trail.length) {   // 查看結束：沿走過的點倒著走回躲之前的位置
      const b = hideCk.trail[hideCk.trail.length - 1];
      const bx = b.x - pl.x, bz = b.z - pl.z, bl = Math.hypot(bx, bz);
      if (bl > 0.3) { if (stepOk()) { inp.mx = bx / bl; inp.mz = bz / bl; } return inp; }
      hideCk.trail.pop();
    }
    hideCk = null;
    if (g.panic.active) {
      const b = R.bassBeatNear(t, g.bass.anchor, K.BASS_PERIOD, K.BASS_WIN);
      if (Math.abs(b.off) < 0.03 && calmBeat !== b.beat) { inp.calm = true; calmBeat = b.beat; }
      inp.breath = pl.breathT < K.BREATH_MAX - 0.5 && (pl.breathing || pl.breathT < 2) && wantBreath();
      return inp;
    }
    // 城門
    if (g.zone === GATE_Z && wi >= WP[GATE_Z].length) {
      const quiet = p <= K.GATE_LOW_P - 0.02 && act.every(q => d3(q) > r(q) * K.BREATH_HEAR + 0.5);
      if (quiet) inp.interact = true;
      else inp.breath = pl.breathT < K.BREATH_MAX - 0.5 && wantBreath();
      return inp;
    }
    if (!WP[g.zone] || !WP[g.zone][wi]) return inp;   // 11/17：路線走完卻還沒換區（例如追殺中出口擋住、追殺結束後）就站著等；預設地圖原本不會走到這裡
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
    const tgt = act.find(q => q.id === TK.id);
    if (tgt && g.zone === TK.zone && wi >= TK.from) {
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
      if (blind && dw > 1.5 && !(tgt && g.zone === TK.zone)) inp.dash = true;
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

/**
 * 11/17：從地圖資料組出 makeBot 的 {wp, gateZone, takedown}。wp＝每區的 botRoute；城門＝出口是 gate 的區；
 * 暗殺目標＝teach 'takedown' 那一區的站崗衛兵（路線只有一點），第 2 個路線點起動手（同預設地圖）。
 */
function forBotLevel(level) {
  const wp = {};
  let gateZone = null, takedown = null;
  level.zones.forEach((z, i) => {
    if (z.botRoute) wp[i] = z.botRoute;
    if (z.exit && z.exit.kind === 'gate') gateZone = i;
    if (z.teach === 'takedown' && !takedown) {
      const q = level.guards.find((o) => o.zone === i && o.route.length === 1);
      if (q) takedown = { id: q.id, zone: i, from: 2 };
    }
  });
  return { wp, gateZone, takedown: takedown || { id: null, zone: -1, from: 0 } };
}

module.exports = { forBotLevel,  R, RULES_PATH, makeBot, makeForwardBot, activeNow, runGame, BOTS, gauss };
