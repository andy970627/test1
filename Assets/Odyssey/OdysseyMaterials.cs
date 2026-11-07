using UnityEngine;

/// <summary>
/// 以 URP Lit 材質為底，產生佔位用的純色 / 自發光材質。
/// 底材質是 Resources/OdysseyLit.mat（開著 _EMISSION、自發光為黑）：專案裡沒有其他材質檔，
/// 打包時 URP Lit 著色器與它的自發光變體會被剔除，所有這種材質在網頁版變成粉紅色；
/// 放一個真的材質在 Resources 裡，打包一定會帶上它們。找不到時才退回方塊的預設材質（編輯器裡也能用）。
/// </summary>
public static class OdysseyMaterials
{
    static Material s_Base;

    public static Material Create(Color color, Color? emission = null)
    {
        if (s_Base == null)
            s_Base = Resources.Load<Material>("OdysseyLit");
        if (s_Base == null)
        {
            var probe = GameObject.CreatePrimitive(PrimitiveType.Cube);
            s_Base = probe.GetComponent<Renderer>().sharedMaterial;
            Object.Destroy(probe);
        }

        var mat = new Material(s_Base);
        mat.SetColor("_BaseColor", color);
        mat.SetFloat("_Smoothness", 0.2f);
        if (emission.HasValue)
            SetEmission(mat, emission.Value);
        return mat;
    }

    public static void SetEmission(Material mat, Color emission)
    {
        mat.EnableKeyword("_EMISSION");
        mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
        mat.SetColor("_EmissionColor", emission);
    }
}
