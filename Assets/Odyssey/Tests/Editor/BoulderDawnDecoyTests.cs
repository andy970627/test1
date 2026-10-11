using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class BoulderDawnDecoyTests
    {
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
            Assert.AreEqual(1f, m.ArrowRadiusMultiplier);
            m.RecordFooled();
            Assert.AreEqual(0.5f, m.ArrowRadiusMultiplier);
            m.Reset();
            Assert.AreEqual(1f, m.ArrowRadiusMultiplier);
            Assert.AreEqual(0, m.Fooled);
        }
    }
}
