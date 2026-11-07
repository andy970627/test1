using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class TerrorRadiusTests
    {
        private static TerrorReading E(float d, DifficultyLevel l = DifficultyLevel.Normal, bool chase = false, bool listen = false, bool pray = false) =>
            TerrorRadius.Evaluate(d, chase, listen, pray, l);

        [TestCase(DifficultyLevel.Familiar, 1.25f)]
        [TestCase(DifficultyLevel.Normal, 1f)]
        [TestCase(DifficultyLevel.Hard, 0.75f)]
        public void Scale_PerDifficulty(DifficultyLevel l, float s) => Assert.AreEqual(s, TerrorRadius.Scale(l), 1e-5f);

        [TestCase(DifficultyLevel.Familiar)]
        [TestCase(DifficultyLevel.Normal)]
        [TestCase(DifficultyLevel.Hard)]
        public void Boundaries_AreInclusive(DifficultyLevel l)
        {
            float s = TerrorRadius.Scale(l);
            Assert.AreEqual(TerrorLayer.Three, E(5f * s, l).Layer);
            Assert.AreEqual(120f, E(5f * s, l).Bpm);
            Assert.AreEqual(TerrorLayer.Two, E(5f * s + 0.01f, l).Layer);
            Assert.AreEqual(TerrorLayer.Two, E(10f * s, l).Layer);
            Assert.AreEqual(80f, E(10f * s, l).Bpm);
            Assert.AreEqual(TerrorLayer.One, E(10f * s + 0.01f, l).Layer);
            Assert.AreEqual(TerrorLayer.One, E(16f * s, l).Layer);
            Assert.AreEqual(50f, E(16f * s, l).Bpm);
            Assert.AreEqual(TerrorLayer.Silent, E(16f * s + 0.01f, l).Layer);
            Assert.AreEqual(0f, E(16f * s + 0.01f, l).Bpm);
        }

        [Test]
        public void Chase_OverridesDistance()
        {
            var r = E(100f, chase: true);
            Assert.AreEqual(TerrorLayer.Chase, r.Layer);
            Assert.AreEqual(160f, r.Bpm);
            Assert.AreEqual(TerrorLayer.Chase, E(1f, chase: true).Layer);
        }

        [Test]
        public void Listening_SilencesWithinTen_NotBeyond()
        {
            Assert.AreEqual(TerrorLayer.Silent, E(3f, listen: true).Layer);
            Assert.AreEqual(0f, E(3f, listen: true).Bpm);
            Assert.AreEqual(TerrorLayer.Silent, E(10f, listen: true).Layer);
            Assert.AreEqual(TerrorLayer.One, E(10.1f, listen: true).Layer);
            Assert.AreEqual(TerrorLayer.Silent, E(10f, DifficultyLevel.Familiar, listen: true).Layer);
        }

        [Test]
        public void Prayer_Wins()
        {
            var r = E(2f, chase: true, listen: true, pray: true);
            Assert.AreEqual(TerrorLayer.Prayer, r.Layer);
            Assert.AreEqual(0f, r.Bpm);
        }
    }

    public class ChaseStateTests
    {
        private static ChaseState Run(CyclopsState s, bool snd, float heard, float dist, bool charge)
        {
            var c = new ChaseState();
            c.Update(0.1f, s, snd, heard, dist, charge);
            return c;
        }

        [Test]
        public void Charging_Chases() => Assert.IsTrue(Run(CyclopsState.Listen, false, 99f, 99f, true).Chasing);

        [Test]
        public void Throw_NeedsPlayerSound()
        {
            Assert.IsTrue(Run(CyclopsState.Throw, true, 99f, 99f, false).Chasing);
            Assert.IsFalse(Run(CyclopsState.Throw, false, 0f, 1f, false).Chasing);
        }

        [Test]
        public void Investigate_NeedsSoundRecentAndClose()
        {
            Assert.IsTrue(Run(CyclopsState.Investigate, true, 3f, 12f, false).Chasing);
            Assert.IsFalse(Run(CyclopsState.Investigate, true, 3.1f, 12f, false).Chasing);
            Assert.IsFalse(Run(CyclopsState.Investigate, true, 3f, 12.1f, false).Chasing);
            Assert.IsFalse(Run(CyclopsState.Investigate, false, 0f, 1f, false).Chasing);
        }

        [Test]
        public void Lingers_ThreeSeconds_ThenEnds()
        {
            var c = Run(CyclopsState.Throw, true, 0f, 5f, false);
            c.Update(2.9f, CyclopsState.Listen, false, 99f, 5f, false);
            Assert.IsTrue(c.Chasing);
            c.Update(0.2f, CyclopsState.Listen, false, 99f, 5f, false);
            Assert.IsFalse(c.Chasing);
        }

        [Test]
        public void NewCondition_RestartsLinger()
        {
            var c = Run(CyclopsState.Throw, true, 0f, 5f, false);
            c.Update(2.5f, CyclopsState.Listen, false, 99f, 5f, false);
            c.Update(0.1f, CyclopsState.Throw, true, 0f, 5f, false);
            c.Update(2.5f, CyclopsState.Listen, false, 99f, 5f, false);
            Assert.IsTrue(c.Chasing);
            c.Update(0.6f, CyclopsState.Listen, false, 99f, 5f, false);
            Assert.IsFalse(c.Chasing);
        }

        [Test]
        public void Reset_Clears()
        {
            var c = Run(CyclopsState.Listen, false, 99f, 99f, true);
            c.Reset();
            Assert.IsFalse(c.Chasing);
        }
    }
}
