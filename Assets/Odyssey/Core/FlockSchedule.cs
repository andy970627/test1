using System;
using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>羊群出洞順序（隨機、大公羊固定最後）與每隻的出洞時間。</summary>
    public sealed class FlockSchedule
    {
        readonly float firstExitDelay;
        readonly float exitInterval;
        readonly List<int> order;

        public IReadOnlyList<int> Order => order;

        public FlockSchedule(int sheepCount, int ramIndex, float firstExitDelay, float exitInterval, Random rng)
        {
            this.firstExitDelay = firstExitDelay;
            this.exitInterval = exitInterval;
            order = new List<int>(sheepCount);
            for (int i = 0; i < sheepCount; i++)
                if (i != ramIndex)
                    order.Add(i);
            for (int i = order.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                (order[i], order[j]) = (order[j], order[i]);
            }
            order.Add(ramIndex);
        }

        public float ExitTime(int position) => firstExitDelay + position * exitInterval;
    }
}
