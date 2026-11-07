using System.Linq;
using NUnit.Framework;
using Odyssey.Core;
using Odyssey.Sim;

namespace Odyssey.Sim.Tests
{
    public class NightSimTests
    {
        [Test]
        public void SameSeed_SameResults()
        {
            var a = Campaign.Play(() => new CarefulBot(decoy: true, rescue: true), new SimConfig(), 42);
            var b = Campaign.Play(() => new CarefulBot(decoy: true, rescue: true), new SimConfig(), 42);
            Assert.AreEqual(a.Count, b.Count);
            for (int i = 0; i < a.Count; i++)
            {
                Assert.AreEqual(a[i].Escaped, b[i].Escaped);
                Assert.AreEqual(a[i].Fail, b[i].Fail);
                Assert.AreEqual(a[i].Seconds, b[i].Seconds, 1e-4f);
            }
        }

        [Test]
        public void IdleBot_NeverEscapes_AndNightsEndByDawn()
        {
            for (int seed = 1; seed <= 10; seed++)
                foreach (var n in Campaign.Play(() => new IdleBot(), new SimConfig(), seed))
                {
                    Assert.IsFalse(n.Escaped);
                    Assert.LessOrEqual(n.Seconds, DawnClock.DefaultNightSeconds + 0.1f);
                    Assert.AreEqual(0f, n.MaxOpening);
                }
        }

        [Test]
        public void Escapes_OnlyThroughAFullyOpenBoulder()
        {
            int escapes = 0;
            for (int seed = 1; seed <= 40; seed++)
                foreach (var n in Campaign.Play(() => new CarefulBot(decoy: true, rescue: false), new SimConfig { Difficulty = DifficultyLevel.Familiar }, seed).Where(n => n.Escaped))
                {
                    escapes++;
                    Assert.GreaterOrEqual(n.MaxOpening, BoulderSlide.FullOpen - 1e-4f);
                }
            Assert.Greater(escapes, 0, "熟悉難度下，引開策略 40 場至少要逃出一次，否則模擬器多半壞了");
        }

        [Test]
        public void Campaign_EndsAtEscapeOrWipe()
        {
            var nights = Campaign.Play(() => new RusherBot(), new SimConfig(), 7);
            Assert.LessOrEqual(nights.Count, CrewRoster.StartingCrew);
            Assert.IsTrue(nights.Take(nights.Count - 1).All(n => !n.Escaped));
        }
    }
}
