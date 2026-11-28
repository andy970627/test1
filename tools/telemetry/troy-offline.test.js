// 木馬之夜離線與字體涵蓋檢查（量測與驗收，11/28）。跑在 CI 的 web-tests 與 tools/cleancheck.sh（同一個 node --test 範圍）。
//   1 離線：遊戲頁會載入的檔案不能有外部網址（http(s)://、//主機 開頭的 src/href/url()/@import/fetch）。
//   2 字體涵蓋：那些檔案用到的每個字（與 make-fonts.py 相同掃法：ASCII＋所有 ≥ U+00A0 的字）都要在 vendor/fonts 每一組字型的 unicode-range 裡。
// 檔案清單＝make-fonts.py 的 SRC（直接從那支讀，不另抄）＋index.html 的 script src／link href（含 document.write 字串裡的）＋CSS 的 url()／@import。
// 環境變數 TROY_OFFLINE_ROOT 可以指到別的 prototypes 資料夾（故意弄壞時用暫存複本，不動 repo）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const P = path.resolve(process.env.TROY_OFFLINE_ROOT || path.join(__dirname, '..', '..', 'prototypes'));
const T = path.join(P, 'troy-prologue');
const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(P, f).split(path.sep).join('/');

function srcList() {
  const py = read(path.join(T, 'vendor', 'make-fonts.py'));
  const m = py.match(/SRC\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(m, 'make-fonts.py 找不到 SRC 清單');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => path.join(P, x[1]));
}

// 從 HTML／CSS 抓出本機相對路徑的引用（外部網址另外由離線檢查抓）
function refs(file) {
  const s = read(file), dir = path.dirname(file), out = [];
  const add = (u) => {
    u = u.split(/[?#]/)[0];
    if (!u || /^(data:|blob:|https?:|\/\/|#|javascript:)/i.test(u) || u.includes('+') || u.includes("'")) return;
    out.push(path.resolve(dir, u));
  };
  if (/\.html?$/i.test(file)) for (const x of s.matchAll(/\b(?:src|href)\s*=\s*\\?["']([^"'\\]+)\\?["']/g)) add(x[1]);
  for (const x of s.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)) add(x[1]);
  for (const x of s.matchAll(/@import\s+["']([^"']+)["']/g)) add(x[1]);
  return out;
}

function loadedFiles() {
  const seen = new Set(), todo = [path.join(T, 'index.html'), ...srcList()];
  while (todo.length) {
    const f = todo.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    if (!fs.existsSync(f)) continue;
    if (/\.(html?|css)$/i.test(f)) todo.push(...refs(f).filter((r) => /\.(html?|css|js|mjs)$/i.test(r)));
  }
  return [...seen].filter((f) => /\.(html?|css|js|mjs)$/i.test(f));
}

// XML 命名空間只是識別字，瀏覽器不會去連（three.min.js 建 DOM 元素用到）
const NS = /^http:\/\/www\.w3\.org\/(1999\/xhtml|2000\/svg|1999\/xlink|1998\/Math\/MathML|XML\/1998\/namespace|2000\/xmlns\/)$/;

test('離線：木馬之夜會載入的檔案沒有外部網址', () => {
  const files = loadedFiles();
  const missing = files.filter((f) => !fs.existsSync(f)).map(rel);
  assert.deepStrictEqual(missing, [], '引用到但不存在的檔案');
  const bad = [];
  const pats = [
    /https?:\/\/[^\s"'`)<>]+/gi,                                        // 任何 http(s) 網址（含註解；註解裡也不留，免得之後被當成真的用）
    /\b(?:src|href)\s*=\s*\\?["']\/\/[^"']+/gi,                          // //主機 開頭（沿用頁面協定的外部網址）
    /url\(\s*["']?\/\/[^)]+\)/gi,
    /@import\s+(?:url\()?\s*["']?\/\/[^;]+/gi,
    /\bfetch\(\s*["'`]\/\/[^"'`]+/gi
  ];
  for (const f of files) {
    const s = read(f);
    s.split('\n').forEach((line, i) => { for (const re of pats) for (const m of line.matchAll(re)) if (!NS.test(m[0])) bad.push(`${rel(f)}:${i + 1} ${m[0].slice(0, 80)}`); });
  }
  assert.deepStrictEqual(bad, [], '有外部網址；離線展示會載不到（字體、程式庫請放進 troy-prologue/vendor/）');
  assert.ok(files.length >= 12, '掃到的檔案太少（' + files.length + '），清單可能讀錯');
});

function parseRange(r) {
  const set = new Set();
  for (const part of r.split(',')) {
    const m = part.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
    if (!m) continue;
    if (m[1].includes('?')) { const a = parseInt(m[1].replace(/\?/g, '0'), 16), b = parseInt(m[1].replace(/\?/g, 'f'), 16); for (let c = a; c <= b; c++) set.add(c); continue; }
    const a = parseInt(m[1], 16), b = m[2] ? parseInt(m[2], 16) : a;
    for (let c = a; c <= b; c++) set.add(c);
  }
  return set;
}

test('字體涵蓋：用到的每個字都在 vendor/fonts 的字體子集裡', () => {
  const chars = new Set();
  for (let c = 0x20; c < 0x7f; c++) chars.add(c);
  for (const f of srcList()) for (const ch of read(f)) { const c = ch.codePointAt(0); if (c >= 0xa0) chars.add(c); }
  const problems = [];
  for (const css of ['fonts.css', 'fonts-ui2.css']) {
    const s = read(path.join(T, 'vendor', 'fonts', css)), fam = new Map();
    for (const m of s.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      const name = (m[1].match(/font-family:\s*'([^']+)'/) || [])[1], w = (m[1].match(/font-weight:\s*(\d+)/) || [])[1];
      const r = (m[1].match(/unicode-range:\s*([^;]+);/) || [])[1];
      const file = (m[1].match(/url\(([^)]+)\)/) || [])[1];
      if (file && !fs.existsSync(path.join(T, 'vendor', 'fonts', file))) problems.push(`${css}：缺字型檔 ${file}`);
      const k = name + ' ' + w, set = fam.get(k) || new Set();
      if (r) for (const c of parseRange(r)) set.add(c);
      fam.set(k, set);
    }
    assert.ok(fam.size > 0, css + ' 沒有任何 @font-face');
    for (const [k, set] of fam) {
      const miss = [...chars].filter((c) => !set.has(c));
      if (miss.length) problems.push(`${css} ${k} 缺 ${miss.length} 字：${miss.slice(0, 20).map((c) => String.fromCodePoint(c)).join('')}${miss.length > 20 ? '…' : ''}`);
    }
  }
  assert.deepStrictEqual(problems, [], '新增文字後要重跑 python -I prototypes/troy-prologue/vendor/make-fonts.py（需要網路）');
});
