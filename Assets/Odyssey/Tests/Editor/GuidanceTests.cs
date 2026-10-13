using System;
using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class GuideBookTests
    {
        [Test]
        public void ControlsPage_StartsUnlocked_OthersLocked()
        {
            var book = new GuideBook();
            foreach (var e in book.EntriesOn(GuidePage.Controls))
                Assert.IsTrue(book.IsUnlocked(e.Id), e.Id);
            foreach (var e in book.EntriesOn(GuidePage.Giant))
                Assert.IsFalse(book.IsUnlocked(e.Id), e.Id);
        }

        [Test]
        public void Unlock_TrueOnlyFirstTime()
        {
            var book = new GuideBook();
            Assert.IsTrue(book.Unlock("prayer"));
            Assert.IsFalse(book.Unlock("prayer"));
            Assert.IsTrue(book.IsUnlocked("prayer"));
            Assert.IsFalse(book.Unlock("no-such-entry"));
        }

        [Test]
        public void EveryHintKind_MapsToAnEntry()
        {
            var book = new GuideBook();
            foreach (HintKind k in Enum.GetValues(typeof(HintKind)))
            {
                string id = HintGuide.EntryFor(k);
                Assert.IsTrue(book.Has(id), $"{k} → {id}");
            }
        }

        [Test]
        public void EveryEntry_HasTitleAndText_AndEveryPageHasEntries()
        {
            var book = new GuideBook();
            foreach (var e in book.Entries)
            {
                Assert.IsFalse(string.IsNullOrEmpty(e.Title), e.Id);
                Assert.IsFalse(string.IsNullOrEmpty(e.Text), e.Id);
            }
            foreach (GuidePage p in Enum.GetValues(typeof(GuidePage)))
                Assert.Greater(book.EntriesOn(p).Count, 0, p.ToString());
            Assert.IsFalse(string.IsNullOrEmpty(GuideBook.PageName(GuidePage.SoundLight)));
        }

        [Test]
        public void HintTexts_NoDashes()
        {
            foreach (HintKind k in Enum.GetValues(typeof(HintKind)))
                StringAssert.DoesNotContain("——", HintText.Of(k), k.ToString());
        }
    }

    public class DeathCardTests
    {
        [Test]
        public void Timeline()
        {
            Assert.AreEqual(0f, DeathCard.DimAlpha(0f), 1e-4f);
            Assert.AreEqual(DeathCard.MaxDim, DeathCard.DimAlpha(0.8f), 1e-4f);
            Assert.AreEqual(0f, DeathCard.BandAlpha(0.4f), 1e-4f);
            Assert.Greater(DeathCard.BandAlpha(1f), 0f);
            Assert.AreEqual(0.9f, DeathCard.TextScale(0.5f), 1e-4f);
            Assert.AreEqual(1f, DeathCard.TextScale(1.5f), 1e-4f);
            Assert.AreEqual(1f, DeathCard.TextAlpha(1.5f), 1e-4f);
        }

        [Test]
        public void SkipAfterOneSecond_DoneAfterThree()
        {
            Assert.IsFalse(DeathCard.CanSkip(0.99f));
            Assert.IsTrue(DeathCard.CanSkip(1f));
            Assert.IsFalse(DeathCard.Done(2.99f));
            Assert.IsTrue(DeathCard.Done(3f));
        }
    }

    public class HeartbeatTests
    {
        [Test]
        public void Range_Rate_Intensity()
        {
            Assert.IsFalse(Heartbeat.Active(8.1f));
            Assert.IsTrue(Heartbeat.Active(8f));
            Assert.AreEqual(60f, Heartbeat.BeatsPerMinute(8f), 1e-3f);
            Assert.AreEqual(140f, Heartbeat.BeatsPerMinute(2f), 1e-3f);
            Assert.AreEqual(140f, Heartbeat.BeatsPerMinute(0.5f), 1e-3f);
            Assert.AreEqual(100f, Heartbeat.BeatsPerMinute(5f), 1e-3f);
            Assert.AreEqual(0f, Heartbeat.Intensity(8f), 1e-4f);
            Assert.AreEqual(1f, Heartbeat.Intensity(2f), 1e-4f);
        }
    }
}
