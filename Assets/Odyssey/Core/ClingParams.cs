using System;

namespace Odyssey.Core
{
    /// <summary>抱緊段的難度數值（暴露在 Inspector）。</summary>
    [Serializable]
    public sealed class ClingParams
    {
        public float GripDrainPerSec = 0.12f;
        public float RamGripDrainMultiplier = 0.5f;
        public float GripRecoverPerSec = 0.35f;
        public float SlideNoHandsPerSec = 0.5f;
        public float SlideOneHandPerSec = 0.08f;
        public float SlideRecoverPerSec = 0.1f;
        public float BreathHoldSeconds = 8f;
        public float BreathRecoverPerSec = 0.35f;
        public float BreathingNoiseBase = 0.25f;
        public float BreathingNoiseDeprived = 0.5f;
        public float LeanSwitchNoise = 0.5f;
    }
}
