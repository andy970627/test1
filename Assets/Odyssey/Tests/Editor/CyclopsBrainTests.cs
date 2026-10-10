using System.Numerics;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class CyclopsBrainTests
    {
        static readonly Vector2 Far = new(-20f, 0f);
        static readonly Vector2 BoulderPos = new(0f, 9f);

        DecoyMemory memory;
        CyclopsBrain brain;

        [SetUp]
        public void SetUp()
        {
            memory = new DecoyMemory();
            brain = new CyclopsBrain(Vector2.Zero, memory);
        }

        static SoundEvent Snd(SoundKind kind, float x, float y) => SoundRules.Create(kind, new Vector2(x, y), 0f, null);
        static SoundEvent Snd(SoundKind kind, Vector2 p) => SoundRules.Create(kind, p, 0f, null);

        [Test]
        public void Listen_HearsClapInRange_Investigates()
        {
            brain.Hear(Snd(SoundKind.Clap, 8f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
            Assert.AreEqual(new Vector2(8f, 0f), brain.Target);
        }

        [Test]
        public void Listen_IgnoresClapOutOfRange()
        {
            brain.Hear(Snd(SoundKind.Clap, 10.5f, 0f));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        [Test]
        public void IgnoresOwnSounds()
        {
            brain.Hear(Snd(SoundKind.Cyclops, 1f, 0f));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        [Test]
        public void Investigate_MovesAtWalkSpeed()
        {
            brain.Hear(Snd(SoundKind.Clap, 8f, 0f));
            brain.Tick(1f, Far);
            Assert.AreEqual(2.5f, brain.Position.X, 1e-4f);
            Assert.IsTrue(brain.IsMoving);
        }

        [Test]
        public void Investigate_SwitchesOnlyToLouderSound()
        {
            brain.Hear(Snd(SoundKind.Clap, 8f, 0f));
            brain.Hear(Snd(SoundKind.Step, -2f, 0f));
            Assert.AreEqual(new Vector2(8f, 0f), brain.Target);
            brain.Hear(Snd(SoundKind.Stone, 0f, 8f));
            Assert.AreEqual(new Vector2(0f, 8f), brain.Target);
        }

        [Test]
        public void Arrive_StartsSearch_TouchesWithinRadius()
        {
            brain.Hear(Snd(SoundKind.Clap, 1f, 0f));
            Assert.AreEqual(FailReason.None, brain.Tick(1f, Far));
            Assert.AreEqual(CyclopsState.Search, brain.State);
            Assert.AreEqual(FailReason.Touched, brain.Tick(0.1f, new Vector2(1f, 1.4f)));
        }

        [Test]
        public void Arrive_StartsSearch_MissesOutsideRadius_ThenListens()
        {
            brain.Hear(Snd(SoundKind.Clap, 1f, 0f));
            brain.Tick(1f, Far);
            Assert.AreEqual(FailReason.None, brain.Tick(0.1f, new Vector2(1f, 1.6f)));
            brain.Tick(2.95f, Far);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        [Test]
        public void StoneSearchMiss_RecordsFooled_ThirdTimeHalvesRange()
        {
            for (int i = 0; i < 3; i++)
            {
                brain.Hear(Snd(SoundKind.Stone, 2f, 0f));
                brain.Tick(1f, Far);
                brain.Tick(3.1f, Far);
                Assert.AreEqual(CyclopsState.Listen, brain.State);
            }
            Assert.AreEqual(3, memory.Fooled);

            brain.Hear(Snd(SoundKind.Stone, brain.Position + new Vector2(7f, 0f)));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            brain.Hear(Snd(SoundKind.Stone, brain.Position + new Vector2(5f, 0f)));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
        }

        [Test]
        public void ClapSearchMiss_DoesNotRecordFooled()
        {
            brain.Hear(Snd(SoundKind.Clap, 2f, 0f));
            brain.Tick(1f, Far);
            brain.Tick(3.1f, Far);
            Assert.AreEqual(0, memory.Fooled);
        }

        [Test]
        public void BoulderSound_Guards_RunsThenSearchesSixSeconds()
        {
            brain.Hear(Snd(SoundKind.Boulder, BoulderPos));
            brain.Tick(1f, Far);
            Assert.AreEqual(CyclopsState.Guard, brain.State);
            Assert.AreEqual(4f, brain.Position.Y, 1e-4f);
            brain.Tick(2f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            brain.Tick(5.9f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            brain.Tick(0.2f, Far);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        [Test]
        public void Guard_IgnoresOtherSounds_ButBoulderRestarts()
        {
            brain.Hear(Snd(SoundKind.Boulder, BoulderPos));
            brain.Tick(1f, Far);
            brain.Tick(2f, Far);
            brain.Hear(Snd(SoundKind.Clap, 0f, 5f));
            Assert.AreEqual(CyclopsState.Search, brain.State);
            brain.Tick(4f, Far);
            brain.Hear(Snd(SoundKind.Boulder, BoulderPos));
            Assert.AreEqual(0f, brain.StateElapsed);
            brain.Tick(0.1f, Far);
            brain.Tick(5f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
        }

        [Test]
        public void BoulderSound_GuardsWhereTheBoulderNowIs()
        {
            brain.Hear(Snd(SoundKind.Boulder, 1.4f, 9f));
            Assert.AreEqual(new Vector2(1.4f, 9f), brain.Target);
        }

        [Test]
        public void Bump_AnyState()
        {
            Assert.AreEqual(FailReason.Bumped, brain.Tick(0.1f, new Vector2(0.9f, 0f)));
        }

        [Test]
        public void SoundAtOwnPosition_NoNaN()
        {
            brain.Hear(Snd(SoundKind.Clap, 0f, 0f));
            brain.Tick(0.1f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            Assert.IsFalse(float.IsNaN(brain.Position.X) || float.IsNaN(brain.Position.Y));
        }

        [Test]
        public void Reset_ReturnsToListenAtStart()
        {
            brain.Hear(Snd(SoundKind.Clap, 8f, 0f));
            brain.Tick(1f, Far);
            brain.Reset(new Vector2(3f, 3f));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            Assert.AreEqual(new Vector2(3f, 3f), brain.Position);
        }
    }
}
