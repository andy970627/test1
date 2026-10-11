using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 會動的小東西（石子、奶桶、乳酪、木樁）撞到東西時的聲量：撞得越用力越大聲。
    /// 撞擊速度 1.5 m/s 以下不出聲；聲量 = 最大聲量 × 速度 ÷ 9，夾在 0.1 與最大聲量之間。
    /// </summary>
    public static class ImpactSound
    {
        public const float MinSpeed = 1.5f;
        public const float ReferenceSpeed = 9f;
        public const float MinLoudness = 0.1f;
        public const float Cooldown = 0.3f;

        public static float Loudness(float maxLoudness, float speed)
        {
            if (speed < MinSpeed)
                return 0f;
            float loudness = maxLoudness * speed / ReferenceSpeed;
            return Math.Max(MinLoudness, Math.Min(maxLoudness, loudness));
        }
    }

    /// <summary>同一個物件 0.3 秒內只發一次撞擊聲，彈跳時不會一口氣響一串。</summary>
    public sealed class ImpactGate
    {
        float last = float.NegativeInfinity;

        public bool TryFire(float time)
        {
            if (time - last < ImpactSound.Cooldown)
                return false;
            last = time;
            return true;
        }
    }
}
