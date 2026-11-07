namespace Odyssey.Core
{
    /// <summary>吟遊詩人的詩句（`docs/game-text.md` 第 10 節），每首以「／」切成兩行；單行詩第二行為 null。</summary>
    public static class VerseBook
    {
        public static readonly (string, string) Opening1 = ("歌唱吧，繆斯，唱那足智多謀的人", "他走進了波塞頓之子的黑暗");
        public static readonly (string, string) Opening2 = ("宙斯守護著主人與客人", "這裡的主人，卻以客人為食");

        /// <summary>必要引導每一步的詩與按鍵；完成後（Done）回傳 null。</summary>
        public static (string, string, string)? Essential(EssentialStep step)
        {
            switch (step)
            {
                case EssentialStep.Sound:
                    return ("拉響你的彈弓，讓它替你出聲", "聲音到過的地方，黑暗便退開", "空白鍵 彈・按住 拉弓射石");
                case EssentialStep.Push:
                    return ("巨石封住來路，也封住歸途", "用你的肩，向黎明推去", "E 推・Shift＋E 猛推");
                case EssentialStep.Wedge:
                    return ("石頭會退回，像不肯放手的命運", "把小石塞進縫裡，讓它咬住", "右鍵 塞石子當楔子");
                case EssentialStep.Escape:
                    return ("縫已打開，海風在呼喚", "帶著還活著的人，走出去", "E 鑽出去");
                default:
                    return null;
            }
        }

        public static readonly (string, string) FirstStone = ("宙斯的法則，不從暗處出手", "先讓他聽見你，再舉起你的手");
        public static readonly (string, string) FairHit = ("他聽見了你，你才出手", "宙斯不會怪罪");
        public static readonly (string, string) Ambush = ("你從暗處出手", "雷霆記下了你的名字");
        public static readonly (string, string) CrewEaten = ("他吃了他的客人", "宙斯的法則，他早已踐踏");
        public static readonly (string, string) Prayer = ("他向父親波塞頓低語", "這時，他什麼都聽不見");
        public static readonly (string, string) ShoreShoot = ("宙斯看見了", null);
        public static readonly (string, string) Regained = ("灰眼的女神回過頭來", "月光又照在巨石邊上");
        public static readonly (string, string) EndingKept = ("你守住了宙斯的法則，灰眼的女神仍看著你", null);
        public static readonly (string, string) EndingTurned = ("雅典娜轉過了身", null);
        public static readonly (string, string) Horse = ("在特洛伊，你也從暗處出手", "木馬燒成了灰，你的手還在發抖");
    }
}
