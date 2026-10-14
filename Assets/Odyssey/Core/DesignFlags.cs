namespace Odyssey.Core
{
    public enum PassiveLight { Off, Dim, Full }

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

        /// <summary>寫進 CSV 的開關摘要。</summary>
        public string Summary => $"passive={Passive};guide={(EssentialGuide ? "On" : "Off")}";
    }
}
