using System;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class PatSequenceTests
    {
        [Test]
        public void Normal_IsBackTelegraphSide_SameSide()
        {
            var steps = PatSequence.Build(false, new Random(1));
            Assert.AreEqual(3, steps.Count);
            Assert.AreEqual(PatKind.Back, steps[0].Kind);
            Assert.AreEqual(PatKind.Telegraph, steps[1].Kind);
            Assert.AreEqual(PatKind.Side, steps[2].Kind);
            Assert.AreEqual(steps[1].Side, steps[2].Side);
            Assert.AreEqual(1.5f, steps[0].Duration);
            Assert.AreEqual(1.0f, steps[1].Duration);
            Assert.AreEqual(1.2f, steps[2].Duration);
        }

        [Test]
        public void Ram_RepeatsTwoOrThreeRounds()
        {
            for (int seed = 0; seed < 50; seed++)
            {
                var steps = PatSequence.Build(true, new Random(seed));
                Assert.That(steps.Count == 6 || steps.Count == 9, $"seed {seed}: {steps.Count}");
                foreach (var step in steps)
                    if (step.Kind == PatKind.Back)
                        Assert.AreEqual(2.5f, step.Duration);
            }
        }
    }
}
