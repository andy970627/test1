using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 魂系死亡畫面「葬身洞中」的時間軸（規格第 25 節 D）：0～0.8 秒畫面暗下；0.5 秒起黑帶淡入；
    /// 大字 0.5～1.5 秒從 0.9 倍放大到 1 倍並淡入；1 秒後可跳過（跳到 3 秒）；3 秒起字與黑帶淡出、畫面全黑，
    /// 3.4 秒全黑時重置下一夜，接著 0.6 秒直接淡入下一夜（不再接過場，規格第 25 節 D）。
    /// </summary>
    public static class DeathCard
    {
        public const float MaxDim = 0.6f;
        public const float DimSeconds = 0.8f;
        public const float BandStart = 0.5f;
        public const float BandFade = 0.5f;
        public const float BandMax = 0.85f;
        public const float TextStart = 0.5f;
        public const float TextGrow = 1f;
        public const float SkipAfter = 1f;
        public const float Duration = 3f;
        public const float FadeToBlack = 0.4f;
        public const float Reveal = 0.6f;
        public const float BlackoutAt = Duration + FadeToBlack;
        public const float End = BlackoutAt + Reveal;
        public const float SkipTo = Duration;

        static float Clamp01(float v) => Math.Max(0f, Math.Min(1f, v));

        public static float DimAlpha(float t)
        {
            if (t < Duration)
                return MaxDim * Clamp01(t / DimSeconds);
            if (t < BlackoutAt)
                return MaxDim + (1f - MaxDim) * Clamp01((t - Duration) / FadeToBlack);
            return 1f - Clamp01((t - BlackoutAt) / Reveal);
        }

        /// <summary>3 秒後字與黑帶跟著淡出。</summary>
        static float FadeOut(float t) => 1f - Clamp01((t - Duration) / FadeToBlack);

        public static float BandAlpha(float t) => BandMax * Clamp01((t - BandStart) / BandFade) * FadeOut(t);

        public static float TextAlpha(float t) => Clamp01((t - TextStart) / TextGrow) * FadeOut(t);

        public static float TextScale(float t) => 0.9f + 0.1f * Clamp01((t - TextStart) / TextGrow);

        public static bool CanSkip(float t) => t >= SkipAfter;

        public static bool Done(float t) => t >= End;
    }

    /// <summary>巨人靠近時的心跳（規格第 25 節 E）：8 m 內出現，8 m 每分鐘 60 下、2 m 140 下，越近越強。</summary>
    public static class Heartbeat
    {
        public const float Range = 8f;
        public const float Near = 2f;
        public const float SlowBpm = 60f;
        public const float FastBpm = 140f;

        public static bool Active(float distance) => distance <= Range;

        public static float Intensity(float distance) => Math.Max(0f, Math.Min(1f, (Range - distance) / (Range - Near)));

        public static float BeatsPerMinute(float distance) => SlowBpm + (FastBpm - SlowBpm) * Intensity(distance);
    }
}
