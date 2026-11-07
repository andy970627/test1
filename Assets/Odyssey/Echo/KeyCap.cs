using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 鍵帽圖示（少用文字設計第 8.4 節）：暖白線條的圓角方塊。空白鍵畫成長條、滑鼠畫成左右兩半的輪廓（亮起那一半），
/// 只有 E 與 F 真的放一個字母。貼圖在第一次用到時用距離場算出來，之後重用。
/// </summary>
public static class KeyCap
{
    const int Px = 64;
    static Texture2D cap, bar, mouseLeft, mouseRight;
    static GUIStyle letter;

    public static void Draw(Vector2 center, CueKey key, float size, float alpha)
    {
        if (key == CueKey.None || alpha <= 0.001f)
            return;
        Color old = GUI.color;
        Color line = OdysseyPalette.Parchment;
        GUI.color = new Color(line.r, line.g, line.b, alpha);
        switch (key)
        {
            case CueKey.Space:
                GUI.DrawTexture(Rect(center, size * 2.2f, size * 0.75f), bar ??= RoundedRect(Px * 3, Px, 0.3f, 0.12f));
                break;
            case CueKey.MouseLeft:
                GUI.DrawTexture(Rect(center, size * 0.8f, size * 1.2f), mouseLeft ??= Mouse(true));
                break;
            case CueKey.MouseRight:
                GUI.DrawTexture(Rect(center, size * 0.8f, size * 1.2f), mouseRight ??= Mouse(false));
                break;
            default:
                GUI.DrawTexture(Rect(center, size, size), cap ??= RoundedRect(Px, Px, 0.22f, 0.1f));
                int fontSize = Mathf.RoundToInt(size * 0.6f);
                if (letter == null || letter.fontSize != fontSize)
                    letter = new GUIStyle(GUI.skin.label) { fontSize = fontSize, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
                letter.normal.textColor = GUI.color;
                GUI.Label(Rect(center, size, size), key.ToString(), letter);
                break;
        }
        GUI.color = old;
    }

    static Rect Rect(Vector2 center, float w, float h) => new(center.x - w / 2f, center.y - h / 2f, w, h);

    /// <summary>空心圓角方塊：radius、stroke 都是相對短邊的比例。</summary>
    static Texture2D RoundedRect(int w, int h, float radius, float stroke)
    {
        var tex = new Texture2D(w, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
        var px = new Color32[w * h];
        float r = radius * Mathf.Min(w, h), s = stroke * Mathf.Min(w, h), pad = 2f;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                float d = RoundedBoxDistance(x + 0.5f, y + 0.5f, pad, pad, w - pad, h - pad, r);
                float a = Mathf.Clamp01(1f - Mathf.Abs(d + s / 2f) / (s / 2f) + 0.5f);
                px[y * w + x] = new Color32(255, 255, 255, (byte)(255 * a));
            }
        tex.SetPixels32(px);
        tex.Apply();
        return tex;
    }

    /// <summary>滑鼠輪廓：圓角長方形、中線一刀，left 時左半填滿，否則右半填滿。</summary>
    static Texture2D Mouse(bool left)
    {
        int w = Px, h = (int)(Px * 1.5f);
        var tex = new Texture2D(w, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
        var px = new Color32[w * h];
        float r = 0.45f * w, s = 0.1f * w, pad = 2f;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                float cx = x + 0.5f, cy = y + 0.5f;
                float d = RoundedBoxDistance(cx, cy, pad, pad, w - pad, h - pad, r);
                float outline = Mathf.Clamp01(1f - Mathf.Abs(d + s / 2f) / (s / 2f) + 0.5f);
                // 上半部（按鍵區）中線與填滿：貼圖 y 向上，所以按鍵區是 y 大的那一半。
                bool upper = cy > h * 0.5f;
                float divider = upper && Mathf.Abs(cx - w / 2f) < s / 2f ? 1f : 0f;
                float fill = 0f;
                if (upper && d < -s && (left ? cx < w / 2f : cx > w / 2f))
                    fill = 0.55f;
                float a = Mathf.Max(outline, Mathf.Max(divider, fill));
                px[y * w + x] = new Color32(255, 255, 255, (byte)(255 * a));
            }
        tex.SetPixels32(px);
        tex.Apply();
        return tex;
    }

    /// <summary>點到圓角矩形邊的帶號距離（外正內負）。</summary>
    static float RoundedBoxDistance(float x, float y, float x0, float y0, float x1, float y1, float r)
    {
        float hx = (x1 - x0) / 2f - r, hy = (y1 - y0) / 2f - r;
        float cx = (x0 + x1) / 2f, cy = (y0 + y1) / 2f;
        float qx = Mathf.Abs(x - cx) - hx, qy = Mathf.Abs(y - cy) - hy;
        float outside = Mathf.Sqrt(Mathf.Max(qx, 0f) * Mathf.Max(qx, 0f) + Mathf.Max(qy, 0f) * Mathf.Max(qy, 0f));
        float inside = Mathf.Min(Mathf.Max(qx, qy), 0f);
        return outside + inside - r;
    }
}
