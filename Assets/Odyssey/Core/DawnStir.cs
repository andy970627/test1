using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 天亮前的反向剝奪（規格第 34 節 B）：最後 30 秒縫光漸強，不靠回聲也看得見輪廓（亮度 0 → 0.5），
    /// 羊群被天光騷動、每 1.5 秒叫一聲，你聽巨人腳步的距離縮成一半。
    /// </summary>
    public static class DawnStir
    {
        public const float Seconds = 30f;
        public const float MaxAmbient = 0.5f;
        public const float BleatSeconds = 1.5f;
        /// <summary>這段期間你聽巨人的距離倍率（8 m → 4 m）。</summary>
        public const float HearingScale = 0.5f;

        public static bool Active(float secondsLeft) => secondsLeft <= Seconds && secondsLeft > 0f;

        /// <summary>不靠回聲的環境亮度：剩 30 秒時 0，天亮時 0.5。</summary>
        public static float Ambient(float secondsLeft) =>
            Active(secondsLeft) ? MaxAmbient * (1f - Math.Max(0f, secondsLeft) / Seconds) : 0f;
    }
}
