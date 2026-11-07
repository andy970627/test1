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
    static readonly Color StoneColor = OdysseyPalette.BoulderStone;
    static readonly Color GrooveColor = OdysseyPalette.BoulderGroove;
    const float GrooveHeight = 0.08f;
    const float GrooveDepth = 0.05f;

    static readonly Color NightGlow = OdysseyPalette.NightBar;
    static readonly Color DawnGlow = OdysseyPalette.DawnBar;
    static readonly Color MoonGlow = OdysseyPalette.MoonGlow;
    const float RimWidth = 0.06f;

    Transform body;
    Transform gapLight;
    Material rimMaterial;

    /// <summary>巨石外側擋人的隱形牆；箭會穿過它（Arrow.IgnoreAlways）。</summary>
    public Collider GapBlocker { get; private set; }
    float dawn;
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
        AddMegalithFacets(body);
        rimMaterial = OdysseyMaterials.Create(Color.black, MoonGlow);
        AddMoonRim(body, rimMaterial);

        var blocker = new GameObject("GapBlocker").AddComponent<BoxCollider>();
        GapBlocker = blocker;
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

    /// <summary>巨石兩側的粗糙風化切角（古希臘獨眼巨石建築風格 Cyclopean Masonry）。</summary>
    static void AddMegalithFacets(Transform body)
    {
        var stoneShade = EchoMaterials.Create(OdysseyPalette.BoulderShade);
        for (int x = -1; x <= 1; x += 2)
        {
            var pillar = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(pillar.GetComponent<Collider>());
            pillar.name = "PillarFacet" + x;
            pillar.transform.SetParent(body, false);
            pillar.transform.localPosition = new Vector3(x * 0.46f, 0f, -0.48f);
            pillar.transform.localScale = new Vector3(0.08f, 0.94f, 0.06f);
            pillar.transform.localRotation = Quaternion.Euler(0f, x * 25f, 0f);
            pillar.GetComponent<Renderer>().sharedMaterial = stoneShade;
        }
    }

    /// <summary>
    /// 巨石左右與上緣透出的一絲月光（規格第 19 節 C）：自發光，不用回聲也看得到，當作洞口的方向座標。
    /// 掛在 body 底下跟著滑，沒有碰撞。
    /// </summary>
    static void AddMoonRim(Transform body, Material material)
    {
        float w = RimWidth;
        Rim("RimLeft", new Vector3(-0.5f + w / 2f / Width, 0f, -0.5f), new Vector3(w / Width, 1f, 0.02f / Depth));
        Rim("RimRight", new Vector3(0.5f - w / 2f / Width, 0f, -0.5f), new Vector3(w / Width, 1f, 0.02f / Depth));
        Rim("RimTop", new Vector3(0f, 0.5f - w / 2f / Height, -0.5f), new Vector3(1f, w / Height, 0.02f / Depth));

        void Rim(string name, Vector3 localPos, Vector3 localScale)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            Destroy(go.GetComponent<Collider>());
            go.GetComponent<Renderer>().sharedMaterial = material;
            go.transform.SetParent(body, false);
            go.transform.localPosition = localPos + new Vector3(0f, 0f, -0.011f / Depth);
            go.transform.localScale = localScale;
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
        UpdateGapGlow();
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
            go.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(OdysseyPalette.Pebble);
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

    /// <summary>縫光：隨天亮從深藍變灰白，並且越推開越亮（×(1 + 2 × 開口 ÷ 全開)，規格第 22 節 C）。</summary>
    void UpdateGapGlow()
    {
        if (gapMaterial == null)
            return;
        float open = Mathf.Clamp01(slide / Odyssey.Core.BoulderSlide.FullOpen);
        OdysseyMaterials.SetEmission(gapMaterial, Color.Lerp(NightGlow, DawnGlow, dawn) * (1f + 2f * open));
    }

    /// <summary>fraction：0 = 入夜，1 = 天亮；縫裡的光從深藍漸變到灰白。</summary>
    public void SetDawn(float fraction)
    {
        dawn = Mathf.Clamp01(fraction);
        UpdateGapGlow();
        OdysseyMaterials.SetEmission(rimMaterial, Color.Lerp(MoonGlow, DawnGlow, Mathf.Clamp01(fraction)));
    }
}
