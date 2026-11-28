/* playtest-recorder 設定檔：序章《特洛伊的迴響》木馬之夜（prototypes/troy-prologue/）
 *
 * 設定檔介面（其他原型照抄這個形狀即可）：
 *   dir / page        要服務的資料夾（相對本檔）與入口頁
 *   prepare(page,o)   載入後的準備：調參、按「開始」；o 是命令列選項
 *   probe()           在頁面裡每幀執行，回傳一筆狀態（必須含 t＝音訊時間；可含 blind、alert、events）
 *   bot(api,s,st)     程式玩家，每幀在頁面裡執行；api.down/up/press(code) 派送鍵盤事件
 *   intervals(tl,m,ev) 在 Node 端回傳 {blind, alert, hunted, fake} 區段（音訊時間）；一律用規則時間軸記錄的實際值，
 *                    不可用 t0 + k × T 推算（循環長度會變）
 *   expectedBeats(tl) 在 Node 端由時間軸算出「規則上的拍點」{t, w, kind}，給分析比對起音
 *                    （直接 require 規則檔 risset.js，用 RissetRules.beatsBetween 產生，不抄公式、不拿聲音層常數）
 *   summary(tl,m,ev,IV) 可選：報告多加一節（這裡是循環長度隨危險變化、盲區長度、假驟降）
 * probe 與 bot 會被 toString() 送進頁面，所以只能用頁面裡的全域變數，不能引用本檔的東西。
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// 規則檔是 UMD，Node 可直接 require；期望拍一律由它產生（P1）
const Rules = require('../../../prototypes/troy-prologue/risset.js');
const num = (...v) => v.find(x => Number.isFinite(x));

export default {
  name: 'troy-prologue',
  title: '木馬之夜',
  dir: '../../../prototypes/troy-prologue',
  page: 'index.html',
  viewport: { width: 960, height: 540 },
  renderScale: 0.5,                     // 無 GPU 的雲端：三維場景以半解析度算圖，幀率約 2 倍
  defaults: { duration: 80 },
  /* 喇叭可聽度檢查（analyze.mjs 第 6～8 項；11/08 加，回應 11/07 喇叭試玩）：
   *   preBlind：一般盲區前 lead 秒內，1～3 kHz 頻帶峰值比前 1 秒平均高 ≥ 6 dB（預告音在喇叭上聽得出來；假驟降前不該有）
   *   bassMid ：警戒時每個低音拍，200～600 Hz 頻帶峰值比前 1 秒背景高 ≥ 6 dB（低音拍的中頻敲擊成分，喇叭聽得到的最低頻段）
   *   steps   ：step_loud 與 step_masked 在 1～4 kHz「相對前 0.3 秒上升量」的中位差 ≥ 12 dB（不合拍的碎石聲要突然冒出來、合拍的不多出聲音）
   * 另外 analyze.mjs 會把錄音先過 200 Hz 高通（喇叭模擬）再跑全部檢查，報告兩組數字。 */
  analysis: {
    speaker: {
      preBlind: { band: [1000, 3000], lead: 0.4, minDb: 6 },
      bassMid: { band: [200, 600], minDb: 6 },
      steps: { loud: '^step_?loud$', masked: '^step_?masked$', band: [1000, 4000], minDb: 12 }
    }
  },

  async prepare(page, o) {
    await page.waitForFunction(() => window.TroyDebug && window.RissetRules && window.RissetAudio, null, { timeout: 30000 });
    const cycle = o.cycle ? +o.cycle : null;
    // 鼓聲模式（核心方向甲，11/10）：--cover cover｜gap 設定開場選單 #oCover（規則 T.COVER_MODE）；不給就用頁面預設（cover）
    const cover = o.cover === 'gap' || o.cover === 'false' ? 'gap' : (o.cover === 'cover' || o.cover === true || o.cover === 'true') ? 'cover' : null;
    // --play-through（11/11，全流程影片）：把整夜驗證的「完美踩拍」玩家（tools/telemetry/troy-bots.js 的 makeBot，原樣）送進頁面，從開場玩到通關
    if (o.playThrough) {
      const { createRequire } = await import('node:module');
      const src = createRequire(import.meta.url)('../../telemetry/troy-bots.js').makeBot.toString();
      // --sigma <秒>／--seed <整數>（11/12，模仿真人）：起步誤差，和 makeBot 的 opts.sigma／opts.seed 同義；不給就是完美踩拍
      const human = { sigma: o.sigma ? +o.sigma : 0, seed: o.seed ? +o.seed : 1 };
      // 11/18：七段地圖（?map=final）要用地圖自己的 botRoute（forBotLevel），否則程式玩家照預設地圖的路線走、卡在第 2 區
      const flSrc = createRequire(import.meta.url)('../../telemetry/troy-bots.js').forBotLevel.toString();
      await page.evaluate(({ src, human, flSrc }) => {
        window.__recPlayMake = () => {
          const opts = Object.assign({ cover: window.TroyDebug.game.T.COVER_MODE === true }, human.sigma ? human : {});
          // 11/24：短展示版（?map=demo）同理，用 TroyLevelDemo 的 botRoute
          const mq = new URLSearchParams(location.search).get('map'), RR = window.RissetRules;
          const src0 = mq === 'final' ? window.TroyLevelFinal : mq === 'demo' ? window.TroyLevelDemo : null;
          const lv = src0 && RR.resolveLevel ? RR.resolveLevel(src0) : null;
          if (lv) Object.assign(opts, new Function('return (' + flSrc + ')')()(lv));
          return new Function('R', 'return (' + src + ')')(window.RissetRules)(opts);
        };
      }, { src, human, flSrc });
    }
    // --human-cam（11/12，報告影片）：只換「畫出來的視角」，模仿真人轉頭。遊戲邏輯照舊讀 V.yaw（程式玩家要走的方向），
    // 畫圖那一刻才換成平滑、會落後、會東張西望的視角，畫完換回；所以路線、判定、數字和沒開時一樣。
    // 規則：移動時視角用彈簧追移動方向（約 0.25 秒跟上、每秒最多轉 4.5 弧度），每 3～6 秒瞄一下旁邊或附近衛兵；
    // 停下或躲著時看向最近的衛兵；加一點手持晃動。重來、結尾動畫時不介入。
    if (o.humanCam) await page.evaluate((seed) => {
      let r = (Math.abs(seed | 0) * 7919 + 17) % 233280 || 1;
      const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
      const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      const lookYaw = (pl, x, z) => Math.atan2(-(x - pl.x), -(z - pl.z));   // 前方 (−sin yaw, −cos yaw)
      const H = window.__humanCam = { yaw: null, pitch: 0, vy: 0, vp: 0, last: 0, px: 0, pz: 0, gUntil: 0, gOff: 0, gGuard: false, next: 2 + rnd() * 3, ph: [0, 1, 2, 3].map(() => rnd() * 6.283) };
      // three r128 的 render 是渲染器物件自己的方法（攔原型攔不到），改用場景的 onBeforeRender：
      // 它在鏡頭矩陣更新之後、真正畫之前呼叫，所以改完角度要自己 updateMatrixWorld。下一幀遊戲會重設鏡頭角度，不必換回。
      const scene = window.TroyDebug.scene;
      const prev = scene.onBeforeRender;
      scene.onBeforeRender = function (ren, sc, cam) {
        if (prev) prev.apply(this, arguments);
        const D = window.TroyDebug, g = D && D.game, V = D && D.V;
        if (!g || !V || !cam || !cam.isPerspectiveCamera || g.phase !== 'play' || !g.player) { H.yaw = null; return; }
        H.frames = (H.frames || 0) + 1;
        const now = performance.now() / 1000, pl = g.player;
        if (H.yaw == null || Math.hypot(pl.x - H.px, pl.z - H.pz) > 2) { H.yaw = V.yaw; H.pitch = V.pitch; H.vy = H.vp = 0; H.last = now; H.px = pl.x; H.pz = pl.z; H.t0 = now; }
        const dt = Math.min(0.1, Math.max(0.001, now - H.last)); H.last = now;
        const moving = Math.hypot(pl.x - H.px, pl.z - H.pz) / dt > 0.3; H.px = pl.x; H.pz = pl.z;
        let q = null, qd = 14;
        for (const o of g.guards || []) if (o.active) { const d = Math.hypot(o.x - pl.x, o.z - pl.z); if (d < qd) { qd = d; q = o; } }
        const t = now - H.t0;
        let ty = V.yaw, tp = V.pitch;
        if (moving) {
          if (now > H.next && now > H.gUntil) {   // 走路時偶爾瞄一眼：附近有衛兵就瞄衛兵，不然往左右看一下
            H.gGuard = !!q && qd < 10 && Math.abs(wrap(lookYaw(pl, q.x, q.z) - V.yaw)) < 1.7;
            H.gOff = (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.3);
            H.gUntil = now + 0.5 + rnd() * 0.5; H.next = H.gUntil + 3 + rnd() * 3;
          }
          if (now < H.gUntil) ty = H.gGuard && q ? lookYaw(pl, q.x, q.z) : V.yaw + H.gOff;
          if (g.hunted && q && now < H.gUntil) ty = lookYaw(pl, q.x, q.z);
        } else if (q) { ty = lookYaw(pl, q.x, q.z) + 0.08 * Math.sin(t * 0.5 + H.ph[0]); tp = V.pitch + 0.05; }
        else ty = V.yaw + 0.3 * Math.sin(t * 0.9 + H.ph[1]);
        // 彈簧（臨界阻尼）追目標，限制轉速；再疊手持晃動
        const k = 60, c = 2 * Math.sqrt(k);
        H.vy += (k * wrap(ty - H.yaw) - c * H.vy) * dt; H.vy = Math.max(-4.5, Math.min(4.5, H.vy)); H.yaw = wrap(H.yaw + H.vy * dt);
        H.vp += (k * (tp - H.pitch) - c * H.vp) * dt; H.pitch += H.vp * dt;
        const jy = 0.012 * Math.sin(t * 0.7 + H.ph[2]) + 0.006 * Math.sin(t * 1.9 + H.ph[3]);
        const jp = 0.02 * Math.sin(t * 0.43 + H.ph[3]) + 0.006 * Math.sin(t * 1.3 + H.ph[0]);
        cam.rotation.x = cam.rotation.x - V.pitch + H.pitch + jp;   // 保留遊戲自己的跑步前傾
        cam.rotation.y = H.yaw + jy;
        cam.updateMatrixWorld();
        // 統計（錄影報告用）：一幀轉超過 0.3 弧度（約 17 度）的硬轉次數，原本視角對人類視角
        const S = H.stat || (H.stat = { n: 0, rawJumps: 0, camJumps: 0, lastV: V.yaw, lastC: cam.rotation.y });
        S.n++; if (Math.abs(wrap(V.yaw - S.lastV)) > 0.3) S.rawJumps++; if (Math.abs(wrap(cam.rotation.y - S.lastC)) > 0.3) S.camJumps++;
        S.lastV = V.yaw; S.lastC = cam.rotation.y;
      };
    }, o.seed ? +o.seed : 1);
    // --listen-test（11/11，屏息聽 C1）：頁面用 ?lab=listen 開。聲音層建立前掛分接點，量衛兵線（guardListen）與一般鼓拍線（beatBus）進出的音量差與左右，
    // 不受「衛兵聲在總輸出裡太小」影響。找法：衛兵 PannerNode 接上、而且往下 guardOut → master 都是 GainNode 的那條＝guardListen；guardOut 之後建立的第一個 GainNode＝beatBus。
    if (o.listenTest || o.labBot) await page.evaluate(() => {
      const AP = AudioNode.prototype, oc = AP.connect, BC = BaseAudioContext.prototype, ocg = BC.createGain;
      const M = window.__recListen = { gains: [], ok: false };
      BC.createGain = function () { const g = ocg.apply(this, arguments); if (!M.ok && M.gains.length < 5000) M.gains.push(g); return g; };
      const an = (ctx) => { const a = ctx.createAnalyser(); a.fftSize = 2048; return a; };
      const stereo = (ctx, src) => { const sp = ctx.createChannelSplitter(2), L = an(ctx), R = an(ctx); oc.call(src, sp); oc.call(sp, L, 0); oc.call(sp, R, 1); return [L, R]; };
      function setup(gl) {
        const ctx = gl.context, bb = M.gains[M.gains.indexOf(M.first.get(gl)) + 1];
        M.ok = true; M.gl = gl; M.bb = bb;
        M.gIn = ocg.call(ctx); M.bIn = ocg.call(ctx);
        M.aGI = stereo(ctx, M.gIn); M.aGO = stereo(ctx, gl);
        M.aBI = an(ctx); M.aBO = an(ctx); oc.call(M.bIn, M.aBI); oc.call(bb, M.aBO);
        // 11/11 查看／追殺：衛兵總線 guardOut（過盲區閘門後）、總音量 master、慢低音 bassGain 候選（建立後馬上被前一個 GainNode 接上、自己接 master）
        M.gOut = M.first.get(gl); M.master = M.gOut && M.first.get(M.gOut);
        if (M.gOut) { M.aGT = an(ctx); oc.call(M.gOut, M.aGT); }
        if (M.master) { M.aM = an(ctx); oc.call(M.master, M.aM); }
        M.bass = [];
        for (let j = 1; j < M.gains.length; j++) { const x = M.gains[j]; if (x !== M.gOut && M.first.get(x) === M.master && M.first.get(M.gains[j - 1]) === x) { const a = an(ctx); oc.call(x, a); M.bass.push({ j, a }); } }
      }
      M.first = new Map();
      AP.connect = function (dest) {
        const r = oc.apply(this, arguments);
        if (!M.ok && !M.first.has(this)) M.first.set(this, dest);
        // 11/11 晚（聲音層在 beatBus 與 guardListen 之間加了「躲」的節點，舊的建立順序規則失效）：
        // 衛兵 PannerNode 接上的 GainNode X，若 X → guardOut → master 三層都是 GainNode，X＝guardListen；beatBus＝guardOut 之後建立的第一個 GainNode。
        if (!M.ok && this instanceof PannerNode && dest instanceof GainNode) {
          const G = M.first.get(dest), Mm = G && M.first.get(G);
          const gi = M.gains.indexOf(G), B = M.gains[gi + 1];
          // 提示聲的 PannerNode 也會先接到三層 GainNode；guardOut 的特徵：下一個建立的 GainNode（beatBus）第一條線接它自己的下一個（hideSplit）
          if (G instanceof GainNode && Mm instanceof GainNode && B && M.first.get(B) === M.gains[gi + 2]) setup(dest);
        }
        if (M.ok && dest === M.gl && this !== M.gIn) oc.call(this, M.gIn);
        if (M.ok && dest === M.bb && this !== M.bIn) oc.call(this, M.bIn);
        return r;
      };
    });
    await page.evaluate(({ cycle, phaseBar, cover, aid, tel, stepTest, horse, listenT, labBot }) => {
      window.__recListenTest = listenT; window.__recLabBot = labBot;
      window.__recStepTest = !!stepTest;   // --step-test：第 1 區改成離拍起步累積腳步樣本（不喘氣引起注意）
      // --horse-test（11/11，木馬共鳴 C2）：頁面要用 ?lab=horse 開（record.mjs 的 --page）；前半段站在木馬旁、後半段站到 30 公尺外
      window.__recHorse = horse;
      const cv = document.getElementById('oCover');
      if (cover && cv && !cv.disabled) { cv.value = cover; cv.dispatchEvent(new Event('change', { bubbles: true })); }
      const sel = document.getElementById('oT');
      if (cycle && sel) {               // 放慢循環：在難度選單加一個選項（遊戲本身把它同時交給規則與聲音）
        if (![...sel.options].some(x => +x.value === cycle)) {
          const op = document.createElement('option'); op.value = String(cycle); op.textContent = cycle + ' 秒（錄製用）'; sel.appendChild(op);
        }
        sel.value = String(cycle);
      }
      // --aid on|off|auto（11/12，提示全開版影片）：視覺輔助（預設自動：第 2 區減半、之後關）；--tel：畫面顯示試玩數據摘要
      const aidSel = document.getElementById('oAid');
      if (aid && aidSel) { aidSel.value = aid; aidSel.dispatchEvent(new Event('change', { bubbles: true })); }
      const telBox = document.getElementById('oTel');
      if (tel && telBox) { telBox.checked = true; telBox.dispatchEvent(new Event('change', { bubbles: true })); }
      const ph = document.getElementById('oPhase');
      if (ph && phaseBar) { ph.checked = true; ph.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { cycle, phaseBar: o.phaseBar !== false, cover, aid: ['on', 'off', 'auto'].includes(o.aid) ? o.aid : null, tel: !!o.tel, stepTest: !!o.stepTest,
      labBot: o.labBot || null, listenT: o.listenTest ? { period: +(o.listenPeriod || 2.5) } : null, horse: o.horseTest ? { half: (+o.duration || 80) / 2, near: { x: 8.5, z: 17.5 }, far: { x: 38.5, z: 26.5 } } : null });
    // 11/24：短展示版（?map=demo）沒有開始按鈕，開場是字卡（#story），按空白鍵開始
    if (await page.evaluate(() => { const b = document.getElementById('btnStart'); return !!b && b.offsetParent !== null; })) await page.click('#btnStart');
    else await page.keyboard.press('Space');
    await page.waitForFunction(() => window.TroyDebug.game && window.TroyDebug.audio && window.TroyDebug.game.time != null, null, { timeout: 15000 });
    return page.evaluate(() => {
      const C = window.RissetAudio.CONST || {};
      const g = window.TroyDebug.game;
      const T = g.T;
      // audioConst 只留聲音層自己的行為參數（低音餘音長度：巡邏時聲音刻意不排會拖進盲區的低音拍）；
      // 拍點公式與音量常數不再從聲音層拿，期望拍由規則檔產生。rulesT＝遊戲實際用的整份規則常數（含選單覆寫）
      const rulesT = {}; for (const k in T) if (typeof T[k] === 'number' || typeof T[k] === 'boolean' || typeof T[k] === 'string') rulesT[k] = T[k];
      // coverMode：遊戲實際用的鼓聲模式（rulesT.COVER_MODE 也有；規則檔沒有這個常數時為 false＝舊盲區版）
      return { audioConst: { BASS_TAIL: C.BASS_TAIL }, rulesT, coverMode: T.COVER_MODE === true,
        rules: { CYCLE: T.CYCLE, DYNAMIC: T.DYNAMIC, BLIND: T.BLIND_LEN != null ? T.BLIND_LEN : T.BLIND, BASS_PERIOD: T.BASS_PERIOD, BASS_WIN: T.BASS_WIN,
          CYCLE_FAR: T.CYCLE_FAR, CYCLE_NEAR: T.CYCLE_NEAR, CYCLE_ALERT: T.CYCLE_ALERT, CYCLE_HUNT: T.CYCLE_HUNT, DIST_FAR: T.DIST_FAR, DIST_NEAR: T.DIST_NEAR,
          ZONE_MUL: T.ZONE_MUL, FAKE_FROM_ZONE: T.FAKE_FROM_ZONE, FAKE_EVERY: T.FAKE_EVERY } };
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
      cT: g.cycle.T, ct0: g.cycle.t0, tT: +(g.cycle.targetT || 0).toFixed(4),
      // 規則的 anchor（聲音層與 beatsBetween 外推拍點的基準）：多留幾位小數，期望拍才算得準
      at: g.cycle.anchor ? +g.cycle.anchor.t.toFixed(5) : null, ap: g.cycle.anchor ? +g.cycle.anchor.p.toFixed(6) : null,
      // 規則實際的循環與盲區（音訊時間）：本循環 p = 0 的時間、目前或下一段盲區、警戒盲區模式、假驟降
      cs: +(g.cycle.start != null ? g.cycle.start : g.cycle.t0).toFixed(5),
      bf: g.cycle.blindFrom != null ? +g.cycle.blindFrom.toFixed(5) : null, bt: g.cycle.blindTo != null ? +g.cycle.blindTo.toFixed(5) : null,
      bid: g.cycle.blindId || null, ab: !!g.cycle.alertBlind, fake: !!g.cycle.fake, nfake: !!g.cycle.nextFake,
      // 火光與危險度（11/10 甲：fire 跟 danger＝實際速度走，給 fireSync 檢查）；舊規則檔沒有就是 null
      fire: Number.isFinite(g.fire) ? +g.fire.toFixed(4) : null, dg: Number.isFinite(g.danger) ? +g.danger.toFixed(4) : null,
      // 木馬共鳴（HORSE_MODE）：聲音層算的離木馬中心距離；沒開就是 null
      // horseInfo 在 TroyDebug.audio.raw 上（畫面層包了一層）；兩處都找
      // lg（--listen-test）：衛兵線、鼓拍線進出的 RMS 功率（線性，取樣當下 2048 點）；ls＝聲音層 listenInfo().on
      lg: (() => { const M = window.__recListen; if (!M || !M.ok) return null; const buf = new Float32Array(2048);
        const pw = (x) => { x.getFloatTimeDomainData(buf); let q = 0; for (let k = 0; k < buf.length; k++) q += buf[k] * buf[k]; return +(q / buf.length).toExponential(3); };
        const pk = (x) => { x.getFloatTimeDomainData(buf); let m = 0; for (let k = 0; k < buf.length; k++) { const v = Math.abs(buf[k]); if (v > m) m = v; } return m; };
        const mg = M.master ? M.master.gain.value : 1, dB = (v) => (v > 1e-7 ? +(20 * Math.log10(v)).toFixed(1) : -140);
        // gp／mp／bp：衛兵總線、總輸出、慢低音候選的取樣峰值（dBFS，衛兵與低音乘上 master 音量＝在總輸出裡的大小）
        return { iL: pw(M.aGI[0]), iR: pw(M.aGI[1]), oL: pw(M.aGO[0]), oR: pw(M.aGO[1]), bi: pw(M.aBI), bo: pw(M.aBO),
          gp: M.aGT ? dB(pk(M.aGT) * mg) : null, mp: M.aM ? dB(pk(M.aM)) : null, bp: (M.bass || []).map(b => dB(pk(b.a) * mg)), bg: (M.bass || []).map(b => +M.gains[b.j].gain.value.toFixed(3)) }; })(),
      ls: (() => { try { const r = a.raw && a.raw.listenInfo ? a.raw : a; return r.listenInfo ? !!r.listenInfo().on : null; } catch (e) { return null; } })(),
      // hm（第 18 節，11/11）：追殺聲音模式，照 audio.js huntUpdate 的判法自己算：沒被追＝none、被追而且有人在搜影子、你躲在暗處＝hide、其他＝escape
      hm: (() => { if (!g.hunted) return 'none'; const sr = (g.guards || []).some(q => q && q.active !== false && q.search && !q.search.done); return sr && g.player && g.player.hidden ? 'hide' : 'escape'; })(),
      // sm：這一刻起步踩不踩得上鼓點（規則 stepMasked）
      sm: (() => { try { const R = window.RissetRules; return R && R.stepMasked ? !!R.stepMasked(g.time, g) : null; } catch (e) { return null; } })(),
      // va：視覺輔助強度（殘響掩護版的木魚預告音量也乘它；第 4 區自動模式為 0，見設計 7.9）
      va: (() => { try { const R = window.RissetRules; return R && R.visualAidFor ? R.visualAidFor(g.zone, g.visualAidMode, g.T) : null; } catch (e) { return null; } })(),
      hd: (() => { const r = (a.raw && a.raw.horseInfo) ? a.raw : a; try { const h = r.horseInfo && r.horseInfo(); return h && isFinite(h.dist) ? +h.dist.toFixed(2) : null; } catch (e) { return null; } })(),
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
    // --horse-test：不玩，只把玩家擺到固定位置（試驗場沒有衛兵）。前半段 near、後半段 far；面向木馬。
    // 直接設定位置是量測用的擺放，不是遊戲操作；?lab=horse 不會因為走到出口而換區。
    if (window.__recHorse) {
      const H = window.__recHorse;
      api.releaseAll();
      if (g.phase !== 'play') return;
      if (st.h0 == null) st.h0 = s.t;
      const far = s.t - st.h0 > H.half, pos = far ? H.far : H.near;
      if (st.hFar !== far) { st.hFar = far; api.log('horse_pos', { far, x: pos.x, z: pos.z }); }
      g.player.x = pos.x; g.player.z = pos.z;
      D.V.yaw = Math.atan2(8.5 - pos.x, 15 - pos.z);
      return;
    }
    const t = s.t, p = s.p, P = g.player;
    const fdt = Math.min(0.12, Math.max(0.008, (s.fdt || 16) / 1000));
    st.fd = st.fd ? st.fd * 0.8 + fdt * 0.2 : fdt;     // 平滑後的幀間隔，預測「下一幀」的音訊時間
    if (g.phase === 'fail') {
      api.releaseAll();
      if (!st.failAt) { st.failAt = s.wall; api.log('fail', g.failReason); }
      if (s.wall - st.failAt > 1500) {   // 失敗畫面停 1.5 秒後按 R；程式玩家狀態歸零（重新引起注意、重新安撫）
        for (const k of Object.keys(st)) delete st[k];
        window.__recPlay = null;
        api.press('KeyR'); api.log('retry');
      }
      return;
    }
    // 11/24：短展示版開場與「再玩一次」是字卡（#story），程式玩家按空白鍵進入遊玩（每 0.8 秒最多一次）
    const storyEl = document.getElementById('story');
    if (window.__recPlayMake && storyEl && !storyEl.hidden) {
      api.releaseAll();
      if (!st.storyTap || s.wall - st.storyTap > 800) { st.storyTap = s.wall; api.press('Space'); api.log('story_space'); }
      return;
    }
    if (g.phase !== 'play') { api.releaseAll(); return; }
    // --lab-bot check｜hunt（11/11）：查看試驗場站著、每 14 秒按 N 在自己位置製造聲響，衛兵查看中且 4 公尺內就屏息；
    // 追殺試驗場往北（+z）跑進影子（z 23.5～27），進去後停下，衛兵 4 公尺內屏息。
    if (window.__recLabBot) {
      const kind = window.__recLabBot, gs = g.guards.filter(q => q.active !== false && q.state !== 'down');
      const near = gs.reduce((m, q) => Math.min(m, Math.hypot(q.x - P.x, q.z - P.z)), 1e9);
      const busy = gs.some(q => q.state === 'checking' || q.state === 'hunted' || q.search);
      const canB = !P.breathLock && P.breathT < g.T.BREATH_MAX - 0.4;
      if (kind === 'check') {
        api.set('ShiftLeft', false);
        if (st.nAt == null) st.nAt = t + 3;
        // 單號那次製造聲響後躲進北邊影子（量查看的疑問聲、走近的腳步、慢低音），雙號那次站著不動（被發現：量喊人、追殺）
        if (t >= st.nAt) { st.nAt = t + 14; st.nN = (st.nN || 0) + 1; st.hide = st.nN % 2 === 1; api.press('KeyN'); api.log('lab_noise', { hide: st.hide }); }
        const go = st.hide && P.z < 24.8;
        D.V.yaw = Math.PI; D.V.pitch = -0.1;
        api.set('KeyW', go);
        api.set('Space', !go && busy && near < 4 && canB);
      } else {
        D.V.yaw = Math.PI; D.V.pitch = -0.1;
        // 第 18 節（11/11）：甩掉追兵後試驗場不會再追；沒被追 3 秒就用規則的 g.retry()（和失敗後按 R 同一個函式）重擺場景，多錄幾次逃與躲
        if (g.hunted) st.huntSeen = true;
        if (st.huntSeen && !g.hunted) { if (st.calmAt == null) st.calmAt = t; else if (t - st.calmAt > 3 && typeof g.retry === 'function') { g.retry(); st.huntSeen = false; st.calmAt = null; api.log('lab_rehunt'); return; } }
        else st.calmAt = null;
        const inShadow = P.z >= 24.5;
        api.set('KeyW', !inShadow); api.set('ShiftLeft', !inShadow);
        api.set('Space', inShadow && near < 4 && canB);
      }
      return;
    }
    // --listen-test：站著不動，每 period 秒換一次屏息／平常（試驗場第 3 區）
    if (window.__recListenTest) {
      const L = window.__recListenTest; api.set('KeyW', false); api.set('KeyS', false);
      // 掩護窗前 2 秒到窗後 1 秒（p > 0.8 或 p < 0.1）：單號窗屏息、雙號窗平常，才量得到「最響一擊」兩種狀態；其他時間每 period 秒切換
      const near = p > 0.8 || p < 0.1, wcyc = p > 0.8 ? (s.cyc || 0) + 1 : (s.cyc || 0);
      const on = (near ? wcyc % 2 === 1 : Math.floor(t / L.period) % 2 === 1) && !P.breathLock;
      if (st.lsOn !== on) { st.lsOn = on; api.log('listen_bot', { on }); }
      api.set('Space', on);
      return;
    }
    // --play-through：完美踩拍玩家的輸出轉成按鍵（移動方向→視角＋W；屏息→空白；安撫→Q；衝刺→Shift；暗殺→點 E；城門→按住 E）
    if (window.__recPlayMake) {
      if (!window.__recPlay) window.__recPlay = window.__recPlayMake();
      const inp = window.__recPlay(g) || {};
      const mv = !!(inp.mx || inp.mz);
      if (mv) D.V.yaw = Math.atan2(-inp.mx, -inp.mz);
      D.V.pitch = g.zone === 1 ? -0.35 : -0.12;
      api.set('KeyW', mv); api.set('KeyS', false);
      api.set('Space', !!inp.breath && !mv);
      if (inp.calm) { api.press('KeyQ'); api.log('calm_press', {}); }
      if (inp.dash) { if (!st.dashT || t - st.dashT > 0.5) { st.dashT = t; api.press('ShiftLeft'); } }
      if (inp.takedown) { if (!st.tdT || t - st.tdT > 0.3) { st.tdT = t; api.press('KeyE'); api.log('takedown_press'); } }
      else api.set('KeyE', !!inp.interact);
      return;
    }
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
          else if (window.__recStepTest) {
            // --step-test（11/11）：腳步檢查要樣本。挑「不在可聽拍上」的時候起步、走 0.12 秒就停，每次起步都是離拍的出聲腳步（step_loud）；
            // 走近的路上連續走的腳步是合拍的（step_masked）。木馬腹中離衛兵遠，出聲腳步不會引起注意，所以這段錄不到警戒。
            const R = window.RissetRules;
            if (st.burstUntil != null && t < st.burstUntil) fwd = st.burstDir;
            else if (st.burstUntil != null && t < st.burstUntil + 0.45) fwd = 0;          // 停一下，下一步才算新的起步
            else if (R && R.stepMasked && !R.stepMasked(t + st.fd, g)) {
              st.burstDir = st.burstDir === 1 ? -1 : 1; st.burstUntil = t + 0.12; fwd = st.burstDir;
            }
          }
          else if (g.T.COVER_MODE) st.provokeGasp = true;     // 已在正上方：殘響掩護版改用喘氣引起注意（見下）
          else fwd = (Math.floor(t * 4) % 2) ? 1 : -1;      // 已在正上方：小幅來回挪動
          if (P.x > 9.9 && fwd > 0) fwd = -1;
        }
        breath = holdWrap;
        // 殘響掩護版（11/11）：踩拍走的腳步聽不見；離拍腳步只在 STEP_R（2.5 m，含高度）內聽得到，木馬腹中離地面衛兵太遠。
        // 改成在衛兵正上方一直屏息、故意喘氣（loud，LOUD_R 8 m）。喘氣要落在 p ≤ HIGH_P 才會「起疑」（進警戒、要安撫），
        // p 高時只會進高度警覺：快到上限（BREATH_MAX − 0.3）時相位偏高就先放開，換氣後下一輪再試。
        if (st.provokeGasp && g.T.COVER_MODE) {
          fwd = 0;
          const near = P.breathT >= g.T.BREATH_MAX - 0.3;
          if (P.breathLock) breath = false;
          else if (near && p > 0.45 && p < 0.97) { breath = false; st.gaspRetry = true; }
          else if (st.gaspRetry && P.breathT > 0.5) breath = false;          // 換完氣再重來
          else { st.gaspRetry = false; breath = true; }
          if (near && breath && !st.gaspLogged) { st.gaspLogged = true; api.log('provoke_gasp', { p: +p.toFixed(3) }); }
        }
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

  /* 精確區段（給分析）：一律以規則時間軸記錄的實際值為準，不假設固定週期。
   *   盲區：規則說 blind 的幀，依 blindId 分組，區段取規則當時給的 [blindFrom, blindTo]（音訊時間，精確到樣本）；
   *         取樣漏掉的一般盲區（幀間隔 > 0.6 秒才會發生）用循環編號變化時的 cycle.start 補上。
   *   假驟降：循環編號變化、而且 cycle.fake 為真的那一輪，[start, start + BLIND]（應該沒有空檔，給分析對照）。
   *   警戒＝panic.active、追殺＝hunted（以取樣幀為界，起點用 alert cue 的實際時間）。 */
  intervals(timeline, meta, events) {
    const B = ((meta.prepared || {}).rules || {}).BLIND || 0.6;
    const blind = [], normalBlind = [], fake = [], seen = new Set();   // normalBlind：一般盲區（不含警戒時低音拍之間的），給預告音檢查
    let prevCyc = null;
    for (const s of timeline) {
      if (s.blind && s.bid != null && !seen.has(s.bid) && s.bf != null && s.bt != null) {
        seen.add(s.bid); blind.push([s.bf, s.bt]); if (!s.ab) normalBlind.push([s.bf, s.bt]);
      }
      if (prevCyc != null && s.cyc !== prevCyc && s.cs != null) {
        if (s.fake) fake.push([s.cs, s.cs + B]);
        else if (!s.ab && !seen.has('c' + s.cyc) && s.t - s.cs > B) { seen.add('c' + s.cyc); blind.push([s.cs, s.cs + B]); normalBlind.push([s.cs, s.cs + B]); }
      }
      prevCyc = s.cyc;
    }
    blind.sort((a, b) => a[0] - b[0]); normalBlind.sort((a, b) => a[0] - b[0]);
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
    return { blind, normalBlind, fake, alert, hunted: run('hunted') };
  },

  /* 規則上的拍點（給分析比對）：P1、P2。
   * 不抄公式：每幀把時間軸記下的規則 anchor（at、ap、cT、cyc、cs）、追殺／警戒、假驟降旗標組成 beatsBetween 要的 game，
   * 以 [這幀, 下一幀) 為區間叫 RissetRules.beatsBetween(..., { includeFakeTail: true })；
   * 音量就是規則的 gain（追殺第 5 層、假驟降的金屬尾音 tail: true 都在裡面）。
   * 相鄰兩幀之間 T 最多變 20%/秒 × 幀間隔，用這幀的 anchor 外推到下一幀，誤差 < 0.1 ms；同一拍（cycle:k:n）只算一次。
   * 盲區內的拍規則自己略過；另外落在規則實際記錄的盲區（intervals）裡的也不算——聲音層的靜音閘以實際盲區為準，
   * 那裡本來就不會有起音（尾音拍不受此限，它就排在交接處）。
   * 低音：每段相同 anchor 的網格；巡邏時聲音刻意不排「會落進盲區、或餘音（BASS_TAIL，聲音層的行為參數）拖進盲區」的低音拍，這裡同樣排除。 */
  expectedBeats(timeline, meta) {
    const prepared = meta.prepared || {};
    const KT = Object.assign({}, Rules.T, prepared.rulesT || {});
    const BASS_TAIL = num((prepared.audioConst || {}).BASS_TAIL, 1.1);
    const out = [];
    if (!timeline.length) return out;
    const IV = this.intervals(timeline, meta, []);
    const inIv = (t, arr, pre = 0) => arr.some(([a, b]) => t >= a - pre && t < b);
    const pts = [];
    for (const s of timeline) {
      const g = s.gt != null ? s.gt : s.t;
      const L = pts[pts.length - 1];
      if (L && (g <= L.g + 1e-6)) continue;
      pts.push({ g, s });
    }
    const seen = new Set();
    for (let i = 1; i < pts.length; i++) {
      const A = pts[i - 1], Bp = pts[i], sa = A.s;
      if (Bp.g - A.g > 1.0) continue;   // 時鐘跳躍（分頁休眠）不外推
      const anchor = { t: num(sa.at, A.g), p: num(sa.ap, sa.p, 0), T: num(sa.cT, KT.CYCLE), index: sa.cyc | 0, start: num(sa.cs, sa.ct0, A.g) };
      const game = {
        T: KT, time: A.g, hunted: !!sa.hunted, panic: { active: !!sa.alert },
        cycle: { anchor, p: anchor.p, T: anchor.T, index: anchor.index, start: anchor.start, blind: !!sa.blind, fake: !!sa.fake, nextFake: !!sa.nfake },
        bass: { anchor: num(sa.bassAnchor, 0), period: num(sa.bassPer, KT.BASS_PERIOD) }
      };
      let list = null;
      try { list = Rules.beatsBetween(A.g, Bp.g, game, { includeFakeTail: true }); } catch (e) { list = null; }
      if (!Array.isArray(list)) continue;
      for (const b of list) {
        const tail = !!b.tail, key = (tail ? 'tail:' : 'b:') + b.cycle + ':' + b.k + ':' + b.n;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!tail && inIv(b.t, IV.blind)) continue;
        const w = num(b.gain, b.g, 0);
        out.push({ t: b.t, w, kind: 'risset', layer: b.k, cycle: b.cycle, tail, hunt: !tail && b.k >= KT.RISSET_LAYERS });
      }
    }
    // 低音：每段相同 anchor 的網格
    const tA = timeline[0].t, tB = timeline[timeline.length - 1].t;
    let i = 0;
    while (i < timeline.length) {
      const an = timeline[i].bassAnchor, per = timeline[i].bassPer || KT.BASS_PERIOD || 2.4;
      let j = i; while (j + 1 < timeline.length && timeline[j + 1].bassAnchor === an) j++;
      const a = timeline[i].t, b = timeline[j].t;
      for (let m = Math.ceil((a - an) / per); an + m * per <= b; m++) {
        const t = an + m * per;
        if (!(t >= an - 1e-6 && t >= tA && t <= tB)) continue;
        const s = timeline[Math.min(j, i + Math.max(0, timeline.slice(i, j + 1).findIndex(x => x.t >= t)))];
        if (s && !s.alert && !s.hunted && inIv(t, IV.blind, BASS_TAIL)) continue;   // 巡邏：聲音刻意不排
        out.push({ t, w: 1, kind: 'bass' });
      }
      i = j + 1;
    }
    out.sort((x, y) => x.t - y.t);
    return out;
  },

  /* 報告加一節：循環長度隨危險變化（各狀態、各區的平均 T，以時間加權）、每次盲區的長度、假驟降。 */
  summary(timeline, meta, events, IV) {
    const R = (meta.prepared || {}).rules || {};
    const B = R.BLIND || 0.6;
    const acc = {}, add = (k, T, tT, dt) => { const a = acc[k] || (acc[k] = { sec: 0, T: 0, tT: 0, min: Infinity, max: 0 }); a.sec += dt; a.T += T * dt; a.tT += tT * dt; a.min = Math.min(a.min, T); a.max = Math.max(a.max, T); };
    const far = R.DIST_FAR || 20, nearD = R.DIST_NEAR || 4;
    for (let i = 1; i < timeline.length; i++) {
      const s = timeline[i - 1], dt = timeline[i].t - s.t;
      if (!(dt > 0 && dt < 1) || s.phase !== 'play') continue;
      const st = s.hunted ? '追殺' : s.alert ? '警戒' : (s.gd == null || s.gd >= far) ? `巡邏：附近沒有衛兵（≥ ${far} m）` : s.gd <= nearD ? `巡邏：衛兵很近（≤ ${nearD} m）` : `巡邏：衛兵在 ${nearD}～${far} m`;
      add(st, s.cT, s.tT || s.cT, dt);
      if (!s.hunted && !s.alert) add(`巡邏（第 ${s.zone} 區）`, s.cT, s.tT || s.cT, dt);
    }
    const order = ['追殺', '警戒', `巡邏：衛兵很近（≤ ${nearD} m）`, `巡邏：衛兵在 ${nearD}～${far} m`, `巡邏：附近沒有衛兵（≥ ${far} m）`, '巡邏（第 1 區）', '巡邏（第 2 區）', '巡邏（第 3 區）', '巡邏（第 4 區）'];
    const rows = order.filter(k => acc[k]).map(k => { const a = acc[k]; return { state: k, sec: +a.sec.toFixed(1), meanT: +(a.T / a.sec).toFixed(2), meanTarget: +(a.tT / a.sec).toFixed(2), minT: +a.min.toFixed(2), maxT: +a.max.toFixed(2) }; });
    // 盲區長度直接讀規則時間軸（IV 已被裁到錄音範圍內，頭尾那段會被截短）
    const lens = [], seenB = new Set();
    for (const x of timeline) if (x.blind && x.bid != null && !seenB.has(x.bid) && x.bf != null) { seenB.add(x.bid); lens.push(+(x.bt - x.bf).toFixed(4)); }
    const allOk = lens.length > 0 && lens.every(L => Math.abs(L - B) < 1e-3);
    // 每次一般盲區前有沒有 pre_blind；每次假驟降前有沒有（應該沒有）
    const pre = (events || []).filter(e => e.type === 'cue' && /^pre_?blind$/i.test(e.name)).map(e => e.at);
    const preBefore = (s0) => pre.some(t => t <= s0 + 0.02 && t > s0 - 1.0);
    const normal = [];
    for (const s of timeline) if (s.blind && !s.ab && s.bf != null && !normal.includes(s.bf)) normal.push(s.bf);
    const L = [];
    L.push(`規則目標：附近沒有衛兵 ${R.CYCLE_FAR} 秒、靠近最短 ${R.CYCLE_NEAR} 秒、警戒 ${R.CYCLE_ALERT} 秒、追殺 ${R.CYCLE_HUNT} 秒；巡邏每往城門一區 ×${R.ZONE_MUL}。數字以時間加權（只算遊玩中）。`, '');
    L.push('| 狀態 | 時間（秒） | 平均 T（秒） | 平均目標 T | 最短～最長 T |', '|---|---|---|---|---|');
    for (const r of rows) L.push(`| ${r.state} | ${r.sec} | ${r.meanT} | ${r.meanTarget} | ${r.minT}～${r.maxT} |`);
    L.push('');
    L.push(`- 盲區長度（規則記錄的 blindTo − blindFrom）：${lens.length} 次，${allOk ? `**每次都是 ${B} 秒**` : '**有不是 ' + B + ' 秒的**：' + lens.join('、')}` +
      `（其中警戒時的低音拍間盲區 ${timeline.filter(s => s.blind && s.ab).map(s => s.bid).filter((v, i, a) => a.indexOf(v) === i).length} 次）。`);
    L.push(`- 一般盲區前 1 秒內有 pre_blind 預告：${normal.filter(preBefore).length}／${normal.length} 次。`);
    const fk = IV.fake || [];
    L.push(`- 假驟降：${fk.length} 次${fk.length ? `（${fk.map(([a]) => a.toFixed(2) + ' 秒').join('、')}；前 1 秒內有 pre_blind 的：${fk.filter(([a]) => preBefore(a)).length} 次）` : `（這次錄製${timeline.some(s => s.zone >= (R.FAKE_FROM_ZONE || 3)) ? '在第 3 區以後沒有抽到' : '沒有走到第 ' + (R.FAKE_FROM_ZONE || 3) + ' 區，不會出現'}）`}。`);
    return { title: '循環長度隨危險變化', lines: L, data: { rows, blindLens: lens, blindAll06: allOk, preBlind: { withPre: normal.filter(preBefore).length, of: normal.length }, fake: fk } };
  }
};
