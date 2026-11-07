using System;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class BoulderSlideTests
    {
        const float Eps = 1e-4f;

        /// <summary>用小步猛推到開口剛好超過 target（之後的斷言用相對值或楔子實際位置）。</summary>
        static void PushTo(BoulderSlide s, float target)
        {
            while (s.Opening < target)
                s.Tick(0.01f, PushMode.Heavy, false);
        }

        [Test]
        public void Light_RampsThenSixCmPerSecond()
        {
            var s = new BoulderSlide();
            s.Tick(0.5f, PushMode.Light, false);
            Assert.AreEqual(0.015f, s.Opening, Eps);
            s.Tick(1f, PushMode.Light, false);
            Assert.AreEqual(0.075f, s.Opening, Eps);
        }

        [Test]
        public void Heavy_FullSpeedAfterRamp()
        {
            var s = new BoulderSlide();
            s.Tick(0.5f, PushMode.Heavy, false);
            float before = s.Opening;
            s.Tick(1f, PushMode.Heavy, false);
            Assert.AreEqual(0.18f, s.Opening - before, Eps);
        }

        [Test]
        public void Stake_MultipliesSpeed()
        {
            var s = new BoulderSlide();
            s.Tick(0.5f, PushMode.Light, false);
            float before = s.Opening;
            s.Tick(1f, PushMode.Light, true);
            Assert.AreEqual(0.09f, s.Opening - before, Eps);
        }

        [Test]
        public void Ramp_SameForOneOrManyTicks()
        {
            var a = new BoulderSlide();
            a.Tick(0.5f, PushMode.Light, false);
            var b = new BoulderSlide();
            for (int i = 0; i < 5; i++)
                b.Tick(0.1f, PushMode.Light, false);
            Assert.AreEqual(a.Opening, b.Opening, 1e-5f);
        }

        [Test]
        public void Release_ResetsRamp()
        {
            var s = new BoulderSlide();
            s.Tick(2f, PushMode.Light, false);
            s.Tick(0.1f, PushMode.None, false);
            float before = s.Opening;
            s.Tick(0.5f, PushMode.Light, false);
            Assert.AreEqual(0.015f, s.Opening - before, Eps);
        }

        [Test]
        public void Opening_CapsAtFullOpen()
        {
            var s = new BoulderSlide();
            s.Tick(20f, PushMode.Heavy, false);
            Assert.AreEqual(BoulderSlide.FullOpen, s.Opening, 1e-6f);
            Assert.IsTrue(s.IsOpen);
        }

        [Test]
        public void PushNoise_EveryHalfSecond()
        {
            var s = new BoulderSlide();
            int grinds = 0, heavies = 0;
            for (int i = 0; i < 10; i++)
            {
                var n = s.Tick(0.1f, PushMode.Light, false);
                if (n.Grind) grinds++;
                if (n.Heavy) heavies++;
            }
            Assert.AreEqual(2, grinds);
            Assert.AreEqual(0, heavies);
        }

        [Test]
        public void HeavyPush_MakesHeavyNoise()
        {
            var s = new BoulderSlide();
            var n = s.Tick(0.5f, PushMode.Heavy, false);
            Assert.IsTrue(n.Heavy);
            Assert.IsFalse(n.Grind);
        }

        [Test]
        public void PushNoise_SilentWhenAlreadyOpen()
        {
            var s = new BoulderSlide();
            s.Tick(20f, PushMode.Heavy, false);
            s.Tick(0.1f, PushMode.None, false);
            var n = s.Tick(1f, PushMode.Heavy, false);
            Assert.IsFalse(n.Heavy || n.Grind);
        }

        [Test]
        public void Release_SlipsAfterThreeSeconds()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.5f);
            float pushed = s.Opening;
            var n1 = s.Tick(2.9f, PushMode.None, false);
            Assert.AreEqual(pushed, s.Opening, 1e-6f);
            Assert.IsFalse(n1.Slip);
            var n2 = s.Tick(1.1f, PushMode.None, false);
            Assert.AreEqual(pushed * Math.Exp(-BoulderSlide.SlipRate * 1.0), s.Opening, Eps);
            Assert.IsTrue(n2.Slip);
        }

        [Test]
        public void Slip_SlowerWhenLessOpen()
        {
            // 斜坡：滑回速度 = 0.02 × 開口 ÷ 全開。
            Assert.AreEqual(0.02f, BoulderSlide.SlipSpeedAt(BoulderSlide.FullOpen), 1e-6f);
            Assert.AreEqual(0.01f, BoulderSlide.SlipSpeedAt(BoulderSlide.FullOpen / 2f), 1e-6f);
            Assert.AreEqual(0f, BoulderSlide.SlipSpeedAt(0f), 1e-6f);
        }

        [Test]
        public void Slip_SameForOneOrManyTicks()
        {
            var a = new BoulderSlide();
            var b = new BoulderSlide();
            PushTo(a, 0.7f);
            PushTo(b, 0.7f);
            b.Tick(0f, PushMode.None, false);
            a.Tick(13f, PushMode.None, false);
            for (int i = 0; i < 130; i++)
                b.Tick(0.1f, PushMode.None, false);
            Assert.AreEqual(a.Opening, b.Opening, 1e-4f);
        }

        [Test]
        public void Slip_StopsAtNotchBelow()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.8f);
            s.Tick(600f, PushMode.None, false);
            Assert.AreEqual(BoulderSlide.NotchMeters * 2f, s.Opening, 1e-5f);
        }

        [Test]
        public void Slip_AtNotch_DoesNotSlip_FullOpenStays()
        {
            var s = new BoulderSlide();
            s.Tick(20f, PushMode.Heavy, false);
            s.Tick(600f, PushMode.None, false);
            Assert.IsTrue(s.IsOpen);
        }

        [Test]
        public void Slip_StopsAtWedgeAboveNotch()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.5f);
            s.AddStoneWedge();
            float wedge = s.StoneWedges[0];
            PushTo(s, 0.6f);
            s.Tick(600f, PushMode.None, false);
            Assert.AreEqual(wedge, s.Opening, 1e-6f);
            Assert.AreEqual(wedge, s.Floor, 1e-6f);
        }

        [Test]
        public void Braced_DoesNotSlip_AndRestartsDelay()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.5f);
            float pushed = s.Opening;
            s.Tick(10f, PushMode.None, false, braced: true);
            Assert.AreEqual(pushed, s.Opening, 1e-6f);
            // 離開後還要再等 3 秒才開始滑。
            s.Tick(2.9f, PushMode.None, false);
            Assert.AreEqual(pushed, s.Opening, 1e-6f);
            s.Tick(0.2f, PushMode.None, false);
            Assert.Less(s.Opening, pushed);
        }

        [Test]
        public void PlayerPull_RemovesOutermost()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.3f);
            s.AddStoneWedge();
            float inner = s.StoneWedges[0];
            PushTo(s, 0.6f);
            s.AddStoneWedge();
            Assert.IsTrue(s.RemoveOutermostStoneWedge());
            Assert.AreEqual(1, s.StoneWedges.Count);
            Assert.AreEqual(inner, s.StoneWedges[0], 1e-6f);
        }

        [Test]
        public void PlayerPull_NoWedge_ReturnsFalse()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.3f);
            float before = s.Opening;
            Assert.IsFalse(s.RemoveOutermostStoneWedge());
            Assert.AreEqual(before, s.Opening, 1e-6f);
        }

        [Test]
        public void GiantPull_SlidesBackFastAndSilently()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.3f);
            s.AddStoneWedge();
            float inner = s.StoneWedges[0];
            PushTo(s, 0.6f);
            s.AddStoneWedge();
            float outer = s.Opening;

            Assert.IsTrue(s.GiantPull());
            var n = s.Tick(0.5f, PushMode.Heavy, false);
            Assert.AreEqual(outer - 0.15f, s.Opening, Eps);
            Assert.IsTrue(s.PullingBack);
            Assert.IsFalse(n.Grind || n.Heavy || n.Slip);

            n = s.Tick(1f, PushMode.None, false);
            Assert.AreEqual(inner, s.Opening, 1e-6f);
            Assert.IsFalse(s.PullingBack);
            Assert.IsFalse(n.Slip);
        }

        [Test]
        public void GiantPull_IgnoresStake()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.5f);
            s.PlantStake();
            float stake = s.Opening;
            Assert.IsFalse(s.GiantPull());
            Assert.AreEqual(stake, s.StakeWedge.Value, 1e-6f);
            Assert.IsFalse(s.PullingBack);
        }

        [Test]
        public void GiantPull_StakeBelowStone_StopsAtStake()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.4f);
            s.PlantStake();
            float stake = s.Opening;
            PushTo(s, 0.7f);
            s.AddStoneWedge();
            Assert.IsTrue(s.GiantPull());
            s.Tick(5f, PushMode.None, false);
            Assert.AreEqual(stake, s.Opening, 1e-6f);
        }

        [Test]
        public void Wedge_AtFullOpen_NoJump()
        {
            var s = new BoulderSlide();
            s.Tick(20f, PushMode.Heavy, false);
            s.AddStoneWedge();
            Assert.AreEqual(BoulderSlide.FullOpen, s.Opening, 1e-6f);
            Assert.AreEqual(BoulderSlide.FullOpen, s.Floor, 1e-6f);
            s.Tick(10f, PushMode.None, false);
            Assert.AreEqual(BoulderSlide.FullOpen, s.Opening, 1e-6f);
        }

        [Test]
        public void MaxOpening_RemembersPeak()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.6f);
            float peak = s.Opening;
            s.Tick(10f, PushMode.None, false);
            Assert.Less(s.Opening, peak);
            Assert.AreEqual(peak, s.MaxOpening, 1e-6f);
        }

        [Test]
        public void RemoveStake_ThenSlipsBack()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.5f);
            s.PlantStake();
            Assert.IsTrue(s.RemoveStake());
            Assert.IsNull(s.StakeWedge);
            Assert.IsFalse(s.RemoveStake());
            s.Tick(5f, PushMode.None, false);
            Assert.Less(s.Opening, 0.5f);
        }

        [Test]
        public void Jolt_StopsAtFloor()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.5f);
            s.AddStoneWedge();
            float wedge = s.Opening;
            PushTo(s, wedge + 0.02f);
            s.Jolt(0.05f);
            Assert.AreEqual(wedge, s.Opening, 1e-6f);
        }

        [Test]
        public void Jolt_BacksOffFromFullOpen()
        {
            var s = new BoulderSlide();
            s.Tick(20f, PushMode.Heavy, false);
            s.Jolt(0.05f);
            Assert.AreEqual(BoulderSlide.FullOpen - 0.05f, s.Opening, 1e-5f);
            Assert.IsFalse(s.IsOpen);
        }

        // ---------- 輕推會卡一下（規格第 15 節 A） ----------

        static Func<double> Always(double v) => () => v;

        /// <summary>每 0.1 秒輕推一次，回傳第一次卡住時的累計秒數；沒卡回傳 −1。</summary>
        static float FirstCatch(BoulderSlide s, float seconds)
        {
            for (int i = 1; i <= Steps(seconds); i++)
                if (s.Tick(0.1f, PushMode.Light, false).Catch)
                    return i * 0.1f;
            return -1f;
        }

        static int Steps(float seconds) => (int)Math.Round(seconds / 0.1f);

        [Test]
        public void Catch_DefaultNeverCatches()
        {
            Assert.AreEqual(-1f, FirstCatch(new BoulderSlide(), 30f));
        }

        [Test]
        public void Catch_ChanceGrowsWithPushTime()
        {
            Assert.AreEqual(3.0f, FirstCatch(new BoulderSlide(Always(0.055)), 10f), 1e-4f);
        }

        [Test]
        public void Catch_CapsAtPointFour()
        {
            Assert.AreEqual(20.0f, FirstCatch(new BoulderSlide(Always(0.395)), 23f), 1e-4f);
            Assert.AreEqual(-1f, FirstCatch(new BoulderSlide(Always(0.41)), 23f));
        }

        [Test]
        public void Catch_StallsThreeTenths()
        {
            var s = new BoulderSlide(Always(0.0));
            Assert.Greater(FirstCatch(s, 2f), 0f);
            float atCatch = s.Opening;
            Assert.IsTrue(s.Stalled);
            for (int i = 0; i < 3; i++)
                s.Tick(0.1f, PushMode.Light, false);
            Assert.AreEqual(atCatch, s.Opening, 1e-6f);
            s.Tick(0.1f, PushMode.Light, false);
            s.Tick(0.1f, PushMode.Light, false);
            Assert.Greater(s.Opening, atCatch);
        }

        [Test]
        public void Catch_ResetsCounter()
        {
            var s = new BoulderSlide(Always(0.0));
            FirstCatch(s, 2f);
            Assert.AreEqual(0f, s.LightPushSeconds, 1e-6f);
        }

        [Test]
        public void Release_TwoSecondsResetsCounter()
        {
            var a = new BoulderSlide();
            a.Tick(4f, PushMode.Light, false);
            a.Tick(1.9f, PushMode.None, false);
            a.Tick(0.1f, PushMode.Light, false);
            Assert.AreEqual(4.1f, a.LightPushSeconds, 1e-4f);

            var b = new BoulderSlide();
            b.Tick(4f, PushMode.Light, false);
            b.Tick(2f, PushMode.None, false);
            b.Tick(0.1f, PushMode.Light, false);
            Assert.AreEqual(0.1f, b.LightPushSeconds, 1e-4f);
        }

        [Test]
        public void Heavy_NeverCatches_AndResetsCounter()
        {
            var s = new BoulderSlide(Always(0.0));
            s.Tick(0.3f, PushMode.Light, false);
            for (int i = 0; i < 50; i++)
                Assert.IsFalse(s.Tick(0.1f, PushMode.Heavy, false).Catch);
            Assert.AreEqual(0f, s.LightPushSeconds, 1e-6f);
        }

        [Test]
        public void PullingBack_NoCatchRoll()
        {
            var s = new BoulderSlide(Always(0.0));
            PushTo(s, 0.3f);
            s.AddStoneWedge();
            PushTo(s, 0.6f);
            s.AddStoneWedge();
            Assert.IsTrue(s.GiantPull());
            for (int i = 0; i < 9; i++)
            {
                Assert.IsTrue(s.PullingBack);
                Assert.IsFalse(s.Tick(0.1f, PushMode.Light, false).Catch);
            }
            Assert.AreEqual(0f, s.LightPushSeconds, 1e-6f);
        }

        [Test]
        public void Stall_KeepsGrindCadence()
        {
            bool first = true;
            var s = new BoulderSlide(() => { bool f = first; first = false; return f ? 0.0 : 0.99; });
            int grinds = 0;
            for (int i = 0; i < 20; i++)
                if (s.Tick(0.1f, PushMode.Light, false).Grind)
                    grinds++;
            Assert.AreEqual(4, grinds);
        }

        [Test]
        public void Reset_ClearsEverything()
        {
            var s = new BoulderSlide();
            PushTo(s, 0.5f);
            s.AddStoneWedge();
            s.PlantStake();
            s.Reset();
            Assert.AreEqual(0f, s.Opening);
            Assert.AreEqual(0f, s.MaxOpening);
            Assert.AreEqual(0, s.StoneWedges.Count);
            Assert.IsNull(s.StakeWedge);
            Assert.IsFalse(s.PullingBack);
        }
    }
}
