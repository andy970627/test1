namespace Odyssey.Core
{
    /// <summary>一夜結束（被抓）的原因。</summary>
    public enum FailReason
    {
        None,
        Touched,    // 巨人循著聲音摸到
        Bumped,     // 撞上巨人
        Dawn,       // 天亮，巨人把巨石推回原位
    }
}
