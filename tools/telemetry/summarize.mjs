#!/usr/bin/env node
/*
 * 試玩數據摘要：讀原型「匯出數據」下載的 JSON（prototypes/telemetry.js 產生），印出每局與依裝置合併的重點數字。
 * 設計文件：docs/design/2026-11-08-telemetry.md 第 4 節。
 *
 * 用法：
 *   node tools/telemetry/summarize.mjs <檔案或資料夾> [更多檔案…] [--json] [--bins 50]
 *     資料夾：讀裡面所有 .json（不往下層找）。同一局號出現在好幾個檔裡，留結束了的那一份（都沒結束就留事件最多的）。
 *     --json   改印機器可讀的 JSON（給其他工具）
 *     --bins   時間差直方圖每格幾毫秒（預設 50）
 *
 * 輸出：每局（每區用時與失敗次數、盲區行動成功率、安撫對拍成功率、腳步合拍率、主動時間比例 N1、提示次數、主觀分數），
 *       再依裝置（喇叭／耳機有線／耳機藍牙）分組合併：按鍵相對拍點的時間差（平均、σ、中位、直方圖文字版）與上面各項。
 * 一局的數字由 prototypes/telemetry.js 的 summarizeRun 算（頁面上即時顯示的也是它），這裡只負責讀檔、合併、排版。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const Telemetry = require('../../prototypes/telemetry.js');
const { summarizeRun, stats, histogram } = Telemetry;

const DEVICE_NAMES = { speaker: '喇叭', wired: '耳機（有線）', bt: '耳機（藍牙）', unknown: '未選裝置' };
const ZONE_NAMES = { 'troy-prologue': ['開場', '木馬腹中', '神殿廣場', '城牆下的窄巷', '城門'] };
const OFF_NAMES = {
  bass: '跟低音按（木馬之夜警戒中的 Q；大廳復仇舉盾）',
  blind: '對盲區／空檔開頭按（木馬之夜 Shift／E；大廳復仇放箭；±1 秒內）',
  beat: '同上的鍵對最近的可聽鼓點'
};
const PROTO_NAMES = { 'troy-prologue': '木馬之夜', vengeance: '大廳復仇' };

/** 讀一個 JSON：匯出檔 {runs: [...]}、單局 {runId…} 或陣列都收。 */
export function runsFromJSON(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj.flatMap(runsFromJSON);
  if (Array.isArray(obj.runs)) return obj.runs;
  if (obj.runId) return [obj];
  return [];
}
export function loadRuns(paths) {
  const files = [];
  for (const p of paths) {
    const st = fs.statSync(p);
    if (st.isDirectory()) for (const f of fs.readdirSync(p).sort()) { if (f.toLowerCase().endsWith('.json')) files.push(path.join(p, f)); }
    else files.push(p);
  }
  const byId = new Map();
  for (const f of files) {
    let obj; try { obj = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { console.warn('略過（不是 JSON）：' + f); continue; }
    for (const r of runsFromJSON(obj)) {
      const old = byId.get(r.runId);
      const score = (x) => (x.result ? 1e9 : 0) + (x.events ? x.events.length : 0) + (x.inputs ? x.inputs.length : 0);
      if (!old || score(r) >= score(old)) byId.set(r.runId, r);
    }
  }
  return { files, runs: [...byId.values()].sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt))) };
}

/** 合併多局：依原型＋裝置分組（不同原型的數字不混在一起）。回傳 {runs: [一局摘要], groups: {'原型|裝置': 合併摘要}}。 */
export function summarize(runs) {
  const per = runs.map((r) => summarizeRun(r, { values: true }));
  const groups = {};
  for (const s of per) { const k = (s.proto || 'unknown') + '|' + s.device; (groups[k] = groups[k] || []).push(s); }
  const merged = {};
  for (const [k, list] of Object.entries(groups)) merged[k] = Object.assign(mergeGroup(list), { proto: list[0].proto, device: list[0].device });
  return { runs: per, groups: merged };
}
function sum(list, f) { return list.reduce((a, s) => a + (f(s) || 0), 0); }
function mergeGroup(list) {
  const g = { n: list.length, outcomes: {}, off: {}, zones: {}, failCodes: {}, hints: {}, survey: {} };
  for (const s of list) g.outcomes[s.outcome] = (g.outcomes[s.outcome] || 0) + 1;
  for (const k of ['bass', 'blind', 'beat']) {
    const vals = list.flatMap((s) => (s.off[k] && s.off[k].values) || []);
    g.off[k] = Object.assign(stats(vals), { values: vals });
  }
  const ba = sum(list, (s) => s.blind.attempts), bo = sum(list, (s) => s.blind.ok);
  g.blind = { attempts: ba, ok: bo, rate: ba ? bo / ba : null, firstOk: stats(list.map((s) => s.blind.firstOk)) };
  const co = sum(list, (s) => s.calm.ok), cb = sum(list, (s) => s.calm.bad);
  g.calm = { ok: co, bad: cb, rate: co + cb ? co / (co + cb) : null, done: sum(list, (s) => s.calm.done), firstDone: stats(list.map((s) => s.calm.firstDone)) };
  const sm = sum(list, (s) => s.steps.masked), sl = sum(list, (s) => s.steps.loud);
  g.steps = { masked: sm, loud: sl, rate: sm + sl ? sm / (sm + sl) : null };
  // 主動時間比例：時間加權（總主動秒數 ÷ 總遊玩秒數），不是各局比例的平均
  const pt = sum(list, (s) => s.playTime), at = sum(list, (s) => (s.activeRatio || 0) * (s.playTime || 0));
  g.activeRatio = pt > 0 ? at / pt : null; g.playTime = pt;
  g.fails = sum(list, (s) => s.fails);
  for (const s of list) {
    for (const [c, n] of Object.entries(s.failCodes)) g.failCodes[c] = (g.failCodes[c] || 0) + n;
    for (const z of s.zones) {
      const Z = g.zones[z.z] || (g.zones[z.z] = { visits: 0, time: 0, fails: 0, times: [] });
      Z.visits++; Z.time += z.time; Z.fails += z.fails; Z.times.push(z.time);
    }
    for (const [k, lv] of Object.entries(s.hints.byKey)) for (const [l, n] of Object.entries(lv)) {
      const H = g.hints[k] || (g.hints[k] = {}); H[l] = (H[l] || 0) + n;
    }
  }
  g.hintTotal = sum(list, (s) => s.hints.total);
  for (const q of ['drop', 'difficulty', 'fun']) g.survey[q] = stats(list.map((s) => (s.survey && !s.survey.skipped ? s.survey[q] : null)));
  g.survey.answered = list.filter((s) => s.survey && !s.survey.skipped).length;
  g.survey.skipped = list.filter((s) => s.survey && s.survey.skipped).length;
  g.notes = list.filter((s) => s.survey && s.survey.note).map((s) => ({ runId: s.runId, note: s.survey.note }));
  return g;
}

// ---------- 排版 ----------
const pct = (v) => (v == null ? '—' : Math.round(v * 100) + '%');
const sec = (v) => (v == null ? '—' : v.toFixed(1) + ' 秒');
const ms = (v) => (v == null ? '—' : Math.round(v * 1000) + '');
const zname = (proto, z) => { const n = ZONE_NAMES[proto]; return '第 ' + z + ' 區' + (n && n[z] ? ' ' + n[z] : ''); };
const codes = (o) => Object.entries(o).map(([c, n]) => c + '×' + n).join('、');
export function histText(vals, binMs) {
  if (!vals.length) return ['    （沒有資料）'];
  const step = binMs / 1000;
  const lo = Math.max(-1, Math.floor(Math.min(...vals) / step) * step), hi = Math.min(1, Math.ceil((Math.max(...vals) + 1e-9) / step) * step);
  const bins = histogram(vals, lo, Math.max(hi, lo + step), step);
  const max = Math.max(...bins.map((b) => b.n));
  return bins.map((b) => {
    const label = (ms(b.from) + '～' + ms(b.to)).padStart(13) + ' ms';
    return '    ' + label + ' │' + '█'.repeat(max ? Math.round(b.n / max * 30) : 0) + ' ' + b.n;
  });
}
function offLines(o, binMs, withHist) {
  const out = [];
  for (const k of ['bass', 'blind', 'beat']) {
    const s = o[k]; if (!s) continue;
    out.push('  ' + OFF_NAMES[k] + '：n ' + s.n + '，平均 ' + ms(s.mean) + ' ms，σ ' + ms(s.sd) + ' ms，中位 ' + ms(s.median) + ' ms（正 = 晚按）');
    if (withHist && s.n) out.push(...histText(s.values || [], binMs));
  }
  return out;
}
export function formatReport(res, opt = {}) {
  const binMs = opt.bins || 50;
  const L = [];
  L.push('試玩數據摘要：' + res.runs.length + ' 局' + (opt.files ? '（' + opt.files.length + ' 個檔）' : ''));
  for (const s of res.runs) {
    L.push('');
    L.push('== 局 ' + s.runId + '｜' + (PROTO_NAMES[s.proto] || s.proto) + '｜' + (DEVICE_NAMES[s.device] || s.device) + '｜版本 ' + (s.version || 'dev') + '｜結果 ' + s.outcome + '｜經過 ' + sec(s.elapsed) + '｜重來 ' + s.retries + ' 次');
    for (const z of s.zones) L.push('  ' + zname(s.proto, z.z) + '：用時 ' + sec(z.time) + '，失敗 ' + z.fails + (z.fails ? '（' + codes(z.codes) + '）' : ''));
    L.push('  盲區行動：' + s.blind.ok + '/' + s.blind.attempts + ' 成功（' + pct(s.blind.rate) + '），第一次成功在 ' + sec(s.blind.firstOk));
    L.push('  安撫對拍：' + s.calm.ok + '/' + (s.calm.ok + s.calm.bad) + '（' + pct(s.calm.rate) + '），安撫完成 ' + s.calm.done + ' 次，第一次在 ' + sec(s.calm.firstDone));
    L.push('  腳步合拍：' + s.steps.masked + '/' + (s.steps.masked + s.steps.loud) + '（' + pct(s.steps.rate) + '）');
    L.push('  主動時間比例（N1）：' + pct(s.activeRatio) + '（遊玩 ' + sec(s.playTime) + '；' + Object.entries(s.timeByState).map(([k, v]) => k + ' ' + v.toFixed(1)).join('、') + '）');
    L.push('  提示：' + s.hints.total + ' 次' + (s.hints.total ? '（' + Object.entries(s.hints.byKey).map(([k, lv]) => k + ' ' + Object.entries(lv).map(([l, n]) => '第' + l + '階×' + n).join('/')).join('、') + '）' : ''));
    L.push(...offLines(s.off, binMs, false));
    const sv = s.survey;
    L.push('  主觀：' + (!sv ? '沒填' : sv.skipped ? '略過' : '驟降 ' + (sv.drop ?? '—') + '、難度 ' + (sv.difficulty ?? '—') + '、好玩 ' + (sv.fun ?? '—') + (sv.note ? '；「' + sv.note + '」' : '')));
    if (s.fpsMedian) L.push('  幀率中位：' + s.fpsMedian + ' fps' + (s.dropped ? '；超過上限沒存的紀錄 ' + s.dropped + ' 筆' : ''));
  }
  for (const g of Object.values(res.groups)) {
    L.push('');
    L.push('######## ' + (PROTO_NAMES[g.proto] || g.proto) + '・依裝置：' + (DEVICE_NAMES[g.device] || g.device) + '（' + g.n + ' 局：' + codes(g.outcomes) + '）');
    L.push(...offLines(g.off, binMs, true));
    L.push('  盲區行動成功率：' + pct(g.blind.rate) + '（' + g.blind.ok + '/' + g.blind.attempts + '），第一次成功中位 ' + sec(g.blind.firstOk.median));
    L.push('  安撫對拍成功率：' + pct(g.calm.rate) + '（' + g.calm.ok + '/' + (g.calm.ok + g.calm.bad) + '），安撫完成 ' + g.calm.done + ' 次');
    L.push('  腳步合拍率：' + pct(g.steps.rate));
    L.push('  主動時間比例（N1，時間加權）：' + pct(g.activeRatio) + '（共 ' + sec(g.playTime) + '）');
    for (const [z, Z] of Object.entries(g.zones)) L.push('  ' + zname(g.proto, +z) + '：' + Z.visits + ' 次，平均用時 ' + sec(Z.time / Z.visits) + '，失敗共 ' + Z.fails);
    L.push('  失敗原因：' + (g.fails ? codes(g.failCodes) : '無'));
    L.push('  提示：' + g.hintTotal + ' 次');
    L.push('  主觀（' + g.survey.answered + ' 份，略過 ' + g.survey.skipped + '）：驟降 ' + fmt1(g.survey.drop.mean) + '、難度 ' + fmt1(g.survey.difficulty.mean) + '、好玩 ' + fmt1(g.survey.fun.mean));
    for (const n of g.notes) L.push('    「' + n.note + '」（' + n.runId + '）');
  }
  return L.join('\n');
}
const fmt1 = (v) => (v == null ? '—' : v.toFixed(1));

// ---------- 命令列 ----------
function main(argv) {
  const paths = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') opt.json = true;
    else if (argv[i] === '--bins') opt.bins = +argv[++i];
    else if (argv[i] === '-h' || argv[i] === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); return 0; }
    else paths.push(argv[i]);
  }
  if (!paths.length) { console.error('用法：node tools/telemetry/summarize.mjs <檔案或資料夾> [--json] [--bins 50]'); return 1; }
  const { files, runs } = loadRuns(paths);
  if (!runs.length) { console.error('沒有找到任何一局的數據（' + files.length + ' 個檔）'); return 1; }
  const res = summarize(runs);
  if (opt.json) {
    // JSON 輸出不帶原始時間差陣列以外的大東西；values 留著方便畫圖
    console.log(JSON.stringify(res, null, 1));
  } else console.log(formatReport(res, { bins: opt.bins, files }));
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
