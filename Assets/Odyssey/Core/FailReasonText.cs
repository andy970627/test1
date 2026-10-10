namespace Odyssey.Core
{
    /// <summary>被抓原因的中文說明：顯示在被抓畫面與 F1 的死亡紀錄。</summary>
    public static class FailReasonText
    {
        public static string Describe(FailReason reason) => reason switch
        {
            FailReason.Touched => "巨人的手摸到了你",
            FailReason.Fell => "握不住羊毛，從羊肚下摔了下來",
            FailReason.Gasped => "喘出聲，被巨人聽見了",
            FailReason.FlockGone => "羊全走光了，你還留在洞裡",
            FailReason.Swept => "巨人循著聲音伸手，抓到了你",
            FailReason.Bumped => "你撞上了巨人",
            FailReason.Dawn => "天亮了，巨人把石頭推了回去",
            _ => "",
        };
    }
}
