using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Odyssey.Core;

namespace Odyssey.Sim
{
    /// <summary>把統計寫成手機也好讀的 Markdown 報告。</summary>
    public static class Report
    {
        static string P(double v) => (v * 100).ToString("0", CultureInfo.InvariantCulture) + "%";
        static string F(double v, string fmt = "0.0") => v.ToString(fmt, CultureInfo.InvariantCulture);

        public static string Write(List<Stats> main, List<Stats> awareness, int runs, int seed, List<IBot> bots)
        {
            var sb = new StringBuilder();
            sb.AppendLine("# 夜晚模擬報告");
            sb.AppendLine();
            sb.AppendLine($"由 `tools/NightSim` 產生：每種組合 {runs} 場，種子 {seed}。規則直接用 `Assets/Odyssey/Core`（巨人大腦、巨石、天亮、禱告、體力、聲音），空間是平面近似。");
            sb.AppendLine();
            sb.AppendLine("一場＝從 12 名同伴開始，一夜一夜玩到逃出或全滅（最多 12 夜）。");
            sb.AppendLine();

            sb.AppendLine("## 機器人策略");
            sb.AppendLine();
            sb.AppendLine("| 策略 | 怎麼玩 |");
            sb.AppendLine("|---|---|");
            foreach (var b in bots)
                sb.AppendLine($"| {b.Name} | {b.Blurb} |");
            sb.AppendLine();
            sb.AppendLine("機器人只知道「看到、聽到」的事：回聲照亮的範圍、離巨人 8 m 內（心跳與腳步）、同伴的嗚咽、禱告聲。");
            sb.AppendLine();

            foreach (var level in new[] { DifficultyLevel.Familiar, DifficultyLevel.Normal, DifficultyLevel.Hard })
            {
                var rows = main.Where(s => s.Difficulty == level).ToList();
                sb.AppendLine($"## 難度：{Difficulty.Name(level)}");
                sb.AppendLine();
                sb.AppendLine("| 策略 | 第一夜逃出 | 整場逃出 | 平均第幾夜逃出 | 逃出用時 | 帶出同伴 |");
                sb.AppendLine("|---|---|---|---|---|---|");
                foreach (var s in rows)
                    sb.AppendLine($"| {s.Bot} | {P(s.FirstNightRate)} | {P(s.RunRate)} | {(s.RunsEscaped == 0 ? "—" : F(s.NightsToEscape))} | {(s.RunsEscaped == 0 ? "—" : F(s.EscapeSeconds, "0") + " 秒")} | {(s.RunsEscaped == 0 ? "—" : F(s.Rescued))} |");
                sb.AppendLine();
                sb.AppendLine("失敗的夜怎麼死的：");
                sb.AppendLine();
                sb.AppendLine("| 策略 | 摸到 | 撞上 | 岩石 | 天亮 | 失敗時巨石開到 |");
                sb.AppendLine("|---|---|---|---|---|---|");
                foreach (var s in rows)
                {
                    int total = Math.Max(1, s.FailedNights);
                    string Cause(FailReason r) => s.FailedNights == 0 ? "—" : P((double)s.Fails.GetValueOrDefault(r) / total);
                    sb.AppendLine($"| {s.Bot} | {Cause(FailReason.Touched)} | {Cause(FailReason.Bumped)} | {Cause(FailReason.Crushed)} | {Cause(FailReason.Dawn)} | {(s.FailedNights == 0 ? "—" : P(s.FailedMaxOpening))} |");
                }
                sb.AppendLine();
                sb.AppendLine("每夜平均：");
                sb.AppendLine();
                sb.AppendLine("| 策略 | 巨人 5 m 內（秒） | 知道巨人在哪的時間 | 製造聲音 | 射箭 | 彈弓射石 | 楔子 | 巨人跑回守石 | 失去同伴 |");
                sb.AppendLine("|---|---|---|---|---|---|---|---|---|");
                foreach (var s in rows)
                    sb.AppendLine($"| {s.Bot} | {F(s.Near5mPerNight)} | {P(s.KnownShare)} | {F(s.ClapsPerNight)} | {F(s.ArrowsPerNight)} | {F(s.SlingsPerNight)} | {F(s.WedgesPerNight)} | {F(s.GuardsPerNight)} | {F(s.CrewLostPerNight, "0.00")} |");
                var zeus = rows.Where(s => s.FairHits + s.Ambushes > 0).ToList();
                if (zeus.Count > 0)
                {
                    sb.AppendLine();
                    sb.AppendLine("宙斯法則（打中巨人的次數，整批加總）：");
                    sb.AppendLine();
                    sb.AppendLine("| 策略 | 正面出手 | 偷襲 | 雷殛死的同伴 |");
                    sb.AppendLine("|---|---|---|---|");
                    foreach (var s in zeus)
                        sb.AppendLine($"| {s.Bot} | {s.FairHits} | {s.Ambushes} | {s.ThunderDeaths} |");
                }
                sb.AppendLine();
            }

            sb.AppendLine("## 恐懼半徑 8 m 與 16 m（規格第 31 節 H，普通難度）");
            sb.AppendLine();
            sb.AppendLine("「知道巨人在哪」的距離從現在心跳的 8 m 拉到 16 m，會讓遊戲簡單多少。");
            sb.AppendLine();
            sb.AppendLine("| 策略 | 距離 | 第一夜逃出 | 整場逃出 | 巨人 5 m 內（秒） | 知道巨人在哪的時間 |");
            sb.AppendLine("|---|---|---|---|---|---|");
            foreach (var s in awareness)
                sb.AppendLine($"| {s.Bot} | {F(s.Awareness, "0")} m | {P(s.FirstNightRate)} | {P(s.RunRate)} | {F(s.Near5mPerNight)} | {P(s.KnownShare)} |");
            sb.AppendLine();

            sb.AppendLine("## 限制（看數字時要記得）");
            sb.AppendLine();
            sb.AppendLine("- 沒有模擬：羊與羊叫遮聲、羊圈、奶桶、乳酪架、木樁、地形高低、岩壁擋路；箭射出就不撿回。");
            sb.AppendLine("- 機器人是寫死的策略，比真人笨也比真人準（反應零延遲、不會手滑）。看的是**趨勢和相對差距**，不是真人的確切勝率。");
            sb.AppendLine("- 彈弓打中巨人的機率假設為 8 m 內 70%；雅典娜的眷顧（縫光）與手抖不影響機器人。");
            return sb.ToString();
        }
    }
}
