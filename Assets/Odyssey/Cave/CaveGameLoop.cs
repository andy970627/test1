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
    public float entranceGrabBlock = 2f;
    public float hintSeconds = 12f;

    [Tooltip("過場播放速度倍率；2 = 所有淡入淡出與停留時間減半。")]
    public float transitionSpeed = 2f;

    readonly CrewRoster roster = new();
    readonly List<string> deaths = new();
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

        // 洞外的海風：越接近洞口越大聲。
        var wind = new GameObject("SeaWind").AddComponent<AudioSource>();
        wind.transform.SetParent(caveRoot, false);
        wind.transform.position = layout.OutsidePoint + Vector3.up;
        wind.clip = ProceduralAudio.SeaWind();
        wind.loop = true;
        wind.spatialBlend = 1f;
        wind.rolloffMode = AudioRolloffMode.Linear;
        wind.minDistance = 2f;
        wind.maxDistance = 24f;
        wind.volume = 0.8f;
        wind.Play();

        logPath = Path.Combine(Application.persistentDataPath, "cyclops_playtest.csv");
        if (!File.Exists(logPath))
            PlaytestCsv.TryAppend(logPath, PlaytestCsv.Header, out _);
        Debug.Log($"CaveGameLoop: 實測紀錄寫入 {logPath}");

        ResetRound();
    }

    void Start() => BeginIntro();

    void BeginIntro()
    {
        player.InputEnabled = false;
        Show($"第 {roster.Night} 夜", "被困在獨眼巨人的洞穴", $"剩下 {roster.Remaining} 名同伴", ResetRound, StartSneak);
    }

    /// <summary>過場結束，回到洞底開始選羊。</summary>
    void StartSneak()
    {
        state.IntroDone();
        flock.Running = true;
        player.InputEnabled = true;
        roundStart = Time.time;
        hintUntil = Time.time + hintSeconds;
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
        UpdateDawn();
        var keyboard = Keyboard.current;
        if (keyboard != null && keyboard.f1Key.wasPressedThisFrame)
            showDebug = !showDebug;
        if (waitingRestart && keyboard != null && keyboard.rKey.wasPressedThisFrame)
        {
            waitingRestart = false;
            state.Restart();
            deaths.Clear();
            BeginIntro();
            return;
        }

        if (state.Phase == LoopPhase.Sneak)
            UpdateSneak(keyboard);
        else if (state.Phase == LoopPhase.Cling)
            UpdateCling();
    }

    /// <summary>羊群出洞的進度用天色表現：羊越走越少，洞口的月光越轉成黎明的暖色、越亮。</summary>
    void UpdateDawn()
    {
        if (layout.Moonlight == null || flock.sheepCount <= 0)
            return;
        float progress = 1f - (float)flock.RemainingInCave / flock.sheepCount;
        layout.Moonlight.color = Color.Lerp(new Color(0.55f, 0.65f, 1f), new Color(1f, 0.72f, 0.5f), progress);
        layout.Moonlight.intensity = Mathf.Lerp(4f, 7f, progress);
    }

    void UpdateSneak(Keyboard keyboard)
    {
        Vector3 p = player.transform.position;
        float toEntrance = Flat(p - layout.EntrancePoint).magnitude;

        float emitted = player.CurrentNoise * (toEntrance < nearEntranceRadius ? nearEntranceNoiseMultiplier : 1f);
        if (player.CurrentNoise > 0f && Flat(p - layout.BucketPosition).magnitude < bucketBumpRadius)
            emitted = Mathf.Max(emitted, bucketBumpNoise);
        // 以聲量是否仍高於門檻觸發（巨人正在摸羊或掃手時會略過，空下手後只要還吵就再掃）。
        noise.Tick(Time.deltaTime, emitted, flock.IsMasked(p));
        if (noise.IsAbove)
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
            // 快走到巨人面前的羊也不行：一鑽進去就要被摸背，來不及反應。
            if (s.State == SheepState.Queued && Flat(s.transform.position - layout.EntrancePoint).magnitude < entranceGrabBlock)
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
        RoundRecord record = state.Fail(reason);
        int night = record.Night;

        flock.Running = false;
        player.InputEnabled = false;
        cyclops.Roar();
        if (phase == LoopPhase.Sneak)
            player.FaceTowards(cyclops.HeadPosition);

        string cause = FailReasonText.Describe(reason);
        deaths.Add($"第 {night} 夜：{cause}");

        // 死亡原因與下一夜合成同一個過場，緊接在被抓之後，不再另外播開場。
        if (state.Phase == LoopPhase.Wiped)
            Show($"第 {night} 夜", "洞裡只剩下你。", cause, null, () => waitingRestart = true);
        else
            Show($"第 {night} 夜・{cause}", "巨人吃掉了一名同伴", $"第 {roster.Night} 夜・剩下 {roster.Remaining} 名同伴", ResetRound, () =>
            {
                state.CaughtDone();
                StartSneak();
            });
        Log(phase, reason.ToString(), record.Night, record.Crew);
    }

    void Escape()
    {
        if (state.Phase != LoopPhase.Cling)
            return;
        state.Escape();
        Show("", "你逃出去了。", "但你對著巨人喊出了自己的名字。", null, () => waitingRestart = true);
        Log(LoopPhase.Cling, "Escaped", roster.Night, roster.Remaining);
    }

    void Show(string year, string title, string subtitle, Action onBlackout, Action onComplete)
    {
        if (LoopFailScreen.Instance != null)
        {
            LoopFailScreen.Instance.ShowMessage(year, title, subtitle, onBlackout, onComplete, transitionSpeed);
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

    /// <summary>night／crew 是這一輪當時的夜數與同伴數（被吃之前）。寫不進去只警告，不影響遊戲。</summary>
    void Log(LoopPhase phase, string outcome, int night, int crew)
    {
        bool ram = clingSheep != null && clingSheep.IsRam;
        string line = PlaytestCsv.Line(DateTime.Now, night, crew, ram, phase, outcome, Time.time - roundStart);
        Debug.Log("[Cyclops] " + line);
        if (!PlaytestCsv.TryAppend(logPath, line, out string error))
            Debug.LogWarning($"CaveGameLoop: 無法寫入實測紀錄（檔案可能正被其他程式開著）：{error}");
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);

    void OnGUI()
    {
        // 字級跟著螢幕高度放大，Game 視窗縮小時也讀得到。
        int fontSize = Mathf.Max(22, Screen.height / 28);
        var style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, wordWrap = true };
        style.normal.textColor = new Color(0.95f, 0.93f, 0.87f);
        float line = fontSize * 1.4f;

        string bottom = null;
        if (Time.time < hintUntil)
            bottom = state.Phase == LoopPhase.Cling
                ? "滑鼠左/右鍵＝左/右手抓緊・空白鍵憋氣・A/D 往左/右貼\n滑鼠轉頭・按住 Shift 往貼的那側探頭（那側的手會放開）"
                : "WASD 蹲著移動・滑鼠看・對著羊按住 E 鑽到羊肚下";
        else if (waitingRestart && (LoopFailScreen.Instance == null || !LoopFailScreen.Instance.IsPlaying))
            bottom = "按 R 重新開始";
        if (bottom != null)
        {
            float h = line * 2.2f;
            GUI.Box(new Rect(10, Screen.height - h - 10, Screen.width - 20, h), GUIContent.none);
            GUI.Label(new Rect(24, Screen.height - h - 4, Screen.width - 48, h), bottom, style);
        }

        if (showDebug)
            DrawDebugPanel(style, fontSize, line);
    }

    static readonly Color Good = new(0.35f, 0.8f, 0.4f);
    static readonly Color Warn = new(0.95f, 0.75f, 0.2f);
    static readonly Color Danger = new(0.9f, 0.25f, 0.2f);
    static readonly Color Track = new(1f, 1f, 1f, 0.15f);

    /// <summary>F1 除錯面板：用長條、點數與羊的示意圖表示數值，不顯示原始數字。</summary>
    void DrawDebugPanel(GUIStyle style, int fontSize, float line)
    {
        var m = cling.Model;
        float width = Mathf.Min(Screen.width - 20, fontSize * 20f);
        float labelWidth = fontSize * 5.5f;
        float barWidth = width - labelWidth - 40f;
        float barHeight = fontSize * 0.7f;
        int rows = 4 + (m != null ? 6 : 1) + Mathf.Min(5, deaths.Count) + (deaths.Count > 0 ? 1 : 0);
        GUI.Box(new Rect(10, 10, width, rows * line + 24), GUIContent.none);
        float y = 20f;

        Row(style, ref y, line, labelWidth, PhaseName(state.Phase) + $"・第 {roster.Night} 夜");
        Pips(new Rect(28 + labelWidth, y + (line - barHeight) / 2f, barWidth, barHeight), roster.Remaining, CrewRoster.StartingCrew, Good);
        Row(style, ref y, line, labelWidth, "同伴");
        Pips(new Rect(28 + labelWidth, y + (line - barHeight) / 2f, barWidth, barHeight), flock.RemainingInCave, flock.sheepCount, new Color(0.85f, 0.82f, 0.74f));
        Row(style, ref y, line, labelWidth, "洞裡的羊");
        Bar(new Rect(28 + labelWidth, y + (line - barHeight) / 2f, barWidth, barHeight), noise.Level, noise.IsAbove ? Danger : Good, noise.Threshold);
        Row(style, ref y, line, labelWidth, "聲量");

        if (m != null)
        {
            Bar(new Rect(28 + labelWidth, y + (line - barHeight) / 2f, barWidth, barHeight), m.GripLeft, m.GripLeft < 0.3f ? Danger : Good);
            Row(style, ref y, line, labelWidth, "左手握力");
            Bar(new Rect(28 + labelWidth, y + (line - barHeight) / 2f, barWidth, barHeight), m.GripRight, m.GripRight < 0.3f ? Danger : Good);
            Row(style, ref y, line, labelWidth, "右手握力");
            Bar(new Rect(28 + labelWidth, y + (line - barHeight) / 2f, barWidth, barHeight), m.Slide, m.Slide > 0.6f ? Danger : Warn);
            Row(style, ref y, line, labelWidth, "下滑");
            Bar(new Rect(28 + labelWidth, y + (line - barHeight) / 2f, barWidth, barHeight), m.Oxygen, m.Oxygen < 0.3f ? Danger : new Color(0.35f, 0.6f, 0.95f));
            Row(style, ref y, line, labelWidth, m.HoldingBreath ? "氧氣（憋氣）" : "氧氣");
            SheepDiagram(new Rect(28 + labelWidth, y, barWidth, line * 2f - 6f), m);
            Row(style, ref y, line, labelWidth, "巨人的手");
            Row(style, ref y, line, labelWidth, m.IsPeeking ? "（探頭中）" : "");
        }
        else
        {
            Row(style, ref y, line, labelWidth, "（尚未抱上羊）");
        }

        if (deaths.Count > 0)
        {
            Row(style, ref y, line, width, "死亡紀錄");
            for (int i = Mathf.Max(0, deaths.Count - 5); i < deaths.Count; i++)
                Row(style, ref y, line, width, "・" + deaths[i]);
        }
    }

    static void Row(GUIStyle style, ref float y, float line, float labelWidth, string label)
    {
        GUI.Label(new Rect(24, y, Mathf.Max(labelWidth, 400f), line), label, style);
        y += line;
    }

    static void Bar(Rect r, float value, Color fill, float? marker = null)
    {
        Fill(r, Track);
        Fill(new Rect(r.x, r.y, r.width * Mathf.Clamp01(value), r.height), fill);
        if (marker.HasValue)
            Fill(new Rect(r.x + r.width * marker.Value - 1.5f, r.y - 3f, 3f, r.height + 6f), Color.white);
    }

    static void Pips(Rect r, int count, int total, Color color)
    {
        float size = r.height;
        float gap = Mathf.Min(size * 0.5f, (r.width - size * total) / Mathf.Max(1, total - 1));
        for (int i = 0; i < total; i++)
            Fill(new Rect(r.x + i * (size + gap), r.y, size, size), i < count ? color : Track);
    }

    /// <summary>從上往下看的羊：中間是羊背，左右兩格是羊側。巨人的手在哪一格就亮哪一格；藍點是你貼的那一側。</summary>
    void SheepDiagram(Rect r, ClingModel m)
    {
        PatStep? step = cyclops.PattingSheep != null && cyclops.PattingSheep == clingSheep ? cyclops.CurrentStep : null;
        float w = r.height * 1.6f;
        var back = new Rect(r.x + w * 0.35f, r.y, w * 0.9f, r.height);
        var left = new Rect(r.x, r.y, w * 0.32f, r.height);
        var right = new Rect(back.xMax + w * 0.03f, r.y, w * 0.32f, r.height);
        Fill(left, Track);
        Fill(back, new Color(0.85f, 0.82f, 0.74f, 0.35f));
        Fill(right, Track);
        if (step.HasValue)
        {
            var s = step.Value;
            Rect side = s.Side == Side.Left ? left : right;
            if (s.Kind == PatKind.Back)
                Fill(back, Warn);
            else
                Fill(side, s.Kind == PatKind.Side ? Danger : Warn);
        }
        Rect leanSide = m.Lean == Side.Left ? left : right;
        float dot = leanSide.width * 0.6f;
        Fill(new Rect(leanSide.center.x - dot / 2f, leanSide.center.y - dot / 2f, dot, dot), new Color(0.35f, 0.6f, 0.95f));
        if (cyclops.PattingSheep != null && cyclops.PattingSheep != clingSheep)
            Fill(new Rect(right.xMax + 12f, r.center.y - 4f, r.height * 0.5f, 8f), Warn); // 正在摸前面的羊
    }

    static void Fill(Rect r, Color c)
    {
        var old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }

    static string PhaseName(LoopPhase phase) => phase switch
    {
        LoopPhase.Intro => "過場",
        LoopPhase.Sneak => "選羊",
        LoopPhase.Cling => "抱緊",
        LoopPhase.Caught => "被抓",
        LoopPhase.Escaped => "逃出",
        LoopPhase.Wiped => "全滅",
        _ => phase.ToString(),
    };
}
