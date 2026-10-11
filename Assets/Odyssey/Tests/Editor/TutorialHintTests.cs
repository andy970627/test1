using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class TutorialStepsTests
    {
        static TutorialSteps Started()
        {
            var t = new TutorialSteps();
            t.Start();
            return t;
        }

        [Test]
        public void Advances_InOrder()
        {
            var t = Started();
            Assert.AreEqual(TutorialStep.Move, t.Step);
            t.OnMoved(2.9f);
            Assert.AreEqual(TutorialStep.Move, t.Step);
            t.OnMoved(3f);
            Assert.AreEqual(TutorialStep.Clap, t.Step);
            t.OnUsed(PromptKind.Clap);
            Assert.AreEqual(TutorialStep.Approach, t.Step);
            t.OnAtBoulder();
            Assert.AreEqual(TutorialStep.Push, t.Step);
            t.OnUsed(PromptKind.Push);
            Assert.AreEqual(TutorialStep.Wedge, t.Step);
            Assert.IsTrue(t.Asleep);
            t.OnUsed(PromptKind.Wedge);
            Assert.AreEqual(TutorialStep.Wake, t.Step);
            Assert.IsFalse(t.Asleep);
            Assert.IsTrue(t.Active);
        }

        [Test]
        public void CannotSkipSteps()
        {
            var t = Started();
            t.OnUsed(PromptKind.Clap);
            t.OnAtBoulder();
            t.OnUsed(PromptKind.Push);
            Assert.AreEqual(TutorialStep.Move, t.Step);
            t.OnMoved(5f);
            t.OnAtBoulder();
            Assert.AreEqual(TutorialStep.Clap, t.Step);
        }

        [Test]
        public void WedgeStep_AdvancesAfterTimeout()
        {
            var t = Started();
            t.OnMoved(3f);
            t.OnUsed(PromptKind.Clap);
            t.OnAtBoulder();
            t.OnUsed(PromptKind.Push);
            t.Tick(19.9f, 0.1f);
            Assert.AreEqual(TutorialStep.Wedge, t.Step);
            t.Tick(0.2f, 0.1f);
            Assert.AreEqual(TutorialStep.Wake, t.Step);
        }

        [Test]
        public void WideOpening_WakesGiantFromAnyStep()
        {
            var t = Started();
            t.Tick(0.1f, 0.29f);
            Assert.AreEqual(TutorialStep.Move, t.Step);
            t.Tick(0.1f, TutorialSteps.WakeOpening);
            Assert.AreEqual(TutorialStep.Wake, t.Step);
        }

        [Test]
        public void Wake_EndsAfterFiveSeconds()
        {
            var t = Started();
            t.Tick(0f, 1f);
            t.Tick(4.9f, 1f);
            Assert.IsTrue(t.Active);
            t.Tick(0.2f, 1f);
            Assert.AreEqual(TutorialStep.Done, t.Step);
            Assert.IsFalse(t.Active);
            Assert.IsFalse(t.Asleep);
            Assert.IsNull(t.Text);
        }

        [Test]
        public void Skip_IsDoneAndAwake()
        {
            var t = new TutorialSteps();
            t.Start();
            t.Skip();
            Assert.IsFalse(t.Active);
            Assert.IsFalse(t.Asleep);
        }

        [Test]
        public void EachSleepingStep_HasTextAndKind()
        {
            var t = Started();
            Assert.AreEqual(PromptKind.Move, t.Kind);
            Assert.IsNotNull(t.Text);
            t.OnMoved(3f);
            Assert.AreEqual(PromptKind.Clap, t.Kind);
            t.OnUsed(PromptKind.Clap);
            Assert.IsNull(t.Kind);
            Assert.IsNotNull(t.Text);
        }
    }

    public class HintQueueTests
    {
        [Test]
        public void ShowsOneAtATime_ForFiveSeconds()
        {
            var q = new HintQueue();
            q.Trigger(HintKind.Guard);
            q.Trigger(HintKind.Pail);
            q.Tick(0f, false);
            Assert.AreEqual(HintKind.Guard, q.Current);
            q.Tick(4.9f, false);
            Assert.AreEqual(HintKind.Guard, q.Current);
            q.Tick(0.2f, false);
            Assert.AreEqual(HintKind.Pail, q.Current);
            q.Tick(5.1f, false);
            Assert.IsNull(q.Current);
        }

        [Test]
        public void SameKind_SaidOnlyOnce()
        {
            var q = new HintQueue();
            q.Trigger(HintKind.Guard);
            q.Trigger(HintKind.Guard);
            q.Tick(0f, false);
            q.Tick(5.1f, false);
            Assert.IsNull(q.Current);
            q.Trigger(HintKind.Guard);
            q.Tick(0f, false);
            Assert.IsNull(q.Current);
        }

        [Test]
        public void StaleQueuedHint_DroppedAndCanRetrigger()
        {
            var q = new HintQueue();
            q.Trigger(HintKind.Guard);
            q.Tick(0f, false);
            q.Trigger(HintKind.Pail);
            q.Tick(4f, false);
            q.Trigger(HintKind.Pant);
            // Guard 還有 1 秒，Pail 已等 4 秒；再過 4.5 秒 Pail 等了 8.5 秒、被丟掉。
            q.Tick(4.5f, false);
            Assert.AreEqual(HintKind.Pant, q.Current);
            q.Tick(5.1f, false);
            q.Trigger(HintKind.Pail);
            q.Tick(0f, false);
            Assert.AreEqual(HintKind.Pail, q.Current);
        }

        [Test]
        public void Paused_IgnoresTriggersAndFreezes()
        {
            var q = new HintQueue();
            q.Trigger(HintKind.Guard);
            q.Tick(0f, false);
            q.Tick(1f, false);
            q.Tick(100f, true);
            Assert.IsNull(q.Current);
            q.Trigger(HintKind.Pail);
            q.Tick(0f, true);
            Assert.IsNull(q.Current);
            q.Tick(0f, false);
            Assert.AreEqual(HintKind.Guard, q.Current);
            Assert.AreEqual(4f, q.Remaining, 1e-4f);
            q.Tick(4.1f, false);
            Assert.IsNull(q.Current);
        }

        [Test]
        public void NewNight_DropsLeftovers_AndBarelyShownCanReturn()
        {
            var q = new HintQueue();
            q.Trigger(HintKind.RockWindup);
            q.Trigger(HintKind.Pail);
            q.Tick(0f, false);
            q.Tick(0.5f, false);
            q.NewNight();
            q.Tick(0f, false);
            Assert.IsNull(q.Current);
            q.Trigger(HintKind.Pail);
            q.Trigger(HintKind.RockWindup);
            q.Tick(0f, false);
            Assert.AreEqual(HintKind.Pail, q.Current);
        }

        [Test]
        public void NewNight_LongShownStaysSaid()
        {
            var q = new HintQueue();
            q.Trigger(HintKind.Guard);
            q.Tick(0f, false);
            q.Tick(2f, false);
            q.NewNight();
            q.Trigger(HintKind.Guard);
            q.Tick(0f, false);
            Assert.IsNull(q.Current);
        }

        [Test]
        public void EveryKind_HasText()
        {
            foreach (HintKind k in System.Enum.GetValues(typeof(HintKind)))
                Assert.IsFalse(string.IsNullOrEmpty(HintText.Of(k)), k.ToString());
        }
    }
}
