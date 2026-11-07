using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class SlingshotTests
    {
        static SlingshotDraw Held(float seconds)
        {
            var d = new SlingshotDraw();
            d.Begin();
            d.Tick(seconds);
            return d;
        }

        [Test]
        public void Tap_IsSnapOnly()
        {
            var shot = Held(0.2f).Release(true);
            Assert.AreEqual(SlingshotShotKind.SnapOnly, shot.Kind);
        }

        [Test]
        public void HeldWithStone_FiresStone()
        {
            var shot = Held(0.3f).Release(true);
            Assert.AreEqual(SlingshotShotKind.Stone, shot.Kind);
        }

        [Test]
        public void HeldWithoutStone_IsSnapOnly()
        {
            var shot = Held(0.5f).Release(false);
            Assert.AreEqual(SlingshotShotKind.SnapOnly, shot.Kind);
        }

        [Test]
        public void FullDraw_SpeedIs24()
        {
            Assert.AreEqual(24f, Held(0.8f).Release(true).Speed, 1e-4f);
            Assert.AreEqual(24f, Held(5f).Release(true).Speed, 1e-4f);
        }

        [Test]
        public void HalfDraw_SpeedIs17()
        {
            Assert.AreEqual(17f, Held(0.4f).Release(true).Speed, 1e-4f);
        }

        [Test]
        public void WalkMultiplier_HalfWhileDrawing()
        {
            var d = new SlingshotDraw();
            Assert.AreEqual(1f, d.WalkMultiplier);
            d.Begin();
            Assert.AreEqual(0.5f, d.WalkMultiplier);
            d.Cancel();
            Assert.AreEqual(1f, d.WalkMultiplier);
        }

        [Test]
        public void Release_WhenNotDrawing_IsNone()
        {
            Assert.AreEqual(SlingshotShotKind.None, new SlingshotDraw().Release(true).Kind);
        }

        [Test]
        public void Release_ResetsDrawing()
        {
            var d = Held(0.5f);
            d.Release(true);
            Assert.IsFalse(d.Drawing);
            Assert.AreEqual(0f, d.Fraction);
            Assert.AreEqual(SlingshotShotKind.None, d.Release(true).Kind);
        }
    }
}
