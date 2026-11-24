namespace Odyssey.Core
{
    public enum PassiveLight { Off, Dim, Full }

    /// <summary>引導文字風格：詩句或簡潔。</summary>
    public enum GuideStyle { Verse, Plain }

    /// <summary>恐懼半徑模式：分層（新）、舊版心跳、關閉。</summary>
    public enum TerrorMode { Layered, Legacy, Off }

    /// <summary>
    /// 主選單「實驗」頁的設計開關（規格第 28 節）：讓使用者在遊戲裡直接切換、多玩幾次比較，不用改程式。
    /// 預設值就是目前的設計；CSV 每一列記下當時的開關。
    /// </summary>
    public sealed class DesignFlags
    {
        public const float DimRadius = 0.3f;
        public const float DimBrightness = 0.5f;

        /// <summary>被動聲音（巨人、羊叫、同伴嗚咽、腳步）要不要照亮。</summary>
        public PassiveLight Passive { get; set; } = PassiveLight.Off;

        /// <summary>必要引導（製造聲音 → 推 → 塞楔子 → 鑽出去）要不要顯示。</summary>
        public bool EssentialGuide { get; set; } = true;

        /// <summary>宙斯法則（箭與雷的規則）開關。</summary>
        public bool ZeusLaw { get; set; } = true;

        /// <summary>引導文字風格。</summary>
        public GuideStyle Guide { get; set; } = GuideStyle.Verse;

        /// <summary>恐懼半徑模式；舊版沿用 Heartbeat。</summary>
        public TerrorMode Terror { get; set; } = TerrorMode.Layered;

        /// <summary>聲音提示：畫面標出海風與巨人方向、對準音，不戴耳機也能玩；預設關。</summary>
        public bool CueAssist { get; set; }

        public static bool IsPassive(SoundKind kind) =>
            kind is SoundKind.Cyclops or SoundKind.Bleat or SoundKind.Whimper or SoundKind.Step or SoundKind.Run;

        /// <summary>這個聲音照亮的半徑倍率與亮度；0 表示不照亮。主動的聲音一律 1。</summary>
        public (float Radius, float Brightness) LightFor(SoundKind kind)
        {
            if (SoundRules.Lights(kind))
                return (1f, 1f);
            if (!IsPassive(kind))
                return (0f, 0f);
            return Passive switch
            {
                PassiveLight.Dim => (DimRadius, DimBrightness),
                PassiveLight.Full => (1f, 1f),
                _ => (0f, 0f),
            };
        }

        public static string Name(PassiveLight p) => p switch
        {
            PassiveLight.Dim => "微光",
            PassiveLight.Full => "全亮",
            _ => "關",
        };

        public static string Name(bool on) => on ? "開" : "關";

        public static string Name(GuideStyle g) => g == GuideStyle.Plain ? "簡潔" : "詩句";

        public static string Name(TerrorMode t) => t switch
        {
            TerrorMode.Legacy => "舊版",
            TerrorMode.Off => "關",
            _ => "分層",
        };

        /// <summary>寫進 CSV 的開關摘要。</summary>
        public string Summary => $"passive={Passive};guide={(EssentialGuide ? "On" : "Off")};zeus={(ZeusLaw ? "On" : "Off")};style={Guide};terror={Terror};cues={(CueAssist ? "On" : "Off")}";
    }
}
