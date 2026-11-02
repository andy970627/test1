namespace Odyssey.Core
{
    /// <summary>宙斯法則的判定：正面出手（Fair）或偷襲（Ambush）。</summary>
    public enum ZeusVerdict { Fair, Ambush }

    /// <summary>
    /// 宙斯的法則（規格第 31 節 B）：巨人只有在「剛聽到你、並且正循著那個聲音找」時出手才算公平；
    /// 禱告、吃人、守石，或超過 3 秒沒聽過你，就是偷襲，宙斯會降雷。
    /// </summary>
    public static class ZeusLaw
    {
        /// <summary>聽到玩家聲音後多少秒內算「剛聽到」（含）。</summary>
        public const float HeardWindow = 3f;

        public static ZeusVerdict Judge(CyclopsState state, bool holdingBoulder, float secondsSinceHeardPlayer, bool targetIsPlayerSound, bool lawOn)
        {
            if (!lawOn)
                return ZeusVerdict.Fair;
            if (holdingBoulder || secondsSinceHeardPlayer > HeardWindow)
                return ZeusVerdict.Ambush;
            switch (state)
            {
                case CyclopsState.Investigate:
                case CyclopsState.Search:
                case CyclopsState.Throw:
                    return targetIsPlayerSound ? ZeusVerdict.Fair : ZeusVerdict.Ambush;
                case CyclopsState.Stagger:
                    return ZeusVerdict.Fair;
                default:
                    return ZeusVerdict.Ambush;
            }
        }
    }
}
