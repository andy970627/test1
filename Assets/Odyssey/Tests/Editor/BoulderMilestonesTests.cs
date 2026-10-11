using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class BoulderMilestonesTests
    {
        const float Quarter = BoulderSlide.FullOpen * 0.25f;

        [Test]
        public void CrossingQuarter_ReturnsStep()
        {
            var m = new BoulderMilestones();
            Assert.AreEqual(0, m.Update(Quarter * 0.9f));
            Assert.AreEqual(1, m.Update(Quarter * 1.01f));
            Assert.AreEqual(0, m.Update(Quarter * 1.5f));
        }

        [Test]
        public void SlidingBackAndRepushing_DoesNotRepeat()
        {
            var m = new BoulderMilestones();
            m.Update(Quarter * 1.1f);
            m.Update(Quarter * 0.5f);
            Assert.AreEqual(0, m.Update(Quarter * 1.1f));
            Assert.AreEqual(2, m.Update(Quarter * 2.05f));
        }

        [Test]
        public void JumpingTwoSteps_ReturnsHigher()
        {
            var m = new BoulderMilestones();
            Assert.AreEqual(3, m.Update(Quarter * 3.2f));
        }

        [Test]
        public void FullOpen_IsFourth_AndCapped()
        {
            var m = new BoulderMilestones();
            Assert.AreEqual(4, m.Update(BoulderSlide.FullOpen));
            Assert.AreEqual(0, m.Update(BoulderSlide.FullOpen + 1f));
        }

        [Test]
        public void Reset_StartsOver()
        {
            var m = new BoulderMilestones();
            m.Update(Quarter * 2.1f);
            m.Reset();
            Assert.AreEqual(2, m.Update(Quarter * 2.1f));
        }
    }
}
