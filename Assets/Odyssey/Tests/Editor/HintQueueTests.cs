using NUnit.Framework;

namespace Odyssey.Core.Tests
{
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

    }
}
