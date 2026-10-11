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
}
