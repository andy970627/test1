using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 巨人擠羊奶用的木桶：剛體。人走太近或被石子打中就翻倒，倒下和之後滾動撞到東西都會響（Clatter）。
/// 每夜扶正回原位。
/// </summary>
public class MilkPail : MonoBehaviour
{
    const float Height = 0.6f;
    const float KnockSpeed = 2f;

    Rigidbody body;
    Vector3 home;
    bool knocked;
    bool fallSounded;
    ImpactEmitter impacts;

    /// <summary>傾斜超過 45° 算倒了。</summary>
    public bool Fallen => Vector3.Angle(Vector3.up, transform.up) > 45f;

    public void Init(Vector3 groundPos)
    {
        home = groundPos + new Vector3(0f, Height / 2f, 0f);
        var shape = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        shape.name = "Pail";
        shape.transform.SetParent(transform, false);
        shape.transform.localScale = new Vector3(0.5f, Height / 2f, 0.5f);
        shape.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(new Color(0.4f, 0.3f, 0.2f));
        DestroyImmediate(shape.GetComponent<Collider>());
        shape.AddComponent<MeshCollider>().convex = true;

        // 荷馬史詩青銅外箍 (Bronze hoop around the rustic milk pail)
        var hoop = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        hoop.name = "BronzeHoop";
        hoop.transform.SetParent(shape.transform, false);
        hoop.transform.localPosition = new Vector3(0f, 0.35f, 0f);
        hoop.transform.localScale = new Vector3(1.02f, 0.12f, 1.02f);
        hoop.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(new Color(0.55f, 0.42f, 0.22f));
        DestroyImmediate(hoop.GetComponent<Collider>());

        body = gameObject.AddComponent<Rigidbody>();
        body.mass = 2f;
        body.collisionDetectionMode = CollisionDetectionMode.Continuous;
        impacts = gameObject.AddComponent<ImpactEmitter>();
        impacts.Init(SoundKind.Clatter, SoundRules.Loudness(SoundKind.Clatter));
        Stand();
    }

    /// <summary>從 from 的方向在桶頂推一下，把它推倒；已經倒了就不再推。</summary>
    public void Knock(Vector3 from)
    {
        // 每次扶正後只推一次：人站在旁邊時每幀都會呼叫，不能一直疊加速度把桶打飛。
        if (knocked || Fallen)
            return;
        knocked = true;
        Vector3 dir = transform.position - from;
        dir.y = 0f;
        if (dir.sqrMagnitude < 1e-4f)
            dir = Random.insideUnitSphere;
        dir.y = 0f;
        dir.Normalize();
        Vector3 top = transform.position + transform.up * (Height / 2f);
        body.AddForceAtPosition(dir * KnockSpeed, top, ForceMode.VelocityChange);
    }

    /// <summary>
    /// 倒下的那一下要響：桶本來就貼著地，翻倒時碰撞接觸不一定會重新開始，
    /// OnCollisionEnter 可能不觸發，所以傾斜超過 45° 時直接發一次 Clatter。
    /// </summary>
    void Update()
    {
        if (fallSounded || !Fallen)
            return;
        fallSounded = true;
        // 碰撞剛響過就不再重複（和 ImpactEmitter 共用 0.3 秒的閘）。
        if (impacts.Gate.TryFire(Time.time))
            SoundBus.Emit(SoundKind.Clatter, transform.position);
    }

    public void Stand()
    {
        knocked = false;
        fallSounded = false;
        body.linearVelocity = Vector3.zero;
        body.angularVelocity = Vector3.zero;
        transform.SetPositionAndRotation(home, Quaternion.identity);
        body.position = home;
        body.rotation = Quaternion.identity;
        body.Sleep();
    }
}
