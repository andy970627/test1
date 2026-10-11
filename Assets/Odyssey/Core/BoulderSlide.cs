using System;
using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>None＝沒推；Light＝按住 E 輕推；Heavy＝Shift＋E 猛推。</summary>
    public enum PushMode { None, Light, Heavy }

    /// <summary>這一幀巨石該發的聲音：Grind＝輕推磨擦；Heavy＝猛推巨響；Slip＝放手後回滑。</summary>
    public readonly struct BoulderNoise
    {
        public readonly bool Grind;
        public readonly bool Heavy;
        public readonly bool Slip;

        public BoulderNoise(bool grind, bool heavy, bool slip)
        {
            Grind = grind;
            Heavy = heavy;
            Slip = slip;
        }
    }

    /// <summary>
    /// 封住洞口的巨石，開口是連續的距離（公尺，全開 1.44）。推它要從靜止慢慢起步，
    /// 放手 1 秒後它會往回滑，滑到最外面的楔子（石子或木樁）為止。
    /// 巨人能拔掉石子楔子，巨石就快速滑回下一個楔子；木樁拔不掉。
    /// </summary>
    public sealed class BoulderSlide
    {
        public const float FullOpen = 1.44f;
        public const float LightSpeed = 0.06f;
        public const float HeavySpeed = 0.18f;
        public const float RampSeconds = 0.5f;
        public const float SlipDelay = 1f;
        public const float SlipSpeed = 0.03f;
        public const float PullBackSpeed = 0.3f;
        public const float StakeMultiplier = 1.5f;
        public const float PushNoiseSeconds = 0.5f;
        public const float SlipNoiseSeconds = 1f;

        const float TimerEps = 1e-5f;

        readonly List<float> stoneWedges = new();
        float pushSeconds;
        float releaseSeconds;
        float pushNoiseTimer;
        float slipNoiseTimer;

        public float Opening { get; private set; }
        public float MaxOpening { get; private set; }
        public bool IsOpen => Opening >= FullOpen - 1e-6f;
        public IReadOnlyList<float> StoneWedges => stoneWedges;
        public float? StakeWedge { get; private set; }
        public bool PullingBack { get; private set; }

        /// <summary>巨石最多滑回到這裡：所有楔子的最大值，沒有楔子為 0。</summary>
        public float Floor
        {
            get
            {
                float floor = StakeWedge ?? 0f;
                if (stoneWedges.Count > 0)
                    floor = Math.Max(floor, stoneWedges[stoneWedges.Count - 1]);
                return floor;
            }
        }

        public BoulderNoise Tick(float dt, PushMode mode, bool withStake)
        {
            if (PullingBack)
            {
                // 巨人拔楔子後的滑回：推力無效，也不發 Slip（Unity 端改發巨人的聲音）。
                pushSeconds = 0f;
                pushNoiseTimer = 0f;
                releaseSeconds = 0f;
                slipNoiseTimer = 0f;
                Opening = Math.Max(Floor, Opening - PullBackSpeed * dt);
                if (Opening <= Floor + 1e-6f)
                {
                    Opening = Floor;
                    PullingBack = false;
                }
                return default;
            }

            if (mode != PushMode.None)
                return Push(dt, mode, withStake);

            pushSeconds = 0f;
            pushNoiseTimer = 0f;
            float before = releaseSeconds;
            releaseSeconds += dt;
            float sliding = Math.Max(0f, releaseSeconds - Math.Max(before, SlipDelay));
            if (sliding <= 0f || Opening <= Floor)
            {
                slipNoiseTimer = 0f;
                return default;
            }
            Opening = Math.Max(Floor, Opening - SlipSpeed * sliding);
            slipNoiseTimer += sliding;
            bool slip = false;
            if (slipNoiseTimer + TimerEps >= SlipNoiseSeconds)
            {
                slipNoiseTimer -= SlipNoiseSeconds;
                slip = true;
            }
            return new BoulderNoise(false, false, slip);
        }

        BoulderNoise Push(float dt, PushMode mode, bool withStake)
        {
            releaseSeconds = 0f;
            slipNoiseTimer = 0f;
            bool wasOpen = IsOpen;

            float speed = (mode == PushMode.Heavy ? HeavySpeed : LightSpeed) * (withStake ? StakeMultiplier : 1f);
            float t0 = pushSeconds;
            pushSeconds += dt;
            Opening = Math.Min(FullOpen, Opening + speed * (RampedSeconds(pushSeconds) - RampedSeconds(t0)));
            MaxOpening = Math.Max(MaxOpening, Opening);

            if (wasOpen)
                return default;
            pushNoiseTimer += dt;
            if (pushNoiseTimer + TimerEps < PushNoiseSeconds)
                return default;
            pushNoiseTimer -= PushNoiseSeconds;
            return mode == PushMode.Heavy ? new BoulderNoise(false, true, false) : new BoulderNoise(true, false, false);
        }

        /// <summary>從開始推到 t 秒，換算成「全速推了幾秒」：前 0.5 秒速度線性起步。</summary>
        static float RampedSeconds(float t) =>
            t < RampSeconds ? t * t / (2f * RampSeconds) : RampSeconds / 2f + (t - RampSeconds);

        /// <summary>在目前開口塞一顆石子楔子。</summary>
        public void AddStoneWedge()
        {
            int i = stoneWedges.Count;
            while (i > 0 && stoneWedges[i - 1] > Opening)
                i--;
            stoneWedges.Insert(i, Opening);
        }

        /// <summary>玩家拔回開口最大的那顆石子楔子；之後巨石照一般規則回滑。</summary>
        public bool RemoveOutermostStoneWedge()
        {
            if (stoneWedges.Count == 0)
                return false;
            stoneWedges.RemoveAt(stoneWedges.Count - 1);
            return true;
        }

        /// <summary>巨人（或羊群）拔掉開口最大的石子楔子，巨石快速滑回新的 Floor；木樁不算。</summary>
        public bool GiantPull()
        {
            if (!RemoveOutermostStoneWedge())
                return false;
            PullingBack = Opening > Floor + 1e-6f;
            return true;
        }

        /// <summary>羊撞巨石：開口退 meters，不低於最外面的楔子。</summary>
        public void Jolt(float meters) => Opening = Math.Max(Floor, Opening - meters);

        /// <summary>把木樁插在目前開口，巨人拔不掉。</summary>
        public void PlantStake() => StakeWedge = Opening;

        public bool RemoveStake()
        {
            if (StakeWedge == null)
                return false;
            StakeWedge = null;
            return true;
        }

        public void Reset()
        {
            Opening = 0f;
            MaxOpening = 0f;
            stoneWedges.Clear();
            StakeWedge = null;
            PullingBack = false;
            pushSeconds = 0f;
            releaseSeconds = 0f;
            pushNoiseTimer = 0f;
            slipNoiseTimer = 0f;
        }
    }
}
