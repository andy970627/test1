// 拍帶：各頁共用的拍點列（docs/design/2026-11-15-ui-design-system.md 第 4 節，方向 A「夜城訊號」唯一會自己動的元素）。
// 拍點從右往左滑，碰到左邊 20% 那條直線就是一拍；踩得上的拍（音量 ≥ 規則的 MASK_GAIN）用海青大點，其他拍用淡小點；
// 每一輪開頭那一擊（所有鼓同時落下、最響的一擊）畫成一道直條，落到直線上時整條亮一下。
// 拍點照規則算：頁面有載 troy-prologue/risset.js（全域 RissetRules）就用 RissetRules.beatsBetween（循環固定 T.CYCLE 秒）；
//   沒載到就用同一條公式（每層第 n 拍在相位 log2(1 + n / M)）的簡化版，看起來一樣、只是不讀規則常數。
// 「減少動態效果」（prefers-reduced-motion）開著時不動：只畫一張靜止的拍點圖。
// 用法：
//   OdysseyBeat.mount(元素, { source, rules, still, label })   在元素裡放一張畫布並開始畫；回傳 { stop(), draw() }
//     still：true＝只畫一張靜止的圖（和「減少動態效果」一樣）
//     source(現在秒數) → { now, beats: [{ t, strong, hit }] }：自己提供拍點（例如跟真的音訊時鐘同步）；不給就用規則
//   OdysseyBeat.draw(ctx, x, y, w, h, frame, opts)    畫在別人的畫布上（遊戲 HUD 用）；frame 同 source 的回傳，另可帶 flash（0～1）
//   OdysseyBeat.rulesSource(rules)                   規則拍點來源（不給 rules 就找全域 RissetRules）
(function (g) {
  'use strict';
  var PAST = 0.6, FUT = 2.4, LINE = PAST / (PAST + FUT);    // 直線在 20%，和敲暗號試驗場的拍點條相同

  function css(name, fb) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; }
  }
  function colors() {
    return { beat: css('--beat', '#6FB3A6'), parchment: css('--parchment', '#F2ECDD'), stone: css('--stone', '#232838'), muted: 'rgba(242, 236, 221, .45)' };
  }

  // ---------- 拍點來源 ----------
  function rulesSource(rules) {
    var R = rules || g.RissetRules;
    var t0 = (g.performance ? performance.now() : Date.now()) / 1000;
    if (R && typeof R.beatsBetween === 'function' && R.T) {
      var K = R.T, cyc = K.CYCLE || 10, mask = K.MASK_GAIN != null ? K.MASK_GAIN : 0.3;
      var game = { T: K, cycle: { anchor: { t: 0, p: 0, T: cyc, index: 0, start: 0 } }, hunted: false, panic: null };
      return function (nowAbs) {
        var now = nowAbs - t0 + 0.4;               // 開頭 0.4 秒後就是第一擊，一打開就看得到
        var raw = [];
        try { raw = R.beatsBetween(now - PAST - 0.5, now + FUT + 0.5, game, { includeBlind: true }); } catch (e) { raw = []; }
        var out = [], hits = {};
        for (var i = 0; i < raw.length; i++) {
          var b = raw[i];
          if (b.n === 0) { var key = Math.round(b.t * 1000); if (hits[key]) continue; hits[key] = 1; out.push({ t: b.t, strong: true, hit: true }); continue; }
          out.push({ t: b.t, strong: b.gain >= mask, hit: false });
        }
        return { now: now, beats: out };
      };
    }
    // 備援：同一條公式的簡化版（兩層，循環 10 秒）
    return function (nowAbs) {
      var now = nowAbs - t0 + 0.4, out = [], C = 10, a = now - PAST - 0.5, b = now + FUT + 0.5;
      for (var c = Math.floor(a / C); c <= Math.floor(b / C); c++) {
        out.push({ t: c * C, strong: true, hit: true });
        [[6, true], [12, false]].forEach(function (L) {
          for (var n = 1; n < L[0]; n++) { var t = (c + Math.log(1 + n / L[0]) / Math.LN2) * C; if (t >= a && t < b) out.push({ t: t, strong: L[1], hit: false }); }
        });
      }
      return { now: now, beats: out };
    };
  }

  // ---------- 畫 ----------
  function draw(c, x, y, w, h, frame, opts) {
    opts = opts || {};
    var col = opts.colors || colors(), past = opts.past || PAST, fut = opts.fut || FUT;
    var now = frame.now, pps = w / (past + fut), nx = x + past * pps, my = y + h / 2;
    // 最響一擊剛過直線：整條亮一下（0.45 秒淡掉）
    var flash = frame.flash;
    if (flash == null) {
      flash = 0;
      for (var i = 0; i < frame.beats.length; i++) { var d = now - frame.beats[i].t; if (frame.beats[i].hit && d >= 0 && d < 0.45) flash = Math.max(flash, 1 - d / 0.45); }
    }
    if (opts.bg !== false) { c.fillStyle = col.stone; c.globalAlpha = opts.bgAlpha != null ? opts.bgAlpha : 0.6; c.fillRect(x, y, w, h); c.globalAlpha = 1; }
    if (flash > 0) { c.fillStyle = col.parchment; c.globalAlpha = 0.22 * flash; c.fillRect(x, y, w, h); c.globalAlpha = 1; }
    // 判定直線
    c.fillStyle = col.parchment; c.globalAlpha = 0.55 + 0.45 * flash; c.fillRect(nx - 1, y + 3, 2, h - 6); c.globalAlpha = 1;
    for (var j = 0; j < frame.beats.length; j++) {
      var b = frame.beats[j], bx = nx + (b.t - now) * pps;
      if (bx < x - 6 || bx > x + w + 6) continue;
      var gone = b.t < now - 0.02;
      c.globalAlpha = gone ? 0.3 : 1;
      if (b.hit) { c.fillStyle = col.parchment; c.fillRect(bx - 1.5, y + 3, 3, h - 6); }
      else if (b.strong) { c.fillStyle = col.beat; c.beginPath(); c.arc(bx, my, Math.min(5, h * 0.16), 0, Math.PI * 2); c.fill(); }
      else { c.fillStyle = col.muted; c.beginPath(); c.arc(bx, my, Math.min(2.5, h * 0.08), 0, Math.PI * 2); c.fill(); }
    }
    c.globalAlpha = 1;
  }

  function reducedPref() { try { return g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  function mount(el, opts) {
    opts = opts || {};
    var reduced = function () { return !!opts.still || reducedPref(); };   // still：這一頁固定不動（例如試聽頁，拍帶沒跟頁面的聲音同步，動了會誤導）
    if (!el) return { stop: function () {}, draw: function () {} };
    el.classList.add('beatstrip');
    if (!el.hasAttribute('role')) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', opts.label || '拍帶：拍點從右往左滑，碰到直線就是一拍'); }
    var cv = document.createElement('canvas'); el.appendChild(cv);
    var src = opts.source || rulesSource(opts.rules), raf = 0, alive = true, frozenAt = null;
    function frame() {
      var dpr = Math.min(2, g.devicePixelRatio || 1), W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      var nowAbs = (g.performance ? performance.now() : Date.now()) / 1000;
      // 靜止圖：最響一擊停在直線右邊一點，看得出「它正要來」
      if (reduced()) { if (frozenAt == null) frozenAt = nowAbs - 0.55; nowAbs = frozenAt; }
      var f = src(nowAbs);
      if (reduced()) f.flash = 0;
      draw(c, 0, 0, W, H, f, { bg: opts.bg, bgAlpha: opts.bgAlpha });
    }
    function loop() {
      if (!alive || !el.isConnected) return;
      frame();
      if (!reduced()) raf = g.requestAnimationFrame(loop);
    }
    loop();
    try {   // 中途切換「減少動態效果」：重新開始或停住
      var mq = g.matchMedia('(prefers-reduced-motion: reduce)');
      var onChange = function () { frozenAt = null; g.cancelAnimationFrame(raf); loop(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    } catch (e) {}
    g.addEventListener('resize', function () { if (reduced()) frame(); });
    return { stop: function () { alive = false; g.cancelAnimationFrame(raf); }, draw: frame };
  }

  g.OdysseyBeat = { mount: mount, draw: draw, rulesSource: rulesSource, PAST: PAST, FUT: FUT, LINE: LINE };
})(typeof window !== 'undefined' ? window : this);
