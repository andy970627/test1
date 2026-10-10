using System;
using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>生成羊群、依 FlockSchedule 讓羊一隻隻排隊出洞（大公羊固定最後），並回報羊叫聲的遮蔽範圍。</summary>
public class SheepFlock : MonoBehaviour
{
    public int sheepCount = 9;
    public float firstExitDelay = 10f;
    public float exitInterval = 8f;
    public float bleatMaskRadius = 3f;

    const int RamIndex = 0;

    readonly List<Sheep> sheep = new();
    FlockSchedule schedule;
    float timer;
    int nextPosition;
    Sheep lastQueued;

    public IReadOnlyList<Sheep> All => sheep;
    public bool AllGone => sheep.Count > 0 && sheep.TrueForAll(s => s.State == SheepState.Gone);

    /// <summary>出洞倒數是否在走（開場黑畫面時暫停）。</summary>
    public bool Running { get; set; }

    public event Action<Sheep> SheepReachedEntrance;

    public void Spawn(CaveLayout layout, int seed)
    {
        foreach (var s in sheep)
            if (s != null)
                Destroy(s.gameObject);
        sheep.Clear();

        var rng = new System.Random(seed);
        var b = layout.Floor;
        for (int i = 0; i < sheepCount; i++)
        {
            var go = new GameObject(i == RamIndex ? "Ram" : "Sheep" + i);
            go.transform.SetParent(transform, false);
            var p = new Vector3(Mathf.Lerp(b.min.x, b.max.x, (float)rng.NextDouble()), 0f, Mathf.Lerp(b.min.z, b.max.z, (float)rng.NextDouble()));
            p.y = CaveBuilder.GroundHeight(p);
            go.transform.SetPositionAndRotation(p, Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f));
            var s = go.AddComponent<Sheep>();
            s.Init(i == RamIndex, layout);
            s.ReachedEntrance += OnReachedEntrance;
            sheep.Add(s);
        }

        schedule = new FlockSchedule(sheepCount, RamIndex, firstExitDelay, exitInterval, rng);
        timer = 0f;
        nextPosition = 0;
        lastQueued = null;
        Running = false;
    }

    public bool IsMasked(Vector3 position)
    {
        foreach (var s in sheep)
            if (s.IsBleating && Vector3.Distance(s.transform.position, position) <= bleatMaskRadius)
                return true;
        return false;
    }

    /// <summary>距離下一隻羊出發排隊還有幾隻（含尚未出發的）。</summary>
    public int RemainingInCave
    {
        get
        {
            int n = 0;
            foreach (var s in sheep)
                if (s.State != SheepState.Gone && s.State != SheepState.Exiting)
                    n++;
            return n;
        }
    }

    void Update()
    {
        if (!Running || schedule == null)
            return;
        timer += Time.deltaTime;
        while (nextPosition < sheep.Count && timer >= schedule.ExitTime(nextPosition))
        {
            var s = sheep[schedule.Order[nextPosition]];
            s.Ahead = lastQueued;
            s.SendToQueue();
            lastQueued = s;
            nextPosition++;
        }
    }

    void OnReachedEntrance(Sheep s) => SheepReachedEntrance?.Invoke(s);
}
