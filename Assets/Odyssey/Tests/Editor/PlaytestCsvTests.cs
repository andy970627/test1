using System;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class PlaytestCsvTests
    {
        [Test]
        public void TryAppend_LockedFile_ReturnsFalseWithoutThrowing()
        {
            string path = System.IO.Path.GetTempFileName();
            try
            {
                using (new System.IO.FileStream(path, System.IO.FileMode.Open, System.IO.FileAccess.ReadWrite, System.IO.FileShare.None))
                    Assert.IsFalse(PlaytestCsv.TryAppend(path, "x", out string error));
                Assert.IsTrue(PlaytestCsv.TryAppend(path, "x", out _));
            }
            finally { System.IO.File.Delete(path); }
        }

        [Test]
        public void Line_UsesInvariantFormat()
        {
            string line = PlaytestCsv.Line(new DateTime(2026, 10, 10, 12, 0, 0), 3, 10, 72, 2, 1, LoopPhase.Night, "Dawn", 12.34f, DifficultyLevel.Familiar);
            Assert.AreEqual("2026-10-10 12:00:00,3,10,72,2,1,Night,Dawn,12.3,Familiar", line);
        }

        [Test]
        public void FileName_IsSeparateFromV1Columns()
        {
            Assert.AreEqual("blind_cave_v3_playtest.csv", PlaytestCsv.FileName);
        }

        [Test]
        public void Header_HasRescuedAndLost()
        {
            Assert.AreEqual("time,night,crew,boulder,rescued,lost,phase,outcome,seconds,difficulty", PlaytestCsv.Header);
        }
    }
}
