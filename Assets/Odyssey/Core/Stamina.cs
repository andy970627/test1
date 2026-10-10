using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 跑步的體力：滿格 1，跑每秒 −0.25、不跑每秒 +0.15；耗盡後要回到 0.3 才能再跑。
    /// 低於 0.25 時每 1.2 秒大口喘氣一次。
    /// </summary>
    public sealed class Stamina
    {
        public const float DrainPerSec = 0.25f;
        public const float RegenPerSec = 0.15f;
        public const float ResumeAt = 0.3f;
        public const float PantBelow = 0.25f;
        public const float PantSeconds = 1.2f;

        float pantTimer;

        public float Value { get; private set; }
        public bool CanRun { get; private set; }
        public bool Panting => Value < PantBelow;

        public Stamina() => Reset();

        public void Reset()
        {
            Value = 1f;
            CanRun = true;
            pantTimer = 0f;
        }

        /// <summary>推進時間；回傳這一幀是否真的在跑。</summary>
        public bool Tick(float dt, bool wantRun)
        {
            bool running = wantRun && CanRun;
            if (running)
            {
                Value = Math.Max(0f, Value - DrainPerSec * dt);
                if (Value <= 1e-5f)
                {
                    Value = 0f;
                    CanRun = false;
                }
            }
            else
            {
                Value = Math.Min(1f, Value + RegenPerSec * dt);
                if (!CanRun && Value >= ResumeAt)
                    CanRun = true;
            }
            return running;
        }

        /// <summary>低體力時每 1.2 秒回傳一次 true（該喘氣了）。</summary>
        public bool PantDue(float dt)
        {
            if (!Panting)
            {
                pantTimer = 0f;
                return false;
            }
            pantTimer += dt;
            if (pantTimer < PantSeconds - 1e-4f)
                return false;
            pantTimer = 0f;
            return true;
        }
    }
}
