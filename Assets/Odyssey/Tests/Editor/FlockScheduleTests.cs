using System;
using System.Linq;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class FlockScheduleTests
    {
        [Test]
        public void RamAlwaysLast()
        {
            for (int seed = 0; seed < 50; seed++)
            {
                var s = new FlockSchedule(9, 3, 10f, 8f, new Random(seed));
                Assert.AreEqual(3, s.Order[s.Order.Count - 1], $"seed {seed}");
            }
        }

        [Test]
        public void OrderIsPermutation()
        {
            var s = new FlockSchedule(9, 0, 10f, 8f, new Random(4));
            CollectionAssert.AreEquivalent(Enumerable.Range(0, 9), s.Order);
        }

        [Test]
        public void LastExitWithin60To90Seconds()
        {
            var s = new FlockSchedule(9, 0, 10f, 8f, new Random(0));
            Assert.AreEqual(74f, s.ExitTime(8));
        }
    }
}
