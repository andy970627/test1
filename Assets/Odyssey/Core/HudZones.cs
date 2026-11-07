using System;

namespace Odyssey.Core
{
    /// <summary>
    /// HUD 區域矩形（相對於螢幕寬高 0..1）。
    /// </summary>
    public readonly struct HudRect
    {
        public readonly float X;
        public readonly float Y;
        public readonly float Width;
        public readonly float Height;

        public float Left => X;
        public float Right => X + Width;
        public float Top => Y;
        public float Bottom => Y + Height;

        public HudRect(float x, float y, float width, float height)
        {
            X = x;
            Y = y;
            Width = width;
            Height = height;
        }

        public bool Intersects(HudRect other) =>
            Left < other.Right - 1e-4f && Right > other.Left + 1e-4f && Top < other.Bottom - 1e-4f && Bottom > other.Top + 1e-4f;
    }

    /// <summary>
    /// 畫面分區（規格第 26 節 C）：每個介面只在自己的保護區塊內，彼此不重疊；
    /// 世界內的物體提示（WorldPrompts）落進保護區時，用 PushOut 往上或往下推到最近的空位。
    /// 數值要跟實際畫的位置一致（0..1，左上為原點），改介面位置時一起改。
    /// </summary>
    public static class HudZones
    {
        const float Margin = 0.01f;

        /// <summary>F1 除錯面板：左上，寬不超過 28%、高不超過 55%（DebugPanel）。只在面板開著時保護。</summary>
        public static readonly HudRect DebugZone = new(0f, 0f, 0.30f, 0.55f);
        /// <summary>情境提示與詩句：上方中央兩行（SituationHints，y 0.10～0.12 起）。</summary>
        public static readonly HudRect HintZone = new(0.31f, 0.08f, 0.38f, 0.13f);
        /// <summary>巨石進度條：中央 y 0.6（BlindGameLoop.DrawPushBar）。</summary>
        public static readonly HudRect PushBarZone = new(0.38f, 0.585f, 0.24f, 0.04f);
        /// <summary>「紀事多了一則（Tab）」：右側 y 0.62（GameMenus）。</summary>
        public static readonly HudRect ToastZone = new(0.79f, 0.59f, 0.21f, 0.07f);
        /// <summary>必要引導：下方中央一行，或兩行詩加按鍵小字（WorldPrompts，y 0.64～0.76）。</summary>
        public static readonly HudRect EssentialZone = new(0.2f, 0.63f, 0.58f, 0.14f);
        /// <summary>體力條：左下（BlindGameLoop.DrawStamina）。</summary>
        public static readonly HudRect StaminaZone = new(0f, 0.85f, 0.16f, 0.12f);
        /// <summary>石子：右下（BlindGameLoop.DrawStones）。</summary>
        public static readonly HudRect StonesZone = new(0.8f, 0.85f, 0.2f, 0.12f);

        public static readonly HudRect[] ProtectedZones =
        {
            DebugZone,
            HintZone,
            PushBarZone,
            ToastZone,
            EssentialZone,
            StaminaZone,
            StonesZone,
        };

        static bool Active(int i, bool debugVisible) => debugVisible || i != 0;

        /// <summary>候選矩形是否和任何（啟用中的）保護區相交。</summary>
        public static bool IntersectsAny(HudRect rect, bool debugVisible = true)
        {
            for (int i = 0; i < ProtectedZones.Length; i++)
                if (Active(i, debugVisible) && rect.Intersects(ProtectedZones[i]))
                    return true;
            return false;
        }

        /// <summary>
        /// 把候選矩形上下移到離原位最近、不碰任何保護區、也不出畫面的位置（只改 Y）。
        /// 候選位置是原位，以及每個保護區的正上方、正下方；全都不行時退回夾在畫面內的原位。
        /// </summary>
        public static HudRect PushOut(HudRect candidate, bool debugVisible = true)
        {
            float maxY = Math.Max(0f, 1f - candidate.Height);
            float startY = Math.Clamp(candidate.Y, 0f, maxY);
            HudRect At(float y) => new(candidate.X, y, candidate.Width, candidate.Height);

            if (!IntersectsAny(At(startY), debugVisible))
                return At(startY);

            float bestY = startY, bestMove = float.MaxValue;
            for (int i = 0; i < ProtectedZones.Length; i++)
            {
                if (!Active(i, debugVisible))
                    continue;
                HudRect zone = ProtectedZones[i];
                foreach (float y in new[] { zone.Top - candidate.Height - Margin, zone.Bottom + Margin })
                {
                    if (y < 0f || y > maxY)
                        continue;
                    float move = Math.Abs(y - candidate.Y);
                    if (move < bestMove && !IntersectsAny(At(y), debugVisible))
                    {
                        bestMove = move;
                        bestY = y;
                    }
                }
            }
            return At(bestY);
        }
    }
}
