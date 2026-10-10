namespace Odyssey.Core
{
    /// <summary>封住洞口的巨石推開了幾格；推滿 8 格縫才夠寬鑽出去。進度不跨夜保留。</summary>
    public sealed class BoulderModel
    {
        public const int StepsToOpen = 8;

        public int Progress { get; private set; }
        public bool IsOpen => Progress >= StepsToOpen;

        /// <summary>推一格；已經推開時不再前進並回傳 false。</summary>
        public bool Push()
        {
            if (IsOpen)
                return false;
            Progress++;
            return true;
        }

        public void Reset() => Progress = 0;
    }
}
