using System;
using System.Collections.Generic;
using System.IO;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 雙盲洞穴的一夜：火熄了，巨人瞎了，玩家要在天亮前把巨石推出縫鑽出去。
/// 被抓或天亮就吃掉一名同伴，巨石回到原位，下一夜重來。負責過場、操作提示與 CSV 紀錄。
/// </summary>
public class BlindGameLoop : MonoBehaviour
{
    public const int SheepCount = 9;
    public float hintSeconds = 12f;

    [Tooltip("過場播放速度倍率；2 = 所有淡入淡出與停留時間減半。")]
    public float transitionSpeed = 2f;

    readonly List<string> deaths = new();
    readonly List<WanderingSheep> sheep = new();
    readonly List<StonePickup> pickups = new();
    FirstPersonPlayer body;
    EchoPlayer player;
    EchoField echo;
    float nightStart;
    float hintUntil;
    bool waitingRestart;
    string logPath;
    int seed = 1;
    Vector3 lastPlayerPos;
    int insidePen = -1;
    float pullNoiseTimer;
    readonly float[] sheepToFace = new float[SheepCount];
    readonly float[] sheepToGap = new float[SheepCount];

    const float PullNoiseSeconds = 0.5f;
    const float PailReach = 0.6f;
    const float RackReach = 0.8f;
    const float RescueReach = 3f;

    public CaveLoopState State { get; private set; }
    public CrewRoster Roster { get; } = new();
    public BoulderSlide Slide { get; } = new();
    public CrewLine Crew { get; private set; }
    public OliveStake Stake { get; private set; }
    public EchoPlayer Player => player;
    public int RescuedLastEscape { get; private set; }
    public int LostTonight { get; private set; }
    public SheepRush Rush { get; } = new(SheepCount, new System.Random().NextDouble);
    public DawnClock Dawn { get; } = new();
    public DecoyMemory Decoys { get; } = new();
    public BlindCyclops Cyclops { get; private set; }
    public BlindCaveLayout Layout { get; private set; }
    public Vector3 PlayerPosition => body.transform.position;
    public IReadOnlyList<WanderingSheep> Sheep => sheep;
    public IReadOnlyList<string> Deaths => deaths;

    void Awake()
    {
        SoundBus.Clear();
        State = new CaveLoopState(Roster);
        var caveRoot = new GameObject("Cave").transform;
        Layout = BlindCaveBuilder.Build(caveRoot, seed);
        echo = gameObject.AddComponent<EchoField>();
        gameObject.AddComponent<DebugPanel>().Init(this);

        foreach (var spot in Layout.StoneSpots)
        {
            var p = new GameObject("Stone").AddComponent<StonePickup>();
            p.transform.SetParent(caveRoot, false);
            p.Init(spot);
            pickups.Add(p);
        }

        for (int i = 0; i < SheepCount; i++)
        {
            var s = new GameObject(i == 0 ? "Ram" : "Sheep").AddComponent<WanderingSheep>();
            s.transform.SetParent(caveRoot, false);
            s.Init(Layout.Cave.Floor, i == 0, seed * 100 + i);
            sheep.Add(s);
        }

        body = new GameObject("Player").AddComponent<FirstPersonPlayer>();
        player = body.gameObject.AddComponent<EchoPlayer>();
        Crew = new GameObject("Crew").AddComponent<CrewLine>();
        Crew.transform.SetParent(caveRoot, false);
        Crew.Init(body.transform, p => BlindCaveBuilder.StepScale(Layout, p));
        Stake = new GameObject("OliveStake").AddComponent<OliveStake>();
        Stake.Init();
        player.Init(body, Layout.Boulder, Slide, pickups, Stake, Crew, p => BlindCaveBuilder.StepScale(Layout, p));
        player.EscapeRequested += Escape;

        Cyclops = new GameObject("Cyclops").AddComponent<BlindCyclops>();
        Cyclops.transform.SetParent(caveRoot, false);
        Cyclops.Init(Layout, Decoys, body.transform, Crew.Positions);
        Cyclops.CaughtPlayer += Fail;
        Cyclops.AteCrew += OnAteCrew;
        Cyclops.RockLanded += OnRockLanded;
        Cyclops.PulledWedge += OnPulledWedge;

        // 洞外的海風從巨石後面傳來：越接近洞口越大聲。
        var wind = new GameObject("SeaWind").AddComponent<AudioSource>();
        wind.transform.SetParent(caveRoot, false);
        wind.transform.position = Layout.Cave.OutsidePoint + Vector3.up;
        wind.clip = ProceduralAudio.SeaWind();
        wind.loop = true;
        wind.spatialBlend = 1f;
        wind.rolloffMode = AudioRolloffMode.Linear;
        wind.minDistance = 2f;
        wind.maxDistance = 24f;
        wind.volume = 0.6f;
        wind.Play();

        logPath = Path.Combine(Application.persistentDataPath, PlaytestCsv.FileName);
        if (!File.Exists(logPath))
            PlaytestCsv.TryAppend(logPath, PlaytestCsv.Header, out _);

        ResetNight();
    }

    void Start() => BeginIntro();

    void BeginIntro()
    {
        player.InputEnabled = false;
        Show($"第 {Roster.Night} 夜", "巨人瞎了，洞口被巨石封住", $"剩下 {Roster.Remaining} 名同伴", ResetNight, StartNight);
    }

    void StartNight()
    {
        State.IntroDone();
        player.InputEnabled = true;
        Cyclops.Active = true;
        nightStart = Time.time;
        hintUntil = Time.time + hintSeconds;
    }

    /// <summary>
    /// 黑畫面時重置：巨石回原位、楔子清掉、巨人回座、石子重新散落、雜物扶正、
    /// 同伴重新躲進洞裡（每夜換位置）、木樁回到原處、玩家回洞底。
    /// </summary>
    void ResetNight()
    {
        Slide.Reset();
        Layout.Boulder.SetOpening(0f);
        Layout.Boulder.ShowWedges(Slide.StoneWedges);
        Stake.PlaceAt(Layout.StakeSpot);
        LooseStone.ClearAll();
        Layout.Rack.ClearWheels();
        foreach (var pail in Layout.Pails)
            pail.Stand();
        LostTonight = 0;
        Rush.Reset();
        RescuedLastEscape = 0;
        pullNoiseTimer = 0f;
        Dawn.Reset();
        Layout.Boulder.SetDawn(0f);
        Decoys.Reset();
        Cyclops.ResetForNight();
        foreach (var p in pickups)
            p.Respawn();
        foreach (var s in sheep)
            s.ResetForNight();
        echo.Clear();

        Vector3 spawn = Layout.Cave.PlayerSpawn;
        Vector3 toCenter = -spawn;
        body.Teleport(spawn + Vector3.up * 0.05f, Mathf.Atan2(toCenter.x, toCenter.z) * Mathf.Rad2Deg);
        player.ResetForNight();
        Crew.Spawn(Roster.Remaining, ShuffledCrewSpots(), seed * 1000 + Roster.Night);
        lastPlayerPos = body.transform.position;
        insidePen = PenIndexAt(lastPlayerPos);
        waitingRestart = false;
    }

    /// <summary>同伴躲藏點每夜換一個順序，人數少於點數時每夜躲在不同地方。</summary>
    List<Vector3> ShuffledCrewSpots()
    {
        var spots = new List<Vector3>(Layout.CrewSpots);
        var rng = new System.Random(seed * 7919 + Roster.Night);
        for (int i = spots.Count - 1; i > 0; i--)
        {
            int j = rng.Next(i + 1);
            (spots[i], spots[j]) = (spots[j], spots[i]);
        }
        return spots;
    }

    void Update()
    {
        var keyboard = Keyboard.current;
        if (waitingRestart && keyboard != null && keyboard.rKey.wasPressedThisFrame)
        {
            waitingRestart = false;
            State.Restart();
            deaths.Clear();
            BeginIntro();
            return;
        }

        if (State.Phase != LoopPhase.Night)
            return;
        UpdateBoulder();
        UpdateSheepRush();
        UpdateClutter();
        Dawn.Tick(Time.deltaTime);
        Layout.Boulder.SetDawn(Dawn.Fraction);
        if (Dawn.IsDawn)
            Fail(FailReason.Dawn);
    }

    /// <summary>推進巨石的滑動，依結果發出輕推、猛推、回滑的聲音。</summary>
    void UpdateBoulder()
    {
        BoulderNoise noise = Slide.Tick(Time.deltaTime, player.PushMode, player.CarryingStake);
        Layout.Boulder.SetOpening(Slide.Opening);
        Layout.Boulder.ShowWedges(Slide.StoneWedges);
        Vector3 face = Layout.Boulder.PushPoint;
        if (noise.Grind)
            SoundBus.Emit(SoundKind.Grind, face);
        if (noise.Heavy)
            SoundBus.Emit(SoundKind.Boulder, face);
        if (noise.Slip)
            SoundBus.Emit(SoundKind.Slip, face);

        // 巨人拔掉楔子後巨石往回滑：那是巨人弄出來的聲音，他自己聽不到。
        if (Slide.PullingBack)
        {
            pullNoiseTimer += Time.deltaTime;
            if (pullNoiseTimer >= PullNoiseSeconds)
            {
                pullNoiseTimer = 0f;
                SoundBus.Emit(SoundKind.Cyclops, face);
            }
        }
        else
            pullNoiseTimer = 0f;
    }

    /// <summary>天光引羊：縫全開後羊群湧向洞口，撞鬆巨石、一隻隻鑽出去、可能卡在縫裡。</summary>
    void UpdateSheepRush()
    {
        Boulder boulder = Layout.Boulder;
        Vector3 face = boulder.PushPoint;
        Vector3 gap = boulder.GapPoint;
        for (int i = 0; i < sheep.Count; i++)
        {
            Vector3 p = sheep[i].transform.position;
            float dx = Mathf.Max(0f, Mathf.Abs(p.x - face.x) - Boulder.Width / 2f);
            float dz = Mathf.Abs(p.z - face.z);
            sheepToFace[i] = Mathf.Sqrt(dx * dx + dz * dz);
            sheepToGap[i] = Flat(p - gap).magnitude;
        }

        bool wasActive = Rush.Active;
        RushTick t = Rush.Tick(Time.deltaTime, Slide.Opening, sheepToFace, sheepToGap);
        if (!wasActive && Rush.Active)
            foreach (var s in sheep)
                s.RushTo(gap + new Vector3(0.8f, 0f, -0.7f));

        foreach (int i in t.Jostled)
        {
            sheep[i].Bleat();
            Slide.Jolt(SheepRush.JoltMeters);
        }
        if (t.Knock && Slide.GiantPull())
        {
            LooseStone.Spawn(gap + new Vector3(0f, 0f, -0.3f), new Vector3(0f, 2f, -3f), null, knockedLoose: true);
            SoundBus.Emit(SoundKind.Slip, face);
        }
        if (Rush.Squeezing >= 0)
        {
            sheep[Rush.Squeezing].SqueezeAt(gap);
            if (t.StuckBleat)
                sheep[Rush.Squeezing].Bleat();
        }
        if (t.Escaped >= 0)
            sheep[t.Escaped].Leave();
    }

    /// <summary>奶桶、乳酪架、羊圈：人走過就會出聲。</summary>
    void UpdateClutter()
    {
        Vector3 pos = body.transform.position;
        bool moved = Flat(pos - lastPlayerPos).sqrMagnitude > 1e-6f;
        lastPlayerPos = pos;
        if (!moved)
            return;

        foreach (var pail in Layout.Pails)
        {
            if (Flat(pail.transform.position - pos).magnitude <= PailReach)
                pail.Knock(pos);
            if (Crew.Crouching)
                continue;
            foreach (var m in Crew.Followers)
                if (Flat(pail.transform.position - m.transform.position).magnitude <= PailReach)
                    pail.Knock(m.transform.position);
        }

        // 乳酪架沿 z 軸長 2 m：量到木板中線最近的點。
        Vector3 rack = Layout.Rack.Position;
        Vector3 nearest = new(rack.x, pos.y, Mathf.Clamp(pos.z, rack.z - 1f, rack.z + 1f));
        if (Flat(nearest - pos).magnitude <= RackReach)
            Layout.Rack.Brush();

        int pen = PenIndexAt(pos);
        if (pen != insidePen)
            SoundBus.Emit(SoundKind.Wicker, pos);
        insidePen = pen;
    }

    int PenIndexAt(Vector3 p)
    {
        for (int i = 0; i < Layout.Pens.Length; i++)
            if (Layout.Pens[i].Contains(p))
                return i;
        return -1;
    }

    void OnAteCrew(int index)
    {
        if (State.Phase != LoopPhase.Night || index < 0 || index >= Crew.Members.Count)
            return;
        LoseCrew(Crew.Members[index], "一名同伴被巨人吃掉了");
    }

    void OnRockLanded(Vector3 landing)
    {
        if (State.Phase != LoopPhase.Night)
            return;
        var at = new System.Numerics.Vector2(landing.x, landing.z);
        foreach (var m in new List<CrewMember>(Crew.Members))
            if (CyclopsBrain.RockHits(at, new System.Numerics.Vector2(m.transform.position.x, m.transform.position.z)))
                LoseCrew(m, "一名同伴被岩石砸死了");
        Vector3 p = body.transform.position;
        if (CyclopsBrain.RockHits(at, new System.Numerics.Vector2(p.x, p.z)))
            Fail(FailReason.Crushed);
    }

    void LoseCrew(CrewMember m, string what)
    {
        Crew.Remove(m);
        Roster.Lose();
        LostTonight++;
        deaths.Add($"第 {Roster.Night} 夜・{what}");
    }

    /// <summary>巨人摸完巨石，拔掉最外面的石子楔子：石子從縫口彈進洞裡。</summary>
    void OnPulledWedge()
    {
        if (State.Phase != LoopPhase.Night || !Slide.GiantPull())
            return;
        Vector3 gap = Layout.Boulder.GapPoint + new Vector3(0f, 0f, -0.3f);
        LooseStone.Spawn(gap, new Vector3(0f, 2f, -3f), null, knockedLoose: true);
        SoundBus.Emit(SoundKind.Cyclops, gap);
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);

    void Fail(FailReason reason)
    {
        if (State.Phase != LoopPhase.Night)
            return;
        RoundRecord record = State.Fail(reason);
        int night = record.Night;

        player.InputEnabled = false;
        Cyclops.Active = false;
        Cyclops.Roar();
        if (reason != FailReason.Dawn)
            body.FaceTowards(Cyclops.HeadPosition);

        string cause = FailReasonText.Describe(reason);
        deaths.Add($"第 {night} 夜・{cause}");

        // 死亡原因與下一夜合成同一個過場，緊接在被抓之後，不再另外播開場。
        if (State.Phase == LoopPhase.Wiped)
            Show($"第 {night} 夜", "洞裡只剩下你。", cause, null, () => waitingRestart = true);
        else
            Show($"第 {night} 夜・{cause}", "巨人吃掉了一名同伴", $"第 {Roster.Night} 夜・剩下 {Roster.Remaining} 名同伴", ResetNight, () =>
            {
                State.CaughtDone();
                StartNight();
            });
        Log(reason.ToString(), record.Night, record.Crew);
    }

    void Escape()
    {
        // 縫裡有羊正在鑽或卡住時鑽不出去。
        if (State.Phase != LoopPhase.Night || !Slide.IsOpen || !Rush.GapClear)
            return;
        // 縫 3 m 內的跟隨者一起鑽出去。
        Vector3 gap = Layout.Boulder.GapPoint;
        RescuedLastEscape = 0;
        foreach (var m in Crew.Followers)
            if (Flat(m.transform.position - gap).magnitude <= RescueReach)
                RescuedLastEscape++;
        State.Escape();
        player.InputEnabled = false;
        Cyclops.Active = false;
        Show("", "你逃出去了。", $"帶出 {RescuedLastEscape} 名同伴。但你對著巨人喊出了自己的名字。", null, () => waitingRestart = true);
        Log("Escaped", Roster.Night, Roster.Remaining);
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

    /// <summary>night／crew 是這一夜當時的夜數與同伴數（被吃之前）。寫不進去只警告，不影響遊戲。</summary>
    void Log(string outcome, int night, int crew)
    {
        string line = PlaytestCsv.Line(DateTime.Now, night, crew, Mathf.RoundToInt(Slide.MaxOpening * 100f), RescuedLastEscape, LostTonight, LoopPhase.Night, outcome, Time.time - nightStart);
        Debug.Log("[BlindCave] " + line);
        if (!PlaytestCsv.TryAppend(logPath, line, out string error))
            Debug.LogWarning($"BlindGameLoop: 無法寫入實測紀錄（檔案可能正被其他程式開著）：{error}");
    }

    void OnGUI()
    {
        // 字級跟著螢幕高度放大，Game 視窗縮小時也讀得到。
        int fontSize = Mathf.Max(22, Screen.height / 28);
        var style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, wordWrap = true };
        style.normal.textColor = new Color(0.95f, 0.93f, 0.87f);
        float line = fontSize * 1.4f;

        if (State.Phase == LoopPhase.Night)
        {
            DrawStones(fontSize);
            DrawStamina(fontSize);
        }
        if (State.Phase == LoopPhase.Night && player.AtBoulder && !Slide.IsOpen)
            DrawPushBar(fontSize);

        string bottom = null;
        if (State.Phase == LoopPhase.Night && Time.time < hintUntil)
            bottom = "WASD 走・Shift 跑・Q 拍手・左鍵 丟石子・E 推／撿／帶人・Shift＋E 猛推・右鍵 塞楔子・F 隊伍蹲下・G 木樁";
        else if (State.Phase == LoopPhase.Night && Rush.Stuck)
            bottom = "有羊卡在縫裡：把巨石推開讓牠出去";
        else if (State.Phase == LoopPhase.Night && Slide.IsOpen && !Rush.GapClear)
            bottom = "有羊擠在縫裡";
        else if (State.Phase == LoopPhase.Night && Slide.IsOpen)
            bottom = "縫夠寬了：走到縫前按 E 鑽出去";
        else if (waitingRestart && (LoopFailScreen.Instance == null || !LoopFailScreen.Instance.IsPlaying))
            bottom = "按 R 重新開始";
        if (bottom != null)
        {
            // 依實際換行算高度，窄的 Game 視窗也不會把第二行切掉。
            float h = style.CalcHeight(new GUIContent(bottom), Screen.width - 48) + line * 0.4f;
            GUI.Box(new Rect(10, Screen.height - h - 10, Screen.width - 20, h), GUIContent.none);
            GUI.Label(new Rect(24, Screen.height - h - 4, Screen.width - 48, h), bottom, style);
        }
    }

    /// <summary>右下角三顆石子：有的亮、沒有的暗。</summary>
    void DrawStones(int fontSize)
    {
        float size = fontSize * 0.9f;
        float gap = size * 0.4f;
        float bottomPad = fontSize * 3f;
        for (int i = 0; i < EchoPlayer.MaxStones; i++)
        {
            var r = new Rect(Screen.width - (EchoPlayer.MaxStones - i) * (size + gap) - 10, Screen.height - bottomPad - size, size, size);
            Fill(r, i < player.Stones ? new Color(0.85f, 0.85f, 0.8f, 0.9f) : new Color(1f, 1f, 1f, 0.12f));
        }
    }

    /// <summary>左下角體力條：滿格時隱藏；耗盡、還不能跑時是紅色。</summary>
    void DrawStamina(int fontSize)
    {
        var stamina = player.Stamina;
        if (stamina.Value >= 1f)
            return;
        float w = Screen.width * 0.18f, h = fontSize * 0.4f;
        var r = new Rect(10, Screen.height - fontSize * 3f - h, w, h);
        Fill(r, new Color(1f, 1f, 1f, 0.15f));
        Color fill = stamina.CanRun ? new Color(0.85f, 0.92f, 1f, 0.9f) : new Color(0.85f, 0.2f, 0.15f, 0.9f);
        Fill(new Rect(r.x, r.y, w * stamina.Value, h), fill);
    }

    /// <summary>站在巨石前時畫面中央下方顯示開口。</summary>
    void DrawPushBar(int fontSize)
    {
        float w = Screen.width * 0.2f, h = fontSize * 0.4f;
        var r = new Rect((Screen.width - w) / 2f, Screen.height * 0.6f, w, h);
        Fill(r, new Color(1f, 1f, 1f, 0.15f));
        Fill(new Rect(r.x, r.y, w * Slide.Opening / BoulderSlide.FullOpen, h), new Color(0.85f, 0.92f, 1f, 0.9f));
    }

    static void Fill(Rect r, Color c)
    {
        var old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }
}
