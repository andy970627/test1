using System.Collections.Generic;
using UnityEngine;

/// <summary>回聲材質；同一種顏色只建一份，重開一夜時不會一直產生新材質。</summary>
public static class EchoMaterials
{
    static readonly Dictionary<Color, Material> cache = new();
    static Shader s_Shader;

    public static Material Create(Color baseColor)
    {
        if (cache.TryGetValue(baseColor, out var cached) && cached != null)
            return cached;
        if (s_Shader == null)
            s_Shader = Shader.Find("Odyssey/Echo");
        Material mat;
        if (s_Shader == null)
        {
            Debug.LogWarning("EchoMaterials: 找不到 Odyssey/Echo 著色器，改用一般材質。");
            mat = OdysseyMaterials.Create(baseColor);
        }
        else
        {
            mat = new Material(s_Shader) { name = "Echo" };
            mat.SetColor("_BaseColor", baseColor);
        }
        cache[baseColor] = mat;
        return mat;
    }
}
