using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 封住洞口的巨石：推開時往 +X 滑，左邊露出一道縫，縫裡透出天光；塞進縫的楔子看得見。
/// 縫後面有一道看不見的牆，只能在推開後對著縫按 E 鑽出去。
/// </summary>
public class Boulder : MonoBehaviour
{
    public const float Width = 6.0f;
    public const float Height = 3.6f;
    public const float Depth = 1.8f;
    readonly List<Transform> wedgeMarks = new();

    // 赭黃巨石配三道亮色刻痕，和灰褐岩壁 (0.28, 0.25, 0.22) 一眼分得出來。
    static readonly Color StoneColor = new(0.62f, 0.48f, 0.3f);
    static readonly Color GrooveColor = new(0.85f, 0.75f, 0.55f);
    const float GrooveHeight = 0.08f;
    const float GrooveDepth = 0.05f;

    static readonly Color NightGlow = new(0.05f, 0.08f, 0.25f);
    static readonly Color DawnGlow = new(0.7f, 0.7f, 0.65f);

    Transform body;
    Transform gapLight;
    Material gapMaterial;
    Vector3 center;
    float slide;

    /// <summary>會滑動的那塊石頭本體（BoulderFeel 用來加晃動）。</summary>
    public Transform Body => body;

    /// <summary>巨石還沒推開時的底面中心（地面上）。</summary>
    public Vector3 BaseCenter => center - new Vector3(0f, Height / 2f, 0f);

    /// <summary>巨石朝洞內那一面的中心（離地 1 m）。</summary>
    public Vector3 PushPoint => center + new Vector3(slide, 1f - Height / 2f, -Depth / 2f);

    /// <summary>縫的中心（離地 1 m）。</summary>
    public Vector3 GapPoint => center + new Vector3(-Width / 2f + slide / 2f, 1f - Height / 2f, -Depth / 2f);

    /// <summary>center：巨石底面中心（地面上）。</summary>
    public void Init(Vector3 groundCenter)
    {
        center = groundCenter + new Vector3(0f, Height / 2f, 0f);
        transform.position = center;

        var bodyGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
        bodyGo.name = "BoulderBody";
        body = bodyGo.transform;
        body.SetParent(transform, false);
        body.localScale = new Vector3(Width, Height, Depth);
        bodyGo.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(StoneColor);
        AddGrooves(body);

        var blocker = new GameObject("GapBlocker").AddComponent<BoxCollider>();
        blocker.transform.SetParent(transform, false);
        blocker.transform.localPosition = new Vector3(0f, 0f, Depth / 2f + 0.3f);
        blocker.size = new Vector3(Width + 4f, Height + 2f, 0.4f);

        var lightGo = GameObject.CreatePrimitive(PrimitiveType.Quad);
        lightGo.name = "GapLight";
        Destroy(lightGo.GetComponent<Collider>());
        gapLight = lightGo.transform;
        gapLight.SetParent(transform, false);
        gapMaterial = OdysseyMaterials.Create(Color.black, NightGlow);
        lightGo.GetComponent<Renderer>().sharedMaterial = gapMaterial;

        SetOpening(0f);
        SetDawn(0f);
    }

    /// <summary>推的那一面（朝洞內，−Z）三道橫向刻痕；掛在 body 底下跟著滑，沒有碰撞。</summary>
    static void AddGrooves(Transform body)
    {
        var material = EchoMaterials.Create(GrooveColor);
        for (int i = 0; i < 3; i++)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "Groove" + i;
            Destroy(go.GetComponent<Collider>());
            go.GetComponent<Renderer>().sharedMaterial = material;
            // body 的 localScale 是巨石尺寸，子物件用比例座標，世界尺寸換算回來。
            var t = go.transform;
            t.SetParent(body, false);
            float y = (i - 1) * 0.25f; // 高度的 −25%、0、+25%
            t.localPosition = new Vector3(0f, y, -0.5f - GrooveDepth / 2f / Depth);
            t.localScale = new Vector3(0.8f, GrooveHeight / Height, GrooveDepth / Depth);
        }
    }

    /// <summary>巨石往 +X 滑開 meters，縫的光跟著變寬。</summary>
    public void SetOpening(float meters)
    {
        slide = meters;
        body.localPosition = new Vector3(slide, 0f, 0f);
        float gap = Mathf.Max(slide, 0.01f);
        gapLight.localPosition = new Vector3(-Width / 2f + slide / 2f, 0f, Depth / 2f + 0.05f);
        gapLight.localScale = new Vector3(gap, Height, 1f);
        gapLight.gameObject.SetActive(slide > 0.005f);
    }

    /// <summary>開口為 opening 時，楔子塞在縫裡、貼著巨石左緣的地面位置。</summary>
    public Vector3 WedgePoint(float opening) =>
        center + new Vector3(-Width / 2f + opening - 0.08f, -Height / 2f, -Depth / 2f + 0.15f);

    /// <summary>在每顆石子楔子的位置顯示一塊灰色小石頭（木樁由 OliveStake 自己顯示）。</summary>
    public void ShowWedges(IReadOnlyList<float> stones)
    {
        while (wedgeMarks.Count < stones.Count)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "Wedge";
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(transform, false);
            go.transform.localScale = new Vector3(0.14f, 0.12f, 0.2f);
            go.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(new Color(0.6f, 0.6f, 0.58f));
            wedgeMarks.Add(go.transform);
        }
        for (int i = 0; i < wedgeMarks.Count; i++)
        {
            bool used = i < stones.Count;
            wedgeMarks[i].gameObject.SetActive(used);
            if (used)
                wedgeMarks[i].position = WedgePoint(stones[i]) + Vector3.up * 0.06f;
        }
    }

    /// <summary>fraction：0 = 入夜，1 = 天亮；縫裡的光從深藍漸變到灰白。</summary>
    public void SetDawn(float fraction)
    {
        OdysseyMaterials.SetEmission(gapMaterial, Color.Lerp(NightGlow, DawnGlow, Mathf.Clamp01(fraction)));
    }
}
