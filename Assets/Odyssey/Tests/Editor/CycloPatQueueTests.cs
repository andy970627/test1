using System.Collections.Generic;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class CycloPatQueueTests
    {
        static List<PatStep> OneStep() => new() { new PatStep(PatKind.Back, Side.Left, 1f) };

        [Test]
        public void SecondItem_WaitsForFirst()
        {
            var q = new PatQueue<string>();
            q.Enqueue("a", OneStep());
            q.Enqueue("b", OneStep());
            Assert.IsTrue(q.Tick(0.5f));
            Assert.AreEqual("a", q.Current);
            q.Tick(0.6f);
            Assert.AreEqual("b", q.Current);
        }

        [Test]
        public void StepStarted_FiresPerStep()
        {
            var q = new PatQueue<string>();
            int started = 0;
            q.StepStarted += (_, _) => started++;
            q.Enqueue("a", PatSequence.Build(false, new System.Random(0)));
            for (int i = 0; i < 50; i++)
                q.Tick(0.1f);
            Assert.AreEqual(3, started);
        }

        [Test]
        public void Finished_FiresOncePerItem()
        {
            var q = new PatQueue<string>();
            var finished = new List<string>();
            q.Finished += finished.Add;
            q.Enqueue("a", OneStep());
            q.Enqueue("b", OneStep());
            for (int i = 0; i < 30; i++)
                q.Tick(0.1f);
            CollectionAssert.AreEqual(new[] { "a", "b" }, finished);
            Assert.IsFalse(q.Tick(0.1f));
            Assert.IsNull(q.CurrentStep);
        }
    }
}
