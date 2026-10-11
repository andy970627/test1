using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 巨石進度的分段（規格第 22 節 C）：開口每過全開的 25%（這一夜第一次越過）回報一次，
    /// 讓巨石「咚」地沉一聲；滑回後再推過同一格不重複。
    /// </summary>
    public sealed class BoulderMilestones
    {
        public const int Steps = 4;
        const float StepMeters = BoulderSlide.FullOpen / Steps;

        int reached;

        /// <summary>這次越過的最高一格（1～4）；沒有越過新的格回傳 0。</summary>
        public int Update(float opening)
        {
            int step = Math.Min(Steps, (int)Math.Floor(opening / StepMeters + 1e-4f));
            if (step <= reached)
                return 0;
            reached = step;
            return step;
        }

        public void Reset() => reached = 0;
    }
}
