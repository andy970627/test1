/*
 * 《回家的路》奧德賽連作：跨章存檔與換算規則（純邏輯）
 *
 * 不碰 DOM；只有 load / save 透過傳進來的 storage（有 getItem / setItem 的物件，例如 localStorage）。
 * 之後可以一對一翻成 C#。瀏覽器：全域 OdysseySeries；Node：module.exports。
 * 依據：docs/design/2026-11-05-fusion-web-plan.md 第 3、4 節。
 *
 * 出處：
 *   wrath 射箭 2【電影：出洞後射箭報復，招來追殺】、喊名 1【原典：波塞頓記住了名字】、默默離開 0【改編】
 *   years = 7 + wrath（在卡呂普索島上 7 年【原典】，多出來的年數【改編】）
 *   乞丐難度、比箭晃動倍率【改編】
 *   岸邊每名同伴 1/3 被岩石砸死（主線規格第 20 節 C）【改編】
 *   同伴名字：歐律羅科斯、波利忒斯、埃爾佩諾爾、珀里墨得斯、歐律巴忒斯【原典】；
 *            克洛墨尼俄斯、安提瑪科斯、塞翁【改編：借名】；電影裡的同伴名字待確認
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OdysseySeries = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'odyssey-series-v1';
  var STEPS = ['cave', 'shore', 'ogygia', 'beggar-gate', 'beggar-hall', 'bow', 'ending'];
  var SHORE = ['shoot', 'name', 'leave'];
  var KNOW = ['unknown', 'suspects', 'knows'];
  var CREW = ['歐律羅科斯', '波利忒斯', '埃爾佩諾爾', '珀里墨得斯', '歐律巴忒斯', '克洛墨尼俄斯', '安提瑪科斯', '塞翁'];
  var CREW_DEFAULT = 6;
  var CREW_MAX = CREW.length;
  var SHORE_DEATH = 1 / 3;
  var SHORE_TIME = 8; // 秒；沒選就是默默離開

  function clampInt(v, lo, hi, def) {
    v = Math.round(Number(v));
    if (!Number.isFinite(v)) return def;
    return Math.max(lo, Math.min(hi, v));
  }

  // ---------------------------------------------------------------- 換算
  function wrathFromShore(choice) {
    return choice === 'shoot' ? 2 : choice === 'name' ? 1 : 0;
  }
  function yearsFromWrath(wrath) {
    return 7 + clampInt(wrath, 0, 2, 0);
  }
  /** 乞丐章要套的倍率：每多 1 年，回頭看的機率 ×1.12、多 1 個會丟東西的人。 */
  function beggarTuning(years) {
    var extra = clampInt(years, 7, 9, 7) - 7;
    return { glanceMul: Math.pow(1.12, extra), extraThrowers: extra };
  }
  /** 比箭晃動倍率：帳記得越多，手越穩。 */
  function bowSwayMul(ledger) {
    var l = Number(ledger);
    if (!Number.isFinite(l) || l < 0) l = 0;
    return Math.max(0.6, 1 - 0.04 * l);
  }
  function crewNames(n) {
    n = clampInt(n, 0, CREW_MAX, CREW_DEFAULT);
    return CREW.slice(0, n);
  }
  /** 岸邊：射箭或喊名時，每名帶出的同伴擲一次。回傳失去的名字（照名單順序）。 */
  function resolveShore(choice, crewOut, rng) {
    if (choice !== 'shoot' && choice !== 'name') return [];
    rng = rng || Math.random;
    var lost = [];
    crewNames(crewOut).forEach(function (name) { if (rng() < SHORE_DEATH) lost.push(name); });
    return lost;
  }
  function createRng(seed) { // mulberry32
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- 存檔
  function fresh() {
    return {
      step: 'cave',
      crewOut: CREW_DEFAULT,
      crewLost: [],
      shore: null,
      wrath: 0,
      years: 7,
      ledger: 0,
      knowers: { tele: 'unknown', eum: 'unknown', pen: 'unknown' },
      bow: null
    };
  }
  /** 把任何東西整理成合法存檔（壞掉的欄位回到預設）。 */
  function normalize(raw) {
    var s = fresh();
    if (!raw || typeof raw !== 'object') return s;
    if (STEPS.indexOf(raw.step) >= 0) s.step = raw.step;
    s.crewOut = clampInt(raw.crewOut, 0, CREW_MAX, CREW_DEFAULT);
    if (Array.isArray(raw.crewLost)) s.crewLost = raw.crewLost.filter(function (x) { return typeof x === 'string'; }).slice(0, CREW_MAX);
    if (SHORE.indexOf(raw.shore) >= 0) s.shore = raw.shore;
    s.wrath = s.shore ? wrathFromShore(s.shore) : clampInt(raw.wrath, 0, 2, 0);
    s.years = s.shore ? yearsFromWrath(s.wrath) : clampInt(raw.years, 7, 9, yearsFromWrath(s.wrath));
    s.ledger = clampInt(raw.ledger, 0, 999, 0);
    if (raw.knowers && typeof raw.knowers === 'object') {
      ['tele', 'eum', 'pen'].forEach(function (k) { if (KNOW.indexOf(raw.knowers[k]) >= 0) s.knowers[k] = raw.knowers[k]; });
    }
    if (raw.bow && typeof raw.bow === 'object') {
      s.bow = { win: !!raw.bow.win, passed: clampInt(raw.bow.passed, 0, 12, 0) };
    }
    return s;
  }
  function defaultStorage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }
  function load(storage) {
    storage = storage || defaultStorage();
    try {
      var txt = storage && storage.getItem(KEY);
      return txt ? normalize(JSON.parse(txt)) : fresh();
    } catch (e) { return fresh(); }
  }
  function save(storage, s) {
    storage = storage || defaultStorage();
    var n = normalize(s);
    try { if (storage) storage.setItem(KEY, JSON.stringify(n)); return true; } catch (e) { return false; }
  }
  function hasSave(storage) {
    storage = storage || defaultStorage();
    try { return !!(storage && storage.getItem(KEY)); } catch (e) { return false; }
  }
  /** 回傳新存檔：設定 step，合併 patch，重算 wrath / years。不改原物件。 */
  function advance(s, step, patch) {
    if (STEPS.indexOf(step) < 0) throw new Error('未知的步驟：' + step);
    var n = JSON.parse(JSON.stringify(normalize(s)));
    if (patch) for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) n[k] = patch[k];
    n.step = step;
    return normalize(n);
  }
  function nextStep(step) {
    var i = STEPS.indexOf(step);
    return i < 0 || i === STEPS.length - 1 ? 'ending' : STEPS[i + 1];
  }
  /** 依步驟給網址；root 是從目前這頁到系列根目錄的相對路徑（首頁 ''，子頁 '../'）。 */
  function nextUrl(step, root) {
    root = root == null ? '' : String(root);
    if (root && root.charAt(root.length - 1) !== '/') root += '/';
    switch (step) {
      case 'cave': return root + 'index.html#cave';
      case 'shore': return root + 'shore/index.html';
      case 'ogygia': return root + 'ogygia/index.html';
      case 'beggar-gate': return root + 'beggar/index.html?series=1&seg=gate';
      case 'beggar-hall': return root + 'beggar/index.html?series=1&seg=hall';
      case 'bow': return root + 'bow/index.html?series=1';
      case 'ending': return root + 'ending/index.html';
      default: return root + 'index.html';
    }
  }

  return {
    KEY: KEY, STEPS: STEPS, CREW: CREW, CREW_DEFAULT: CREW_DEFAULT, SHORE_DEATH: SHORE_DEATH, SHORE_TIME: SHORE_TIME,
    wrathFromShore: wrathFromShore, yearsFromWrath: yearsFromWrath, beggarTuning: beggarTuning, bowSwayMul: bowSwayMul,
    crewNames: crewNames, resolveShore: resolveShore, createRng: createRng,
    fresh: fresh, normalize: normalize, load: load, save: save, hasSave: hasSave,
    advance: advance, nextStep: nextStep, nextUrl: nextUrl
  };
}));
