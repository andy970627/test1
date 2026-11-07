using UnityEngine;

/// <summary>洞裡散落的石子；走近就撿起，每一夜重新出現。</summary>
public class StonePickup : MonoBehaviour
{
    public bool Taken { get; private set; }

    public void Init(Vector3 groundPos)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        go.name = "Pebble";
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(transform, false);
        go.transform.localScale = Vector3.one * 0.3f;
        go.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(OdysseyPalette.Pebble);
        transform.position = groundPos + new Vector3(0f, 0.15f, 0f);
    }

    public void Take()
    {
        Taken = true;
        gameObject.SetActive(false);
    }

    public void Respawn()
    {
        Taken = false;
        gameObject.SetActive(true);
    }
}
