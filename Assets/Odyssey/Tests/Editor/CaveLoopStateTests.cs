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
            Assert.AreEqual(LoopPhase.Night, s.Phase);
            s.Escape();
            Assert.AreEqual(LoopPhase.Escaped, s.Phase);
        }

        [Test]
        public void FailInNight_EatsOneAndGoesCaught()
        {
            var roster = new CrewRoster();
            var s = new CaveLoopState(roster);
            s.IntroDone();
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
                s.Fail(FailReason.Bumped);
                s.CaughtDone();
            }
            s.IntroDone();
            s.Fail(FailReason.Dawn);
            Assert.AreEqual(LoopPhase.Wiped, s.Phase);
        }

        [Test]
        public void Fail_ReportsNightAndCrewBeforeEating()
        {
            var roster = new CrewRoster();
            var s = new CaveLoopState(roster);
            s.IntroDone();
            RoundRecord record = s.Fail(FailReason.Dawn);
            Assert.AreEqual(1, record.Night);
            Assert.AreEqual(12, record.Crew);
            Assert.AreEqual(11, roster.Remaining);
        }

        [Test]
        public void FailTwice_SecondThrows()
        {
            var s = new CaveLoopState(new CrewRoster());
            s.IntroDone();
            s.Fail(FailReason.Touched);
            Assert.Throws<InvalidOperationException>(() => s.Fail(FailReason.Dawn));
        }

        [Test]
        public void IllegalTransition_Throws()
        {
            var s = new CaveLoopState(new CrewRoster());
            Assert.Throws<InvalidOperationException>(() => s.Escape());
        }

        [Test]
        public void Restart_AfterWiped_ResetsRoster()
        {
            var roster = new CrewRoster();
            var s = new CaveLoopState(roster);
            for (int i = 0; i < 12; i++)
            {
                s.IntroDone();
                s.Fail(FailReason.Touched);
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
