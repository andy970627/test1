using System.Collections.Generic;
using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>
    /// 聲音的規則：你看得多遠，他就聽得多遠。每個聲音只有一個半徑（聲量 × 20 m），
    /// 同時是回聲照亮的範圍與巨人的聽覺範圍。剛叫過的羊會蓋過附近的聲音。
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
            _ => 0f,
        };

        public static SoundSource Source(SoundKind kind) => kind switch
        {
            SoundKind.Bleat => SoundSource.Sheep,
            SoundKind.Cyclops => SoundSource.Cyclops,
            _ => SoundSource.Player,
        };

        public static float Radius(float loudness) => loudness * RadiusPerLoudness;

        /// <summary>建立聲音；羊叫以外的聲音若在最近一次羊叫的 3 m、1 秒內，聲量 ×0.4。</summary>
        public static SoundEvent Create(SoundKind kind, Vector2 position, float time, IReadOnlyList<SoundEvent> recentBleats)
        {
            float loudness = Loudness(kind);
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
            if (e.Kind == SoundKind.Cyclops)
                return false;
            return Vector2.Distance(e.Position, listener) <= Radius(e.Loudness) * radiusMultiplier + 1e-4f;
        }
    }
}
