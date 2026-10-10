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
            string line = PlaytestCsv.Line(new DateTime(2026, 10, 10, 12, 0, 0), 3, 10, true, LoopPhase.Cling, "Touched", 12.34f);
            Assert.AreEqual("2026-10-10 12:00:00,3,10,1,Cling,Touched,12.3", line);
        }
    }
}
