using System;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class SheepRushTests
    {
        const float Full = BoulderSlide.FullOpen;
        static readonly float[] FarAway = { 10f, 10f };

        static float[] Dist(float a, float b) => new[] { a, b };

        static int CountJostles(SheepRush rush, int ticks, float dt, float opening, float[] face, float[] gap, int sheep, out bool anyKnock)
        {
            int count = 0;
            anyKnock = false;
            for (int i = 0; i < ticks; i++)
            {
                var t = rush.Tick(dt, opening, face, gap);
                if (t.Knock)
                    anyKnock = true;
                foreach (int j in t.Jostled)
                    if (j == sheep)
                        count++;
            }
            return count;
        }

        [Test]
        public void Inactive_UntilFullOpen()
        {
            var rush = new SheepRush(2, () => 0.0);
            for (int i = 0; i < 20; i++)
            {
                var t = rush.Tick(0.5f, 1.4f, Dist(1f, 1f), Dist(1f, 1f));
                Assert.AreEqual(0, t.Jostled.Count);
                Assert.AreEqual(-1, t.Escaped);
            }
            Assert.IsFalse(rush.Active);
            Assert.IsTrue(rush.GapClear);
        }

        [Test]
        public void Activates_OnceAtFullOpen()
        {
            var rush = new SheepRush(2, () => 0.5);
            rush.Tick(0.1f, Full, FarAway, FarAway);
            rush.Tick(0.1f, 0.5f, FarAway, FarAway);
            Assert.IsTrue(rush.Active);
        }

        [Test]
        public void Jostle_EveryRolledInterval()
        {
            var rush = new SheepRush(2, () => 0.5);
            int n = CountJostles(rush, 12, 0.5f, Full, Dist(1f, 10f), FarAway, 0, out bool knock);
            Assert.AreEqual(2, n);
            Assert.IsFalse(knock);
        }

        [Test]
        public void Jostle_LowRoll_Knocks()
        {
            var rush = new SheepRush(2, () => 0.0);
            bool knocked = false;
            for (int i = 0; i < 4; i++)
            {
                var t = rush.Tick(0.5f, Full, Dist(1f, 10f), FarAway);
                if (t.Jostled.Count > 0)
                {
                    Assert.IsTrue(t.Knock);
                    knocked = true;
                }
            }
            Assert.IsTrue(knocked);
        }

        [Test]
        public void OutOfReach_NoJostle()
        {
            var rush = new SheepRush(2, () => 0.0);
            Assert.AreEqual(0, CountJostles(rush, 20, 0.5f, Full, Dist(2f, 10f), FarAway, 0, out _));
        }

        [Test]
        public void Squeeze_StartsAtOneMeter_TakesTwoSeconds()
        {
            var rush = new SheepRush(2, () => 0.99);
            rush.Tick(0.1f, Full, FarAway, FarAway);
            var t = rush.Tick(1.9f, 1.0f, FarAway, Dist(1f, 10f));
            Assert.AreEqual(-1, t.Escaped);
            Assert.AreEqual(0, rush.Squeezing);
            Assert.IsFalse(rush.GapClear);
            t = rush.Tick(0.2f, 1.0f, FarAway, Dist(1f, 10f));
            Assert.AreEqual(0, t.Escaped);
            Assert.IsTrue(rush.Gone[0]);
            Assert.IsTrue(rush.GapClear);
        }

        [Test]
        public void Squeeze_NeedsOneMeterWidth()
        {
            var rush = new SheepRush(2, () => 0.99);
            rush.Tick(0.1f, Full, FarAway, FarAway);
            rush.Tick(1f, 0.9f, FarAway, Dist(1f, 1f));
            Assert.IsTrue(rush.GapClear);
        }

        [Test]
        public void Squeeze_OneAtATime()
        {
            var rush = new SheepRush(2, () => 0.99);
            rush.Tick(1f, Full, FarAway, Dist(1.2f, 0.5f));
            Assert.AreEqual(1, rush.Squeezing);
            rush.Tick(0.5f, Full, FarAway, Dist(0.1f, 0.5f));
            Assert.AreEqual(1, rush.Squeezing);
        }

        [Test]
        public void Narrowing_Sticks_AndBleats()
        {
            var rush = new SheepRush(2, () => 0.99);
            rush.Tick(1f, Full, FarAway, Dist(1f, 10f));
            int bleats = 0;
            for (int i = 0; i < 6; i++)
                if (rush.Tick(0.5f, 0.9f, FarAway, Dist(1f, 10f)).StuckBleat)
                    bleats++;
            Assert.IsTrue(rush.Stuck);
            Assert.AreEqual(2, bleats);
            Assert.IsFalse(rush.GapClear);
        }

        [Test]
        public void Reopen_FreesAndRestartsSqueeze()
        {
            var rush = new SheepRush(2, () => 0.99);
            rush.Tick(1f, Full, FarAway, Dist(1f, 10f));
            rush.Tick(0.5f, 0.9f, FarAway, Dist(1f, 10f));
            Assert.IsTrue(rush.Stuck);
            var t = rush.Tick(1.9f, 1.2f, FarAway, Dist(1f, 10f));
            Assert.IsFalse(rush.Stuck);
            Assert.AreEqual(-1, t.Escaped);
            t = rush.Tick(0.2f, 1.2f, FarAway, Dist(1f, 10f));
            Assert.AreEqual(0, t.Escaped);
        }

        [Test]
        public void Between_StaysStuck()
        {
            var rush = new SheepRush(2, () => 0.99);
            rush.Tick(1f, Full, FarAway, Dist(1f, 10f));
            rush.Tick(0.5f, 0.9f, FarAway, Dist(1f, 10f));
            rush.Tick(5f, 1.1f, FarAway, Dist(1f, 10f));
            Assert.IsTrue(rush.Stuck);
        }

        [Test]
        public void GoneSheep_NeverJostles()
        {
            var rush = new SheepRush(2, () => 0.5);
            rush.Tick(2.1f, Full, FarAway, Dist(1f, 10f));
            Assert.IsTrue(rush.Gone[0]);
            Assert.AreEqual(0, CountJostles(rush, 20, 0.5f, Full, Dist(1f, 10f), FarAway, 0, out _));
        }

        [Test]
        public void Reset_ClearsAll()
        {
            var rush = new SheepRush(2, () => 0.99);
            rush.Tick(2.1f, Full, FarAway, Dist(1f, 10f));
            rush.Tick(1f, Full, FarAway, Dist(10f, 1f));
            rush.Tick(0.5f, 0.9f, FarAway, Dist(10f, 1f));
            Assert.IsTrue(rush.Stuck);
            rush.Reset();
            Assert.IsFalse(rush.Active);
            Assert.IsTrue(rush.GapClear);
            Assert.IsFalse(rush.Stuck);
            Assert.IsFalse(rush.Gone[0] || rush.Gone[1]);
        }
    }
}
