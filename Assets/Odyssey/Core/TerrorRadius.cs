namespace Odyssey.Core
{
    /// <summary>恐懼半徑的層級（規格第 31 節 H）：靜默、三層距離、追逐、禱告。</summary>
    public enum TerrorLayer { Silent, One, Two, Three, Chase, Prayer }

    /// <summary>某一刻的恐懼讀數：層級與心跳 bpm（靜默與禱告為 0）。</summary>
    public readonly struct TerrorReading
    {
        public readonly TerrorLayer Layer;
        public readonly float Bpm;

        public TerrorReading(TerrorLayer layer, float bpm)
        {
            Layer = layer;
            Bpm = bpm;
        }
    }

    /// <summary>
    /// 類 Dead by Daylight 的恐懼半徑：離巨人越近心跳越快；追逐時固定最快；
    /// 他靜聽時近距離反而一片死寂；他禱告時是搖籃曲（無心跳）。純規則，無 Unity 依賴。
    /// </summary>
    public static class TerrorRadius
    {
        public const float LayerOne = 16f;
        public const float LayerTwo = 10f;
        public const float LayerThree = 5f;
        /// <summary>他靜聽時，這個距離（不隨難度縮放）以內一律靜默。</summary>
        public const float ListenSilence = 10f;

        public const float BpmOne = 50f;
        public const float BpmTwo = 80f;
        public const float BpmThree = 120f;
        public const float BpmChase = 160f;

        /// <summary>難度對三段半徑的倍率：熟悉放寬、困難收緊。</summary>
        public static float Scale(DifficultyLevel l) => l switch
        {
            DifficultyLevel.Familiar => 1.25f,
            DifficultyLevel.Hard => 0.75f,
            _ => 1f,
        };

        public static TerrorReading Evaluate(float distance, bool chasing, bool listeningStill, bool praying, DifficultyLevel level)
        {
            if (praying)
                return new TerrorReading(TerrorLayer.Prayer, 0f);
            if (listeningStill && distance <= ListenSilence)
                return new TerrorReading(TerrorLayer.Silent, 0f);
            if (chasing)
                return new TerrorReading(TerrorLayer.Chase, BpmChase);

            float s = Scale(level);
            if (distance <= LayerThree * s)
                return new TerrorReading(TerrorLayer.Three, BpmThree);
            if (distance <= LayerTwo * s)
                return new TerrorReading(TerrorLayer.Two, BpmTwo);
            if (distance <= LayerOne * s)
                return new TerrorReading(TerrorLayer.One, BpmOne);
            return new TerrorReading(TerrorLayer.Silent, 0f);
        }
    }
}
