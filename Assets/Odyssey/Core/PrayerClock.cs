using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 巨人向父親波塞頓禱告的時間（規格第 20 節 B）：每夜第一次在 60～120 秒；一半的夜在 150～200 秒再一次。
    /// 時間到了但巨人正在守石、蓄力、吃人時，一直維持「該禱告了」直到他真的開始（Done）。
    /// </summary>
    public sealed class PrayerClock
    {
        public const float MinGap = 30f;

        float first, second, lastStart;
        int done;
        bool hasSecond;

        public void NewNight(Func<double> roll)
        {
            first = 60f + (float)roll() * 60f;
            hasSecond = roll() < 0.5;
            second = 150f + (float)roll() * 50f;
            done = 0;
        }

        public bool Ready(float elapsed) => done switch
        {
            0 => elapsed >= first,
            1 => hasSecond && elapsed >= second && elapsed >= lastStart + CyclopsBrain.PraySeconds + MinGap,
            _ => false,
        };

        /// <summary>禱告開始了；elapsed 是開始的夜晚時間（第二次至少隔 8 + 30 秒，不會接連禱告）。</summary>
        public void Done(float elapsed)
        {
            lastStart = elapsed;
            done++;
        }
    }
}
