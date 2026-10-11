using System;
using System.Collections.Generic;
using System.Numerics;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class CyclopsBrainTests
    {
        static readonly Vector2 Far = new(-20f, 0f);
        static readonly Vector2 BoulderPos = new(0f, 9f);
        static readonly Vector2 Gate = new(10f, 0f);
        static readonly List<Vector2> NoCrew = new();

        DecoyMemory memory;
        CyclopsBrain brain;

        /// <summary>依序回傳 values，用完後一直回傳最後一個。</summary>
        static Func<double> Rolls(params double[] values)
        {
            int i = 0;
            return () => values[Math.Min(i++, values.Length - 1)];
        }

        [SetUp]
        public void SetUp()
        {
            memory = new DecoyMemory();
            brain = new CyclopsBrain(Vector2.Zero, memory, () => 0.99);
        }

        static SoundEvent Snd(SoundKind kind, float x, float y) => SoundRules.Create(kind, new Vector2(x, y), 0f, null);
        static SoundEvent Snd(SoundKind kind, Vector2 p) => SoundRules.Create(kind, p, 0f, null);

        FailReason T(float dt, Vector2 player) => brain.Tick(dt, player, NoCrew).Player;

        // ---------- 原有行為 ----------

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
            brain.Hear(Snd(SoundKind.RockImpact, 1f, 0f));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        [Test]
        public void Investigate_MovesAtWalkSpeed()
        {
            brain.Hear(Snd(SoundKind.Clap, 8f, 0f));
            T(1f, Far);
            Assert.AreEqual(3.5f, brain.Position.X, 1e-4f);
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
            Assert.AreEqual(FailReason.None, T(1f, Far));
            Assert.AreEqual(CyclopsState.Search, brain.State);
            Assert.AreEqual(FailReason.Touched, T(0.1f, new Vector2(1f, 1.9f)));
        }

        [Test]
        public void Search_EndsAfterTwoSeconds()
        {
            brain.Hear(Snd(SoundKind.Clap, 1f, 0f));
            T(1f, Far);
            Assert.AreEqual(FailReason.None, T(0.1f, new Vector2(1f, 2.1f)));
            T(1.8f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            T(0.15f, Far);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        [Test]
        public void ArrowSearchMiss_RecordsFooled_ThirdTimeHalvesRange()
        {
            for (int i = 0; i < 3; i++)
            {
                brain.Hear(Snd(SoundKind.Arrow, brain.Position + new Vector2(2f, 0f)));
                T(1f, Far);
                T(2.1f, Far);
                Assert.AreEqual(CyclopsState.Listen, brain.State);
            }
            Assert.AreEqual(3, memory.Fooled);

            brain.Hear(Snd(SoundKind.Arrow, brain.Position + new Vector2(7f, 0f)));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            brain.Hear(Snd(SoundKind.Arrow, brain.Position + new Vector2(4.5f, 0f)));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
        }

        [Test]
        public void ClapSearchMiss_DoesNotRecordFooled()
        {
            brain.Hear(Snd(SoundKind.Clap, 2f, 0f));
            T(1f, Far);
            T(2.1f, Far);
            Assert.AreEqual(0, memory.Fooled);
        }

        [Test]
        public void BoulderSound_Guards_RunsThenSearchesFourSeconds()
        {
            brain.Hear(Snd(SoundKind.Boulder, BoulderPos));
            T(1f, Far);
            Assert.AreEqual(CyclopsState.Guard, brain.State);
            Assert.AreEqual(5f, brain.Position.Y, 1e-4f);
            T(2f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            T(3.9f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            T(0.2f, Far);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        [Test]
        public void GrindAndSlip_AlsoGuard()
        {
            brain.Hear(Snd(SoundKind.Grind, 0f, 5f));
            Assert.AreEqual(CyclopsState.Guard, brain.State);
            brain.Reset(Vector2.Zero);
            brain.Hear(Snd(SoundKind.Slip, 0f, 2f));
            Assert.AreEqual(CyclopsState.Guard, brain.State);
        }

        [Test]
        public void GuardSearch_IgnoresFarSound_ButBoulderRestarts()
        {
            brain.Hear(Snd(SoundKind.Boulder, BoulderPos));
            T(1f, Far);
            T(2f, Far);
            brain.Hear(Snd(SoundKind.Clap, 0f, 2f));
            Assert.AreEqual(CyclopsState.Search, brain.State);
            T(3f, Far);
            brain.Hear(Snd(SoundKind.Boulder, BoulderPos));
            Assert.AreEqual(0f, brain.StateElapsed);
            T(0.1f, Far);
            T(3.5f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
        }

        void GuardUntilHolding()
        {
            brain.Hear(Snd(SoundKind.Boulder, BoulderPos));
            T(1f, Far);
            T(1f, Far);
            T(4.1f, Far);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            Assert.IsTrue(brain.HoldingBoulder);
        }

        [Test]
        public void Holding_IgnoresClapFarFromBoulder()
        {
            GuardUntilHolding();
            brain.Hear(Snd(SoundKind.Clap, 0f, 1f));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        [Test]
        public void Holding_ChecksClapNearBoulder_ThenWalksBack()
        {
            GuardUntilHolding();
            brain.Hear(Snd(SoundKind.Clap, 0f, 6f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
            T(1f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            T(2.1f, Far);
            Assert.AreEqual(BoulderPos, brain.Target);
            T(2f, Far);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            Assert.AreEqual(BoulderPos, brain.Position);
            Assert.IsTrue(brain.HoldingBoulder);
        }

        [Test]
        public void Holding_StoneLuresHimAway()
        {
            GuardUntilHolding();
            brain.Hear(Snd(SoundKind.Arrow, 0f, 1f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
            Assert.IsFalse(brain.HoldingBoulder);
        }

        [Test]
        public void Holding_BleatLuresHimAway()
        {
            GuardUntilHolding();
            brain.Hear(Snd(SoundKind.Bleat, 0f, 1f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
            Assert.IsFalse(brain.HoldingBoulder);
        }

        [Test]
        public void Reset_ClearsHolding()
        {
            GuardUntilHolding();
            brain.Reset(Vector2.Zero);
            Assert.IsFalse(brain.HoldingBoulder);
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
            Assert.AreEqual(FailReason.Bumped, T(0.1f, new Vector2(0.9f, 0f)));
        }

        [Test]
        public void SoundAtOwnPosition_NoNaN()
        {
            brain.Hear(Snd(SoundKind.Clap, 0f, 0f));
            T(0.1f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            Assert.IsFalse(float.IsNaN(brain.Position.X) || float.IsNaN(brain.Position.Y));
        }

        [Test]
        public void Reset_ReturnsToListenAtStart()
        {
            brain.Hear(Snd(SoundKind.Clap, 8f, 0f));
            T(1f, Far);
            brain.Reset(new Vector2(3f, 3f));
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            Assert.AreEqual(new Vector2(3f, 3f), brain.Position);
        }

        // ---------- 守石接續追聲、拔楔子（規格第 13 節 C） ----------

        /// <summary>每次推進 0.1 秒，回傳 PullWedge 出現的次數。</summary>
        int RunFor(float seconds, Vector2 player)
        {
            int pulls = 0;
            for (float t = 0f; t < seconds - 1e-4f; t += 0.1f)
                if (brain.Tick(0.1f, player, NoCrew).PullWedge)
                    pulls++;
            return pulls;
        }

        [Test]
        public void GuardRun_NearSound_Chases()
        {
            brain.Hear(Snd(SoundKind.Boulder, Gate));
            T(0.5f, Far);
            brain.Hear(Snd(SoundKind.Clap, 12f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
            Assert.AreEqual(new Vector2(12f, 0f), brain.Target);
        }

        [Test]
        public void GuardRun_NearSound_ReturnsToBoulderAfterSearch()
        {
            brain.Hear(Snd(SoundKind.Boulder, Gate));
            T(0.5f, Far);
            brain.Hear(Snd(SoundKind.Clap, 12f, 0f));
            int pulls = RunFor(6f, Far);
            Assert.AreEqual(0, pulls);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            Assert.AreEqual(Gate, brain.Position);
            Assert.IsTrue(brain.HoldingBoulder);
        }

        [Test]
        public void GuardSearch_NearSound_ChasesWithoutPull()
        {
            brain.Hear(Snd(SoundKind.Boulder, Gate));
            RunFor(2f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            RunFor(1f, Far);
            brain.Hear(Snd(SoundKind.Step, 11f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
            Assert.AreEqual(0, RunFor(8f, Far));
        }

        [Test]
        public void GuardRun_FarSound_Ignored()
        {
            brain.Hear(Snd(SoundKind.Boulder, Gate));
            T(0.5f, Far);
            brain.Hear(Snd(SoundKind.Clap, 0f, 8f));
            Assert.AreEqual(CyclopsState.Guard, brain.State);
            Assert.AreEqual(Gate, brain.Target);
        }

        [Test]
        public void GuardRun_Arrow_Lures()
        {
            brain.Hear(Snd(SoundKind.Boulder, Gate));
            T(0.5f, Far);
            brain.Hear(Snd(SoundKind.Arrow, 0f, 8f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
            Assert.AreEqual(new Vector2(0f, 8f), brain.Target);
            Assert.AreEqual(0, RunFor(8f, Far));
            Assert.IsFalse(brain.HoldingBoulder);
        }

        [Test]
        public void GuardSearch_RepeatedSlipNearby_DoesNotRestart()
        {
            brain.Hear(Snd(SoundKind.Boulder, Gate));
            RunFor(2f, Far);
            Assert.AreEqual(CyclopsState.Search, brain.State);
            int pulls = 0;
            for (int i = 0; i < 5; i++)
            {
                pulls += RunFor(1f, Far);
                brain.Hear(Snd(SoundKind.Slip, Gate.X - 0.1f * i, 0f));
            }
            Assert.AreEqual(1, pulls);
            Assert.IsTrue(brain.HoldingBoulder);
        }

        [Test]
        public void GuardSearch_Complete_PullsWedgeOnce()
        {
            brain.Hear(Snd(SoundKind.Boulder, Gate));
            Assert.AreEqual(1, RunFor(8f, Far));
            Assert.IsTrue(brain.HoldingBoulder);
        }

        [Test]
        public void Holding_ReleasesAfterFifteenSeconds()
        {
            GuardUntilHolding();
            T(14.9f, Far);
            Assert.IsTrue(brain.HoldingBoulder);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            T(0.2f, Far);
            Assert.IsFalse(brain.HoldingBoulder);
        }

        [Test]
        public void Listen_WandersAfterFiveSeconds_NoSearchOnArrival()
        {
            T(4.9f, Far);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            T(0.2f, Far);
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
            Assert.LessOrEqual(brain.Target.Length(), CyclopsBrain.WanderRadius + 1e-4f);
            for (int i = 0; i < 40; i++)
            {
                T(0.1f, Far);
                Assert.AreNotEqual(CyclopsState.Search, brain.State);
            }
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        // ---------- 丟岩石（規格第 3 節） ----------

        [Test]
        public void FarSound_LowRoll_Throws()
        {
            brain = new CyclopsBrain(Vector2.Zero, memory, Rolls(0.0, 0.5, 0.5, 0.99));
            brain.Hear(Snd(SoundKind.Clap, 9f, 0f));
            Assert.AreEqual(CyclopsState.Throw, brain.State);
            var tick = brain.Tick(1.2f, Far, NoCrew);
            Assert.IsTrue(tick.RockReleased);
            Assert.AreEqual(9f, tick.RockTarget.X, 1e-4f);
            Assert.AreEqual(0f, tick.RockTarget.Y, 1e-4f);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
            Assert.AreEqual(Vector2.Zero, brain.Position);
        }

        [Test]
        public void FarSound_HighRoll_Walks()
        {
            brain.Hear(Snd(SoundKind.Clap, 9f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
        }

        [Test]
        public void NearSound_NeverThrows()
        {
            brain = new CyclopsBrain(Vector2.Zero, memory, () => 0.0);
            brain.Hear(Snd(SoundKind.Clap, 7f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
        }

        [Test]
        public void Throw_Cooldown()
        {
            brain = new CyclopsBrain(Vector2.Zero, memory, () => 0.0);
            brain.Hear(Snd(SoundKind.Clap, 9f, 0f));
            brain.Tick(1.2f, Far, NoCrew);
            brain.Hear(Snd(SoundKind.Clap, -9f, 0f));
            Assert.AreEqual(CyclopsState.Investigate, brain.State);
            Assert.Greater(brain.ThrowCooldownLeft, 0f);
        }

        [Test]
        public void Holding_FarClap_CanThrow()
        {
            double next = 0.99;
            brain = new CyclopsBrain(Vector2.Zero, memory, () => next);
            GuardUntilHolding();
            next = 0.0;
            brain.Hear(Snd(SoundKind.Clap, 0f, 0f));
            Assert.AreEqual(CyclopsState.Throw, brain.State);
            brain.Tick(1.2f, Far, NoCrew);
            Assert.IsTrue(brain.HoldingBoulder);
        }

        [Test]
        public void Throw_BoulderInterruptsToGuard()
        {
            brain = new CyclopsBrain(Vector2.Zero, memory, () => 0.0);
            brain.Hear(Snd(SoundKind.Clap, 9f, 0f));
            brain.Hear(Snd(SoundKind.Boulder, Gate));
            Assert.AreEqual(CyclopsState.Guard, brain.State);
            Assert.IsFalse(brain.Tick(1.2f, Far, NoCrew).RockReleased);
        }

        [Test]
        public void RockHits_Radius()
        {
            Assert.IsTrue(CyclopsBrain.RockHits(Vector2.Zero, new Vector2(1.5f, 0f)));
            Assert.IsFalse(CyclopsBrain.RockHits(Vector2.Zero, new Vector2(1.6f, 0f)));
        }

        // ---------- 吃同伴（規格第 2 節） ----------

        [Test]
        public void Search_TouchesPlayerBeforeCrew()
        {
            brain.Hear(Snd(SoundKind.Clap, 1f, 0f));
            T(1f, Far);
            var tick = brain.Tick(0.1f, new Vector2(1f, 1.9f), new List<Vector2> { new(1f, -1.5f) });
            Assert.AreEqual(FailReason.Touched, tick.Player);
            Assert.AreEqual(-1, tick.EatenCrew);
        }

        [Test]
        public void Search_EatsCrewInRange()
        {
            brain.Hear(Snd(SoundKind.Clap, 1f, 0f));
            T(1f, Far);
            var tick = brain.Tick(0.1f, Far, new List<Vector2> { new(1f, 1.5f) });
            Assert.AreEqual(0, tick.EatenCrew);
            Assert.AreEqual(CyclopsState.Eat, brain.State);
            T(5.1f, Far);
            Assert.AreEqual(CyclopsState.Listen, brain.State);
        }

        [Test]
        public void Eat_IgnoresOrdinarySounds()
        {
            brain.Tick(0.1f, Far, new List<Vector2> { new(0.5f, 0f) });
            brain.Hear(Snd(SoundKind.Clap, 3f, 0f));
            Assert.AreEqual(CyclopsState.Eat, brain.State);
        }

        [Test]
        public void BumpCrew_AnyState()
        {
            var tick = brain.Tick(0.1f, Far, new List<Vector2> { new(5f, 5f), new(0.5f, 0f) });
            Assert.AreEqual(1, tick.EatenCrew);
            Assert.AreEqual(FailReason.None, tick.Player);
        }

        [Test]
        public void Eat_BoulderInterruptsToGuard()
        {
            brain.Tick(0.1f, Far, new List<Vector2> { new(0.5f, 0f) });
            Assert.AreEqual(CyclopsState.Eat, brain.State);
            brain.Hear(Snd(SoundKind.Grind, 4f, 0f));
            Assert.AreEqual(CyclopsState.Guard, brain.State);
        }
    }
}
