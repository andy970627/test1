using System;
using System.Globalization;
using System.IO;

namespace Odyssey.Core
{
    /// <summary>實測紀錄每輪一行。</summary>
    public static class PlaytestCsv
    {
        /// <summary>和舊版（選羊＋抱緊）的 cyclops_playtest.csv 分開，避免欄位標題對不上。</summary>
        public const string FileName = "blind_cave_playtest.csv";

        public const string Header = "time,night,crew,boulder,phase,outcome,seconds";

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

        public static string Line(DateTime time, int night, int crew, int boulder, LoopPhase phase, string outcome, float seconds)
        {
            var c = CultureInfo.InvariantCulture;
            return string.Join(",",
                time.ToString("yyyy-MM-dd HH:mm:ss", c),
                night.ToString(c),
                crew.ToString(c),
                boulder.ToString(c),
                phase.ToString(),
                outcome,
                seconds.ToString("F1", c));
        }
    }
}
