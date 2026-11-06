/*
 * 《回家的路》冥府：黑暗中認出亡魂（純邏輯）
 *
 * 不碰 DOM。瀏覽器：全域 OdysseyUnderworld（要先載入 series.js）；Node：module.exports。
 * 依據：docs/design/2026-11-06-underworld-concept.md
 *
 * 出處：
 *   冥府段落、西農的指責、阿伽門農的忠告【電影】（台詞細節待確認，這裡的句子是依概念文件寫的）
 *   在黑暗裡叫名字、叫對才安息、叫錯的跟到海上、時限、往事字幕【改編】
 *   死法：岸邊被巨人丟的岩石砸死【改編：主線規格第 20 節 C】、在洞裡被巨人吃掉【原典 第 9 卷；電影】
 *   同伴的個性：波利忒斯最親近【原典 第 10 卷】、埃爾佩諾爾最年輕【原典 第 10 卷】、
 *             歐律巴忒斯是傳令官【原典 第 19 卷】；其餘往事【改編】
 *   誘答名字：活著上船的同伴、特洛伊戰爭的英雄（阿基里斯、大埃阿斯、帕特羅克洛斯、赫克托耳等）【原典】
 *   全部救出來的玩家也聽得到完整忠告（沒有人沒被叫到）【改編】
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./series.js'));
  else root.OdysseyUnderworld = factory(root.OdysseySeries);
}(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  var SHADE_TIME = 9;   // 秒：每個亡魂等你叫名字的時間
  var OPTIONS = 4;      // 每次給幾個名字

  // 和洞穴／岸邊無關、但同樣死在戰爭裡的名字（誘答）
  var HEROES = ['阿基里斯', '大埃阿斯', '帕特羅克洛斯', '赫克托耳', '安提洛科斯', '普洛特西拉俄斯'];

  // 每個同伴兩句往事：rock＝岸邊被岩石砸死；cave＝在洞裡被巨人吃掉
  var MEMORY = {
    '歐律羅科斯': {
      rock: '「我叫你別回頭。船就在眼前，石頭從天上掉下來的時候，我還在數槳。」',
      cave: '「我叫你別進那個洞。羊奶還是溫的，他就回來了。」'
    },
    '波利忒斯': {
      rock: '「我站在你左手邊，跟在特洛伊城下一樣。石頭落下來，我來不及喊你。」',
      cave: '「你想看看洞的主人長什麼樣子。我陪你等，等到他伸手把我拎起來。」'
    },
    '埃爾佩諾爾': {
      rock: '「我是船上最小的，跑得最快，本來該第一個上船的。沙子太軟了。」',
      cave: '「我躲在羊群後面，以為他看不見最小的那一個。」'
    },
    '珀里墨得斯': {
      rock: '「那根燒紅的木樁，是我和你一起扛的。我以為出了洞，就算活下來了。」',
      cave: '「那根橄欖木我才削尖一半。他抓住我的時候，木屑還黏在我手上。」'
    },
    '歐律巴忒斯': {
      rock: '「我替你傳了十年的話。最後一句沒傳完，石頭就到了。」',
      cave: '「我替你傳了十年的話。在洞裡，我喊了一整夜，沒有人應我。」'
    },
    '克洛墨尼俄斯': {
      rock: '「你答應過要帶我回去看我的橄欖園。我離船只差十步。」',
      cave: '「你答應過要帶我回去看我的橄欖園。我死在一個連一棵橄欖樹都沒有的洞裡。」'
    },
    '安提瑪科斯': {
      rock: '「我在沙灘上撿了一顆白石子，要帶回去給我女兒。巨人丟下來的那顆，大太多了。」',
      cave: '「他抓人像抓羊一樣。我的劍還插在鞘裡。」'
    },
    '塞翁': {
      rock: '「船上還欠我一壺酒。我倒在浪花裡等你回頭，你沒有回頭。」',
      cave: '「酒是我替你倒給他的。他喝醉了，可是他先吃了我。」'
    }
  };
  var MEMORY_FALLBACK = {
    rock: '「我在沙灘上等船。浪聲很大，我沒聽見石頭落下來。」',
    cave: '「洞裡好黑。我只記得羊的味道，和他的呼吸。」'
  };

  var SINON = [
    { who: '西農', text: '「奧德修斯。你把木馬推進城的時候，我替你說了謊。現在你連死人都不肯看一眼？」' },
    { who: '西農', text: '「你沒有尊敬過死去的同伴。他們都在這裡——你叫得出他們的名字嗎？」' }
  ];
  var SINON_SHORT = [
    { who: '西農', text: '「奧德修斯。這裡沒有你的同伴在等你。你把他們都帶出來了。」' },
    { who: '西農', text: '「可是別以為死人會忘記你。我們都在這裡看著。」' }
  ];
  var AGAMEMNON_FULL = { who: '阿伽門農', text: '「別以國王的身分回家。以無名之人的身分回去。」' };
  var AGAMEMNON_CUT = { who: '阿伽門農', text: '「別以國王的身分回家……」' };
  var AGAMEMNON_CUT_AFTER = '他的話被身後的哀號蓋了過去。你沒聽見後半句。';

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** 這名同伴是怎麼死的：岸上帶出來的、而且岸邊有驚動巨人 → 'rock'；其餘 → 'cave'。 */
  function causeOf(name, save) {
    var s = S.normalize(save);
    var i = S.CREW.indexOf(name);
    if (i >= 0 && i < s.crewOut && (s.shore === 'shoot' || s.shore === 'name')) return 'rock';
    return 'cave';
  }
  function memoryLine(name, cause) {
    var m = MEMORY[name] || MEMORY_FALLBACK;
    return m[cause === 'rock' ? 'rock' : 'cave'];
  }

  /**
   * 從存檔排出亡魂名單（順序、左右、選項都由 rng 決定；注入 rng 可重現）。
   * 每個亡魂：{ name, cause, line, side: -1 左 | 1 右, options: [名字…]，正確答案只出現一次 }
   * 誘答：其他失去的同伴最多 1 個（要靠往事分辨）＋ 活著的同伴＋特洛伊的英雄。
   */
  function buildShades(save, rng) {
    rng = rng || Math.random;
    var s = S.normalize(save);
    var lost = s.crewLost.filter(function (n, i, a) { return a.indexOf(n) === i; });
    var alive = S.crewNames(s.crewOut).filter(function (n) { return lost.indexOf(n) < 0; });
    return shuffle(lost, rng).map(function (name) {
      var cause = causeOf(name, s);
      var others = shuffle(lost.filter(function (n) { return n !== name; }), rng).slice(0, 1);
      var pool = shuffle(alive.concat(HEROES).filter(function (n) { return n !== name && others.indexOf(n) < 0; }), rng);
      var options = shuffle([name].concat(others, pool.slice(0, OPTIONS - 1 - others.length)), rng);
      return { name: name, cause: cause, line: memoryLine(name, cause), side: rng() < 0.5 ? -1 : 1, options: options };
    });
  }

  /** 判定：answer 是名字或選項索引；null／undefined＝時間到。回傳 'named' | 'wrong' | 'timeout'。 */
  function judge(shade, answer) {
    if (answer == null) return 'timeout';
    var picked = typeof answer === 'number' ? shade.options[answer] : answer;
    return picked === shade.name ? 'named' : 'wrong';
  }
  function isTimeout(elapsed, limit) {
    return Number(elapsed) >= (limit == null ? SHADE_TIME : limit);
  }
  /** 叫對一半以上（嚴格大於）才聽到完整忠告；一個都沒失去的也算。 */
  function isNameless(namedCount, total) {
    if (!total) return true;
    return namedCount * 2 > total;
  }
  /** results：[{ name, result }] → 寫進存檔的欄位。 */
  function summarize(results) {
    var named = [], following = [];
    (results || []).forEach(function (r) { (r.result === 'named' ? named : following).push(r.name); });
    return { shadesNamed: named, shadesFollowing: following, nameless: isNameless(named.length, named.length + following.length) };
  }
  /** 冥府結束：回傳往奧吉吉亞的新存檔。 */
  function finish(save, results) {
    return S.advance(save, 'ogygia', summarize(results));
  }
  function opening(save) {
    return S.normalize(save).crewLost.length ? SINON : SINON_SHORT;
  }
  function closing(nameless) {
    return nameless ? [AGAMEMNON_FULL] : [AGAMEMNON_CUT, { who: '', text: AGAMEMNON_CUT_AFTER }];
  }

  return {
    SHADE_TIME: SHADE_TIME, OPTIONS: OPTIONS, HEROES: HEROES, MEMORY: MEMORY, MEMORY_FALLBACK: MEMORY_FALLBACK,
    AGAMEMNON_FULL: AGAMEMNON_FULL, AGAMEMNON_CUT: AGAMEMNON_CUT,
    causeOf: causeOf, memoryLine: memoryLine, buildShades: buildShades, judge: judge, isTimeout: isTimeout,
    isNameless: isNameless, summarize: summarize, finish: finish, opening: opening, closing: closing
  };
}));
