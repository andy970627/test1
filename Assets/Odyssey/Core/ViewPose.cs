using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 第一人稱動作畫面規則與姿勢插值（規格第 26 節 D）。
    /// </summary>
    public static class ViewPose
    {
        public const float SnapBackSeconds = 0.15f;
        public const float LightShake = 0.005f;
        public const float HeavyShake = 0.02f;
        public const float BracedSpread = 0.25f;
        public const float NormalSpread = 0.40f;

        /// <summary>
        /// 計算拉弓或放開後弦的拉扯位置（0..1）：
        /// releaseElapsed 小於 0 表示正在拉弓（弦緊貼 drawFraction）；
        /// releaseElapsed 大於等於 0 表示放弦後的彈回時間，在 0.15 秒內歸零。
        /// </summary>
        public static float StringPull(float drawFraction, float releaseElapsed)
        {
            float initial = Math.Clamp(drawFraction, 0f, 1f);
            if (releaseElapsed < 0f)
                return initial;
            if (releaseElapsed >= SnapBackSeconds)
                return 0f;
            return initial * (1f - releaseElapsed / SnapBackSeconds);
        }

        /// <summary>
        /// 推巨石時手部與鏡頭的抖動幅度：猛推大於輕推，無推力時為 0。
        /// </summary>
        public static float PushShake(PushMode mode) => mode switch
        {
            PushMode.Heavy => HeavyShake,
            PushMode.Light => LightShake,
            _ => 0f
        };

        /// <summary>
        /// 塞楔子時右手伸向前方的距離插值（0..0.4m）：
        /// progress 由 0 至 1（共 0.6 秒），在中間 0.3 秒達到最遠，隨後收回。
        /// </summary>
        public static float WedgeReach(float progress)
        {
            if (progress < 0f || progress > 1f)
                return 0f;
            return (float)Math.Sin(progress * Math.PI) * 0.4f;
        }

        /// <summary>
        /// 雙手按在石面上的橫向間距：頂住時雙手收近（0.25m），平時推時正常張開（0.40m）。
        /// </summary>
        public static float HandSpread(bool braced) => braced ? BracedSpread : NormalSpread;
    }
}
