using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 地上會滾的石子（丟出去的、被拔掉的楔子）：剛體，每次彈跳依撞擊力道發出漸小的聲音；
/// 停下來後留在地上，走近就撿得回來。打到奶桶會把它撞倒。
/// </summary>
public class LooseStone : MonoBehaviour
{
    const float Radius = 0.06f;
    const float SettleSpeed = 0.2f;
    const float MinAirSeconds = 0.3f;

    static readonly List<LooseStone> all = new();

    Rigidbody body;
    float spawnTime;

    public static IReadOnlyList<LooseStone> All => all;

    /// <summary>速度低於 0.2 m/s 視為停下，可以撿起。</summary>
    public bool Settled => Time.time - spawnTime >= MinAirSeconds && body.linearVelocity.magnitude < SettleSpeed;

    /// <param name="knockedLoose">被巨人拔掉或被羊撞掉的楔子：彈跳聲算巨人那邊的聲音（暗紅），巨人聽不到，
    /// 不會把剛拔完楔子的巨人引開，也不算玩家騙他的石子。</param>
    public static LooseStone Spawn(Vector3 pos, Vector3 velocity, Collider ignore, bool knockedLoose = false)
    {
        var go = new GameObject("LooseStone");
        go.transform.position = pos;
        var stone = go.AddComponent<LooseStone>();
        stone.Build(velocity, ignore, knockedLoose);
        all.Add(stone);
        return stone;
    }

    public static void ClearAll()
    {
        foreach (var s in all)
            if (s != null)
                Destroy(s.gameObject);
        all.Clear();
    }

    public void Take()
    {
        all.Remove(this);
        Destroy(gameObject);
    }

    void Build(Vector3 velocity, Collider ignore, bool knockedLoose)
    {
        spawnTime = Time.time;
        var ball = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        ball.name = "Pebble";
        Destroy(ball.GetComponent<Collider>());
        ball.transform.SetParent(transform, false);
        ball.transform.localScale = Vector3.one * Radius * 2f;
        ball.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(new Color(0.6f, 0.6f, 0.58f));

        var col = gameObject.AddComponent<SphereCollider>();
        col.radius = Radius;
        if (ignore != null)
            Physics.IgnoreCollision(col, ignore);
        body = gameObject.AddComponent<Rigidbody>();
        body.mass = 0.2f;
        body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
        body.linearVelocity = velocity;
        gameObject.AddComponent<ImpactEmitter>().Init(knockedLoose ? SoundKind.Cyclops : SoundKind.Stone, SoundRules.Loudness(SoundKind.Stone));
    }

    void OnCollisionEnter(Collision collision)
    {
        var pail = collision.collider.GetComponentInParent<MilkPail>();
        if (pail != null)
            pail.Knock(transform.position);
    }

    void OnDestroy() => all.Remove(this);
}
