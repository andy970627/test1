using Odyssey.Core;
using UnityEngine;

/// <summary>在洞裡亂走的羊：不時咩叫，照亮自己周圍，也蓋過 3 m 內的其他聲音。</summary>
public class WanderingSheep : MonoBehaviour
{
    const float Speed = 0.6f;
    const float MinBleat = 9f, MaxBleat = 20f;
    const float MinPause = 1f, MaxPause = 3f;

    Bounds floor;
    System.Random rng;
    AudioSource voice;
    Vector3 target;
    float pauseUntil;
    float nextBleat;

    public bool IsRam { get; private set; }

    public void Init(Bounds floor, bool isRam, int seed)
    {
        this.floor = floor;
        IsRam = isRam;
        rng = new System.Random(seed);
        BuildBody();

        voice = gameObject.AddComponent<AudioSource>();
        voice.clip = ProceduralAudio.Bleat();
        voice.spatialBlend = 1f;
        voice.rolloffMode = AudioRolloffMode.Linear;
        voice.minDistance = 1f;
        voice.maxDistance = 12f;
        voice.volume = 0.35f;
        voice.playOnAwake = false;
        ResetForNight();
    }

    public void ResetForNight()
    {
        transform.position = Ground(RandomPoint());
        target = RandomPoint();
        pauseUntil = 0f;
        nextBleat = Time.time + Range(0f, MaxBleat);
    }

    void Update()
    {
        if (Time.time >= nextBleat)
        {
            nextBleat = Time.time + Range(MinBleat, MaxBleat);
            voice.pitch = IsRam ? 0.8f : Range(0.95f, 1.15f);
            voice.Play();
            SoundBus.Emit(SoundKind.Bleat, transform.position + Vector3.up * 0.6f);
        }

        if (Time.time < pauseUntil)
            return;
        Vector3 to = target - transform.position;
        to.y = 0f;
        if (to.magnitude < 0.2f)
        {
            pauseUntil = Time.time + Range(MinPause, MaxPause);
            target = RandomPoint();
            return;
        }
        Vector3 next = transform.position + to.normalized * Mathf.Min(Speed * Time.deltaTime, to.magnitude);
        transform.SetPositionAndRotation(Ground(next), Quaternion.LookRotation(to));
    }

    Vector3 RandomPoint() => new(Range(floor.min.x, floor.max.x), 0f, Range(floor.min.z, floor.max.z));

    static Vector3 Ground(Vector3 p) => new(p.x, CaveBuilder.GroundHeight(p), p.z);

    float Range(float min, float max) => min + (float)rng.NextDouble() * (max - min);

    void BuildBody()
    {
        float s = IsRam ? 1.3f : 1f;
        var wool = new Color(0.75f, 0.72f, 0.65f);
        var dark = new Color(0.25f, 0.22f, 0.2f);
        Part(PrimitiveType.Sphere, "Body", new Vector3(0f, 0.6f, 0f) * s, new Vector3(0.9f, 0.6f, 1.3f) * s, wool);
        Part(PrimitiveType.Sphere, "Head", new Vector3(0f, 0.8f, 0.75f) * s, new Vector3(0.35f, 0.35f, 0.45f) * s, dark);
        for (int i = 0; i < 4; i++)
        {
            float x = (i % 2 == 0 ? -0.25f : 0.25f) * s;
            float z = (i < 2 ? -0.4f : 0.4f) * s;
            Part(PrimitiveType.Cylinder, "Leg", new Vector3(x, 0.2f * s, z), new Vector3(0.12f, 0.2f, 0.12f) * s, dark);
        }
        if (IsRam)
        {
            Part(PrimitiveType.Sphere, "HornL", new Vector3(-0.22f, 1.15f, 0.95f), new Vector3(0.22f, 0.22f, 0.3f), dark);
            Part(PrimitiveType.Sphere, "HornR", new Vector3(0.22f, 1.15f, 0.95f), new Vector3(0.22f, 0.22f, 0.3f), dark);
        }
    }

    void Part(PrimitiveType type, string name, Vector3 localPos, Vector3 scale, Color color)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(transform, false);
        go.transform.localPosition = localPos;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(color);
    }
}
