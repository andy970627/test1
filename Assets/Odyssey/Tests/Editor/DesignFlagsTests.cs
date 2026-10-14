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
            Assert.AreEqual("passive=Off;guide=On", f.Summary);
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
