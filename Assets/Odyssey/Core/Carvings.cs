using System.Collections.Generic;
using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>
    /// 刻痕（規格第 34 節 D）：玩家在岩壁上刻的記號，跨夜保留（新遊戲才清空），最多 8 道，刻第 9 道時最舊的消失。
    /// 巨人摸索時碰到刻痕，會沿著刻痕往下一道走（見 <see cref="CyclopsBrain"/>）。
    /// </summary>
    public sealed class Carvings
    {
        public const int Max = 8;
        public const float CarveSeconds = 0.8f;
        /// <summary>貼著岩壁：洞（15 × 10 m 的橢圓）的相對半徑至少這麼大。</summary>
        public const float WallRatio = 0.8f;
        const float RadiusX = 15f, RadiusZ = 10f;

        readonly List<Vector2> marks = new();

        public IReadOnlyList<Vector2> Marks => marks;
        public int Count => marks.Count;

        public static bool NearWall(Vector2 p)
        {
            float x = p.X / RadiusX, y = p.Y / RadiusZ;
            return x * x + y * y >= WallRatio * WallRatio;
        }

        /// <summary>刻一道；超過上限時回傳被擠掉的那一道的索引 0（最舊），否則 -1。</summary>
        public int Add(Vector2 at)
        {
            int dropped = -1;
            if (marks.Count >= Max)
            {
                marks.RemoveAt(0);
                dropped = 0;
            }
            marks.Add(at);
            return dropped;
        }

        public void Reset() => marks.Clear();
    }
}
