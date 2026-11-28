#!/usr/bin/env node
/* 整關冒煙測試（11/17）：用無頭 Chromium 依序開每一頁，收集主控台錯誤、頁面例外與 404，印出一張表。
 *
 *   node tools/smoke-full.mjs                       # 測 repo 的 prototypes/
 *   node tools/smoke-full.mjs --root dist/odyssey-series   # 測打包出的站台
 *   node tools/smoke-full.mjs --wait 3 --json 結果.json --md 結果.md
 *
 * 開的頁：遊戲預設版、?map=final&story=1、?map=demo、level-editor.html、switch.html 上的每個連結（只取 .html 頁）。
 * 每頁網址都加 mute=1&nolock=1；瀏覽器帶 --mute-audio，不會外放。伺服器是腳本自己開的隨機埠，結束就關（不碰 8765）。
 * ?map=final 需要 troy-prologue/level-troy-final.js；檔案還不存在時那幾頁標「待交卷」，不算失敗。
 * 需要 playwright（本機：NODE_PATH 指到 %LOCALAPPDATA%\test1-node-tools\node_modules；CI：npx playwright install chromium）。
 * 外部網址（Google 字型等）連不上只列警告、不算失敗：本機曾因外部連線逾時讓 4 頁誤判。
 * 退出碼：有任何頁失敗為 1，否則 0。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(REPO, opt('root', 'prototypes'));
const WAIT = +opt('wait', 3) * 1000;

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = ['playwright', 'playwright-core', ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean).map((p) => path.join(p, 'playwright'))];
  for (const t of tries) { try { return req(t); } catch (e) { /* 下一個 */ } }
  throw new Error('找不到 playwright（設定 NODE_PATH 或 npm i playwright）');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.ico': 'image/x-icon' };
function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

function pages() {
  const list = [
    { name: '遊戲預設版', url: 'troy-prologue/index.html' },
    { name: '最終地圖＋字卡', url: 'troy-prologue/index.html?map=final&story=1', needs: 'troy-prologue/level-troy-final.js' },
    { name: '短展示版', url: 'troy-prologue/index.html?map=demo', needs: 'troy-prologue/level-troy-demo.js' },
    { name: '關卡編輯器', url: 'level-editor.html' }
  ];
  const sw = path.join(ROOT, 'switch.html');
  if (fs.existsSync(sw)) {
    const hrefs = [...fs.readFileSync(sw, 'utf8').matchAll(/href="([^"#]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    for (const h of [...new Set(hrefs)]) {
      if (!/\.html(\?|$)/.test(h) || /^https?:/.test(h)) continue;
      if (list.some((x) => x.url === h)) continue;
      list.push({ name: '切換台：' + h, url: h, needs: /map=final/.test(h) ? 'troy-prologue/level-troy-final.js' : undefined });
    }
  }
  return list;
}

const withQ = (u) => u + (u.includes('?') ? '&' : '?') + 'mute=1&nolock=1';

async function main() {
  const { chromium } = loadPlaywright();
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const rows = [];
  try {
    for (const pg of pages()) {
      if (pg.needs && !fs.existsSync(path.join(ROOT, pg.needs))) { rows.push({ ...pg, status: '待交卷', errors: [`缺 ${pg.needs}`] }); continue; }
      const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
      const page = await ctx.newPage(), errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push('主控台：' + m.text().slice(0, 200)); });
      page.on('pageerror', (e) => errors.push('例外：' + String(e.message || e).slice(0, 200)));
      page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()}：${r.url().replace(base, '')}`); });
      const warns = [];
      page.on('requestfailed', (r) => { if (r.url().startsWith(base)) errors.push('載入失敗：' + r.url().replace(base, '')); else warns.push('外部連線失敗：' + new URL(r.url()).host); });
      try { await page.goto(base + withQ(pg.url), { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch (e) { errors.push('開頁失敗：' + e.message.split('\n')[0]); }
      await page.waitForTimeout(WAIT);
      // 主控台裡的 404 訊息和 response 那筆重複，只留 response 的
      //   網路層的 Failed to load resource 由 response／requestfailed 那兩筆負責（本站的算失敗，外部的如 Google 字型只當警告）
      const uniq = [...new Set(errors)].filter((e) => !e.startsWith('主控台：Failed to load resource'));
      rows.push({ ...pg, status: uniq.length ? '失敗' : '通過', errors: uniq.concat([...new Set(warns)].map((w) => '（警告）' + w)) });
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  const md = ['| 頁面 | 網址 | 結果 | 錯誤 |', '|---|---|---|---|', ...rows.map((r) => `| ${r.name} | \`${r.url}\` | ${r.status} | ${r.errors.join('<br>') || '—'} |`)].join('\n');
  console.log(`根目錄：${path.relative(REPO, ROOT) || '.'}；每頁等 ${WAIT / 1000} 秒\n\n${md}`);
  const fail = rows.filter((r) => r.status === '失敗').length;
  console.log(`\n通過 ${rows.filter((r) => r.status === '通過').length}、失敗 ${fail}、待交卷 ${rows.filter((r) => r.status === '待交卷').length}`);
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(rows, null, 1));
  if (opt('md')) fs.writeFileSync(opt('md'), md + '\n');
  return fail ? 1 : 0;
}
main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 2; });
