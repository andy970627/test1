using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class PatJudgeTests
    {
        static ClingModel Breathing(Side lean)
        {
            var m = new ClingModel(new ClingParams(), false);
            m.Tick(0.1f, true, true, false, Side.Left);
            m.Tick(0.1f, true, true, false, lean);
            m.Tick(0.1f, true, true, false, lean);
            return m;
        }

        [Test]
        public void BackStep_NoisyBreathing_Gasps()
        {
            var step = new PatStep(PatKind.Back, Side.Left, 1.5f);
            Assert.AreEqual(FailReason.Gasped, PatJudge.Evaluate(step, Breathing(Side.Left)));
        }

        [Test]
        public void SideStep_SameLean_Touched()
        {
            var step = new PatStep(PatKind.Side, Side.Left, 1.2f);
            Assert.AreEqual(FailReason.Touched, PatJudge.Evaluate(step, Breathing(Side.Left)));
        }

        [Test]
        public void SideStep_OppositeLean_None()
        {
            var step = new PatStep(PatKind.Side, Side.Left, 1.2f);
            Assert.AreEqual(FailReason.None, PatJudge.Evaluate(step, Breathing(Side.Right)));
        }

        [Test]
        public void BackStep_WithinGrace_DoesNotFail()
        {
            var step = new PatStep(PatKind.Back, Side.Left, 1.5f);
            Assert.AreEqual(FailReason.None, PatJudge.Evaluate(step, 0.1f, Breathing(Side.Left)));
            Assert.AreEqual(FailReason.Gasped, PatJudge.Evaluate(step, PatJudge.BackGraceSeconds + 0.01f, Breathing(Side.Left)));
        }

        [Test]
        public void NoiseOutsideBackStep_DoesNotFail()
        {
            var step = new PatStep(PatKind.Telegraph, Side.Left, 1.0f);
            Assert.AreEqual(FailReason.None, PatJudge.Evaluate(step, Breathing(Side.Left)));
        }
    }
}
