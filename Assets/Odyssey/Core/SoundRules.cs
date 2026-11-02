using System.Collections.Generic;
using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>
    /// 聲音的規則：你看得多遠，他就聽得多遠。每個聲音只有一個半徑（聲量 × 20 m），
    /// 同時是回聲照亮的範圍與巨人的聽覺範圍。剛叫過的羊會蓋過附近的聲音。
    /// Clap 現在是彈弓的空扣（玩家面向名稱「製造聲音」），聲量 0.5 並會照亮；SnapShot＝石子射出的啪（0.4，照亮）；Stretch＝拉皮筋（0.1，不照亮）。
    /// </summary>
    public static class SoundRules
    {
        public const float RadiusPerLoudness = 20f;
        public const float MaskFactor = 0.4f;
        public const float MaskRadius = 3f;
        public const float MaskSeconds = 1f;

        public static float Loudness(SoundKind kind) => kind switch
        {
            SoundKind.Step => 0.15f,
            SoundKind.Run => 0.4f,
            SoundKind.Clap => 0.5f,
            SoundKind.Stone => 0.6f,
            SoundKind.Boulder => 1.0f,
            SoundKind.Bleat => 0.5f,
            SoundKind.Cyclops => 0.15f,
            SoundKind.Pant => 0.2f,
            SoundKind.Whimper => 0.2f,
            SoundKind.RockImpact => 0.8f,
            SoundKind.Drag => 0.25f,
            SoundKind.Clatter => 0.7f,
            SoundKind.Cheese => 0.4f,
            SoundKind.Wicker => 0.25f,
            SoundKind.Grind => 0.3f,
            SoundKind.Slip => 0.15f,
            SoundKind.Wedge => 0.25f,
            SoundKind.Arrow => 0.5f,
            SoundKind.Twang => 0.1f,
            SoundKind.SnapShot => 0.4f,
            SoundKind.Stretch => 0.1f,
            _ => 0f,
        };

        public static SoundSource Source(SoundKind kind) => kind switch
        {
            SoundKind.Bleat => SoundSource.Sheep,
            SoundKind.Cyclops => SoundSource.Cyclops,
            SoundKind.RockImpact => SoundSource.Cyclops,
            SoundKind.Whimper => SoundSource.Crew,
            _ => SoundSource.Player,
        };

        /// <summary>巨石的聲音（猛推、輕推、回滑）：巨人聽到就跑回去守石。</summary>
        public static bool IsBoulder(SoundKind kind) =>
            kind == SoundKind.Boulder || kind == SoundKind.Grind || kind == SoundKind.Slip;

        /// <summary>會照亮四周的聲音（規格第 19 節 A）：只有玩家主動弄出來的；其他聲音巨人照樣聽得到，但只有聲音。</summary>
        public static bool Lights(SoundKind kind) => kind switch
        {
            SoundKind.Clap or SoundKind.Stone or SoundKind.Boulder or SoundKind.Grind or SoundKind.Wedge or SoundKind.Clatter or SoundKind.Arrow or SoundKind.SnapShot => true,
            _ => false,
        };

        public static float Radius(float loudness) => loudness * RadiusPerLoudness;

        /// <summary>建立聲音：聲量先乘 scale（羊圈、撞擊力道），羊叫以外的聲音若在最近一次羊叫的 3 m、1 秒內，再 ×0.4。</summary>
        public static SoundEvent Create(SoundKind kind, Vector2 position, float time, IReadOnlyList<SoundEvent> recentBleats, float scale = 1f)
        {
            float loudness = Loudness(kind) * scale;
            if (kind != SoundKind.Bleat && recentBleats != null)
                foreach (var bleat in recentBleats)
                {
                    float age = time - bleat.Time;
                    if (age >= 0f && age <= MaskSeconds && Vector2.Distance(bleat.Position, position) <= MaskRadius)
                    {
                        loudness *= MaskFactor;
                        break;
                    }
                }
            return new SoundEvent(kind, position, loudness, time);
        }

        /// <summary>巨人在 listener 能否聽到；巨人自己的聲音永遠不算。邊界上算聽得到。</summary>
        public static bool CanHear(SoundEvent e, Vector2 listener, float radiusMultiplier = 1f)
        {
            if (SoundRules.Source(e.Kind) == SoundSource.Cyclops)
                return false;
            return Vector2.Distance(e.Position, listener) <= Radius(e.Loudness) * radiusMultiplier + 1e-4f;
        }
    }
}
