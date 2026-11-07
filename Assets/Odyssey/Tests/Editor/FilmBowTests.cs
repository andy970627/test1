using System;
using System.Collections.Generic;
using System.Numerics;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class PrayerTests
    {
        static readonly Vector2 Far = new(-20f, 0f);
        static readonly List<Vector2> NoCrew = new();

        static Func<double> Rolls(params double[] values)
        {
            int i = 0;
            return () => values[Math.Min(i++, values.Length - 1)];
        }

        static SoundEvent Snd(SoundKind kind, float x, float y) => SoundRules.Create(kind, new Vector2(x, y), 0f, null);

        [Test]
        public void Clock_FirstBetween60And120_SecondOnlyOnHalfTheNights()
        {
            var c = new PrayerClock();
            c.NewNight(Rolls(0.5, 0.2, 1.0));   // 第一次 90 秒；第二次有（0.2 < 0.5），在 200 秒
            Assert.IsFalse(c.Ready(89f));
            Assert.IsTrue(c.Ready(90f));
            c.Done(90f);
            Assert.IsFalse(c.Ready(199f));
            Assert.IsTrue(c.Ready(200f));
            c.Done(200f);
            Assert.IsFalse(c.Ready(1000f));

            c.NewNight(Rolls(0.0, 0.7));        // 第一次 60 秒；沒有第二次
            Assert.IsTrue(c.Ready(60f));
            c.Done(60f);
            Assert.IsFalse(c.Ready(1000f));
        }

        [Test]
        public void Clock_DelayedFirst_SecondWaitsAGap()
        {
            var c = new PrayerClock();
            c.NewNight(Rolls(0.0, 0.0, 0.0));   // 第一次 60 秒、第二次 150 秒
            c.Done(160f);                       // 第一次拖到 160 秒才開始
            Assert.IsFalse(c.Ready(170f));
            Assert.IsTrue(c.Ready(160f + CyclopsBrain.PraySeconds + PrayerClock.MinGap));
        }

        [Test]
        public void Clock_StaysReadyUntilDone()
        {
            var c = new PrayerClock();
            c.NewNight(Rolls(0.0, 0.9));
            Assert.IsTrue(c.Ready(70f));
            Assert.IsTrue(c.Ready(80f));
        }

        [Test]
        public void Pray_DeafAndStill_ThenListens()
        {
            var brain = new CyclopsBrain(Vector2.Zero, new DecoyMemory(), () => 0.99);
            Assert.IsTrue(brain.TryPray());
            Assert.AreEqual(CyclopsState.Pray, brain.State);
            brain.Hear(Snd(SoundKind.Clap, 2f, 0f));
            brain.Hear(Snd(SoundKind.Boulder, 3f, 0f));
            Assert.AreEqual(CyclopsState.Pray, brain.State);
            brain.Tick(7.9f, Far, NoCrew);
            Assert.AreEqual(CyclopsState.Pray, brain.State);
            Assert.AreEqual(Vector2.Zero, brain.Position);
            Assert.IsFalse(brain.IsMoving);
            brain.Tick(0.2f, Far, NoCrew);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            brain.Hear(Snd(SoundKind.Clap, 2f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
        }

        [Test]
        public void Pray_InvestigatingIsInterrupted()
        {
            var brain = new CyclopsBrain(Vector2.Zero, new DecoyMemory(), () => 0.99);
            brain.Hear(Snd(SoundKind.Clap, 5f, 0f));
            Assert.IsTrue(brain.TryPray());
        }

        [Test]
        public void Pray_RefusedWhileGuardingThrowingOrEating()
        {
            var guard = new CyclopsBrain(Vector2.Zero, new DecoyMemory(), () => 0.99);
            guard.Hear(Snd(SoundKind.Boulder, 0f, 9f));
            Assert.IsFalse(guard.TryPray());

            var thrower = new CyclopsBrain(Vector2.Zero, new DecoyMemory(), () => 0.0);
            thrower.Hear(Snd(SoundKind.Clap, 9f, 0f));
            Assert.AreEqual(CyclopsState.Throw, thrower.State);
            Assert.IsFalse(thrower.TryPray());

            var eater = new CyclopsBrain(Vector2.Zero, new DecoyMemory(), () => 0.99);
            eater.Tick(0.1f, Far, new List<Vector2> { new(0.5f, 0f) });
            Assert.AreEqual(CyclopsState.Eat, eater.State);
            Assert.IsFalse(eater.TryPray());

            var praying = new CyclopsBrain(Vector2.Zero, new DecoyMemory(), () => 0.99);
            Assert.IsTrue(praying.TryPray());
            Assert.IsFalse(praying.TryPray());
        }
    }

    public class ShoreChoiceTests
    {
        [Test]
        public void Leave_LosesNobody()
        {
            Assert.AreEqual(0, ShoreChoice.Resolve(ShoreAction.Leave, 6, () => 0.0));
        }

        [Test]
        public void ShootAndName_LoseByRoll()
        {
            int i = 0;
            double[] rolls = { 0.1, 0.5, 0.2, 0.9 };
            Assert.AreEqual(2, ShoreChoice.Resolve(ShoreAction.Shoot, 4, () => rolls[i++]));
            Assert.AreEqual(4, ShoreChoice.Resolve(ShoreAction.Name, 4, () => 0.0));
            Assert.AreEqual(0, ShoreChoice.Resolve(ShoreAction.Name, 4, () => 0.99));
        }

        [Test]
        public void Texts_NotEmpty_AndMentionCounts()
        {
            foreach (ShoreAction a in Enum.GetValues(typeof(ShoreAction)))
            {
                Assert.IsFalse(string.IsNullOrEmpty(ShoreChoice.Title(a)));
                StringAssert.Contains("3", ShoreChoice.Subtitle(a, 3, 1));
            }
            StringAssert.Contains("1", ShoreChoice.Subtitle(ShoreAction.Shoot, 3, 1));
            Assert.AreEqual(8f, ShoreChoice.TimeLimit);
        }
    }

    public class BowDrawTests
    {
        [Test]
        public void ShortDraw_Cancels()
        {
            var bow = new BowDraw();
            bow.Begin();
            bow.Tick(0.29f);
            Assert.IsNull(bow.Release());
            Assert.IsFalse(bow.Drawing);
        }

        [Test]
        public void FullDraw_Is30_HalfIsProportional()
        {
            var bow = new BowDraw();
            bow.Begin();
            bow.Tick(1.5f);
            Assert.AreEqual(30f, bow.Release().Value, 1e-4f);
            bow.Begin();
            bow.Tick(0.5f);
            Assert.AreEqual(21f, bow.Release().Value, 1e-4f);
        }

        [Test]
        public void Drawing_SlowsWalk_CancelStops()
        {
            var bow = new BowDraw();
            Assert.AreEqual(1f, bow.WalkMultiplier);
            bow.Begin();
            Assert.AreEqual(0.5f, bow.WalkMultiplier);
            bow.Cancel();
            Assert.IsFalse(bow.Drawing);
            Assert.AreEqual(1f, bow.WalkMultiplier);
            Assert.IsNull(bow.Release());
        }

        [Test]
        public void ArrowSounds()
        {
            Assert.AreEqual(0.5f, SoundRules.Loudness(SoundKind.Arrow));
            Assert.AreEqual(0.1f, SoundRules.Loudness(SoundKind.Twang));
            Assert.IsTrue(SoundRules.Lights(SoundKind.Arrow));
            Assert.IsFalse(SoundRules.Lights(SoundKind.Twang));
        }
    }
}
