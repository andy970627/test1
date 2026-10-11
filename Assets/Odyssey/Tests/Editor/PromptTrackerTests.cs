using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class PromptTrackerTests
    {
        [Test]
        public void Retires_AfterThreeUses()
        {
            var t = new PromptTracker();
            t.Used(PromptKind.Push);
            t.Used(PromptKind.Push);
            Assert.IsTrue(t.ShouldShow(PromptKind.Push));
            t.Used(PromptKind.Push);
            Assert.IsFalse(t.ShouldShow(PromptKind.Push));
            Assert.IsTrue(t.ShouldShow(PromptKind.Wedge));
        }

        [Test]
        public void Escape_NeverRetires()
        {
            var t = new PromptTracker();
            for (int i = 0; i < 10; i++)
                t.Used(PromptKind.Escape);
            Assert.IsTrue(t.ShouldShow(PromptKind.Escape));
        }

        [Test]
        public void Move_HidesForTheNight_ReturnsNextNight()
        {
            var t = new PromptTracker();
            t.Used(PromptKind.Move);
            Assert.IsFalse(t.ShouldShow(PromptKind.Move));
            t.NewNight();
            Assert.IsTrue(t.ShouldShow(PromptKind.Move));
        }

        [Test]
        public void Move_SameNightCountsOnce()
        {
            var t = new PromptTracker();
            for (int i = 0; i < 5; i++)
                t.Used(PromptKind.Move);
            t.NewNight();
            Assert.IsTrue(t.ShouldShow(PromptKind.Move));
        }

        [Test]
        public void Move_RetiresAfterThreeNights()
        {
            var t = new PromptTracker();
            for (int night = 0; night < 3; night++)
            {
                t.Used(PromptKind.Move);
                t.NewNight();
            }
            Assert.IsFalse(t.ShouldShow(PromptKind.Move));
        }

        [Test]
        public void Clap_BehavesLikeMove()
        {
            var t = new PromptTracker();
            t.Used(PromptKind.Clap);
            t.Used(PromptKind.Clap);
            Assert.IsFalse(t.ShouldShow(PromptKind.Clap));
            t.NewNight();
            Assert.IsTrue(t.ShouldShow(PromptKind.Clap));
        }
    }
}
