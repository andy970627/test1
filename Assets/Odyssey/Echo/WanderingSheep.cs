using Odyssey.Core;
using UnityEngine;

/// <summary>在洞裡亂走的羊：不時咩叫，照亮自己周圍，也蓋過 3 m 內的其他聲音。縫全開後湧向洞口。</summary>
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
    bool rushing;

    public bool IsRam { get; private set; }

    public void Init(Bounds floor, bool isRam, int seed)
    {
        this.floor = floor;
        IsRam = isRam;
        rng = new System.Random(seed);
        BuildBody();
        Arrow.AddHitBox(gameObject, Vector3.up * 0.6f, 1.1f, 0.45f);

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

    /// <summary>天光引羊：改用 1.2 m/s 朝縫走（停在 goal 附近），不再亂逛。</summary>
    public void RushTo(Vector3 goal)
    {
        rushing = true;
        target = goal + new Vector3(Range(-1.2f, 1.2f), 0f, Range(-0.8f, 0f));
        pauseUntil = 0f;
    }

    /// <summary>鑽縫：直接站進縫裡。</summary>
    public void SqueezeAt(Vector3 gap)
    {
        transform.position = Ground(gap);
        target = transform.position;
    }

    /// <summary>鑽出去了：這一夜不再出現。</summary>
    public void Leave() => gameObject.SetActive(false);

    /// <summary>咩一聲（撞巨石、卡在縫裡）。</summary>
    public void Bleat()
    {
        voice.pitch = IsRam ? 0.8f : Range(0.95f, 1.15f);
        voice.Play();
        SoundBus.Emit(SoundKind.Bleat, transform.position + Vector3.up * 0.6f);
    }

    public void ResetForNight()
    {
        gameObject.SetActive(true);
        rushing = false;
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
            Bleat();
        }

        if (Time.time < pauseUntil)
            return;
        Vector3 to = target - transform.position;
        to.y = 0f;
        if (to.magnitude < 0.2f)
        {
            // 湧向縫的羊到了就擠在那裡不走。
            if (rushing)
                return;
            pauseUntil = Time.time + Range(MinPause, MaxPause);
            target = RandomPoint();
            return;
        }
        float speed = rushing ? SheepRush.RushSpeed : Speed;
        Vector3 next = transform.position + to.normalized * Mathf.Min(speed * Time.deltaTime, to.magnitude);
        transform.SetPositionAndRotation(Ground(next), Quaternion.LookRotation(to));
    }

    Vector3 RandomPoint() => new(Range(floor.min.x, floor.max.x), 0f, Range(floor.min.z, floor.max.z));

    static Vector3 Ground(Vector3 p) => new(p.x, CaveBuilder.GroundHeight(p), p.z);

    float Range(float min, float max) => min + (float)rng.NextDouble() * (max - min);

    void BuildBody()
    {
        float s = IsRam ? 1.35f : 1f;
        var wool = OdysseyPalette.Wool;
        var woolShade = OdysseyPalette.WoolShade;
        var dark = OdysseyPalette.SheepDark;
        var horn = OdysseyPalette.Horn;

        // 羊身（厚重羊毛球體複合）
        Part(PrimitiveType.Sphere, "BodyMain", new Vector3(0f, 0.6f, 0f) * s, new Vector3(0.95f, 0.65f, 1.35f) * s, wool);
        Part(PrimitiveType.Sphere, "BodyRump", new Vector3(0f, 0.65f, -0.3f) * s, new Vector3(0.85f, 0.6f, 0.75f) * s, woolShade);

        // 羊頭與口鼻
        Part(PrimitiveType.Sphere, "Head", new Vector3(0f, 0.8f, 0.75f) * s, new Vector3(0.32f, 0.32f, 0.42f) * s, dark);
        Part(PrimitiveType.Sphere, "Muzzle", new Vector3(0f, 0.72f, 0.95f) * s, new Vector3(0.20f, 0.18f, 0.22f) * s, dark);

        // 短尾巴
        Part(PrimitiveType.Sphere, "Tail", new Vector3(0f, 0.65f, -0.7f) * s, new Vector3(0.12f, 0.12f, 0.12f) * s, wool);

        // 四足蹄腿
        for (int i = 0; i < 4; i++)
        {
            float x = (i % 2 == 0 ? -0.25f : 0.25f) * s;
            float z = (i < 2 ? -0.4f : 0.4f) * s;
            Part(PrimitiveType.Cylinder, "Leg", new Vector3(x, 0.2f * s, z), new Vector3(0.12f, 0.2f, 0.12f) * s, dark);
        }

        // 大公羊的大捲角（雄渾的西西里島大公羊特徵）
        if (IsRam)
        {
            Part(PrimitiveType.Sphere, "HornL1", new Vector3(-0.22f, 0.95f, 0.85f) * s, new Vector3(0.18f, 0.18f, 0.28f) * s, horn);
            Part(PrimitiveType.Sphere, "HornL2", new Vector3(-0.30f, 0.85f, 0.68f) * s, new Vector3(0.16f, 0.16f, 0.24f) * s, horn);
            Part(PrimitiveType.Sphere, "HornR1", new Vector3(0.22f, 0.95f, 0.85f) * s, new Vector3(0.18f, 0.18f, 0.28f) * s, horn);
            Part(PrimitiveType.Sphere, "HornR2", new Vector3(0.30f, 0.85f, 0.68f) * s, new Vector3(0.16f, 0.16f, 0.24f) * s, horn);
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
