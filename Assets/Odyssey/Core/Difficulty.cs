namespace Odyssey.Core
{
    public enum DifficultyLevel { Familiar, Normal, Hard }

    /// <summary>
    /// 三段難度（規格第 18 節）：只調巨人的移動速度與聽覺半徑。熟悉讓玩家先熟悉操作；困難的巨人聽得比你看得遠。
    /// </summary>
    public static class Difficulty
    {
        public static float SpeedMultiplier(DifficultyLevel level) => level switch
        {
            DifficultyLevel.Familiar => 0.7f,
            DifficultyLevel.Hard => 1.2f,
            _ => 1f,
        };

        public static float HearingMultiplier(DifficultyLevel level) => level switch
        {
            DifficultyLevel.Familiar => 0.6f,
            DifficultyLevel.Hard => 1.3f,
            _ => 1f,
        };

        public static string Name(DifficultyLevel level) => level switch
        {
            DifficultyLevel.Familiar => "熟悉",
            DifficultyLevel.Hard => "困難",
            _ => "普通",
        };

        public static string Blurb(DifficultyLevel level) => level switch
        {
            DifficultyLevel.Familiar => "巨人走得慢、聽得近，適合先熟悉操作",
            DifficultyLevel.Hard => "巨人走得快，聽得比你看得遠",
            _ => "巨人照原本的速度與聽覺",
        };
    }
}
