using System;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class CaveLoopStateTests
    {
        [Test]
        public void HappyPath_ReachesEscaped()
        {
            var s = new CaveLoopState(new CrewRoster());
            Assert.AreEqual(LoopPhase.Intro, s.Phase);
            s.IntroDone();
            s.Grabbed();
            s.Escape();
            Assert.AreEqual(LoopPhase.Escaped, s.Phase);
        }

        [Test]
        public void FailInCling_EatsOneAndGoesCaught()
        {
            var roster = new CrewRoster();
            var s = new CaveLoopState(roster);
            s.IntroDone();
            s.Grabbed();
            s.Fail(FailReason.Touched);
            Assert.AreEqual(LoopPhase.Caught, s.Phase);
            Assert.AreEqual(FailReason.Touched, s.LastFail);
            Assert.AreEqual(11, roster.Remaining);
            s.CaughtDone();
            Assert.AreEqual(LoopPhase.Intro, s.Phase);
        }

        [Test]
        public void TwelfthFail_GoesWiped()
        {
            var roster = new CrewRoster();
            var s = new CaveLoopState(roster);
            for (int i = 0; i < 11; i++)
            {
                s.IntroDone();
                s.Fail(FailReason.Swept);
                s.CaughtDone();
            }
            s.IntroDone();
            s.Fail(FailReason.FlockGone);
            Assert.AreEqual(LoopPhase.Wiped, s.Phase);
        }

        [Test]
        public void IllegalTransition_Throws()
        {
            var s = new CaveLoopState(new CrewRoster());
            Assert.Throws<InvalidOperationException>(() => s.Grabbed());
        }

        [Test]
        public void Restart_AfterWiped_ResetsRoster()
        {
            var roster = new CrewRoster();
            var s = new CaveLoopState(roster);
            for (int i = 0; i < 12; i++)
            {
                s.IntroDone();
                s.Fail(FailReason.Swept);
                if (s.Phase == LoopPhase.Caught)
                    s.CaughtDone();
            }
            Assert.AreEqual(LoopPhase.Wiped, s.Phase);
            s.Restart();
            Assert.AreEqual(LoopPhase.Intro, s.Phase);
            Assert.AreEqual(12, roster.Remaining);
            Assert.AreEqual(1, roster.Night);
        }
    }
}
