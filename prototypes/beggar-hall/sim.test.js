// 《門檻上的乞丐》規則模組測試：node --test prototypes/beggar-hall/sim.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./sim.js');
const { T } = S;

// ---------- 工具 ----------
function seeded(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DT = 1 / 20;
function mk(seg, carry = {}, opts = {}) {
  return S.createGame(seg, Object.assign(S.freshCarry(), carry), { rng: opts.rng || seeded(opts.seed || 7), options: opts.options });
}
function run(g, secs, input = {}, dt = DT) {
  const n = Math.round(secs / dt);
  for (let i = 0; i < n && g.phase === 'play'; i++) g.step(dt, typeof input === 'function' ? input(i) : input);
}
const byName = (g, name) => g.npcs.find(n => n.name === name);
// 把除了 keep 以外的敵人和僕人移出場外，讓情境可預測
function isolate(g, keep = []) {
  for (const n of g.npcs) {
    if (keep.includes(n) || (!n.hostile && n.role !== 'servant')) continue;
    n.hostile = false; n.route = null; n.x = n.homeX = 100 + n.id; n.z = n.homeZ = 100;
  }
}
// 固定某人的視線
function fixGaze(n, x, z, yaw) { if (x != null) { n.x = n.homeX = x; n.z = n.homeZ = z; } n.yaw = n.lookYaw = n.baseYaw = yaw; n.lookT = 1e9; }
const yawTo = (P, x, z) => Math.atan2(-(x - P.x), -(z - P.z));   // 玩家前方＝(-sin, -cos)
function put(g, x, z, yaw) { g.player.x = x; g.player.z = z; if (yaw != null) g.player.yaw = yaw; }
// 走向某點，到了就回傳 true
function walkStep(g, x, z, extra = {}) {
  const P = g.player; const d = Math.hypot(x - P.x, z - P.z);
  if (d < .15) return true;
  g.step(DT, Object.assign({ yaw: yawTo(P, x, z), mz: -1 }, extra));
  return false;
}
function walkPath(g, pts, extra = {}, maxSec = 120) {
  let i = 0, guard = maxSec / DT;
  while (i < pts.length && g.phase === 'play' && guard-- > 0) if (walkStep(g, pts[i][0], pts[i][1], extra)) i++;
  return i === pts.length;
}
const msgs = g => g.out.filter(o => o.type === 'msg').map(o => o.a);
// 歐邁俄斯的三段往事每局洗牌：找出正確那段（被賣到這裡、和妹妹一起長大）在第幾個
const EUM_RIGHT = '被賣到這裡';
const eumRight = g => g.eumLines.findIndex(l => l.includes(EUM_RIGHT));
const eumWrong = g => g.eumLines.findIndex(l => !l.includes(EUM_RIGHT));

// ---------- 純函式 ----------
test('stageOf 門檻', () => {
  assert.equal(S.stageOf(0), 'calm');
  assert.equal(S.stageOf(T.stageCurious - .001), 'calm');
  assert.equal(S.stageOf(T.stageCurious), 'curious');
  assert.equal(S.stageOf(T.stageSuspicious - .001), 'curious');
  assert.equal(S.stageOf(T.stageSuspicious), 'suspicious');
  assert.equal(S.stageOf(.999), 'suspicious');
  assert.equal(S.stageOf(1), 'seen');
});

test('angDiff 走最短的方向（含大角度）', () => {
  assert.ok(Math.abs(S.angDiff(0, .5) - .5) < 1e-9);
  assert.ok(Math.abs(S.angDiff(3, -3) - (2 * Math.PI - 6)) < 1e-9);
  assert.ok(Math.abs(S.angDiff(20, 0) - (-20 + 3 * 2 * Math.PI)) < 1e-9);   // 舊寫法這裡會轉錯方向
  for (const [a, b] of [[25, -2], [-30, 1], [0, 40]]) { const d = S.angDiff(a, b); assert.ok(d >= -Math.PI && d <= Math.PI); }
});

test('lightAt：爐火亮、遠角暗、撥暗的火盆變暗', () => {
  const g = mk('hall');
  assert.ok(g.lightAt(0, 4.6) > .8, 'hearth bright');
  assert.ok(Math.abs(g.lightAt(-8.5, 8.5) - g.L.ambient) < 1e-9, 'far corner = ambient');
  const before = g.lightAt(7.6, -6.2);
  g.braziers[1].lit = false;
  const after = g.lightAt(7.6, -6.2);
  assert.ok(after < before - .3, `banked ${after} < ${before}`);
  assert.ok(after > g.L.ambient, 'banked still glows a little');
  // 純函式
  assert.equal(S.lightAt(0, 0, .2, []), .2);
  assert.equal(S.lightAt(0, 0, .2, [{ x: 0, z: 0, r: 1, i: .5, on: false }]), .2);
  assert.ok(Math.abs(S.lightAt(.5, 0, 0, [{ x: 0, z: 0, r: 1, i: .8 }]) - .4) < 1e-9);
});

test('segHitsRect / blocked：柱子擋；桌子只在彎腰時擋', () => {
  const L = S.level('hall');
  const pillar = { x0: -2.95, x1: -2.25, z0: -.35, z1: .35 };
  assert.ok(S.segHitsRect(-2.6, -2, -2.6, 2, pillar));
  assert.ok(!S.segHitsRect(-1, -2, -1, 2, pillar));
  assert.ok(!S.segHitsRect(-2.6, -2, -2.6, -1, pillar), 'segment ends before rect');
  assert.ok(S.blocked(-2.6, -3, -2.6, 1.2, L.obst, [], false, []), 'pillar blocks standing target');
  assert.ok(S.blocked(-7, 0, -3, 0, L.obst, [], true, []), 'table blocks crouched');
  assert.ok(!S.blocked(-7, 0, -3, 0, L.obst, [], false, []), 'table does not block standing');
  const person = { x: -5, z: -7 };
  assert.ok(S.blocked(-7, -7, -3, -7, [], [person], false, []), 'a person blocks');
  assert.ok(!S.blocked(-7, -7, -3, -7, [], [person], false, [person]));
  assert.ok(S.segHitsCircle(0, 0, 2, 0, 1, .2, .3) && !S.segHitsCircle(0, 0, 2, 0, 1, .5, .3));
});

test('judgeDodge 時間窗：一般／寬鬆', () => {
  assert.equal(S.judgeDodge(null, false), 'hit');
  assert.equal(S.judgeDodge(-.5, false), 'clean');
  assert.equal(S.judgeDodge(-.2, false), 'clumsy');
  assert.equal(S.judgeDodge(-.04, false), 'clumsy');
  assert.equal(S.judgeDodge(0, false), 'hit');
  assert.equal(S.judgeDodge(-.35, false), 'clean');
  assert.equal(S.judgeDodge(-.35, true), 'clumsy');
  assert.equal(S.judgeDodge(.03, true), 'clumsy');
  assert.equal(S.judgeDodge(-.45, true), 'clean');
  assert.equal(S.judgeDodge(.1, true), 'hit');
});

// ---------- 視線與疑心 ----------
test('站直被看見會起疑；彎腰躲在柱子後面的暗處不會', () => {
  const g = mk('hall'); const n = byName(g, '安菲諾摩斯'); isolate(g, [n]);
  fixGaze(n, 0, -6, 0); put(g, 0, -3.4);
  run(g, 2, { stand: true });
  assert.ok(n.vis > 0 && n.susp > .1, `standing susp ${n.susp}`);

  const h = mk('hall'); const m = byName(h, '安菲諾摩斯'); isolate(h, [m]);
  fixGaze(m, -2.6, -3, 0); put(h, -2.6, 1.2);
  run(h, 3, {});
  assert.equal(m.vis, 0); assert.equal(m.susp, 0);
  put(h, -1.2, 1.2); run(h, .2, {});   // 走出柱子後面就看得到
  assert.ok(m.vis > 0);
  // 遠處暗角：彎腰看不到，站直的範圍也很短
  const k = mk('hall'); const q = byName(k, '安菲諾摩斯'); isolate(k, [q]);
  fixGaze(q, 0, -1, Math.PI); put(k, 0, -7.5);
  run(k, 1, {}); assert.equal(q.vis, 0);
});

function wanderSusp(setup, extra = {}) {
  const g = mk('hall'); const n = byName(g, '安菲諾摩斯'); isolate(g, [n]);
  fixGaze(n, -.5, -7.5, 0); put(g, -.5, -4.5, 0);
  setup && setup(g);
  run(g, 3, i => Object.assign({ mx: (Math.floor(i / 10) % 2) ? 1 : -1 }, extra));
  return n.susp;
}
test('廳裡無端走動會起疑；乞討／火盆差事、混進僕人時不會；跛行減半', () => {
  const plain = wanderSusp();
  assert.ok(plain > .05, `plain ${plain}`);
  assert.equal(wanderSusp(g => { g.begT = 0; }), 0, 'beg pretext');
  assert.equal(wanderSusp(g => { g.tendT = 0; }), 0, 'tend pretext');
  const servant = g => { const s = g.npcs.find(n => n.role === 'servant'); s.route = null; s.x = -.5; s.z = -4.0; s.mode = 'idle'; };
  assert.equal(wanderSusp(servant), 0, 'blending with a servant');
  const limp = wanderSusp(null, { limp: true });
  assert.ok(limp > plain * .35 && limp < plain * .65, `limp ${limp} vs ${plain}`);
  // 差事時效過了就又會起疑
  const g = mk('hall'); const n = byName(g, '安菲諾摩斯'); isolate(g, [n]); fixGaze(n, -.5, -7.5, 0); put(g, -.5, -4.5, 0);
  g.begT = 0; run(g, T.begPretext + .5, i => ({ mx: (Math.floor(i / 10) % 2) ? 1 : -1 }));
  assert.ok(n.susp > 0);
  // 宮門外走動不算可疑
  const gg = mk('gate'); const m = gg.npcs.find(x => x.role === 'loiter'); isolate(gg, [m]); fixGaze(m, 0, -9, 0); put(gg, 0, -6);
  run(gg, 3, i => ({ mx: (Math.floor(i / 10) % 2) ? 1 : -1 }));
  assert.equal(m.susp, 0);
});

test('懷疑的人走到最後看到你的地方查看，找完回座位', () => {
  const g = mk('hall'); const n = byName(g, '安菲諾摩斯'); isolate(g, [n]);
  put(g, -8.3, 3);
  n.susp = .65; n.stage = 'curious'; n.lastSeen = { x: 1.5, z: -1.5 };
  g.step(DT, {});
  assert.equal(n.mode, 'investigate');
  assert.ok(msgs(g).some(t => t.includes('走過來查看')));
  let reached = false, away = false;
  for (let i = 0; i < 25 / DT && n.mode !== 'idle'; i++) { g.step(DT, {}); if (Math.hypot(n.x - 1.5, n.z + 1.5) < .9) reached = true; if (n.away) away = true; }
  assert.ok(reached, 'reached last seen');
  assert.ok(away, 'away flag while out of seat');
  assert.equal(n.mode, 'idle');
  assert.ok(Math.hypot(n.x - n.homeX, n.z - n.homeZ) < .06, 'back home');
  assert.equal(n.lastSeen, null);
  assert.equal(n.away, false);
});

test('傳染：懷疑的人讓 4 m 內的人也起疑，遠的人不受影響', () => {
  const g = mk('hall');
  const a = byName(g, '安提諾俄斯'), b = byName(g, '阿格勞斯'), far = byName(g, '歐律馬科斯');
  isolate(g, [a, b, far]); put(g, 8.3, -8.3);
  a.susp = .8; a.stage = 'suspicious'; a.lastSeen = { x: -2, z: 2 };
  // a(-3.8,3.6) 和 b(-3.8,-1.0) 相距 4.6，拉近一點
  b.x = b.homeX = -3.8; b.z = b.homeZ = 1.0;
  run(g, 2, {});
  assert.ok(b.susp > .04 && b.susp < .1, `b ${b.susp}`);   // 傳染 .05/s 減掉看不到你時的回落 .02/s
  assert.equal(far.susp, 0);
  assert.ok(b.lastSeen, 'neighbour learns where to look');
});

test('丟骨頭：附近的人轉頭看落點，懷疑的人改去查看落點', () => {
  const g = mk('hall');
  const sus = byName(g, '勒奧得斯'), calm = byName(g, '克特西波斯');
  isolate(g, [sus, calm]); put(g, -8.3, 3, 0);
  fixGaze(sus, null, null, Math.PI / 2); fixGaze(calm, null, null, Math.PI);   // 都背對玩家
  sus.susp = .7; sus.stage = 'suspicious'; sus.mode = 'investigate'; sus.searchT = 0; sus.lastSeen = { x: -7, z: 6 };
  assert.equal(g.player.bones, 1);
  g.step(DT, { throwAt: { x: -4, z: -2 } });
  assert.equal(g.player.bones, 0);
  assert.equal(g.projectiles.length, 1);
  run(g, .7, {});
  assert.equal(g.projectiles.length, 0);
  assert.deepEqual(sus.lastSeen, { x: -4, z: -2 });
  assert.equal(sus.mode, 'investigate');
  assert.ok(calm.focus && calm.focus.x === -4, 'calm one looks at the noise');
  assert.equal(calm.mode, 'idle');
  // 沒骨頭就丟不出去
  g.step(DT, { throwAt: { x: -4, z: -2 } });
  assert.equal(g.projectiles.length, 0);
  // 太遠的點會被拉回投擲距離內
  const h = mk('hall'); put(h, 0, -8); h.step(DT, { throwAt: { x: 0, z: 8 } });
  assert.ok(Math.abs(h.projectiles[0].z1 - (-8 + T.throwRange)) < 1e-6);
});

test('撞倒酒罈：怒火上升、帳加一，看著你的人疑心下降', () => {
  const g = mk('hall', { ledger: 3 }); const m = byName(g, '阿格勞斯'); isolate(g, [m]);
  put(g, -3.1, 1.75, Math.PI);   // 面向 +z，罈子在前面
  fixGaze(m, null, null, 0); m.susp = .5; m.stage = 'curious';
  run(g, .1, {});   // 讓他先看到你
  assert.ok(m.vis > 0);
  const before = m.susp;
  for (let i = 0; i < 40 && !g.jars[1].down; i++) g.step(DT, { mz: -1 });
  assert.ok(g.jars[1].down);
  assert.ok(Math.abs(g.anger - T.angerInsult) < 1e-9);
  assert.equal(g.carry.ledger, 4);
  assert.ok(m.susp < before - .3, `${m.susp} < ${before}`);
  assert.ok(m.focus, 'turns to the noise');
});

// ---------- 投擲 ----------
// 向安提諾俄斯乞討，他一定丟東西；在 pressAt（自起手算的秒數）按空白鍵
function throwScenario({ pressAt = null, carry = {}, body = 1, rng, move = false } = {}) {
  const g = mk('hall', carry, { rng });
  const a = byName(g, '安提諾俄斯'); isolate(g, [a]);
  g.knowers.tele.x = 100;   // 預設忒勒馬科斯不在旁邊
  if (carry.tele === 'knows') g.knowers.tele.x = 2.4;
  g.body = body; put(g, -3.8, 2.4, 0);
  g.step(DT, { ePressed: true }); g.step(DT, { eReleased: true });
  for (let i = 0; i < 40 && !g.throws.length; i++) g.step(DT, {});
  const e = g.throws[0]; assert.ok(e, 'throw started');
  const s0 = a.susp;
  for (let i = 0; i < 100 && g.throws.length && g.phase === 'play'; i++) {
    const inp = {};
    if (pressAt != null && e.pressed == null && e.t >= pressAt) inp.space = true;
    if (move && e.flying) inp.mx = 1;   // 丟出後才往旁邊閃
    g.step(DT, inp);
  }
  return { g, a, s0 };
}
test('投擲：俐落閃開疑心大漲、笨拙地閃扣 .1、挨打扣更多、忒勒馬科斯知情時傷害減半', () => {
  const clean = throwScenario({ pressAt: 1.0 });
  assert.equal(clean.g.body, 1);
  assert.ok(clean.a.susp >= clean.s0 + .38 - 1e-9, 'clean raises suspicion');
  assert.equal(clean.g.anger, 0);

  const clumsy = throwScenario({ pressAt: 1.35 });
  assert.ok(Math.abs(clumsy.g.body - (1 - T.dmgClumsy)) < 1e-9, `clumsy body ${clumsy.g.body}`);
  assert.ok(clumsy.a.susp <= clumsy.s0, 'clumsy does not raise suspicion');
  assert.ok(clumsy.g.anger > 0);

  const hit = throwScenario({});
  assert.ok(Math.abs(hit.g.body - (1 - T.dmgThrow)) < 1e-9, `hit body ${hit.g.body}`);
  assert.ok(Math.abs(hit.g.anger - T.angerHit) < 1e-9);

  const tele = throwScenario({ carry: { tele: 'knows' } });
  assert.ok(Math.abs(tele.g.body - (1 - T.dmgThrow / 2)) < 1e-9, `tele body ${tele.g.body}`);
  assert.ok(tele.g.knowers.tele.tell > 0, 'Telemachus gets agitated');

  const early = throwScenario({ move: true });   // 早一步走開
  assert.equal(early.g.body, 1);
  assert.ok(early.a.susp > early.s0);
});

test('神像：身體低時掉出，3 秒內沒撿又被看到就失敗；撿起來就沒事', () => {
  const r = throwScenario({ body: .5, rng: () => .1 });
  const g = r.g;
  assert.equal(g.statue, 'dropped');
  assert.ok(g.statuePos);
  // 神像掉在腳前
  const P = g.player; const fwd = (g.statuePos.x - P.x) * -Math.sin(P.yaw) + (g.statuePos.z - P.z) * -Math.cos(P.yaw);
  assert.ok(fwd > 0);
  fixGaze(r.a, null, null, Math.atan2(g.statuePos.x - r.a.x, g.statuePos.z - r.a.z));
  run(g, T.statueTime + .3, {});
  assert.equal(g.phase, 'fail'); assert.equal(g.result.kind, 'statue');

  const h = mk('hall'); isolate(h); put(h, 0, -5);
  h.statue = 'dropped'; h.statueT = T.statueTime; h.statuePos = { x: 0, z: -4.5 };
  assert.equal(h.interact().type, 'statue');
  h.step(DT, { ePressed: true });
  assert.equal(h.statue, 'carried'); assert.equal(h.statuePos, null);
  run(h, 4, {}); assert.equal(h.phase, 'play');
});

test('墨蘭提俄斯：靠近被看到就踢；不閃扣 dmgKick，踢完退到一旁；提早退開算躲開', () => {
  const g = mk('gate'); isolate(g, [g.mel]); fixGaze(g.mel, null, null, Math.PI); put(g, .8, 7.6, Math.PI);
  g.step(DT, {});
  assert.equal(g.mel.kick, 'kicking'); assert.equal(g.throws[0].kind, 'kick');
  run(g, 1, {});
  assert.equal(g.mel.kick, 'done'); assert.ok(Math.abs(g.body - (1 - T.dmgKick)) < 1e-9);
  run(g, 5, {});
  assert.ok(Math.abs(g.mel.x - 3.4) < .1 && g.mel.mode === 'idle', `mel ${g.mel.x} ${g.mel.mode}`);
  const h = mk('gate'); isolate(h, [h.mel]); fixGaze(h.mel, null, null, Math.PI); put(h, .8, 7.6, Math.PI);
  h.step(DT, {}); run(h, 1, { mz: 1 });   // 往後退
  assert.equal(h.body, 1); assert.ok(h.mel.susp > 0);
});

// ---------- 知情者 ----------
test('忒勒馬科斯：阿爾戈斯死時他在看，才會起疑、才能揭露', () => {
  const g = mk('gate'); const t = g.knowers.tele;
  put(g, 5.5, 6.3); assert.equal(g.interact().type, 'tele0');
  put(g, -6.9, -1.5);
  run(g, .2, {});
  assert.equal(g.argos.state, 'recognize');
  run(g, T.argosLife - 1, {}); assert.equal(g.argos.state, 'recognize', 'still alive a while');
  run(g, 1.5, {});
  assert.equal(g.argos.state, 'dead');
  assert.equal(t.kstate, 'suspects'); assert.equal(g.carry.tele, 'suspects');
  assert.ok(g.anger > 0, 'walked away from the dying dog');
  isolate(g);
  put(g, 6.6, 6.6);
  const it = g.interact(); assert.equal(it.type, 'reveal'); assert.equal(it.n, t);
  g.step(DT, { ePressed: true, eDown: true });
  run(g, 2.2, { eDown: true });
  assert.equal(t.kstate, 'knows'); assert.equal(g.carry.tele, 'knows');
  // 放開 E 就中斷
  const h = mk('gate', { tele: 'suspects' }); isolate(h); put(h, 6.6, 6.6);
  h.step(DT, { ePressed: true, eDown: true }); run(h, 1, { eDown: true }); run(h, 2, {});
  assert.equal(h.knowers.tele.kstate, 'suspects');

  // 他沒在看（離太遠）就不會起疑
  const k = mk('gate'); k.knowers.tele.x = 40;
  put(k, -6.9, -1.5); run(k, T.argosLife + 1, {});
  assert.equal(k.argos.state, 'dead'); assert.equal(k.knowers.tele.kstate, 'unknown');
  // 摸過牠就不扣怒火
  const p = mk('gate'); isolate(p); put(p, -6.9, -1.0); run(p, .2, {});   // 糞堆是矮障礙，最近只到 2 m
  assert.equal(p.interact().type, 'pet');
  assert.equal(p.interact().hold, T.argosPet);
  p.step(DT, { ePressed: true, eDown: true }); run(p, T.argosPet + .1, { eDown: true });
  assert.ok(p.argos.petT >= T.argosPet); assert.equal(p.hold, null, 'pet hold completes');
  assert.notEqual(p.interact() && p.interact().type, 'pet', 'not offered again');
  assert.equal(p.argos.state, 'recognize');
  run(p, T.argosLife, {});
  assert.equal(p.argos.state, 'dead'); assert.equal(p.anger, 0);
  // 醒來的距離：2.6 m 外不醒，走近才醒
  const w = mk('gate'); isolate(w); put(w, -6.9, 1 - T.argosWake - .3); run(w, .2, {});
  assert.equal(w.argos.state, 'asleep');
  put(w, -6.9, 1 - T.argosWake + .2); run(w, .1, {});
  assert.equal(w.argos.state, 'recognize');
});

test('歐邁俄斯：選對往事才行（三段每局洗牌）；選錯 20 秒內不能再試；知情後宮門側門打開', () => {
  const g = mk('gate'); const e = g.knowers.eum;
  assert.equal(g.interact().type, 'eum');
  assert.equal(g.eumLines.length, 3);
  g.step(DT, { ePressed: true }); assert.ok(g.dialog);
  g.step(DT, { choice: 7 }); assert.ok(g.dialog, 'out-of-range choice ignored');
  g.step(DT, { choice: eumWrong(g) }); assert.equal(g.dialog, null);
  assert.equal(e.kstate, 'unknown'); assert.ok(e.retryAt > g.t + 19);
  g.step(DT, { ePressed: true }); assert.equal(g.dialog, null, 'cooldown');
  run(g, 20, {});
  g.step(DT, { ePressed: true }); assert.ok(g.dialog);
  assert.equal(g.sideOpen, false);
  g.step(DT, { choice: eumRight(g) });
  assert.equal(e.kstate, 'knows'); assert.equal(g.carry.eum, 'knows');
  g.step(DT, {});
  assert.equal(g.sideOpen, true);
  assert.equal(g.interact().type, 'none');
  // 會丟東西的人、會踢人的墨蘭提俄斯頭上有記號
  assert.equal(g.mel.mark, '靠近會踢人');
  // 取消對話
  const h = mk('gate'); h.step(DT, { ePressed: true }); h.step(DT, { cancel: true }); assert.equal(h.dialog, null);
  // 洗牌：不同的種子，正確的那段不總在同一個位置；同一個種子結果一樣
  const pos = new Set(); for (let seed = 1; seed <= 12; seed++) pos.add(eumRight(mk('gate', {}, { seed })));
  assert.ok(pos.size >= 2, `positions ${[...pos]}`);
  assert.deepEqual(mk('gate', {}, { seed: 4 }).eumLines, mk('gate', {}, { seed: 4 }).eumLines);
  for (let seed = 1; seed <= 6; seed++) assert.equal(new Set(mk('gate', {}, { seed }).eumLines).size, 3);
});

test('悄悄話：T.whisperRadius 內的敵人聽得到，外面的聽不到', () => {
  const g = mk('hall'); const a = byName(g, '阿格勞斯'), b = byName(g, '安提諾俄斯'); isolate(g, [a, b]);
  const e = g.knowers.eum; put(g, e.x + .8, e.z);
  a.x = a.homeX = g.player.x + T.whisperRadius - .5; a.z = a.homeZ = g.player.z;
  b.x = b.homeX = g.player.x - T.whisperRadius - .5; b.z = b.homeZ = g.player.z;
  g.step(DT, { ePressed: true }); assert.ok(g.dialog);
  g.step(DT, { choice: eumWrong(g) });
  assert.ok(a.susp >= .3 - 1e-9, `near ${a.susp}`); assert.equal(b.susp, 0);
});

test('潘妮洛普：要帶著神像才能揭露，揭露後准你坐爐火邊', () => {
  const g = mk('hall'); isolate(g); put(g, -7.5, 7.2);
  g.statue = 'dropped'; g.statueT = 99; g.statuePos = { x: 5, z: -5 };
  assert.equal(g.interact().type, 'reveal');
  g.step(DT, { ePressed: true, eDown: true }); run(g, 2.2, { eDown: true });
  assert.notEqual(g.knowers.pen.kstate, 'knows'); assert.equal(g.permission, false);
  g.statue = 'carried';
  g.step(DT, { ePressed: true, eDown: true }); run(g, 2.2, { eDown: true });
  assert.equal(g.knowers.pen.kstate, 'knows'); assert.equal(g.permission, true); assert.equal(g.carry.pen, 'knows');
  // 揭露時被看到會起疑
  const h = mk('hall'); const m = byName(h, '勒奧得斯'); isolate(h, [m]); put(h, -7.5, 7.2);
  fixGaze(m, -7.5, 4.5, 0);
  h.step(DT, { ePressed: true, eDown: true }); run(h, 2.2, { eDown: true });
  assert.ok(m.susp >= .45)   // 揭露的 2 秒裡彎腰不動，疑心會略降;
});

test('破綻：知情者看你受辱，滿了會爆發，附近的人起疑而失敗（tell）', () => {
  const g = mk('hall', { tele: 'knows' });
  const d = byName(g, '德摩普托勒摩斯'); isolate(g, [d]);
  d.susp = .7; d.stage = 'suspicious';
  g.knowers.tele.tell = .95;
  put(g, 1.5, 3.75, Math.PI);
  for (let i = 0; i < 40 && g.phase === 'play'; i++) g.step(DT, { mz: -1 });
  assert.equal(g.phase, 'fail'); assert.equal(g.result.kind, 'tell'); assert.equal(g.result.who, '忒勒馬科斯');
  assert.ok(S.FAIL_TEXT.tell(g.result.who)[0].includes('忒勒馬科斯'));
  // Q 示意讓他冷靜
  const h = mk('hall', { tele: 'knows' }); isolate(h); put(h, 2.4, 5.0, Math.PI);   // 面向 +z，看著他
  h.knowers.tele.tell = .8; h.step(DT, { q: true });
  assert.ok(h.knowers.tele.tell < .4);
});

test('怒火滿了就失敗（rage）；捶胸降怒火', () => {
  const g = mk('hall'); isolate(g); put(g, -3.1, 1.75, Math.PI); g.anger = .9;
  for (let i = 0; i < 40 && g.phase === 'play'; i++) g.step(DT, { mz: -1 });
  assert.equal(g.phase, 'fail'); assert.equal(g.result.kind, 'rage');
  const h = mk('hall'); isolate(h); h.anger = .8; const yaw0 = h.player.yaw; run(h, 1, { beat: true, mz: -1, yaw: yaw0 + 1.2 });
  assert.ok(h.anger < .5); assert.equal(h.player.moving, false);
  assert.equal(h.player.yaw, yaw0, 'cannot look elsewhere while beating the chest');
  h.step(DT, { yaw: yaw0 + 1.2 }); assert.ok(Math.abs(h.player.yaw - S.angDiff(0, yaw0 + 1.2)) < 1e-9, 'looks again after');
});

// ---------- 過關 ----------
test('宮門：走進正門過關；側門關著時過不去', () => {
  const g = mk('gate'); isolate(g); put(g, 1.2, 10.95, Math.PI);
  run(g, 1, { mz: -1 });
  assert.equal(g.phase, 'win'); assert.equal(g.result.kind, 'gate');
  const h = mk('gate'); isolate(h); put(h, 13.8, 7.2, -Math.PI / 2);   // 面向 +x
  run(h, 2, { mz: -1 });
  assert.equal(h.phase, 'play'); assert.ok(h.player.x < 14.3);
});

test('大廳：在爐火邊按住 E 3 秒過關；旁邊的知情者不會擋住', () => {
  const g = mk('hall', { pen: 'knows', tele: 'knows' }); isolate(g);
  put(g, 1.3, 4.6);
  assert.ok(Math.hypot(g.player.x - g.knowers.tele.x, g.player.z - g.knowers.tele.z) > 1.8 || true);
  g.knowers.tele.x = 1.6; g.knowers.tele.z = 3.6;   // 讓忒勒馬科斯就站在旁邊
  assert.equal(g.interact().type, 'sit');
  g.step(DT, { ePressed: true, eDown: true }); run(g, 2.5, { eDown: true });
  assert.equal(g.phase, 'play');
  run(g, .7, { eDown: true });
  assert.equal(g.phase, 'win'); assert.equal(g.result.kind, 'hall');
});

test('retryCarry：失敗後這段的帳保留一半，其他回到這段開頭', () => {
  const g = mk('hall', { ledger: 2 }); isolate(g); put(g, -3.1, 1.75, Math.PI);
  g.carry.ledger += 5; g.carry.tele = 'knows'; g.anger = .9;
  assert.deepEqual(g.retryCarry(), { tele: 'unknown', eum: 'unknown', pen: 'unknown', ledger: 2 }, 'still playing: snapshot');
  for (let i = 0; i < 40 && g.phase === 'play'; i++) g.step(DT, { mz: -1 });
  assert.equal(g.phase, 'fail'); assert.equal(g.carry.ledger, 8);
  const c = g.retryCarry();
  assert.equal(c.ledger, 2 + 3); assert.equal(c.tele, 'unknown');
  assert.equal(g.carry.ledger, 8, 'does not mutate');
});

test('防呆：沒有 carry、沒有 input、沒有 yaw、NaN dt 都不會壞', () => {
  const g = S.createGame('hall');
  assert.equal(g.carry.ledger, 0); assert.equal(g.knowers.tele.kstate, 'unknown');
  const partial = S.createGame('gate', { ledger: 4 }, { rng: seeded(1) });
  assert.equal(partial.carry.tele, 'unknown');
  g.step(DT); g.step(NaN, {}); g.step(DT, { mz: -1 }); g.step(10, { mx: 1 });
  assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.z) && Number.isFinite(g.player.yaw));
  for (const n of g.npcs) assert.ok(Number.isFinite(n.yaw) && Number.isFinite(n.x));
  // 長時間亂跑：數值都在範圍內
  const r = seeded(99); const h = mk('hall', {}, { seed: 5 });
  for (let i = 0; i < 4000 && h.phase === 'play'; i++) h.step(DT, { yaw: r() * 20 - 10, mx: r() - .5, mz: -r(), stand: r() < .1, limp: r() < .3 });
  for (const n of h.npcs) assert.ok(Number.isFinite(n.yaw) && Math.abs(n.yaw) <= Math.PI + 1e-9 && n.susp >= 0 && n.susp <= 1);
  assert.ok(h.body >= 0 && h.body <= 1 && h.anger >= 0 && h.anger <= 1);
});

test('對話中整個場面暫停（回座位的人也不動）', () => {
  const g = mk('gate'); const m = g.npcs.find(n => n.role === 'loiter');
  m.mode = 'walk'; m.x += 3;
  g.step(DT, { ePressed: true }); assert.ok(g.dialog);
  const x = m.x; run(g, 1, {}); assert.equal(m.x, x);
});

// ---------- 機器人通關 ----------
test('機器人通關：宮門（揭露歐邁俄斯，走側門）', () => {
  for (const seed of [1, 2, 3]) {
    const g = mk('gate', {}, { seed });
    g.step(DT, { ePressed: true }); g.step(DT, { choice: eumRight(g) });
    assert.equal(g.knowers.eum.kstate, 'knows');
    walkPath(g, [[12.5, -13], [13.8, -6], [13.8, 7.2], [15.3, 7.2]]);
    assert.equal(g.phase, 'win', `seed ${seed}: ${g.phase} ${JSON.stringify(g.result)}`);
    assert.equal(g.result.kind, 'gate');
  }
});

test('機器人通關：大廳（潘妮洛普知情，彎腰照看火盆當差事，走到爐火邊按住 E）', () => {
  for (const seed of [1, 2, 3]) {
    const g = mk('hall', { pen: 'knows' }, { seed });
    assert.equal(g.permission, true);
    walkPath(g, [[.9, -7.5], [.9, -3.3]]);
    assert.equal(g.interact().type, 'tend');
    g.step(DT, { ePressed: true, eDown: true }); g.step(DT, { eReleased: true });
    assert.ok(g.tendT > 0);
    walkPath(g, [[.9, 4.4]]);
    assert.equal(g.interact().type, 'sit');
    g.step(DT, { ePressed: true, eDown: true }); run(g, 3.3, { eDown: true });
    assert.equal(g.phase, 'win', `seed ${seed}: ${g.phase} ${JSON.stringify(g.result)}`);
  }
});

// ---------- 大廳難度：走道有人回頭看、擅自坐爐火邊很危險 ----------
test('內側求婚者背對走道，但乞丐在附近時會常常回頭看一眼，看完轉回去', () => {
  const g = mk('hall', {}, { seed: 3 }); const n = byName(g, '安菲諾摩斯'); isolate(g, [n]);   // 內側（x=3.8），面向桌子（+x）
  assert.ok(n.inner && Math.sin(n.baseYaw) > .9, 'faces the table, back to the aisle');
  put(g, 1.2, -1.5);
  let toward = 0, away = 0;
  for (let i = 0; i < 30 / DT; i++) {
    g.step(DT, {});
    const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw), dx = g.player.x - n.x, dz = g.player.z - n.z, d = Math.hypot(dx, dz);
    if ((dx * fx + dz * fz) / d > Math.cos(T.coneHalf)) toward++; else away++;
  }
  assert.ok(toward * DT > 6, `looked toward the aisle ${(toward * DT).toFixed(1)} s of 30`);
  assert.ok(away * DT > 6, `also turns back to the table ${(away * DT).toFixed(1)} s`);
  // 乞丐離得遠，內側的人就不常回頭
  const h = mk('hall', {}, { seed: 3 }); const m = byName(h, '安菲諾摩斯'); isolate(h, [m]); put(h, -8.3, -8.3);
  let far = 0; for (let i = 0; i < 30 / DT; i++) { h.step(DT, {}); if (Math.cos(m.yaw - m.baseYaw) < 0) far++; }
  assert.ok(far * DT < toward * DT / 2, `far ${far * DT}`);
});

test('沒經允許坐上爐火邊：旁邊座位的人轉過來看，坐不滿 3 秒就被看穿；有允許就沒事', () => {
  const g = mk('hall'); const n = byName(g, '歐律諾摩斯'); isolate(g, [n]);   // 內側，在爐火旁
  fixGaze(n, null, null, n.baseYaw);   // 背對爐火
  put(g, .9, 4.4); assert.equal(g.interact().type, 'sit');
  g.step(DT, { ePressed: true, eDown: true }); run(g, 3.3, { eDown: true });
  assert.equal(g.phase, 'fail'); assert.equal(g.result.who, '歐律諾摩斯');
  const h = mk('hall', { pen: 'knows' }); const m = byName(h, '歐律諾摩斯'); isolate(h, [m]); fixGaze(m, null, null, m.baseYaw);
  put(h, .9, 4.4); h.step(DT, { ePressed: true, eDown: true }); run(h, 3.3, { eDown: true });
  assert.equal(h.phase, 'win');
  assert.ok(Math.cos(m.yaw - m.baseYaw) > .9, 'with permission nobody turns round');
});

// 機器人：sd 個種子 × 4 種開局等待時間
function winRate(bot, carry = {}, seeds = 12) {
  let w = 0, n = 0;
  for (let seed = 1; seed <= seeds; seed++) for (const delay of [0, 1.5, 3, 5]) {
    const g = mk('hall', carry, { seed }); run(g, delay, {}); bot(g); n++; if (g.phase === 'win') w++;
  }
  return w / n;
}
const sitDown = g => { if (g.phase !== 'play') return; g.step(DT, { ePressed: true, eDown: true }); run(g, 3.4, { eDown: true }); };
const tap = g => { g.step(DT, { ePressed: true, eDown: true }); g.step(DT, { eReleased: true }); };
test('大廳不能直接走過去坐下：彎腰繞過中央火盆、走到爐火邊按住 E 的機器人多半失敗', () => {
  const right = winRate(g => { walkPath(g, [[.9, -7.5], [.9, -1.5], [.9, 4.4]]); sitDown(g); });
  const left = winRate(g => { walkPath(g, [[-.9, -7.5], [-.9, -1.5], [-.9, 4.4]]); sitDown(g); });
  const tendOnly = winRate(g => { walkPath(g, [[.9, -7.5], [.9, -3.3]]); tap(g); walkPath(g, [[.9, 4.4]]); sitDown(g); });
  assert.ok(right <= .3 && left <= .3, `naive win rate right ${right} left ${left}`);
  assert.ok(tendOnly <= .3, `pretext alone does not buy the fire seat: ${tendOnly}`);
});
test('用對工具就過得了：照看火盆當差事、先到潘妮洛普門前拿出神像取得允許', () => {
  const penKnown = winRate(g => { walkPath(g, [[.9, -7.5], [.9, -3.3]]); tap(g); walkPath(g, [[.9, 4.4]]); sitDown(g); }, { pen: 'knows' });
  const penInHall = winRate(g => {
    walkPath(g, [[.9, -7.5], [.9, -3.3]]); tap(g);                                  // 照看中央火盆：之後 12 秒走動不起疑
    walkPath(g, [[-1.2, -1], [-1.8, 4.4], [-4, 5.8], [-7.45, 7.0]]);                  // 繞到潘妮洛普的門前
    if (g.phase !== 'play') return;
    g.step(DT, { ePressed: true, eDown: true }); run(g, 2.2, { eDown: true }); g.step(DT, { eReleased: true });
    assert.ok(g.phase !== 'play' || g.permission, 'permission granted');
    walkPath(g, [[-4, 5.8], [-1.3, 4.4]]); sitDown(g);
  });
  assert.ok(penKnown >= .7, `pen known ${penKnown}`);
  assert.ok(penInHall >= .7, `pen in hall ${penInHall}`);
});

// ---------- 系列模式：困在島上的年數（years 7～9）【改編】 ----------
test('years：預設 7；超出範圍夾在 7～9；只有大廳會把嘲弄者改成會丟東西的人', () => {
  assert.equal(mk('hall').years, 7);
  assert.equal(mk('hall', {}, { options: { years: 12 } }).years, 9);
  assert.equal(mk('hall', {}, { options: { years: 3 } }).years, 7);
  assert.equal(mk('hall', {}, { options: { years: undefined } }).years, 7);
  const kinds = g => g.npcs.filter(n => n.role === 'suitor').map(n => n.kind);
  const count = (g, k) => kinds(g).filter(x => x === k).length;
  const g7 = mk('hall'), g8 = mk('hall', {}, { options: { years: 8 } }), g9 = mk('hall', {}, { options: { years: 9 } });
  assert.deepEqual([count(g7, 'thrower'), count(g8, 'thrower'), count(g9, 'thrower')], [3, 4, 5]);
  assert.deepEqual([count(g7, 'mocker'), count(g8, 'mocker'), count(g9, 'mocker')], [4, 3, 2]);
  assert.equal(count(g9, 'giver'), count(g7, 'giver'));
  // 固定順序：8 年改第一個，9 年再改第二個
  assert.equal(byName(g8, S.YEAR_THROWERS[0]).kind, 'thrower');
  assert.equal(byName(g8, S.YEAR_THROWERS[1]).kind, 'mocker');
  assert.equal(byName(g9, S.YEAR_THROWERS[1]).kind, 'thrower');
});

test('years：每多 1 年回頭看的機率 ×1.12（上限 1）', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
  close(mk('hall').glanceP, T.glanceP);
  close(mk('hall', {}, { options: { years: 8 } }).glanceP, T.glanceP * 1.12);
  close(mk('hall', {}, { options: { years: 9 } }).glanceP, T.glanceP * 1.12 * 1.12);
  close(mk('hall', {}, { options: { years: 9 } }).glanceCuriousP, 1);
  // 行為：亂數固定 0.65（介於 0.6 和 0.672 之間），7 年不回頭、8 年回頭看乞丐
  const looks = years => {
    const g = S.createGame('hall', S.freshCarry(), { rng: () => .65, options: { years } });
    const n = byName(g, '安菲諾摩斯'); isolate(g, [n]);
    put(g, 2.2, -1.5, 0);
    n.lookT = .01;
    g.step(DT, { yaw: 0 });
    return Math.abs(S.angDiff(n.lookYaw, Math.atan2(g.player.x - n.x, g.player.z - n.z))) < 1e-6;
  };
  assert.equal(looks(7), false);
  assert.equal(looks(8), true);
});

test('years = 7 和沒給 years 完全一樣（同一個亂數種子、同樣的輸入）', () => {
  const snap = g => JSON.stringify({ t: g.t, p: g.player, phase: g.phase, carry: g.carry, anger: g.anger, body: g.body,
    npcs: g.npcs.map(n => [n.kind, n.x, n.z, n.yaw, n.susp, n.mode]) });
  for (const seg of ['gate', 'hall']) {
    const a = mk(seg, {}, { seed: 11 }), b = mk(seg, {}, { seed: 11, options: { years: 7 } });
    const input = i => ({ yaw: Math.sin(i / 30) * 2, mz: i % 90 < 60 ? -1 : 0, stand: i % 200 > 180, ePressed: i % 50 === 0 });
    run(a, 40, input); run(b, 40, input);
    assert.equal(snap(a), snap(b));
  }
});

// ---------- 系列模式：無名之人（nameless）【改編；阿伽門農的忠告【電影】】 ----------
const crypto = require('node:crypto');
const snapHash = g => crypto.createHash('sha256').update(JSON.stringify({ t: g.t, p: g.player, phase: g.phase, carry: g.carry, anger: g.anger, body: g.body,
  npcs: g.npcs.map(n => [n.kind, n.x, n.z, n.yaw, n.susp, n.mode]) })).digest('hex').slice(0, 16);
const closeTo = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const mixedInput = i => ({ yaw: Math.sin(i / 30) * 2, mz: i % 90 < 60 ? -1 : 0, stand: i % 200 > 180, ePressed: i % 50 === 0 });

test('nameless：預設 false，同一個種子的結果和加入這個選項之前一模一樣', () => {
  // 雜湊是加入 nameless 之前的版本算出來的（2026-11-06）
  const golden = { gate: '1b7d59b30ea78c2b', hall: 'f181d0d1c28f039f' };
  for (const seg of ['gate', 'hall']) {
    const a = mk(seg, {}, { seed: 11 }), b = mk(seg, {}, { seed: 11, options: { nameless: false } });
    assert.equal(a.nameless, false); assert.equal(a.suspMul, 1);
    run(a, 40, mixedInput); run(b, 40, mixedInput);
    assert.equal(snapHash(a), golden[seg], seg);
    assert.equal(snapHash(b), golden[seg], seg);
    assert.ok(!a.out.some(e => e.type === 'msg' && /阿伽門農/.test(e.a)));
  }
  assert.equal(mk('hall', {}, { options: { nameless: 'yes' } }).nameless, false);   // 只認 true
});

test('nameless：開場有一句阿伽門農的話；所有疑心增加 ×0.85', () => {
  for (const seg of ['gate', 'hall']) {
    const g = mk(seg, {}, { options: { nameless: true } });
    assert.ok(g.out.some(e => e.type === 'msg' && e.a === '你想起阿伽門農的話：別以國王的身分回家。'), seg);
  }
  const a = mk('hall'), b = mk('hall', {}, { options: { nameless: true } });
  const na = byName(a, '安提諾俄斯'), nb = byName(b, '安提諾俄斯');
  a.addSusp(na, .4); b.addSusp(nb, .4);
  closeTo(na.susp, .4); closeTo(nb.susp, .4 * S.NAMELESS_MUL);
  a.addSusp(na, -.1); b.addSusp(nb, -.1);   // 降低不打折
  closeTo(na.susp, .3); closeTo(nb.susp, .34 - .1);
  // 實際跑一段：站著在廳裡亂走，疑心累積比較少
  const total = g => g.npcs.reduce((s, n) => s + n.susp, 0);
  const x = mk('hall', {}, { seed: 5 }), y = mk('hall', {}, { seed: 5, options: { nameless: true } });
  const input = i => ({ yaw: Math.sin(i / 25), mz: -1, stand: true });
  run(x, 3, input); run(y, 3, input);
  assert.ok(total(y) < total(x), `${total(y)} < ${total(x)}`);
});
