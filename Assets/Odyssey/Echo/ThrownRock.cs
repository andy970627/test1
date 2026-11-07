using System;
using UnityEngine;

/// <summary>巨人朝聲音扔來的岩石：沿拋物線飛 1 秒，落地時回呼（發聲與判定由呼叫端負責）。</summary>
public class ThrownRock : MonoBehaviour
{
    const float ArcHeight = 3f;

    Vector3 from;
    Vector3 to;
    float seconds;
    float elapsed;
    Action<Vector3> landed;

    public Vector3 Target => to;

    public void Launch(Vector3 from, Vector3 to, float seconds, Action<Vector3> landed)
    {
        this.from = from;
        this.to = to;
        this.seconds = Mathf.Max(0.01f, seconds);
        this.landed = landed;

        var ball = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        ball.name = "Rock";
        Destroy(ball.GetComponent<Collider>());
        ball.transform.SetParent(transform, false);
        ball.transform.localScale = new Vector3(0.7f, 0.55f, 0.6f);
        ball.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(OdysseyPalette.ThrownRock);
        transform.position = from;
    }

    void Update()
    {
        elapsed += Time.deltaTime;
        float t = Mathf.Clamp01(elapsed / seconds);
        transform.position = Vector3.Lerp(from, to, t) + Vector3.up * (4f * ArcHeight * t * (1f - t));
        transform.Rotate(220f * Time.deltaTime, 90f * Time.deltaTime, 0f);
        if (t < 1f)
            return;
        landed?.Invoke(to);
        Destroy(gameObject);
    }
}
