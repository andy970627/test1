// 執行：node --test prototypes/odyssey-series/underworld.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./series.js');
const U = require('./underworld.js');

const SAVE3 = { step: 'underworld', crewOut: 6, shore: 'shoot', crewLost: ['歐律羅科斯', '埃爾佩諾爾', '克洛墨尼俄斯'] };

test('亡魂名單：只有失去的同伴、每人一次；同一顆種子結果相同', () => {
  const a = U.buildShades(SAVE3, S.createRng(5));
  const b = U.buildShades(SAVE3, S.createRng(5));
  assert.deepEqual(a, b);
  assert.deepEqual(a.map(x => x.name).sort(), SAVE3.crewLost.slice().sort());
  for (const sh of a) {
    assert.equal(sh.cause, 'rock');
    assert.ok(sh.side === -1 || sh.side === 1);
    assert.ok(sh.options.length >= 3 && sh.options.length <= U.OPTIONS);
    assert.equal(sh.options.filter(n => n === sh.name).length, 1);
    assert.equal(new Set(sh.options).size, sh.options.length);
  }
  // 不同種子會換順序（至少有一顆會不同）
  const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(k => U.buildShades(SAVE3, S.createRng(k)).map(x => x.name).join()));
  assert.ok(orders.size > 1);
});

test('線索全部來自岸邊點名的資料（腳步、聲音、說過的話、死前的話）', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = S.createRng(seed);
    const crewOut = 2 + Math.floor(rng() * 7);
    const roll = S.rollCall({ crewOut });
    const lost = roll.filter(() => rng() < 0.5);
    const save = { crewOut, shore: rng() < 0.5 ? 'shoot' : 'name', crewLost: lost };
    for (const sh of U.buildShades(save, rng)) {
      const t = S.traitsOf(sh.name);
      assert.ok(roll.includes(sh.name), '亡魂必須在點名時出現過');
      assert.equal(sh.step, t.step);
      assert.equal(sh.voice, t.voice);
      assert.equal(sh.stepLabel, S.STEP_KINDS[t.step].label);
      assert.equal(sh.voiceLabel, S.VOICE_KINDS[t.voice]);
      const inner = sh.line.slice(1, -1);
      if (sh.clue === 'last') assert.equal(inner, t.last);
      else { assert.equal(sh.clue, 'said'); assert.ok(t.said.startsWith(inner.replace(/……$/, '')), `${inner} ⊂ ${t.said}`); }
      for (const n of sh.options) assert.ok(roll.includes(n), `選項 ${n} 必須在點名時出現過`);
    }
  }
});

test('死前那句只在岸邊被砸死時當線索；前半句會截斷', () => {
  const sh = U.buildShades(SAVE3, () => 0.1); // rng 小 → 給死前那句
  assert.ok(sh.every(x => x.clue === 'last'));
  const sh2 = U.buildShades(SAVE3, () => 0.9);
  assert.ok(sh2.every(x => x.clue === 'said' && x.line.endsWith('……」')));
  assert.equal(U.halfLine('船上還欠我一壺酒。'), '船上還欠我……');
  // 默默離開（理論上不會失去人）→ 不算砸死
  assert.equal(U.causeOf('塞翁', { crewOut: 8, shore: 'leave' }), 'cave');
});

test('沒在點名出現過的死者：不出場，直接跟到海上', () => {
  const save = { crewOut: 2, shore: 'name', crewLost: ['歐律羅科斯', '塞翁'] }; // 塞翁沒被帶出洞
  assert.deepEqual(U.seenLost(save), ['歐律羅科斯']);
  assert.deepEqual(U.unseenLost(save), ['塞翁']);
  assert.deepEqual(U.buildShades(save, S.createRng(1)).map(x => x.name), ['歐律羅科斯']);
  const out = U.finish(save, [{ name: '歐律羅科斯', result: 'named' }]);
  assert.deepEqual(out.shadesNamed, ['歐律羅科斯']);
  assert.deepEqual(out.shadesFollowing, ['塞翁']);
  assert.equal(out.nameless, false); // 1/2 不算過半
});

test('判定與時限', () => {
  const sh = { name: '塞翁', options: ['波利忒斯', '塞翁', '埃爾佩諾爾'] };
  assert.equal(U.judge(sh, 1), 'named');
  assert.equal(U.judge(sh, '塞翁'), 'named');
  assert.equal(U.judge(sh, 0), 'wrong');
  assert.equal(U.judge(sh, '阿基里斯'), 'wrong');
  assert.equal(U.judge(sh, null), 'timeout');
  assert.equal(U.judge(sh, undefined), 'timeout');
  assert.equal(U.isTimeout(8.99), false);
  assert.equal(U.isTimeout(U.SHADE_TIME), true);
  assert.equal(U.isTimeout(3, 3), true);
});

test('無名之人門檻：嚴格過半；沒失去人也算', () => {
  assert.equal(U.isNameless(0, 0), true);
  assert.equal(U.isNameless(1, 2), false);
  assert.equal(U.isNameless(2, 3), true);
  assert.equal(U.isNameless(2, 4), false);
  assert.equal(U.isNameless(3, 4), true);
});

test('寫進存檔：shadesNamed / shadesFollowing / nameless / step', () => {
  const res = [{ name: '歐律羅科斯', result: 'named' }, { name: '埃爾佩諾爾', result: 'timeout' }, { name: '克洛墨尼俄斯', result: 'named' }];
  const out = U.finish(SAVE3, res);
  assert.equal(out.step, 'ogygia');
  assert.deepEqual(out.shadesNamed, ['歐律羅科斯', '克洛墨尼俄斯']);
  assert.deepEqual(out.shadesFollowing, ['埃爾佩諾爾']);
  assert.equal(out.nameless, true);
  assert.deepEqual(out.crewLost, SAVE3.crewLost);
  assert.deepEqual(S.reefFigures(out), ['埃爾佩諾爾']);
  const bad = U.finish(SAVE3, res.map(r => ({ name: r.name, result: 'wrong' })));
  assert.equal(bad.nameless, false);
  assert.deepEqual(bad.shadesNamed, []);
  const none = U.finish({ crewOut: 6, shore: 'leave', crewLost: [] }, []);
  assert.deepEqual(none.shadesNamed, []);
  assert.deepEqual(none.shadesFollowing, []);
  assert.equal(none.nameless, true);
});

test('開場與結尾台詞：短版、完整與被截斷的忠告', () => {
  assert.match(U.opening(SAVE3).map(l => l.text).join(''), /叫得出他們的名字/);
  assert.doesNotMatch(U.opening({ crewLost: [] }).map(l => l.text).join(''), /叫得出/);
  assert.equal(U.closing(true)[0].text, U.AGAMEMNON_FULL.text);
  assert.ok(U.AGAMEMNON_FULL.text.includes('無名之人'));
  assert.ok(!U.closing(false).some(l => l.text.includes('無名之人')));
});
