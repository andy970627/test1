using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// 巨石的外形（規格第 32 節 C）：在單位方塊（−0.5～0.5）裡做一塊圓角、表面凹凸的低多邊形岩石，
/// 掛在巨石本體下面，由本體的縮放撐成 6 × 3.6 × 1.8 m。朝洞內推的那一面保持平整，
/// 刻痕與月光邊仍貼在上面。每個三角形各自的頂點，呈現平面著色的稜角感。
/// </summary>
public static class BoulderMesh
{
    const float Roundness = 3.2f;
    const float Bumpiness = 0.07f;

    public static Mesh Build(int grid, int seed)
    {
        var rng = new System.Random(seed);
        // 同一個方塊面上的點先算好形狀，再拆成獨立三角形。
        var cache = new Dictionary<Vector3Int, Vector3>();
        var vertices = new List<Vector3>();
        var triangles = new List<int>();
        Vector3[] normals = { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back };
        foreach (var n in normals)
        {
            Vector3 u = new Vector3(n.y, n.z, n.x);
            Vector3 v = Vector3.Cross(n, u);
            for (int i = 0; i < grid; i++)
                for (int j = 0; j < grid; j++)
                {
                    Vector3 a = Shape(n, u, v, i, j, grid, cache, rng);
                    Vector3 b = Shape(n, u, v, i + 1, j, grid, cache, rng);
                    Vector3 c = Shape(n, u, v, i + 1, j + 1, grid, cache, rng);
                    Vector3 d = Shape(n, u, v, i, j + 1, grid, cache, rng);
                    AddTriangle(vertices, triangles, a, b, c, n);
                    AddTriangle(vertices, triangles, a, c, d, n);
                }
        }
        var mesh = new Mesh { name = "Boulder" };
        mesh.SetVertices(vertices);
        mesh.SetTriangles(triangles, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    /// <summary>方塊面上第 (i, j) 格的點：先推成圓角方塊（超橢球），再往內隨機凹一點；推的那一面（−Z）不凹。</summary>
    static Vector3 Shape(Vector3 n, Vector3 u, Vector3 v, int i, int j, int grid, Dictionary<Vector3Int, Vector3> cache, System.Random rng)
    {
        Vector3 p = 0.5f * n + (i / (float)grid - 0.5f) * u + (j / (float)grid - 0.5f) * v;
        var key = Vector3Int.RoundToInt(p * grid * 2f);
        if (cache.TryGetValue(key, out Vector3 done))
            return done;
        float sum = Mathf.Pow(Mathf.Abs(p.x), Roundness) + Mathf.Pow(Mathf.Abs(p.y), Roundness) + Mathf.Pow(Mathf.Abs(p.z), Roundness);
        Vector3 q = p / Mathf.Pow(sum, 1f / Roundness) * 0.5f;
        bool pushFace = q.z < -0.45f && Mathf.Abs(q.x) < 0.45f && Mathf.Abs(q.y) < 0.45f;
        if (!pushFace)
            q *= 1f - Bumpiness * (float)rng.NextDouble();
        cache[key] = q;
        return q;
    }

    static void AddTriangle(List<Vector3> vertices, List<int> triangles, Vector3 a, Vector3 b, Vector3 c, Vector3 outward)
    {
        // 確保三角形朝外。
        if (Vector3.Dot(Vector3.Cross(b - a, c - a), outward) < 0f)
            (b, c) = (c, b);
        int start = vertices.Count;
        vertices.Add(a);
        vertices.Add(b);
        vertices.Add(c);
        triangles.Add(start);
        triangles.Add(start + 1);
        triangles.Add(start + 2);
    }
}
