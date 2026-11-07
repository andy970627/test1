namespace Odyssey.Core
{
    /// <summary>手勢提示（少用文字設計第 3 節 A）：第一人稱雙手在沒有真的做動作時擺出的姿勢。</summary>
    public enum Gesture { None, Sling, PushReady, OfferStone, ReachGap, ReachOut }

    /// <summary>鍵帽圖示：空白鍵與滑鼠用形狀，E／F 用字母。</summary>
    public enum CueKey { None, Space, MouseLeft, MouseRight, E, F }

    /// <summary>
    /// 鍵帽要不要畫（少用文字設計第 8.4 節的決定 D）：
    /// 詩句風格不畫（文字那一行自己有按鍵）；鍵帽風格每次都畫（直到提示追蹤器收起）；
    /// 無字風格只在這種提示第一次出現時畫，之後只剩手勢。
    /// </summary>
    public static class GuideCues
    {
        public static bool ShowCap(GuideStyle style, int timesShownBefore) => style switch
        {
            GuideStyle.Verse => false,
            GuideStyle.Plain => true,
            _ => timesShownBefore == 0,
        };

        /// <summary>文字那一行（必要引導、物體提示）只有詩句風格才畫。</summary>
        public static bool ShowText(GuideStyle style) => style == GuideStyle.Verse;

        /// <summary>必要引導每一步對應的手勢與按鍵；step 還沒到出現條件時（visible＝false）沒有手勢。</summary>
        public static (Gesture Gesture, CueKey Key) Essential(EssentialStep step, bool visible)
        {
            if (!visible)
                return (Gesture.None, CueKey.None);
            return step switch
            {
                EssentialStep.Sound => (Gesture.Sling, CueKey.Space),
                EssentialStep.Push => (Gesture.PushReady, CueKey.E),
                EssentialStep.Wedge => (Gesture.OfferStone, CueKey.MouseRight),
                EssentialStep.Escape => (Gesture.ReachGap, CueKey.E),
                _ => (Gesture.None, CueKey.None),
            };
        }

        /// <summary>必要引導每一步算哪一種提示（給「第一次出現」計數用）。</summary>
        public static PromptKind PromptOf(EssentialStep step) => step switch
        {
            EssentialStep.Sound => PromptKind.Clap,
            EssentialStep.Push => PromptKind.Push,
            EssentialStep.Wedge => PromptKind.Wedge,
            _ => PromptKind.Escape,
        };

        /// <summary>物體提示的按鍵。</summary>
        public static CueKey KeyOf(PromptKind kind) => kind switch
        {
            PromptKind.TakeStake => CueKey.E,
            PromptKind.Recruit => CueKey.E,
            PromptKind.Crouch => CueKey.F,
            PromptKind.Push => CueKey.E,
            PromptKind.Escape => CueKey.E,
            PromptKind.Wedge => CueKey.MouseRight,
            PromptKind.Clap => CueKey.Space,
            PromptKind.Shoot => CueKey.MouseLeft,
            _ => CueKey.None,
        };

        /// <summary>同伴示範：夜晚開始後幾秒、身後多遠彈一聲，證明「聲音就是光」。</summary>
        public const float DemoDelaySeconds = 2f;
        public const float DemoBehindMeters = 1.2f;

        /// <summary>這一聲是不是玩家自己的（示範的聲音在身後，不算玩家做到了第 1 步）。</summary>
        public static bool IsOwnSound(float distanceFromPlayer) => distanceFromPlayer < 0.6f;
    }
}
