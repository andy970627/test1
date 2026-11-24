using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class SoundCuesTests
    {
        [Test]
        public void Bearing_FrontRightLeftBack()
        {
            Assert.AreEqual(0f, SoundCues.Bearing(0f, 1f, 0f, 5f), 0.01f);
            Assert.AreEqual(90f, SoundCues.Bearing(0f, 1f, 3f, 0f), 0.01f);
            Assert.AreEqual(-90f, SoundCues.Bearing(0f, 1f, -3f, 0f), 0.01f);
            Assert.AreEqual(180f, System.Math.Abs(SoundCues.Bearing(0f, 1f, 0f, -2f)), 0.01f);
        }

        [Test]
        public void DirectionName_CoversEverySide()
        {
            Assert.AreEqual("正前方", SoundCues.DirectionName(5f));
            Assert.AreEqual("右前方", SoundCues.DirectionName(40f));
            Assert.AreEqual("左邊", SoundCues.DirectionName(-90f));
            Assert.AreEqual("右後方", SoundCues.DirectionName(140f));
            Assert.AreEqual("正後方", SoundCues.DirectionName(-175f));
        }

        [Test]
        public void Ping_GetsFasterWhenAligned_AndSilentOutsideCone()
        {
            Assert.AreEqual(0f, SoundCues.PingInterval(SoundCues.Alignment(90f)));
            float near = SoundCues.PingInterval(SoundCues.Alignment(5f));
            float far = SoundCues.PingInterval(SoundCues.Alignment(40f));
            Assert.Greater(far, near);
            Assert.AreEqual(SoundCues.FastestPing, SoundCues.PingInterval(1f), 0.001f);
        }

        [Test]
        public void Urgency_RisesAsGiantApproaches()
        {
            Assert.AreEqual(0f, SoundCues.Urgency(SoundCues.GiantNotice + 1f));
            Assert.Greater(SoundCues.Urgency(2f), SoundCues.Urgency(10f));
        }

        [Test]
        public void Line_DescribesOnly_CloseGiantTakesPriority()
        {
            Assert.AreEqual("海風正對著你", SoundCues.Line(3f, 0f, 30f));
            Assert.AreEqual("海風從左邊吹來・巨人在右前方", SoundCues.Line(-90f, 30f, 10f));
            Assert.AreEqual("巨人就在正後方，很近", SoundCues.Line(0f, 179f, 3f));
        }
    }
}
