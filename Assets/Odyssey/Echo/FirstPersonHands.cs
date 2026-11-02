using UnityEngine;

/// <summary>
/// 第一人稱的雙手與彈弓（規格第 26 節 D、第 31 節 A／B2，低多邊形暫代）：左手握 Y 形彈弓、右手拉皮筋。
/// 很暗的自發光，全黑的洞裡也看得到輪廓；放在畫面左下，不擋中央。
/// Draw＝拉皮筋（0～1）；Tremble＝手抖（木馬的重量）；Lower＝雙手垂下（偷襲後低頭的那一刻）。
/// </summary>
public class FirstPersonHands : MonoBehaviour
{
    static readonly Color Skin = new(0.20f, 0.15f, 0.12f);
    static readonly Color Wood = new(0.22f, 0.15f, 0.09f);
    static readonly Color Glow = new(0.035f, 0.035f, 0.045f);
    static readonly Vector3 RestPosition = new(-0.18f, -0.26f, 0.5f);

    Transform root, rightHand, band;
    Vector3 forkLeft, forkRight;

    public float Draw { get; set; }
    public float Tremble { get; set; }
    public float Lower { get; set; }

    public bool Visible
    {
        get => root != null && root.gameObject.activeSelf;
        set
        {
            if (root != null)
                root.gameObject.SetActive(value);
        }
    }

    public void Init(Transform camera)
    {
        root = new GameObject("Hands").transform;
        root.SetParent(camera, false);
        root.localPosition = RestPosition;
        Material skin = OdysseyMaterials.Create(Skin, Glow);
        Material wood = OdysseyMaterials.Create(Wood, Glow);

        // 左手握著彈弓柄。
        Part(PrimitiveType.Capsule, root, new Vector3(0f, -0.05f, 0f), new Vector3(0.07f, 0.07f, 0.07f), Quaternion.identity, skin);
        Part(PrimitiveType.Cube, root, new Vector3(0f, 0.02f, 0f), new Vector3(0.025f, 0.12f, 0.025f), Quaternion.identity, wood);
        Part(PrimitiveType.Cube, root, new Vector3(-0.03f, 0.11f, 0f), new Vector3(0.02f, 0.09f, 0.02f), Quaternion.Euler(0f, 0f, 25f), wood);
        Part(PrimitiveType.Cube, root, new Vector3(0.03f, 0.11f, 0f), new Vector3(0.02f, 0.09f, 0.02f), Quaternion.Euler(0f, 0f, -25f), wood);
        forkLeft = new Vector3(-0.05f, 0.15f, 0f);
        forkRight = new Vector3(0.05f, 0.15f, 0f);

        // 右手拉著皮筋；皮筋是一條細長方塊，從叉口中間連到右手。
        rightHand = Part(PrimitiveType.Capsule, root, new Vector3(0.0f, 0.13f, -0.04f), new Vector3(0.06f, 0.06f, 0.06f), Quaternion.Euler(90f, 0f, 0f), skin);
        band = Part(PrimitiveType.Cube, root, Vector3.zero, Vector3.one * 0.01f, Quaternion.identity, OdysseyMaterials.Create(new Color(0.1f, 0.08f, 0.06f), Glow));
    }

    static Transform Part(PrimitiveType type, Transform parent, Vector3 pos, Vector3 scale, Quaternion rot, Material mat)
    {
        var go = GameObject.CreatePrimitive(type);
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(parent, false);
        go.transform.localPosition = pos;
        go.transform.localRotation = rot;
        go.transform.localScale = scale;
        var r = go.GetComponent<Renderer>();
        r.sharedMaterial = mat;
        r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        return go.transform;
    }

    void LateUpdate()
    {
        if (root == null || !root.gameObject.activeSelf)
            return;
        float t = Time.time * 9f;
        Vector3 shake = Tremble > 0f
            ? new Vector3(Mathf.PerlinNoise(t, 0.1f) - 0.5f, Mathf.PerlinNoise(0.4f, t) - 0.5f, 0f) * 0.02f * Tremble
            : Vector3.zero;
        root.localPosition = RestPosition + shake + new Vector3(0f, -0.25f * Lower, 0f);

        // 拉皮筋：右手往後（朝鏡頭）最多 0.22 m。
        Vector3 hand = new Vector3(0f, 0.13f, -0.04f - 0.22f * Mathf.Clamp01(Draw));
        rightHand.localPosition = hand;
        Vector3 fork = (forkLeft + forkRight) / 2f;
        Vector3 span = hand - fork;
        band.localPosition = (hand + fork) / 2f;
        band.localRotation = span.sqrMagnitude > 1e-6f ? Quaternion.LookRotation(span) : Quaternion.identity;
        band.localScale = new Vector3(0.012f, 0.008f, Mathf.Max(0.01f, span.magnitude));
    }
}
