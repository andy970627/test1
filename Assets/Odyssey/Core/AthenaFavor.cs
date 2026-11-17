namespace Odyssey.Core
{
    /// <summary>雅典娜眷顧換得的幫助（規格第 34 節 F）。</summary>
    public enum FavorBoon { Moonbeam, Oracle, CaveFlash }

    /// <summary>
    /// 雅典娜的眷顧（整場遊戲的狀態，規格第 31 節 B、第 34 節 F）：點數 0～3，開局 1 點。
    /// 正面出手 +1；偷襲歸零、女神轉身，並讓月光顫抖（只限當夜）；點數可以換縫光、神諭或整洞回聲。
    /// <see cref="Has"/>＝女神沒有因偷襲轉身（沿用原本「有沒有眷顧」的意思：詩人的吟唱、巨石邊的月光、結局）。
    /// 把點數花光不算轉身，只有偷襲才算；轉身後一次正面出手就回頭。
    /// </summary>
    public sealed class AthenaFavor
    {
        public const int MaxPoints = 3;
        public const int StartPoints = 1;
        public const float MoonbeamSeconds = 20f;

        public int Points { get; private set; } = StartPoints;
        public bool Has => !TurnedAway;
        public bool TurnedAway { get; private set; }
        public bool Tremble { get; private set; }
        public bool EverAmbushed { get; private set; }
        public bool Redeemed => EverAmbushed && Has;

        /// <summary>整場曾經攢到幾點（「Q 求雅典娜相助」的提示在第一次到 2 點時出現）。</summary>
        public int MostPoints { get; private set; } = StartPoints;

        public static int Cost(FavorBoon boon) => boon == FavorBoon.CaveFlash ? 2 : 1;

        /// <summary>偷襲：點數歸零、女神轉身；回傳這次才剛轉身（之前沒轉）。</summary>
        public bool OnAmbush()
        {
            bool lost = Has;
            Points = 0;
            TurnedAway = true;
            Tremble = true;
            EverAmbushed = true;
            return lost;
        }

        /// <summary>正面出手：+1（最多 3），轉身的女神回頭；回傳這次才剛回頭。</summary>
        public bool OnFair()
        {
            bool regained = !Has;
            TurnedAway = false;
            if (Points < MaxPoints)
                Points++;
            if (Points > MostPoints)
                MostPoints = Points;
            return regained;
        }

        public bool CanSpend(FavorBoon boon) => Points >= Cost(boon);

        /// <summary>花點數換幫助；點數不夠回傳 false、什麼都不扣。</summary>
        public bool Spend(FavorBoon boon)
        {
            if (!CanSpend(boon))
                return false;
            Points -= Cost(boon);
            return true;
        }

        /// <summary>換夜：只清顫抖。</summary>
        public void NewNight() => Tremble = false;

        /// <summary>新遊戲。</summary>
        public void Reset()
        {
            Points = StartPoints;
            MostPoints = StartPoints;
            TurnedAway = false;
            Tremble = false;
            EverAmbushed = false;
        }
    }
}
