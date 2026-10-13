namespace Odyssey.Core
{
    /// <summary>被抓原因的中文說明：顯示在被抓畫面與 F1 的死亡紀錄。</summary>
    public static class FailReasonText
    {
        public static string Describe(FailReason reason) => reason switch
        {
            FailReason.Touched => "巨人循聲而來，摸到了奧德修斯",
            FailReason.Bumped => "奧德修斯撞上了巨人",
            FailReason.Dawn => "天亮了，巨人把巨石推回原處",
            FailReason.Crushed => "巨人朝聲音擲出的岩石，砸中了奧德修斯",
            _ => "",
        };
    }
}
