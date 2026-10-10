namespace Odyssey.Core
{
    /// <summary>玩家在羊肚下貼向的一側，也是巨人的手摸下來的一側。</summary>
    public enum Side { Left, Right }

    /// <summary>一輪結束（被抓）的原因。</summary>
    public enum FailReason
    {
        None,
        Touched,    // 被巨人的手摸到
        Fell,       // 握力耗盡，從羊肚下摔下
        Gasped,     // 喘出聲被聽到
        FlockGone,  // 羊全部出洞，沒抱上任何一隻
        Swept,      // 選羊時被往聲音掃來的手碰到
        Bumped,     // 撞上巨人
        Dawn,       // 天亮，巨人把巨石推回原位
    }
}
