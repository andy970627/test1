using System;
using System.Globalization;

namespace Odyssey.Core
{
    /// <summary>實測紀錄每輪一行。</summary>
    public static class PlaytestCsv
    {
        public const string Header = "time,night,crew,ram,phase,outcome,seconds";

        public static string Line(DateTime time, int night, int crew, bool ram, LoopPhase phase, string outcome, float seconds)
        {
            var c = CultureInfo.InvariantCulture;
            return string.Join(",",
                time.ToString("yyyy-MM-dd HH:mm:ss", c),
                night.ToString(c),
                crew.ToString(c),
                ram ? "1" : "0",
                phase.ToString(),
                outcome,
                seconds.ToString("F1", c));
        }
    }
}
