/*
 * 關卡編輯器的純邏輯（畫面在 ../level-editor.html）：不碰 DOM，Node 測試也能載入。
 * 瀏覽器：全域 LevelEditorCore；Node：module.exports。
 *
 * 資料格式（總控 11/17 介面約定）：和 RissetRules.buildLevel() 的回傳值同結構的純資料
 *   size、walls（矮掩體 low: true）、shadows、zones（start、exit、belly）、guards（route 點、yaw）、horse、gate。
 *   腹中高度寫字串 "BELLY_Y"（zones[].start.y、horse.bellyY），角度存數字（弧度）。
 *   正式資料在 troy-prologue/level-troy.js（window.TroyLevelData，規則角色抽出）；還沒有時用 fromBuilt(buildLevel()) 換算。
 * 遊戲讀資料前要經 resolveLevel：把 "BELLY_Y" 換成數字。規則有 RissetRules.resolveLevel 就用它，沒有用這裡的備援。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LevelEditorCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /** buildLevel() 的回傳（腹中高度是數字）→ 純資料（腹中高度寫 "BELLY_Y"）。bellyY 是規則常數 T.BELLY_Y。 */
  function fromBuilt(built, bellyY) {
    const d = clone(built);
    for (const z of d.zones || []) if (z.start && bellyY && z.start.y === bellyY) z.start.y = 'BELLY_Y';
    if (d.horse && bellyY && d.horse.bellyY === bellyY) d.horse.bellyY = 'BELLY_Y';
    return d;
  }
  /** 純資料 → 給 createLevel({level}) 的關卡：把字串 "BELLY_Y" 換成數字（深層，任何欄位）。 */
  function resolveLevel(data, bellyY) {
    const walk = (v) => {
      if (v === 'BELLY_Y') return bellyY;
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
      return v;
    };
    return walk(data);
  }
  /** 匯出文字：兩格縮排的 JSON（欄位順序照資料，不重排）。 */
  function exportText(data) { return JSON.stringify(data, null, 2) + '\n'; }
  /** 匯入文字 → 資料；格式不對丟出錯誤（訊息是給人看的中文）。 */
  function importText(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new Error('不是 JSON 檔：' + e.message); }
    const miss = ['size', 'walls', 'shadows', 'zones', 'guards'].filter((k) => !(k in (d || {})));
    if (miss.length) throw new Error('缺少欄位：' + miss.join('、'));
    if (!Array.isArray(d.walls) || !Array.isArray(d.shadows) || !Array.isArray(d.zones) || !Array.isArray(d.guards)) throw new Error('walls、shadows、zones、guards 要是清單');
    return d;
  }
  function sameData(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // ---------- 幾何 ----------
  const inRect = (p, r) => p.x >= Math.min(r.x0, r.x1) && p.x <= Math.max(r.x0, r.x1) && p.z >= Math.min(r.z0, r.z1) && p.z <= Math.max(r.z0, r.z1);
  /** 兩個矩形之間最短距離（重疊或相接＝0）。 */
  function rectGap(a, b) {
    const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
    const dz = Math.max(0, Math.max(a.z0, b.z0) - Math.min(a.z1, b.z1));
    return Math.hypot(dx, dz);
  }
  function segDist(p, a, b) {
    const vx = b.x - a.x, vz = b.z - a.z, L = vx * vx + vz * vz;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / L)) : 0;
    return Math.hypot(p.x - a.x - t * vx, p.z - a.z - t * vz);
  }
  /** 點到衛兵巡邏路線（迴圈）的最短距離。 */
  function routeDist(p, route) {
    if (!route || !route.length) return Infinity;
    if (route.length === 1) return Math.hypot(p.x - route[0].x, p.z - route[0].z);
    let d = Infinity;
    for (let i = 0; i < route.length; i++) d = Math.min(d, segDist(p, route[i], route[(i + 1) % route.length]));
    return d;
  }

  // ---------- 加長全圖：在 x = at 插入 dx 公尺 ----------
  /** 跨過 at、寬 10 公尺以上的（外框、長牆）拉長；其他長方形中心在 at 以東的整塊往東移；點 x ≥ at 的往東移。size.w 加 dx。回傳新資料，不改原本的。
   *  （出口、矮牆這類小東西剛好被切到時不拉長，免得出口變成 30 公尺寬） */
  function insertWidth(data, at, dx) {
    const d = clone(data);
    const R = (r) => {
      if (!r || !Number.isFinite(r.x0)) return;
      const lo = Math.min(r.x0, r.x1), hi = Math.max(r.x0, r.x1);
      if (lo < at && hi > at && hi - lo >= 10) { if (r.x1 >= r.x0) r.x1 += dx; else r.x0 += dx; return; }
      if ((lo + hi) / 2 >= at) { r.x0 += dx; r.x1 += dx; }
    };
    const P = (p) => { if (p && Number.isFinite(p.x) && p.x >= at) p.x += dx; };
    d.walls.forEach(R); d.shadows.forEach(R);
    for (const z of d.zones) { P(z.start); R(z.belly); if (z.exit) { R(z.exit.rect); if (Number.isFinite(z.exit.x)) P(z.exit); } }
    for (const q of d.guards) (q.route || []).forEach(P);
    if (d.horse) { R(d.horse); P(d.horse.trapdoor); P(d.horse.drop); }
    if (d.gate) { R(d.gate); P(d.gate.latch); }
    d.size = Object.assign({}, d.size, { w: d.size.w + dx });
    return d;
  }

  // ---------- 各區範圍 ----------
  /**
   * 資料裡沒有寫各區的邊界，這裡用出口推：出口是一條南北向的矩形（kind 'rect'），它的西緣是本區東界、東緣是下一區西界。
   * 腹中那區（有 belly）只算腹中矩形。最後一區到全圖東緣。回傳 [{id, name, x0, x1, belly}]。
   */
  function zoneSpans(data) {
    const out = []; let west = 0;
    for (const z of data.zones) {
      if (z.belly) { out.push({ id: z.id, name: z.name, x0: z.belly.x0, x1: z.belly.x1, belly: true }); continue; }
      if (!z.start || !z.exit) { out.push({ id: z.id, name: z.name, x0: null, x1: null, intro: true }); continue; }   // 開場（沒有出口）：故事字卡
      const r = z.exit && z.exit.kind === 'rect' && z.exit.rect;
      const east = r ? Math.min(r.x0, r.x1) : data.size.w;
      out.push({ id: z.id, name: z.name, x0: west, x1: east });
      if (r) west = Math.max(r.x0, r.x1);
    }
    return out;
  }
  const cx = (r) => (r.x0 + r.x1) / 2;

  /**
   * 照期末企劃第 2 節「窄巷重排」表逐區檢查。每項 {label, state: 'pass'|'warn'|'fail'|'info', text}。
   * K：規則常數（取 RUN_R 當「聽得到你跑步」的距離；沒有用 8）。
   */
  function checkZones(data, K) {
    const runR = (K && K.RUN_R) || 8;
    const spans = zoneSpans(data);
    return spans.map((S) => {
      const z = data.zones.find((q) => q.id === S.id) || {};
      const items = [];
      const guards = data.guards.filter((q) => q.zone === S.id);
      if (S.intro) { items.push({ label: '開場', state: 'info', text: '故事字卡，沒有場景，不檢查' }); return { zone: S, items }; }
      const nG = guards.length, posts = guards.filter((q) => (q.route || []).length === 1).length;
      items.push({ label: '衛兵 ≤ 3', state: nG <= 3 ? 'pass' : 'fail', text: nG + ' 名（巡邏 ' + (nG - posts) + '、站崗 ' + posts + '）' });
      if (S.belly) { items.push({ label: '腹中', state: 'info', text: '木馬肚子裡，不會失敗；影子、空地不檢查' }); return { zone: S, items }; }
      const inZone = (r) => cx(r) >= S.x0 && cx(r) < S.x1;
      const bellies = data.zones.filter((q) => q.belly).map((q) => q.belly);   // 腹中的影子算在腹中那區
      const shadows = data.shadows.filter((r) => inZone(r) && !bellies.some((b) => inRect({ x: cx(r), z: (r.z0 + r.z1) / 2 }, b)));
      const nS = shadows.length;
      items.push({ label: '影子 ≥ 3 塊', state: nS >= 3 ? 'pass' : 'fail', text: nS + ' 塊' });
      // 最遠相隔：每塊影子到最近的另一塊的距離，取最大的那個（被追殺時 3 秒內跑得到下一塊）
      let far = 0, farName = '';
      for (const a of shadows) {
        let best = Infinity; for (const b of shadows) if (a !== b) best = Math.min(best, rectGap(a, b));
        if (Number.isFinite(best) && best > far) { far = best; farName = a.name || ''; }
      }
      if (nS >= 2) items.push({ label: '影子相隔 ≤ 10 公尺', state: far <= 10 ? 'pass' : 'fail', text: '最孤立的一塊離最近的另一塊 ' + far.toFixed(1) + ' 公尺' + (farName ? '（' + farName + '）' : '') });
      const lows = data.walls.filter((w) => w.low && inZone(w)).length;
      items.push({ label: '矮掩體', state: lows >= 3 ? 'pass' : 'warn', text: lows + ' 個（新區要 3 個以上；窄巷補 2 個）' });
      const st = z.start;
      const startIn = st && data.shadows.some((r) => inRect(st, r));
      items.push({ label: '起點在影子裡', state: startIn ? 'pass' : 'fail', text: startIn ? '是' : '起點 (' + (st ? st.x + ', ' + st.z : '—') + ') 不在任何影子裡' });
      // 空地：一格 1 公尺取樣，不在牆裡、離所有衛兵路線都超過 RUN_R 的格子；找最長的一條東西向或南北向連續段
      const walls = data.walls.filter((w) => !w.low);
      const free = (x, zz) => { const p = { x, z: zz }; if (walls.some((w) => inRect(p, w))) return false; return guards.every((q) => routeDist(p, q.route) > runR); };
      const zMax = data.size.h;
      let best = 0;
      for (let zz = 0.5; zz < zMax; zz += 1) { let run = 0; for (let x = S.x0 + 0.5; x < S.x1; x += 1) { run = free(x, zz) ? run + 1 : 0; best = Math.max(best, run); } }
      for (let x = S.x0 + 0.5; x < S.x1; x += 1) { let run = 0; for (let zz = 0.5; zz < zMax; zz += 1) { run = free(x, zz) ? run + 1 : 0; best = Math.max(best, run); } }
      items.push({ label: '8 公尺以上的空地', state: best >= 8 ? 'pass' : 'warn', text: '估算：離每條衛兵路線都超過 ' + runR + ' 公尺的最長直線 ' + best + ' 公尺' });
      // 算不了的：列提醒
      const gatePosts = posts > 1 || nG - posts > 1;
      items.push({ label: '關口寬 3～4 公尺', state: 'info', text: '程式判斷不了哪裡是關口：請自己量' });
      items.push({ label: '同一關口最多 1 巡邏＋1 站崗', state: gatePosts ? 'warn' : 'info', text: gatePosts ? '這區巡邏或站崗超過 1 名：確認他們不在同一個關口' : '請確認關口上的衛兵' });
      return { zone: S, items };
    });
  }

  return { clone, fromBuilt, resolveLevel, exportText, importText, sameData, inRect, rectGap, routeDist, insertWidth, zoneSpans, checkZones };
});
