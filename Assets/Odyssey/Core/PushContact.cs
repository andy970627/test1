using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 怎麼推巨石（規格第 32 節 A、B）：手貼在石面哪裡、身體正不正、有幾個同伴一起推。
    /// 推邊緣省力但比較吵、推中間慢但安靜；歪著推使不上力、還會手滑；人多推得快、比較不會卡。
    /// </summary>
    public readonly struct PushContact
    {
        public const float MinFacing = 0.7f;
        public const float FullFacing = 0.95f;
        public const int MaxHelpers = 4;
        public const float HelperBoost = 0.35f;
        public const float MaxSlipChance = 0.3f;

        /// <summary>巨石移動速度的倍率。</summary>
        public readonly float SpeedMultiplier;
        /// <summary>輕推磨擦聲的聲量倍率。</summary>
        public readonly float NoiseMultiplier;
        /// <summary>輕推卡住機率的倍率。</summary>
        public readonly float CatchMultiplier;
        /// <summary>每一聲磨擦時手滑的機率。</summary>
        public readonly float SlipChance;

        public PushContact(float speed, float noise, float catching, float slip)
        {
            SpeedMultiplier = speed;
            NoiseMultiplier = noise;
            CatchMultiplier = catching;
            SlipChance = slip;
        }

        /// <summary>不改變任何東西（原本的推法）。</summary>
        public static PushContact Neutral => new PushContact(1f, 1f, 1f, 0f);

        /// <param name="lateral">手的位置：−1＝左緣、0＝中間、+1＝右緣（超出會夾住）。</param>
        /// <param name="facing">面向與石面法線夾角的 cos（0.7 以上才算面向巨石）。</param>
        /// <param name="helpers">一起推的同伴（最多算 4 個）。</param>
        public static PushContact Evaluate(float lateral, float facing, int helpers)
        {
            float u = Math.Min(1f, Math.Abs(lateral));
            float e = Math.Clamp((facing - MinFacing) / (FullFacing - MinFacing), 0f, 1f);
            int n = Math.Clamp(helpers, 0, MaxHelpers);
            float speed = (0.85f + 0.35f * u) * (0.5f + 0.5f * e) * (1f + HelperBoost * n);
            float noise = 0.7f + 0.6f * u;
            float catching = 1f / (1f + n);
            float slip = MaxSlipChance * (1f - e);
            return new PushContact(speed, noise, catching, slip);
        }
    }
}
