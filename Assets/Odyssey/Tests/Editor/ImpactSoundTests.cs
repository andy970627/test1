using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class ImpactSoundTests
    {
        [Test]
        public void BelowThreshold_Silent()
        {
            Assert.AreEqual(0f, ImpactSound.Loudness(0.6f, 1.4f));
        }

        [Test]
        public void Proportional()
        {
            Assert.AreEqual(0.3f, ImpactSound.Loudness(0.6f, 4.5f), 1e-5f);
        }

        [Test]
        public void ClampsToMax()
        {
            Assert.AreEqual(0.6f, ImpactSound.Loudness(0.6f, 20f), 1e-6f);
        }

        [Test]
        public void ClampsToMin()
        {
            Assert.AreEqual(0.1f, ImpactSound.Loudness(0.25f, 1.5f), 1e-6f);
        }

        [Test]
        public void Gate_CooldownThreeTenths()
        {
            var gate = new ImpactGate();
            Assert.IsTrue(gate.TryFire(0f));
            Assert.IsFalse(gate.TryFire(0.2f));
            Assert.IsTrue(gate.TryFire(0.31f));
        }
    }
}
