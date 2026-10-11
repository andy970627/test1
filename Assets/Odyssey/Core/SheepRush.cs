using System;
using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>天光引羊這一幀的結果。</summary>
    public readonly struct RushTick
    {
        /// <summary>這一幀撞巨石的羊 index。</summary>
        public readonly IReadOnlyList<int> Jostled;
        /// <summary>這一幀有一次撞擊撞掉了石子楔子（每幀最多一次）。</summary>
        public readonly bool Knock;
        /// <summary>這一幀鑽出縫、離開洞穴的羊 index；沒有為 −1。</summary>
        public readonly int Escaped;
        /// <summary>卡在縫裡的羊該哀叫了。</summary>
        public readonly bool StuckBleat;

        public RushTick(IReadOnlyList<int> jostled, bool knock, int escaped, bool stuckBleat)
        {
            Jostled = jostled;
            Knock = knock;
            Escaped = escaped;
            StuckBleat = stuckBleat;
        }
    }

    /// <summary>
    /// 巨石第一次推到全開，外面的氣味透進來，羊群全部湧向縫：
    /// 擠在巨石前的羊每 2～4 秒撞一次巨石（開口退 0.05 m，30% 撞掉一顆石子楔子）；
    /// 開口 ≥ 1.0 m 時一次一隻花 2 秒鑽出去，鑽到一半開口變窄就卡住、一直哀叫，推回 ≥ 1.2 m 才掙脫。
    /// </summary>
    public sealed class SheepRush
    {
        public const float RushSpeed = 1.2f;
        public const float JostleReach = 1.5f;
        public const float JostleMin = 2f;
        public const float JostleMax = 4f;
        public const float JoltMeters = 0.05f;
        public const float KnockChance = 0.3f;
        public const float SqueezeWidth = 1.0f;
        public const float SqueezeReach = 1.5f;
        public const float SqueezeSeconds = 2f;
        public const float FreeWidth = 1.2f;
        public const float StuckBleatSeconds = 1.5f;

        readonly Func<double> roll;
        readonly float[] jostleTimers;
        readonly bool[] gone;
        float squeezeElapsed;
        float stuckTimer;

        public bool Active { get; private set; }
        /// <summary>正在鑽或卡在縫裡的羊 index；沒有為 −1。</summary>
        public int Squeezing { get; private set; } = -1;
        public bool Stuck { get; private set; }
        public IReadOnlyList<bool> Gone => gone;
        public bool GapClear => Squeezing < 0;

        public SheepRush(int sheepCount, Func<double> roll)
        {
            this.roll = roll;
            jostleTimers = new float[sheepCount];
            gone = new bool[sheepCount];
            Reset();
        }

        public void Reset()
        {
            Active = false;
            Squeezing = -1;
            Stuck = false;
            squeezeElapsed = 0f;
            stuckTimer = 0f;
            for (int i = 0; i < gone.Length; i++)
            {
                gone[i] = false;
                jostleTimers[i] = -1f;
            }
        }

        /// <param name="opening">巨石目前的開口（公尺）。</param>
        /// <param name="distToPushFace">每隻羊到巨石推的那一面的距離。</param>
        /// <param name="distToGap">每隻羊到縫的距離。</param>
        public RushTick Tick(float dt, float opening, IReadOnlyList<float> distToPushFace, IReadOnlyList<float> distToGap)
        {
            var jostled = new List<int>();
            if (!Active)
            {
                if (opening < BoulderSlide.FullOpen - 1e-6f)
                    return new RushTick(jostled, false, -1, false);
                Active = true;
            }

            bool knock = Jostle(dt, distToPushFace, jostled);
            int escaped = -1;
            bool bleat = false;
            StartSqueeze(opening, distToGap);
            if (Squeezing >= 0)
                Squeeze(dt, opening, ref escaped, ref bleat);
            return new RushTick(jostled, knock, escaped, bleat);
        }

        bool Jostle(float dt, IReadOnlyList<float> distToPushFace, List<int> jostled)
        {
            bool knock = false;
            for (int i = 0; i < gone.Length; i++)
            {
                // 離開範圍時計時器停住；鑽縫中的羊不撞。
                if (gone[i] || i == Squeezing || distToPushFace[i] > JostleReach)
                    continue;
                if (jostleTimers[i] < 0f)
                    jostleTimers[i] = NextInterval();
                jostleTimers[i] -= dt;
                if (jostleTimers[i] > 1e-5f)
                    continue;
                jostled.Add(i);
                if (roll() < KnockChance)
                    knock = true;
                jostleTimers[i] = NextInterval();
            }
            return knock;
        }

        void StartSqueeze(float opening, IReadOnlyList<float> distToGap)
        {
            if (Squeezing >= 0 || opening < SqueezeWidth)
                return;
            float best = SqueezeReach;
            for (int i = 0; i < gone.Length; i++)
                if (!gone[i] && distToGap[i] <= best)
                {
                    best = distToGap[i];
                    Squeezing = i;
                }
            if (Squeezing >= 0)
            {
                squeezeElapsed = 0f;
                Stuck = false;
            }
        }

        void Squeeze(float dt, float opening, ref int escaped, ref bool bleat)
        {
            if (!Stuck && opening < SqueezeWidth)
            {
                Stuck = true;
                stuckTimer = 0f;
            }
            if (Stuck)
            {
                if (opening < FreeWidth)
                {
                    stuckTimer += dt;
                    if (stuckTimer + 1e-5f >= StuckBleatSeconds)
                    {
                        stuckTimer -= StuckBleatSeconds;
                        bleat = true;
                    }
                    return;
                }
                // 掙脫了：從頭重新鑽 2 秒。
                Stuck = false;
                squeezeElapsed = 0f;
            }
            squeezeElapsed += dt;
            if (squeezeElapsed + 1e-5f < SqueezeSeconds)
                return;
            gone[Squeezing] = true;
            escaped = Squeezing;
            Squeezing = -1;
        }

        float NextInterval() => JostleMin + (float)roll() * (JostleMax - JostleMin);
    }
}
