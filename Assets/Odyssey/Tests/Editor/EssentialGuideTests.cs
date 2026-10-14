using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class EssentialGuideTests
    {
        [Test]
        public void StepsInOrder_OneLineAtATime()
        {
            var g = new EssentialGuide();
            Assert.AreEqual(EssentialStep.Sound, g.Step);
            Assert.AreEqual("空白鍵 製造聲音", g.Text);
            g.OnLit();
            Assert.AreEqual(EssentialStep.Push, g.Step);
            Assert.IsNull(g.Text, "還沒站到巨石前，不顯示");
            g.OnAtBoulder();
            Assert.AreEqual("E 推", g.Text);
            g.OnPushed();
            Assert.AreEqual(EssentialStep.Wedge, g.Step);
            Assert.IsNull(g.Text, "巨石還沒往回滑，不顯示");
            g.OnSlip();
            Assert.AreEqual("右鍵 塞石子當楔子", g.Text);
            g.OnWedged();
            Assert.AreEqual(EssentialStep.Escape, g.Step);
            Assert.IsNull(g.Text);
            g.OnAtOpenGap();
            Assert.AreEqual("E 鑽出去", g.Text);
            g.OnEscaped();
            Assert.IsTrue(g.Done);
            Assert.IsNull(g.Text);
        }

        [Test]
        public void EarlyTrigger_ShowsAsSoonAsItsTurn()
        {
            var g = new EssentialGuide();
            g.OnAtBoulder();
            Assert.AreEqual("空白鍵 製造聲音", g.Text);
            g.OnLit();
            Assert.AreEqual("E 推", g.Text);
        }

        [Test]
        public void EarlyCompletion_SkipsThatStep()
        {
            var g = new EssentialGuide();
            g.OnAtBoulder();
            g.OnPushed();
            g.OnSlip();
            g.OnLit();
            Assert.AreEqual(EssentialStep.Wedge, g.Step);
            Assert.AreEqual("右鍵 塞石子當楔子", g.Text);
        }

        [Test]
        public void LaterSteps_DoNotCompleteEarlierOnes()
        {
            var g = new EssentialGuide();
            g.OnWedged();
            g.OnEscaped();
            Assert.AreEqual(EssentialStep.Sound, g.Step);
        }
    }
}
