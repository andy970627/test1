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
            {
                for (int j = i + 1; j < zones.Length; j++)
                {
                    bool intersect = zones[i].Intersects(zones[j]);
                    Assert.IsFalse(intersect, $"Zone {i} intersects with Zone {j}");
                }
            }
        }

        [Test]
        public void PushOut_WhenIntersects_PushesOutside()
        {
            // Candidate centered right in the middle of EssentialZone (y: 0.68..0.76)
            var candidate = new HudRect(0.35f, 0.70f, 0.20f, 0.05f);
            Assert.IsTrue(HudZones.IntersectsAny(candidate));

            var pushed = HudZones.PushOut(candidate);
            Assert.IsFalse(pushed.Intersects(HudZones.EssentialZone));
        }

        [Test]
        public void IntersectsAny_WhenFree_ReturnsFalse()
        {
            // Center clear screen area (e.g. y: 0.35, x: 0.40)
            var candidate = new HudRect(0.40f, 0.35f, 0.20f, 0.10f);
            Assert.IsFalse(HudZones.IntersectsAny(candidate));
        }
    }
}
