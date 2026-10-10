using System;

namespace Odyssey.Core
{
    /// <summary>抱在羊肚下的三條身體狀態：握力（左右手）、呼吸（氧氣）、重心（貼向哪一側）。</summary>
    public sealed class ClingModel
    {
        // 浮點累加的容差：0.05 加 20 次不一定剛好等於 1。
        const float Epsilon = 1e-4f;

        readonly ClingParams p;
        readonly float gripDrain;

        public float GripLeft { get; private set; } = 1f;
        public float GripRight { get; private set; } = 1f;
        public float Slide { get; private set; }
        public float Oxygen { get; private set; } = 1f;
        public float Noise { get; private set; }
        public Side Lean { get; private set; } = Side.Left;
        public bool HoldingBreath { get; private set; }

        public ClingModel(ClingParams parameters, bool isRam)
        {
            p = parameters;
            gripDrain = p.GripDrainPerSec * (isRam ? p.RamGripDrainMultiplier : 1f);
        }

        public FailReason Tick(float dt, bool holdLeft, bool holdRight, bool holdBreath, Side lean)
        {
            GripLeft = UpdateGrip(GripLeft, holdLeft, dt);
            GripRight = UpdateGrip(GripRight, holdRight, dt);
            int hands = (holdLeft && GripLeft > 0f ? 1 : 0) + (holdRight && GripRight > 0f ? 1 : 0);
            Slide = hands switch
            {
                0 => Slide + p.SlideNoHandsPerSec * dt,
                1 => Slide + p.SlideOneHandPerSec * dt,
                _ => Math.Max(0f, Slide - p.SlideRecoverPerSec * dt),
            };

            HoldingBreath = holdBreath;
            Oxygen = holdBreath
                ? Oxygen - dt / p.BreathHoldSeconds
                : Math.Min(1f, Oxygen + p.BreathRecoverPerSec * dt);

            Noise = holdBreath ? 0f : p.BreathingNoiseBase + p.BreathingNoiseDeprived * (1f - Oxygen);
            if (lean != Lean)
                Noise = Math.Max(Noise, p.LeanSwitchNoise);
            Lean = lean;

            if (Slide >= 1f - Epsilon)
                return FailReason.Fell;
            if (Oxygen <= Epsilon)
                return FailReason.Gasped;
            return FailReason.None;
        }

        float UpdateGrip(float grip, bool held, float dt)
        {
            float next = held ? grip - gripDrain * dt : grip + p.GripRecoverPerSec * dt;
            return Math.Clamp(next, 0f, 1f);
        }
    }
}
