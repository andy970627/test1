namespace Odyssey.Core
{
    /// <summary>被抓原因的中文說明：顯示在被抓畫面與 F1 的死亡紀錄。</summary>
    public static class FailReasonText
    {
        public static string Describe(FailReason reason) => reason switch
        {
            FailReason.Touched => "巨人循著聲音摸到了你",
            FailReason.Bumped => "你撞上了巨人",
            FailReason.Dawn => "天亮了，巨人把石頭推了回去",
            FailReason.Crushed => "巨人朝聲音扔來的岩石砸中了你",
            _ => "",
        };
    }
}
