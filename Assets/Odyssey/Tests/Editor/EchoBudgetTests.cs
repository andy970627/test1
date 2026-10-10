using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class EchoBudgetTests
    {
        [Test]
        public void IndexToEvict_PrefersQuietFadingPulseOverLoudOlderOne()
        {
            // 0：推巨石（20 m）已經 2 秒；1：腳步（3 m）剛發出；2：腳步（3 m）已經 3 秒。
            var radii = new[] { 20f, 3f, 3f };
            var ages = new[] { 2f, 0f, 3f };
            Assert.AreEqual(2, EchoBudget.IndexToEvict(radii, ages, 3.5f));
        }

        [Test]
        public void IndexToEvict_EqualPulses_TakesOldest()
        {
            Assert.AreEqual(1, EchoBudget.IndexToEvict(new[] { 3f, 3f }, new[] { 1f, 2f }, 3.5f));
        }

        [Test]
        public void PlaytestFile_IsSeparateFromOldCling()
        {
            Assert.AreEqual("blind_cave_playtest.csv", PlaytestCsv.FileName);
        }
    }
}
