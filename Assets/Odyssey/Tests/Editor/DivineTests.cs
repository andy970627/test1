using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class DivineTests
    {
        [Test]
        public void Thunder_OnlyFirstStrikeLightsCave()
        {
            var z = new ZeusThunder();
            var a = z.Strike(2);
            var b = z.Strike(2);
            Assert.IsTrue(a.LightsCave);
            Assert.IsFalse(b.LightsCave);
            Assert.AreEqual(2, z.StrikesTonight);
        }

        [Test]
        public void Thunder_PenaltyDependsOnFollowers()
        {
            var z = new ZeusThunder();
            Assert.AreEqual(ThunderPenalty.KillFollower, z.Strike(1).Penalty);
            Assert.AreEqual(ThunderPenalty.BoulderSlides, z.Strike(0).Penalty);
        }

        [Test]
        public void Thunder_NewNightResets()
        {
            var z = new ZeusThunder();
            z.Strike(0);
            z.NewNight();
            Assert.AreEqual(0, z.StrikesTonight);
            Assert.IsTrue(z.Strike(0).LightsCave);
        }

        [Test]
        public void Athena_AmbushLosesFavorOnce()
        {
            var a = new AthenaFavor();
            Assert.IsTrue(a.Has);
            Assert.IsTrue(a.OnAmbush());
            Assert.IsFalse(a.Has);
            Assert.IsTrue(a.Tremble);
            Assert.IsTrue(a.EverAmbushed);
            Assert.IsFalse(a.OnAmbush(), "已經失去，不算剛失去");
            Assert.IsTrue(a.Tremble);
        }

        [Test]
        public void Athena_FairRegainsAndRedeems()
        {
            var a = new AthenaFavor();
            Assert.IsFalse(a.OnFair(), "本來就有，不算剛得回");
            a.OnAmbush();
            Assert.IsFalse(a.Redeemed);
            Assert.IsTrue(a.OnFair());
            Assert.IsTrue(a.Has);
            Assert.IsTrue(a.Redeemed);
        }

        [Test]
        public void Athena_NewNightClearsTrembleOnly_ResetClearsAll()
        {
            var a = new AthenaFavor();
            a.OnAmbush();
            a.NewNight();
            Assert.IsFalse(a.Tremble);
            Assert.IsFalse(a.Has);
            Assert.IsTrue(a.EverAmbushed);
            a.Reset();
            Assert.IsTrue(a.Has);
            Assert.IsFalse(a.EverAmbushed);
            Assert.IsFalse(a.Tremble);
        }

        [Test]
        public void BardVerse_LinesFadeInInSequence()
        {
            var v = new BardVerse("甲", "乙", "鍵");
            Assert.AreEqual(0f, v.LineAlpha(0), 1e-4f);
            v.Tick(0.3f);
            Assert.AreEqual(0.5f, v.LineAlpha(0), 1e-3f);
            Assert.AreEqual(0f, v.LineAlpha(1), 1e-4f);
            Assert.AreEqual(v.LineAlpha(0), v.KeyAlpha, 1e-4f);
            v.Tick(0.3f);
            Assert.AreEqual(1f, v.LineAlpha(0), 1e-3f);
            v.Tick(0.3f);
            Assert.AreEqual(0.5f, v.LineAlpha(1), 1e-3f);
            v.Tick(1f);
            Assert.AreEqual(1f, v.LineAlpha(1), 1e-3f);
        }

        [Test]
        public void BardVerse_CompleteFadesOutThenFinished()
        {
            var v = new BardVerse("甲", "乙", "鍵");
            v.Tick(2f);
            Assert.IsFalse(v.Finished);
            v.Complete();
            v.Tick(0.4f);
            Assert.AreEqual(0.5f, v.LineAlpha(0), 1e-3f);
            Assert.AreEqual(0.5f, v.KeyAlpha, 1e-3f);
            Assert.IsFalse(v.Finished);
            v.Tick(0.5f);
            Assert.IsTrue(v.Finished);
            Assert.AreEqual(0f, v.LineAlpha(1), 1e-4f);
        }

        [Test]
        public void BardVerse_PlucksOncePerLine()
        {
            var v = new BardVerse("甲", "乙", null);
            Assert.AreEqual(1, v.TakePlucks(), "第一行一開始就淡入");
            Assert.AreEqual(0, v.TakePlucks());
            v.Tick(0.5f);
            Assert.AreEqual(0, v.TakePlucks());
            v.Tick(0.2f);
            Assert.AreEqual(1, v.TakePlucks());
            v.Tick(5f);
            Assert.AreEqual(0, v.TakePlucks());
        }

        [Test]
        public void BardVerse_SingleLineOnlyOnePluck()
        {
            var v = new BardVerse("甲", null, null);
            v.Tick(5f);
            Assert.AreEqual(1, v.TakePlucks());
            Assert.AreEqual(0f, v.LineAlpha(1), 1e-4f);
        }

        static void AssertVerse((string, string) v, bool twoLines = true)
        {
            Assert.IsNotEmpty(v.Item1);
            Assert.IsFalse(v.Item1.Contains("／"));
            if (twoLines)
            {
                Assert.IsNotEmpty(v.Item2);
                Assert.IsFalse(v.Item2.Contains("／"));
            }
            else
                Assert.IsTrue(string.IsNullOrEmpty(v.Item2));
        }

        [Test]
        public void VerseBook_AllVersesPresentAndSplit()
        {
            AssertVerse(VerseBook.Opening1);
            AssertVerse(VerseBook.Opening2);
            AssertVerse(VerseBook.FirstStone);
            AssertVerse(VerseBook.FairHit);
            AssertVerse(VerseBook.Ambush);
            AssertVerse(VerseBook.CrewEaten);
            AssertVerse(VerseBook.Prayer);
            AssertVerse(VerseBook.ShoreShoot, false);
            AssertVerse(VerseBook.Regained);
            AssertVerse(VerseBook.EndingKept, false);
            AssertVerse(VerseBook.EndingTurned, false);
            AssertVerse(VerseBook.Horse);
            Assert.AreEqual("宙斯看見了", VerseBook.ShoreShoot.Item1);
        }

        [Test]
        public void VerseBook_EssentialKeysExact()
        {
            Assert.AreEqual("空白鍵 彈・按住 拉弓射石", VerseBook.Essential(EssentialStep.Sound).Value.Item3);
            Assert.AreEqual("E 推・Shift＋E 猛推", VerseBook.Essential(EssentialStep.Push).Value.Item3);
            Assert.AreEqual("右鍵 塞石子當楔子", VerseBook.Essential(EssentialStep.Wedge).Value.Item3);
            Assert.AreEqual("E 鑽出去", VerseBook.Essential(EssentialStep.Escape).Value.Item3);
            Assert.IsNull(VerseBook.Essential(EssentialStep.Done));
            var s = VerseBook.Essential(EssentialStep.Sound).Value;
            Assert.AreEqual("拉響你的彈弓，讓它替你出聲", s.Item1);
            Assert.AreEqual("聲音到過的地方，黑暗便退開", s.Item2);
        }
    }
}
