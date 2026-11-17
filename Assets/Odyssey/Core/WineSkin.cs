namespace Odyssey.Core
{
    /// <summary>
    /// 馬戎的酒（規格第 34 節 C）：一整場遊戲只有一囊、倒兩次；倒下的酒香留 40 秒，
    /// 巨人在 10 m 內聞得到，走過去喝 4 秒，之後醉 30 秒。
    /// </summary>
    public sealed class WineSkin
    {
        public const int Pours = 2;
        public const float PourHoldSeconds = 1f;
        public const float ScentSeconds = 40f;
        public const float SmellReach = 10f;
        public const float DrinkSeconds = 4f;
        public const float DrunkSeconds = 30f;
        /// <summary>醉的時候每個目標隨機偏移的最大距離（公尺）。</summary>
        public const float DrunkSway = 1f;
        /// <summary>醉的時候腳步聲量的倍率（0.15 → 0.3）。</summary>
        public const float DrunkStepScale = 2f;
        /// <summary>醉的時候摸索範圍（平常 2 m）。</summary>
        public const float DrunkSearchRadius = 1.2f;

        public int PoursLeft { get; private set; } = Pours;
        public bool Empty => PoursLeft <= 0;

        /// <summary>倒一次；倒空了回傳 false。</summary>
        public bool Pour()
        {
            if (Empty)
                return false;
            PoursLeft--;
            return true;
        }

        /// <summary>新遊戲（不是每夜）。</summary>
        public void Reset() => PoursLeft = Pours;
    }
}
