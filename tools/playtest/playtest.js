// 自動畫面測試：用 Playwright 開網頁版，逐一跳到每個情況（?playtest=名稱），截圖、錄影、抓瀏覽器錯誤。
// 用法：node tools/playtest/playtest.js --build <網頁版資料夾> --out <輸出資料夾> [--scenes night,ambush]
// 有任何情況沒有啟動、或出現程式例外時，結束代碼為 1。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const buildDir = path.resolve(args.build || 'build');
const outDir = path.resolve(args.out || 'playtest-out');

// 每個情況：跳過去之後在哪些秒數截圖、要按哪些鍵。
// marks：遊戲寫出 [PLAYTEST] mark 名稱 時截圖（過場會在那一瞬間停住 2.5 秒）。
// 測試機用軟體繪圖，一秒只有一兩格，真實秒數對不上遊戲裡的時間；過場要照 mark 拍。
const SCENES = [
  { name: 'night', shots: [1, 4], actions: async (page) => {
      await page.keyboard.press('Space');            // 空彈彈弓：回聲照亮身邊
      await page.waitForTimeout(800);
      await shot(page, 'night', 'snap');
      await page.keyboard.down('Space');             // 按住拉彈弓：第一人稱雙手
      await page.waitForTimeout(700);
      await shot(page, 'night', 'draw');
      await page.keyboard.up('Space');
    } },
  { name: 'boulder', shots: [1, 3] },
  { name: 'verse', shots: [0.5, 1.5, 3] },
  { name: 'ambush', shots: [3.5], marks: ['athena', 'turn', 'horse'] },
  { name: 'fairhit', shots: [0.5, 2, 4] },
  { name: 'prayer', shots: [1, 4] },
  { name: 'dawnsoon', shots: [1, 5] },
  { name: 'fullopen', shots: [1, 4] },
  { name: 'shore', shots: [2, 5] },
  { name: 'death', shots: [1, 2.5] },
  { name: 'dawn', shots: [0.5, 1.5, 3] },
];
const only = args.scenes ? new Set(args.scenes.split(',')) : null;

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };

function serve(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function shot(page, scene, label) {
  const file = path.join(outDir, `${scene}-${label}.png`);
  await page.screenshot({ path: file });
  return file;
}

async function runScene(browser, base, scene) {
  const context = await browser.newContext({ viewport: { width: 960, height: 600 },
    recordVideo: { dir: path.join(outDir, 'video'), size: { width: 960, height: 600 } } });
  const page = await context.newPage();
  const log = [];
  const errors = [];
  let ready = false, ran = false, lastStatus = '';
  const markShots = [];
  page.on('console', (m) => {
    const text = m.text();
    log.push(`[${m.type()}] ${text}`);
    if (text.includes('[PLAYTEST] ready')) ready = true;
    if (text.includes('[PLAYTEST] ran')) ran = true;
    if (text.startsWith('[PLAYTEST] phase=')) lastStatus = text;
    const mark = /^\[PLAYTEST\] mark (\S+)/.exec(text);
    if (mark && (scene.marks || []).includes(mark[1]))
      markShots.push(page.waitForTimeout(300).then(() => shot(page, scene.name, `mark-${mark[1]}`)));
    if (/Exception|NullReference|MissingReference|IndexOutOfRange/.test(text)) errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const result = { scene: scene.name, ok: false, shots: [], errors, lastStatus: '' };
  try {
    await page.goto(`${base}/index.html?playtest=${scene.name}`);
    const deadline = Date.now() + 240000;           // 軟體繪圖下載入很慢，給 4 分鐘
    while (!ran && Date.now() < deadline) await page.waitForTimeout(500);
    if (!ready || !ran) throw new Error(`沒有啟動（ready=${ready} ran=${ran}）`);
    await page.mouse.click(480, 300);               // 讓畫面取得焦點
    let elapsed = 0;
    for (const t of scene.shots) {
      await page.waitForTimeout((t - elapsed) * 1000);
      elapsed = t;
      result.shots.push(await shot(page, scene.name, `${t}s`));
    }
    if (scene.actions) await scene.actions(page);
    // 等所有 mark 出現（過場在軟體繪圖下可能要十幾秒）。
    const markDeadline = Date.now() + 60000;
    while (markShots.length < (scene.marks || []).length && Date.now() < markDeadline) await page.waitForTimeout(500);
    result.shots.push(...await Promise.all(markShots));
    const missing = (scene.marks || []).filter((m) => !result.shots.some((f) => f.endsWith(`mark-${m}.png`)));
    if (missing.length) errors.push(`過場沒有走到：${missing.join(', ')}`);
    await page.waitForTimeout(1500);                 // 再等一行狀態
    result.ok = errors.length === 0;
  } catch (e) {
    errors.push(String(e.message || e));
  }
  result.lastStatus = lastStatus;
  fs.writeFileSync(path.join(outDir, `${scene.name}-console.txt`), log.join('\n'));
  await context.close();
  return result;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    console.error(`找不到網頁版：${buildDir}/index.html`);
    process.exit(2);
  }
  const server = await serve(buildDir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const results = [];
  for (const scene of SCENES) {
    if (only && !only.has(scene.name)) continue;
    process.stdout.write(`== ${scene.name} ... `);
    const r = await runScene(browser, base, scene);
    console.log(r.ok ? 'ok' : `失敗：${r.errors[0]}`);
    results.push(r);
  }
  await browser.close();
  server.close();

  const lines = ['# 自動畫面測試', '', '| 情況 | 結果 | 截圖 | 最後狀態 |', '|---|---|---|---|'];
  for (const r of results)
    lines.push(`| ${r.scene} | ${r.ok ? '通過' : '失敗：' + (r.errors[0] || '').replace(/\|/g, '/').slice(0, 120)} | ${r.shots.length} | ${r.lastStatus.replace('[PLAYTEST] ', '').replace(/\|/g, '/')} |`);
  fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
