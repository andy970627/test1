// 各原型共用的「回總首頁」導覽。
// 用法：頁面用相對路徑載入本檔（例如 ../nav.js），再呼叫 OdysseyNav.goHub()。
// 總首頁＝和本檔同一層的 index.html，所以 repo、本機伺服器、itch.io 打包版都通。
// 在 claude.ai 試玩頁（沙盒裡沒有相鄰檔案）時，改去總首頁的試玩網址 HUB_ARTIFACT。
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

  g.OdysseyNav = {
    hubUrl: hubUrl,
    hasHub: function () { return !!hubUrl(); },
    goHub: function () { return go(hubUrl()); },
  };
})(typeof window !== 'undefined' ? window : this);
