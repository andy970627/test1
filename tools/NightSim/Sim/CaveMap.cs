using System;
using System.Collections.Generic;
using System.Numerics;

namespace Odyssey.Sim
{
    /// <summary>
    /// 洞穴的平面近似（座標同遊戲：X＝世界 x，Y＝世界 z），數值取自 CaveBuilder／BlindCaveBuilder。
    /// 沒有模擬：地形高低、羊、羊圈、奶桶、乳酪架、木樁（見報告的「限制」）。
    /// </summary>
    public static class CaveMap
    {
        public const float RadiusX = 15f, RadiusZ = 10f;
        /// <summary>可以走的範圍：橢圓內縮一點，避開岩壁。</summary>
        public const float WalkableScale = 0.92f;

        public static readonly Vector2 PlayerSpawn = new(-6f, -3f);
        public static readonly Vector2 CyclopsSeat = new(3.5f, 5.5f);
        /// <summary>站在這裡推巨石（巨石內側）。</summary>
        public static readonly Vector2 PushPoint = new(0f, 8.1f);
        /// <summary>縫口：全開後在這裡鑽出去。</summary>
        public static readonly Vector2 GapPoint = new(0f, 8.4f);

        public const float PushReach = 1.5f;
        public const float PickupReach = 0.8f;
        public const float CrewReach = 1.2f;

        // 躲藏點、石子的散布範圍（BlindCaveBuilder 用的 Floor bounds）。
        static readonly Vector2 FloorMin = new(-10f, -6f), FloorMax = new(6f, 4f);

        public static bool Walkable(Vector2 p)
        {
            float x = p.X / (RadiusX * WalkableScale), z = p.Y / (RadiusZ * WalkableScale);
            return x * x + z * z <= 1f || Vector2.Distance(p, PushPoint) <= 1.6f;
        }

        /// <summary>把點拉回可走範圍內。</summary>
        public static Vector2 Clamp(Vector2 p)
        {
            if (Walkable(p))
                return p;
            float x = p.X / (RadiusX * WalkableScale), z = p.Y / (RadiusZ * WalkableScale);
            float k = 1f / MathF.Sqrt(x * x + z * z) * 0.999f;
            return p * k;
        }

        /// <summary>同 BlindCaveBuilder.PickSpots：在地板範圍內隨機挑點，彼此相隔 spacing、離巨石至少 clearance。</summary>
        public static List<Vector2> PickSpots(Random rng, int count, float spacing, float clearance)
        {
            var spots = new List<Vector2>();
            for (int tries = 0; tries < 2000 && spots.Count < count; tries++)
            {
                var p = new Vector2(
                    FloorMin.X + (float)rng.NextDouble() * (FloorMax.X - FloorMin.X),
                    FloorMin.Y + (float)rng.NextDouble() * (FloorMax.Y - FloorMin.Y));
                if (!Walkable(p) || Vector2.Distance(p, PushPoint) < clearance)
                    continue;
                bool ok = true;
                foreach (var s in spots)
                    if (Vector2.Distance(s, p) < spacing)
                    {
                        ok = false;
                        break;
                    }
                if (ok)
                    spots.Add(p);
            }
            return spots;
        }
    }
}
