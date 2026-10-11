using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 掛在剛體上：撞到東西時照 ImpactSound 的規則發聲，撞得越用力越大聲；同一物件 0.3 秒內只響一次。
/// </summary>
[RequireComponent(typeof(Rigidbody))]
public class ImpactEmitter : MonoBehaviour
{
    readonly ImpactGate gate = new();
    SoundKind kind;
    float maxLoudness;

    public void Init(SoundKind kind, float maxLoudness)
    {
        this.kind = kind;
        this.maxLoudness = maxLoudness;
    }

    void OnCollisionEnter(Collision collision)
    {
        // 推巨石掉下的碎石只是畫面，砸到東西不能弄出巨人聽得到的聲音。
        if (collision.collider.GetComponent<SilentGrit>() != null)
            return;
        float loudness = ImpactSound.Loudness(maxLoudness, collision.relativeVelocity.magnitude);
        if (loudness <= 0f || !gate.TryFire(Time.time))
            return;
        Vector3 point = collision.contactCount > 0 ? collision.GetContact(0).point : transform.position;
        SoundBus.Emit(kind, point, loudness / SoundRules.Loudness(kind));
    }
}
