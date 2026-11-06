// 執行：node --test prototypes/odyssey-series/series.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./series.js');

function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

test('fresh：預設存檔符合計畫第 3 節', () => {
  const s = S.fresh();
  assert.deepEqual(Object.keys(s).sort(), ['bow', 'crewLost', 'crewOut', 'knowers', 'ledger', 'nameless', 'shadesFollowing', 'shadesNamed', 'shore', 'step', 'wrath', 'years'].sort());
  assert.equal(s.step, 'cave');
  assert.equal(s.crewOut, 6);
  assert.equal(s.years, 7);
  assert.deepEqual(s.knowers, { tele: 'unknown', eum: 'unknown', pen: 'unknown' });
  assert.equal(S.KEY, 'odyssey-series-v1');
  assert.equal(s.shadesNamed, null);
  assert.equal(s.shadesFollowing, null);
  assert.equal(s.nameless, false);
});

test('wrath 與 years 換算', () => {
  assert.equal(S.wrathFromShore('leave'), 0);
  assert.equal(S.wrathFromShore('name'), 1);
  assert.equal(S.wrathFromShore('shoot'), 2);
  assert.equal(S.wrathFromShore(undefined), 0);
  assert.equal(S.yearsFromWrath(0), 7);
  assert.equal(S.yearsFromWrath(1), 8);
  assert.equal(S.yearsFromWrath(2), 9);
  assert.equal(S.yearsFromWrath(99), 9);
});

test('乞丐難度：每多一年 ×1.12、多一個丟東西的人', () => {
  assert.deepEqual(S.beggarTuning(7), { glanceMul: 1, extraThrowers: 0 });
  const t8 = S.beggarTuning(8), t9 = S.beggarTuning(9);
  assert.ok(Math.abs(t8.glanceMul - 1.12) < 1e-9);
  assert.ok(Math.abs(t9.glanceMul - 1.12 * 1.12) < 1e-9);
  assert.equal(t9.extraThrowers, 2);
  assert.equal(S.beggarTuning('壞').extraThrowers, 0);
});

test('比箭晃動倍率：下限 0.6', () => {
  assert.equal(S.bowSwayMul(0), 1);
  assert.ok(Math.abs(S.bowSwayMul(5) - 0.8) < 1e-9);
  assert.equal(S.bowSwayMul(10), 0.6);
  assert.equal(S.bowSwayMul(100), 0.6);
  assert.equal(S.bowSwayMul(-3), 1);
  assert.equal(S.bowSwayMul(NaN), 1);
});

test('岸邊：默默離開不失去人；射箭與喊名照骰子', () => {
  assert.deepEqual(S.resolveShore('leave', 6, () => 0), []);
  assert.deepEqual(S.resolveShore('shoot', 6, () => 0.99), []);
  assert.deepEqual(S.resolveShore('name', 6, () => 0), S.CREW.slice(0, 6));
  const seq = [0.1, 0.5, 0.2, 0.9, 0.34, 0.0];
  let i = 0;
  assert.deepEqual(S.resolveShore('shoot', 6, () => seq[i++]), [S.CREW[0], S.CREW[2], S.CREW[5]]);
  assert.deepEqual(S.resolveShore('shoot', 2, () => 0), S.CREW.slice(0, 2));
  // 統計：大約三分之一
  const rng = S.createRng(42); let lost = 0;
  for (let k = 0; k < 3000; k++) lost += S.resolveShore('name', 6, rng).length;
  const rate = lost / (3000 * 6);
  assert.ok(rate > 0.31 && rate < 0.36, `rate ${rate}`);
});

test('同伴名字不重複，數量夠用', () => {
  assert.equal(new Set(S.CREW).size, S.CREW.length);
  assert.ok(S.CREW.length >= 6);
  assert.equal(S.crewNames(99).length, S.CREW.length);
});

test('load / save：往返、壞資料、沒有 storage', () => {
  const st = memStore();
  assert.deepEqual(S.load(st), S.fresh());
  let s = S.advance(S.fresh(), 'ogygia', { shore: 'shoot', crewLost: ['波利忒斯'] });
  assert.equal(S.save(st, s), true);
  const back = S.load(st);
  assert.equal(back.step, 'ogygia');
  assert.equal(back.wrath, 2);
  assert.equal(back.years, 9);
  assert.deepEqual(back.crewLost, ['波利忒斯']);
  assert.deepEqual(S.load(memStore({ 'odyssey-series-v1': '{壞掉' })), S.fresh());
  const odd = S.load(memStore({ 'odyssey-series-v1': JSON.stringify({ step: 'moon', ledger: -4, knowers: { tele: 'knows', pen: 'x' }, bow: { win: 1, passed: 40 } }) }));
  assert.equal(odd.step, 'cave');
  assert.equal(odd.ledger, 0);
  assert.equal(odd.knowers.tele, 'knows');
  assert.equal(odd.knowers.pen, 'unknown');
  assert.deepEqual(odd.bow, { win: true, passed: 12 });
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(S.load(throwing), S.fresh());
  assert.equal(S.save(throwing, S.fresh()), false);
});

test('advance：不改原物件、拒絕未知步驟、重算衍生欄位', () => {
  const a = S.fresh();
  const b = S.advance(a, 'shore');
  assert.equal(a.step, 'cave');
  assert.equal(b.step, 'shore');
  const c = S.advance(b, 'ogygia', { shore: 'name', wrath: 2, years: 9 });
  assert.equal(c.wrath, 1);
  assert.equal(c.years, 8);
  assert.throws(() => S.advance(a, 'troy'));
});

test('nextStep 與 nextUrl', () => {
  assert.equal(S.nextStep('cave'), 'shore');
  assert.equal(S.nextStep('shore'), 'underworld');
  assert.equal(S.nextStep('underworld'), 'ogygia');
  assert.equal(S.nextUrl('underworld', '../'), '../underworld/index.html');
  assert.equal(S.nextStep('ogygia'), 'beggar-gate');
  assert.equal(S.nextStep('bow'), 'ending');
  assert.equal(S.nextStep('ending'), 'ending');
  assert.equal(S.nextUrl('shore'), 'shore/index.html');
  assert.equal(S.nextUrl('shore', '../'), '../shore/index.html');
  assert.equal(S.nextUrl('ogygia', '..'), '../ogygia/index.html');
  assert.equal(S.nextUrl('beggar-gate', '../'), '../beggar/index.html?series=1&seg=gate');
  assert.equal(S.nextUrl('bow', ''), 'bow/index.html?series=1');
  assert.equal(S.nextUrl('ending', '../'), '../ending/index.html');
  assert.equal(S.nextUrl('cave', '../'), '../index.html#cave');
  for (const st of S.STEPS) assert.ok(S.nextUrl(st).length > 0);
});

test('冥府欄位：normalize 保留合法陣列、丟掉壞資料', () => {
  const n = S.normalize({ shadesNamed: ['波利忒斯', 3], shadesFollowing: 'x', nameless: 'yes' });
  assert.deepEqual(n.shadesNamed, ['波利忒斯']);
  assert.equal(n.shadesFollowing, null);
  assert.equal(n.nameless, false);
  assert.equal(S.normalize({ nameless: true }).nameless, true);
  const st = memStore();
  S.save(st, S.advance(S.fresh(), 'ogygia', { shadesNamed: ['塞翁'], shadesFollowing: [], nameless: true }));
  const back = S.load(st);
  assert.deepEqual(back.shadesNamed, ['塞翁']);
  assert.deepEqual(back.shadesFollowing, []);
  assert.equal(back.nameless, true);
});

test('礁石上的人影：走過冥府只放跟著的；沒走過放失去的同伴', () => {
  assert.deepEqual(S.reefFigures({ crewLost: ['塞翁', '波利忒斯'] }), ['塞翁', '波利忒斯']);
  assert.deepEqual(S.reefFigures({ crewLost: ['塞翁', '波利忒斯'], shadesFollowing: ['塞翁'] }), ['塞翁']);
  assert.deepEqual(S.reefFigures({ crewLost: ['塞翁'], shadesFollowing: [] }), []);
});

test('同伴特徵：每人都有、腳步與聲音各不相同、句子不重複', () => {
  const steps = new Set(), voices = new Set(), lines = new Set();
  for (const name of S.CREW) {
    const t = S.traitsOf(name);
    assert.ok(t, name);
    assert.ok(S.STEP_KINDS[t.step] && S.VOICE_KINDS[t.voice], name);
    assert.ok(t.said.length > 4 && t.last.length > 2, name);
    assert.ok(t.stepLabel && t.voiceLabel);
    steps.add(t.step); voices.add(t.voice); lines.add(t.said); lines.add(t.last);
  }
  assert.equal(steps.size, S.CREW.length);
  assert.equal(voices.size, S.CREW.length);
  assert.equal(lines.size, S.CREW.length * 2);
  assert.equal(S.traitsOf('阿基里斯'), null);
  assert.deepEqual(S.rollCall({ crewOut: 3 }), S.CREW.slice(0, 3));
});
