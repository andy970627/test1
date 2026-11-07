using NUnit.Framework;

namespace Odyssey.Core.Tests
{
    public class ZeusLawTests
    {
        static ZeusVerdict J(CyclopsState s, float heard = 1f, bool playerSound = true, bool boulder = false, bool lawOn = true) =>
            ZeusLaw.Judge(s, boulder, heard, playerSound, lawOn);

        [Test] public void Investigate_PlayerSound_Fair() => Assert.AreEqual(ZeusVerdict.Fair, J(CyclopsState.Investigate));
        [Test] public void Search_PlayerSound_Fair() => Assert.AreEqual(ZeusVerdict.Fair, J(CyclopsState.Search));
        [Test] public void Throw_PlayerSound_Fair() => Assert.AreEqual(ZeusVerdict.Fair, J(CyclopsState.Throw));
        [Test] public void Stagger_Fair() => Assert.AreEqual(ZeusVerdict.Fair, J(CyclopsState.Stagger, playerSound: false));

        [Test] public void Investigate_NotPlayerSound_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Investigate, playerSound: false));
        [Test] public void Search_NotPlayerSound_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Search, playerSound: false));
        [Test] public void Throw_NotPlayerSound_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Throw, playerSound: false));
        [Test] public void Pray_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Pray));
        [Test] public void Eat_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Eat));
        [Test] public void Guard_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Guard));
        [Test] public void Listen_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Listen));

        [Test] public void HoldingBoulder_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Investigate, boulder: true));
        [Test] public void HoldingBoulder_StaggerStillAmbush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Stagger, boulder: true));

        [Test] public void HeardWithin3s_Fair() => Assert.AreEqual(ZeusVerdict.Fair, J(CyclopsState.Investigate, 2.9f));
        [Test] public void HeardExactly3s_Fair() => Assert.AreEqual(ZeusVerdict.Fair, J(CyclopsState.Investigate, 3f));
        [Test] public void HeardAfter3s_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Investigate, 3.1f));
        [Test] public void Stagger_HeardTooLongAgo_Ambush() => Assert.AreEqual(ZeusVerdict.Ambush, J(CyclopsState.Stagger, 3.1f));

        [Test] public void LawOff_AlwaysFair() => Assert.AreEqual(ZeusVerdict.Fair, J(CyclopsState.Pray, 99f, false, true, false));
    }
}
