using System;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class FailReasonTextTests
    {
        [Test]
        public void EveryFailure_HasItsOwnChineseDescription()
        {
            var seen = new System.Collections.Generic.HashSet<string>();
            foreach (FailReason reason in Enum.GetValues(typeof(FailReason)))
            {
                if (reason == FailReason.None)
                    continue;
                string text = FailReasonText.Describe(reason);
                Assert.IsFalse(string.IsNullOrWhiteSpace(text), reason.ToString());
                Assert.IsFalse(text.Contains(reason.ToString()), $"{reason} 應該寫成中文");
                Assert.IsTrue(seen.Add(text), $"{reason} 的說明和其他原因重複");
            }
        }

        [Test]
        public void Touched_MentionsSound()
        {
            StringAssert.Contains("聲音", FailReasonText.Describe(FailReason.Touched));
        }
    }
}
