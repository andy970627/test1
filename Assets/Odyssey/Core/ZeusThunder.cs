namespace Odyssey.Core
{
    /// <summary>雷霆的懲罰：有跟隨者就劈死一個，沒有就讓巨石往回滑。</summary>
    public enum ThunderPenalty { KillFollower, BoulderSlides }

    /// <summary>一記雷：只有當夜第一記會照亮洞穴。</summary>
    public readonly struct ThunderStrike
    {
        public readonly bool LightsCave;
        public readonly ThunderPenalty Penalty;

        public ThunderStrike(bool lightsCave, ThunderPenalty penalty)
        {
            LightsCave = lightsCave;
            Penalty = penalty;
        }
    }

    /// <summary>
    /// 宙斯的雷霆（規格第 31 節 B）：偷襲之後降下。本夜第幾記由 <see cref="StrikesTonight"/> 記著，換夜歸零。
    /// </summary>
    public sealed class ZeusThunder
    {
        public int StrikesTonight { get; private set; }

        public ThunderStrike Strike(int followers)
        {
            bool first = StrikesTonight == 0;
            StrikesTonight++;
            return new ThunderStrike(first, followers > 0 ? ThunderPenalty.KillFollower : ThunderPenalty.BoulderSlides);
        }

        public void NewNight() => StrikesTonight = 0;
    }
}
