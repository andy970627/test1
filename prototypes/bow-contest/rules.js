/*
 * 伊薩卡比箭：規則模組（純邏輯）
 *
 * 不碰 DOM、不碰 three.js，只有數字進、數字出，之後可以一對一翻成 C#（Unity）。
 * 瀏覽器：全域 BowRules；Node：module.exports。
 *
 * 座標（公尺、秒、弧度）：
 *   奧德修斯坐在 z = 0，面向 -z。y 向上，地板 y = 0。x 向右。
 *   十二把斧頭立在 x = 0 的溝裡，z = -6 … -17（間隔 1 m），孔心高度 = 射擊高度。
 *   yaw > 0 往左轉，pitch > 0 往上抬（與 three.js 相機 rotation.order = 'YXZ' 一致）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BowRules = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- 調整值
  var TUNING = {
    gravity: 9.8,            // m/s²
    shootHeight: 1.1,        // 箭與孔心的高度
    axeCount: 12,
    axeFirst: 6,             // 第一把斧頭距離
    axeSpacing: 1,
    plateHalf: 0.32,         // 斧頭青銅板的半寬：偏太多就是從旁邊飛過
    doorZ: -26,              // 大廳盡頭的門

    // 箭速：v = speedMin + (speedMax - speedMin) * power²
    // 用平方讓半拉的箭明顯下墜，拉不滿就穿不完十二孔。
    speedMin: 20,
    speedMax: 60,
    minFirePower: 0.15,      // 低於這個放手＝取消

    // 斧孔半徑（公尺）
    difficulties: {
      normal: { label: '普通', holeRadius: 0.110 },
      easy:   { label: '寬鬆', holeRadius: 0.140 },
      hard:   { label: '嚴格', holeRadius: 0.082 }
    },

    // 上弦
    string: {
      fillTime: 3.2,         // 一直按住、指針都在亮區時，幾秒上好弦
      decay: 0.6,            // 放手時張力每秒退回
      zone: 0.4,             // 亮區半寬（指針範圍 -1.2 … 1.2）
      outLimit: 0.9,         // 指針離開亮區累計幾秒就滑掉
      pxPerUnit: 220,        // 手橫移多少像素＝指針一個單位
      driftWave: 3.0,        // 指針漂移：慢波
      driftNoise: 10.0,      // 指針漂移：亂流
      damping: 0.985,        // 每 1/60 秒的速度保留
      tensionGain: 1.4,      // 弦越緊越難控
      recenter: 1.5          // 放手時指針回中的速度
    },

    // 拉弓與手晃
    draw: {
      fillTime: 1.0,         // 拉滿秒數
      settle: 0.8,           // 拉滿後多久進入最穩
      steadyEnd: 2.0,        // 最穩撐到拉滿後幾秒
      ampRest: 0.0015,       // 沒拉弓時的晃動（弧度）
      ampDraw: 0.0045,       // 拉弓中
      ampSteady: 0.0007,     // 最穩
      fatigueRate: 0.006,    // 撐太久每秒多晃
      ampMax: 0.02,
      lever: 5,              // 角度晃動對應身體平移：公尺 / 弧度
      freqLow: 1.3,          // 慢晃頻率（Hz）
      freqHigh: 7.5          // 發抖頻率（Hz）
    }
  };

  var DIR_LABEL = { high: '偏高', low: '偏低', left: '偏左', right: '偏右' };

  // ---------------------------------------------------------------- 工具
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // 可注入的亂數：mulberry32，給 seed 就能重現
  function createRng(seed) {
    var a = (seed === undefined ? 1 : seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 平滑一維雜訊（值雜訊 + 餘弦內插），輸出約 -1 … 1
  function createNoise(rng) {
    var N = 256, table = new Array(N);
    for (var i = 0; i < N; i++) table[i] = rng() * 2 - 1;
    return function (x) {
      var i0 = Math.floor(x), f = x - i0;
      var a = table[((i0 % N) + N) % N], b = table[(((i0 + 1) % N) + N) % N];
      var u = (1 - Math.cos(f * Math.PI)) * 0.5;
      return a + (b - a) * u;
    };
  }

  function holeRadius(difficulty) {
    var d = TUNING.difficulties[difficulty] || TUNING.difficulties.normal;
    return d.holeRadius;
  }

  function axeZ(i) { return -(TUNING.axeFirst + i * TUNING.axeSpacing); }

  function axePositions() {
    var out = [];
    for (var i = 0; i < TUNING.axeCount; i++) out.push({ x: 0, y: TUNING.shootHeight, z: axeZ(i) });
    return out;
  }

  // ---------------------------------------------------------------- 上弦
  function createStringState(rng) {
    rng = rng || Math.random;
    return {
      tension: 0, needle: 0, drift: 0, driftVel: 0, hand: 0,
      outTime: 0, t: 0, wavePhase: rng() * Math.PI * 2,
      failed: false, done: false, rng: rng
    };
  }

  // input: { down: 是否按住, dx: 這一步手的橫移（像素，往右為正）}
  function stepString(s, dt, input) {
    if (s.failed || s.done) return s;
    var P = TUNING.string, down = !!(input && input.down), dx = (input && input.dx) || 0;
    s.t += dt;
    var k = 0.6 + P.tensionGain * s.tension;
    var acc = (Math.sin(s.t * 1.9 + s.wavePhase) * P.driftWave + (s.rng() - 0.5) * P.driftNoise) * k;
    if (down) {
      s.driftVel += acc * dt;
      s.driftVel *= Math.pow(P.damping, dt * 60);
      s.drift += s.driftVel * dt;
      s.hand += dx / P.pxPerUnit;               // 手往右，指針往左
      s.tension = Math.min(1, s.tension + dt / P.fillTime);
    } else {
      // 放手：弓慢慢彈直，指針回中
      s.driftVel *= Math.pow(0.9, dt * 60);
      var target = s.hand;
      s.drift += (target - s.drift) * Math.min(1, P.recenter * dt);
      s.tension = Math.max(0, s.tension - dt * P.decay);
    }
    s.needle = clamp(s.drift - s.hand, -1.2, 1.2);
    s.drift = s.needle + s.hand;                // 撞到邊就停住
    if (Math.abs(s.needle) >= 1.2) s.driftVel *= -0.3;

    if (down && Math.abs(s.needle) > P.zone) {
      s.outTime += dt;
      if (s.outTime > P.outLimit) s.failed = true;
    } else {
      s.outTime = Math.max(0, s.outTime - dt * 2);
    }
    if (!s.failed && s.tension >= 1) s.done = true;
    return s;
  }

  // ---------------------------------------------------------------- 拉弓與手晃
  function createDrawState(rng) {
    rng = rng || Math.random;
    return {
      drawing: false, power: 0, fullTime: 0, t: 0,
      phLow: rng() * 100, phHigh: rng() * 100,
      noise: [createNoise(rng), createNoise(rng), createNoise(rng), createNoise(rng),
              createNoise(rng), createNoise(rng), createNoise(rng), createNoise(rng)],
      amp: TUNING.draw.ampRest, tremble: 0,
      sway: { yaw: 0, pitch: 0, x: 0, y: 0 },
      stage: 'idle'
    };
  }

  // 這一刻的晃動幅度（弧度）與發抖成分
  function swayAmplitude(drawing, power, fullTime, fatigue) {
    var D = TUNING.draw;
    if (!drawing) return { amp: D.ampRest, tremble: 0, stage: 'idle' };
    if (power < 1) return { amp: D.ampDraw, tremble: 0, stage: 'drawing' };
    if (fullTime < D.settle) {
      var u = fullTime / D.settle;
      return { amp: D.ampDraw + (D.ampSteady - D.ampDraw) * u, tremble: 0, stage: 'settling' };
    }
    if (fullTime < D.steadyEnd || !fatigue) return { amp: D.ampSteady, tremble: 0, stage: 'steady' };
    var extra = Math.min(D.ampMax - D.ampSteady, D.fatigueRate * (fullTime - D.steadyEnd));
    return { amp: D.ampSteady + extra * 0.5, tremble: extra, stage: 'tremble' };
  }

  // input: { down, fatigue }
  function stepDraw(s, dt, input) {
    var D = TUNING.draw, down = !!(input && input.down), fatigue = !input || input.fatigue !== false;
    s.t += dt;
    if (down) {
      if (!s.drawing) { s.drawing = true; s.power = 0; s.fullTime = 0; }
      s.power = Math.min(1, s.power + dt / D.fillTime);
      if (s.power >= 1) s.fullTime += dt;
    } else if (s.drawing) {
      s.drawing = false; s.power = 0; s.fullTime = 0;
    }
    var a = swayAmplitude(s.drawing, s.power, s.fullTime, fatigue);
    s.amp = a.amp; s.tremble = a.tremble; s.stage = a.stage;
    s.phLow += dt * D.freqLow; s.phHigh += dt * D.freqHigh;
    var n = s.noise, L = D.lever;
    function ch(i) { return a.amp * n[i](s.phLow) + a.tremble * n[i + 4](s.phHigh); }
    s.sway.yaw = ch(0); s.sway.pitch = ch(1);
    s.sway.x = ch(2) * L; s.sway.y = ch(3) * L;
    return s;
  }

  // 放手：回傳是否射出；狀態歸零
  function releaseDraw(s) {
    var out = { fire: s.drawing && s.power >= TUNING.minFirePower, power: s.power,
                sway: { yaw: s.sway.yaw, pitch: s.sway.pitch, x: s.sway.x, y: s.sway.y } };
    s.drawing = false; s.power = 0; s.fullTime = 0;
    return out;
  }

  // ---------------------------------------------------------------- 彈道
  function speed(power) {
    var p = clamp(power, 0, 1);
    return TUNING.speedMin + (TUNING.speedMax - TUNING.speedMin) * p * p;
  }

  function aimDir(yaw, pitch) {
    var cp = Math.cos(pitch);
    return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  }

  // aim: { yaw, pitch, power, sway? {yaw,pitch,x,y} }
  function makeShot(aim) {
    var sw = aim.sway || { yaw: 0, pitch: 0, x: 0, y: 0 };
    var d = aimDir(aim.yaw + (sw.yaw || 0), aim.pitch + (sw.pitch || 0)), v = speed(aim.power);
    return {
      origin: { x: sw.x || 0, y: TUNING.shootHeight + (sw.y || 0), z: 0 },
      vel: { x: d.x * v, y: d.y * v, z: d.z * v },
      power: aim.power
    };
  }

  function positionAt(shot, t) {
    var o = shot.origin, v = shot.vel, g = TUNING.gravity;
    return { x: o.x + v.x * t, y: o.y + v.y * t - 0.5 * g * t * t, z: o.z + v.z * t };
  }

  function velocityAt(shot, t) {
    return { x: shot.vel.x, y: shot.vel.y - TUNING.gravity * t, z: shot.vel.z };
  }

  // 箭落地的時間
  function floorTime(shot) {
    var g = TUNING.gravity, a = -0.5 * g, b = shot.vel.y, c = shot.origin.y;
    return (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }

  // 結果：{ win, passed, events:[{axe,t,dx,dy}], stop:{kind:'hit'|'wide'|'short'|'door', axe, dir, t, pos}, endT }
  function simulate(shot, difficulty) {
    var r = holeRadius(difficulty), H = TUNING.shootHeight, events = [];
    var tf = floorTime(shot), vz = shot.vel.z;
    for (var i = 0; i < TUNING.axeCount; i++) {
      var t = vz < 0 ? (axeZ(i) - shot.origin.z) / vz : Infinity;
      if (tf < t) {
        return { win: false, passed: i, events: events, endT: tf, power: shot.power,
                 stop: { kind: 'short', axe: i, dir: 'low', t: tf, pos: positionAt(shot, tf) } };
      }
      var p = positionAt(shot, t), dx = p.x, dy = p.y - H;
      if (dx * dx + dy * dy <= r * r) { events.push({ axe: i, t: t, dx: dx, dy: dy }); continue; }
      var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'high' : 'low');
      var wide = Math.abs(dx) > TUNING.plateHalf || Math.abs(dy) > TUNING.plateHalf;
      if (wide && dir === 'low') {
        // 從斧頭下方沉下去：算落地
        return { win: false, passed: i, events: events, endT: tf, power: shot.power,
                 stop: { kind: 'short', axe: i, dir: dir, t: tf, pos: positionAt(shot, tf) } };
      }
      if (wide) {
        // 從旁邊飛過：繼續飛到地板或門
        var td = vz < 0 ? (TUNING.doorZ - shot.origin.z) / vz : Infinity;
        var tEnd = Math.min(tf, td);
        return { win: false, passed: i, events: events, endT: tEnd, power: shot.power,
                 stop: { kind: 'wide', axe: i, dir: dir, t: t, pos: p, dx: dx, dy: dy } };
      }
      return { win: false, passed: i, events: events, endT: t, power: shot.power,
               stop: { kind: 'hit', axe: i, dir: dir, t: t, pos: p, dx: dx, dy: dy } };
    }
    var tDoor = (TUNING.doorZ - shot.origin.z) / vz;
    var end = Math.min(tf, tDoor);
    return { win: true, passed: TUNING.axeCount, events: events, endT: end, power: shot.power,
             stop: { kind: 'door', axe: TUNING.axeCount, t: end, pos: positionAt(shot, end) } };
  }

  function describe(res) {
    var s = res.stop, n = res.passed;
    if (res.win) return '箭穿過全部十二把斧頭的孔，一把也沒碰到，直飛出門外。';
    if (s.kind === 'short') {
      var why = res.power !== undefined && res.power < 0.8 ? '弓沒拉滿，' : '';
      return n === 0 ? why + '箭往下沉，還沒穿過第一把斧頭就落地了。'
        : '穿過 ' + n + ' 個孔，' + why + '箭往下沉，沒能穿過第 ' + (n + 1) + ' 把斧頭（偏低），落在地上。';
    }
    var w = DIR_LABEL[s.dir];
    if (s.kind === 'wide') return n === 0 ? '箭從第一把斧頭旁邊飛過（' + w + '）。'
      : '穿過 ' + n + ' 個孔，從第 ' + (n + 1) + ' 把斧頭旁邊飛過（' + w + '）。';
    return n === 0 ? '箭打在第一把斧頭上（' + w + '）。'
      : '穿過 ' + n + ' 個孔，撞在第 ' + (n + 1) + ' 把斧頭上（' + w + '）。';
  }

  // ---------------------------------------------------------------- 解算（測試與除錯用）
  // 找出能穿過全部十二孔的瞄準窗：先掃 pitch（yaw 固定），再在中間 pitch 掃 yaw。
  function solveWindow(power, difficulty, opts) {
    opts = opts || {};
    var yaw0 = opts.yaw || 0, sway = opts.sway, step = opts.step || 0.00002;
    var lo = opts.pitchFrom !== undefined ? opts.pitchFrom : -0.05, hi = opts.pitchTo !== undefined ? opts.pitchTo : 0.12;
    function ok(yaw, pitch) {
      return simulate(makeShot({ yaw: yaw, pitch: pitch, power: power, sway: sway }), difficulty).win;
    }
    var pMin = null, pMax = null;
    for (var p = lo; p <= hi; p += step) {
      if (ok(yaw0, p)) { if (pMin === null) pMin = p; pMax = p; }
      else if (pMin !== null) break;
    }
    if (pMin === null) return null;
    var pMid = (pMin + pMax) / 2, yMin = null, yMax = null;
    for (var y = -0.03; y <= 0.03; y += step) {
      if (ok(y, pMid)) { if (yMin === null) yMin = y; yMax = y; }
      else if (yMin !== null) break;
    }
    return { pitchMin: pMin, pitchMax: pMax, pitchMid: pMid,
             yawMin: yMin, yawMax: yMax, yawMid: (yMin + yMax) / 2 };
  }

  return {
    TUNING: TUNING, DIR_LABEL: DIR_LABEL,
    createRng: createRng, createNoise: createNoise, clamp: clamp,
    holeRadius: holeRadius, axeZ: axeZ, axePositions: axePositions,
    createStringState: createStringState, stepString: stepString,
    createDrawState: createDrawState, stepDraw: stepDraw, releaseDraw: releaseDraw, swayAmplitude: swayAmplitude,
    speed: speed, aimDir: aimDir, makeShot: makeShot, positionAt: positionAt, velocityAt: velocityAt,
    floorTime: floorTime, simulate: simulate, describe: describe, solveWindow: solveWindow
  };
}));
