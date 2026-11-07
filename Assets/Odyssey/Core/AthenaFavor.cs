namespace Odyssey.Core
{
    /// <summary>
    /// 雅典娜的眷顧（整場遊戲的狀態）：一開始有；偷襲會失去並讓月光顫抖（只限當夜）；
    /// 之後正面出手可以贖回。<see cref="EverAmbushed"/> 與 <see cref="Redeemed"/> 供結局判斷。
    /// </summary>
    public sealed class AthenaFavor
    {
        public bool Has { get; private set; } = true;
        public bool Tremble { get; private set; }
        public bool EverAmbushed { get; private set; }
        public bool Redeemed => EverAmbushed && Has;

        /// <summary>偷襲；回傳這次才剛失去眷顧（之前還有）。</summary>
        public bool OnAmbush()
        {
            bool lost = Has;
            Has = false;
            Tremble = true;
            EverAmbushed = true;
            return lost;
        }

        /// <summary>正面出手；回傳這次才剛得回眷顧（之前沒有）。</summary>
        public bool OnFair()
        {
            bool regained = !Has;
            Has = true;
            return regained;
        }

        /// <summary>換夜：只清顫抖。</summary>
        public void NewNight() => Tremble = false;

        /// <summary>新遊戲。</summary>
        public void Reset()
        {
            Has = true;
            Tremble = false;
            EverAmbushed = false;
        }
    }
}
