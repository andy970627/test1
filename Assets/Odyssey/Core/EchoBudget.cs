using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>聲波滿了要擠掉哪一個：挑「半徑 × 剩餘壽命」最小的，讓推巨石、石子這種大聲波留到淡完。</summary>
    public static class EchoBudget
    {
        public static int IndexToEvict(IReadOnlyList<float> radii, IReadOnlyList<float> ages, float lifeSeconds)
        {
            int best = 0;
            float bestScore = float.MaxValue;
            for (int i = 0; i < radii.Count; i++)
            {
                float remaining = 1f - ages[i] / lifeSeconds;
                if (remaining < 0f)
                    remaining = 0f;
                float score = radii[i] * remaining;
                if (score < bestScore || (score == bestScore && ages[i] > ages[best]))
                {
                    best = i;
                    bestScore = score;
                }
            }
            return best;
        }
    }
}
