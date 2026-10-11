using System.Collections.Generic;
using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>
    /// 同伴排成一列跟在玩家後面：記下玩家走過的路線，第 i 位跟隨者站在路線上離玩家 (i+1) m 處。
    /// 路線不夠長時停在路線起點，所以玩家原地不動時隊伍不會疊上來。
    /// </summary>
    public sealed class FollowTrail
    {
        public const float Spacing = 1f;
        const float MinStep = 0.1f;
        const int MaxFollowers = CrewRoster.StartingCrew;

        // 最舊的點在前、最新的點在尾端。
        readonly List<Vector2> points = new();

        public FollowTrail(Vector2 start) => Reset(start);

        public void Reset(Vector2 start)
        {
            points.Clear();
            points.Add(start);
        }

        public void Record(Vector2 leader)
        {
            if (Vector2.Distance(points[points.Count - 1], leader) < MinStep)
                return;
            points.Add(leader);
            Prune();
        }

        public Vector2 PositionAt(int index)
        {
            float target = (index + 1) * Spacing;
            float walked = 0f;
            for (int k = points.Count - 1; k > 0; k--)
            {
                Vector2 from = points[k], to = points[k - 1];
                float length = Vector2.Distance(from, to);
                if (walked + length >= target)
                    return Vector2.Lerp(from, to, (target - walked) / length);
                walked += length;
            }
            return points[0];
        }

        /// <summary>只留最後一位跟隨者用得到的長度，丟掉更舊的點。</summary>
        void Prune()
        {
            float keep = (MaxFollowers + 2) * Spacing;
            float walked = 0f;
            for (int k = points.Count - 1; k > 0; k--)
            {
                walked += Vector2.Distance(points[k], points[k - 1]);
                if (walked > keep)
                {
                    points.RemoveRange(0, k - 1);
                    return;
                }
            }
        }
    }
}
