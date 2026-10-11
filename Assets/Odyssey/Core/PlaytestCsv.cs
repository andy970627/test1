using System;
using System.Globalization;
using System.IO;

namespace Odyssey.Core
{
    /// <summary>實測紀錄每輪一行。</summary>
    public static class PlaytestCsv
    {
        /// <summary>v2 多了 rescued、lost 兩欄，和 v1 的 blind_cave_playtest.csv 分開，避免欄位標題對不上。</summary>
        public const string FileName = "blind_cave_v2_playtest.csv";

        /// <summary>boulder＝這一夜開口最大值（公分）；rescued＝帶出的同伴；lost＝這一夜被吃或砸死的同伴。</summary>
        public const string Header = "time,night,crew,boulder,rescued,lost,phase,outcome,seconds";

        /// <summary>附加一行；檔案被鎖住（例如在 Excel 開著）時回傳 false，不丟例外，遊戲照常進行。</summary>
        public static bool TryAppend(string path, string line, out string error)
        {
            try
            {
                File.AppendAllText(path, line + "\n");
                error = null;
                return true;
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                error = e.Message;
                return false;
            }
        }

        public static string Line(DateTime time, int night, int crew, int boulderCm, int rescued, int lost, LoopPhase phase, string outcome, float seconds)
        {
            var c = CultureInfo.InvariantCulture;
            return string.Join(",",
                time.ToString("yyyy-MM-dd HH:mm:ss", c),
                night.ToString(c),
                crew.ToString(c),
                boulderCm.ToString(c),
                rescued.ToString(c),
                lost.ToString(c),
                phase.ToString(),
                outcome,
                seconds.ToString("F1", c));
        }
    }
}
