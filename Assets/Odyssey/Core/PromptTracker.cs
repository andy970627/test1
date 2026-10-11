namespace Odyssey.Core
{
    /// <summary>遊戲內提示的種類（規格第 15 節 C）。</summary>
    public enum PromptKind { Push, Wedge, PlantStake, Escape, TakeStake, DropStake, Recruit, Crouch, Throw, Move, Clap }

    /// <summary>
    /// 決定提示還要不要出現：同一種提示用過 3 次就不再出現（整場遊戲）；「鑽出去」永遠出現；
    /// 「走路」與「拍手」只在每夜開始時提示，用過一次這一夜就收起來，用滿 3 夜後不再出現。
    /// </summary>
    public sealed class PromptTracker
    {
        public const int UsesToRetire = 3;

        readonly int[] uses = new int[System.Enum.GetValues(typeof(PromptKind)).Length];
        readonly bool[] usedTonight = new bool[System.Enum.GetValues(typeof(PromptKind)).Length];

        public bool ShouldShow(PromptKind kind)
        {
            if (kind == PromptKind.Escape)
                return true;
            if (PerNight(kind) && usedTonight[(int)kind])
                return false;
            return uses[(int)kind] < UsesToRetire;
        }

        public void Used(PromptKind kind)
        {
            int i = (int)kind;
            if (PerNight(kind))
            {
                if (usedTonight[i])
                    return;
                usedTonight[i] = true;
            }
            uses[i]++;
        }

        public void NewNight()
        {
            for (int i = 0; i < usedTonight.Length; i++)
                usedTonight[i] = false;
        }

        static bool PerNight(PromptKind kind) => kind == PromptKind.Move || kind == PromptKind.Clap;
    }
}
