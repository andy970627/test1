using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class BoulderDawnDecoyTests
    {
        [Test]
        public void Boulder_EightPushesOpens()
        {
            var b = new BoulderModel();
            for (int i = 0; i < 7; i++)
                Assert.IsTrue(b.Push());
            Assert.IsFalse(b.IsOpen);
            Assert.IsTrue(b.Push());
            Assert.IsTrue(b.IsOpen);
        }

        [Test]
        public void Boulder_PushWhenOpen_ReturnsFalseAndStaysAtEight()
        {
            var b = new BoulderModel();
            for (int i = 0; i < 8; i++)
                b.Push();
            Assert.IsFalse(b.Push());
            Assert.AreEqual(8, b.Progress);
        }

        [Test]
        public void Boulder_Reset_GoesToZero()
        {
            var b = new BoulderModel();
            b.Push();
            b.Reset();
            Assert.AreEqual(0, b.Progress);
            Assert.IsFalse(b.IsOpen);
        }

        [Test]
        public void Dawn_After240Seconds_IsDawn()
        {
            var d = new DawnClock();
            d.Tick(239.9f);
            Assert.IsFalse(d.IsDawn);
            d.Tick(0.2f);
            Assert.IsTrue(d.IsDawn);
            Assert.AreEqual(1f, d.Fraction);
        }

        [Test]
        public void Dawn_FractionHalfway()
        {
            var d = new DawnClock();
            d.Tick(120f);
            Assert.AreEqual(0.5f, d.Fraction, 1e-5f);
            d.Reset();
            Assert.AreEqual(0f, d.Fraction);
        }

        [Test]
        public void Decoy_ThirdFooledHalvesStoneRadius()
        {
            var m = new DecoyMemory();
            m.RecordFooled();
            m.RecordFooled();
            Assert.AreEqual(1f, m.StoneRadiusMultiplier);
            m.RecordFooled();
            Assert.AreEqual(0.5f, m.StoneRadiusMultiplier);
            m.Reset();
            Assert.AreEqual(1f, m.StoneRadiusMultiplier);
            Assert.AreEqual(0, m.Fooled);
        }
    }
}
