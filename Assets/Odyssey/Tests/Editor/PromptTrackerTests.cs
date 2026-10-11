using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class PromptTrackerTests
    {
        /// <summary>先讓提示出現，再算一次用過。</summary>
        static void SeenAndUsed(PromptTracker t, PromptKind kind, float time = 1f)
        {
            t.MarkShown(kind, time);
            t.Used(kind, time + 0.5f);
        }

        [Test]
        public void Used_ReturnsTrueOnlyWhenRetiring()
        {
            var t = new PromptTracker();
            for (int i = 0; i < 2; i++)
            {
                t.MarkShown(PromptKind.Push, i);
                Assert.IsFalse(t.Used(PromptKind.Push, i + 0.5f));
            }
            t.MarkShown(PromptKind.Push, 2f);
            Assert.IsTrue(t.Used(PromptKind.Push, 2.5f));
            t.MarkShown(PromptKind.Push, 3f);
            Assert.IsFalse(t.Used(PromptKind.Push, 3.5f));
            Assert.IsFalse(t.Used(PromptKind.Wedge, 3.5f));
        }

        [Test]
        public void Retires_AfterThreeUses()
        {
            var t = new PromptTracker();
            SeenAndUsed(t, PromptKind.Push);
            SeenAndUsed(t, PromptKind.Push);
            Assert.IsTrue(t.ShouldShow(PromptKind.Push));
            SeenAndUsed(t, PromptKind.Push);
            Assert.IsFalse(t.ShouldShow(PromptKind.Push));
            Assert.IsTrue(t.ShouldShow(PromptKind.Wedge));
        }

        [Test]
        public void Used_WithoutShown_DoesNotCount()
        {
            var t = new PromptTracker();
            for (int i = 0; i < 3; i++)
                t.Used(PromptKind.Push, 5f);
            Assert.IsTrue(t.ShouldShow(PromptKind.Push));
        }

        [Test]
        public void Used_TooLateAfterShown_DoesNotCount()
        {
            var t = new PromptTracker();
            t.MarkShown(PromptKind.Push, 0f);
            for (int i = 0; i < 3; i++)
                t.Used(PromptKind.Push, 2.5f);
            Assert.IsTrue(t.ShouldShow(PromptKind.Push));
        }

        [Test]
        public void Used_WithinGrace_Counts()
        {
            var t = new PromptTracker();
            t.MarkShown(PromptKind.Push, 0f);
            for (int i = 0; i < 3; i++)
                t.Used(PromptKind.Push, 1.9f);
            Assert.IsFalse(t.ShouldShow(PromptKind.Push));
        }

        [Test]
        public void Escape_NeverRetires()
        {
            var t = new PromptTracker();
            for (int i = 0; i < 10; i++)
                SeenAndUsed(t, PromptKind.Escape);
            Assert.IsTrue(t.ShouldShow(PromptKind.Escape));
        }

        [Test]
        public void Move_HidesForTheNight_ReturnsNextNight()
        {
            var t = new PromptTracker();
            SeenAndUsed(t, PromptKind.Move);
            Assert.IsFalse(t.ShouldShow(PromptKind.Move));
            t.NewNight();
            Assert.IsTrue(t.ShouldShow(PromptKind.Move));
        }

        [Test]
        public void Move_SameNightCountsOnce()
        {
            var t = new PromptTracker();
            for (int i = 0; i < 5; i++)
                SeenAndUsed(t, PromptKind.Move);
            t.NewNight();
            Assert.IsTrue(t.ShouldShow(PromptKind.Move));
        }

        [Test]
        public void Move_RetiresAfterThreeNights()
        {
            var t = new PromptTracker();
            for (int night = 0; night < 3; night++)
            {
                SeenAndUsed(t, PromptKind.Move);
                t.NewNight();
            }
            Assert.IsFalse(t.ShouldShow(PromptKind.Move));
        }

        [Test]
        public void Move_WithoutShown_StaysUp()
        {
            var t = new PromptTracker();
            t.Used(PromptKind.Move, 1f);
            Assert.IsTrue(t.ShouldShow(PromptKind.Move));
        }

        [Test]
        public void Clap_BehavesLikeMove()
        {
            var t = new PromptTracker();
            SeenAndUsed(t, PromptKind.Clap);
            SeenAndUsed(t, PromptKind.Clap);
            Assert.IsFalse(t.ShouldShow(PromptKind.Clap));
            t.NewNight();
            Assert.IsTrue(t.ShouldShow(PromptKind.Clap));
        }
    }
}
