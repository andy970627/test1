using System.Collections.Generic;
using System.Numerics;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class SoundRulesTests
    {
        static readonly List<SoundEvent> NoBleats = new();

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
