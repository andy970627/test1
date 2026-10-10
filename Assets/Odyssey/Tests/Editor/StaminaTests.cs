using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class StaminaTests
    {
        [Test]
        public void Run_DrainsInFourSeconds()
        {
            var s = new Stamina();
            Assert.IsTrue(s.Tick(4f, true));
            Assert.AreEqual(0f, s.Value, 1e-4f);
            Assert.IsFalse(s.CanRun);
        }

        [Test]
        public void Exhausted_ResumesAtPointThree()
        {
            var s = new Stamina();
            s.Tick(4f, true);
            s.Tick(1.9f, false);
            Assert.IsFalse(s.CanRun);
            s.Tick(0.2f, false);
            Assert.IsTrue(s.CanRun);
        }

        [Test]
        public void Tick_ReturnsFalseWhenCannotRun()
        {
            var s = new Stamina();
            s.Tick(4f, true);
            Assert.IsFalse(s.Tick(0.1f, true));
            Assert.AreEqual(0.015f, s.Value, 1e-4f);
        }

        [Test]
        public void Rest_NeverExceedsOne()
        {
            var s = new Stamina();
            s.Tick(1f, true);
            s.Tick(100f, false);
            Assert.AreEqual(1f, s.Value, 1e-5f);
        }

        [Test]
        public void PantDue_EveryOnePointTwoSecondsWhenLow()
        {
            var s = new Stamina();
            s.Tick(3.5f, true); // 0.125
            Assert.IsTrue(s.Panting);
            Assert.IsFalse(s.PantDue(1.0f));
            Assert.IsTrue(s.PantDue(0.2f));
            Assert.IsFalse(s.PantDue(1.1f));
            Assert.IsTrue(s.PantDue(0.1f));
        }

        [Test]
        public void PantDue_NeverWhenNotLow()
        {
            var s = new Stamina();
            s.Tick(2f, true); // 0.5
            Assert.IsFalse(s.Panting);
            Assert.IsFalse(s.PantDue(5f));
        }

        [Test]
        public void Reset_RefillsAndAllowsRunning()
        {
            var s = new Stamina();
            s.Tick(4f, true);
            s.Reset();
            Assert.AreEqual(1f, s.Value);
            Assert.IsTrue(s.CanRun);
            Assert.IsFalse(s.Panting);
        }
    }
}
