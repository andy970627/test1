using NUnit.Framework;
using Odyssey.Core;

namespace Odyssey.Tests
{
    [TestFixture]
    public class ViewPoseTests
    {
        [TestCase(0f, 0f)]
        [TestCase(0.5f, 0.5f)]
        [TestCase(1f, 1f)]
        public void StringPull_WhileDrawing_FollowsFraction(float fraction, float expected)
        {
            float pull = ViewPose.StringPull(fraction, -1f);
            Assert.AreEqual(expected, pull, 1e-4f);
        }

        [Test]
        public void StringPull_WhenReleased_SnapsBackIn150ms()
        {
            // Initial 1f pull
            float halfway = ViewPose.StringPull(1f, 0.075f);
            Assert.AreEqual(0.5f, halfway, 1e-3f);

            float released = ViewPose.StringPull(1f, 0.15f);
            Assert.AreEqual(0f, released, 1e-4f);

            float later = ViewPose.StringPull(1f, 0.30f);
            Assert.AreEqual(0f, later, 1e-4f);
        }

        [Test]
        public void PushShake_HeavyIsLargerThanLight_LightIsLargerThanNone()
        {
            float heavy = ViewPose.PushShake(PushMode.Heavy);
            float light = ViewPose.PushShake(PushMode.Light);
            float none = ViewPose.PushShake(PushMode.None);

            Assert.Greater(heavy, light);
            Assert.Greater(light, none);
            Assert.AreEqual(0f, none);
        }

        [Test]
        public void WedgeReach_PeaksAtMidpointAndReturnsToZero()
        {
            Assert.AreEqual(0f, ViewPose.WedgeReach(0f), 1e-4f);
            Assert.AreEqual(0.4f, ViewPose.WedgeReach(0.5f), 1e-3f);
            Assert.AreEqual(0f, ViewPose.WedgeReach(1f), 1e-4f);
        }

        [Test]
        public void HandSpread_BracedIsCloserThanNormal()
        {
            float braced = ViewPose.HandSpread(true);
            float normal = ViewPose.HandSpread(false);
            Assert.Less(braced, normal);
        }
    }
}
