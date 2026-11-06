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
 *   岸邊每名同伴 1/3 被岩石砸死（主線規格第 20 節 C；第一次擲骰存成 shoreRoll，重整沿用）【改編】
 *   同伴名字：歐律羅科斯、波利忒斯、埃爾佩諾爾、珀里墨得斯、歐律巴忒斯【原典】；
 *            克洛墨尼俄斯、安提瑪科斯、塞翁【改編：借名】；電影裡的同伴名字待確認
 *   同伴的腳步、聲音、說過的話、死前的話【改編】（波利忒斯最親近、埃爾佩諾爾最年輕【原典 第 10 卷】，
 *            歐律巴忒斯是傳令官【原典 第 19 卷】，珀里墨得斯幫忙扛木樁【原典 第 9 卷】）
 *   冥府（shore → underworld → ogygia）：docs/design/2026-11-06-underworld-concept.md
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OdysseySeries = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'odyssey-series-v1';
  var STEPS = ['cave', 'shore', 'underworld', 'ogygia', 'beggar-gate', 'beggar-hall', 'bow', 'ending'];
  var SHORE = ['shoot', 'name', 'leave'];
  var KNOW = ['unknown', 'suspects', 'knows'];
  var CREW = ['歐律羅科斯', '波利忒斯', '埃爾佩諾爾', '珀里墨得斯', '歐律巴忒斯', '克洛墨尼俄斯', '安提瑪科斯', '塞翁'];
  var CREW_DEFAULT = 6;
  var CREW_MAX = CREW.length;
  var SHORE_DEATH = 1 / 3;
  var SHORE_TIME = 8; // 秒；沒選就是默默離開

  // ---------------------------------------------------------------- 同伴的特徵【改編】
  // 岸邊點名時讓玩家看到、聽到；冥府只能拿這裡的東西當線索（同一份資料）。
  // 腳步：period＝一輪幾秒，beats＝一輪裡每一下的時間與聲音種類（聲音由 crew-voice.js 合成）
  var STEP_KINDS = {
    greaves: { label: '脛甲叮噹作響的腳步', period: 0.72, beats: [[0, 'ring']] },
    sandals: { label: '穩穩的皮涼鞋腳步', period: 0.6, beats: [[0, 'tap']] },
    quick: { label: '又輕又快的小跑步', period: 0.3, beats: [[0, 'soft']] },
    heavy: { label: '沉重的大步', period: 0.95, beats: [[0, 'thud']] },
    staff: { label: '一步一下拄杖聲', period: 0.8, beats: [[0, 'tap'], [0.4, 'knock']] },
    barefoot: { label: '赤腳踩沙的聲音', period: 0.66, beats: [[0, 'slap']] },
    limp: { label: '拖著一條腿的腳步', period: 1.0, beats: [[0, 'tap'], [0.28, 'drag']] },
    stagger: { label: '東倒西歪的腳步', period: 1.1, beats: [[0, 'tap'], [0.22, 'tap'], [0.7, 'soft']] }
  };
  var VOICE_KINDS = {
    grumble: '低聲嘟囔', hum: '哼著歌', pant: '喘著氣', grunt: '悶哼一聲',
    whistle: '吹一聲口哨', sigh: '長長嘆一口氣', cough: '咳嗽', hiccup: '打酒嗝'
  };
  // said：點名時說的話；last：被岩石砸中前喊的話（岸邊畫面上會出現）
  var CREW_TRAITS = {
    '歐律羅科斯': { step: 'greaves', voice: 'grumble', said: '我早說過，別進那個洞。', last: '我就說別回頭——' },
    '波利忒斯': { step: 'sandals', voice: 'hum', said: '我在你左邊，像在特洛伊城下一樣。', last: '奧德修斯，小心——' },
    '埃爾佩諾爾': { step: 'quick', voice: 'pant', said: '我最年輕，我要第一個上船！', last: '沙子好軟，跑不動——' },
    '珀里墨得斯': { step: 'heavy', voice: 'grunt', said: '那根木樁是我扛的，肩膀還在燒。', last: '石頭！趴下——' },
    '歐律巴忒斯': { step: 'staff', voice: 'whistle', said: '全體上船，聽我號令！', last: '上船！快上——' },
    '克洛墨尼俄斯': { step: 'barefoot', voice: 'sigh', said: '回去以後，我要先去看我的橄欖園。', last: '我的橄欖園……' },
    '安提瑪科斯': { step: 'limp', voice: 'cough', said: '我撿了一顆白石子，要帶回去給我女兒。', last: '把石子帶給她——' },
    '塞翁': { step: 'stagger', voice: 'hiccup', said: '船上還欠我一壺酒。', last: '我的酒——' }
  };

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
  /**
   * 岸邊的骰子先擲好存起來（shoreRoll＝如果巨人醒來會被砸死的人），重新整理不會換人。
   * 已有合法的 shoreRoll（都在這次帶出的名單裡）就沿用；回傳新存檔，不改原物件。
   */
  function ensureShoreRoll(s, rng) {
    var n = normalize(s);
    var crew = crewNames(n.crewOut);
    var ok = Array.isArray(n.shoreRoll) && n.shoreRoll.every(function (x) { return crew.indexOf(x) >= 0; });
    if (!ok) n.shoreRoll = resolveShore('shoot', n.crewOut, rng);
    return n;
  }
  /** 依存好的骰子算失去的人：默默離開一個也不失去。 */
  function lostFromRoll(choice, roll) {
    if (choice !== 'shoot' && choice !== 'name') return [];
    return Array.isArray(roll) ? roll.slice() : [];
  }
  /** 同伴的特徵（含文字說明）；不認得的名字回傳 null。 */
  function traitsOf(name) {
    var t = CREW_TRAITS[name];
    if (!t) return null;
    return { name: name, step: t.step, voice: t.voice, said: t.said, last: t.last,
      stepLabel: STEP_KINDS[t.step].label, voiceLabel: VOICE_KINDS[t.voice] };
  }
  /** 岸邊點名會出現的人（帶出洞的同伴，照名單順序）。 */
  function rollCall(save) {
    return crewNames(normalize(save).crewOut);
  }
  /** 奧吉吉亞礁石上的人影：走過冥府就只放跟著的亡魂；沒走過就放所有失去的同伴。 */
  function reefFigures(save) {
    var s = normalize(save);
    return (Array.isArray(s.shadesFollowing) ? s.shadesFollowing : s.crewLost).slice();
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
      bow: null,
      shadesNamed: null,     // 冥府：叫對名字的同伴；null＝還沒走過冥府
      shadesFollowing: null, // 冥府：叫錯或叫不出的同伴（跟到海上）
      nameless: false,       // 冥府：聽到阿伽門農完整的忠告
      shoreRoll: null        // 岸邊：先擲好的骰子（巨人醒來會被砸死的人）；null＝還沒擲
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
    function names(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }).slice(0, CREW_MAX) : null; }
    s.shadesNamed = names(raw.shadesNamed);
    s.shadesFollowing = names(raw.shadesFollowing);
    s.nameless = raw.nameless === true;
    s.shoreRoll = names(raw.shoreRoll);
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
  /** 抹掉存檔（首頁「重新開始」用）。 */
  function clear(storage) {
    storage = storage || defaultStorage();
    try { if (storage) { if (storage.removeItem) storage.removeItem(KEY); else storage.setItem(KEY, ''); } return true; } catch (e) { return false; }
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
      case 'underworld': return root + 'underworld/index.html';
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
    crewNames: crewNames, resolveShore: resolveShore, ensureShoreRoll: ensureShoreRoll, lostFromRoll: lostFromRoll, createRng: createRng,
    STEP_KINDS: STEP_KINDS, VOICE_KINDS: VOICE_KINDS, CREW_TRAITS: CREW_TRAITS, traitsOf: traitsOf, rollCall: rollCall, reefFigures: reefFigures,
    fresh: fresh, normalize: normalize, load: load, save: save, clear: clear, hasSave: hasSave,
    advance: advance, nextStep: nextStep, nextUrl: nextUrl
  };
}));
