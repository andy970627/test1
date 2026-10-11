using System.Collections.Generic;
using UnityEngine;

/// <summary>BlindCaveBuilder 產生的洞穴：原本的岩洞位置、巨石、石子散落點、同伴躲藏點、木樁、雜物。</summary>
public struct BlindCaveLayout
{
    public CaveLayout Cave;
    public Boulder Boulder;
    public Vector3[] StoneSpots;
    public Vector3[] CrewSpots;
    public Vector3 StakeSpot;
    public MilkPail[] Pails;
    public CheeseRack Rack;
    public WickerPen[] Pens;
}

/// <summary>
/// 巨人被刺瞎後的洞穴：沿用 CaveBuilder 的岩洞形狀，熄掉炭火與月光，
/// 所有表面換成回聲材質，洞口用巨石封住，地上散落石子，加上奶桶、乳酪架、柳條羊圈。
/// </summary>
public static class BlindCaveBuilder
{
    const int StoneCount = 6;
    const float StoneSpacing = 2f;
    const float StoneBoulderClearance = 3f;

    const int CrewSpotCount = 12;
    const float CrewSpacing = 3f;
    const float CrewBoulderClearance = 5f;
    const float StakeBoulderClearance = 6f;
    const int ExtraPails = 2;
    const float PailSpacing = 2f;
    static readonly Vector2 PenSize = new(4f, 3f);
    const float PenBoulderClearance = 5f;
    const float PenStepScale = 0.5f;

    public static BlindCaveLayout Build(Transform root, int seed)
    {
        var cave = CaveBuilder.Build(root, seed);

        // 原本裝飾用的木樁、奶桶、乳酪換成會動的版本；乳酪架的木板留著。
        foreach (string name in new[] { "Embers", "Moonlight", "OliveStake", "MilkPail", "Cheese" })
            foreach (Transform t in FindAll(root, name))
            {
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

        var rng = new System.Random(seed + 11);
        var pens = BuildPens(root, cave.Floor, boulderBase, rng);
        var pails = BuildPails(root, cave, boulderBase, rng);

        var shelf = root.Find("CheeseShelf");
        var rack = new GameObject("CheeseRack").AddComponent<CheeseRack>();
        rack.transform.SetParent(root, false);
        Vector3 rackPos = shelf != null ? shelf.position : cave.Floor.center;
        rackPos.y = CaveBuilder.GroundHeight(rackPos);
        rack.Init(rackPos);

        return new BlindCaveLayout
        {
            Cave = cave,
            Boulder = boulder,
            StoneSpots = PickSpots(cave.Floor, boulderBase, StoneCount, StoneSpacing, StoneBoulderClearance, new System.Random(seed + 7)),
            CrewSpots = PickCrewSpots(cave.Floor, boulderBase, new System.Random(seed + 13)),
            StakeSpot = PickSpots(cave.Floor, boulderBase, 1, 0f, StakeBoulderClearance, new System.Random(seed + 17))[0],
            Pails = pails,
            Rack = rack,
            Pens = pens,
        };
    }

    /// <summary>腳步聲倍率：在任一羊圈內為 0.5，否則 1。</summary>
    public static float StepScale(BlindCaveLayout layout, Vector3 p)
    {
        if (layout.Pens != null)
            foreach (var pen in layout.Pens)
                if (pen != null && pen.Contains(p))
                    return PenStepScale;
        return 1f;
    }

    static IEnumerable<Transform> FindAll(Transform root, string name)
    {
        var found = new List<Transform>();
        foreach (Transform t in root)
            if (t.name == name)
                found.Add(t);
        return found;
    }

    /// <summary>同伴躲藏點：至少 12 個、彼此 ≥ 3 m、離巨石 ≥ 5 m；洞太擠時逐步放寬間距。</summary>
    static Vector3[] PickCrewSpots(Bounds floor, Vector3 boulder, System.Random rng)
    {
        Vector3[] spots = null;
        for (float spacing = CrewSpacing; spacing >= 1.5f; spacing -= 0.5f)
        {
            spots = PickSpots(floor, boulder, CrewSpotCount, spacing, CrewBoulderClearance, rng);
            if (spots.Length >= CrewSpotCount)
                return spots;
        }
        return spots;
    }

    static Vector3[] PickSpots(Bounds floor, Vector3 boulder, int count, float spacing, float clearance, System.Random rng)
    {
        var spots = new List<Vector3>(count);
        for (int attempt = 0; attempt < 2000 && spots.Count < count; attempt++)
        {
            var p = RandomPoint(floor, rng);
            if (FlatDistance(p, boulder) < clearance)
                continue;
            bool crowded = false;
            foreach (var s in spots)
                if (FlatDistance(s, p) < spacing)
                    crowded = true;
            if (crowded)
                continue;
            p.y = CaveBuilder.GroundHeight(p);
            spots.Add(p);
        }
        if (spots.Count == 0)
            spots.Add(Ground(floor.center));
        return spots.ToArray();
    }

    static MilkPail[] BuildPails(Transform root, CaveLayout cave, Vector3 boulder, System.Random rng)
    {
        var positions = new List<Vector3> { Ground(cave.BucketPosition) };
        positions.AddRange(PickSpots(cave.Floor, boulder, ExtraPails + 1, PailSpacing, StoneBoulderClearance, rng));
        var pails = new List<MilkPail>();
        foreach (var p in positions)
        {
            if (pails.Count >= ExtraPails + 1)
                break;
            bool crowded = false;
            foreach (var other in pails)
                if (FlatDistance(other.transform.position, p) < PailSpacing)
                    crowded = true;
            if (crowded)
                continue;
            var pail = new GameObject("MilkPail").AddComponent<MilkPail>();
            pail.transform.SetParent(root, false);
            pail.Init(p);
            pails.Add(pail);
        }
        return pails.ToArray();
    }

    static WickerPen[] BuildPens(Transform root, Bounds floor, Vector3 boulder, System.Random rng)
    {
        var pens = new List<WickerPen>();
        var rects = new List<Rect>();
        for (int attempt = 0; attempt < 500 && pens.Count < 2; attempt++)
        {
            float x = Mathf.Lerp(floor.min.x + PenSize.x / 2f, floor.max.x - PenSize.x / 2f, (float)rng.NextDouble());
            float z = Mathf.Lerp(floor.min.z + PenSize.y / 2f, floor.max.z - PenSize.y / 2f, (float)rng.NextDouble());
            var rect = new Rect(x - PenSize.x / 2f, z - PenSize.y / 2f, PenSize.x, PenSize.y);
            var nearest = new Vector2(Mathf.Clamp(boulder.x, rect.xMin, rect.xMax), Mathf.Clamp(boulder.z, rect.yMin, rect.yMax));
            if (Vector2.Distance(nearest, new Vector2(boulder.x, boulder.z)) < PenBoulderClearance)
                continue;
            bool overlaps = false;
            foreach (var r in rects)
                if (r.Overlaps(rect))
                    overlaps = true;
            if (overlaps)
                continue;
            rects.Add(rect);
            var pen = new GameObject("WickerPen").AddComponent<WickerPen>();
            pen.transform.SetParent(root, false);
            pen.Init(Ground(new Vector3(x, 0f, z)), PenSize);
            pens.Add(pen);
        }
        return pens.ToArray();
    }

    static Vector3 RandomPoint(Bounds floor, System.Random rng) => new(
        floor.min.x + (float)rng.NextDouble() * floor.size.x,
        0f,
        floor.min.z + (float)rng.NextDouble() * floor.size.z);

    static Vector3 Ground(Vector3 p) => new(p.x, CaveBuilder.GroundHeight(p), p.z);

    static float FlatDistance(Vector3 a, Vector3 b) => Vector2.Distance(new Vector2(a.x, a.z), new Vector2(b.x, b.z));
}
