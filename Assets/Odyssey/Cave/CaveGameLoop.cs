using System;
using System.Collections.Generic;
using System.IO;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 一整輪：開場（第 N 夜）→ 洞底選羊 → 抱在羊肚下撐過洞口 → 逃出或被抓（吃掉一名同伴）→ 下一夜。
/// 同時負責 F1 除錯面板、操作提示與 CSV 紀錄。
/// </summary>
public class CaveGameLoop : MonoBehaviour
{
    public float grabHoldSeconds = 1f;
    public float grabRange = 1.5f;
    public float grabAngle = 50f;
    public float escapeDistance = 6f;
    public float nearEntranceRadius = 8f;
    public float nearEntranceNoiseMultiplier = 2.5f;
    public float bucketBumpNoise = 1f;
    public float bucketBumpRadius = 0.8f;
    public float doorwayRadius = 2f;
    public float hintSeconds = 12f;

    readonly CrewRoster roster = new();
    readonly List<GameObject> crewFigures = new();
    CaveLoopState state;
    CaveLayout layout;
    Transform caveRoot;
    FirstPersonPlayer player;
    Cyclops cyclops;
    SheepFlock flock;
    ClingController cling;
    NoiseModel noise = new();
    Sheep clingSheep;
    int seed = 1;
    float roundStart;
    float grabTimer;
    float hintUntil;
    bool waitingRestart;
    bool showDebug;
    string logPath;

    void Awake()
    {
        state = new CaveLoopState(roster);
        caveRoot = new GameObject("Cave").transform;
        layout = CaveBuilder.Build(caveRoot, seed);

        player = new GameObject("Player").AddComponent<FirstPersonPlayer>();
        cyclops = new GameObject("Cyclops").AddComponent<Cyclops>();
        cyclops.transform.SetParent(caveRoot, false);
        cyclops.Init(layout, seed);
        flock = new GameObject("Flock").AddComponent<SheepFlock>();
        cling = gameObject.AddComponent<ClingController>();

        flock.SheepReachedEntrance += cyclops.PatSheep;
        cyclops.PatFinished += s => s.ContinueOutside();
        cling.Failed += Fail;

        logPath = Path.Combine(Application.persistentDataPath, "cyclops_playtest.csv");
        if (!File.Exists(logPath))
            File.WriteAllText(logPath, PlaytestCsv.Header + "\n");
        Debug.Log($"CaveGameLoop: 實測紀錄寫入 {logPath}");

        ResetRound();
    }

    void Start() => BeginIntro();

    void BeginIntro()
    {
        player.InputEnabled = false;
        Show($"第 {roster.Night} 夜", "被困在獨眼巨人的洞穴", $"剩下 {roster.Remaining} 名同伴", ResetRound, () =>
        {
            state.IntroDone();
            flock.Running = true;
            player.InputEnabled = true;
            roundStart = Time.time;
            hintUntil = Time.time + hintSeconds;
        });
    }

    /// <summary>黑畫面時重置：羊群重新生成、巨人放下手、玩家回洞底、角落的同伴重新排好。</summary>
    void ResetRound()
    {
        if (cling.Sheep != null)
            cling.End();
        clingSheep = null;
        cyclops.ResetRound();
        flock.Spawn(layout, ++seed);
        foreach (var s in flock.All)
            s.ReachedOutside += OnSheepOutside;

        player.SetBodyActive(true);
        Vector3 toFire = new Vector3(-1f, 0f, -1f) - layout.PlayerSpawn;
        player.Teleport(layout.PlayerSpawn + Vector3.up * 0.05f, Mathf.Atan2(toFire.x, toFire.z) * Mathf.Rad2Deg);

        noise = new NoiseModel();
        grabTimer = 0f;
        waitingRestart = false;
        PlaceCrew();
    }

    void Update()
    {
        var keyboard = Keyboard.current;
        if (keyboard != null && keyboard.f1Key.wasPressedThisFrame)
            showDebug = !showDebug;
        if (waitingRestart && keyboard != null && keyboard.rKey.wasPressedThisFrame)
        {
            waitingRestart = false;
            state.Restart();
            BeginIntro();
            return;
        }

        if (state.Phase == LoopPhase.Sneak)
            UpdateSneak(keyboard);
        else if (state.Phase == LoopPhase.Cling)
            UpdateCling();
    }

    void UpdateSneak(Keyboard keyboard)
    {
        Vector3 p = player.transform.position;
        float toEntrance = Flat(p - layout.EntrancePoint).magnitude;

        float emitted = player.CurrentNoise * (toEntrance < nearEntranceRadius ? nearEntranceNoiseMultiplier : 1f);
        if (player.CurrentNoise > 0f && Flat(p - layout.BucketPosition).magnitude < bucketBumpRadius)
            emitted = Mathf.Max(emitted, bucketBumpNoise);
        if (noise.Tick(Time.deltaTime, emitted, flock.IsMasked(p)))
            cyclops.SweepToward(p);

        // 巨人堵在洞口：想自己走出去，一定會被抓。
        if (toEntrance < doorwayRadius)
            cyclops.SweepToward(p);
        if (cyclops.SweepHits(p) || p.z > layout.EntrancePoint.z + 0.5f)
        {
            Fail(FailReason.Swept);
            return;
        }

        Sheep target = keyboard != null && keyboard.eKey.isPressed ? GrabTarget() : null;
        grabTimer = target != null ? grabTimer + Time.deltaTime : 0f;
        if (target != null && grabTimer >= grabHoldSeconds)
        {
            StartCling(target);
            return;
        }

        if (flock.AllGone)
            Fail(FailReason.FlockGone);
    }

    Sheep GrabTarget()
    {
        Transform cam = player.CameraTransform;
        Vector3 forward = Flat(cam.forward).normalized;
        Sheep best = null;
        float bestDistance = grabRange;
        foreach (var s in flock.All)
        {
            // 已經在洞口被摸或出洞的羊鑽不進去。
            if (s.State != SheepState.Wandering && s.State != SheepState.Queued)
                continue;
            Vector3 to = Flat(s.transform.position - player.transform.position);
            float d = to.magnitude;
            if (d > bestDistance || Vector3.Angle(forward, to) > grabAngle)
                continue;
            best = s;
            bestDistance = d;
        }
        return best;
    }

    void StartCling(Sheep sheep)
    {
        clingSheep = sheep;
        player.SetBodyActive(false);
        cling.Begin(sheep, player.Camera, cyclops);
        state.Grabbed();
        hintUntil = Time.time + hintSeconds;
    }

    void UpdateCling()
    {
        if (clingSheep != null && clingSheep.State == SheepState.Exiting
            && Flat(clingSheep.transform.position - layout.EntrancePoint).magnitude > escapeDistance)
            Escape();
    }

    void OnSheepOutside(Sheep sheep)
    {
        if (state.Phase == LoopPhase.Cling && sheep == clingSheep)
            Escape();
    }

    void Fail(FailReason reason)
    {
        if (state.Phase != LoopPhase.Sneak && state.Phase != LoopPhase.Cling)
            return;
        LoopPhase phase = state.Phase;
        int night = roster.Night;
        state.Fail(reason);
        Log(phase, reason.ToString());

        flock.Running = false;
        player.InputEnabled = false;
        cyclops.Roar();
        if (phase == LoopPhase.Sneak)
            player.FaceTowards(cyclops.HeadPosition);

        if (state.Phase == LoopPhase.Wiped)
            Show($"第 {night} 夜", "洞裡只剩下你。", "", null, () => waitingRestart = true);
        else
            Show($"第 {night} 夜", "巨人吃掉了一名同伴", "再試一次。", ResetRound, () =>
            {
                state.CaughtDone();
                BeginIntro();
            });
    }

    void Escape()
    {
        if (state.Phase != LoopPhase.Cling)
            return;
        state.Escape();
        Log(LoopPhase.Cling, "Escaped");
        Show("", "你逃出去了。", "但你對著巨人喊出了自己的名字。", null, () => waitingRestart = true);
    }

    void Show(string year, string title, string subtitle, Action onBlackout, Action onComplete)
    {
        if (LoopFailScreen.Instance != null)
        {
            LoopFailScreen.Instance.ShowMessage(year, title, subtitle, onBlackout, onComplete);
            return;
        }
        onBlackout?.Invoke();
        onComplete?.Invoke();
    }

    void PlaceCrew()
    {
        foreach (var go in crewFigures)
            Destroy(go);
        crewFigures.Clear();
        var color = new Color(0.12f, 0.1f, 0.09f);
        for (int i = 0; i < roster.Remaining; i++)
        {
            Vector3 p = layout.CrewCorner + new Vector3((i % 4) * 0.7f, 0f, (i / 4) * 0.7f - 1f);
            p.y = CaveBuilder.GroundHeight(p) + 0.5f;
            var go = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            go.name = "Crewman";
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(caveRoot, false);
            go.transform.position = p;
            go.transform.localScale = new Vector3(0.4f, 0.5f, 0.4f);
            go.GetComponent<Renderer>().sharedMaterial = OdysseyMaterials.Create(color);
            crewFigures.Add(go);
        }
    }

    void Log(LoopPhase phase, string outcome)
    {
        bool ram = clingSheep != null && clingSheep.IsRam;
        string line = PlaytestCsv.Line(DateTime.Now, roster.Night, roster.Remaining, ram, phase, outcome, Time.time - roundStart);
        File.AppendAllText(logPath, line + "\n");
        Debug.Log("[Cyclops] " + line);
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);

    void OnGUI()
    {
        var style = new GUIStyle(GUI.skin.label) { fontSize = 18, wordWrap = true };
        style.normal.textColor = new Color(0.9f, 0.88f, 0.82f);

        if (Time.time < hintUntil)
        {
            string hint = state.Phase == LoopPhase.Cling
                ? "滑鼠左/右鍵＝左/右手抓緊・空白鍵憋氣・A/D 往左/右貼"
                : "WASD 蹲著移動・滑鼠看・對著羊按住 E 鑽到羊肚下";
            GUI.Label(new Rect(20, Screen.height - 60, Screen.width - 40, 50), hint, style);
        }
        if (waitingRestart && (LoopFailScreen.Instance == null || !LoopFailScreen.Instance.IsPlaying))
            GUI.Label(new Rect(20, Screen.height - 60, Screen.width - 40, 50), "按 R 重新開始", style);

        if (!showDebug)
            return;
        var m = cling.Model;
        PatStep? step = cyclops.CurrentStep;
        string stepText = step.HasValue ? $"{step.Value.Kind}・{(step.Value.Side == Side.Left ? "左" : "右")}" : "—";
        GUI.Box(new Rect(10, 10, 460, 230), GUIContent.none);
        GUI.Label(new Rect(20, 15, 440, 225),
            $"階段：{state.Phase}・第 {roster.Night} 夜・同伴 {roster.Remaining}\n" +
            $"聲量：{noise.Level:F2}（門檻 {noise.Threshold:F2}）・洞裡剩 {flock.RemainingInCave} 隻羊\n" +
            (m != null
                ? $"握力 左 {m.GripLeft:F2} 右 {m.GripRight:F2}・下滑 {m.Slide:F2}\n氧氣 {m.Oxygen:F2}・重心 {(m.Lean == Side.Left ? "左" : "右")}・噪音 {m.Noise:F2}\n"
                : "（尚未抱上羊）\n\n") +
            $"巨人：{stepText}{(cyclops.PattingSheep == clingSheep && clingSheep != null ? "（摸的是你這隻）" : "")}\n" +
            $"紀錄：{logPath}", style);
    }
}
