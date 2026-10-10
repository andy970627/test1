using System.Collections.Generic;
using UnityEngine;

/// <summary>BlindCaveBuilder 產生的洞穴：原本的岩洞位置、巨石、石子散落點。</summary>
public struct BlindCaveLayout
{
    public CaveLayout Cave;
    public Boulder Boulder;
    public Vector3[] StoneSpots;
}

/// <summary>
/// 巨人被刺瞎後的洞穴：沿用 CaveBuilder 的岩洞形狀，熄掉炭火與月光，
/// 所有表面換成回聲材質，洞口用巨石封住，地上散落石子。
/// </summary>
public static class BlindCaveBuilder
{
    const int StoneCount = 6;
    const float StoneSpacing = 2f;
    const float StoneBoulderClearance = 3f;

    public static BlindCaveLayout Build(Transform root, int seed)
    {
        var cave = CaveBuilder.Build(root, seed);

        foreach (string name in new[] { "Embers", "Moonlight" })
        {
            var t = root.Find(name);
            if (t == null)
                continue;
            t.gameObject.SetActive(false);
            Object.Destroy(t.gameObject);
        }
        RenderSettings.ambientLight = Color.black;
        RenderSettings.fog = false;

        foreach (var r in root.GetComponentsInChildren<Renderer>())
        {
            var source = r.sharedMaterial;
            Color color = source != null && source.HasProperty("_BaseColor") ? source.GetColor("_BaseColor") : Color.gray;
            r.sharedMaterial = EchoMaterials.Create(color);
        }

        var boulder = new GameObject("Boulder").AddComponent<Boulder>();
        boulder.transform.SetParent(root, false);
        Vector3 boulderBase = cave.EntrancePoint + new Vector3(0f, 0f, 0.8f);
        boulderBase.y = CaveBuilder.GroundHeight(boulderBase);
        boulder.Init(boulderBase);

        return new BlindCaveLayout
        {
            Cave = cave,
            Boulder = boulder,
            StoneSpots = PickStoneSpots(cave.Floor, boulderBase, new System.Random(seed + 7)),
        };
    }

    static Vector3[] PickStoneSpots(Bounds floor, Vector3 boulder, System.Random rng)
    {
        var spots = new List<Vector3>(StoneCount);
        for (int attempt = 0; attempt < 500 && spots.Count < StoneCount; attempt++)
        {
            var p = new Vector3(
                floor.min.x + (float)rng.NextDouble() * floor.size.x,
                0f,
                floor.min.z + (float)rng.NextDouble() * floor.size.z);
            if (Vector3.Distance(p, new Vector3(boulder.x, 0f, boulder.z)) < StoneBoulderClearance)
                continue;
            bool crowded = false;
            foreach (var s in spots)
                if (Vector3.Distance(new Vector3(s.x, 0f, s.z), p) < StoneSpacing)
                    crowded = true;
            if (crowded)
                continue;
            p.y = CaveBuilder.GroundHeight(p);
            spots.Add(p);
        }
        return spots.ToArray();
    }
}
