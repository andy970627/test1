// 關卡編輯器純邏輯的測試（node --test）：匯入匯出原樣、腹中高度換算、加長全圖、逐區檢查
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = require('../troy-prologue/risset.js');
const C = require('./core.js');
// 關卡資料是純 JSON：比較前把 buildLevel() 也轉一次 JSON（舊版 buildLevel 有 name: undefined 的欄位，JSON 會拿掉）
const built = () => JSON.parse(JSON.stringify(R.buildLevel()));

// 正式資料：規則角色抽出 level-troy.js 後用它；還沒有時從 buildLevel() 換算
function base() {
  const f = path.join(__dirname, '../troy-prologue/level-troy.js');
  if (fs.existsSync(f)) { delete require.cache[require.resolve(f)]; return require(f); }
  return C.fromBuilt(R.buildLevel(), R.T.BELLY_Y);
}

test('現有關卡匯入再原樣匯出，資料完全相同', () => {
  const d = base();
  const back = C.importText(C.exportText(d));
  assert.deepStrictEqual(back, d);
  assert.strictEqual(C.exportText(back), C.exportText(d));
});

test('腹中高度寫字串 BELLY_Y，換回數字後和 buildLevel() 完全相同', () => {
  const d = C.fromBuilt(R.buildLevel(), R.T.BELLY_Y);
  assert.strictEqual(d.zones[0].start.y, 'BELLY_Y');
  assert.strictEqual(d.horse.bellyY, 'BELLY_Y');
  assert.strictEqual(d.zones[2].start.y, 0);
  assert.deepStrictEqual(C.resolveLevel(d, R.T.BELLY_Y), built());
  if (typeof R.resolveLevel === 'function') assert.deepStrictEqual(JSON.parse(JSON.stringify(R.resolveLevel(d))), built());
});

test('level-troy.js 存在時，內容和 buildLevel() 換算的一樣', () => {
  const f = path.join(__dirname, '../troy-prologue/level-troy.js');
  if (!fs.existsSync(f)) return;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(require(f))), C.fromBuilt(R.buildLevel(), R.T.BELLY_Y));
});

test('匯入格式不對會給中文錯誤', () => {
  assert.throws(() => C.importText('不是 json'), /不是 JSON/);
  assert.throws(() => C.importText('{"walls":[]}'), /缺少欄位/);
});

test('編輯器的關卡交給 createLevel 跑得起來（resolve 後）', () => {
  const lv = C.resolveLevel(C.insertWidth(base(), 47, 30), R.T.BELLY_Y);
  const g = R.createLevel({ level: lv, startZone: 2 });
  assert.strictEqual(g.level.size.w, 90);
  for (let i = 0; i < 60; i++) g.step(i / 30, { mx: 0, mz: 0 });
  assert.ok(Number.isFinite(g.player.x));
});

test('插入空地：右邊整批東移、外框拉長、全圖變 90 × 30', () => {
  const d = base(), w = C.insertWidth(d, 47, 30);
  const ex = (L) => L.zones[3].exit.rect;
  assert.strictEqual(ex(w).x1 - ex(w).x0, ex(d).x1 - ex(d).x0);   // 出口被切到也不拉長
  assert.strictEqual(C.insertWidth(d, 47.5, 30).zones[3].exit.rect.x0, ex(d).x0);   // 插在出口東緣：出口不動
  assert.deepStrictEqual(w.size, { w: 90, h: 30 });
  assert.strictEqual(w.walls.find((x) => x.name === '北界').x1, d.walls.find((x) => x.name === '北界').x1 + 30);
  assert.strictEqual(w.walls.find((x) => x.name === '城門牆').x0, 90);
  assert.strictEqual(w.gate.latch.x, d.gate.latch.x + 30);
  assert.strictEqual(w.zones[4].start.x, d.zones[4].start.x + 30);
  assert.deepStrictEqual(w.walls.find((x) => x.name === '神殿'), d.walls.find((x) => x.name === '神殿'));   // 西邊不動
  assert.deepStrictEqual(d.size, { w: 60, h: 30 });   // 原本的沒被改
});

test('逐區檢查：現有關卡的數字', () => {
  const res = C.checkZones(base(), R.T);
  const pick = (id, label) => res.find((z) => z.zone.id === id).items.find((i) => i.label === label);
  assert.strictEqual(pick(2, '衛兵 ≤ 3').state, 'pass');
  assert.strictEqual(pick(3, '衛兵 ≤ 3').text.startsWith('3 名'), true);
  assert.strictEqual(pick(2, '起點在影子裡').state, 'pass');
  assert.strictEqual(pick(3, '起點在影子裡').state, 'pass');
  assert.strictEqual(pick(4, '影子 ≥ 3 塊').state, 'fail');          // 城門區只有 2 塊（企劃要 3 塊）
  assert.strictEqual(pick(3, '8 公尺以上的空地').state, 'warn');     // 窄巷整段都是關口（企劃第 2 節點名的問題）
  // 起點移出影子就不過；第 3 區加到 4 名衛兵就不過
  const d = base(); d.zones[3].start.x = 38.5; d.zones[3].start.z = 20;
  d.guards.push({ id: 'x', zone: 3, route: [{ x: 40, z: 22 }], yaw: 0, note: '' });
  const r2 = C.checkZones(d, R.T).find((z) => z.zone.id === 3).items;
  assert.strictEqual(r2.find((i) => i.label === '起點在影子裡').state, 'fail');
  assert.strictEqual(r2.find((i) => i.label === '衛兵 ≤ 3').state, 'fail');
});

test('加一區「慶宴的街」：區號、出口、衛兵都對上，遊戲從第 2 區一路走到城門，區名提示正確', () => {
  let d = C.insertWidth(base(), 47.5, 30);
  const r = C.addZone(d, 47.5, 77.5, { name: '慶宴的街', tier: 3, driveSeg: 4 });
  d = r.data;
  assert.strictEqual(r.index, 4);
  assert.deepStrictEqual(d.zones.map((z) => z.id), [0, 1, 2, 3, 4, 5]);
  assert.strictEqual(d.zones[3].exit.to, 4);
  assert.strictEqual(d.zones[4].exit.to, 5);
  assert.strictEqual(d.zones[5].exit.kind, 'gate');
  assert.ok(d.guards.filter((q) => q.zone === 5).length === 2 && d.guards.every((q) => q.zone !== 4));   // 原本城門區的衛兵跟著變成第 5 區
  assert.ok(C.inRect(d.zones[4].start, d.shadows[d.shadows.length - 1]));   // 新區起點罩著影子
  assert.deepStrictEqual(C.importText(C.exportText(d)), d);               // 加區後匯入匯出一樣
  const lv = R.resolveLevel ? R.resolveLevel(d) : C.resolveLevel(d, R.T.BELLY_Y);
  const g = R.createLevel({ level: lv, startZone: 2, T: { DYNAMIC: false } });
  const msgs = []; let t = 0;
  const step = () => { g.step(t += 1 / 30, { mx: 0, mz: 0 }); for (const e of g.drain ? g.drain() : []) if (e.type === 'msg') msgs.push(e.a); };
  for (let i = 0; i < 5; i++) step();
  while (lv.zones[g.zone].exit && lv.zones[g.zone].exit.kind === 'rect') {
    const z0 = g.zone, rr = lv.zones[g.zone].exit.rect;
    g.guards.forEach((q) => { q.active = false; });
    g.player.x = (rr.x0 + rr.x1) / 2; g.player.z = (rr.z0 + rr.z1) / 2;
    for (let i = 0; i < 5; i++) step();
    assert.strictEqual(g.zone, z0 + 1);
  }
  assert.strictEqual(g.zone, 5);
  assert.ok(R.isGateZone ? R.isGateZone(lv, g.zone) : true);
  assert.deepStrictEqual(msgs.filter((m) => ['城牆下的窄巷', '慶宴的街', '城門'].includes(m)), ['城牆下的窄巷', '慶宴的街', '城門']);
});

test('刪區：開場、城門區不能刪；刪中間一區後出口與衛兵重新對號', () => {
  const d = base();
  assert.throws(() => C.removeZone(d, 0), /不能刪/);
  assert.throws(() => C.removeZone(d, d.zones.length - 1), /不能刪/);
  const e = C.removeZone(d, 3);
  assert.deepStrictEqual(e.zones.map((z) => z.id), [0, 1, 2, 3]);
  assert.strictEqual(e.zones[2].exit.to, 3);
  assert.strictEqual(e.zones[3].exit.kind, 'gate');
  assert.ok(e.guards.every((q) => q.zone <= 3) && !e.guards.some((q) => q.id.startsWith('g3')));
  const add = C.addZone(C.insertWidth(d, 47.5, 30), 47.5, 77.5, { name: 'x' }).data;
  assert.deepStrictEqual(C.removeZone(add, 4).zones.map((z) => z.name), d.zones.map((z) => z.name));   // 加了再刪，區回到原本
});

test('11/27 區的火盆 fires：插寬時跟著往東移、匯出再讀回不掉欄位', () => {
  const d = base(); d.zones[3].fires = [{ x: 50, z: 5, torch: true }, { x: 10, z: 5 }];
  const w = C.insertWidth(d, 47, 30);
  assert.deepStrictEqual(w.zones[3].fires.map((f) => f.x), [80, 10]);
  assert.strictEqual(w.zones[3].fires[0].torch, true);
  assert.deepStrictEqual(C.importText(C.exportText(w)).zones[3].fires, w.zones[3].fires);
});
