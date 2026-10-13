using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 魂系死亡畫面「葬身洞中」的時間軸（規格第 25 節 D）：0～0.8 秒畫面暗下；0.5 秒起黑帶淡入；
    /// 大字 0.5～1.5 秒從 0.9 倍放大到 1 倍並淡入；1 秒後可跳過；3 秒結束。
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

        static float Clamp01(float v) => Math.Max(0f, Math.Min(1f, v));

        public static float DimAlpha(float t) => MaxDim * Clamp01(t / DimSeconds);

        public static float BandAlpha(float t) => BandMax * Clamp01((t - BandStart) / BandFade);

        public static float TextAlpha(float t) => Clamp01((t - TextStart) / TextGrow);

        public static float TextScale(float t) => 0.9f + 0.1f * Clamp01((t - TextStart) / TextGrow);

        public static bool CanSkip(float t) => t >= SkipAfter;

        public static bool Done(float t) => t >= Duration;
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
