using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class CrewRosterTests
    {
        [Test]
        public void StartsAt12Night1()
        {
            var r = new CrewRoster();
            Assert.AreEqual(12, r.Remaining);
            Assert.AreEqual(1, r.Night);
            Assert.IsFalse(r.Wiped);
        }

        [Test]
        public void EatTwelveTimes_Wiped()
        {
            var r = new CrewRoster();
            for (int i = 0; i < 11; i++)
                r.Eat();
            Assert.IsFalse(r.Wiped);
            r.Eat();
            Assert.IsTrue(r.Wiped);
            Assert.AreEqual(0, r.Remaining);
            Assert.AreEqual(13, r.Night);
        }

        [Test]
        public void Roster_Lose_KeepsNight()
        {
            var r = new CrewRoster();
            r.Lose();
            r.Lose();
            Assert.AreEqual(10, r.Remaining);
            Assert.AreEqual(1, r.Night);
            for (int i = 0; i < 20; i++)
                r.Lose();
            Assert.AreEqual(0, r.Remaining);
            Assert.AreEqual(1, r.Night);
        }
    }
}
