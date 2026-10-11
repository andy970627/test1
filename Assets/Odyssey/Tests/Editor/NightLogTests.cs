using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class NightLogTests
    {
        [Test]
        public void LossesAndCaptureMergeIntoOneLine()
        {
            var log = new NightLog();
            log.Lose();
            log.Lose();
            log.End(2, NightOutcome.Touched);
            Assert.AreEqual(1, log.Lines.Count);
            Assert.AreEqual(3, log.Lines[0].Lost);
            Assert.AreEqual("第 2 夜  被摸到  −3 名同伴", log.Lines[0].Text);
        }

        [Test]
        public void Dawn_CountsTheEatenOne()
        {
            var log = new NightLog();
            log.End(1, NightOutcome.Dawn);
            Assert.AreEqual("第 1 夜  天亮了  −1 名同伴", log.Lines[0].Text);
        }

        [Test]
        public void Escape_NoLoss_ShowsRescuedOnly()
        {
            var log = new NightLog();
            log.End(3, NightOutcome.Escaped, 4);
            Assert.AreEqual("第 3 夜  逃出去・帶出 4", log.Lines[0].Text);
        }

        [Test]
        public void Escape_WithLoss()
        {
            var log = new NightLog();
            log.Lose();
            log.End(3, NightOutcome.Escaped, 0);
            Assert.AreEqual("第 3 夜  逃出去・帶出 0  −1 名同伴", log.Lines[0].Text);
        }

        [Test]
        public void OtherOutcomes_HaveTheirOwnWords()
        {
            var log = new NightLog();
            log.End(1, NightOutcome.Bumped);
            log.End(2, NightOutcome.Crushed);
            Assert.AreEqual("第 1 夜  撞上巨人  −1 名同伴", log.Lines[0].Text);
            Assert.AreEqual("第 2 夜  被岩石砸中  −1 名同伴", log.Lines[1].Text);
        }

        [Test]
        public void KeepsLastSixNights()
        {
            var log = new NightLog();
            for (int n = 1; n <= 8; n++)
                log.End(n, NightOutcome.Dawn);
            Assert.AreEqual(6, log.Lines.Count);
            Assert.AreEqual(3, log.Lines[0].Night);
        }

        [Test]
        public void End_ResetsTonightsCount()
        {
            var log = new NightLog();
            log.Lose();
            log.End(1, NightOutcome.Dawn);
            log.End(2, NightOutcome.Dawn);
            Assert.AreEqual(1, log.Lines[1].Lost);
        }

        [Test]
        public void Clear_EmptiesEverything()
        {
            var log = new NightLog();
            log.Lose();
            log.End(1, NightOutcome.Dawn);
            log.Lose();
            log.Clear();
            log.End(1, NightOutcome.Escaped, 0);
            Assert.AreEqual(1, log.Lines.Count);
            Assert.AreEqual(0, log.Lines[0].Lost);
        }

        [Test]
        public void From_MapsFailReasons()
        {
            Assert.AreEqual(NightOutcome.Touched, NightLog.From(FailReason.Touched));
            Assert.AreEqual(NightOutcome.Bumped, NightLog.From(FailReason.Bumped));
            Assert.AreEqual(NightOutcome.Crushed, NightLog.From(FailReason.Crushed));
            Assert.AreEqual(NightOutcome.Dawn, NightLog.From(FailReason.Dawn));
        }
    }
}
