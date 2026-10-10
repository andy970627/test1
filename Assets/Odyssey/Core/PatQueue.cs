using System;
using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>巨人依序摸每一隻到洞口的羊：目前這隻的每一步跑完才換下一隻，不會被後來的羊覆蓋。</summary>
    public sealed class PatQueue<T> where T : class
    {
        readonly Queue<(T item, IReadOnlyList<PatStep> steps)> pending = new();
        IReadOnlyList<PatStep> steps;
        int stepIndex;

        public T Current { get; private set; }
        public PatStep? CurrentStep => Current != null ? steps[stepIndex] : null;
        public float StepElapsed { get; private set; }

        public event Action<T, PatStep> StepStarted;
        public event Action<T> Finished;

        public void Enqueue(T item, IReadOnlyList<PatStep> itemSteps)
        {
            if (itemSteps.Count > 0)
                pending.Enqueue((item, itemSteps));
        }

        /// <summary>推進時間；回傳本次之後是否還有羊正在被摸。</summary>
        public bool Tick(float dt)
        {
            if (Current == null && !StartNext())
                return false;

            StepElapsed += dt;
            while (Current != null && StepElapsed >= steps[stepIndex].Duration)
            {
                StepElapsed -= steps[stepIndex].Duration;
                if (stepIndex + 1 < steps.Count)
                {
                    stepIndex++;
                    StepStarted?.Invoke(Current, steps[stepIndex]);
                    continue;
                }
                var done = Current;
                Current = null;
                Finished?.Invoke(done);
                float leftover = StepElapsed;
                if (!StartNext())
                    break;
                StepElapsed = leftover;
            }
            return Current != null;
        }

        bool StartNext()
        {
            StepElapsed = 0f;
            if (pending.Count == 0)
                return false;
            (Current, steps) = pending.Dequeue();
            stepIndex = 0;
            StepStarted?.Invoke(Current, steps[0]);
            return true;
        }
    }
}
