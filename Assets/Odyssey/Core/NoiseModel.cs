using System;

namespace Odyssey.Core
{
    /// <summary>選羊段玩家發出的聲量。羊叫聲可以蓋過；越過門檻的那一刻巨人才會往聲音掃手。</summary>
    public sealed class NoiseModel
    {
        public float Decay = 0.5f;
        public float MaskFactor = 0.4f;
        public float Threshold = 0.6f;

        bool wasAbove;

        public float Level { get; private set; }

        /// <summary>聲量目前是否高於門檻（巨人空下手時，只要還高於門檻就會再掃）。</summary>
        public bool IsAbove => Level > Threshold;

        /// <summary>回傳本幀是否「由未超過變成超過」門檻。</summary>
        public bool Tick(float dt, float emitted, bool masked)
        {
            float heard = emitted * (masked ? MaskFactor : 1f);
            Level = Math.Clamp(Math.Max(Level - Decay * dt, heard), 0f, 1f);
            bool above = Level > Threshold;
            bool crossed = above && !wasAbove;
            wasAbove = above;
            return crossed;
        }
    }
}
