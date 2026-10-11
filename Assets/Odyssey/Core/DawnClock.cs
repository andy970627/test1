using System;

namespace Odyssey.Core
{
    /// <summary>一夜的倒數；天亮時巨人把巨石推回原位。</summary>
    public sealed class DawnClock
    {
        public const float DefaultNightSeconds = 240f;

        readonly float nightSeconds;

        public float Elapsed { get; private set; }
        public float Fraction => Math.Clamp(Elapsed / nightSeconds, 0f, 1f);
        public bool IsDawn => Elapsed >= nightSeconds;

        public DawnClock(float nightSeconds = DefaultNightSeconds) => this.nightSeconds = nightSeconds;

        public void Tick(float dt) => Elapsed += dt;

        public void Reset() => Elapsed = 0f;
    }
}
