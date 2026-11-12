/* 木馬之夜錄影的解說字幕（11/12）：讀錄影輸出資料夾的 timeline.json 與 meta.json，依事件產生 ASS 字幕（【設計】黃、【觀察】藍、換區標題、結尾卡、版本列）。
 * 用法：node tools/playtest-recorder/annotate-troy.cjs <輸出資料夾> <字幕.ass> <影片秒數>，再 ffmpeg -vf "ass=字幕.ass" 燒進影片。
 * 觀察數字出自 docs/process/report-structure-draft.md 第 4 列與 playtest-notes.md（11/11），改版後要更新。版本列寫死 fef840c，換版要改。 */
// 依時間軸事件產生解說字幕（ASS）：上方＝設計說明，下方偏上＝觀察與數字
const fs = require('fs'), path = require('path');
const dir = process.argv[2], out = process.argv[3];
const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json')));
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json')));
const off = meta.video.offsetSec, a0 = meta.audio.startAudioTime;
const vt = (t) => off + (t - a0);
// 每種事件第一次出現時解說；design＝設計，obs＝觀察／數字
const RULES = {
  step_masked: { design: '踩著聽得到的鼓點走：合拍的腳步被鼓聲蓋住，衛兵聽不到', dur: 4.5 },
  blind: { design: '最響的一擊＝所有鼓同時落下＋約 0.6 秒餘韻（前面有木魚預告）：這段時間衛兵聽不到你', obs: '真耳朵（11/11 手機＋耳機）：最響的一擊很好認', dur: 5 },
  dash: { design: '衝刺（Shift）：只在最響的一擊落下時有效，快速衝出一小段', dur: 4 },
  step_loud: { design: '離拍的腳步會出聲，附近衛兵會警覺', dur: 4 },
  breath_in: { design: '屏息（空白鍵）：鼓聲退後、衛兵腳步變清楚；最多撐幾秒，憋太久會喘出聲', dur: 4.5 },
  run_start: { design: '跑（按住 Shift）：快，但跑步聲傳得遠', dur: 3.5 },
  check_start: { design: '查看：衛兵聽到聲音會走過來看（取代舊版的安撫）', obs: '這版的查看偏兇，數字還在調', dur: 4.5 },
  hunt: { design: '追殺：鼓聲加速到最快，逃的時候踩拍沒有掩護', obs: '程式玩家：被追殺的局因追殺輸掉 完美 57%、起步誤差 0.25 秒時 39%（修前幾乎必輸）', dur: 5.5 },
  search_start: { design: '躲進影子：鼓聲悶下、追兵腳步比鼓聲響，用耳朵判斷他在哪', obs: '錄音檢查：躲時追兵腳步比鼓聲高約 6 dB', dur: 5.5 },
  escape: { design: '甩掉追兵：鼓聲回到平常', dur: 3.5 },
  takedown: { design: '暗殺（E）：最響的一擊落下時從背後靠近，可以放倒衛兵', dur: 4.5 },
  latch_step: { design: '城門：節奏慢的時候按住 E 推門閂，節奏一快就放手', dur: 5 },
  gate_open: { design: '城門開了', dur: 3 },
};
// 每種說明只出現一次：挑字幕軌有空（最多晚 1.5 秒）的那一次出現；重要的（追殺、躲、甩掉、暗殺、城門）不等
const MUST = new Set(['hunt', 'search_start', 'escape', 'takedown', 'latch_step', 'gate_open']);
const seen = new Set(), items = [];
let lane = 0;
for (const e of tl.events) {
  const k = e.type === 'cue' ? e.name : e.type;
  if (!RULES[k] || seen.has(k)) continue;
  const t = vt(e.t);
  if (!MUST.has(k) && lane - t > 1.5) continue;
  seen.add(k); const s0 = Math.max(t, MUST.has(k) ? t : lane); items.push({ t: s0, ...RULES[k] }); lane = s0 + RULES[k].dur;
}
// 換區標題
const ZN = { 2: '第 2 區　神殿廣場', 3: '第 3 區　城牆下的窄巷', 4: '第 4 區　城門' };
for (const e of tl.events) if (e.type === 'state' && e.key === 'zone' && ZN[e.to]) items.push({ t: vt(e.t), zone: ZN[e.to], dur: 2.5 });
items.sort((a, b) => a.t - b.t);
// 同一條字幕軌重疊時往後排
let busyD = 0, busyO = 0;
const ts = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = (s % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${x}`; };
const L = [];
const des = items.filter((i) => !i.zone);
des.forEach((it, i) => { const nx = des[i + 1]; if (nx && nx.t < it.t + it.dur) it.dur = Math.max(1.2, nx.t - it.t - 0.05); });
for (const it of items) {
  if (it.zone) { L.push(`Dialogue: 0,${ts(it.t)},${ts(it.t + it.dur)},Zone,,0,0,0,,${it.zone}`); continue; }
  const s = it.t; busyD = s + it.dur;
  L.push(`Dialogue: 0,${ts(s)},${ts(s + it.dur)},Design,,0,0,0,,【設計】${it.design}`);
  if (it.obs) { const nxo = items.find((j) => j !== it && j.obs && j.t > it.t); const od = nxo ? Math.min(it.dur + 1, nxo.t - it.t - 0.05) : it.dur + 1; const so = it.t; busyO = so + od; L.push(`Dialogue: 0,${ts(so)},${ts(so + od)},Obs,,0,0,0,,【觀察】${it.obs}`); }
}
const end = +process.argv[4];
L.push(`Dialogue: 0,${ts(end - 13)},${ts(end)},End,,0,0,0,,【還沒成立的】Risset 加速錯覺：舊鼓聲時真耳朵覺得「其實是不同層疊加」\\N新鼓聲（六層同一種鼓）已進遊戲，11/12 聽過仍沒有加速感\\N原因之一：最響的一擊固定在每圈起點；三對二強拍、讓這一擊不固定在報告後做`);
L.push(`Dialogue: 0,0:00:00.00,${ts(end)},Ver,,0,0,0,,木馬之夜｜版本 fef840c｜跑蹲版（?moves 預設開）・新鼓聲・視覺輔助全開｜程式玩家（模擬人類視角），第 3 區故意跑步引來追殺`);
const F = 'WenQuanYi Zen Hei';
fs.writeFileSync(out, `[Script Info]
ScriptType: v4.00+
PlayResX: 960
PlayResY: 540
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Design,${F},22,&H0000E6FF,&H000000FF,&H00000000,&H90000000,0,0,0,0,100,100,0,0,3,6,0,2,40,40,152,1
Style: Obs,${F},19,&H00FFE7B0,&H000000FF,&H00000000,&H90000000,0,0,0,0,100,100,0,0,3,5,0,2,40,40,120,1
Style: Zone,${F},30,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,3,8,0,5,40,40,0,1
Style: End,${F},22,&H00FFFFFF,&H000000FF,&H00000000,&HC0000000,0,0,0,0,100,100,0,0,3,10,0,5,60,60,0,1
Style: Ver,${F},14,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,3,4,0,1,10,10,8,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${L.join('\n')}
`);
console.log(items.map((i) => i.t.toFixed(1) + ' ' + (i.zone || i.design)).join('\n'));
