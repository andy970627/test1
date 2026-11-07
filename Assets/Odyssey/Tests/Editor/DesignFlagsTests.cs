using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class DesignFlagsTests
    {
        [Test]
        public void Defaults_AreCurrentDesign()
        {
            var f = new DesignFlags();
            Assert.AreEqual(PassiveLight.Off, f.Passive);
            Assert.IsTrue(f.EssentialGuide);
            Assert.AreEqual("passive=Off;guide=On;zeus=On;style=Wordless;terror=Layered", f.Summary);
            Assert.IsTrue(f.ZeusLaw);
            Assert.AreEqual(GuideStyle.Wordless, f.Guide);
            Assert.AreEqual(TerrorMode.Layered, f.Terror);
        }

        [Test]
        public void NewFlags_SummaryAndNames()
        {
            var f = new DesignFlags { ZeusLaw = false, Guide = GuideStyle.Plain, Terror = TerrorMode.Legacy };
            Assert.AreEqual("passive=Off;guide=On;zeus=Off;style=Plain;terror=Legacy", f.Summary);
            Assert.AreEqual("開", DesignFlags.Name(true));
            Assert.AreEqual("關", DesignFlags.Name(false));
            Assert.AreEqual("詩句", DesignFlags.Name(GuideStyle.Verse));
            Assert.AreEqual("鍵帽", DesignFlags.Name(GuideStyle.Plain));
            Assert.AreEqual("無字", DesignFlags.Name(GuideStyle.Wordless));
            Assert.AreEqual("分層", DesignFlags.Name(TerrorMode.Layered));
            Assert.AreEqual("舊版", DesignFlags.Name(TerrorMode.Legacy));
            Assert.AreEqual("關", DesignFlags.Name(TerrorMode.Off));
        }

        [Test]
        public void ActiveSounds_AlwaysLight()
        {
            var f = new DesignFlags();
            Assert.AreEqual((1f, 1f), f.LightFor(SoundKind.Clap));
            f.Passive = PassiveLight.Off;
            Assert.AreEqual((1f, 1f), f.LightFor(SoundKind.Arrow));
        }

        [Test]
        public void PassiveSounds_FollowTheSwitch()
        {
            var f = new DesignFlags();
            Assert.AreEqual((0f, 0f), f.LightFor(SoundKind.Bleat));
            f.Passive = PassiveLight.Dim;
            Assert.AreEqual((DesignFlags.DimRadius, DesignFlags.DimBrightness), f.LightFor(SoundKind.Cyclops));
            f.Passive = PassiveLight.Full;
            Assert.AreEqual((1f, 1f), f.LightFor(SoundKind.Whimper));
            Assert.AreEqual((1f, 1f), f.LightFor(SoundKind.Step));
        }

        [Test]
        public void OtherQuietSounds_NeverLight()
        {
            var f = new DesignFlags { Passive = PassiveLight.Full };
            Assert.AreEqual((0f, 0f), f.LightFor(SoundKind.Pant));
            Assert.AreEqual((0f, 0f), f.LightFor(SoundKind.Slip));
            Assert.AreEqual((0f, 0f), f.LightFor(SoundKind.RockImpact));
        }
    }
}
