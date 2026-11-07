using System.Collections.Generic;
using System.Numerics;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class SoundRulesTests
    {
        static readonly List<SoundEvent> NoBleats = new();

        [Test]
        public void Lights_OnlyActiveSounds()
        {
            foreach (var k in new[] { SoundKind.Clap, SoundKind.Stone, SoundKind.Boulder, SoundKind.Grind, SoundKind.Wedge, SoundKind.Clatter, SoundKind.Arrow, SoundKind.SnapShot })
                Assert.IsTrue(SoundRules.Lights(k), k.ToString());
            foreach (var k in new[] { SoundKind.Step, SoundKind.Run, SoundKind.Pant, SoundKind.Drag, SoundKind.Cheese, SoundKind.Wicker,
                         SoundKind.Bleat, SoundKind.Whimper, SoundKind.Slip, SoundKind.Cyclops, SoundKind.RockImpact, SoundKind.Twang, SoundKind.Stretch })
                Assert.IsFalse(SoundRules.Lights(k), k.ToString());
        }

        [Test]
        public void Loudness_MatchesSpec()
        {
            Assert.AreEqual(0.15f, SoundRules.Loudness(SoundKind.Step));
            Assert.AreEqual(0.4f, SoundRules.Loudness(SoundKind.Run));
            Assert.AreEqual(0.5f, SoundRules.Loudness(SoundKind.Clap));
            Assert.AreEqual(0.6f, SoundRules.Loudness(SoundKind.Stone));
            Assert.AreEqual(1.0f, SoundRules.Loudness(SoundKind.Boulder));
            Assert.AreEqual(0.5f, SoundRules.Loudness(SoundKind.Bleat));
            Assert.AreEqual(0.15f, SoundRules.Loudness(SoundKind.Cyclops));
        }

        [Test]
        public void Loudness_V2Kinds()
        {
            Assert.AreEqual(0.2f, SoundRules.Loudness(SoundKind.Whimper));
            Assert.AreEqual(0.8f, SoundRules.Loudness(SoundKind.RockImpact));
            Assert.AreEqual(0.25f, SoundRules.Loudness(SoundKind.Drag));
            Assert.AreEqual(0.7f, SoundRules.Loudness(SoundKind.Clatter));
            Assert.AreEqual(0.4f, SoundRules.Loudness(SoundKind.Cheese));
            Assert.AreEqual(0.25f, SoundRules.Loudness(SoundKind.Wicker));
            Assert.AreEqual(0.3f, SoundRules.Loudness(SoundKind.Grind));
            Assert.AreEqual(0.15f, SoundRules.Loudness(SoundKind.Slip));
            Assert.AreEqual(0.25f, SoundRules.Loudness(SoundKind.Wedge));
        }

        [Test]
        public void Loudness_SlingshotKinds()
        {
            Assert.AreEqual(0.4f, SoundRules.Loudness(SoundKind.SnapShot));
            Assert.AreEqual(0.1f, SoundRules.Loudness(SoundKind.Stretch));
            Assert.AreEqual(0.5f, SoundRules.Loudness(SoundKind.Clap));
        }

        [Test]
        public void Source_WhimperIsCrew_RockIsCyclops()
        {
            Assert.AreEqual(SoundSource.Crew, SoundRules.Source(SoundKind.Whimper));
            Assert.AreEqual(SoundSource.Cyclops, SoundRules.Source(SoundKind.RockImpact));
            foreach (var k in new[] { SoundKind.Drag, SoundKind.Clatter, SoundKind.Cheese, SoundKind.Wicker, SoundKind.Grind, SoundKind.Slip, SoundKind.Wedge })
                Assert.AreEqual(SoundSource.Player, SoundRules.Source(k), k.ToString());
        }

        [Test]
        public void CanHear_RockImpactNeverHeard()
        {
            var e = new SoundEvent(SoundKind.RockImpact, Vector2.Zero, 0.8f, 0f);
            Assert.IsFalse(SoundRules.CanHear(e, Vector2.Zero));
        }

        [Test]
        public void IsBoulder_BoulderGrindSlipOnly()
        {
            Assert.IsTrue(SoundRules.IsBoulder(SoundKind.Boulder));
            Assert.IsTrue(SoundRules.IsBoulder(SoundKind.Grind));
            Assert.IsTrue(SoundRules.IsBoulder(SoundKind.Slip));
            Assert.IsFalse(SoundRules.IsBoulder(SoundKind.Wedge));
            Assert.IsFalse(SoundRules.IsBoulder(SoundKind.Stone));
            Assert.IsFalse(SoundRules.IsBoulder(SoundKind.Clap));
        }

        [Test]
        public void Create_ScaleHalvesStep()
        {
            Assert.AreEqual(0.075f, SoundRules.Create(SoundKind.Step, Vector2.Zero, 0f, null, 0.5f).Loudness, 1e-6f);
        }

        [Test]
        public void Loudness_Pant_IsPlayerAtPointTwo()
        {
            Assert.AreEqual(0.2f, SoundRules.Loudness(SoundKind.Pant));
            Assert.AreEqual(SoundSource.Player, SoundRules.Source(SoundKind.Pant));
        }

        [Test]
        public void Radius_IsTwentyTimesLoudness()
        {
            Assert.AreEqual(10f, SoundRules.Radius(0.5f), 1e-5f);
        }

        [Test]
        public void Source_StoneAndBoulderArePlayer_BleatIsSheep_CyclopsIsCyclops()
        {
            Assert.AreEqual(SoundSource.Player, SoundRules.Source(SoundKind.Stone));
            Assert.AreEqual(SoundSource.Player, SoundRules.Source(SoundKind.Boulder));
            Assert.AreEqual(SoundSource.Player, SoundRules.Source(SoundKind.Step));
            Assert.AreEqual(SoundSource.Sheep, SoundRules.Source(SoundKind.Bleat));
            Assert.AreEqual(SoundSource.Cyclops, SoundRules.Source(SoundKind.Cyclops));
        }

        [Test]
        public void Create_WithinThreeMetersOfBleatInLastSecond_IsMasked()
        {
            var bleats = new List<SoundEvent> { SoundRules.Create(SoundKind.Bleat, Vector2.Zero, 10f, NoBleats) };
            Assert.AreEqual(0.5f * 0.4f, SoundRules.Create(SoundKind.Clap, new Vector2(2f, 0f), 10.5f, bleats).Loudness, 1e-5f);
            Assert.AreEqual(0.5f, SoundRules.Create(SoundKind.Clap, new Vector2(3.5f, 0f), 10.5f, bleats).Loudness, 1e-5f);
            Assert.AreEqual(0.5f, SoundRules.Create(SoundKind.Clap, new Vector2(2f, 0f), 11.2f, bleats).Loudness, 1e-5f);
        }

        [Test]
        public void Create_BleatIsNeverMaskedByItself()
        {
            var bleats = new List<SoundEvent> { SoundRules.Create(SoundKind.Bleat, Vector2.Zero, 10f, NoBleats) };
            Assert.AreEqual(0.5f, SoundRules.Create(SoundKind.Bleat, Vector2.Zero, 10f, bleats).Loudness, 1e-5f);
        }

        [Test]
        public void CanHear_BoundaryInclusive()
        {
            Assert.IsTrue(SoundRules.CanHear(SoundRules.Create(SoundKind.Clap, new Vector2(10f, 0f), 0f, NoBleats), Vector2.Zero));
            Assert.IsFalse(SoundRules.CanHear(SoundRules.Create(SoundKind.Clap, new Vector2(10.01f, 0f), 0f, NoBleats), Vector2.Zero));
        }

        [Test]
        public void CanHear_RadiusMultiplier()
        {
            Assert.IsFalse(SoundRules.CanHear(SoundRules.Create(SoundKind.Stone, new Vector2(7f, 0f), 0f, NoBleats), Vector2.Zero, 0.5f));
            Assert.IsTrue(SoundRules.CanHear(SoundRules.Create(SoundKind.Stone, new Vector2(6f, 0f), 0f, NoBleats), Vector2.Zero, 0.5f));
        }

        [Test]
        public void CanHear_CyclopsOwnSoundIsNeverHeard()
        {
            Assert.IsFalse(SoundRules.CanHear(SoundRules.Create(SoundKind.Cyclops, Vector2.Zero, 0f, NoBleats), Vector2.Zero));
        }
    }
}
