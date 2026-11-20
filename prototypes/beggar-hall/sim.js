// 《門檻上的乞丐》規則模組：純邏輯，不碰畫面、聲音、輸入裝置。
// 畫面層每幀呼叫 game.step(dt, input)，讀 game 的狀態來畫，並取走 game.out 裡的事件（訊息、音效）。
// 之後移植到 Unity 時，把這個檔翻成 C#（對應主線 Odyssey.Core 的做法），畫面層重做即可。
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m; else root.BeggarSim = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 數值 ----------
  const T = {
    speedCrouch: 1.5, speedStand: 2.0, limpMul: .6,
    rangeDark: 4.5, rangeLit: 12, crouchRangeMul: .75, sharpMul: 1.2,
    coneHalf: .96, coneAlert: 1.2,
    gainStand: .12, gainWander: .08, gainWeapons: .22,
    // 沒有潘妮洛普允許就坐上爐火邊的位子：火光照著臉，旁邊座位的人會轉過來看（約 3 m 內一個人盯著，3 秒的坐下就會被看穿）
    gainHearth: .6, hearthNotice: 7, hearthNoticeDelay: .4,
    // 靠走道（內側）的求婚者背對走道坐，但乞丐在附近時會常常回頭看
    glanceRadius: 6, glanceP: .6, glanceCuriousP: .85, glanceHold: [1.4, 2.6],
    decay: .02, crouchCalm: .01,
    stageCurious: .3, stageSuspicious: .6,
    contagionRadius: 4, contagionRate: .05,
    stepEvery: .6, noiseCrouch: 1.5, noiseStand: 3, noiseLimp: 2.2,
    boneNoise: 7, jarNoise: 9, boneMax: 3, throwRange: 8,
    begPretext: 6, tendPretext: 12, bankTime: 45, blendRadius: 1.6,
    angerInsult: .16, angerHit: .3, chestRate: .32,
    dmgThrow: .32, dmgKick: .22, dmgClumsy: .1,
    throwSidestep: .7,   // 丟出後（飛行 .55 秒）離開瞄準點多遠算「早一步躲開」；舊值 1.3 m 以最快速度也走不到
    dodgeNormal: [-.28, -.04], dodgeLoose: [-.42, .04],
    statueDropBelow: .45, statueTime: 3,
    argosWake: 2.6, argosLife: 7, argosPet: 1.5,   // 牠醒來後約 7 秒死去；蹲下摸 1.5 秒就算摸到了
    whisperRadius: 6,   // 對歐邁俄斯說往事時，這個距離內的敵人會聽到
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hyp = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const TAU = Math.PI * 2;
  const wrapAng = a => { a = a % TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
  // a→b 的最短轉角（-π～π）；舊寫法在差值小於 -3π 時會算錯方向
  const angDiff = (a, b) => wrapAng(b - a);
  const freshCarry = () => ({ tele: 'unknown', eum: 'unknown', pen: 'unknown', ledger: 0 });

  function stageOf(s) { return s >= 1 ? 'seen' : s >= T.stageSuspicious ? 'suspicious' : s >= T.stageCurious ? 'curious' : 'calm'; }

  // 某點的亮度 0～1：環境光＋各光源（距離內線性衰減）
  function lightAt(x, z, ambient, lights) {
    let v = ambient;
    for (const L of lights) {
      if (L.on === false) { if (!L.dim) continue; }
      const i = L.on === false ? L.dim : L.i;
      const d = hyp(x, z, L.x, L.z);
      if (d < L.r) v += i * (1 - d / L.r);
    }
    return clamp(v, 0, 1);
  }

  // 線段 a→b 是否穿過矩形（Liang–Barsky）
  function segHitsRect(ax, az, bx, bz, r) {
    let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    const p = [-dx, dx, -dz, dz], q = [ax - r.x0, r.x1 - ax, az - r.z0, r.z1 - az];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 < t1;
  }
  function segHitsCircle(ax, az, bx, bz, cx, cz, r) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((cx - ax) * dx + (cz - az) * dz) / L2, 0, 1);
    return hyp(ax + dx * t, az + dz * t, cx, cz) < r;
  }
  // 視線被擋：高的東西一定擋；矮的（桌子、木箱）只在目標彎腰時擋；人也會擋
  function blocked(ax, az, bx, bz, obst, people, targetCrouched, ignore) {
    for (const o of obst) {
      if (o.h === 'low' && !targetCrouched) continue;
      if (segHitsRect(ax, az, bx, bz, o)) return true;
    }
    for (const p of people) {
      if (ignore.includes(p)) continue;
      if (hyp(p.x, p.z, bx, bz) < .6 || hyp(p.x, p.z, ax, az) < .6) continue;
      if (segHitsCircle(ax, az, bx, bz, p.x, p.z, .32)) return true;
    }
    return false;
  }

  // 失笨拙地閃的判定：rel＝按下時間減撞擊時間（負的＝提早）
  function judgeDodge(rel, loose) {
    const [w0, w1] = loose ? T.dodgeLoose : T.dodgeNormal;
    if (rel == null) return 'hit';
    if (rel < w0) return 'clean';
    if (rel <= w1) return 'clumsy';
    return 'hit';
  }

  // ---------- 關卡資料 ----------
  const R = (x0, x1, z0, z1, h = 'tall') => ({ x0, x1, z0, z1, h });
  const SUITORS = [
    ['安提諾俄斯', -3.8, 3.6, 0, 'thrower'], ['歐律馬科斯', 6.2, 1.2, 1, 'thrower'], ['克特西波斯', -6.2, -2.8, 1, 'thrower'],
    ['安菲諾摩斯', 3.8, -1.5, 0, 'giver'], ['勒奧得斯', -6.2, 1.8, 1, 'giver'], ['波呂玻斯', 6.2, -3.6, 1, 'mocker'],
    ['阿格勞斯', -3.8, -1.0, 0, 'mocker'], ['歐律諾摩斯', 3.8, 3.2, 0, 'mocker'], ['德摩普托勒摩斯', 6.2, 4.2, 1, 'giver'],
    ['皮珊德洛斯', -3.8, -4.4, 0, 'mocker'],
  ];
  // 系列模式：在卡呂普索的島上困得越久（years 7～9），求婚者越囂張【改編】
  // 每多 1 年：回頭看的機率 ×1.12，並依這個順序把一個嘲弄者改成會丟東西的人（固定順序，好測、好重現）
  const YEARS_MIN = 7, YEARS_MAX = 9, YEAR_GLANCE_MUL = 1.12;
  const YEAR_THROWERS = ['阿格勞斯', '歐律諾摩斯'];
  // 系列模式：在冥府聽到阿伽門農完整的忠告（nameless）→ 這一段所有疑心的增加 ×0.85【改編；忠告本身【電影】】
  const NAMELESS_MUL = .85;
  const yearsOf = y => Number.isFinite(y) ? clamp(Math.round(y), YEARS_MIN, YEARS_MAX) : YEARS_MIN;
  function level(seg) {
    if (seg === 'gate') return {
      seg, bounds: R(-14.4, 15.5, -16, 12), ambient: .42,
      obst: [
        R(-15, -2, 10.1, 10.9), R(2, 15, 10.1, 10.9), R(-15.4, -14.6, -11, 11), R(14.6, 15.4, -12, 6), R(14.6, 15.4, 8.4, 10.6),
        R(-8.6, -5.4, -.6, 2.6, 'low'), R(8.4, 10.9, -6.6, -4.7, 'low'), R(2.4, 3.6, -2.6, -1.4, 'low'), R(-4.2, -2, 5, 6.2, 'low'),
      ],
      sideDoor: R(14.4, 15.6, 6, 8.4),
      lights: [{ x: -2.4, z: 9.8, r: 5.5, i: .5, kind: 'torch' }, { x: 2.4, z: 9.8, r: 5.5, i: .5, kind: 'torch' }],
      start: { x: 0, z: -13.5, yaw: Math.PI },
      goal: '走進宮門（或找別的路）',
    };
    const braziers = [{ x: -7.6, z: -6.8 }, { x: 7.6, z: -6.8 }, { x: 0, z: -2.6 }];
    return {
      seg, bounds: R(-8.8, 8.8, -8.8, 8.8), ambient: .1,
      obst: [
        R(-9.8, 9.8, -9.8, -9), R(-9.8, 9.8, 9, 9.8), R(-9.8, -9, -9.8, 9.8), R(9, 9.8, -9.8, 9.8),
        ...[[-2.6, -6], [2.6, -6], [-2.6, 0], [2.6, 0]].map(([x, z]) => R(x - .35, x + .35, z - .35, z + .35)),
        R(-5.5, -4.5, -5, 5, 'low'), R(4.5, 5.5, -5, 5, 'low'), R(-.9, .9, 5.1, 6.9, 'low'), R(-9, -7.9, 6.6, 7.8),
        ...braziers.map(b => R(b.x - .3, b.x + .3, b.z - .3, b.z + .3, 'low')),
      ],
      lights: [{ x: 0, z: 6, r: 7.5, i: 1, kind: 'hearth' }, ...braziers.map((b, i) => ({ x: b.x, z: b.z, r: 4.5, i: .7, dim: .1, on: true, kind: 'brazier', id: i }))],
      braziers, hearth: { x: 0, z: 6 }, weapons: { x: 8.6, z: 6.4 }, penDoor: { x: -8.4, z: 7.2 },
      jars: [[3.1, -3.2], [-3.1, 2.4], [7.6, -.5], [-7.6, -2.0], [1.5, 4.2]].map(([x, z]) => ({ x, z, down: false })),
      start: { x: 0, z: -8.2, yaw: Math.PI },
      goal: '坐到爐火邊（按住 E）',
    };
  }

  // ---------- 遊戲 ----------
  function createGame(seg, carry, opts = {}) {
    const rng = opts.rng || Math.random;
    const O = Object.assign({ knowers: true, tell: true, statue: true, ledger: true, loose: false, years: YEARS_MIN, nameless: false }, opts.options || {});
    O.years = yearsOf(O.years);
    O.nameless = O.nameless === true;
    const suspMul = O.nameless ? NAMELESS_MUL : 1;
    const extra = O.years - YEARS_MIN;
    const glanceMul = Math.pow(YEAR_GLANCE_MUL, extra);
    const L = level(seg);
    carry = Object.assign(freshCarry(), carry || {});
    if (!Number.isFinite(carry.ledger)) carry.ledger = 0;
    const g = {
      seg, L, O, T, years: O.years, glanceP: Math.min(1, T.glanceP * glanceMul), glanceCuriousP: Math.min(1, T.glanceCuriousP * glanceMul), nameless: O.nameless, suspMul, t: 0, phase: 'play', result: null, out: [],
      carry: JSON.parse(JSON.stringify(carry)), snapshot: JSON.parse(JSON.stringify(carry)),
      player: { x: L.start.x, z: L.start.z, yaw: L.start.yaw, standing: false, limp: false, crouched: true, moving: false, light: 0, stepT: 0, bones: 1 },
      body: 1, anger: 0, statue: 'carried', statueT: 0, statuePos: null,
      npcs: [], knowers: {}, throws: [], projectiles: [], hold: null, dialog: null,
      begT: -99, tendT: -99, permission: false, sideOpen: false, flags: {},
      jars: L.jars || [], braziers: (L.braziers || []).map((b, i) => ({ ...b, lit: true, bankUntil: 0, id: i })),
    };
    const out = (type, a, b) => g.out.push({ type, a, b });
    g.msg = (text, color) => out('msg', text, color);
    g.sfx = name => out('sfx', name);
    const later = [];
    g.later = (sec, fn) => later.push({ at: g.t + sec, fn });

    const npc = (name, x, z, yaw, o = {}) => {
      const n = Object.assign({ id: g.npcs.length, name, x, z, yaw, homeX: x, homeZ: z, baseYaw: yaw, lookYaw: yaw, lookT: rng() * 3 + 1,
        hostile: false, susp: 0, stage: 'calm', begged: false, nearT: 0, tauntT: 6 + rng() * 6, arm: 0, mode: 'idle', focus: null, lastSeen: null, searchT: 0, r: .45 }, o);
      g.npcs.push(n); return n;
    };

    if (seg === 'gate') {
      g.mel = npc('墨蘭提俄斯', 0, 9.2, Math.PI, { hostile: true, role: 'mel', kick: 'ready' });
      npc('求婚者 阿格勞斯', -9.2, 3.4, Math.PI * .75, { hostile: true, role: 'loiter' });
      npc('求婚者 皮珊德洛斯', -4.6, 3.8, -Math.PI * .7, { hostile: true, role: 'loiter' });
      g.knowers.tele = npc('忒勒馬科斯', 5.5, 7.5, Math.PI * 1.1, { role: 'tele', seated: true });
      g.knowers.eum = npc('歐邁俄斯', -1.4, -12.6, 0, { role: 'eum', follow: true });
      g.argos = { x: -6.9, z: 1, state: 'asleep', t: 0, petT: 0 };
      g.msg('你和老豬倌歐邁俄斯來到宮門外。他看不見，只當你是個乞丐。');
      g.later(4.2, () => g.msg('門口的牧羊人墨蘭提俄斯專門找乞丐麻煩。火把照得到的地方，人看得比較清楚。'));
    } else {
      const turned = YEAR_THROWERS.slice(0, extra);
      SUITORS.forEach(([name, x, z, side, kind]) => {
        if (kind === 'mocker' && turned.includes(name)) kind = 'thrower';
        const inward = side === 1;
        const yaw = x > 0 ? (inward ? -Math.PI / 2 : Math.PI / 2) : (inward ? Math.PI / 2 : -Math.PI / 2);
        npc(name, x, z, yaw, { hostile: true, role: 'suitor', kind, seated: true, inner: side === 0 });
      });
      npc('墨蘭托', -1.5, -7.4, 0, { hostile: true, role: 'maid', sharp: true, route: [[-1.5, -7.4], [-1.5, 4.0], [1.5, 4.0], [1.5, -7.4]], wp: 1, pauseT: 0, speed: 1.1 });
      npc('僕人', -3.1, -7.6, 0, { role: 'servant', route: [[-3.1, -7.6], [-3.1, 4.6], [-7.6, 4.6], [-7.6, -7.6]], wp: 1, pauseT: 0, speed: .9 });
      npc('僕人', 3.1, 4.6, Math.PI, { role: 'servant', route: [[3.1, 4.6], [3.1, -7.6], [7.6, -7.6], [7.6, 4.6]], wp: 1, pauseT: 0, speed: .9 });
      g.knowers.tele = npc('忒勒馬科斯', 2.4, 7.6, Math.PI, { role: 'tele', seated: true });
      g.knowers.eum = npc('歐邁俄斯', 3.4, -7.8, -Math.PI / 4, { role: 'eum' });
      g.knowers.pen = npc('潘妮洛普', -8.4, 7.2, Math.PI / 2, { role: 'pen' });
      g.msg('大廳裡全是求婚者。走到爐火邊坐下，但別被看穿。');
      g.later(4.2, () => g.msg('乞討、照看火盆是乞丐的差事；無端走動、站直張望都會引人注意。'));
    }
    if (O.nameless) g.msg('你想起阿伽門農的話：別以國王的身分回家，要以無名之人的身分回去。', 'fire');
    for (const k in g.knowers) { const n = g.knowers[k]; n.kstate = g.carry[k]; n.tell = 0; }
    if (g.knowers.pen && g.carry.pen === 'knows') g.permission = true;

    // ----- 共用 -----
    const P = g.player;
    const dP = n => hyp(P.x, P.z, n.x, n.z);
    const hostiles = () => g.npcs.filter(n => n.hostile);
    const lightsNow = () => L.lights.map(l => l.kind === 'brazier' ? { ...l, on: g.braziers[l.id].lit } : l);
    g.lightAt = (x, z) => lightAt(x, z, L.ambient, lightsNow());
    const obstNow = () => g.sideOpen ? L.obst : L.obst.concat(L.sideDoor ? [L.sideDoor] : []);

    // 敵人看不看得到玩家，回傳清晰度 0～1（0＝看不到）
    function clarity(n) {
      const d = dP(n);
      let range = (T.rangeDark + (T.rangeLit - T.rangeDark) * P.light) * (P.crouched ? T.crouchRangeMul : 1) * (n.sharp ? T.sharpMul : 1);
      if (n.stage === 'suspicious' || n.mode === 'investigate') range *= 1.2;
      if (d > range) return 0;
      if (d > .9) {
        const half = n.stage === 'calm' ? T.coneHalf : T.coneAlert;
        const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
        if (((P.x - n.x) * fx + (P.z - n.z) * fz) / d < Math.cos(half)) return 0;
        if (blocked(n.x, n.z, P.x, P.z, obstNow(), g.npcs, P.crouched, [n])) return 0;
      }
      return clamp(1 - d / range, .15, 1);
    }
    g.clarity = clarity;
    const seers = () => hostiles().filter(n => n.vis > 0);
    function addSusp(n, v, reason) {
      if (g.phase !== 'play') return;
      if (v > 0) v *= suspMul;
      n.susp = clamp(n.susp + v, 0, 1);
      if (v > 0 && n.vis > 0) n.lastSeen = { x: P.x, z: P.z };
      if (n.susp >= 1) fail(reason || 'seen', n);
    }
    g.addSusp = addSusp;

    function fail(kind, n) {
      if (g.phase !== 'play') return;
      g.phase = 'fail'; g.result = { kind, who: n ? n.name : '' }; g.sfx('laugh');
    }
    function win() {
      if (g.phase !== 'play') return;
      g.phase = 'win'; g.result = { kind: g.seg }; g.sfx('win');
    }
    g.retryCarry = () => {
      const c = JSON.parse(JSON.stringify(g.snapshot));
      if (g.phase === 'fail') c.ledger += Math.floor((g.carry.ledger - g.snapshot.ledger) / 2);   // 失敗：這段的帳保留一半
      return c;
    };

    // ----- 聲音 -----
    function noise(x, z, r, kind) {
      for (const n of hostiles()) {
        if (hyp(n.x, n.z, x, z) > r) continue;
        n.focus = { x, z, until: g.t + (kind === 'bone' || kind === 'jar' ? 3.5 : 2) };
        if (kind === 'bone' && (n.stage === 'suspicious' || n.mode === 'investigate')) { n.lastSeen = { x, z }; n.mode = 'investigate'; n.searchT = 0; }
      }
    }

    // ----- 羞辱與知情者 -----
    function knowersSee(amount) {
      if (!O.knowers || !O.tell) return;
      for (const k of ['tele', 'pen', 'eum']) {
        const n = g.knowers[k]; if (!n || n.kstate !== 'knows') continue;
        let seen;
        if (k === 'eum') seen = dP(n) < 6;
        else if (k === 'pen') { const d = dP(n); seen = d < 14 && ((P.x - n.x) * Math.sin(n.yaw) + (P.z - n.z) * Math.cos(n.yaw)) / d > Math.cos(1.2); }
        else seen = dP(n) < 14;
        if (seen) { n.tell = clamp(n.tell + amount * (k === 'tele' ? 1.3 : 1), 0, 1); if (n.tell >= 1) tellBurst(n, k); if (g.phase !== 'play') return; }
      }
    }
    function tellBurst(n, k) {
      const lines = { tele: '忒勒馬科斯猛地站起來，對著求婚者吼：「你們誰敢再碰他！」', pen: '潘妮洛普推開門，盯著你看了太久。', eum: '歐邁俄斯忍不住大聲叫了一聲「主人」。' };
      g.msg(lines[k], 'tell'); n.tell = .3;
      for (const h of hostiles()) if (hyp(h.x, h.z, n.x, n.z) < 12) { h.susp = clamp(h.susp + .6 * suspMul, 0, 1); if (h.susp >= 1) return fail('tell', n); }
    }
    function humiliate(by, text, hit) {
      g.anger = clamp(g.anger + (hit ? T.angerHit : T.angerInsult), 0, 1);
      if (O.ledger) g.carry.ledger++;
      if (by) by.susp = clamp(by.susp - (hit ? .3 : .25), 0, 1);
      for (const h of seers()) if (h !== by) h.susp = clamp(h.susp - .06, 0, 1);
      if (text) g.msg(text);
      if (g.anger >= 1) return fail('rage');
      knowersSee(hit ? .38 : .16);
    }

    // ----- 投擲與踢 -----
    function startThrow(n, kind) {
      if (g.throws.some(e => e.by === n)) return;
      const what = kind === 'kick' ? '抬起了腳' : n.name === '克特西波斯' ? '抓起一隻牛蹄' : '抓起了腳凳';
      g.throws.push({ by: n, kind, t: 0, windup: kind === 'kick' ? .75 : .95, flight: kind === 'kick' ? 0 : .55, pressed: null, target: { x: P.x, z: P.z }, warn: `${n.name}${what}` });
      n.lookYaw = Math.atan2(P.x - n.x, P.z - n.z); n.focus = null;
      g.sfx('whoosh');
    }
    function resolveThrow(e) {
      const n = e.by;
      if (e.kind === 'kick') n.kick = 'done';
      const moved = hyp(P.x, P.z, e.target.x, e.target.z);
      if ((e.kind === 'kick' && dP(n) > 2.4) || (e.kind === 'throw' && moved > T.throwSidestep)) {
        addSusp(n, .22); g.msg(`你早一步躲開了。${n.name}眯起眼睛看你。`); return;
      }
      const res = judgeDodge(e.pressed == null ? null : e.pressed - (e.windup + e.flight), O.loose);
      if (res === 'clean') {
        addSusp(n, .38); for (const h of seers()) if (h !== n) addSusp(h, .14);
        if (g.phase !== 'play') return;
        g.msg('你閃得太俐落了，不像個老乞丐。', 'susp'); g.sfx('whoosh'); return;
      }
      if (res === 'clumsy') {
        g.body = clamp(g.body - T.dmgClumsy, 0, 1); g.sfx('thud'); g.out.push({ type: 'shake', a: .25 });
        if (g.body <= 0) return fail('beaten');
        humiliate(n, `你笨拙地一縮，被${e.kind === 'kick' ? '踢' : '砸'}到肩膀，摔倒在地。旁人哄堂大笑。`, false);
        return statueCheck();
      }
      let dmg = e.kind === 'kick' ? T.dmgKick : T.dmgThrow;
      const t = g.knowers.tele;
      if (O.knowers && t && t.kstate === 'knows' && dP(t) < 14) { dmg *= .5; g.msg('忒勒馬科斯：「夠了！他是我家的客人。」'); }
      g.body = clamp(g.body - dmg, 0, 1); g.sfx('thud'); g.out.push({ type: 'shake', a: .5 });
      if (g.body <= 0) return fail('beaten');
      humiliate(n, `${e.kind === 'kick' ? '一腳' : n.name === '克特西波斯' ? '牛蹄' : '腳凳'}重重打在你身上。你像岩石一樣站著，默默搖頭。`, true);
      statueCheck();
    }
    function statueCheck() {
      if (g.phase !== 'play' || !O.statue || g.statue !== 'carried' || g.body > T.statueDropBelow) return;
      if (rng() < .5) {
        g.statue = 'dropped'; g.statueT = T.statueTime;
        g.statuePos = { x: P.x - Math.sin(P.yaw) * .6, z: P.z - Math.cos(P.yaw) * .6 };   // 掉在腳前（前方＝-sin, -cos）
        g.msg('雅典娜神像從你的破衣裡掉了出來！快撿起來（E）', 'fire');
      }
    }

    // ----- 互動 -----
    g.interact = () => {
      if (g.statue === 'dropped' && hyp(P.x, P.z, g.statuePos.x, g.statuePos.z) < 1.6) return { type: 'statue', label: '撿起神像' };
      let best = null, bd = 1e9;
      for (const n of g.npcs) {
        const d = dP(n); if (d > 1.8 || d > bd) continue;
        if (n.role === 'suitor') { bd = d; best = { type: 'beg', n, label: n.begged ? `再向${n.name}討（他會不耐煩）` : `向${n.name}乞討` }; }
        else if (!O.knowers) continue;
        else if (n.role === 'tele') { bd = d; best = n.kstate === 'suspects' ? { type: 'reveal', n, hold: 2, label: '按住：讓忒勒馬科斯知道你是誰' } : n.kstate === 'knows' ? { type: 'none', n, label: '忒勒馬科斯知道你是誰' } : { type: 'tele0', n, label: '和忒勒馬科斯說話' }; }
        else if (n.role === 'eum') { bd = d; best = n.kstate === 'knows' ? { type: 'none', n, label: '歐邁俄斯知道你是誰' } : { type: 'eum', n, label: '對歐邁俄斯說起往事' }; }
        else if (n.role === 'pen') { bd = d; best = n.kstate === 'knows' ? { type: 'none', n, label: '潘妮洛普知道你是誰' } : { type: 'reveal', n, hold: 2, label: g.statue === 'carried' ? '按住：隔著門拿出雅典娜神像' : '（神像不在你身上）' }; }
      }
      // 「某某知道你是誰」只是提示，不能擋住旁邊的火盆、爐火
      if (best && best.type !== 'none') return best;
      if (g.argos && g.argos.state === 'recognize' && g.argos.petT < T.argosPet && hyp(P.x, P.z, g.argos.x, g.argos.z) < 2.2) return { type: 'pet', hold: T.argosPet, label: '按住：蹲下摸摸牠' };
      for (const b of g.braziers) if (hyp(P.x, P.z, b.x, b.z) < 1.6) return { type: 'tend', b, hold: 2, tap: true, label: b.lit ? '點一下：照看火盆（差事）・按住：把火撥暗' : '點一下：把火盆重新撥旺' };
      if (L.hearth && hyp(P.x, P.z, L.hearth.x, L.hearth.z) < 2.3) return { type: 'sit', hold: 3, label: g.permission ? '按住：坐到爐火邊（潘妮洛普允許的）' : '按住：坐到爐火邊（火光會照亮你的臉）' };
      return best;
    };
    function pressE() {
      const it = g.interact(); if (!it) return;
      if (it.hold) { g.hold = { it, t: 0 }; return; }
      if (it.type === 'statue') { g.statue = 'carried'; g.statueT = 0; g.statuePos = null; g.msg('你把神像塞回破衣裡。'); return; }
      if (it.type === 'beg') return beg(it.n);
      if (it.type === 'tele0') return g.msg('忒勒馬科斯只當你是個乞丐，遞給你一塊肉。也許得有什麼事讓他起疑。');
      if (it.type === 'eum') return openEumaeus(it.n);
    }
    function releaseE() {
      // 只點一下就放開：照看火盆
      if (g.hold && g.hold.it.tap && g.hold.t < .35) tend(g.hold.it.b);
      if (g.hold && g.hold.it.type === 'pet') g.hold = null;
      if (g.hold) g.hold = null;
    }
    function tend(b) {
      b.lit = true; b.bankUntil = 0; g.tendT = g.t; g.sfx('fire');
      g.msg('你替求婚者照看火盆。（之後一陣子在廳裡走動不會引人注意）');
      const mel = g.npcs.find(n => n.role === 'maid');
      if (mel && mel.vis > 0 && dP(mel) < 8 && !g.flags.maidRebuke) { g.flags.maidRebuke = true; humiliate(mel, '墨蘭托：「老東西，你想在這裡過夜嗎？還不滾出去！」', false); }
    }
    function beg(n) {
      n.lookYaw = Math.atan2(P.x - n.x, P.z - n.z); g.begT = g.t;
      if (n.begged) { addSusp(n, .12); if (n.kind === 'thrower') return startThrow(n, 'throw'); g.msg(`${n.name}：「又是你？滾開。」`); return; }
      n.begged = true;
      g.later(.7, () => {
        if (n.kind === 'giver') {
          n.susp = clamp(n.susp - .25, 0, 1); for (const h of seers()) h.susp = clamp(h.susp - .05, 0, 1);
          if (rng() < .5 && P.bones < T.boneMax) { P.bones++; g.msg(`${n.name}丟給你一根啃過的骨頭。（左鍵可以丟出去引開人）`); }
          else { g.body = clamp(g.body + .12, 0, 1); g.msg(`${n.name}丟給你一塊麵包。`); }
          g.sfx('bread');
        } else if (n.kind === 'mocker') humiliate(n, `${n.name}：「看看這個老東西，連狗都比他體面。」`, false);
        else { g.msg(`${n.name}：「誰讓這個乞丐進來的？」`); startThrow(n, 'throw'); }
      });
    }
    const EUM = [['你跟著我去了特洛伊，在船上替我掌舵。', false], ['你小時候被賣到這裡，是我母親把你和我妹妹一起帶大的。', true], ['你是我從海上救起來的漁夫，後來才來養豬。', false]];
    for (let i = EUM.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [EUM[i], EUM[j]] = [EUM[j], EUM[i]]; }   // 每局洗牌，正確的那段不固定在第幾個
    g.eumLines = EUM.map(l => l[0]);
    function openEumaeus(n) {
      if (g.t < (n.retryAt || 0)) return g.msg('歐邁俄斯還在皺眉，不想再聽你說。');
      g.dialog = { n };
    }
    function choose(i) {
      const n = g.dialog.n; g.dialog = null;
      const hearers = hostiles().filter(h => dP(h) < T.whisperRadius);
      for (const h of hearers) addSusp(h, .3);
      if (g.phase !== 'play') return;
      if (hearers.length) g.msg(`${hearers.map(h => h.name).join('、')}聽到你們在說悄悄話。`, 'susp');
      if (EUM[i][1]) {
        reveal(n, 'eum'); g.msg('歐邁俄斯的手開始發抖：「主人……你回來了。」');
        if (g.seg === 'gate') g.later(1.8, () => g.msg('歐邁俄斯低聲說：「別走正門。右邊有一道側門，我帶你。墨蘭提俄斯看到乞丐靠近就會抬腳。」'));
      } else { n.retryAt = g.t + 20; g.msg('歐邁俄斯皺起眉頭：「你怎麼會這樣說？」'); }
    }
    function reveal(n, k) {
      n.kstate = 'knows'; g.carry[k] = 'knows'; g.sfx('lyre');
      if (k === 'pen') { g.permission = true; g.msg('潘妮洛普隔著門看著神像，很久沒有說話。然後她吩咐女僕：「給那位客人一個爐火邊的位子。」'); }
      if (k === 'tele') g.msg('忒勒馬科斯抓住你的手臂，眼眶紅了：「我會等你的信號。」');
    }
    function finishHold(it) {
      if (it.type === 'reveal') {
        if (it.n.role === 'pen' && g.statue !== 'carried') return g.msg('神像不在你身上。');
        const s = seers(); for (const h of s) addSusp(h, .5);
        if (g.phase !== 'play') return;
        if (s.length) g.msg(`${s.map(h => h.name).join('、')}看到了這一幕。`, 'susp');
        reveal(it.n, it.n.role);
      } else if (it.type === 'tend') {
        const b = it.b; b.lit = false; b.bankUntil = g.t + T.bankTime; g.sfx('fire');
        const s = seers(); for (const h of s) addSusp(h, .2);
        g.msg(s.length ? '你把火撥暗了。有人看見你在弄火。' : '你把火撥暗了。這一區暗了下來。', s.length ? 'susp' : null);
      } else if (it.type === 'sit') win();
    }
    function signalQ() {
      if (!O.knowers || g.t - (g.lastQ || -9) < .8) return; g.lastQ = g.t;
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      let hit = null;
      for (const k in g.knowers) {
        const n = g.knowers[k]; if (n.kstate !== 'knows') continue;
        const dx = n.x - P.x, dz = n.z - P.z, d = Math.hypot(dx, dz);
        if (k === 'eum' ? d < 2 : d < 14 && (dx * fx + dz * fz) / d > Math.cos(.6)) hit = n;
      }
      if (!hit) return g.msg('附近沒有你能示意的知情者（要看著他）。');
      hit.tell = clamp(hit.tell - .45, 0, 1);
      for (const h of seers()) addSusp(h, .05);
      g.msg(hit.role === 'eum' ? '你輕輕按住歐邁俄斯的手臂。他安靜下來。' : `你對${hit.name}輕輕搖頭。`);
    }
    function throwBone(at) {
      if (P.bones <= 0) return g.msg('你身上沒有骨頭。（向給東西的求婚者乞討）');
      let { x, z } = at; const d = hyp(x, z, P.x, P.z);
      if (d > T.throwRange) { x = P.x + (x - P.x) / d * T.throwRange; z = P.z + (z - P.z) / d * T.throwRange; }
      P.bones--;
      const s = seers(); for (const h of s) addSusp(h, .2);
      if (s.length) g.msg('有人看見你丟東西。乞丐不該這樣做。', 'susp');
      g.projectiles.push({ x0: P.x, z0: P.z, x1: x, z1: z, t: 0, dur: .6 });
      g.sfx('throw');
    }

    // ----- 移動與碰撞 -----
    function move(dx, dz) {
      const r = .32, obst = obstNow();
      const hit = (x, z) => {
        for (const o of obst) if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r) return true;
        for (const n of g.npcs) { if (n.follow || n.mode === 'walk' || n.route) continue; const d = hyp(x, z, n.x, n.z); if (d < n.r + r && d < hyp(P.x, P.z, n.x, n.z)) return true; }   // 已經重疊時允許往外走，免得被走過來查看的人卡住
        return false;
      };
      if (!hit(P.x + dx, P.z)) P.x += dx;
      if (!hit(P.x, P.z + dz)) P.z += dz;
      const b = L.bounds; P.x = clamp(P.x, b.x0, b.x1); P.z = clamp(P.z, b.z0, b.z1);
    }
    function walkTo(n, x, z, speed, dt) {
      const dx = x - n.x, dz = z - n.z, d = Math.hypot(dx, dz);
      if (d < .05) return true;
      const s = Math.min(d, speed * dt); n.x += dx / d * s; n.z += dz / d * s; n.lookYaw = Math.atan2(dx, dz);
      return d - s < .05;
    }

    // ----- 每幀 -----
    g.step = (dt, I) => {
      if (g.phase !== 'play') return;
      I = I || {};
      dt = Number.isFinite(dt) ? clamp(dt, 0, .25) : 0;   // 分頁切回來的長幀、NaN 都不能讓模擬爆掉
      g.t += dt;
      for (let i = later.length - 1; i >= 0; i--) if (g.t >= later[i].at) { const f = later.splice(i, 1)[0].fn; f(); if (g.phase !== 'play') return; }

      // 對話中只等選擇
      if (g.dialog) { if (Number.isInteger(I.choice) && I.choice >= 0 && I.choice < EUM.length) choose(I.choice); else if (I.cancel) g.dialog = null; return; }

      const beating = !!I.beat;
      if (Number.isFinite(I.yaw) && !beating) P.yaw = wrapAng(I.yaw);   // 捶胸時不能看別處
      P.standing = !!I.stand; P.limp = !!I.limp && !P.standing;
      P.crouched = !P.standing;
      // 移動
      let mx = I.mx || 0, mz = I.mz || 0; const len = Math.hypot(mx, mz);
      P.moving = false;
      if (len && !beating && !g.hold) {
        const sp = (P.standing ? T.speedStand : T.speedCrouch) * (P.limp ? T.limpMul : 1) * dt / len;
        const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
        const ox = P.x, oz = P.z;
        move((mx * cos + mz * sin) * sp, (-mx * sin + mz * cos) * sp);
        P.moving = hyp(ox, oz, P.x, P.z) > 1e-4;
      }
      P.light = g.lightAt(P.x, P.z);
      // 腳步聲
      if (P.moving) { P.stepT -= dt; if (P.stepT <= 0) { P.stepT = T.stepEvery; noise(P.x, P.z, P.standing ? T.noiseStand : P.limp ? T.noiseLimp : T.noiseCrouch, 'step'); g.sfx(P.limp ? 'staff' : 'step'); } }
      // 撞倒酒罈
      for (const j of g.jars) if (!j.down && P.moving && hyp(P.x, P.z, j.x, j.z) < .45) {
        j.down = true; noise(j.x, j.z, T.jarNoise, 'jar'); g.sfx('jar');
        for (const h of hostiles()) if (clarity(h) > 0) h.susp = clamp(h.susp - .1, 0, 1);
        const m = hostiles().filter(h => h.kind === 'mocker' && hyp(h.x, h.z, j.x, j.z) < 6).sort((a, b) => hyp(a.x, a.z, j.x, j.z) - hyp(b.x, b.z, j.x, j.z))[0];
        humiliate(m || null, m ? `酒罈翻倒了。${m.name}笑得直拍桌子：「這個笨手笨腳的老東西！」` : '酒罈翻倒了，滿廳都是笑聲。', false);
        if (g.phase !== 'play') return;
      }
      // 捶胸
      if (beating) { g.anger = clamp(g.anger - dt * T.chestRate, 0, 1); }
      // 按鍵
      if (I.ePressed) pressE();
      if (I.eReleased) releaseE();
      if (I.space) for (const e of g.throws) if (e.pressed == null) e.pressed = e.t;
      if (I.q) signalQ();
      if (I.throwAt) throwBone(I.throwAt);
      if (g.phase !== 'play') return;

      // 按住互動
      if (g.hold) {
        const cur = g.interact();
        if (!I.eDown || !cur || cur.type !== g.hold.it.type || cur.n !== g.hold.it.n || cur.b !== g.hold.it.b) g.hold = null;
        else {
          g.hold.t += dt;
          if (g.hold.it.type === 'pet') {
            g.argos.petT += dt; for (const h of seers()) addSusp(h, dt * .2);
            if (g.phase === 'play' && g.argos.petT >= T.argosPet) { g.hold = null; g.msg('你蹲下摸了摸牠的頭。牠的尾巴輕輕拍著地。'); }
          }
          else {
            if (g.hold.it.type === 'sit' && !g.permission) {
              // 有人沒經允許就坐上爐火邊的位子：附近座位上的人轉過來看
              if (g.hold.t > T.hearthNoticeDelay) for (const h of hostiles()) if (h.seated && h.mode === 'idle' && hyp(h.x, h.z, L.hearth.x, L.hearth.z) < T.hearthNotice && !g.throws.some(e => e.by === h)) if (!h.focus || h.focus.notice) h.focus = { x: P.x, z: P.z, until: g.t + .6, notice: true };   // 被骨頭聲引開的人不會回頭
              for (const h of seers()) addSusp(h, dt * T.gainHearth * (h.vis + .5));
            }
            if (g.phase === 'play' && g.hold && g.hold.t >= g.hold.it.hold) { const it = g.hold.it; g.hold = null; finishHold(it); }
          }
          if (g.phase !== 'play') return;
        }
      }

      // 火盆恢復
      for (const b of g.braziers) if (!b.lit && b.bankUntil && g.t > b.bankUntil) { b.lit = true; b.bankUntil = 0; }

      // 差事、跛行、混進僕人：在廳裡走動算不算可疑
      const pretext = g.t < Math.max(g.begT + T.begPretext, g.tendT + T.tendPretext);
      const blend = g.npcs.some(n => n.role === 'servant' && dP(n) < T.blendRadius);
      const wanderMul = g.seg !== 'hall' || pretext || blend ? 0 : P.limp ? .5 : 1;

      // NPC
      for (const n of g.npcs) {
        if (n.follow) follow(n, dt);
        else if (n.route && n.mode !== 'investigate') patrol(n, dt);
        // 轉頭
        if (n.focus && g.t < n.focus.until) n.lookYaw = Math.atan2(n.focus.x - n.x, n.focus.z - n.z);
        else if (n.focus) n.focus = null;
        else if (!n.route || n.pauseT > 0) {
          n.lookT -= dt;
          if (n.lookT <= 0 && !g.throws.some(e => e.by === n) && n.mode === 'idle') {
            n.lookT = 2 + rng() * 3;
            const d = dP(n), lookP = n.stage === 'curious' ? .7 : .4;
            const glancer = n.inner && n.seated && d < T.glanceRadius;
            if (glancer && rng() < (n.stage === 'curious' ? g.glanceCuriousP : g.glanceP)) {
              // 內側的人回頭看一眼走道上的乞丐，看一下就轉回桌子
              n.lookYaw = Math.atan2(P.x - n.x, P.z - n.z); n.lookT = T.glanceHold[0] + rng() * (T.glanceHold[1] - T.glanceHold[0]);
            }
            else if (glancer) n.lookYaw = n.baseYaw + (rng() - .5) * 1.4;
            else if (n.role === 'mel') n.lookYaw = rng() < .45 ? n.baseYaw + (rng() < .5 ? 1.6 : -1.6) : d < 10 ? Math.atan2(P.x - n.x, P.z - n.z) : n.baseYaw;
            else if (n.hostile && d < 9 && rng() < lookP) n.lookYaw = Math.atan2(P.x - n.x, P.z - n.z);
            else if (n.role !== 'pen' && !n.route) n.lookYaw = n.baseYaw + (rng() - .5) * 1.4;
          }
        }
        n.lookYaw = wrapAng(n.lookYaw);
        n.yaw = wrapAng(n.yaw + clamp(angDiff(n.yaw, n.lookYaw), -dt * 2.2, dt * 2.2));
        if (!n.hostile) continue;

        // 看
        n.vis = clarity(n);
        const k = (.5 + n.vis) * (.6 + .6 * P.light);
        if (n.vis > 0) {
          n.lastSeen = { x: P.x, z: P.z };
          if (P.standing) addSusp(n, dt * T.gainStand * k);
          else if (!P.moving) n.susp = clamp(n.susp - dt * T.crouchCalm, 0, 1);   // 彎腰縮著不動：像個乞丐，疑心慢慢下降
          if (P.moving && wanderMul) addSusp(n, dt * T.gainWander * wanderMul * k);
          if (L.weapons && hyp(P.x, P.z, L.weapons.x, L.weapons.z) < 2.2) {
            addSusp(n, dt * T.gainWeapons * k);
            if (!g.flags.weapon) { g.flags.weapon = true; g.msg('牆上掛著你的兵器。乞丐不該在這裡逗留。', 'susp'); }
          }
          if (g.phase !== 'play') return;
        } else n.susp = clamp(n.susp - dt * T.decay, 0, 1);

        // 警覺階段
        const prev = n.stage; n.stage = stageOf(n.susp);
        if (n.stage === 'suspicious' && prev !== 'suspicious' && n.lastSeen && n.mode !== 'investigate') {
          n.mode = 'investigate'; n.searchT = 0; g.msg(`${n.name}起了疑心，走過來查看。`, 'susp');
        }
        if (n.mode === 'investigate') investigate(n, dt);
        if (n.mode === 'walk') walkHome(n, dt);
        n.away = n.mode === 'investigate' || n.mode === 'walk';
        // 傳染：懷疑的人和身邊的人交頭接耳
        if (n.stage === 'suspicious') for (const o of hostiles()) if (o !== n && o.stage !== 'suspicious' && hyp(o.x, o.z, n.x, n.z) < T.contagionRadius) {
          o.susp = clamp(o.susp + dt * T.contagionRate * suspMul, 0, .99); if (n.lastSeen && !o.lastSeen) o.lastSeen = { x: n.lastSeen.x, z: n.lastSeen.z }; if (n.lastSeen && !o.focus) o.focus = { x: n.lastSeen.x, z: n.lastSeen.z, until: g.t + 1.5 };
        }

        // 各角色
        if (n.kind === 'thrower' && dP(n) < 3.5 && !n.begged && n.mode === 'idle') { n.nearT += dt; if (n.nearT > 5) { n.nearT = -8; g.msg(`${n.name}：「這個乞丐一直在我旁邊轉。」`); startThrow(n, 'throw'); } }
        else if (n.nearT > 0) n.nearT = Math.max(0, n.nearT - dt);   // 走開就慢慢忘了，不會累積到下次經過
        if (n.kind === 'mocker' && dP(n) < 3) { n.tauntT -= dt; if (n.tauntT <= 0) { n.tauntT = 9 + rng() * 5; humiliate(n, `${n.name}朝你吐了一口：「乞丐就該待在門口。」`, false); if (g.phase !== 'play') return; } }
        if (n.role === 'maid' && n.vis > 0 && dP(n) < 3.5 && g.t > (n.scoldAt || 0)) { n.scoldAt = g.t + 16; humiliate(n, '墨蘭托：「你這個討人嫌的老東西，還在這裡晃？」', false); if (g.phase !== 'play') return; }
        if (n.role === 'mel' && n.kick === 'ready' && dP(n) < 2.0 && n.vis > 0) { n.kick = 'kicking'; g.msg('墨蘭提俄斯：「豬倌，你把什麼髒東西帶來了？」'); startThrow(n, 'kick'); }
        if (n.role === 'mel' && n.kick === 'done' && n.homeX !== 3.4) { n.homeX = 3.4; if (n.mode === 'idle') n.mode = 'walk'; }   // 踢完退到一旁；查看完也回到一旁
        n.mark = '';
        if (O.knowers && g.knowers.eum && g.knowers.eum.kstate === 'knows') {
          if (n.kind === 'thrower') n.mark = '會丟東西';
          if (n.role === 'mel' && n.kick === 'ready') n.mark = '靠近會踢人';
        }
      }

      // 投擲事件
      for (const e of [...g.throws]) {
        e.t += dt; e.by.arm = clamp(e.t / e.windup, 0, 1);
        if (e.kind === 'throw' && e.t >= e.windup && !e.flying) { e.flying = true; e.target = { x: P.x, z: P.z }; }
        if (e.t >= e.windup + e.flight) { g.throws.splice(g.throws.indexOf(e), 1); e.by.arm = 0; resolveThrow(e); if (g.phase !== 'play') return; }
      }
      // 骨頭落地
      for (const p of [...g.projectiles]) {
        p.t += dt;
        if (p.t >= p.dur) { g.projectiles.splice(g.projectiles.indexOf(p), 1); noise(p.x1, p.z1, T.boneNoise, 'bone'); g.sfx('bone'); }
      }

      knowersStep(dt); if (g.phase !== 'play') return;
      if (g.argos) { argosStep(dt); if (g.phase !== 'play') return; }
      if (g.seg === 'gate') gateExit();

      // 神像
      if (g.statue === 'dropped') {
        g.statueT -= dt;
        if (g.statueT <= 0) { const s = hostiles().find(h => h.vis > 0 && hyp(h.x, h.z, g.statuePos.x, g.statuePos.z) < 8); if (s) return fail('statue', s); }
      }
      // 爐火邊恢復
      if (L.hearth && hyp(P.x, P.z, L.hearth.x, L.hearth.z) < 3) g.body = clamp(g.body + dt * .03, 0, 1);
      g.top = hostiles().reduce((a, b) => (!a || b.susp > a.susp ? b : a), null);
    };

    function investigate(n, dt) {
      const ls = n.lastSeen;
      if (!ls) { n.mode = 'return'; }
      else if (n.searchT === 0 && !walkTo(n, ls.x, ls.z, 1.2, dt) && hyp(n.x, n.z, ls.x, ls.z) > .8) return;
      n.searchT += dt; n.lookYaw += dt * 1.6;
      if (n.searchT > 3.5 || n.stage === 'calm' || n.stage === 'curious') {
        if (n.vis > 0 && n.stage === 'suspicious') { n.searchT = 0; return; }
        n.mode = 'return';
      }
      if (n.mode === 'return') { n.mode = 'walk'; n.lastSeen = null; }
    }
    // 回座位（巡邏的人直接回到路線上）。原本包在 step 外層，對話中、失敗後也會走，現在併進 NPC 迴圈
    function walkHome(n, dt) {
      if (n.route) { n.mode = 'idle'; return; }
      if (walkTo(n, n.homeX, n.homeZ, 1.0, dt)) { n.mode = 'idle'; n.lookYaw = n.baseYaw; }
    }
    function patrol(n, dt) {
      if (n.pauseT > 0) { n.pauseT -= dt; return; }
      const [x, z] = n.route[n.wp];
      if (walkTo(n, x, z, n.speed, dt)) { n.wp = (n.wp + 1) % n.route.length; n.pauseT = n.role === 'maid' ? 2 : .6; n.lookT = 0; }
    }
    function follow(n, dt) {
      const toDoor = n.kstate === 'knows' && g.sideOpen && P.x > 6;
      const tx = toDoor ? 13.6 : P.x, tz = toDoor ? 7.2 : P.z;
      const d = hyp(tx, tz, n.x, n.z);
      if (d > 1.8) walkTo(n, n.x + (tx - n.x) * (d - 1.8) / d, n.z + (tz - n.z) * (d - 1.8) / d, 1.4, dt);
    }
    function knowersStep(dt) {
      if (!O.knowers) return;
      const e = g.knowers.eum;
      if (e && e.kstate === 'knows' && O.tell && dP(e) < 3 && hostiles().some(h => hyp(h.x, h.z, e.x, e.z) < 7)) {
        e.tell = clamp(e.tell + dt * .12, 0, 1); if (e.tell >= 1) tellBurst(e, 'eum');
      }
      for (const k in g.knowers) { const n = g.knowers[k]; n.tell = clamp(n.tell - dt * .015, 0, 1); }
    }
    function argosStep(dt) {
      const a = g.argos, d = hyp(P.x, P.z, a.x, a.z);
      if (a.state === 'asleep' && d < T.argosWake) { a.state = 'recognize'; a.t = 0; g.msg('糞堆上的老狗抬起頭，豎起耳朵，搖起了尾巴。牠認得你。'); g.sfx('whimper'); }
      if (a.state !== 'recognize') return;
      a.t += dt;
      const t = g.knowers.tele;
      if (t && hyp(t.x, t.z, a.x, a.z) < 16 && a.t > 1) { t.lookYaw = Math.atan2(a.x - t.x, a.z - t.z); t.lookT = 3; }
      if (a.t <= T.argosLife) return;
      a.state = 'dead'; g.sfx('whimper');
      if (a.petT >= T.argosPet) g.msg('阿爾戈斯閉上眼睛，不動了。二十年，牠等到了你。');
      else { g.anger = clamp(g.anger + .25, 0, 1); g.msg('阿爾戈斯搖了搖尾巴，然後不動了。你沒有停下來。'); if (g.anger >= 1) return fail('rage'); }
      const dd = t ? hyp(t.x, t.z, a.x, a.z) : 99;
      const tSees = t && dd < 16 && ((a.x - t.x) * Math.sin(t.yaw) + (a.z - t.z) * Math.cos(t.yaw)) / dd > Math.cos(1.0);
      if (O.knowers && t && t.kstate === 'unknown' && tSees) {
        t.kstate = 'suspects'; g.carry.tele = 'suspects';
        g.later(1.4, () => g.msg('忒勒馬科斯一直盯著那隻狗……然後看向你。（避開旁人，走到他身邊按住 E）', 'tell'));
      }
    }
    function gateExit() {
      if (P.z > 11.2) return win();
      if (P.x > 14.3 && P.z > 6 && P.z < 8.4) return win();
      const e = g.knowers.eum;
      if (O.knowers && e && e.kstate === 'knows' && !g.sideOpen) g.sideOpen = true;
    }
    g.top = null;
    for (const n of g.npcs) n.vis = 0;
    return g;
  }

  const FAIL_TEXT = {
    seen: w => ['這個乞丐不是乞丐。', `${w}看穿了你。`, '提示：站直張望、無端走動、閃得太俐落、在亮處逗留，都會讓看著你的人起疑。躲在柱子和人群後面，或找件差事做。'],
    rage: () => ['你沒能忍住。', '一個人對一百零八個人。', '提示：怒火快滿時，找沒人盯著的地方按住 F 捶胸。'],
    beaten: () => ['你倒在自己家的地上。', '他們把你拖了出去。', '提示：不閃會傷得重；最後一刻按空白鍵「笨拙地閃」只會擦傷。爐火邊、乞來的麵包能補身體。'],
    tell: w => [`${w}沉不住氣了。`, '求婚者看出你們認識。', '提示：知情者看到你受辱會越來越激動。看著他按 Q 示意，讓他冷靜。'],
    statue: w => ['他們看見了神像。', `乞丐身上掉出一尊雅典娜神像，${w}認出了它。`, '提示：神像掉出來時，3 秒內按 E 撿起來。'],
  };

  return { T, createGame, level, stageOf, lightAt, segHitsRect, segHitsCircle, blocked, judgeDodge, FAIL_TEXT, freshCarry, angDiff, YEAR_THROWERS, NAMELESS_MUL };
});
