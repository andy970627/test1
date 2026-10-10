using UnityEngine;

/// <summary>以 URP 預設 Lit 材質為底，產生佔位用的純色 / 自發光材質。</summary>
public static class OdysseyMaterials
{
    static Material s_Base;

    public static Material Create(Color color, Color? emission = null)
    {
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
