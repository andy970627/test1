using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 刺瞎巨人的那根橄欖木樁（長 2 m）：拿著推巨石比較省力；也能插進縫裡當巨人拔不掉的楔子。
/// 放在地上時是剛體，倒地會響。
/// </summary>
public class OliveStake : MonoBehaviour
{
    const float Length = 2f;
    static readonly Color Wood = new(0.35f, 0.26f, 0.15f);

    Rigidbody body;
    Collider col;

    public bool Carried { get; private set; }
    public bool Planted { get; private set; }

    public void Init()
    {
        var shape = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        shape.name = "Shaft";
        shape.transform.SetParent(transform, false);
        shape.transform.localScale = new Vector3(0.14f, Length / 2f, 0.14f);
        shape.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(Wood);
        col = shape.GetComponent<Collider>();

        var tip = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        tip.name = "BurntTip";
        Destroy(tip.GetComponent<Collider>());
        tip.transform.SetParent(shape.transform, false);
        tip.transform.localPosition = new Vector3(0f, 0.9f, 0f);
        tip.transform.localScale = new Vector3(0.7f, 0.15f, 0.7f);
        tip.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(new Color(0.04f, 0.03f, 0.02f));

        body = gameObject.AddComponent<Rigidbody>();
        body.mass = 4f;
        body.collisionDetectionMode = CollisionDetectionMode.Continuous;
        // 落地＝玩家這邊的木樁聲。不能借乳酪（Cheese）的聲類：乳酪算誘餌，巨人會當成「不是你」、宙斯法則也不算聽見你。
        gameObject.AddComponent<ImpactEmitter>().Init(SoundKind.Drag, SoundRules.Loudness(SoundKind.Drag));
    }

    /// <summary>平放在地上（剛體）。</summary>
    public void PlaceAt(Vector3 groundPos)
    {
        Detach();
        float yaw = transform.eulerAngles.y;
        transform.SetPositionAndRotation(groundPos + Vector3.up * 0.1f, Quaternion.Euler(0f, yaw, 90f));
        body.isKinematic = false;
        body.linearVelocity = Vector3.zero;
        body.angularVelocity = Vector3.zero;
        col.enabled = true;
    }

    /// <summary>拿在手上（斜斜往前伸）。</summary>
    public void AttachTo(Transform hand)
    {
        body.isKinematic = true;
        col.enabled = false;
        transform.SetParent(hand, false);
        transform.localPosition = new Vector3(0.35f, -0.45f, 0.9f);
        transform.localRotation = Quaternion.Euler(75f, 0f, 0f);
        Carried = true;
        Planted = false;
    }

    /// <summary>插在縫裡，斜靠著巨石。</summary>
    public void PlantAt(Vector3 gapPos)
    {
        Detach();
        body.isKinematic = true;
        col.enabled = false;
        transform.SetPositionAndRotation(gapPos + Vector3.up * 0.4f, Quaternion.Euler(-20f, 0f, 0f));
        Planted = true;
    }

    void Detach()
    {
        transform.SetParent(null, true);
        Carried = false;
        Planted = false;
    }
}
