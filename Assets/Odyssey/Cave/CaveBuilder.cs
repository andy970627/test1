using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 程式產生獨眼巨人波呂斐摩斯的洞穴：起伏地面、凹凸的半橢球洞壁（+Z 方向開洞口）、
/// 洞口岩石隧道、中央炭火、橄欖木樁、乳酪架與奶桶、洞外月光。
/// </summary>
public static class CaveBuilder
{
    const float RadiusX = 15f, RadiusZ = 10f, RadiusY = 7f;
    const int Longitude = 48, Latitude = 16;
    const float EntranceHalfAngle = 18f, EntranceElevation = 22f;

    static Collider s_Floor;

    public static CaveLayout Build(Transform root, int seed)
    {
        var rng = new System.Random(seed);
        float noiseOffset = (float)rng.NextDouble() * 100f;

        RenderSettings.skybox = null;
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = OdysseyPalette.CaveBlack;
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.Exponential;
        RenderSettings.fogDensity = 0.04f;
        RenderSettings.fogColor = Color.black;

        s_Floor = BuildFloor(root, noiseOffset);
        Physics.SyncTransforms();
        BuildDome(root, noiseOffset);
        BuildTunnel(root, rng);

        var layout = new CaveLayout
        {
            PlayerSpawn = OnGround(new Vector3(-6f, 0f, -3f)),
            CyclopsSeat = OnGround(new Vector3(3.5f, 0f, 5.5f)),
            EntrancePoint = OnGround(new Vector3(0f, 0f, 8.5f)),
            OutsidePoint = OnGround(new Vector3(0f, 0f, 18f)),
            CrewCorner = OnGround(new Vector3(-11f, 0f, 0f)),
            BucketPosition = OnGround(new Vector3(8f, 0f, -2f)),
            Floor = new Bounds(new Vector3(-2f, 0f, -1f), new Vector3(16f, 4f, 10f)),
        };
        layout.QueuePath = new[]
        {
            OnGround(new Vector3(-2f, 0f, 0f)),
            OnGround(new Vector3(0f, 0f, 4f)),
            layout.EntrancePoint,
        };

        BuildFire(root, OnGround(new Vector3(-1f, 0f, -1f)));
        BuildProps(root, layout);
        layout.Moonlight = BuildMoonlight(root);
        return layout;
    }

    /// <summary>該點正上方地面的高度（只對地面網格做射線）。</summary>
    public static float GroundHeight(Vector3 p)
    {
        if (s_Floor != null && s_Floor.Raycast(new Ray(new Vector3(p.x, 30f, p.z), Vector3.down), out RaycastHit hit, 60f))
            return hit.point.y;
        return 0f;
    }

    static Vector3 OnGround(Vector3 p) => new(p.x, GroundHeight(p), p.z);

    static Collider BuildFloor(Transform root, float offset)
    {
        const int minX = -16, maxX = 16, minZ = -12, maxZ = 22;
        int w = maxX - minX + 1, d = maxZ - minZ + 1;
        var vertices = new Vector3[w * d];
        for (int iz = 0; iz < d; iz++)
            for (int ix = 0; ix < w; ix++)
            {
                float x = minX + ix, z = minZ + iz;
                float flatten = Mathf.Clamp01((9f - z) / 2f); // 洞口與洞外是平地
                float h = 0.6f * Mathf.PerlinNoise(x * 0.15f + offset, z * 0.15f + offset) * flatten;
                vertices[iz * w + ix] = new Vector3(x, h, z);
            }
        var triangles = new List<int>();
        for (int iz = 0; iz < d - 1; iz++)
            for (int ix = 0; ix < w - 1; ix++)
            {
                int a = iz * w + ix, b = a + 1, c = a + w, e = c + 1;
                triangles.AddRange(new[] { a, c, b, b, c, e });
            }
        var go = MeshObject("Floor", root, vertices, triangles, OdysseyPalette.CaveFloor);
        return go.GetComponent<MeshCollider>();
    }

    static void BuildDome(Transform root, float offset)
    {
        // 緯度從略低於地面開始，避免洞壁與起伏地面之間露縫。
        const float minLat = -0.15f;
        var vertices = new Vector3[(Longitude + 1) * (Latitude + 1)];
        for (int iy = 0; iy <= Latitude; iy++)
            for (int ix = 0; ix <= Longitude; ix++)
            {
                float theta = 2f * Mathf.PI * ix / Longitude;
                float phi = Mathf.Lerp(minLat, Mathf.PI / 2f, (float)iy / Latitude);
                float noise = 1f + 0.18f * (Mathf.PerlinNoise(Mathf.Cos(theta) * 2f + offset, phi * 3f + Mathf.Sin(theta) * 2f) * 2f - 1f);
                vertices[iy * (Longitude + 1) + ix] = new Vector3(
                    RadiusX * Mathf.Cos(phi) * Mathf.Sin(theta) * noise,
                    RadiusY * Mathf.Sin(phi) * noise,
                    RadiusZ * Mathf.Cos(phi) * Mathf.Cos(theta) * noise);
            }

        var triangles = new List<int>();
        for (int iy = 0; iy < Latitude; iy++)
            for (int ix = 0; ix < Longitude; ix++)
            {
                float thetaDeg = Mathf.DeltaAngle(0f, 360f * (ix + 0.5f) / Longitude);
                float phiDeg = Mathf.Rad2Deg * Mathf.Lerp(minLat, Mathf.PI / 2f, (iy + 0.5f) / Latitude);
                if (Mathf.Abs(thetaDeg) < EntranceHalfAngle && phiDeg < EntranceElevation)
                    continue; // 洞口
                int a = iy * (Longitude + 1) + ix, b = a + 1, c = a + Longitude + 1, e = c + 1;
                // 繞序讓法線朝內（從洞裡看得到洞壁）。
                triangles.AddRange(new[] { a, c, b, b, c, e });
            }
        MeshObject("CaveWall", root, vertices, triangles, OdysseyPalette.CaveWall);
    }

    static void BuildTunnel(Transform root, System.Random rng)
    {
        var rock = OdysseyPalette.Rock;
        for (int i = 0; i < 12; i++)
        {
            float z = 9.5f + (i / 2) * 1.3f;
            bool top = i >= 10;
            float side = i % 2 == 0 ? -1f : 1f;
            var position = top
                ? new Vector3(0f, 3.2f, 10f + (i - 10) * 3f)
                : new Vector3(side * (3.4f + (float)rng.NextDouble() * 0.5f), 1.2f, z);
            var size = top
                ? new Vector3(8f, 1.4f, 3.2f)
                : new Vector3(1.2f + (float)rng.NextDouble(), 2.6f + (float)rng.NextDouble(), 1.4f + (float)rng.NextDouble());
            var go = Primitive(PrimitiveType.Cube, "TunnelRock", root, position, size, rock);
            go.transform.rotation = Quaternion.Euler((float)rng.NextDouble() * 10f, (float)rng.NextDouble() * 30f, (float)rng.NextDouble() * 10f);
        }
    }

    static void BuildFire(Transform root, Vector3 center)
    {
        var fire = new GameObject("Embers").transform;
        fire.SetParent(root, false);
        fire.position = center;
        for (int i = 0; i < 7; i++)
        {
            float a = i * Mathf.PI * 2f / 7f;
            var stone = Primitive(PrimitiveType.Sphere, "FireStone", fire, center + new Vector3(Mathf.Cos(a) * 0.6f, 0.1f, Mathf.Sin(a) * 0.6f), new Vector3(0.3f, 0.2f, 0.3f), OdysseyPalette.FireStone);
            Object.Destroy(stone.GetComponent<Collider>());
        }
        var embers = Primitive(PrimitiveType.Cube, "Coals", fire, center + new Vector3(0f, 0.08f, 0f), new Vector3(0.7f, 0.12f, 0.7f), OdysseyPalette.Coals, OdysseyPalette.CoalsGlow);
        Object.Destroy(embers.GetComponent<Collider>());

        var light = new GameObject("FireLight").AddComponent<Light>();
        light.transform.SetParent(fire, false);
        light.transform.position = center + new Vector3(0f, 0.6f, 0f);
        light.type = LightType.Point;
        light.color = OdysseyPalette.FireLight;
        light.range = 14f;
        light.intensity = 3f;
        light.shadows = LightShadows.Soft;
        light.gameObject.AddComponent<EmberFlicker>().baseIntensity = 3f;
    }

    static void BuildProps(Transform root, CaveLayout layout)
    {
        // 刺瞎巨人的橄欖木樁：斜靠在火邊，尖端燒焦。
        var stakePos = OnGround(new Vector3(0.6f, 0f, -0.4f)) + new Vector3(0f, 0.9f, 0f);
        var stake = Primitive(PrimitiveType.Cylinder, "OliveStake", root, stakePos, new Vector3(0.14f, 1.1f, 0.14f), OdysseyPalette.OliveWood);
        stake.transform.rotation = Quaternion.Euler(0f, 30f, 65f);
        var tip = Primitive(PrimitiveType.Cylinder, "StakeTip", stake.transform, Vector3.zero, Vector3.one, OdysseyPalette.StakeTip);
        tip.transform.localPosition = new Vector3(0f, 0.9f, 0f);
        tip.transform.localScale = new Vector3(0.7f, 0.15f, 0.7f);
        Object.Destroy(tip.GetComponent<Collider>());

        // 乳酪架（三層木板）
        var wood = OdysseyPalette.RackWood;
        var rackBase = OnGround(new Vector3(10f, 0f, -3.5f));
        for (int i = 0; i < 3; i++)
            Primitive(PrimitiveType.Cube, "CheeseShelf", root, rackBase + new Vector3(0f, 0.4f + i * 0.5f, 0f), new Vector3(0.5f, 0.05f, 2f), wood);
        for (int i = 0; i < 4; i++)
            Primitive(PrimitiveType.Cylinder, "Cheese", root, rackBase + new Vector3(0f, 0.5f + (i % 3) * 0.5f, -0.6f + i * 0.4f), new Vector3(0.35f, 0.06f, 0.35f), OdysseyPalette.Cheese);

        // 奶桶
        Primitive(PrimitiveType.Cylinder, "MilkPail", root, layout.BucketPosition + new Vector3(0f, 0.3f, 0f), new Vector3(0.5f, 0.3f, 0.5f), OdysseyPalette.MilkPail);
    }

    static Light BuildMoonlight(Transform root)
    {
        var moon = new GameObject("Moonlight").AddComponent<Light>();
        moon.transform.SetParent(root, false);
        moon.transform.position = new Vector3(0f, 3f, 20f);
        moon.transform.rotation = Quaternion.LookRotation(new Vector3(0f, -0.15f, -1f));
        moon.type = LightType.Spot;
        moon.color = OdysseyPalette.MoonLight;
        moon.intensity = 4f;
        moon.range = 30f;
        moon.spotAngle = 50f;
        moon.shadows = LightShadows.Soft;
        return moon;
    }

    static GameObject MeshObject(string name, Transform root, Vector3[] vertices, List<int> triangles, Color color)
    {
        var mesh = new Mesh { name = name, indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
        mesh.vertices = vertices;
        mesh.triangles = triangles.ToArray();
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();

        var go = new GameObject(name);
        go.transform.SetParent(root, false);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        go.AddComponent<MeshRenderer>().sharedMaterial = OdysseyMaterials.Create(color);
        go.AddComponent<MeshCollider>().sharedMesh = mesh;
        return go;
    }

    static GameObject Primitive(PrimitiveType type, string name, Transform parent, Vector3 position, Vector3 scale, Color color, Color? emission = null)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        go.transform.SetParent(parent, false);
        go.transform.position = position;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = OdysseyMaterials.Create(color, emission);
        return go;
    }
}
