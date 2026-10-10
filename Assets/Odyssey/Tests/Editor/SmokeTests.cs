using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class SmokeTests
    {
        [Test]
        public void FailReason_HasNoneAsDefault()
        {
            Assert.AreEqual(FailReason.None, default(FailReason));
        }
    }
}
