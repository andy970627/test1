using TMPro;
using UnityEngine;

/// <summary>TMP 與 OnGUI 預設字型都沒有中文字形。優先用內建的思源黑體（網頁版沒有系統字型），載不到才改用系統中文字型。</summary>
public static class OdysseyFonts
{
    const string BundledPath = "Fonts/NotoSansTC-Regular";
    static readonly string[] Families = { "Microsoft JhengHei", "Microsoft YaHei", "PingFang TC", "Noto Sans CJK TC", "Noto Sans TC" };
    static Font s_Gui;
    static bool s_GuiLoaded;
    static TMP_FontAsset s_Cjk;

    /// <summary>內建的思源黑體；載不到時是 null，OnGUI 就沿用預設字型。</summary>
    public static Font Gui
    {
        get
        {
            if (!s_GuiLoaded)
            {
                s_GuiLoaded = true;
                s_Gui = Resources.Load<Font>(BundledPath);
                if (s_Gui == null)
                    Debug.LogWarning($"OdysseyFonts: 找不到 Resources/{BundledPath}，改用系統字型。");
            }
            return s_Gui;
        }
    }

    public static TMP_FontAsset Cjk
    {
        get
        {
            if (s_Cjk == null)
            {
                if (Gui != null)
                    s_Cjk = TMP_FontAsset.CreateFontAsset(Gui);
                if (s_Cjk == null)
                {
                    foreach (string family in Families)
                    {
                        s_Cjk = TMP_FontAsset.CreateFontAsset(family, "Regular");
                        if (s_Cjk != null)
                            break;
                    }
                }
                if (s_Cjk == null)
                    Debug.LogWarning("OdysseyFonts: 找不到中文字型，中文會顯示成方塊。");
            }
            return s_Cjk;
        }
    }

    // ── IMGUI 標題字（設計系統「銘文」角色）──────────────────────
    // 源流明體 TC（OFL 1.1），只保留遊戲用到的字（docs/design/2026-11-04-typography-analysis.md）。
    // 新增文字若含新字，要重新子集化，否則那個字會改用系統字型顯示。
    static Font s_Inscription, s_InscriptionHeavy;

    /// <summary>標題：選單標題、紀事標題、第 N 夜。源流明體 Bold。</summary>
    public static Font Inscription => s_Inscription ??= LoadTitle("Fonts/GenRyuMinTC-B-Odyssey");

    /// <summary>死亡卡「葬 身 洞 中」。源流明體 Heavy。</summary>
    public static Font InscriptionHeavy => s_InscriptionHeavy ??= LoadTitle("Fonts/GenRyuMinTC-H-Odyssey");

    static Font LoadTitle(string path)
    {
        var font = Resources.Load<Font>(path);
        if (font == null)
            Debug.LogWarning($"OdysseyFonts: 找不到 {path}，標題改用預設字型。");
        return font;
    }

    /// <summary>每個 OnGUI 開頭呼叫：讓 GUI.skin 的所有樣式用中文字型。</summary>
    public static void UseForGui()
    {
        if (Gui != null && GUI.skin.font != s_Gui)
            GUI.skin.font = s_Gui;
    }
}
