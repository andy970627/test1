using TMPro;
using UnityEngine;

/// <summary>TMP 預設字型沒有中文字形，執行時改用系統中文字型。</summary>
public static class OdysseyFonts
{
    static readonly string[] Families = { "Microsoft JhengHei", "Microsoft YaHei", "PingFang TC", "Noto Sans CJK TC", "Noto Sans TC" };
    static TMP_FontAsset s_Cjk;

    public static TMP_FontAsset Cjk
    {
        get
        {
            if (s_Cjk == null)
            {
                foreach (string family in Families)
                {
                    s_Cjk = TMP_FontAsset.CreateFontAsset(family, "Regular");
                    if (s_Cjk != null)
                        break;
                }
                if (s_Cjk == null)
                    Debug.LogWarning("OdysseyFonts: 找不到系統中文字型，中文會顯示成方塊。");
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
}
