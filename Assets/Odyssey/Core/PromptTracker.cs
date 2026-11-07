namespace Odyssey.Core
{
    /// <summary>遊戲內提示的種類（規格第 15 節 C）。</summary>
    public enum PromptKind { Push, Wedge, PlantStake, Escape, TakeStake, DropStake, Recruit, Crouch, Shoot, Move, Clap }

    /// <summary>
    /// 決定提示還要不要出現：同一種提示「看到後 2 秒內真的做到」3 次就不再出現（整場遊戲）；「鑽出去」永遠出現；
    /// 「走路」與「拍手」只在每夜開始時提示，用過一次這一夜就收起來，用滿 3 夜後不再出現。
    /// </summary>
    public sealed class PromptTracker
    {
        public const int UsesToRetire = 3;
        public const float ShownGrace = 2f;

        readonly int[] uses = new int[System.Enum.GetValues(typeof(PromptKind)).Length];
        readonly bool[] usedTonight = new bool[System.Enum.GetValues(typeof(PromptKind)).Length];
        readonly float[] lastShown = NeverShown();

        static float[] NeverShown()
        {
            var times = new float[System.Enum.GetValues(typeof(PromptKind)).Length];
            for (int i = 0; i < times.Length; i++)
                times[i] = float.NegativeInfinity;
            return times;
        }

        public bool ShouldShow(PromptKind kind)
        {
            if (kind == PromptKind.Escape)
                return true;
            if (PerNight(kind) && usedTonight[(int)kind])
                return false;
            return uses[(int)kind] < UsesToRetire;
        }

        /// <summary>這種提示在 time 時畫在畫面上。</summary>
        public void MarkShown(PromptKind kind, float time) => lastShown[(int)kind] = time;

        /// <summary>
        /// 玩家做了這個操作；提示 2 秒內出現過才算學會一次（沒看到提示就亂按到的不算）。
        /// 回傳這次是否剛好讓這種提示收起（學會了，播一聲小鈴）。
        /// </summary>
        public bool Used(PromptKind kind, float time)
        {
            int i = (int)kind;
            if (time - lastShown[i] > ShownGrace)
                return false;
            if (PerNight(kind))
            {
                if (usedTonight[i])
                    return false;
                usedTonight[i] = true;
            }
            uses[i]++;
            return kind != PromptKind.Escape && uses[i] == UsesToRetire;
        }

        public void NewNight()
        {
            for (int i = 0; i < usedTonight.Length; i++)
                usedTonight[i] = false;
        }

        static bool PerNight(PromptKind kind) => kind == PromptKind.Move || kind == PromptKind.Clap;
    }
}
