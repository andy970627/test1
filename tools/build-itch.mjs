// 把原型的 HTML 片段包成完整文件，並把 cdnjs 的 three.js 換成本地 lib/three.min.js。
// 用法：node tools/build-itch.mjs <站台根目錄>（由 build-itch.sh 呼叫）
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const CDN = /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/g;
const HEAD = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>html,body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
`;
const TAIL = `\n</body>\n</html>\n`;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // cave/ 是 Unity WebGL 建置，原樣保留；lib/ 不是頁面
      if (dir === root && (e.name === 'cave' || e.name === 'lib')) continue;
      walk(p, out);
    } else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

let wrapped = 0, swapped = 0;
for (const file of walk(root)) {
  let src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.dirname(file), path.join(root, 'lib/three.min.js')).split(path.sep).join('/');
  const n = (src.match(CDN) || []).length;
  if (n) { src = src.replace(CDN, rel); swapped += n; }
  if (!/^\s*<!doctype/i.test(src)) { src = HEAD + src.trim() + TAIL; wrapped++; }
  fs.writeFileSync(file, src);
  if (/cdnjs\.cloudflare\.com/.test(src)) console.warn(`警告：${path.relative(root, file)} 仍引用 cdnjs`);
}
console.log(`包成完整 HTML：${wrapped} 頁；three.js 改本地：${swapped} 處`);
