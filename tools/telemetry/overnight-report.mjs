#!/usr/bin/env node
/* 整夜驗證報告：把程式玩家批次結果與兩版錄音分析合成一份 Markdown，逐項對設計席門檻判過／不過
 *
 *   node tools/telemetry/overnight-report.mjs --sim <overnight-sim 的 JSON> --cover <錄音資料夾（不停）> --gap <錄音資料夾（留空檔）> \
 *        --out docs/process/overnight-validation-2026-11-11.md
 *
 * 門檻：docs/design/2026-11-10-core-direction-illusion.md 第 7 節（7.5 錄音、7.8 程式玩家）。
 * 錄音資料夾要有 analysis.json（analyze.mjs 產生；喇叭模擬 analysis-speaker.json 有就一起判）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { formatTable, causeText } from './overnight-sim.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const rel = (p) => path.relative(REPO, path.resolve(p)).split(path.sep).join('/');
const median = (a) => { const s = a.filter(v => v != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
const f1 = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toString());
const mark = (ok) => (ok === undefined ? '（只列）' : ok == null ? '— 無資料' : ok ? '✅ 過' : '❌ 不過');

/** 錄音分析裡要對門檻的數字（一般窗／警戒窗分開；有玩家動作音的窗不計）。 */
export function recNumbers(an) {
  if (!an) return null;
  const rows = an.coverRows || [];
  const clean = rows.filter(r => !(r.confound || []).length && !r.alertWin), aw = rows.filter(r => !(r.confound || []).length && r.alertWin);
  const st = (an.speaker || {}).steps || null;
  const chk = (id) => (an.checks || []).find(c => c.id === id) || null;
  return {
    cover: !!an.coverMode, windows: clean.length, alertWindows: aw.length,
    rise: median(clean.map(r => r.riseDb)), riseMin: clean.length ? Math.min(...clean.map(r => r.riseDb)) : null,
    tail: median(clean.map(r => r.tailSec)), tailAlt: median(clean.map(r => r.tailAltSec)),
    alertRise: median(aw.map(r => r.riseDb)),
    stepDiff: st ? st.riseDiffDb : null, stepN: st ? { loud: (st.loud || []).length ?? null, masked: (st.masked || []).length ?? null } : null,
    blindDip: (() => { const d = (an.dips || []).filter(x => !(x.confound || []).length).map(x => x.dipDb); return d.length ? { median: median(d), min: Math.min(...d), n: d.length } : null; })(),
    checks: (an.checks || []).map(c => ({ id: c.id, name: c.name, pass: c.pass, value: c.value })),
    fire: an.fire || null, fireCheck: chk('fireSync'), thresholds: an.thresholds || {}
  };
}
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
export function loadRec(dir) {
  if (!dir) return null;
  return { dir, raw: recNumbers(readJSON(path.join(dir, 'analysis.json'))), spk: recNumbers(readJSON(path.join(dir, 'analysis-speaker.json'))), meta: readJSON(path.join(dir, 'meta.json')) };
}

/** 設計席第 7 節的門檻逐項判定。回傳 [{item, value, threshold, ok, source}]。 */
export function judge(sim, cov, gap, cmds) {
  const rows = [];
  const find = (mode, bot) => (sim && sim.results || []).find(r => r.mode === mode && r.bot === bot);
  const fwd = find('cover', 'forward'), per = find('cover', 'perfect'), s12 = find('cover', 'sigma12'), s25 = find('cover', 'sigma25');
  const tm = (r) => (r && r.stats.winTimeMedian != null ? r.stats.winTimeMedian : null);
  const sec = (v) => (v == null ? '—' : v.toFixed(1) + ' 秒');
  // 設計席 7.8（取代 7.1 的「σ 0.12 通關 50～85%」）：通關率照列不判；判「錯了要付出代價」與「越不準越吃虧」
  rows.push({ item: '只按前進：通關率（不停）', value: fwd ? pct(fwd.stats.winRate) + `（${fwd.stats.n} 局）` : '—', threshold: '≤ 30%', ok: fwd ? fwd.stats.winRate <= 0.3 : null, source: cmds.sim });
  rows.push({ item: '完美踩拍：通關率（不停）', value: per ? pct(per.stats.winRate) + `（${per.stats.n} 局）` : '—', threshold: '100%', ok: per ? per.stats.winRate === 1 : null, source: cmds.sim });
  {
    const ratio = tm(s12) != null && tm(per) ? tm(s12) / tm(per) : null, al = s12 ? s12.stats.alertedMean : null;
    rows.push({ item: 'σ 0.12 錯了要付代價：通關時間中位 ÷ 完美玩家，且每局平均進高度警覺（不停）',
      value: s12 && per ? `${sec(tm(s12))} ÷ ${sec(tm(per))} ＝ ${ratio == null ? '—' : ratio.toFixed(2)} 倍；高度警覺 ${al == null ? '—' : al.toFixed(2)} 次／局` : '—',
      threshold: '≥ 1.2 倍，且 ≥ 1 次／局', ok: ratio != null && al != null ? ratio >= 1.2 && al >= 1 : null, source: cmds.sim });
  }
  {
    const d = s12 && s25 ? s12.stats.winRate - s25.stats.winRate : null, ratio = tm(s25) != null && tm(s12) ? tm(s25) / tm(s12) : null;
    rows.push({ item: 'σ 0.25 越不準越吃虧：通關率比 σ 0.12 低，或通關時間中位再多（不停）',
      value: s12 && s25 ? `通關率 ${pct(s25.stats.winRate)} vs ${pct(s12.stats.winRate)}（低 ${(d * 100).toFixed(1)} 個百分點）；時間中位 ${sec(tm(s25))} vs ${sec(tm(s12))}（${ratio == null ? '—' : ratio.toFixed(2)} 倍）` : '—',
      threshold: '低 ≥ 10 個百分點，或 ≥ 1.2 倍', ok: d != null ? d >= 0.10 || (ratio != null && ratio >= 1.2) : null, source: cmds.sim });
  }
  for (const [k, r] of [['σ 0.12', s12], ['σ 0.25', s25]]) rows.push({ item: `${k} 通關率（不停；只列，7.8 不當門檻）`, value: r ? pct(r.stats.winRate) + `（${r.stats.n} 局）` : '—', threshold: '—', ok: undefined, source: cmds.sim });
  for (const [tag, R] of [['原始', cov && cov.raw], ['喇叭模擬', cov && cov.spk]]) {
    rows.push({ item: `餘韻中位（不停，${tag}）`, value: R && R.tail != null ? f1(R.tail) + ' 秒' + (R.tailAlt != null ? `（另一種背景 ${f1(R.tailAlt)} 秒）` : '') + `；${R.windows} 個一般窗` : '—', threshold: '0.5～0.8 秒', ok: R && R.tail != null ? R.tail >= 0.5 && R.tail <= 0.8 : null, source: cmds.cover });
    rows.push({ item: `重合擊突出中位（不停，${tag}）`, value: R && R.rise != null ? '+' + f1(R.rise) + ' dB（最小 ' + f1(R.riseMin) + '）' : '—', threshold: '≥ 12 dB', ok: R && R.rise != null ? R.rise >= 12 : null, source: cmds.cover });
    rows.push({ item: `警戒輕版重擊突出中位（不停，${tag}）`, value: R && R.alertRise != null ? f1(R.alertRise) + ` dB（${R.alertWindows} 個警戒窗）` : '這次錄製沒有警戒窗', threshold: '≥ 8 dB', ok: R && R.alertRise != null ? R.alertRise >= 8 : null, source: cmds.cover });
  }
  for (const [tag, R, c] of [['不停', cov && cov.raw, cmds.cover], ['留空檔', gap && gap.raw, cmds.gap]]) {
    rows.push({ item: `不合拍與合拍腳步 1～4 kHz 差（${tag}）`, value: R && R.stepDiff != null ? f1(R.stepDiff) + ' dB' : '樣本不夠', threshold: '≥ 12 dB', ok: R && R.stepDiff != null ? R.stepDiff >= 12 : null, source: c });
  }
  return rows;
}

function gitRev() {
  try {
    const h = execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--', 'prototypes/troy-prologue'], { encoding: 'utf8' }).trim();
    return h + (dirty ? '（prototypes/troy-prologue 有未提交的修改）' : '');
  } catch (e) { return '—'; }
}

export function buildReport(o) {
  const sim = o.sim ? readJSON(o.sim) : null;
  const cov = loadRec(o.cover), gap = loadRec(o.gap);
  const cmds = {
    sim: sim ? sim.command : 'node tools/telemetry/overnight-sim.mjs --n 500 --out <json>',
    cover: `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration ${(cov && cov.meta && cov.meta.durationRequested) || 90} --cover cover --out ${o.cover ? rel(o.cover) : '<資料夾>'}`,
    gap: `node tools/playtest-recorder/record.mjs --profile troy-prologue --duration ${(gap && gap.meta && gap.meta.durationRequested) || 90} --cover gap --out ${o.gap ? rel(o.gap) : '<資料夾>'}`
  };
  const J = judge(sim, cov, gap, cmds);
  const fails = J.filter(r => r.ok === false), nodata = J.filter(r => r.ok === null), listed = J.filter(r => r.ok === undefined);
  const L = [];
  L.push(`# 整夜自動驗證：木馬之夜殘響掩護（${o.date || new Date().toISOString().slice(0, 10)}）`, '');
  L.push(`- 產生：${new Date().toISOString()}；規則與聲音版本：提交 ${gitRev()}`);
  L.push(`- 門檻：\`docs/design/2026-11-10-core-direction-illusion.md\` 第 7 節（7.5 錄音、7.8 程式玩家；7.1 的「σ 0.12 通關 50～85%」已被 7.8 作廢，通關率只列不判）。`);
  L.push(`- 重產這份報告：\`node tools/telemetry/overnight-report.mjs --sim ${o.sim ? rel(o.sim) : '<json>'} --cover ${o.cover ? rel(o.cover) : '<資料夾>'} --gap ${o.gap ? rel(o.gap) : '<資料夾>'} --out ${o.out ? rel(o.out) : '<md>'}\``);
  L.push(`- 錄音原始輸出在 \`tools/playtest-recorder/out/\`，不進 git；程式玩家 JSON 在 ${o.sim ? '`' + rel(o.sim) + '`' : '—'}（同樣不進 git）。`, '');
  L.push('## 結論', '');
  L.push(`- 判定 ${J.length - listed.length} 項：過 ${J.filter(r => r.ok === true).length}、不過 ${fails.length}、無資料 ${nodata.length}（另 ${listed.length} 項只列不判）。`);
  if (fails.length) L.push(`- 不過：${fails.map(r => r.item + ' ' + r.value).join('；')}。`);
  if (nodata.length) L.push(`- 無資料：${nodata.map(r => r.item).join('；')}。`);
  L.push('');
  L.push('## 門檻對照', '', '| 項目 | 數字 | 門檻 | 結果 | 來源指令 |', '|---|---|---|---|---|');
  for (const r of J) L.push(`| ${r.item} | ${r.value} | ${r.threshold} | ${mark(r.ok)} | \`${r.source}\` |`);
  L.push('');
  if (sim) {
    L.push('## 程式玩家（Node 直接跑規則層）', '', `指令：\`${sim.command}\`；${sim.n} 局 × ${sim.results.length} 組，共 ${(sim.totalSec / 60).toFixed(1)} 分鐘。每局一條命、最多 420 秒；seed 1～${sim.n}（t0 與幀率抖動由 seed 決定）。`, '');
    L.push(formatTable(sim.results), '');
    L.push(`規則常數：${Object.entries(sim.constants || {}).map(([k, v]) => '`' + k + '` ' + v).join('、')}。`, '');
    L.push('- N1＝主動時間比例（玩家至少有一個會改變狀態的合法動作的時間 ÷ 遊玩時間），每局平均。表裡兩個數字：「自己規則」＝各版照自己的規則量（舊版沒有踩拍走）；「同一把尺」＝兩版都用新版量法（設計席 7.6、7.8：簡報要對比只能用這個，並註明是程式玩家）。');
    L.push('- 玩家定義：`tools/telemetry/troy-bots.js`，`makeBot` 與 `activeNow` 逐字照搬規則角色的 `risset.test.js`（提交 11b1944），數字和規則角色的測試同一套模型。「完美踩拍」＝固定策略＋踩拍走；舊版沒有踩拍走，同一個玩家就是完美時機的固定策略。');
    L.push('- 「σ 0.12／0.25 起步誤差」（規則角色的模型）：每次從停下到起步抽一個 e ~ N(0, σ)，用「t − e 那一刻」的狀態（在不在掩護窗、會不會踩在鼓點上、相位）決定要不要起步，e < 0 太早、e > 0 太晚；走著、停下、衝刺、暗殺、城門都用真實狀態；起步後重抽。');
    L.push('- 「每局進高度警覺」＝規則發出 `alerted` 音效的次數（衛兵從巡邏轉高度警覺），全部局平均（含沒過的局）。通關時間中位只算通關局。');
    L.push('- 死因代號是規則的 `failCode`（`belly_*`＝木馬腹中、`caught_*`＝其他區；`move_high`＝節奏快時腳步露聲、`seen`＝被看見、`loud`＝聲音太大）；`timeout`＝420 秒沒過。', '');
  }
  for (const [title, R] of [['錄音檢查：鼓聲不停（COVER_MODE = true）', cov], ['錄音檢查：留空檔（COVER_MODE = false）', gap]]) {
    if (!R || !R.raw) { L.push(`## ${title}`, '', '沒有錄音結果。', ''); continue; }
    L.push(`## ${title}`, '', `資料夾 \`${rel(R.dir)}\`（報告 \`report.md\`、有聲影片 \`playtest.mp4\`）；指令：\`${R === cov ? cmds.cover : cmds.gap}\``, '');
    L.push('| 檢查 | 原始 | 喇叭模擬（200 Hz 高通） | 數字（原始） |', '|---|---|---|---|');
    for (const c of R.raw.checks) { const s = R.spk && R.spk.checks.find(x => x.id === c.id); L.push(`| ${c.name} | ${mark(c.pass)} | ${s ? mark(s.pass) : '—'} | ${String(c.value).replace(/\|/g, '／')} |`); }
    L.push('');
  }
  L.push('## 注意', '');
  L.push('- 餘韻的主判定用「窗前 1.0～0.15 秒包絡的**中位數** + 3 dB」當背景（總控 11/10 夜決定）：和當初量出 1.3 秒、訂 0.5～0.8 秒門檻是同一個量法。設計 7.5 文字寫的「窗前 1 秒平均」並列在門檻表當參考：平均會被窗前的鼓點拉高（鼓聲不停，窗前 1 秒裡有好幾下鼓），背景變高、包絡更早回到「背景 + 3 dB」以內，所以同一窗量出的餘韻比較短（11/10 夜試錄：中位數背景 1.0 秒、平均背景 0.4 秒）。設定在 `analyze.mjs` 的 `TH.coverTailBase`。');
  L.push('- 錄音用無頭 Chromium：預設 `--mute-audio`（不從喇叭出聲，分接點在 destination 前，錄音不受影響）、網址加 `nolock=1`（不鎖實體滑鼠）。**不加 `mute=1`**：它把遊戲總閘音量設 0，會錄到靜音。');
  L.push('- 程式玩家照抄規則測試的策略，數字代表「這套策略」的表現，不是真人；真人的手感以 11/11 試玩為準。');
  return { md: L.join('\n') + '\n', judged: J, fails, nodata };
}

function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sim') o.sim = argv[++i]; else if (a === '--cover') o.cover = argv[++i]; else if (a === '--gap') o.gap = argv[++i];
    else if (a === '--out') o.out = argv[++i]; else if (a === '--date') o.date = argv[++i];
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); return 0; }
  }
  const r = buildReport(o);
  if (o.out) fs.writeFileSync(o.out, r.md); else process.stdout.write(r.md);
  console.error(`[overnight-report] 判定 ${r.judged.filter(x => x.ok !== undefined).length} 項：不過 ${r.fails.length}、無資料 ${r.nodata.length}${o.out ? '；寫到 ' + o.out : ''}`);
  for (const f of r.fails) console.error('  ❌ ' + f.item + '：' + f.value + '（門檻 ' + f.threshold + '）');
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
