using NUnit.Framework;
using Odyssey.Core;

namespace Odyssey.Tests
{
    [TestFixture]
    public class HudZonesTests
    {
        [Test]
        public void ProtectedZones_DoNotIntersectEachOther()
        {
            var zones = HudZones.ProtectedZones;
            for (int i = 0; i < zones.Length; i++)
                for (int j = i + 1; j < zones.Length; j++)
                    Assert.IsFalse(zones[i].Intersects(zones[j]), $"Zone {i} intersects with Zone {j}");
        }

        [Test]
        public void ProtectedZones_InsideScreen()
        {
            foreach (var z in HudZones.ProtectedZones)
            {
                Assert.GreaterOrEqual(z.Left, 0f);
                Assert.GreaterOrEqual(z.Top, 0f);
                Assert.LessOrEqual(z.Right, 1f + 1e-4f);
                Assert.LessOrEqual(z.Bottom, 1f + 1e-4f);
            }
        }

        [Test]
        public void PushOut_WhenIntersects_PushesOutside()
        {
            var candidate = new HudRect(0.35f, 0.66f, 0.20f, 0.05f);
            Assert.IsTrue(HudZones.IntersectsAny(candidate));
            var pushed = HudZones.PushOut(candidate);
            Assert.IsFalse(HudZones.IntersectsAny(pushed));
            Assert.AreEqual(candidate.X, pushed.X);
        }

        [Test]
        public void PushOut_NeverLandsInAnotherZone()
        {
            // 從push bar 往上推不能撞進上方的區塊；整個畫面掃一遍，推完都不能碰任何保護區。
            for (float x = 0f; x <= 0.8f; x += 0.05f)
                for (float y = 0f; y <= 0.95f; y += 0.025f)
                {
                    var pushed = HudZones.PushOut(new HudRect(x, y, 0.2f, 0.05f));
                    Assert.IsFalse(HudZones.IntersectsAny(pushed), $"x={x} y={y} → {pushed.Y}");
                    Assert.GreaterOrEqual(pushed.Top, 0f);
                    Assert.LessOrEqual(pushed.Bottom, 1f + 1e-4f);
                }
        }

        [Test]
        public void PushOut_PicksNearestFreeSpot()
        {
            // 剛好壓在 push bar 上緣：往上移一點就好，不會跳到畫面另一頭。
            var candidate = new HudRect(0.4f, 0.56f, 0.2f, 0.04f);
            var pushed = HudZones.PushOut(candidate);
            Assert.Less(pushed.Bottom, HudZones.PushBarZone.Top + 1e-4f);
            Assert.Less(System.Math.Abs(pushed.Y - candidate.Y), 0.05f);
        }

        [Test]
        public void PushOut_IgnoresDebugZoneWhenHidden()
        {
            var candidate = new HudRect(0.05f, 0.3f, 0.2f, 0.05f);
            Assert.AreEqual(candidate.Y, HudZones.PushOut(candidate, debugVisible: false).Y);
            Assert.AreNotEqual(candidate.Y, HudZones.PushOut(candidate, debugVisible: true).Y);
        }

        [Test]
        public void IntersectsAny_WhenFree_ReturnsFalse()
        {
            var candidate = new HudRect(0.40f, 0.35f, 0.20f, 0.10f);
            Assert.IsFalse(HudZones.IntersectsAny(candidate));
        }
    }
}
