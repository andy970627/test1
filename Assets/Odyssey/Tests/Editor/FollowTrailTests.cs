using System.Numerics;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class FollowTrailTests
    {
        static void Near(Vector2 expected, Vector2 actual)
        {
            Assert.AreEqual(expected.X, actual.X, 1e-4f, "X");
            Assert.AreEqual(expected.Y, actual.Y, 1e-4f, "Y");
        }

        [Test]
        public void StraightLine_SpacedOneMeter()
        {
            var t = new FollowTrail(Vector2.Zero);
            for (int i = 1; i <= 5; i++)
                t.Record(new Vector2(0, i));
            Near(new Vector2(0, 4), t.PositionAt(0));
            Near(new Vector2(0, 2), t.PositionAt(2));
        }

        [Test]
        public void ShortTrail_ClampsToStart()
        {
            var t = new FollowTrail(Vector2.Zero);
            t.Record(new Vector2(0, 1));
            Near(Vector2.Zero, t.PositionAt(3));
        }

        [Test]
        public void LeaderStandingStill_NoNaN()
        {
            var start = new Vector2(2, 3);
            var t = new FollowTrail(start);
            for (int i = 0; i < 10; i++)
                t.Record(start);
            var p = t.PositionAt(0);
            Assert.IsFalse(float.IsNaN(p.X) || float.IsNaN(p.Y));
            Near(start, p);
        }

        [Test]
        public void Corner_FollowsPath()
        {
            var t = new FollowTrail(Vector2.Zero);
            t.Record(new Vector2(0, 2));
            t.Record(new Vector2(2, 2));
            Near(new Vector2(1, 2), t.PositionAt(0));
            Near(new Vector2(0, 2), t.PositionAt(1));
        }

        [Test]
        public void Reset_StartsOver()
        {
            var t = new FollowTrail(Vector2.Zero);
            t.Record(new Vector2(0, 5));
            t.Reset(new Vector2(9, 9));
            Near(new Vector2(9, 9), t.PositionAt(0));
        }
    }
}
