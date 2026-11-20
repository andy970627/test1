/*
 * 各原型共用的「試玩數據」記錄（遙測，telemetry：遊戲自己記下玩家怎麼玩，之後拿來分析）。
 * 設計文件：docs/design/2026-11-08-telemetry.md
 *
 * 用法（頁面用相對路徑載入本檔，例如 ../telemetry.js；沒載到時頁面要能照玩，所以呼叫前先檢查 window.Telemetry）：
 *   Telemetry.start({proto, version, device, env, clock})   開一局；clock() 回傳 {t, ci, p, z}（音訊時間、循環編號、相位、區域）
 *   Telemetry.event(name, data)        記一筆事件（規則事件 name = 'out'，data = game.out 那一筆原樣；頁面事件 'zone'、'fail'、'retry'…）
 *   Telemetry.input(key, actAt, ctx)   記一次按鍵／放開；ctx = {down, state, off: {bass, blind, beat}}
 *   Telemetry.tick(dt, ctx)            每幀（只在遊玩中）累計時間；ctx = {active, state, frameDt}（給 N1 主動時間比例與幀率）
 *   Telemetry.endRun(result)           一局結束：{outcome: 'win'|'fail'|'quit'|'restart'|'unload'}
 *   Telemetry.survey(answers)          三題快問：{drop, difficulty, fun（1～5 或 null）, note, skipped}
 *   Telemetry.exportJSON() / exportCSV()  下載本機存的最近幾局（瀏覽器裡）；回傳 {filename, text}
 *   Telemetry.setSink(fn)              自動上傳：一局結束、填完快問時呼叫 fn(精簡後的局)；頁面接 claude.ai 試玩頁的資料庫用（本機、itch.io 沒有就不設）
 *   Telemetry.summary()                本局重點數字（給試驗場、錄影時顯示）
 *
 * 純邏輯：不碰 DOM，只有匯出時建立一個下載連結。localStorage 讀寫全部包 try/catch，沒有也能玩（只是不會留到下次）。
 * 不收個人資料：沒有姓名、帳號、IP；每局一個隨機局號；不自動上傳，按「匯出」才會產生檔案。
 * 瀏覽器：全域 Telemetry；Node：module.exports（tools/telemetry/summarize.mjs 與測試共用 summarizeRun、toCSV）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.Telemetry = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const SCHEMA = 'odyssey-telemetry/1';
  const STORE_KEY = 'odyssey.telemetry.v1';        // 最近 MAX_RUNS 局
  const DEVICE_KEY = 'odyssey.telemetry.device';   // 上次選的播放裝置
  const MAX_RUNS = 20;
  const MAX_EVENTS = 8000;                         // 一局最多記幾筆事件／輸入（約 15 分鐘；超過就只計數不存，免得塞爆 localStorage）
  const MAX_INPUTS = 8000;
  const SAVE_EVERY_MS = 5000;                      // 遊玩中每 5 秒存一次（分頁被關也只少最後幾秒）
  const BLIND_OFF_MAX = 1.0;                       // Shift／E 離最近盲區開頭超過 1 秒就不算「對盲區按」，不進時間差分布
  const BLIND_FAIL_WIN = 1.5;                      // 盲區行動後這麼多秒內被追殺／抓到，就算這次行動失敗
  const DEVICES = { speaker: '喇叭', wired: '耳機（有線）', bt: '耳機（藍牙）', unknown: '未選' };

  // ---------- 小工具 ----------
  const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v);
  const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1e3) / 1e3 : v);
  function cleanData(d) {
    // 事件附帶欄位：數字四捨五入到 0.1 毫秒；物件只留一層（game.out 都是平的）
    if (d == null || typeof d !== 'object') return d;
    const o = {};
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (typeof v === 'number') o[k] = r4(v);
      else if (v == null || typeof v === 'string' || typeof v === 'boolean') o[k] = v;
      else if (typeof v === 'object') { try { o[k] = JSON.parse(JSON.stringify(v)); } catch (e) { /* 循環參照就略過 */ } }
    }
    return o;
  }
  function randomId() {
    try {
      const c = root && root.crypto;
      if (c && c.getRandomValues) {
        const a = new Uint8Array(4); c.getRandomValues(a);
        return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* 沒有就用 Math.random */ }
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  }
  function stamp(d) {
    // 檔名用的本地時間 YYYYMMDD-HHMM
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  /** 平均、標準差（σ，母體）、中位、個數。空陣列回傳 n = 0、其他為 null。 */
  function stats(arr) {
    const a = (arr || []).filter(Number.isFinite);
    const n = a.length;
    if (!n) return { n: 0, mean: null, sd: null, median: null, min: null, max: null };
    const mean = a.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n);
    const b = a.slice().sort((x, y) => x - y);
    const median = n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
    return { n, mean, sd, median, min: b[0], max: b[n - 1] };
  }
  /** 直方圖：[lo, hi) 每 step 一格，範圍外的併進頭尾兩格。回傳 [{from, to, n}]。 */
  function histogram(arr, lo, hi, step) {
    const nb = Math.max(1, Math.round((hi - lo) / step));
    const bins = Array.from({ length: nb }, (_, i) => ({ from: r4(lo + i * step), to: r4(lo + (i + 1) * step), n: 0 }));
    for (const v of arr || []) {
      if (!Number.isFinite(v)) continue;
      const i = Math.max(0, Math.min(nb - 1, Math.floor((v - lo) / step)));
      bins[i].n++;
    }
    return bins;
  }

  // ---------- 一局的摘要（頁面即時顯示、匯出、summarize.mjs 都用這一個） ----------
  // 盲區行動的鍵：衝刺、暗殺、走（木馬之夜）；放箭 Mouse0／F（大廳復仇的空檔）
  const BLIND_KEYS = /^(Shift|ShiftLeft|ShiftRight|KeyE|KeyW|KeyA|KeyS|KeyD|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Mouse0|KeyF)$/;
  // 規則事件名稱對照：安撫（木馬之夜 calm_*）＝舉盾（大廳復仇 tele_*）
  const CALM_OK = /^(calm_ok|tele_ok)$/, CALM_BAD = /^(calm_bad|tele_miss)$/;
  /** 規則事件的名稱：game.out 的 sfx 用 a（例如 'calm_ok'），其他用 type（'hint'、'msg'）。 */
  function outName(e) {
    if (!e || e.name !== 'out' || !e.data) return null;
    const d = e.data;
    if (d.type === 'sfx') return typeof d.a === 'string' ? d.a : (d.a && d.a.name) || 'sfx';
    return d.type || null;
  }
  function summarizeRun(run, opts) {
    opts = opts || {};
    const ev = (run && run.events) || [], inp = (run && run.inputs) || [];
    const S = run && run.stats ? run.stats : {};
    const out = {
      runId: run && run.runId, proto: run && run.proto, version: run && run.version,
      device: (run && run.device) || 'unknown',
      outcome: run && run.result ? run.result.outcome : 'unfinished',
      elapsed: null, zones: [], fails: 0, failCodes: {},
      blind: { attempts: 0, ok: 0, rate: null, firstOk: null },
      calm: { ok: 0, bad: 0, rate: null, done: 0, firstOk: null, firstDone: null },
      steps: { masked: 0, loud: 0, rate: null },
      off: {}, activeRatio: null, timeByState: {}, hints: { total: 0, byKey: {} },
      retries: 0, survey: (run && run.survey) || null, fpsMedian: null, dropped: (S.dropped || 0)
    };
    // 經過時間：結束的局用結束時間，沒結束的用最後一筆紀錄
    let last = 0;
    for (const x of ev) if (Number.isFinite(x.gt)) last = Math.max(last, x.gt);
    for (const x of inp) if (Number.isFinite(x.gt)) last = Math.max(last, x.gt);
    out.elapsed = run && run.result && Number.isFinite(run.result.gt) ? run.result.gt : last;

    // 規則事件：失敗、安撫、腳步、提示；追殺／抓到的時間點（判盲區行動成敗）
    const huntAt = [];
    for (const x of ev) {
      const n = outName(x);
      if (x.name === 'fail') {
        out.fails++;
        const c = (x.data && x.data.code) || 'unknown';
        out.failCodes[c] = (out.failCodes[c] || 0) + 1;
      } else if (x.name === 'retry') out.retries++;
      if (!n) continue;
      if (n === 'hunt' || n === 'caught') huntAt.push(x.gt);
      else if (CALM_OK.test(n)) { out.calm.ok++; if (out.calm.firstOk == null) out.calm.firstOk = x.gt; }
      else if (CALM_BAD.test(n)) out.calm.bad++;
      else if (n === 'calm_done') { out.calm.done++; if (out.calm.firstDone == null) out.calm.firstDone = x.gt; }
      else if (n === 'step_masked') out.steps.masked++;
      else if (n === 'step_loud') out.steps.loud++;
      else if (n === 'hint') {
        out.hints.total++;
        const k = x.data.key || 'tutorial', lv = x.data.level || 1;   // 沒有 key 的是第一次出現的教學提示
        const H = out.hints.byKey[k] || (out.hints.byKey[k] = {});
        H[lv] = (H[lv] || 0) + 1;
      }
    }
    const cs = out.calm.ok + out.calm.bad;
    out.calm.rate = cs ? out.calm.ok / cs : null;
    const ss = out.steps.masked + out.steps.loud;
    out.steps.rate = ss ? out.steps.masked / ss : null;

    // 盲區行動：在盲區（state = 'blind'）按下衝刺、暗殺或開始走；之後 BLIND_FAIL_WIN 秒內沒有被追殺／抓到 = 成功
    for (const x of inp) {
      if (!x.down || x.state !== 'blind' || !BLIND_KEYS.test(x.key)) continue;
      out.blind.attempts++;
      const bad = huntAt.some((h) => h >= x.gt && h <= x.gt + BLIND_FAIL_WIN);
      if (!bad) { out.blind.ok++; if (out.blind.firstOk == null) out.blind.firstOk = x.gt; }
    }
    out.blind.rate = out.blind.attempts ? out.blind.ok / out.blind.attempts : null;

    // 按鍵相對拍點的時間差（秒，正 = 晚按）。哪些鍵、哪些時候算由頁面決定：頁面只在「這一下是在對那個拍」時填 off 的欄位
    //   bass：跟低音按的鍵（木馬之夜警戒中的 Q；大廳復仇的 Q／右鍵舉盾）
    //   blind：對盲區／空檔開頭按的鍵（木馬之夜 Shift／E；大廳復仇放箭），離開頭超過 BLIND_OFF_MAX 秒的不算
    //   beat：同上這些鍵對最近的可聽鼓點
    const offs = { bass: [], blind: [], beat: [] };
    for (const x of inp) {
      if (!x.down || !x.off) continue;
      if (Number.isFinite(x.off.bass)) offs.bass.push(x.off.bass);
      if (Number.isFinite(x.off.blind) && Math.abs(x.off.blind) <= BLIND_OFF_MAX) offs.blind.push(x.off.blind);
      if (Number.isFinite(x.off.beat)) offs.beat.push(x.off.beat);
    }
    for (const k of Object.keys(offs)) out.off[k] = opts.values ? Object.assign(stats(offs[k]), { values: offs[k] }) : stats(offs[k]);   // values：summarize.mjs 合併多局時要原始值

    // 每區用時與失敗次數
    for (const zr of (run && run.zones) || []) {
      const leave = zr.leave != null ? zr.leave : out.elapsed;
      out.zones.push({ z: zr.z, enter: zr.enter, leave: zr.leave, time: Math.max(0, leave - zr.enter), fails: zr.fails || 0, codes: zr.codes || {} });
    }

    // 主動時間比例（N1）與各狀態時間
    const tm = S.time || {};
    out.activeRatio = tm.total > 0 ? tm.active / tm.total : null;
    out.timeByState = Object.assign({}, tm.byState || {});
    out.playTime = tm.total || 0;
    // 幀率中位：dt 以毫秒取整的直方圖
    const H = S.dtHist || {};
    const keys = Object.keys(H).map(Number).sort((a, b) => a - b);
    const tot = keys.reduce((s, k) => s + H[k], 0);
    if (tot) {
      let acc = 0, med = keys[0];
      for (const k of keys) { acc += H[k]; if (acc >= tot / 2) { med = k; break; } }
      out.fpsMedian = med > 0 ? Math.round(1000 / med) : null;
    }
    return out;
  }

  // ---------- CSV（一列一筆事件或輸入，給試算表） ----------
  const CSV_COLS = ['runId', 'proto', 'version', 'device', 'kind', 't', 'gt', 'ci', 'p', 'z', 'name', 'key', 'down', 'actAt', 'state', 'off_bass', 'off_blind', 'off_beat', 'data'];
  function csvCell(v) {
    if (v == null) return '';
    const s = typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(runs) {
    const lines = [CSV_COLS.join(',')];
    for (const run of runs || []) {
      const base = { runId: run.runId, proto: run.proto, version: run.version, device: run.device };
      const rows = [];
      for (const e of run.events || []) {
        const n = outName(e);
        rows.push(Object.assign({}, base, { kind: e.name === 'out' ? 'rule' : 'page', t: e.t, gt: e.gt, ci: e.ci, p: e.p, z: e.z, name: n || e.name, data: e.data }));
      }
      for (const x of run.inputs || []) {
        rows.push(Object.assign({}, base, { kind: 'input', t: x.t, gt: x.gt, ci: x.ci, p: x.p, z: x.z, name: x.down ? 'down' : 'up', key: x.key, down: x.down ? 1 : 0,
          actAt: x.actAt, state: x.state, off_bass: x.off && x.off.bass, off_blind: x.off && x.off.blind, off_beat: x.off && x.off.beat }));
      }
      rows.sort((a, b) => (a.gt || 0) - (b.gt || 0));
      // 結果列：一局一列，data 放摘要與主觀分數
      const sm = run.summary || summarizeRun(run);
      rows.push(Object.assign({}, base, { kind: 'result', gt: sm.elapsed, name: sm.outcome,
        data: { fails: sm.fails, activeRatio: sm.activeRatio, blindRate: sm.blind.rate, calmRate: sm.calm.rate, survey: run.survey || null, env: run.env || null } }));
      for (const r of rows) lines.push(CSV_COLS.map((c) => csvCell(r[c])).join(','));
    }
    return lines.join('\n') + '\n';
  }

  // ---------- 儲存（localStorage，全部包 try/catch） ----------
  function defaultStorage() {
    try { const s = root && root.localStorage; if (s) { s.getItem('__t'); return s; } } catch (e) { /* 隱私模式、沙盒 */ }
    return null;
  }

  /** 建一個記錄器（頁面用預設的那一個；測試可以自己建，傳入假的 storage 與時鐘）。 */
  function create(cfg) {
    cfg = cfg || {};
    const storage = cfg.storage !== undefined ? cfg.storage : defaultStorage();
    const wall = cfg.wall || (() => Date.now());
    let run = null, lastRun = null, clock = null, t0 = null, lastSave = 0;
    let sink = null;   // 自動上傳的接收函式（setSink）

    function ctxNow() {
      let c = {};
      try { c = (clock && clock()) || {}; } catch (e) { c = {}; }
      const t = Number.isFinite(c.t) ? c.t : null;
      if (t0 == null && t != null) t0 = t;
      return { t: r4(t), gt: t != null && t0 != null ? r4(t - t0) : null, ci: Number.isFinite(c.ci) ? c.ci : null, p: r3(c.p), z: Number.isFinite(c.z) ? c.z : null };
    }
    function loadRuns() {
      if (!storage) return [];
      try { const a = JSON.parse(storage.getItem(STORE_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
    }
    function writeRuns(list) {
      if (!storage) return false;
      list = list.slice(-MAX_RUNS);
      while (list.length) {
        try { storage.setItem(STORE_KEY, JSON.stringify(list)); return true; } catch (e) { list.shift(); }   // 滿了：丟最舊的一局再試
      }
      return false;
    }
    function persist(r) {
      r = r || run; if (!r) return false;
      lastSave = wall();
      const list = loadRuns().filter((x) => x && x.runId !== r.runId);
      list.push(r);
      return writeRuns(list);
    }
    function maybeSave() { if (run && wall() - lastSave >= SAVE_EVERY_MS) persist(run); }
    function curZone() { return run && run.zones.length ? run.zones[run.zones.length - 1] : null; }
    function openZone(z, gt) {
      const cz = curZone();
      if (cz && cz.leave == null) { if (cz.z === z) return; cz.leave = gt; }
      run.zones.push({ z, enter: gt, leave: null, fails: 0, codes: {} });
    }

    const api = {
      SCHEMA, STORE_KEY, DEVICES,
      /** 開一局。已有進行中的局就先以 'restart' 結束。 */
      start(o) {
        o = o || {};
        if (run) api.endRun({ outcome: 'restart' });
        clock = typeof o.clock === 'function' ? o.clock : null;
        t0 = null;
        const now = new Date(wall());
        run = {
          schema: SCHEMA, proto: o.proto || 'unknown', version: o.version || 'dev',
          runId: o.runId || randomId(), startedAt: now.toISOString(),
          device: o.device || 'unknown', env: cleanData(o.env || {}),
          result: null, survey: null, events: [], inputs: [], zones: [],
          stats: { time: { total: 0, active: 0, byState: {} }, dtHist: {}, dropped: 0 }
        };
        const c = ctxNow();
        if (c.z != null) openZone(c.z, c.gt || 0);
        api.event('start', { device: run.device });
        persist(run);
        return run.runId;
      },
      /** 補記環境（例如音訊開好後才讀得到 outputLatency）。 */
      env(extra) { if (run) Object.assign(run.env, cleanData(extra || {})); },
      event(name, data) {
        if (!run) return null;
        const c = ctxNow();
        // 區域切換：data.to；失敗：算進目前這一區
        if (name === 'zone' && data && Number.isFinite(data.to)) openZone(data.to, c.gt);
        if (name === 'fail') {
          const cz = curZone();
          if (cz) { cz.fails++; const code = (data && data.code) || 'unknown'; cz.codes[code] = (cz.codes[code] || 0) + 1; }
        }
        if (run.events.length >= MAX_EVENTS) { run.stats.dropped++; return null; }
        const rec = Object.assign(c, { name: String(name), data: cleanData(data) });
        run.events.push(rec);
        maybeSave();
        return rec;
      },
      input(key, actAt, ctx) {
        if (!run) return null;
        ctx = ctx || {};
        if (run.inputs.length >= MAX_INPUTS) { run.stats.dropped++; return null; }
        const c = ctxNow();
        const off = ctx.off ? { bass: r4(ctx.off.bass), blind: r4(ctx.off.blind), beat: r4(ctx.off.beat) } : null;
        const rec = Object.assign(c, { key: String(key), down: ctx.down !== false, actAt: r4(actAt), state: ctx.state || null, off });
        // actAt 也換成本局時間（gt 同基準），分析時不用知道音訊時鐘起點
        if (Number.isFinite(actAt) && t0 != null) rec.agt = r4(actAt - t0);
        run.inputs.push(rec);
        maybeSave();
        return rec;
      },
      tick(dt, ctx) {
        if (!run || !(dt > 0) || dt > 1) return;   // 超過 1 秒的幀（分頁休眠）不算
        ctx = ctx || {};
        const tm = run.stats.time;
        tm.total += dt;
        if (ctx.active) tm.active += dt;
        const st = ctx.state || 'other';
        tm.byState[st] = (tm.byState[st] || 0) + dt;
        const fd = Number.isFinite(ctx.frameDt) && ctx.frameDt > 0 ? ctx.frameDt : dt;   // 幀率：頁面給真實幀間隔就用它
        const ms = Math.round(fd * 1000);
        if (ms > 0 && ms < 1000) run.stats.dtHist[ms] = (run.stats.dtHist[ms] || 0) + 1;
      },
      /** 自動上傳用的精簡版：事件與輸入各最多留 3000 筆，其餘欄位照舊（資料庫單筆上限 256 KiB） */
      compact(r) {
        if (!r) return null;
        const cap = (arr) => (Array.isArray(arr) && arr.length > 3000 ? arr.slice(0, 3000) : arr);
        return Object.assign({}, r, { events: cap(r.events), inputs: cap(r.inputs), truncated: !!((r.events && r.events.length > 3000) || (r.inputs && r.inputs.length > 3000)), summary: r.summary || summarizeRun(r) });
      },
      setSink(fn) { sink = typeof fn === 'function' ? fn : null; },
      endRun(result) {
        if (!run) return null;
        result = result || {};
        const c = ctxNow();
        const cz = curZone(); if (cz && cz.leave == null) cz.leave = c.gt;
        run.result = Object.assign({ outcome: result.outcome || 'unknown', gt: c.gt, endedAt: new Date(wall()).toISOString() }, cleanData(result));
        run.result.gt = c.gt;
        run.stats.time.total = r4(run.stats.time.total); run.stats.time.active = r4(run.stats.time.active);
        run.summary = summarizeRun(run);
        persist(run);
        lastRun = run; run = null;
        if (sink) { try { const out = sink(api.compact(lastRun)); if (out && typeof out.catch === 'function') out.catch(() => {}); } catch (e) { /* 上傳失敗不影響遊戲 */ } }
        return lastRun;
      },
      /** 三題快問：記在進行中的局；局已結束就記在剛結束的那一局。 */
      survey(answers) {
        const r = run || lastRun; if (!r) return null;
        const a = answers || {};
        const sc = (v) => (Number.isFinite(+v) && +v >= 1 && +v <= 5 ? +v : null);
        r.survey = { drop: sc(a.drop), difficulty: sc(a.difficulty), fun: sc(a.fun), note: a.note ? String(a.note).slice(0, 2000) : '',
          skipped: !!a.skipped, at: run ? ctxNow().gt : (r.result && r.result.gt), when: a.when || null };
        if (r.summary) r.summary.survey = r.survey;
        persist(r);
        if (sink && !run) { try { const out = sink(api.compact(r)); if (out && typeof out.catch === 'function') out.catch(() => {}); } catch (e) { /* 略過 */ } }
        return r.survey;
      },
      /** 目前這局（或剛結束那局）有沒有回答／略過快問。 */
      surveyed() { const r = run || lastRun; return !!(r && r.survey); },
      active() { return !!run; },
      current() { return run; },
      last() { return lastRun; },
      runs() {
        const list = loadRuns();
        if (run && !list.some((x) => x.runId === run.runId)) list.push(run);
        return list.map((x) => (run && x.runId === run.runId ? run : x));
      },
      save() { return persist(run || lastRun); },
      clear() { try { if (storage) storage.removeItem(STORE_KEY); } catch (e) { /* 略過 */ } },
      summary() { const r = run || lastRun; return r ? summarizeRun(r) : null; },
      lastDevice() { try { return (storage && storage.getItem(DEVICE_KEY)) || null; } catch (e) { return null; } },
      rememberDevice(d) { try { if (storage) storage.setItem(DEVICE_KEY, d); } catch (e) { /* 略過 */ } },
      setDevice(d) { if (run) { run.device = d; } },
      exportJSON(o) {
        o = o || {};
        const list = api.runs();
        const latest = list[list.length - 1];
        const proto = (latest && latest.proto) || 'unknown';
        const filename = 'telemetry_' + proto + '_' + stamp(new Date(wall())) + '_' + ((latest && latest.runId) || 'none') + '.json';
        const text = JSON.stringify({ schema: SCHEMA, exportedAt: new Date(wall()).toISOString(), runs: list.map((r) => Object.assign({}, r, { summary: r.summary || summarizeRun(r) })) }, null, 1);
        if (o.download !== false) download(filename, text, 'application/json');
        return { filename, text, count: list.length };
      },
      exportCSV(o) {
        o = o || {};
        const list = api.runs();
        const latest = list[list.length - 1];
        const proto = (latest && latest.proto) || 'unknown';
        const filename = 'telemetry_' + proto + '_' + stamp(new Date(wall())) + '_' + ((latest && latest.runId) || 'none') + '.csv';
        const text = '﻿' + toCSV(list);   // BOM：Excel 開中文不亂碼
        if (o.download !== false) download(filename, text, 'text/csv');
        return { filename, text, count: list.length };
      }
    };
    return api;
  }

  /** 瀏覽器下載（唯一碰 DOM 的地方）；Node 裡什麼都不做。 */
  function download(filename, text, type) {
    try {
      if (typeof document === 'undefined' || typeof Blob === 'undefined') return false;
      const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) { return false; }
  }

  /** 讀瀏覽器環境（不含任何個人資料）：瀏覽器字串、視窗大小、像素比；extra 由頁面補（延遲、實驗開關）。 */
  function collectEnv(extra) {
    const env = {};
    try {
      const n = root.navigator || {};
      env.ua = n.userAgent || null;
      env.platform = n.platform || null;
      env.viewport = { w: root.innerWidth || null, h: root.innerHeight || null, dpr: root.devicePixelRatio || 1 };
      env.touch = !!(n.maxTouchPoints > 0);
    } catch (e) { /* Node 或沙盒 */ }
    return Object.assign(env, extra || {});
  }

  const def = create();
  return Object.assign(def, { create, summarizeRun, BLIND_OFF_MAX, BLIND_FAIL_WIN, toCSV, stats, histogram, collectEnv, outName, CSV_COLS, MAX_RUNS });
});
