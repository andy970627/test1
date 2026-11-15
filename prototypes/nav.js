// 各原型共用的導覽：「回總首頁」「回試玩切換台」，以及試驗場與試聽頁旁邊的「說明」側欄。
// 用法：頁面用相對路徑載入本檔（例如 ../nav.js），再呼叫 OdysseyNav.goHub()／OdysseyNav.mount({...})。
// 總首頁＝和本檔同一層的 index.html；試玩切換台＝同一層的 switch.html（本機用），所以 repo、本機伺服器都通。
// 在 claude.ai 試玩頁（沙盒裡沒有相鄰檔案）時，總首頁改去 HUB_ARTIFACT；試玩切換台沒有，按鈕隱藏。
// 說明側欄只用到本檔，不需要其他檔案；顏色與字體照設計系統「Odyssey 音樂系列」的 tokens。
(function (g) {
  'use strict';
  // 總首頁發布成 claude.ai 試玩頁後填入網址；空字串＝沒有，按鈕會隱藏
  var HUB_ARTIFACT = '';

  var me = document.currentScript;
  var base = me && me.src ? me.src : '';

  function sandboxed() {
    var h = location.hostname || '';
    return /claude\.ai$|claudeusercontent\.com$/.test(h) || location.protocol === 'about:' || location.protocol === 'blob:';
  }

  function hubUrl() {
    if (sandboxed()) return HUB_ARTIFACT || '';
    try { return new URL('index.html', base || location.href).href; } catch (e) { return ''; }
  }
  function switchUrl() {
    if (sandboxed()) return '';
    try { return new URL('switch.html', base || location.href).href; } catch (e) { return ''; }
  }

  function go(url) {
    if (!url) return false;
    if (sandboxed()) {
      // 試玩頁在框架裡：先試著換掉整個分頁，不行就開新分頁
      try { g.top.location.href = url; return true; } catch (e) {}
      g.open(url, '_blank', 'noopener');
      return true;
    }
    location.href = url;
    return true;
  }

  // ---------- 設計系統 tokens（Odyssey 音樂系列，取自木馬之夜 :root） ----------
  var TOKENS = {
    night: '#07080c', panel: 'rgba(8, 9, 14, .82)', scrim: 'rgba(5, 6, 10, .9)', control: '#12131a', line: '#2a2c38',
    ash: '#d6cfc2', dim: '#8a8478', fire: '#f0a85a', onFire: '#1a1008', moon: '#9fb0d8', warn: '#e0b04a', blood: '#c23a2c',
    fontText: '"Noto Sans TC", "PingFang TC", system-ui, sans-serif', fontDisplay: '"Noto Serif TC", "Songti TC", serif', fontMono: 'ui-monospace, monospace'
  };

  var CSS = [
    '.odnav, .odnav * { box-sizing: border-box; }',
    '.odnav { font: 13px/1.6 ' + TOKENS.fontText + '; color: ' + TOKENS.ash + '; }',
    '.odnav a { color: ' + TOKENS.fire + '; }',
    '.odnav-switch { position: fixed; z-index: 9000; top: calc(10px + env(safe-area-inset-top, 0px)); right: calc(12px + env(safe-area-inset-right, 0px));',
    '  background: ' + TOKENS.panel + '; border: 1px solid ' + TOKENS.line + '; padding: 4px 10px; text-decoration: none; font-size: 12px; }',
    '.odnav-switch:hover, .odnav-switch:focus-visible { border-color: ' + TOKENS.fire + '; }',
    '.odnav-switch-inline { display: inline-block; align-self: flex-start; margin: 0 0 8px; font-size: 12px; text-decoration: none; border: 1px solid ' + TOKENS.line + '; padding: 3px 10px; background: ' + TOKENS.panel + '; }',
    '.odnav-switch-inline:hover, .odnav-switch-inline:focus-visible { border-color: ' + TOKENS.fire + '; }',
    '.odnav-tab { position: fixed; z-index: 9001; right: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; letter-spacing: .2em;',
    '  background: ' + TOKENS.panel + '; color: ' + TOKENS.fire + '; border: 1px solid ' + TOKENS.line + '; border-right: 0; padding: 12px 6px; cursor: pointer; font: 600 13px/1 ' + TOKENS.fontText + '; }',
    '.odnav-tab:hover, .odnav-tab:focus-visible { border-color: ' + TOKENS.fire + '; }',
    '.odnav-side { position: fixed; z-index: 9002; top: 0; right: 0; bottom: 0; width: min(340px, 92vw); overflow-y: auto; overscroll-behavior: contain;',
    '  background: ' + TOKENS.scrim + '; border-left: 1px solid ' + TOKENS.line + '; padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 24px 16px; }',
    '.odnav-side[hidden], .odnav-tab[hidden] { display: none; }',
    '.odnav-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }',
    '.odnav-head h2 { margin: 0; font: 900 18px/1.3 ' + TOKENS.fontDisplay + '; color: ' + TOKENS.fire + '; }',
    '.odnav-close { background: transparent; color: ' + TOKENS.dim + '; border: 1px solid ' + TOKENS.line + '; padding: 2px 8px; cursor: pointer; font: inherit; }',
    '.odnav-close:hover { color: ' + TOKENS.ash + '; border-color: ' + TOKENS.fire + '; }',
    '.odnav-links { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 0 0 10px; font-size: 12px; }',
    '.odnav-side h3 { margin: 14px 0 4px; font: 600 13px/1.4 ' + TOKENS.fontText + '; color: ' + TOKENS.fire + '; }',
    '.odnav-side ul, .odnav-side ol { margin: 0; padding-left: 18px; }',
    '.odnav-side li { margin: 2px 0; }',
    '.odnav-side dl { margin: 0; }',
    '.odnav-side dt { color: ' + TOKENS.moon + '; font: 12px/1.5 ' + TOKENS.fontMono + '; margin-top: 6px; }',
    '.odnav-side dd { margin: 0 0 0 10px; }',
    '.odnav-side .odnav-src { margin-top: 14px; color: ' + TOKENS.dim + '; font-size: 11px; }',
    '.odnav-side .odnav-key { color: ' + TOKENS.dim + '; font-size: 11px; }',
    // 手機：底部可展開的抽屜
    '@media (max-width: 700px) {',
    '  .odnav-tab { top: auto; bottom: calc(10px + var(--odnav-bottom, 0px) + env(safe-area-inset-bottom, 0px)); right: auto; left: calc(10px + env(safe-area-inset-left, 0px)); transform: none; writing-mode: horizontal-tb;',
    '    border: 1px solid ' + TOKENS.line + '; padding: 8px 12px; letter-spacing: .1em; }',
    '  .odnav-side { top: auto; left: 0; bottom: var(--odnav-bottom, 0px); width: auto; max-height: 62vh; border-left: 0; border-top: 1px solid ' + TOKENS.line + '; padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }',
        '}'
  ].join('\n');

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }

  /**
   * 在頁面上掛導覽：
   *   opts.switchLink：右上角固定一個「回試玩切換台」小連結（預設 true；遊戲頁畫面上已有按鈕的傳 false）
   *   opts.help：說明側欄內容 { title, brief: [[標籤, 內容]], what: [], watch: [], panel: [[字, 意思]], questions: [], src: [] }；沒有就不掛側欄
   *     brief 是開頭三行（測什麼／怎麼操作／看哪個數字，操作那行按鍵寫最前面），放在側欄最上面
   *   opts.open：側欄一開始打開（預設收起；使用者開關過就記住這一頁的選擇）
   *   opts.key：切換側欄的按鍵 code（例如 'KeyH'），在輸入框裡打字時不理
   *   opts.switchInto：把「回試玩切換台」放進這個元素的最前面（不浮在畫面上）；有它就不放右上角那個
   *   opts.mobileBottom：手機版（寬 700 以下）說明鈕與抽屜往上讓開幾像素（例如底部有觸控按鈕列）
   *   opts.id：記住開關狀態用的名字（預設用網址路徑＋?lab）
   * 回傳 { open(), close(), toggle(), isOpen() }。
   */
  function mount(opts) {
    opts = opts || {};
    style();
    var api = { open: function () {}, close: function () {}, toggle: function () {}, isOpen: function () { return false; } };
    var sw = switchUrl();
    if (opts.mobileBottom) document.documentElement.style.setProperty('--odnav-bottom', (+opts.mobileBottom || 0) + 'px');
    if (opts.switchInto && sw) {
      var ai = el('a', 'odnav odnav-switch-inline', '← 試玩切換台'); ai.href = sw;
      opts.switchInto.insertBefore(ai, opts.switchInto.firstChild);
    } else if (opts.switchLink !== false && sw) {
      var a = el('a', 'odnav odnav-switch', '← 試玩切換台'); a.href = sw; a.title = '回到本機的試玩切換台（switch.html）';
      document.body.appendChild(a);
    }
    var H = opts.help;
    if (!H) return api;
    var key = 'odnav.open.' + (opts.id || (location.pathname + (new URLSearchParams(location.search).get('lab') || '')));
    var tab = el('button', 'odnav odnav-tab', '說明'); tab.type = 'button'; tab.setAttribute('aria-expanded', 'false');
    var side = el('aside', 'odnav odnav-side'); side.hidden = true; side.setAttribute('aria-label', '說明');
    var head = el('div', 'odnav-head');
    head.appendChild(el('h2', null, H.title || '說明'));
    var close = el('button', 'odnav-close', '收起'); close.type = 'button'; head.appendChild(close);
    side.appendChild(head);
    var links = el('div', 'odnav-links');
    if (sw) { var l1 = el('a', null, '← 試玩切換台'); l1.href = sw; links.appendChild(l1); }
    var hu = hubUrl(); if (hu) { var l2 = el('a', null, '總首頁'); l2.href = hu; links.appendChild(l2); }
    if (opts.key) links.appendChild(el('span', 'odnav-key', '按 ' + opts.key.replace(/^Key/, '') + ' 開關這一欄'));
    if (links.childNodes.length) side.appendChild(links);
    function list(title, arr, ordered) {
      if (!arr || !arr.length) return;
      side.appendChild(el('h3', null, title));
      var ul = el(ordered ? 'ol' : 'ul');
      arr.forEach(function (t) { ul.appendChild(el('li', null, t)); });
      side.appendChild(ul);
    }
    if (H.brief && H.brief.length) {               // 開頭三行：測什麼、怎麼操作、看哪個數字
      side.appendChild(el('h3', null, '先看這三行'));
      var bd = el('dl', 'odnav-brief');
      H.brief.forEach(function (r) { bd.appendChild(el('dt', null, r[0])); bd.appendChild(el('dd', null, r[1])); });
      side.appendChild(bd);
    }
    list('這頁在試什麼', H.what);
    list('注意聽、注意看', H.watch);
    if (H.panel && H.panel.length) {
      side.appendChild(el('h3', null, '面板上的數字'));
      var dl = el('dl');
      H.panel.forEach(function (r) { dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); });
      side.appendChild(dl);
    }
    list('試玩題目', H.questions, true);
    if (H.src && H.src.length) side.appendChild(el('div', 'odnav-src', '出處：' + H.src.join('；')));
    document.body.appendChild(tab); document.body.appendChild(side);
    function set(on, remember) {
      side.hidden = !on; tab.hidden = on; tab.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (remember) store(key, on ? '1' : '0');
      if (typeof opts.onToggle === 'function') { try { opts.onToggle(on); } catch (e) {} }
    }
    tab.addEventListener('click', function () { set(true, true); });
    close.addEventListener('click', function () { set(false, true); });
    // 點側欄、按側欄的按鈕時，不要讓遊戲收到（例如鎖滑鼠、開火）
    ['mousedown', 'pointerdown', 'click', 'wheel'].forEach(function (t) { side.addEventListener(t, function (e) { e.stopPropagation(); }); tab.addEventListener(t, function (e) { e.stopPropagation(); }); });
    if (opts.key) g.addEventListener('keydown', function (e) {
      if (e.code !== opts.key || e.repeat) return;
      var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      set(side.hidden, true);
    });
    var saved = store(key);
    set(saved === '1' || (saved == null && !!opts.open), false);
    api.open = function () { set(true, true); }; api.close = function () { set(false, true); };
    api.toggle = function () { set(side.hidden, true); }; api.isOpen = function () { return !side.hidden; };
    return api;
  }

  g.OdysseyNav = {
    hubUrl: hubUrl,
    hasHub: function () { return !!hubUrl(); },
    goHub: function () { return go(hubUrl()); },
    switchUrl: switchUrl,
    hasSwitch: function () { return !!switchUrl(); },
    goSwitch: function () { return go(switchUrl()); },
    mount: mount,
    TOKENS: TOKENS
  };
})(typeof window !== 'undefined' ? window : this);
