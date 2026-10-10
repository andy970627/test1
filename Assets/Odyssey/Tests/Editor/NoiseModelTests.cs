using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class NoiseModelTests
    {
        [Test]
        public void Masked_ReducesEmission()
        {
            var n = new NoiseModel();
            n.Tick(0.1f, 1f, masked: true);
            Assert.AreEqual(0.4f, n.Level, 1e-4f);
        }

        [Test]
        public void Crossing_IsEdgeTriggered()
        {
            var n = new NoiseModel();
            Assert.IsTrue(n.Tick(0.1f, 1f, false));
            Assert.IsFalse(n.Tick(0.1f, 1f, false));
        }

        [Test]
        public void Decays()
        {
            var n = new NoiseModel();
            n.Tick(0.1f, 1f, false);
            n.Tick(1f, 0f, false);
            Assert.AreEqual(0.5f, n.Level, 1e-4f);
        }
    }
}
