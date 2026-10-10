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

    public CaveLoopState State { get; private set; }
    public CrewRoster Roster { get; } = new();
    public BoulderModel BoulderProgress { get; } = new();
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
        player.Init(body, Layout.Boulder, pickups, () => BoulderProgress.IsOpen);
        player.PushCompleted += OnPushed;
        player.EscapeRequested += Escape;

        Cyclops = new GameObject("Cyclops").AddComponent<BlindCyclops>();
        Cyclops.transform.SetParent(caveRoot, false);
        Cyclops.Init(Layout, Decoys, body.transform);
        Cyclops.CaughtPlayer += Fail;

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

    /// <summary>黑畫面時重置：巨石回原位、巨人回座、石子重新散落、玩家回洞底。</summary>
    void ResetNight()
    {
        BoulderProgress.Reset();
        Layout.Boulder.SetProgress(0);
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
        waitingRestart = false;
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
        Dawn.Tick(Time.deltaTime);
        Layout.Boulder.SetDawn(Dawn.Fraction);
        if (Dawn.IsDawn)
            Fail(FailReason.Dawn);
    }

    void OnPushed()
    {
        if (State.Phase != LoopPhase.Night || !BoulderProgress.Push())
            return;
        Layout.Boulder.SetProgress(BoulderProgress.Progress);
        SoundBus.Emit(SoundKind.Boulder, Layout.Boulder.PushPoint);
    }

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
        if (State.Phase != LoopPhase.Night || !BoulderProgress.IsOpen)
            return;
        State.Escape();
        player.InputEnabled = false;
        Cyclops.Active = false;
        Show("", "你逃出去了。", "但你對著巨人喊出了自己的名字。", null, () => waitingRestart = true);
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
        string line = PlaytestCsv.Line(DateTime.Now, night, crew, BoulderProgress.Progress, LoopPhase.Night, outcome, Time.time - nightStart);
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
        if (State.Phase == LoopPhase.Night && player.PushHold01 > 0f)
            DrawPushBar(fontSize);

        string bottom = null;
        if (State.Phase == LoopPhase.Night && Time.time < hintUntil)
            bottom = "WASD 蹲著走・Shift 跑・Q 拍手・左鍵 丟石子・對巨石按住 E 推・F1 除錯";
        else if (State.Phase == LoopPhase.Night && BoulderProgress.IsOpen)
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

    /// <summary>推巨石時畫面中央下方的進度條。</summary>
    void DrawPushBar(int fontSize)
    {
        float w = Screen.width * 0.2f, h = fontSize * 0.4f;
        var r = new Rect((Screen.width - w) / 2f, Screen.height * 0.6f, w, h);
        Fill(r, new Color(1f, 1f, 1f, 0.15f));
        Fill(new Rect(r.x, r.y, w * player.PushHold01, h), new Color(0.85f, 0.92f, 1f, 0.9f));
    }

    static void Fill(Rect r, Color c)
    {
        var old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }
}
