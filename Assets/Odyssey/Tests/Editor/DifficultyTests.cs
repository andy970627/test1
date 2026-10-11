using System.Collections.Generic;
using System.Numerics;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class DifficultyTests
    {
        static readonly Vector2 Far = new(-20f, 0f);
        static readonly Vector2 BoulderPos = new(0f, 9f);
        static readonly List<Vector2> NoCrew = new();

        static CyclopsBrain Brain(DifficultyLevel level, DecoyMemory memory = null) =>
            new(Vector2.Zero, memory ?? new DecoyMemory(), () => 0.99) { Level = level };

        static SoundEvent Snd(SoundKind kind, float x, float y) => SoundRules.Create(kind, new Vector2(x, y), 0f, null);

        [Test]
        public void Multipliers_MatchSpec()
        {
            Assert.AreEqual(0.7f, Difficulty.SpeedMultiplier(DifficultyLevel.Familiar), 1e-5f);
            Assert.AreEqual(1f, Difficulty.SpeedMultiplier(DifficultyLevel.Normal), 1e-5f);
            Assert.AreEqual(1.2f, Difficulty.SpeedMultiplier(DifficultyLevel.Hard), 1e-5f);
            Assert.AreEqual(0.6f, Difficulty.HearingMultiplier(DifficultyLevel.Familiar), 1e-5f);
            Assert.AreEqual(1f, Difficulty.HearingMultiplier(DifficultyLevel.Normal), 1e-5f);
            Assert.AreEqual(1.3f, Difficulty.HearingMultiplier(DifficultyLevel.Hard), 1e-5f);
        }

        [Test]
        public void NamesAndBlurbs_NotEmpty()
        {
            foreach (DifficultyLevel level in System.Enum.GetValues(typeof(DifficultyLevel)))
            {
                Assert.IsFalse(string.IsNullOrEmpty(Difficulty.Name(level)));
                Assert.IsFalse(string.IsNullOrEmpty(Difficulty.Blurb(level)));
            }
        }

        [Test]
        public void DefaultLevel_IsNormal()
        {
            Assert.AreEqual(DifficultyLevel.Normal, new CyclopsBrain(Vector2.Zero, new DecoyMemory(), () => 0.99).Level);
        }

        [Test]
        public void Familiar_MovesSlower()
        {
            var brain = Brain(DifficultyLevel.Familiar);
            brain.Hear(Snd(SoundKind.Clap, 5f, 0f));
            brain.Tick(1f, Far, NoCrew);
            Assert.AreEqual(2.45f, brain.Position.X, 1e-4f);
        }

        [Test]
        public void Hard_GuardRunsFaster()
        {
            var brain = Brain(DifficultyLevel.Hard);
            brain.Hear(SoundRules.Create(SoundKind.Boulder, BoulderPos, 0f, null));
            brain.Tick(1f, Far, NoCrew);
            Assert.AreEqual(CyclopsState.Guard, brain.State);
            Assert.AreEqual(6f, brain.Position.Y, 1e-4f);
        }

        [Test]
        public void Familiar_DoesNotHearBeyondReducedRadius()
        {
            var brain = Brain(DifficultyLevel.Familiar);
            brain.Hear(Snd(SoundKind.Clap, 6.1f, 0f));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            brain.Hear(Snd(SoundKind.Clap, 5.9f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
        }

        [Test]
        public void Hard_HearsFarther()
        {
            var brain = Brain(DifficultyLevel.Hard);
            brain.Hear(Snd(SoundKind.Clap, 12.9f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
        }

        [Test]
        public void HearingMultiplierFor_CombinesDifficultyAndLearning()
        {
            var memory = new DecoyMemory();
            var brain = Brain(DifficultyLevel.Hard, memory);
            Assert.AreEqual(1.3f, brain.HearingMultiplierFor(SoundKind.Arrow), 1e-5f);
            for (int i = 0; i < DecoyMemory.FooledLimit; i++)
                memory.RecordFooled();
            Assert.AreEqual(0.65f, brain.HearingMultiplierFor(SoundKind.Arrow), 1e-5f);
            Assert.AreEqual(1.3f, brain.HearingMultiplierFor(SoundKind.Clap), 1e-5f);
        }

        [Test]
        public void ArrowLearning_StacksWithDifficulty()
        {
            var memory = new DecoyMemory();
            for (int i = 0; i < DecoyMemory.FooledLimit; i++)
                memory.RecordFooled();
            var brain = Brain(DifficultyLevel.Familiar, memory);
            // Arrow 0.5 → 10 m × 0.5（學會）× 0.6（熟悉）= 3 m
            brain.Hear(Snd(SoundKind.Arrow, 3.1f, 0f));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            brain.Hear(Snd(SoundKind.Arrow, 2.9f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
        }
    }
}
