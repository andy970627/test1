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
    /// 畫面分區定義（規格第 26 節 C）：每個介面只在自己的保護區塊內，彼此不重疊；
    /// 世界內物體提示落入保護區時會被推出。
    /// </summary>
    public static class HudZones
    {
        // 各獨立 UI 區塊定義（x, y, w, h，以 0..1 歸一化螢幕坐標）
        public static readonly HudRect DebugZone = new(0f, 0f, 0.30f, 0.55f);
        public static readonly HudRect HintZone = new(0.31f, 0.08f, 0.38f, 0.10f);
        public static readonly HudRect ToastZone = new(0.70f, 0f, 0.30f, 0.18f);
        public static readonly HudRect PushBarZone = new(0.35f, 0.58f, 0.30f, 0.08f);
        public static readonly HudRect EssentialZone = new(0.25f, 0.68f, 0.50f, 0.08f);
        public static readonly HudRect StaminaZone = new(0f, 0.82f, 0.22f, 0.16f);
        public static readonly HudRect StonesZone = new(0.75f, 0.82f, 0.25f, 0.16f);

        public static readonly HudRect[] ProtectedZones =
        {
            DebugZone,
            HintZone,
            ToastZone,
            PushBarZone,
            EssentialZone,
            StaminaZone,
            StonesZone
        };

        /// <summary>
        /// 檢查物體提示的矩形是否與任何受保護區塊相交。
        /// </summary>
        public static bool IntersectsAny(HudRect rect)
        {
            for (int i = 0; i < ProtectedZones.Length; i++)
            {
                if (rect.Intersects(ProtectedZones[i]))
                    return true;
            }
            return false;
        }

        /// <summary>
        /// 若候選提示位置與任何保護區相交，將其向垂直方向推開至最近的未佔用空間。
        /// </summary>
        public static HudRect PushOut(HudRect candidate)
        {
            HudRect current = candidate;
            for (int i = 0; i < ProtectedZones.Length; i++)
            {
                HudRect zone = ProtectedZones[i];
                if (current.Intersects(zone))
                {
                    // 若靠上方重疊則往下推，若靠下方則往上推
                    if (current.Top < zone.Top + zone.Height * 0.5f)
                    {
                        float newY = zone.Top - current.Height - 0.01f;
                        if (newY >= 0f)
                            current = new HudRect(current.X, newY, current.Width, current.Height);
                        else
                            current = new HudRect(current.X, zone.Bottom + 0.01f, current.Width, current.Height);
                    }
                    else
                    {
                        float newY = zone.Bottom + 0.01f;
                        if (newY + current.Height <= 1f)
                            current = new HudRect(current.X, newY, current.Width, current.Height);
                        else
                            current = new HudRect(current.X, zone.Top - current.Height - 0.01f, current.Width, current.Height);
                    }
                }
            }
            return current;
        }
    }
}
