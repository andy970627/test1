using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 巨人的乳酪架：人從旁邊擦過，最上層會滾下 1～2 塊圓乳酪（剛體），落地和滾動依力道發出 Cheese；
/// 之後 3 秒內不再掉。每夜清掉地上的乳酪。
/// </summary>
public class CheeseRack : MonoBehaviour
{
    const float Cooldown = 3f;
    const float TopShelfHeight = 1.45f;
    const float ShelfLength = 2f;

    readonly List<GameObject> wheels = new();
    float nextBrush;

    public Vector3 Position => transform.position;

    public void Init(Vector3 groundPos)
    {
        transform.position = groundPos;
    }

    public void Brush()
    {
        if (Time.time < nextBrush)
            return;
        nextBrush = Time.time + Cooldown;
        int count = Random.Range(1, 3);
        for (int i = 0; i < count; i++)
            SpawnWheel();
    }

    public void ClearWheels()
    {
        foreach (var w in wheels)
            if (w != null)
                Destroy(w);
        wheels.Clear();
        nextBrush = 0f;
    }

    void SpawnWheel()
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        go.name = "CheeseWheel";
        go.transform.localScale = new Vector3(0.35f, 0.06f, 0.35f);
        go.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(new Color(0.85f, 0.78f, 0.55f));
        // 圓柱預設是膠囊碰撞，扁平的乳酪輪要用凸面網格才滾得像輪子。
        DestroyImmediate(go.GetComponent<Collider>());
        go.AddComponent<MeshCollider>().convex = true;
        float side = Random.value < 0.5f ? -1f : 1f;
        float along = Random.Range(-ShelfLength / 2f + 0.3f, ShelfLength / 2f - 0.3f);
        go.transform.position = transform.position + new Vector3(side * 0.35f, TopShelfHeight, along);
        go.transform.rotation = Quaternion.Euler(Random.Range(-20f, 20f), 0f, 90f);

        var body = go.AddComponent<Rigidbody>();
        body.mass = 0.5f;
        body.collisionDetectionMode = CollisionDetectionMode.Continuous;
        body.linearVelocity = new Vector3(side * Random.Range(0.6f, 1.2f), 0f, Random.Range(-0.3f, 0.3f));
        go.AddComponent<ImpactEmitter>().Init(SoundKind.Cheese, SoundRules.Loudness(SoundKind.Cheese));
        wheels.Add(go);
    }
}
