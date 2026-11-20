/* 雙盲洞穴・網頁一間房：規則核心（不碰畫面與聲音，瀏覽器與 Node 都能載入）。
 * 座標：公尺；x 向右、y 向下（俯視圖）。朝向 a：弧度，0＝朝右（東），-π/2＝朝上（北）。
 * 這一間房只回答一個問題：只靠聲音方向，玩家能不能在全黑畫面找到出口。
 * 出處：獨眼巨人洞穴【經典】；海風從洞口灌進來、滴水當地標【改編】。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BlindCave = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 房間：20×14 公尺。起點左下、出口右上，巨人睡在正中間，直線走過去一定會吵醒他。
  var LEVEL = {
    w: 20, h: 14,
    start: { x: 2, y: 12, a: -Math.PI / 2 },
    exit: { x: 19.4, y: 3, r: 1.0 },          // 洞口：海風浪聲的位置；走進 r 公尺內＝過關
    giant: { x: 11, y: 7 },                   // 巨人鼾聲的位置
    drip: { x: 5, y: 2.5 },                   // 滴水：固定地標，不影響勝負
    rocks: [                                  // 擋路的岩柱（長方形）
      { x: 7, y: 9, w: 2, h: 5 },
      { x: 13, y: 0, w: 2, h: 4 }
    ]
  };

  // 可在試驗場即時調的常數
  function defaultParams() {
    return {
      speed: 2.0,          // 走路速度（公尺／秒）
      turnSpeed: 2.1,      // 轉身速度（弧度／秒，約 120 度）
      radius: 0.3,         // 玩家身體半徑
      wake: 2.2,           // 巨人醒來距離：走進這個距離就失敗
      stir: 4.0,           // 巨人翻身距離：鼾聲變急、多一聲鼻哼，當作警告
      frontBack: true,     // 前後音色：背後的聲音變悶
      fbDark: 1000,        // 正後方的低通截止頻率（Hz）
      focusDb: 4,          // 正對出口（±25 度）時浪聲加大幾 dB
      focusCone: 25        // 「正對」的角度範圍（度）
    };
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  function collides(L, x, y, r) {
    if (x < r || y < r || x > L.w - r || y > L.h - r) return true;
    for (var i = 0; i < L.rocks.length; i++) {
      var b = L.rocks[i];
      var cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
    }
    return false;
  }

  function createState(L) {
    L = L || LEVEL;
    return {
      x: L.start.x, y: L.start.y, a: L.start.a,
      t: 0, phase: 'ready',          // ready → play → win／fail
      bumps: 0, blocked: false,
      minGiant: dist(L.start.x, L.start.y, L.giant.x, L.giant.y),
      stirred: false,
      trail: [],
      events: []                     // 這一步發生的事：bump／stir／wake／win
    };
  }

  // 聲源相對玩家朝向的角度：0＝正前方，正值＝在右邊，±π＝正後方
  function relAngle(s, px, py) {
    return wrap(Math.atan2(py - s.y, px - s.x) - s.a);
  }

  // input：{ fwd: -1..1（前後）, strafe: -1..1（右正）, turn: -1..1（右轉正） }
  function step(L, s, input, dt, P) {
    s.events.length = 0;
    if (s.phase !== 'play') return s;
    s.t += dt;
    s.a = wrap(s.a + clamp(input.turn || 0, -1, 1) * P.turnSpeed * dt);
    var fx = Math.cos(s.a), fy = Math.sin(s.a);
    var rx = -fy, ry = fx;                       // 右手方向（y 向下時）
    var f = clamp(input.fwd || 0, -1, 1), st = clamp(input.strafe || 0, -1, 1);
    var mx = fx * f + rx * st, my = fy * f + ry * st;
    var m = Math.hypot(mx, my);
    var blocked = false;
    if (m > 1e-6) {
      if (m > 1) { mx /= m; my /= m; }
      var nx = s.x + mx * P.speed * dt, ny = s.y + my * P.speed * dt;
      if (!collides(L, nx, s.y, P.radius)) s.x = nx; else blocked = true;
      if (!collides(L, s.x, ny, P.radius)) s.y = ny; else blocked = true;
      if (blocked && !s.blocked) {               // 撞上的那一下才算一次
        s.bumps++;
        var k = 1 / Math.hypot(mx, my);
        s.events.push({ type: 'bump', x: s.x + mx * k * 0.5, y: s.y + my * k * 0.5 });
      }
    }
    s.blocked = blocked;
    if (!s.trail.length || dist(s.x, s.y, s.trail[s.trail.length - 1][0], s.trail[s.trail.length - 1][1]) > 0.25) {
      s.trail.push([+s.x.toFixed(2), +s.y.toFixed(2)]);
      if (s.trail.length > 600) s.trail.shift();
    }
    var dG = dist(s.x, s.y, L.giant.x, L.giant.y);
    if (dG < s.minGiant) s.minGiant = dG;
    var nowStir = dG < P.stir;
    if (nowStir && !s.stirred) s.events.push({ type: 'stir' });
    s.stirred = nowStir;
    if (dG < P.wake) { s.phase = 'fail'; s.events.push({ type: 'wake' }); return s; }
    if (dist(s.x, s.y, L.exit.x, L.exit.y) < L.exit.r) { s.phase = 'win'; s.events.push({ type: 'win' }); }
    return s;
  }

  // 前後音色：正前方 16 kHz（原音），正後方 P.fbDark Hz（悶），中間用對數內插
  function toneCutoff(rel, P) {
    if (!P.frontBack) return 16000;
    var front = (1 + Math.cos(rel)) / 2;
    return Math.exp(Math.log(P.fbDark) + (Math.log(16000) - Math.log(P.fbDark)) * front);
  }

  // 方位的白話：「右前方 30 度」
  function bearingText(rel) {
    var d = Math.round(rel * 180 / Math.PI);
    var ad = Math.abs(d);
    if (ad <= 10) return '正前方';
    if (ad >= 170) return '正後方';
    return (d > 0 ? '右' : '左') + (ad < 80 ? '前方 ' : ad > 100 ? '後方 ' : '邊 ') + ad + ' 度';
  }

  return {
    LEVEL: LEVEL, defaultParams: defaultParams, createState: createState, step: step,
    collides: collides, relAngle: relAngle, toneCutoff: toneCutoff, bearingText: bearingText,
    dist: dist, wrap: wrap
  };
});
