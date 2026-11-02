namespace Odyssey.Core
{
    public enum EssentialStep { Sound, Push, Wedge, Escape, Done }

    /// <summary>
    /// 必要引導鏈（規格第 26 節 A）：製造聲音 → 推巨石 → 塞楔子 → 鑽出去，畫面上一次只有一行，做到才換下一步。
    /// 每一步有「出現條件」（例如站到巨石前），條件比輪到它更早成立也會記下，輪到時立刻顯示；
    /// 已經提早做到的步驟輪到時直接跳過。非必要的玩法不在這裡，讓玩家自己探索。整場只走一次。
    /// </summary>
    public sealed class EssentialGuide
    {
        bool lit, atBoulder, pushed, slipped, wedged, atOpenGap, escaped;

        public EssentialStep Step { get; private set; } = EssentialStep.Sound;
        public bool Done => Step == EssentialStep.Done;

        /// <summary>現在要顯示的那一行；還沒到出現條件或全部完成時是 null。</summary>
        public string Text => Step switch
        {
            EssentialStep.Sound => "空白鍵 彈・按住 拉弓射石",
            EssentialStep.Push when atBoulder => "E 推",
            EssentialStep.Wedge when slipped => "右鍵 塞石子當楔子",
            EssentialStep.Escape when atOpenGap => "E 鑽出去",
            _ => null,
        };

        /// <summary>現在這一步的吟遊詩人兩行詩；<see cref="Text"/> 是 null 時也是 null。</summary>
        public (string, string)? Verse
        {
            get
            {
                if (Text == null)
                    return null;
                var v = VerseBook.Essential(Step);
                return v == null ? ((string, string)?)null : (v.Value.Item1, v.Value.Item2);
            }
        }

        public void OnLit() => Set(ref lit);
        public void OnAtBoulder() => Set(ref atBoulder);
        public void OnPushed() => Set(ref pushed);
        public void OnSlip() => Set(ref slipped);
        public void OnWedged() => Set(ref wedged);
        public void OnAtOpenGap() => Set(ref atOpenGap);
        public void OnEscaped() => Set(ref escaped);

        void Set(ref bool flag)
        {
            flag = true;
            Advance();
        }

        void Advance()
        {
            while (Step != EssentialStep.Done && Completed(Step))
                Step++;
        }

        bool Completed(EssentialStep step) => step switch
        {
            EssentialStep.Sound => lit,
            EssentialStep.Push => pushed,
            EssentialStep.Wedge => wedged,
            EssentialStep.Escape => escaped,
            _ => true,
        };
    }
}
