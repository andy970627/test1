using UnityEngine;

/// <summary>
/// 柳條編的羊圈：低矮圍欄、地上鋪乾草，沒有碰撞。圈內腳步聲減半，跨過圍欄會沙沙響一下（Wicker）。
/// </summary>
public class WickerPen : MonoBehaviour
{
    const float FenceHeight = 0.5f;
    const float FenceThickness = 0.08f;
    static readonly Color Wicker = OdysseyPalette.Wicker;
    static readonly Color Hay = OdysseyPalette.Hay;

    Vector3 center;
    Vector2 size;

    public Vector3 Center => center;
    public Vector2 Size => size;

    public void Init(Vector3 groundCenter, Vector2 size)
    {
        center = groundCenter;
        this.size = size;
        transform.position = groundCenter;

        Piece("Hay", new Vector3(0f, 0.02f, 0f), new Vector3(size.x, 0.02f, size.y), Hay);
        float hx = size.x / 2f, hz = size.y / 2f, y = FenceHeight / 2f;
        Piece("FenceN", new Vector3(0f, y, hz), new Vector3(size.x, FenceHeight, FenceThickness), Wicker);
        Piece("FenceS", new Vector3(0f, y, -hz), new Vector3(size.x, FenceHeight, FenceThickness), Wicker);
        Piece("FenceE", new Vector3(hx, y, 0f), new Vector3(FenceThickness, FenceHeight, size.y), Wicker);
        Piece("FenceW", new Vector3(-hx, y, 0f), new Vector3(FenceThickness, FenceHeight, size.y), Wicker);

        // 邁錫尼青銅時代粗柳條立樁 (Corner & intermediate posts)
        float postRadius = 0.06f;
        CornerPost("PostNE", new Vector3(hx, y, hz), postRadius, FenceHeight * 1.15f, Wicker);
        CornerPost("PostNW", new Vector3(-hx, y, hz), postRadius, FenceHeight * 1.15f, Wicker);
        CornerPost("PostSE", new Vector3(hx, y, -hz), postRadius, FenceHeight * 1.15f, Wicker);
        CornerPost("PostSW", new Vector3(-hx, y, -hz), postRadius, FenceHeight * 1.15f, Wicker);
    }

    /// <summary>平面上是否在圈內（不看高度）。</summary>
    public bool Contains(Vector3 p) =>
        Mathf.Abs(p.x - center.x) <= size.x / 2f && Mathf.Abs(p.z - center.z) <= size.y / 2f;

    void CornerPost(string name, Vector3 localPos, float radius, float height, Color color)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        go.name = name;
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(transform, false);
        go.transform.localPosition = localPos;
        go.transform.localScale = new Vector3(radius * 2f, height / 2f, radius * 2f);
        go.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(color);
    }

    void Piece(string name, Vector3 localPos, Vector3 scale, Color color)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(transform, false);
        go.transform.localPosition = localPos;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(color);
    }
}
