using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class GuideCuesTests
    {
        [Test]
        public void Cap_ByStyle()
        {
            Assert.IsFalse(GuideCues.ShowCap(GuideStyle.Verse, 0));
            Assert.IsTrue(GuideCues.ShowCap(GuideStyle.Plain, 0));
            Assert.IsTrue(GuideCues.ShowCap(GuideStyle.Plain, 5));
            Assert.IsTrue(GuideCues.ShowCap(GuideStyle.Wordless, 0));
            Assert.IsFalse(GuideCues.ShowCap(GuideStyle.Wordless, 1));
        }

        [Test]
        public void Text_OnlyInVerse()
        {
            Assert.IsTrue(GuideCues.ShowText(GuideStyle.Verse));
            Assert.IsFalse(GuideCues.ShowText(GuideStyle.Plain));
            Assert.IsFalse(GuideCues.ShowText(GuideStyle.Wordless));
        }

        [Test]
        public void Essential_GestureAndKey()
        {
            Assert.AreEqual((Gesture.Sling, CueKey.Space), GuideCues.Essential(EssentialStep.Sound, true));
            Assert.AreEqual((Gesture.PushReady, CueKey.E), GuideCues.Essential(EssentialStep.Push, true));
            Assert.AreEqual((Gesture.OfferStone, CueKey.MouseRight), GuideCues.Essential(EssentialStep.Wedge, true));
            Assert.AreEqual((Gesture.ReachGap, CueKey.E), GuideCues.Essential(EssentialStep.Escape, true));
            Assert.AreEqual((Gesture.None, CueKey.None), GuideCues.Essential(EssentialStep.Push, false));
            Assert.AreEqual((Gesture.None, CueKey.None), GuideCues.Essential(EssentialStep.Done, true));
        }

        [Test]
        public void Demo_IsNotOwnSound()
        {
            Assert.IsTrue(GuideCues.IsOwnSound(0f));
            Assert.IsFalse(GuideCues.IsOwnSound(GuideCues.DemoBehindMeters));
        }

        [Test]
        public void ObjectKeys()
        {
            Assert.AreEqual(CueKey.E, GuideCues.KeyOf(PromptKind.TakeStake));
            Assert.AreEqual(CueKey.F, GuideCues.KeyOf(PromptKind.Crouch));
            Assert.AreEqual(CueKey.None, GuideCues.KeyOf(PromptKind.Move));
        }
    }
}
