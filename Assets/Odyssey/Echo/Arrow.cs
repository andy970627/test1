using System;
using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 射出去的箭（規格第 21 節）：剛體、朝著飛行方向，撞到東西就停下、釘在那裡，落點發出 Arrow（會照亮、引巨人）。
/// 射中奶桶、乳酪架、射進羊圈會觸發它們原本的聲音；射中羊、同伴、巨人（他們身上只有觸發範圍）時掉在地上。
/// 釘在會動的東西上（滑動的巨石）會跟著動；撞到會動的剛體（奶桶）就掉下來。
/// 停下後走近（水平 0.8 m、高度 2 m 內）撿得回來；釘在高處的拿不到。飛出洞外或太久沒落地就消失。
/// </summary>
public class Arrow : MonoBehaviour
{
    const float Length = 0.7f;
    const float ReachHeight = 2f;
    const float MaxFlightSeconds = 8f;
    const float KillBelow = -20f;

    static readonly List<Arrow> all = new();

    /// <summary>這個點在不在羊圈裡（由遊戲迴圈設定）。</summary>
    public static Func<Vector3, bool> InPen;

    /// <summary>箭一律穿過的碰撞體（例如巨石外側擋人的隱形牆）。</summary>
    public static readonly List<Collider> IgnoreAlways = new();

    Rigidbody body;
    Collider col;
    bool landed;
    bool dropped;
    float spawnTime;
    Transform stuckTo;
    Vector3 stuckPos;
    Quaternion stuckRot;

    public static IReadOnlyList<Arrow> All => all;

    public static Arrow Shoot(Vector3 from, Vector3 velocity, Collider ignore)
    {
        var go = new GameObject("Arrow");
        go.transform.SetPositionAndRotation(from, Quaternion.LookRotation(velocity));
        var arrow = go.AddComponent<Arrow>();
        arrow.Build(velocity, ignore);
        all.Add(arrow);
        return arrow;
    }

    public static void ClearAll()
    {
        foreach (var a in all)
            if (a != null)
                Destroy(a.gameObject);
        all.Clear();
    }

    /// <summary>給羊、同伴、巨人加一個只讓箭判斷「射中」的觸發範圍（不影響其他碰撞）。</summary>
    public static void AddHitBox(GameObject target, Vector3 center, float height, float radius)
    {
        var box = target.AddComponent<CapsuleCollider>();
        box.isTrigger = true;
        box.center = center;
        box.height = height;
        box.radius = radius;
    }

    /// <summary>停下來且伸手搆得到（不是釘在高處的牆上）。</summary>
    public bool CanTake(Vector3 feet, float reach)
    {
        if (!landed)
            return false;
        Vector3 d = transform.position - feet;
        return d.y < ReachHeight && new Vector2(d.x, d.z).magnitude <= reach;
    }

    public void Take()
    {
        all.Remove(this);
        Destroy(gameObject);
    }

    void Build(Vector3 velocity, Collider ignore)
    {
        spawnTime = Time.time;
        var shaft = GameObject.CreatePrimitive(PrimitiveType.Cube);
        shaft.name = "Shaft";
        Destroy(shaft.GetComponent<Collider>());
        shaft.transform.SetParent(transform, false);
        shaft.transform.localScale = new Vector3(0.015f, 0.015f, Length);
        shaft.transform.localPosition = new Vector3(0f, 0f, -Length / 2f);
        shaft.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(OdysseyPalette.ArrowShaft);

        var sphere = gameObject.AddComponent<SphereCollider>();
        sphere.radius = 0.03f;
        col = sphere;
        if (ignore != null)
            Physics.IgnoreCollision(col, ignore);
        foreach (var c in IgnoreAlways)
            if (c != null)
                Physics.IgnoreCollision(col, c);
        body = gameObject.AddComponent<Rigidbody>();
        body.mass = 0.05f;
        body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
        body.linearVelocity = velocity;
    }

    void FixedUpdate()
    {
        if (!landed && !dropped && body.linearVelocity.sqrMagnitude > 0.01f)
            transform.rotation = Quaternion.LookRotation(body.linearVelocity);
    }

    void Update()
    {
        // 飛出洞外、卡進牆裡一直沒落地：當作射丟了。
        if (!landed && (transform.position.y < KillBelow || Time.time - spawnTime > MaxFlightSeconds))
            Take();
    }

    void LateUpdate()
    {
        // 釘在會動的東西上（巨石滑開）：跟著它。
        if (stuckTo != null)
            transform.SetPositionAndRotation(stuckTo.TransformPoint(stuckPos), stuckTo.rotation * stuckRot);
    }

    void OnCollisionEnter(Collision collision)
    {
        if (landed)
            return;
        // 射中活物後掉下來碰到東西：停下，不再出聲。
        if (dropped)
        {
            landed = true;
            body.isKinematic = true;
            return;
        }
        Vector3 point = collision.contactCount > 0 ? collision.GetContact(0).point : transform.position;
        var hit = collision.collider;

        var pail = hit.GetComponentInParent<MilkPail>();
        if (pail != null)
            pail.Knock(point - transform.forward);
        var rack = hit.GetComponentInParent<CheeseRack>();
        if (rack != null)
            rack.Brush();
        if (InPen != null && InPen(point))
            SoundBus.Emit(SoundKind.Wicker, point);
        SoundBus.Emit(SoundKind.Arrow, point);

        // 撞到會動的剛體（奶桶）就掉下來；其他東西釘住，並跟著它動。
        if (hit.attachedRigidbody != null && !hit.attachedRigidbody.isKinematic)
        {
            Drop(hit);
            return;
        }
        landed = true;
        body.isKinematic = true;
        stuckTo = hit.transform;
        stuckPos = stuckTo.InverseTransformPoint(transform.position);
        stuckRot = Quaternion.Inverse(stuckTo.rotation) * transform.rotation;
    }

    /// <summary>射中羊、同伴、巨人（觸發範圍）：箭掉在他腳邊，落點聲在那裡。</summary>
    void OnTriggerEnter(Collider other)
    {
        if (landed || dropped)
            return;
        var sheep = other.GetComponentInParent<WanderingSheep>();
        bool living = sheep != null || other.GetComponentInParent<CrewMember>() != null || other.GetComponentInParent<BlindCyclops>() != null;
        if (!living)
            return;
        if (sheep != null)
            sheep.Bleat();
        // 打中巨人：先回報（宙斯法則看的是打中前他有沒有聽到你），再發落點聲。
        if (other.GetComponentInParent<BlindCyclops>() != null)
            CyclopsHits.Report(transform.position);
        Drop(other);
        SoundBus.Emit(SoundKind.Arrow, transform.position);
    }

    /// <summary>掉在地上：不再和撞到的東西碰撞，只受重力落下；碰到地面（OnCollisionEnter）才算停下、可以撿。</summary>
    void Drop(Collider hit)
    {
        body.isKinematic = false;
        body.linearVelocity = Vector3.zero;
        body.angularVelocity = Vector3.zero;
        if (!hit.isTrigger)
            Physics.IgnoreCollision(col, hit);
        dropped = true;
    }

    void OnDestroy() => all.Remove(this);
}
