using System;
using System.Collections.Generic;
using System.Numerics;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    /// <summary>規格第 34 節：雷鳴耳鳴（A）、天亮前（B）、馬戎的酒（C）、刻痕（D）、巨人會學（E）、雅典娜的眷顧點數（F）。</summary>
    public class ExtensionTests
    {
        static readonly Vector2 Far = new(-20f, 0f);
        static readonly List<Vector2> NoCrew = new();

        static CyclopsBrain Brain(Vector2 at, double roll = 0.99) => new(at, new DecoyMemory(), () => roll);
        static SoundEvent Snd(SoundKind kind, Vector2 p) => SoundRules.Create(kind, p, 0f, null);
        static FailReason T(CyclopsBrain b, float dt, Vector2 player) => b.Tick(dt, player, NoCrew).Player;

        // ---------- A. 雷鳴耳鳴 ----------

        [Test]
        public void Thunder_FreezesThenDeafWithinRange()
        {
            var b = Brain(Vector2.Zero, roll: 0.5);
            b.Thunderstruck(new Vector2(6f, 0f));
            Assert.AreEqual(CyclopsState.Stagger, b.State);
            Assert.AreEqual(CyclopsBrain.ThunderFreezeSeconds + 3f, b.DeafLeft, 1e-4f, "roll 0.5 → 定住 2.5 秒＋聾 3 秒");
            b.Hear(Snd(SoundKind.Clap, new Vector2(3f, 0f)));
            Assert.AreEqual(CyclopsState.Stagger, b.State, "聾了聽不到");
        }

        [Test]
        public void Thunder_AfterFreeze_WalksSlowlyToLastHeard_StillDeaf()
        {
            var b = Brain(Vector2.Zero, roll: 0.0);
            b.Hear(Snd(SoundKind.Clap, new Vector2(4f, 0f)));
            Assert.AreEqual(new Vector2(4f, 0f), b.LastHeardPlayerAt);
            b.Thunderstruck(new Vector2(-6f, 0f));
            T(b, CyclopsBrain.ThunderFreezeSeconds + 0.01f, Far);
            Assert.AreEqual(CyclopsState.Investigate, b.State);
            Assert.AreEqual(new Vector2(4f, 0f), b.Target, "朝最後聽見你的位置，不是 fallback");
            Vector2 before = b.Position;
            T(b, 1f, Far);
            Assert.AreEqual(CyclopsBrain.WalkSpeed * CyclopsBrain.DeafWalkMultiplier, Vector2.Distance(before, b.Position), 1e-3f);
            b.Hear(Snd(SoundKind.Clap, new Vector2(0f, 5f)));
            Assert.AreEqual(new Vector2(4f, 0f), b.Target, "還聾著，換不了目標");
        }

        [Test]
        public void Thunder_NeverHeardYou_UsesFallback_ThenHearsAgain()
        {
            var b = Brain(Vector2.Zero, roll: 0.0);
            b.Thunderstruck(new Vector2(0f, -6f));
            T(b, CyclopsBrain.ThunderFreezeSeconds + 0.01f, Far);
            Assert.AreEqual(new Vector2(0f, -6f), b.Target);
            T(b, CyclopsBrain.ThunderDeafMin + 0.01f, Far);
            Assert.AreEqual(0f, b.DeafLeft);
            b.Hear(Snd(SoundKind.Clap, b.Position + new Vector2(3f, 0f)));
            Assert.AreEqual(b.Position + new Vector2(3f, 0f), b.Target, "恢復聽覺後照常循聲");
        }

        // ---------- E. 巨人會學 ----------

        [Test]
        public void LureMemory_ThirdHalf_FifthIgnore_PerRegionAndKind()
        {
            var m = new LureMemory();
            var east = new Vector2(8f, 0.5f);
            Assert.AreEqual(LureTrust.Full, m.Respond(east, LureKind.Stone));
            Assert.AreEqual(LureTrust.Full, m.Respond(east, LureKind.Stone));
            Assert.AreEqual(LureTrust.Half, m.Respond(east, LureKind.Stone));
            Assert.AreEqual(LureTrust.Full, m.Respond(east, LureKind.Pail), "換手段就重新算");
            Assert.AreEqual(LureTrust.Full, m.Respond(new Vector2(-8f, 0.5f), LureKind.Stone), "換區域就重新算");
            Assert.AreEqual(LureTrust.Half, m.Respond(east, LureKind.Stone));
            Assert.AreEqual(LureTrust.Ignore, m.Respond(east, LureKind.Stone));
        }

        [Test]
        public void LureMemory_NewNightHalves_ResetClears()
        {
            var m = new LureMemory();
            var p = new Vector2(0f, 6f);
            for (int i = 0; i < 5; i++)
                m.Respond(p, LureKind.Cheese);
            m.NewNight();
            Assert.AreEqual(2, m.Uses(p, LureKind.Cheese));
            Assert.AreEqual(LureTrust.Half, m.Respond(p, LureKind.Cheese), "減半後再用一次是第 3 次");
            m.Reset();
            Assert.AreEqual(0, m.Uses(p, LureKind.Cheese));
        }

        [Test]
        public void LureMemory_SixRegions_ArrowsNotTracked()
        {
            var seen = new HashSet<int>();
            for (int i = 0; i < 12; i++)
            {
                double a = (i + 0.5) / 12 * Math.PI * 2;
                seen.Add(LureMemory.RegionOf(new Vector2((float)Math.Cos(a), (float)Math.Sin(a)) * 5f));
            }
            Assert.AreEqual(LureMemory.Regions, seen.Count);
            Assert.IsNull(LureMemory.KindOf(SoundKind.Arrow), "箭沿用第 21 節自己的學習");
            Assert.IsNull(LureMemory.KindOf(SoundKind.Clap));
            Assert.AreEqual(LureKind.Stone, LureMemory.KindOf(SoundKind.Stone));
        }

        [Test]
        public void Brain_ThirdStoneSameRegion_WalksHalfway_NoSearch()
        {
            var b = Brain(Vector2.Zero);
            var doubts = new List<LureTrust>();
            b.LureDoubted += doubts.Add;
            var stone = new Vector2(6f, 0f);
            for (int i = 0; i < 2; i++)
            {
                b.Hear(Snd(SoundKind.Stone, stone));
                Assert.AreEqual(stone, b.Target);
                T(b, 5f, Far);
                b.Reset(Vector2.Zero);
            }
            b.Hear(Snd(SoundKind.Stone, stone));
            Assert.AreEqual(new Vector2(3f, 0f), b.Target, "第 3 次只走一半");
            Assert.AreEqual(new[] { LureTrust.Half }, doubts.ToArray());
            T(b, 2f, Far);
            Assert.AreEqual(CyclopsState.Listen, b.State, "走到一半停下來聽，不摸索");
        }

        [Test]
        public void Brain_FifthStone_Ignored()
        {
            var b = Brain(Vector2.Zero);
            for (int i = 0; i < 4; i++)
                b.Lures.Respond(new Vector2(6f, 0f), LureKind.Stone);
            b.Hear(Snd(SoundKind.Stone, new Vector2(6f, 0.2f)));
            Assert.AreEqual(CyclopsState.Listen, b.State);
        }

        // ---------- C. 馬戎的酒 ----------

        [Test]
        public void WineSkin_TwoPours()
        {
            var w = new WineSkin();
            Assert.IsTrue(w.Pour());
            Assert.IsTrue(w.Pour());
            Assert.IsFalse(w.Pour());
            Assert.IsTrue(w.Empty);
            w.Reset();
            Assert.AreEqual(WineSkin.Pours, w.PoursLeft);
        }

        [Test]
        public void Wine_SmelledWithinReach_DrinksThenDrunk()
        {
            var b = Brain(Vector2.Zero);
            var drank = new List<Vector2>();
            b.Drank += drank.Add;
            Assert.IsFalse(b.Smell(new Vector2(11f, 0f)), "10 m 外聞不到");
            Assert.IsTrue(b.Smell(new Vector2(7f, 0f)));
            Assert.AreEqual(CyclopsState.Investigate, b.State);
            T(b, 2f, Far);
            Assert.AreEqual(CyclopsState.Drink, b.State);
            b.Hear(Snd(SoundKind.Clap, new Vector2(3f, 0f)));
            Assert.AreEqual(CyclopsState.Drink, b.State, "喝的時候不理一般聲音");
            T(b, WineSkin.DrinkSeconds + 0.01f, Far);
            Assert.AreEqual(CyclopsState.Listen, b.State);
            Assert.IsTrue(b.Drunk);
            Assert.AreEqual(1, drank.Count);
            T(b, WineSkin.DrunkSeconds, Far);
            Assert.IsFalse(b.Drunk);
        }

        [Test]
        public void Wine_EachPuddleJudgedOnce()
        {
            var b = Brain(Vector2.Zero);
            var p = new Vector2(5f, 0f);
            Assert.IsTrue(b.Smell(p));
            b.Hear(Snd(SoundKind.Clap, new Vector2(-3f, 0f)));
            T(b, 1f, Far);
            T(b, CyclopsBrain.SearchSeconds + 0.01f, Far);
            Assert.AreEqual(CyclopsState.Listen, b.State);
            Assert.IsFalse(b.Smell(p), "同一灘不再判斷（每幀呼叫也只算一次）");
            Assert.AreEqual(1, b.Lures.Uses(p, LureKind.Wine));
            Assert.IsTrue(b.Smell(new Vector2(-3f, 3f)), "新的一灘照樣聞得到");
        }

        [Test]
        public void Wine_LouderSoundCallsHimAway()
        {
            var b = Brain(Vector2.Zero);
            b.Smell(new Vector2(6f, 0f));
            b.Hear(Snd(SoundKind.Clap, new Vector2(-3f, 0f)));
            Assert.AreEqual(new Vector2(-3f, 0f), b.Target);
            T(b, 1f, Far);
            T(b, CyclopsBrain.SearchSeconds + 0.01f, Far);
            Assert.AreNotEqual(CyclopsState.Drink, b.State);
        }

        [Test]
        public void Drunk_NoThrow_NoPray_SmallerSearch()
        {
            var b = Brain(Vector2.Zero, roll: 0.0);
            b.Smell(new Vector2(1f, 0f));
            T(b, 1f, Far);
            T(b, WineSkin.DrinkSeconds + 0.01f, Far);
            Assert.IsTrue(b.Drunk);
            Assert.IsFalse(b.TryPray());
            b.Hear(Snd(SoundKind.Clap, new Vector2(12f, 0f)));
            Assert.AreNotEqual(CyclopsState.Throw, b.State, "roll 0 平常一定丟石，醉了不會");
            Assert.AreEqual(WineSkin.DrunkSearchRadius, b.CurrentSearchRadius);
        }

        // ---------- D. 刻痕 ----------

        [Test]
        public void Carvings_MaxEight_DropsOldest_NearWall()
        {
            var c = new Carvings();
            for (int i = 0; i < Carvings.Max; i++)
                Assert.AreEqual(-1, c.Add(new Vector2(i, 0f)));
            Assert.AreEqual(0, c.Add(new Vector2(99f, 0f)));
            Assert.AreEqual(Carvings.Max, c.Count);
            Assert.AreEqual(new Vector2(1f, 0f), c.Marks[0]);
            Assert.IsTrue(Carvings.NearWall(new Vector2(13f, 0f)));
            Assert.IsFalse(Carvings.NearWall(new Vector2(5f, 0f)));
            c.Reset();
            Assert.AreEqual(0, c.Count);
        }

        [Test]
        public void Brain_SearchOnCarving_FollowsToNext_NotBack()
        {
            var b = Brain(Vector2.Zero);
            var marks = new List<Vector2> { new(5f, 0f), new(5f, 6f), new(-8f, 0f) };
            b.Carvings = marks;
            var followed = new List<Vector2>();
            b.FollowedCarving += followed.Add;
            b.Hear(Snd(SoundKind.Clap, new Vector2(5f, 0.5f)));
            T(b, 2f, Far);
            Assert.AreEqual(CyclopsState.Search, b.State);
            T(b, CyclopsBrain.SearchSeconds + 0.01f, Far);
            Assert.AreEqual(CyclopsState.Investigate, b.State);
            Assert.AreEqual(new Vector2(5f, 6f), b.Target, "最近的下一道");
            T(b, 3f, Far);
            T(b, CyclopsBrain.SearchSeconds + 0.01f, Far);
            Assert.AreEqual(new Vector2(-8f, 0f), b.Target, "不走回上一道");
            Assert.AreEqual(2, followed.Count);
        }

        [Test]
        public void Brain_NoCarvingNearby_ListensAsBefore()
        {
            var b = Brain(Vector2.Zero);
            b.Carvings = new List<Vector2> { new(12f, 0f), new(12f, 3f) };
            b.Hear(Snd(SoundKind.Clap, new Vector2(3f, 0f)));
            T(b, 1f, Far);
            T(b, CyclopsBrain.SearchSeconds + 0.01f, Far);
            Assert.AreEqual(CyclopsState.Listen, b.State);
        }

        // ---------- B. 天亮前 ----------

        [Test]
        public void DawnStir_AmbientRisesInLastThirtySeconds()
        {
            Assert.AreEqual(0f, DawnStir.Ambient(60f));
            Assert.IsFalse(DawnStir.Active(31f));
            Assert.IsTrue(DawnStir.Active(30f));
            Assert.AreEqual(0f, DawnStir.Ambient(30f), 1e-4f);
            Assert.AreEqual(0.25f, DawnStir.Ambient(15f), 1e-4f);
            Assert.AreEqual(0.5f * (1f - 0.1f / 30f), DawnStir.Ambient(0.1f), 1e-4f);
            Assert.AreEqual(0f, DawnStir.Ambient(0f), "天亮了就結束");
        }

        // ---------- F. 雅典娜的眷顧點數 ----------

        [Test]
        public void Favor_PointsUpToThree_SpendCosts()
        {
            var a = new AthenaFavor();
            Assert.AreEqual(1, a.Points);
            a.OnFair();
            a.OnFair();
            a.OnFair();
            Assert.AreEqual(3, a.Points);
            Assert.AreEqual(3, a.MostPoints);
            Assert.IsTrue(a.Spend(FavorBoon.CaveFlash));
            Assert.AreEqual(1, a.Points);
            Assert.IsFalse(a.Spend(FavorBoon.CaveFlash), "不夠 2 點");
            Assert.AreEqual(1, a.Points);
            Assert.IsTrue(a.Spend(FavorBoon.Oracle));
            Assert.AreEqual(0, a.Points);
            Assert.IsTrue(a.Has, "花光不算女神轉身");
            Assert.IsFalse(a.Spend(FavorBoon.Moonbeam));
        }

        [Test]
        public void Favor_AmbushZeroesAndTurns_FairBringsBackOnePoint()
        {
            var a = new AthenaFavor();
            a.OnFair();
            a.OnAmbush();
            Assert.AreEqual(0, a.Points);
            Assert.IsTrue(a.TurnedAway);
            Assert.IsTrue(a.OnFair());
            Assert.AreEqual(1, a.Points);
            Assert.IsFalse(a.TurnedAway);
            a.Reset();
            Assert.AreEqual(AthenaFavor.StartPoints, a.Points);
            Assert.AreEqual(AthenaFavor.StartPoints, a.MostPoints);
        }
    }
}
