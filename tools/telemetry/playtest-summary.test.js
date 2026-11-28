// 12/3 試玩摘要（playtest-summary.mjs）的判斷：區時間、被抓位置取最近衛兵事件、走回前一段與停留過久算可能迷路。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('試玩摘要：每段時間、被抓位置、可能迷路', async () => {
  const { summarize, toMarkdown } = await import(pathToFileURL(path.join(__dirname, 'playtest-summary.mjs')).href);
  const E = (gt, name, data) => ({ gt, name, data });
  const run = { result: { outcome: 'win' }, events: [
    E(0, 'zone', { to: 1 }), E(10, 'zone', { to: 2 }),
    E(20, 'out', { type: 'sfx', a: 'check_start', x: 22.4, z: 9.6 }), E(23, 'fail', { code: 'caught_seen', reason: '被衛兵看見了' }),
    E(30, 'zone', { to: 1 }), E(35, 'zone', { to: 2 }), E(140, 'zone', { to: 3 }), E(150, 'win', {})
  ] };
  const S = summarize(run, ['開場', '甲', '乙', '丙'], { 1: 8, 2: 10, 3: 10 });
  const z2 = S.rows.find((r) => r.z === 2), z1 = S.rows.find((r) => r.z === 1);
  assert.strictEqual(z2.time, 125);
  assert.deepStrictEqual(z2.fails.map((f) => [f.code, f.near]), [['被衛兵看見了', '衛兵在 (22, 10)']]);
  assert.ok(z2.lost.length === 1 && /停留 125/.test(z2.lost[0]), '停留過久要算可能迷路');
  assert.ok(z1.lost.some((l) => /走回來 1 次/.test(l)), '走回前一段要算');
  const md = toMarkdown(S, 't');
  assert.match(md, /被抓：1 次/);
  assert.ok(md.split('\n').every((l) => !l.includes('|')), '手機版不用表格');
});
