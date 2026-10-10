using Odyssey.Core;
using UnityEngine;

/// <summary>丟出去的石子：第一次落地或撞牆時，在那裡發出聲音。</summary>
public class ThrownStone : MonoBehaviour
{
    const float LifeSeconds = 8f;
    bool landed;

    public void Launch(Vector3 velocity, Collider thrower)
    {
        var ball = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        ball.name = "Pebble";
        Destroy(ball.GetComponent<Collider>());
        ball.transform.SetParent(transform, false);
        ball.transform.localScale = Vector3.one * 0.12f;
        ball.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(new Color(0.6f, 0.6f, 0.58f));

        var col = gameObject.AddComponent<SphereCollider>();
        col.radius = 0.06f;
        if (thrower != null)
            Physics.IgnoreCollision(col, thrower);
        var body = gameObject.AddComponent<Rigidbody>();
        body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
        body.linearVelocity = velocity;
        Destroy(gameObject, LifeSeconds);
    }

    void OnCollisionEnter(Collision collision)
    {
        if (landed)
            return;
        landed = true;
        Vector3 point = collision.contactCount > 0 ? collision.GetContact(0).point : transform.position;
        SoundBus.Emit(SoundKind.Stone, point);
        Destroy(gameObject, 0.5f);
    }
}
