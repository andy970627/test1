using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>一夜怎麼結束的。</summary>
    public enum NightOutcome { Touched, Bumped, Crushed, Dawn, Escaped }

    /// <summary>F1 死亡紀錄的一行：一夜一行。</summary>
    public readonly struct NightLine
    {
        public readonly int Night;
        public readonly NightOutcome Outcome;
        public readonly int Lost;
        public readonly int Rescued;
        public readonly string Text;

        public NightLine(int night, NightOutcome outcome, int lost, int rescued, string text)
        {
            Night = night;
            Outcome = outcome;
            Lost = lost;
            Rescued = rescued;
            Text = text;
        }
    }

    /// <summary>
    /// 每夜一行的死亡紀錄：這一夜被吃、被砸死的同伴，加上被抓時被吃掉的那一名，合成一行；只留最近 6 夜。
    /// </summary>
    public sealed class NightLog
    {
        public const int MaxLines = 6;

        readonly List<NightLine> lines = new();
        int lostTonight;

        public IReadOnlyList<NightLine> Lines => lines;

        public void Lose() => lostTonight++;

        public void End(int night, NightOutcome outcome, int rescued = 0)
        {
            int lost = lostTonight + (outcome == NightOutcome.Escaped ? 0 : 1);
            lostTonight = 0;
            string text = $"第 {night} 夜  {Describe(outcome, rescued)}";
            if (lost > 0)
                text += $"  −{lost} 名同伴";
            lines.Add(new NightLine(night, outcome, lost, rescued, text));
            if (lines.Count > MaxLines)
                lines.RemoveAt(0);
        }

        public void Clear()
        {
            lines.Clear();
            lostTonight = 0;
        }

        public static NightOutcome From(FailReason reason) => reason switch
        {
            FailReason.Bumped => NightOutcome.Bumped,
            FailReason.Crushed => NightOutcome.Crushed,
            FailReason.Dawn => NightOutcome.Dawn,
            _ => NightOutcome.Touched,
        };

        static string Describe(NightOutcome outcome, int rescued) => outcome switch
        {
            NightOutcome.Touched => "被摸到",
            NightOutcome.Bumped => "撞上巨人",
            NightOutcome.Crushed => "被岩石砸中",
            NightOutcome.Dawn => "天亮了",
            _ => $"逃出去・帶出 {rescued}",
        };
    }
}
