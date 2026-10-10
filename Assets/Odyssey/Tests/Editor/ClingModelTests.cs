using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class ClingModelTests
    {
        static ClingModel Normal() => new ClingModel(new ClingParams(), isRam: false);

        [Test]
        public void BothHandsHeld_DrainsGrip()
        {
            var m = Normal();
            m.Tick(1f, true, true, false, Side.Left);
            Assert.AreEqual(0.88f, m.GripLeft, 1e-4f);
            Assert.AreEqual(0.88f, m.GripRight, 1e-4f);
        }

        [Test]
        public void Ram_DrainsHalf()
        {
            var m = new ClingModel(new ClingParams(), isRam: true);
            m.Tick(1f, true, true, false, Side.Left);
            Assert.AreEqual(0.94f, m.GripLeft, 1e-4f);
        }

        [Test]
        public void NoHands_FallsAfterTwoSeconds()
        {
            var m = Normal();
            for (int i = 0; i < 19; i++)
                Assert.AreEqual(FailReason.None, m.Tick(0.1f, false, false, false, Side.Left), $"tick {i}");
            Assert.AreEqual(FailReason.Fell, m.Tick(0.1f, false, false, false, Side.Left));
        }

        [Test]
        public void EmptyGrip_CountsAsReleased_AndNeverNegative()
        {
            var m = Normal();
            for (int i = 0; i < 100; i++)
                m.Tick(0.1f, true, true, false, Side.Left);
            Assert.AreEqual(0f, m.GripLeft);
            Assert.AreEqual(0f, m.GripRight);
            Assert.Greater(m.Slide, 0f);
        }

        [Test]
        public void Slide_RecoversSlowly_WhenBothHandsReturn()
        {
            var m = Normal();
            for (int i = 0; i < 10; i++)
                m.Tick(0.1f, false, false, false, Side.Left);
            Assert.AreEqual(0.5f, m.Slide, 1e-4f);
            for (int i = 0; i < 10; i++)
                m.Tick(0.1f, true, true, false, Side.Left);
            Assert.AreEqual(0.4f, m.Slide, 1e-4f);
        }

        [Test]
        public void HoldBreath_GaspsAfterEightSeconds()
        {
            var m = Normal();
            for (int i = 0; i < 15; i++)
                Assert.AreEqual(FailReason.None, m.Tick(0.5f, true, true, true, Side.Left), $"tick {i}");
            Assert.AreEqual(FailReason.Gasped, m.Tick(0.5f, true, true, true, Side.Left));
        }

        [Test]
        public void Noise_ZeroWhileHolding_AndSpikesOnLeanSwitch()
        {
            var m = Normal();
            m.Tick(0.1f, true, true, true, Side.Left);
            Assert.AreEqual(0f, m.Noise);
            m.Tick(0.1f, true, true, true, Side.Right);
            Assert.GreaterOrEqual(m.Noise, 0.5f);
            Assert.AreEqual(Side.Right, m.Lean);
        }
    }
}
