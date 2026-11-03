using System;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class PushContactTests
    {
        [Test]
        public void Neutral_ChangesNothing()
        {
            var c = PushContact.Neutral;
            Assert.AreEqual(1f, c.SpeedMultiplier, 1e-5f);
            Assert.AreEqual(1f, c.NoiseMultiplier, 1e-5f);
            Assert.AreEqual(1f, c.CatchMultiplier, 1e-5f);
            Assert.AreEqual(0f, c.SlipChance, 1e-5f);
        }

        [Test]
        public void Centre_SlowerAndQuieter_Edge_FasterAndLouder()
        {
            var centre = PushContact.Evaluate(0f, 1f, 0);
            var edge = PushContact.Evaluate(1f, 1f, 0);
            Assert.AreEqual(0.85f, centre.SpeedMultiplier, 1e-4f);
            Assert.AreEqual(0.7f, centre.NoiseMultiplier, 1e-4f);
            Assert.AreEqual(1.2f, edge.SpeedMultiplier, 1e-4f);
            Assert.AreEqual(1.3f, edge.NoiseMultiplier, 1e-4f);
            Assert.AreEqual(edge.SpeedMultiplier, PushContact.Evaluate(-1f, 1f, 0).SpeedMultiplier, 1e-5f);
            Assert.AreEqual(1.2f, PushContact.Evaluate(3f, 1f, 0).SpeedMultiplier, 1e-4f, "位置夾在 −1～1");
        }

        [Test]
        public void Angle_HalfSpeedAndSlipsAtTheLimit()
        {
            var straight = PushContact.Evaluate(0f, 0.95f, 0);
            var skew = PushContact.Evaluate(0f, 0.7f, 0);
            Assert.AreEqual(0.85f, straight.SpeedMultiplier, 1e-4f);
            Assert.AreEqual(0f, straight.SlipChance, 1e-5f);
            Assert.AreEqual(0.425f, skew.SpeedMultiplier, 1e-4f);
            Assert.AreEqual(0.3f, skew.SlipChance, 1e-4f);
        }

        [Test]
        public void Helpers_FasterAndLessCatching_CappedAtFour()
        {
            var two = PushContact.Evaluate(0f, 1f, 2);
            Assert.AreEqual(0.85f * 1.7f, two.SpeedMultiplier, 1e-4f);
            Assert.AreEqual(1f / 3f, two.CatchMultiplier, 1e-4f);
            Assert.AreEqual(PushContact.Evaluate(0f, 1f, 4).SpeedMultiplier, PushContact.Evaluate(0f, 1f, 9).SpeedMultiplier, 1e-5f);
            Assert.AreEqual(0.7f, two.NoiseMultiplier, 1e-4f, "幫手不改變巨石的磨擦聲");
        }

        [Test]
        public void Slide_UsesSpeedMultiplier()
        {
            var a = new BoulderSlide();
            var b = new BoulderSlide();
            for (int i = 0; i < 40; i++)
            {
                a.Tick(0.05f, PushMode.Light, false);
                b.Tick(0.05f, PushMode.Light, false, false, PushContact.Evaluate(1f, 1f, 0));
            }
            Assert.AreEqual(a.Opening * 1.2f, b.Opening, 1e-4f);
        }

        [Test]
        public void Slide_CatchChanceScaledByHelpers()
        {
            // 卡住機率 0.02 × 連續輕推秒數；4 個幫手時 ÷5，骰 0.05 就不會卡。
            Func<double> roll = () => 0.05;
            var alone = new BoulderSlide(roll);
            var crew = new BoulderSlide(roll);
            bool aloneCaught = false, crewCaught = false;
            for (int i = 0; i < 100; i++)
            {
                aloneCaught |= alone.Tick(0.05f, PushMode.Light, false).Catch;
                crewCaught |= crew.Tick(0.05f, PushMode.Light, false, false, PushContact.Evaluate(0f, 1f, 4)).Catch;
            }
            Assert.IsTrue(aloneCaught);
            Assert.IsFalse(crewCaught);
        }

        [Test]
        public void Slide_HandsSlip_StallsHalfSecondWithoutBang()
        {
            var slide = new BoulderSlide(() => 0.0);
            var skew = PushContact.Evaluate(0f, 0.7f, 0);
            BoulderNoise noise = default;
            for (int i = 0; i < 10 && !noise.HandsSlipped; i++)
                noise = slide.Tick(0.05f, PushMode.Light, false, false, skew);
            Assert.IsTrue(noise.HandsSlipped);
            Assert.IsFalse(noise.Heavy || noise.Catch);
            float at = slide.Opening;
            for (int i = 0; i < 9; i++)
                slide.Tick(0.05f, PushMode.Light, false, false, skew);
            Assert.AreEqual(at, slide.Opening, 1e-5f, "手滑後 0.5 秒推不動");
        }
    }
}
