using System;
using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>撞上會出聲的石筍（BumpSensor 看這個元件）。</summary>
public class Stalagmite : MonoBehaviour { }

/// <summary>
/// 參考電影加強的場景細節與氛圍（規格第 33 節）：石灰岩洞的鐘乳石與石筍、滴水與洞穴殘響、
/// 巨人的家（餘燼、大棍、羊毛床、骨頭、陶碗、酒囊）、洞口外的蜂群、巨人腳步落下的粉塵、膠片顆粒與暗角。
/// 只是外觀與環境聲，不改任何規則；擺放時避開巨石、石子、同伴、木樁、奶桶、乳酪架、羊圈。
/// </summary>
public class CaveAtmosphere : MonoBehaviour
{
    const float RadiusX = 15f, RadiusZ = 10f, RadiusY = 7f;
    // CaveBuilder 的美術打磨已經沿洞頂邊緣放了 16 根；這裡補洞頂中間一帶。
    const int Stalactites = 14, Stalagmites = 10;
    const float DustReach = 8f;
    const int DustPool = 24;

    static readonly Color Limestone = new(0.42f, 0.39f, 0.33f);
    static readonly Color Wool = new(0.55f, 0.5f, 0.42f);
    static readonly Color Wood = new(0.25f, 0.17f, 0.1f);
    static readonly Color Bone = new(0.7f, 0.66f, 0.55f);
    static readonly Color Clay = new(0.45f, 0.25f, 0.15f);

    BlindCaveLayout layout;
    BlindCyclops cyclops;
    FirstPersonPlayer body;
    Func<float> openingFraction;
    System.Random rng;
    readonly List<Vector3> avoid = new();
    readonly List<float> avoidRadius = new();

    AudioSource bees;
    readonly AudioSource[] drips = new AudioSource[4];
    AudioClip[] dripClips;
    float nextDrip;
    Material emberMaterial;

    readonly Transform[] dust = new Transform[DustPool];
    readonly float[] dustAge = new float[DustPool];
    readonly Vector3[] dustVelocity = new Vector3[DustPool];
    int nextDust;

    Texture2D grain, vignette;
    Rect grainUv = new(0f, 0f, 3f, 2f);

    public void Init(BlindCaveLayout layout, BlindCyclops cyclops, FirstPersonPlayer body, Func<float> openingFraction, int seed)
    {
        this.layout = layout;
        this.cyclops = cyclops;
        this.body = body;
        this.openingFraction = openingFraction;
        rng = new System.Random(seed * 97 + 5);
        CollectAvoid();
        var root = new GameObject("Atmosphere").transform;
        root.SetParent(transform, false);
        BuildCeiling(root);
        BuildFloorFormations(root);
        BuildHome(root);
        BuildSound(root);
        BuildDust(root);
        BuildOverlays();
        cyclops.Sounded += OnGiantSound;
    }

    void OnDestroy()
    {
        if (cyclops != null)
            cyclops.Sounded -= OnGiantSound;
    }

    // ---------- 擺放 ----------

    void CollectAvoid()
    {
        void Add(Vector3 p, float r)
        {
            avoid.Add(p);
            avoidRadius.Add(r);
        }
        Add(layout.Boulder.BaseCenter, 5f);
        Add(layout.Cave.PlayerSpawn, 2f);
        Add(layout.Cave.CyclopsSeat, 2.5f);
        Add(layout.StakeSpot, 1.5f);
        foreach (var s in layout.StoneSpots) Add(s, 1.2f);
        foreach (var c in layout.CrewSpots) Add(c, 1.3f);
        foreach (var p in layout.Pails) Add(p.transform.position, 1.2f);
        Add(layout.Rack.Position, 2f);
        foreach (var pen in layout.Pens) Add(pen.Center, 3f);
    }

    bool Clear(Vector3 p, float extra)
    {
        for (int i = 0; i < avoid.Count; i++)
        {
            Vector3 d = avoid[i] - p;
            d.y = 0f;
            if (d.magnitude < avoidRadius[i] + extra)
                return false;
        }
        foreach (var pen in layout.Pens)
            if (pen.Contains(p))
                return false;
        return true;
    }

    /// <summary>橢圓洞裡相對半徑 r（0＝中央、1＝岩壁）的隨機一點，貼地。</summary>
    Vector3 RandomPoint(float rMin, float rMax)
    {
        double a = rng.NextDouble() * Math.PI * 2;
        float r = rMin + (float)rng.NextDouble() * (rMax - rMin);
        var p = new Vector3((float)Math.Cos(a) * RadiusX * r, 0f, (float)Math.Sin(a) * RadiusZ * r);
        p.y = CaveBuilder.GroundHeight(p);
        return p;
    }

    /// <summary>洞頂大約的高度（把洞當成半個橢球）。</summary>
    static float CeilingAt(Vector3 p)
    {
        float r2 = p.x * p.x / (RadiusX * RadiusX) + p.z * p.z / (RadiusZ * RadiusZ);
        return RadiusY * Mathf.Sqrt(Mathf.Max(0f, 1f - r2));
    }

    // ---------- 石灰岩洞 ----------

    void BuildCeiling(Transform root)
    {
        Material stone = EchoMaterials.Create(Limestone);
        Mesh cone = ConeMesh(7);
        for (int i = 0; i < Stalactites; i++)
        {
            Vector3 p = RandomPoint(0.1f, 0.85f);
            float length = 0.6f + 1.2f * (float)rng.NextDouble();
            float top = CeilingAt(p) + 1f;
            // 尖端朝下，上面多埋 1 m 進岩頂，洞頂高低不平也不會浮在半空。
            var t = Shape(root, "Stalactite", cone, stone, new Vector3(p.x, top, p.z), new Vector3(0.18f + 0.15f * (float)rng.NextDouble(), length + 1f, 0.18f + 0.15f * (float)rng.NextDouble()));
            t.localRotation = Quaternion.Euler(180f, (float)rng.NextDouble() * 360f, 0f);
        }
    }

    void BuildFloorFormations(Transform root)
    {
        Material stone = EchoMaterials.Create(Limestone);
        Mesh cone = ConeMesh(7);
        int placed = 0;
        for (int tries = 0; tries < 300 && placed < Stalagmites; tries++)
        {
            Vector3 p = RandomPoint(0.72f, 0.88f);
            if (!Clear(p, 0.6f))
                continue;
            float height = 0.8f + 1.4f * (float)rng.NextDouble();
            float width = 0.35f + 0.25f * (float)rng.NextDouble();
            var t = Shape(root, "Stalagmite", cone, stone, p - Vector3.up * 0.1f, new Vector3(width, height, width));
            t.localRotation = Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f);
            var col = t.gameObject.AddComponent<CapsuleCollider>();
            col.radius = 0.4f;
            col.height = 1f;
            col.center = new Vector3(0f, 0.5f, 0f);
            t.gameObject.AddComponent<Stalagmite>();
            avoid.Add(p);
            avoidRadius.Add(width + 0.5f);
            placed++;
        }
    }

    // ---------- 巨人的家 ----------

    void BuildHome(Transform root)
    {
        // 爐灶：熄掉的炭火只剩一點會閃的暗紅餘燼。
        var hearth = new Vector3(-1f, 0f, -1f);
        hearth.y = CaveBuilder.GroundHeight(hearth);
        emberMaterial = OdysseyMaterials.Create(new Color(0.1f, 0.03f, 0.01f), new Color(0.25f, 0.05f, 0.01f));
        for (int i = 0; i < 5; i++)
        {
            var off = new Vector3((float)rng.NextDouble() - 0.5f, 0.05f, (float)rng.NextDouble() - 0.5f) * 0.6f;
            Prim(root, PrimitiveType.Cube, "Ember", hearth + off, Vector3.one * 0.12f, Quaternion.Euler(0f, i * 37f, 0f), emberMaterial, false);
        }

        Material wool = EchoMaterials.Create(Wool);
        Material wood = EchoMaterials.Create(Wood);
        Material bone = EchoMaterials.Create(Bone);
        Material clay = EchoMaterials.Create(Clay);

        // 羊毛床：靠岩壁的一大片低矮羊毛堆。
        Vector3 bed = Place(0.6f, 0.78f, 2.2f);
        Prim(root, PrimitiveType.Sphere, "FleeceBed", bed + Vector3.up * 0.15f, new Vector3(3.2f, 0.45f, 2f), Quaternion.Euler(0f, (float)rng.NextDouble() * 180f, 0f), wool, true);
        // 床邊啃過的骨頭。
        for (int i = 0; i < 6; i++)
        {
            Vector3 b = bed + new Vector3((float)rng.NextDouble() * 3f - 1.5f, 0.05f, (float)rng.NextDouble() * 3f - 1.5f);
            if (!Clear(b, 0f))
                continue;
            b.y = CaveBuilder.GroundHeight(b) + 0.05f;
            Prim(root, PrimitiveType.Cylinder, "Bone", b, new Vector3(0.06f, 0.22f, 0.06f), Quaternion.Euler(90f, (float)rng.NextDouble() * 180f, 0f), bone, false);
        }

        // 他的橄欖木大棍，橫躺在岩壁邊（比木樁粗大得多）。
        Vector3 club = Place(0.75f, 0.85f, 2.2f);
        Prim(root, PrimitiveType.Cylinder, "GiantClub", club + Vector3.up * 0.22f, new Vector3(0.4f, 2.2f, 0.4f), Quaternion.Euler(90f, (float)rng.NextDouble() * 180f, 0f), wood, true);

        // 兩個大陶碗與一個酒囊（奧德修斯給他的酒）。
        for (int i = 0; i < 2; i++)
        {
            Vector3 bowl = Place(0.3f, 0.7f, 0.8f);
            Prim(root, PrimitiveType.Sphere, "ClayBowl", bowl + Vector3.up * 0.15f, new Vector3(0.9f, 0.3f, 0.9f), Quaternion.identity, clay, false);
        }
        Vector3 skin = Place(0.3f, 0.7f, 0.8f);
        Prim(root, PrimitiveType.Sphere, "Wineskin", skin + Vector3.up * 0.25f, new Vector3(0.5f, 0.45f, 0.8f), Quaternion.Euler(0f, 30f, 15f), clay, false);
    }

    /// <summary>找一個空著的位置（避開玩法用的東西），並把它也記進避開清單。</summary>
    Vector3 Place(float rMin, float rMax, float radius)
    {
        Vector3 p = RandomPoint(rMin, rMax);
        for (int tries = 0; tries < 200 && !Clear(p, radius); tries++)
            p = RandomPoint(rMin, rMax);
        avoid.Add(p);
        avoidRadius.Add(radius);
        return p;
    }

    // ---------- 聲音 ----------

    void BuildSound(Transform root)
    {
        // 整個洞的洞穴殘響：每個聲音都有回音。
        var reverb = new GameObject("CaveReverb").AddComponent<AudioReverbZone>();
        reverb.transform.SetParent(root, false);
        reverb.reverbPreset = AudioReverbPreset.Cave;
        reverb.minDistance = 20f;
        reverb.maxDistance = 30f;

        dripClips = new[] { ProceduralAudio.Drip(0), ProceduralAudio.Drip(1), ProceduralAudio.Drip(2) };
        for (int i = 0; i < drips.Length; i++)
            drips[i] = Source(root, "Drip", null, false, 1f, 15f);
        nextDrip = 2f;

        Vector3 gap = layout.Boulder.GapPoint;
        bees = Source(root, "BeeSwarm", ProceduralAudio.BeeSwarm(), true, 1.5f, 18f);
        bees.transform.position = gap + new Vector3(0f, 0.5f, 1.2f);
        bees.volume = 0f;
        bees.Play();

        var embers = Source(root, "EmberCrackle", ProceduralAudio.EmberCrackle(), true, 0.5f, 6f);
        embers.transform.position = new Vector3(-1f, CaveBuilder.GroundHeight(new Vector3(-1f, 0f, -1f)) + 0.2f, -1f);
        embers.volume = 0.25f;
        embers.Play();
    }

    static AudioSource Source(Transform parent, string name, AudioClip clip, bool loop, float min, float max)
    {
        var s = new GameObject(name).AddComponent<AudioSource>();
        s.transform.SetParent(parent, false);
        s.clip = clip;
        s.loop = loop;
        s.spatialBlend = 1f;
        s.rolloffMode = AudioRolloffMode.Logarithmic;
        s.minDistance = min;
        s.maxDistance = max;
        s.playOnAwake = false;
        return s;
    }

    void Update()
    {
        float dt = Time.deltaTime;

        // 滴水：隨機位置每 2～6 秒一滴。
        nextDrip -= dt;
        if (nextDrip <= 0f)
        {
            nextDrip = 2f + 4f * (float)rng.NextDouble();
            var s = drips[rng.Next(drips.Length)];
            Vector3 p = RandomPoint(0.1f, 0.85f);
            s.transform.position = p + Vector3.up * 0.1f;
            s.pitch = 0.9f + 0.2f * (float)rng.NextDouble();
            s.PlayOneShot(dripClips[rng.Next(dripClips.Length)], 0.35f);
        }

        // 蜂群：縫一打開就聽得到，越開越大聲。
        float open = Mathf.Clamp01(openingFraction());
        bees.volume = Mathf.MoveTowards(bees.volume, open > 0.01f ? 0.15f + 0.6f * open : 0f, dt);
        bees.transform.position = layout.Boulder.GapPoint + new Vector3(0f, 0.5f, 1.2f);

        // 餘燼微微閃動。
        float flicker = 0.6f + 0.4f * Mathf.PerlinNoise(Time.time * 1.7f, 0.3f);
        OdysseyMaterials.SetEmission(emberMaterial, new Color(0.25f, 0.05f, 0.01f) * flicker);

        UpdateDust(dt);
    }

    // ---------- 巨人腳步落下的粉塵 ----------

    void BuildDust(Transform root)
    {
        Material dustMaterial = OdysseyMaterials.Create(new Color(0.3f, 0.28f, 0.25f), new Color(0.04f, 0.04f, 0.035f));
        for (int i = 0; i < DustPool; i++)
        {
            dust[i] = Prim(root, PrimitiveType.Cube, "Dust", Vector3.zero, Vector3.one * 0.03f, Quaternion.identity, dustMaterial, false);
            dust[i].gameObject.SetActive(false);
            dustAge[i] = 99f;
        }
    }

    void OnGiantSound(CyclopsState state)
    {
        if (state != CyclopsState.Investigate && state != CyclopsState.Guard)
            return;
        Vector3 me = body.transform.position;
        Vector3 d = cyclops.transform.position - me;
        d.y = 0f;
        if (d.magnitude > DustReach)
            return;
        int count = Mathf.RoundToInt(Mathf.Lerp(6f, 2f, d.magnitude / DustReach));
        for (int k = 0; k < count; k++)
        {
            int i = nextDust;
            nextDust = (nextDust + 1) % DustPool;
            var start = new Vector3(me.x + (float)rng.NextDouble() * 3f - 1.5f, CeilingAt(me) - 0.3f, me.z + (float)rng.NextDouble() * 3f - 1.5f);
            dust[i].position = start;
            dust[i].gameObject.SetActive(true);
            dustAge[i] = 0f;
            dustVelocity[i] = new Vector3(0f, -0.5f * (float)rng.NextDouble(), 0f);
        }
    }

    void UpdateDust(float dt)
    {
        for (int i = 0; i < DustPool; i++)
        {
            if (dustAge[i] > 2.5f)
                continue;
            dustAge[i] += dt;
            dustVelocity[i] += Vector3.down * 3f * dt;
            dust[i].position += dustVelocity[i] * dt;
            if (dustAge[i] > 2.5f || dust[i].position.y < CaveBuilder.GroundHeight(dust[i].position))
            {
                dustAge[i] = 99f;
                dust[i].gameObject.SetActive(false);
            }
        }
    }

    // ---------- 膠片顆粒與暗角 ----------

    void BuildOverlays()
    {
        const int g = 128;
        grain = new Texture2D(g, g, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Point };
        var noise = new Color32[g * g];
        for (int i = 0; i < noise.Length; i++)
        {
            byte v = (byte)rng.Next(256);
            noise[i] = new Color32(v, v, v, 255);
        }
        grain.SetPixels32(noise);
        grain.Apply();

        const int v2 = 128;
        vignette = new Texture2D(v2, v2, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        var dark = new Color32[v2 * v2];
        for (int y = 0; y < v2; y++)
            for (int x = 0; x < v2; x++)
            {
                float dx = (x + 0.5f) / v2 * 2f - 1f, dy = (y + 0.5f) / v2 * 2f - 1f;
                float r = Mathf.Sqrt(dx * dx + dy * dy) / 1.414f;
                dark[y * v2 + x] = new Color32(0, 0, 0, (byte)(255 * Mathf.SmoothStep(0.55f, 1f, r)));
            }
        vignette.SetPixels32(dark);
        vignette.Apply();
    }

    void OnGUI()
    {
        if (grain == null || Event.current.type != EventType.Repaint)
            return;
        GUI.depth = 10;
        var screen = new Rect(0f, 0f, Screen.width, Screen.height);
        Color old = GUI.color;
        GUI.color = new Color(1f, 1f, 1f, 0.45f);
        GUI.DrawTexture(screen, vignette);
        grainUv.position = new Vector2((float)rng.NextDouble(), (float)rng.NextDouble());
        GUI.color = new Color(1f, 1f, 1f, 0.05f);
        GUI.DrawTextureWithTexCoords(screen, grain, grainUv);
        GUI.color = old;
    }

    // ---------- 小工具 ----------

    static Transform Shape(Transform parent, string name, Mesh mesh, Material mat, Vector3 pos, Vector3 scale)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        go.transform.position = pos;
        go.transform.localScale = scale;
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        go.AddComponent<MeshRenderer>().sharedMaterial = mat;
        return go.transform;
    }

    static Transform Prim(Transform parent, PrimitiveType type, string name, Vector3 pos, Vector3 scale, Quaternion rot, Material mat, bool solid)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        if (!solid)
            Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(parent, false);
        go.transform.SetPositionAndRotation(pos, rot);
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = mat;
        return go.transform;
    }

    /// <summary>底面在 y = 0、尖端在 y = 1 的低多邊形圓錐（半徑 0.5）。</summary>
    static Mesh ConeMesh(int sides)
    {
        var vertices = new List<Vector3>();
        var triangles = new List<int>();
        var tip = new Vector3(0f, 1f, 0f);
        for (int i = 0; i < sides; i++)
        {
            float a0 = i * Mathf.PI * 2f / sides, a1 = (i + 1) * Mathf.PI * 2f / sides;
            var p0 = new Vector3(Mathf.Cos(a0) * 0.5f, 0f, Mathf.Sin(a0) * 0.5f);
            var p1 = new Vector3(Mathf.Cos(a1) * 0.5f, 0f, Mathf.Sin(a1) * 0.5f);
            int s = vertices.Count;
            vertices.Add(p0);
            vertices.Add(tip);
            vertices.Add(p1);
            triangles.Add(s);
            triangles.Add(s + 1);
            triangles.Add(s + 2);
        }
        var mesh = new Mesh { name = "Cone" };
        mesh.SetVertices(vertices);
        mesh.SetTriangles(triangles, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }
}
