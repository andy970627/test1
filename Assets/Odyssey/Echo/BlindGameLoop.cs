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
public partial class BlindGameLoop : MonoBehaviour
{
    /// <summary>羊群（規格第 33 節 C：參考電影的 40 隻真羊，從 9 隻增加到 18 隻）。</summary>
    public const int SheepCount = 18;

    [Tooltip("過場播放速度倍率；2 = 所有淡入淡出與停留時間減半。")]
    public float transitionSpeed = 2f;

    readonly List<WanderingSheep> sheep = new();
    readonly List<StonePickup> pickups = new();
    FirstPersonPlayer body;
    EchoPlayer player;
    EchoField echo;
    Transform gapWhistle;
    BoulderFeel feel;
    SoundPlayer sounds;
    float settleFlash;
    readonly BoulderMilestones milestones = new();
    const float SettleFlashSeconds = 0.3f;

    // 波塞頓禱告（規格第 20 節 B）
    readonly PrayerClock prayer = new();
    readonly System.Random prayRoll = new();
    AudioSource prayVoice;
    float prayTimer = -1f;
    int prayJolts;
    const float PrayTremor = 0.02f;
    const float PrayJoltEvery = 3f;

    // 岸邊的抉擇（規格第 20 節 C）
    readonly System.Random shoreRoll = new();
    AudioSource shoreWaves;
    AudioClip shout;
    bool onShore;
    float shoreTimer;
    ShoreAction? shoreChoice;
    float shoreSinceChoice;
    bool shoreRoared;
    bool shoreWasLocked;
    const float ShoreRoarDelay = 0.9f;
    MissionHud hud;
    float nightStart;

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
    const float SheepBumpReach = 0.7f;
    bool wasTouching;
    const float BraceHintOpening = 0.05f;
    const float DeathVolume = 0.5f;
    const float MovePromptMeters = 3f;

    public CaveLoopState State { get; private set; }
    public CrewRoster Roster { get; } = new();
    public BoulderSlide Slide { get; } = new(new System.Random().NextDouble);
    public CrewLine Crew { get; private set; }
    public OliveStake Stake { get; private set; }
    public EchoPlayer Player => player;
    public FirstPersonPlayer Body => body;

    /// <summary>遊戲內提示用過幾次；跨夜、重新開始都保留。</summary>
    public PromptTracker Prompts { get; } = new();
    public int RescuedLastEscape { get; private set; }
    public int LostTonight { get; private set; }
    public SheepRush Rush { get; } = new(SheepCount, new System.Random().NextDouble);
    public DawnClock Dawn { get; } = new();
    public DecoyMemory Decoys { get; } = new();
    public BlindCyclops Cyclops { get; private set; }
    public BlindCaveLayout Layout { get; private set; }
    public Vector3 PlayerPosition => body.transform.position;
    public IReadOnlyList<WanderingSheep> Sheep => sheep;
    /// <summary>F1 死亡紀錄：每夜一行。</summary>
    public NightLog Nights { get; } = new();
    /// <summary>簡報選的難度：整局固定，按 R 重新開始時記住上次選的。</summary>
    public DifficultyLevel Difficulty { get; private set; } = DifficultyLevel.Normal;
    /// <summary>情境提示：每種整場只講一次，重新開始也保留。</summary>
    public HintQueue Hints { get; } = new();
    /// <summary>洞中紀事：遇到才解鎖，整場保留。</summary>
    public GuideBook Guide { get; } = new();
    /// <summary>必要引導鏈：製造聲音 → 推 → 塞楔子 → 鑽出去（整場只走一次）。</summary>
    public EssentialGuide Essential { get; } = new();
    /// <summary>主選單「實驗」頁的設計開關（規格第 28 節）。</summary>
    public DesignFlags Flags { get; } = new();

    /// <summary>雅典娜的眷顧（規格第 31 節 B3）：整場保留；失去時縫光熄滅、詩句只剩按鍵。</summary>
    public AthenaFavor Favor { get; } = new();

    /// <summary>宙斯的雷鳴（規格第 31 節 B1）：每夜第一次偷襲才照亮全洞。</summary>
    public ZeusThunder Thunder { get; } = new();

    /// <summary>巨人是否正在追殺你（規格第 31 節 H2），給配樂用。</summary>
    public ChaseState Chase { get; } = new();

    /// <summary>這一幀的恐懼半徑讀數（規格第 31 節 H1），給配樂與畫面四角變暗用。</summary>
    public TerrorReading Terror { get; private set; }

    /// <summary>引導用詩句（規格第 31 節 D）且還有雅典娜的眷顧時為 true；否則只顯示按鍵。</summary>
    public bool VersesShown => Flags.Guide == GuideStyle.Verse && Favor.Has;

    GameMenus menus;
    DeathScreen deathScreen;
    ScreenFeedback feedback;

    void Awake()
    {
        SoundBus.Clear();
        State = new CaveLoopState(Roster);
        var caveRoot = new GameObject("Cave").transform;
        Layout = BlindCaveBuilder.Build(caveRoot, seed);
        echo = gameObject.AddComponent<EchoField>();
        echo.LightFor = Flags.LightFor;
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
        feel = gameObject.AddComponent<BoulderFeel>();
        feel.Init(Layout.Boulder, body);
        player.Used += kind =>
        {
            // 只有玩家聽得到的小回饋（規格第 22 節 B）：學會提示、拿起木樁、帶到同伴。
            MarkUsed(kind);
            if (kind == PromptKind.Push)
                Essential.OnPushed();
            else if (kind == PromptKind.Wedge)
                Essential.OnWedged();
            if (kind == PromptKind.TakeStake)
                sounds?.PlayLocal(sounds.WoodTap);
            else if (kind == PromptKind.Recruit)
                sounds?.PlayLocal(sounds.CrewReply);
        };
        player.PickedUpStone += () => sounds?.PlayLocal(sounds.PebbleClick, 0.5f);
        player.PickedUpArrow += () => sounds?.PlayLocal(sounds.WoodTap, 0.6f);
        hands = new GameObject("Hands").AddComponent<FirstPersonHands>();
        hands.Init(player, Slide, body.CameraTransform);
        gameObject.AddComponent<WorldPrompts>().Init(this, Prompts);
        gameObject.AddComponent<SituationHints>().Init(this, Hints);
        menus = gameObject.AddComponent<GameMenus>();
        menus.Init(this);
        deathScreen = gameObject.AddComponent<DeathScreen>();
        feedback = gameObject.AddComponent<ScreenFeedback>();
        hud = gameObject.AddComponent<MissionHud>();
        hud.Init(this);

        Cyclops = new GameObject("Cyclops").AddComponent<BlindCyclops>();
        Cyclops.transform.SetParent(caveRoot, false);
        Cyclops.Init(Layout, Decoys, body.transform, Crew.Positions);
        Cyclops.CaughtPlayer += Fail;
        Cyclops.AteCrew += OnAteCrew;
        Cyclops.RockLanded += OnRockLanded;
        Cyclops.PulledWedge += OnPulledWedge;
        prayVoice = Cyclops.gameObject.AddComponent<AudioSource>();
        prayVoice.clip = ProceduralAudio.Prayer();
        prayVoice.spatialBlend = 1f;
        prayVoice.rolloffMode = AudioRolloffMode.Logarithmic;
        prayVoice.minDistance = 4f;
        prayVoice.maxDistance = 60f;
        prayVoice.playOnAwake = false;
        shout = ProceduralAudio.Shout();
        shoreWaves = gameObject.AddComponent<AudioSource>();
        shoreWaves.clip = ProceduralAudio.SeaWind();
        shoreWaves.loop = true;
        shoreWaves.spatialBlend = 0f;
        shoreWaves.volume = 0.5f;
        shoreWaves.playOnAwake = false;
        Arrow.InPen = p => PenIndexAt(p) >= 0;
        Arrow.IgnoreAlways.Clear();
        Arrow.IgnoreAlways.Add(Layout.Boulder.GapBlocker);
        sounds = gameObject.AddComponent<SoundPlayer>();
        sounds.Init(Cyclops, () => Slide.Opening / BoulderSlide.FullOpen);
        InitZeus();
        gameObject.AddComponent<CaveAtmosphere>().Init(Layout, Cyclops, body, () => Slide.Opening / BoulderSlide.FullOpen, seed);

        // 洞外的海風從巨石後面傳來：整個洞都聽得到，越接近洞口越大聲、左右聲道分得清；
        // 縫旁再加一道從縫鑽進來的細呼嘯聲。
        AudioClip windClip = ProceduralAudio.SeaWind();
        var wind = Loop3D("SeaWind", caveRoot, Layout.Cave.OutsidePoint + Vector3.up, windClip, AudioRolloffMode.Logarithmic, 3f, 60f, 0.8f, 1f);
        wind.spread = 0f;
        gapWhistle = Loop3D("GapWhistle", caveRoot, Layout.Boulder.GapPoint + Vector3.up, windClip, AudioRolloffMode.Linear, 1f, 8f, 0.4f, 1.8f).transform;


        logPath = Path.Combine(Application.persistentDataPath, PlaytestCsv.FileName);
        if (!File.Exists(logPath))
            PlaytestCsv.TryAppend(logPath, PlaytestCsv.Header, out _);

        ResetNight();
    }

    /// <summary>記一次「做到了」；剛好學會（提示收起）時播一聲只有玩家聽得到的小鈴。</summary>
    void MarkUsed(PromptKind kind)
    {
        if (Prompts.Used(kind, Time.time))
            sounds?.PlayLocal(sounds.LearnChime, 0.35f);
    }

    static AudioSource Loop3D(string name, Transform parent, Vector3 at, AudioClip clip, AudioRolloffMode rolloff,
        float min, float max, float volume, float pitch)
    {
        var source = new GameObject(name).AddComponent<AudioSource>();
        source.transform.SetParent(parent, false);
        source.transform.position = at;
        source.clip = clip;
        source.loop = true;
        source.spatialBlend = 1f;
        source.rolloffMode = rolloff;
        source.minDistance = min;
        source.maxDistance = max;
        source.volume = volume;
        source.pitch = pitch;
        source.Play();
        return source;
    }

    void OnDisable()
    {
        Time.timeScale = 1f;
        AudioListener.pause = false;
        AudioListener.volume = 1f;
    }

    void Start()
    {
        feedback.Init(this, body);
        body.gameObject.AddComponent<BumpSensor>().Init(feedback);
        menus.ShowMain(Difficulty);
        gameObject.AddComponent<PlaytestDriver>().Init(this);
    }

    void BeginIntro()
    {
        player.InputEnabled = false;
        // 開場過場與任務簡報合成一張卡片（規格第 26 節 B）：卡片後面先重置好，按空白鍵卡片淡出就直接進入夜晚。
        ResetNight();
        hud.ShowBriefing(StartNight);
    }

    // ---------- 主選單、暫停、回主選單（規格第 25 節 B） ----------

    public bool InNight => State.Phase == LoopPhase.Night;

    /// <summary>夜晚中、不在岸邊、沒有過場或死亡畫面時才能暫停。</summary>
    public bool CanPause => InNight && !onShore && !deathScreen.Showing
        && (LoopFailScreen.Instance == null || !LoopFailScreen.Instance.IsPlaying);

    /// <summary>主選單按「開始」：套用難度，從第一夜開始。</summary>
    public void StartGame(DifficultyLevel level)
    {
        Difficulty = level;
        ApplyDifficulty();
        State.Restart();
        Nights.Clear();
        Favor.Reset();
        BeginIntro();
    }

    public void Pause()
    {
        player.InputEnabled = false;
        Time.timeScale = 0f;
        AudioListener.pause = true;
        menus.ShowPause();
    }

    public void Resume()
    {
        Time.timeScale = 1f;
        AudioListener.pause = false;
        if (InNight)
        {
            player.InputEnabled = true;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }
    }

    /// <summary>結局之後或暫停中選「回主選單」：完整重置這一局，回到主選單。</summary>
    public void ReturnToMenu()
    {
        ResetRun();
        menus.ShowMain(Difficulty);
    }

    /// <summary>全滅或逃出之後：重置這一局，停在結局畫面（R 直接重新開始、Esc 回主選單）。</summary>
    /// <summary>暫停選單裡改難度：立刻套用到這一夜（巨人速度、聽覺、聽覺邊）。</summary>
    public void SetDifficulty(DifficultyLevel level)
    {
        Difficulty = level;
        ApplyDifficulty();
    }

    /// <summary>結局畫面按 R：不看開場卡片，直接用同一個難度開始新的一局（結局時已經重置好）。</summary>
    public void RestartNow(DifficultyLevel level)
    {
        Difficulty = level;
        ApplyDifficulty();
        StartNight();
    }

    void EndRun(string title, string subtitle)
    {
        subtitle += ZeusEpilogue();
        ResetRun();
        menus.ShowEnd(title, subtitle, Difficulty);
    }

    void ResetRun()
    {
        Time.timeScale = 1f;
        AudioListener.pause = false;
        StopPrayer();
        onShore = false;
        shoreWaves.Stop();
        deathScreen.Hide();
        feedback.ResetAll();
        AudioListener.volume = 1f;
        player.InputEnabled = false;
        Cyclops.Active = false;
        State.Restart();
        Nights.Clear();
        Favor.Reset();
        ResetNight();
    }

    /// <summary>情境提示與洞中紀事同一個觸發點：提示排隊，紀事解鎖（第一次解鎖時通知）。</summary>
    public void Hint(HintKind kind)
    {
        Hints.Trigger(kind);
        Unlock(HintGuide.EntryFor(kind));
    }

    /// <summary>核心法則的示範：整場第一個會照亮的聲音，回聲邊緣浮現「他聽得到這麼遠」。</summary>
    public void ShowLaw(Vector3 at, float radius)
    {
        feedback.ShowLaw(at, radius);
        Unlock("law");
    }

    public void Unlock(string entry)
    {
        if (entry != null && Guide.Unlock(entry))
            menus.NotifyNewEntry();
    }

    void StartNight()
    {
        State.IntroDone();
        player.InputEnabled = true;
        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
        Cyclops.Active = true;
        nightStart = Time.time;
    }

    /// <summary>把難度套到巨人（速度、聽覺）與回聲（聽覺範圍的邊）。</summary>
    void ApplyDifficulty()
    {
        Cyclops.Brain.Level = Difficulty;
        echo.HearingFor = Cyclops.Brain.HearingMultiplierFor;
    }

    /// <summary>
    /// 黑畫面時重置：巨石回原位、楔子清掉、巨人回座、石子重新散落、雜物扶正、
    /// 同伴重新躲進洞裡（每夜換位置）、木樁回到原處、玩家回洞底。
    /// </summary>
    void ResetNight()
    {
        ZeusNewNight();
        Slide.Reset();
        milestones.Reset();
        settleFlash = 0f;
        Layout.Boulder.SetOpening(0f);
        Layout.Boulder.ShowWedges(Slide.StoneWedges);
        Stake.PlaceAt(Layout.StakeSpot);
        LooseStone.ClearAll();
        Arrow.ClearAll();
        prayer.NewNight(prayRoll.NextDouble);
        StopPrayer();
        onShore = false;
        shoreWaves.Stop();
        Crew.gameObject.SetActive(true);
        Layout.Rack.ClearWheels();
        foreach (var pail in Layout.Pails)
            pail.Stand();
        LostTonight = 0;
        Rush.Reset();
        Prompts.NewNight();
        Hints.NewNight();
        RescuedLastEscape = 0;
        pullNoiseTimer = 0f;
        Dawn.Reset();
        Layout.Boulder.SetDawn(0f);
        Decoys.Reset();
        Cyclops.ResetForNight();
        feel.ResetForNight();
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
        if (onShore)
        {
            UpdateShore();
            return;
        }
        if (State.Phase != LoopPhase.Night)
            return;
        UpdateBoulder();
        UpdateSheepRush();
        UpdateClutter();
        if (player.MovedTonight >= MovePromptMeters)
            MarkUsed(PromptKind.Move);
        if (player.AtBoulder)
            Essential.OnAtBoulder();
        if (player.AtGap)
            Essential.OnAtOpenGap();
        Dawn.Tick(Time.deltaTime);
        UpdatePrayer();
        UpdateZeus();
        Layout.Boulder.SetDawn(Dawn.Fraction);
        if (Dawn.IsDawn)
            Fail(FailReason.Dawn);
    }

    /// <summary>
    /// 波塞頓禱告：時間到且巨人能停下來時開始；8 秒內他什麼都聽不到，洞在震、第 3、6 秒巨石往回滑一點。
    /// </summary>
    void UpdatePrayer()
    {
        if (prayTimer < 0f)
        {
            if (prayer.Ready(Dawn.Elapsed) && Cyclops.Active && Cyclops.Brain.TryPray())
            {
                prayer.Done(Dawn.Elapsed);
                prayTimer = 0f;
                prayJolts = 0;
                prayVoice.Play();
            }
            return;
        }
        prayTimer += Time.deltaTime;
        feel.Tremor = PrayTremor;
        if (prayJolts < 2 && prayTimer >= PrayJoltEvery * (prayJolts + 1))
        {
            prayJolts++;
            Slide.Jolt(SheepRush.JoltMeters);
            feel.Bump(1.2f);
        }
        if (prayTimer >= CyclopsBrain.PraySeconds || Cyclops.Brain.State != CyclopsState.Pray)
            StopPrayer();
    }

    void StopPrayer()
    {
        prayTimer = -1f;
        if (feel != null)
            feel.Tremor = 0f;
        if (prayVoice != null)
            prayVoice.Stop();
    }

    /// <summary>推進巨石的滑動，依結果發出輕推、猛推、回滑的聲音。</summary>
    void UpdateBoulder()
    {
        float before = Slide.Opening;
        // 站在巨石前、面向它但沒在推：用身體頂住，巨石不會滑回（規格第 24 節）。
        bool braced = player.AtBoulder && player.PushMode == PushMode.None;
        if (braced && Slide.Opening > BraceHintOpening)
            Hint(HintKind.Brace);
        // 怎麼推（規格第 32 節 A、B）：手的位置、身體正不正、幾個同伴一起推。
        Crew.SetPushHelp(player.PushMode != PushMode.None);
        PushContact contact = player.PushMode != PushMode.None
            ? PushContact.Evaluate(player.PushLateral, player.PushFacing, Crew.Helpers)
            : PushContact.Neutral;
        BoulderNoise noise = Slide.Tick(Time.deltaTime, player.PushMode, player.CarryingStake, braced, contact);
        if (noise.HandsSlipped)
            feel.Kick(0.03f, 0.25f);
        Layout.Boulder.SetOpening(Slide.Opening);
        gapWhistle.position = Layout.Boulder.GapPoint + Vector3.up;
        // 每推開 25%（這一夜第一次）巨石沉一聲、進度條閃一下（規格第 22 節 C）。
        if (milestones.Update(Slide.Opening) > 0)
        {
            Hint(HintKind.Notch);
            sounds.PlayLocal(sounds.BoulderSettle, 0.7f);
            settleFlash = SettleFlashSeconds;
        }
        settleFlash = Mathf.Max(0f, settleFlash - Time.deltaTime);
        Layout.Boulder.ShowWedges(Slide.StoneWedges);
        feel.Tick(player.PushMode, noise.Catch, Slide.Opening < before, Slide.MaxOpening);
        Vector3 face = Layout.Boulder.PushPoint;
        // 卡住時只發 Boulder（巨響），不再同時發 Grind，避免兩聲疊在一起。
        if (noise.Grind && !noise.Catch)
            SoundBus.Emit(SoundKind.Grind, face, contact.NoiseMultiplier);
        if (noise.Heavy || noise.Catch)
            SoundBus.Emit(SoundKind.Boulder, face);
        if (noise.Catch)
            Hint(HintKind.Catch);
        if (noise.Slip)
        {
            SoundBus.Emit(SoundKind.Slip, face);
            Hint(HintKind.Slip);
            Essential.OnSlip();
        }

        // 巨人拔掉楔子後巨石往回滑：那是巨人弄出來的聲音，他自己聽不到。
        if (Slide.PullingBack)
        {
            pullNoiseTimer += Time.deltaTime;
            if (pullNoiseTimer >= PullNoiseSeconds)
            {
                pullNoiseTimer = 0f;
                SoundBus.Emit(SoundKind.Cyclops, face);
                sounds.PulledBack(face);
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
            feel.Bump(2f);
        }
        if (t.Knock && Slide.GiantPull())
        {
            LooseStone.Spawn(gap + new Vector3(0f, 0f, -0.3f), new Vector3(0f, 2f, -3f), null, knockedLoose: true);
            SoundBus.Emit(SoundKind.Slip, face);
            sounds.WedgePulled(gap);
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

        // 撞到雜物或羊：剛碰到的那一下鏡頭輕震＋只有玩家聽得到的撞擊聲（一直貼著不會重複）。
        bool touching = Flat(nearest - pos).magnitude <= RackReach;
        foreach (var pail in Layout.Pails)
            touching |= !pail.Fallen && Flat(pail.transform.position - pos).magnitude <= PailReach;
        foreach (var s in sheep)
            touching |= Flat(s.transform.position - pos).magnitude <= SheepBumpReach;
        if (touching && !wasTouching)
            feedback.Bump();
        wasTouching = touching;

        int pen = PenIndexAt(pos);
        if (pen != insidePen)
            SoundBus.Emit(SoundKind.Wicker, pos);
        if (pen >= 0 && insidePen < 0)
            Hint(HintKind.Pen);
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
        var eaten = Crew.Members[index];
        feedback.CrewEaten(eaten.transform.position);
        LoseCrew(eaten);
        sounds.PlayLossChord();
        Hint(HintKind.CrewEaten);
    }

    void OnRockLanded(Vector3 landing)
    {
        if (State.Phase != LoopPhase.Night)
            return;
        var at = new System.Numerics.Vector2(landing.x, landing.z);
        foreach (var m in new List<CrewMember>(Crew.Members))
            if (CyclopsBrain.RockHits(at, new System.Numerics.Vector2(m.transform.position.x, m.transform.position.z)))
                LoseCrew(m);
        Vector3 p = body.transform.position;
        if (CyclopsBrain.RockHits(at, new System.Numerics.Vector2(p.x, p.z)))
            Fail(FailReason.Crushed);
        else if (Flat(landing - p).magnitude <= ScreenFeedback.RockNear)
            feedback.RockNearMiss();
    }

    void LoseCrew(CrewMember m)
    {
        Crew.Remove(m);
        Roster.Lose();
        LostTonight++;
        Nights.Lose();
    }

    /// <summary>巨人摸完巨石，拔掉最外面的石子楔子：石子從縫口彈進洞裡。</summary>
    void OnPulledWedge()
    {
        if (State.Phase != LoopPhase.Night || !Slide.GiantPull())
            return;
        feel.Bump(1.5f);
        Vector3 gap = Layout.Boulder.GapPoint + new Vector3(0f, 0f, -0.3f);
        LooseStone.Spawn(gap, new Vector3(0f, 2f, -3f), null, knockedLoose: true);
        SoundBus.Emit(SoundKind.Cyclops, gap);
        sounds.WedgePulled(gap);
        Hint(HintKind.PulledWedge);
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);

    /// <summary>
    /// 天亮（規格第 32 節 D）：巨人站到巨石前，1.5 秒把它推回原位，聽得到沉重的磨擦；死亡畫面的字照常疊在上面。
    /// </summary>
    System.Collections.IEnumerator GiantClosesBoulder()
    {
        Boulder boulder = Layout.Boulder;
        Vector3 face = boulder.PushPoint;
        var ground = new Vector3(face.x, boulder.BaseCenter.y, face.z - 1.2f);
        Cyclops.PlaceSleeping(ground, face + Vector3.forward);
        body.FaceTowards(face + Vector3.up);
        float from = Slide.Opening;
        float noiseTimer = 0f;
        const float seconds = 1.5f;
        for (float t = 0f; t < seconds; t += Time.deltaTime)
        {
            boulder.SetOpening(Mathf.Lerp(from, 0f, Mathf.SmoothStep(0f, 1f, t / seconds)));
            noiseTimer += Time.deltaTime;
            if (from > 0.01f && noiseTimer >= 0.4f)
            {
                noiseTimer = 0f;
                sounds.PulledBack(boulder.PushPoint);
            }
            yield return null;
        }
        boulder.SetOpening(0f);
    }

    void Fail(FailReason reason)
    {
        if (State.Phase != LoopPhase.Night)
            return;
        RoundRecord record = State.Fail(reason);
        int night = record.Night;

        player.InputEnabled = false;
        feel.ResetForNight();
        StopPrayer();
        Cyclops.Active = false;
        Cyclops.Roar();
        if (reason != FailReason.Dawn)
            body.FaceTowards(Cyclops.HeadPosition);
        else
            StartCoroutine(GiantClosesBoulder());

        string cause = FailReasonText.Describe(reason);
        Nights.End(night, NightLog.From(reason), eaten: record.Crew > 0);
        feedback.ResetAll();
        AudioListener.volume = DeathVolume;
        bool wiped = State.Phase == LoopPhase.Wiped;
        int nextNight = Roster.Night, left = Roster.Remaining;

        // 魂系的「葬身洞中」：死因與代價寫在卡片上；淡成全黑時重置，直接淡入下一夜，不再接過場（規格第 25 節 D）。
        string detail = wiped ? "洞裡只剩下奧德修斯。"
            : record.Crew > 0 ? $"巨人吃掉了一名同伴・第 {nextNight} 夜・剩下 {left} 名同伴" : $"第 {nextNight} 夜・剩下 {left} 名同伴";
        deathScreen.Play(cause, detail, reason == FailReason.Dawn, () =>
        {
            AudioListener.volume = 1f;
            if (wiped)
            {
                EndRun("洞裡只剩下奧德修斯。", cause);
                return;
            }
            ResetNight();
            State.CaughtDone();
        }, () =>
        {
            if (!wiped)
                StartNight();
        });
        Log(reason.ToString(), record.Night, record.Crew);
    }

    void Escape()
    {
        // 縫裡有羊正在鑽或卡住時鑽不出去。
        if (State.Phase != LoopPhase.Night || !Slide.IsOpen || !Rush.GapClear)
            return;
        // 正在跟隨的同伴全部一起鑽出去；蹲著待命的隊伍留在原地（縫前會提示「F 隊伍跟上」）。
        RescuedLastEscape = Crew.Crouching ? 0 : Crew.Followers.Count;
        Essential.OnEscaped();
        State.Escape();
        player.InputEnabled = false;
        feel.ResetForNight();
        StopPrayer();
        Cyclops.Active = false;
        // 先到岸邊做抉擇，再出結局字幕。
        QuickFade(SetupShore, () =>
        {
            shoreWasLocked = false;
            onShore = true;
            shoreTimer = 0f;
            shoreChoice = null;
        });
    }

    /// <summary>黑畫面時：玩家站到縫外看回洞裡，巨人睡在巨石內側、靠月光看得到輪廓；海浪聲。</summary>
    void SetupShore()
    {
        Vector3 gap = Layout.Boulder.GapPoint;
        var ground = new Vector3(gap.x, gap.y - 1f, gap.z);
        Vector3 outside = ground + Vector3.forward * (Boulder.Depth + 2f);
        Cyclops.PlaceSleeping(ground + Vector3.back * 3.5f, outside);
        Unlock("shore");
        body.Teleport(outside + Vector3.up * 0.05f, 180f);
        body.FaceTowards(Cyclops.HeadPosition);
        echo.Clear();
        // 帶出的同伴已經在岸上，不用在畫面裡穿過巨石走出來。
        Crew.gameObject.SetActive(false);
        shoreWaves.Play();
    }

    /// <summary>岸邊 8 秒三選一：左鍵射箭、空白鍵喊名字、不動就默默離開（規格第 20 節 C）。</summary>
    void UpdateShore()
    {
        float dt = Time.deltaTime;
        if (shoreChoice == null)
        {
            shoreTimer += dt;
            var mouse = Mouse.current;
            var keyboard = Keyboard.current;
            // 重新鎖住游標的那一下點擊不算射箭。
            bool locked = Cursor.lockState == CursorLockMode.Locked;
            bool click = shoreWasLocked && mouse != null && mouse.leftButton.wasPressedThisFrame;
            shoreWasLocked = locked;
            if (click)
                ChooseShore(ShoreAction.Shoot);
            else if (keyboard != null && keyboard.spaceKey.wasPressedThisFrame)
                ChooseShore(ShoreAction.Name);
            else if (shoreTimer >= ShoreChoice.TimeLimit)
                ChooseShore(ShoreAction.Leave);
            return;
        }

        shoreSinceChoice += dt;
        if (!shoreRoared && shoreChoice != ShoreAction.Leave && shoreSinceChoice >= ShoreRoarDelay)
        {
            shoreRoared = true;
            Cyclops.Roar();
        }
        if (shoreSinceChoice >= (shoreChoice == ShoreAction.Leave ? 0.5f : 2.5f))
            FinishShore();
    }

    void ChooseShore(ShoreAction action)
    {
        shoreChoice = action;
        shoreSinceChoice = 0f;
        shoreRoared = false;
        Transform cam = body.CameraTransform;
        if (action == ShoreAction.Shoot)
        {
            ShoreAmbush();
            sounds.PlayLocal(sounds.Twang, 0.8f);
            Arrow.Shoot(cam.position + cam.forward * 0.5f, (Cyclops.HeadPosition - cam.position).normalized * BowDraw.MaxSpeed, null);
        }
        else if (action == ShoreAction.Name)
            sounds.PlayLocal(shout, 0.9f);
    }

    /// <summary>報復的代價：帶出的同伴每人 1/3 機率在路上被砸死；寫進每夜紀錄與 CSV，出結局字幕。</summary>
    void FinishShore()
    {
        onShore = false;
        shoreWaves.Stop();
        ShoreAction action = shoreChoice ?? ShoreAction.Leave;
        int lost = ShoreChoice.Resolve(action, RescuedLastEscape, shoreRoll.NextDouble);
        int rescued = RescuedLastEscape - lost;
        for (int i = 0; i < lost; i++)
            Roster.Lose();
        LostTonight += lost;
        RescuedLastEscape = rescued;
        string how = action == ShoreAction.Shoot ? "射箭" : "喊名字";
        Nights.End(Roster.Night, NightOutcome.Escaped, rescued, note: lost > 0 ? $"（{how} −{lost}）" : null);
        string endTitle = ShoreChoice.Title(action), endSubtitle = ShoreChoice.Subtitle(action, rescued, lost);
        if (action == ShoreAction.Shoot && Flags.ZeusLaw)
            endSubtitle += "\n" + VerseBook.ShoreShoot.Item1;
        QuickFade(() => EndRun(endTitle, endSubtitle), null);
        Log($"Escaped_{action}", Roster.Night, Roster.Remaining);
    }

    /// <summary>沒有字幕的快速黑畫面轉場。</summary>
    void QuickFade(Action onBlackout, Action onComplete)
    {
        if (LoopFailScreen.Instance != null)
        {
            LoopFailScreen.Instance.QuickFade(onBlackout, onComplete);
            return;
        }
        onBlackout?.Invoke();
        onComplete?.Invoke();
    }

    void Show(string year, string title, string subtitle, Action onBlackout, Action onComplete)
    {
        // 過場正在播時 ShowMessage 會被忽略：直接執行回呼，避免回主選單之類的流程卡住。
        if (LoopFailScreen.Instance != null && !LoopFailScreen.Instance.IsPlaying)
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
        string line = PlaytestCsv.Line(DateTime.Now, night, crew, Mathf.RoundToInt(Slide.MaxOpening * 100f), RescuedLastEscape, LostTonight, LoopPhase.Night, outcome, Time.time - nightStart, Difficulty, Flags.Summary);
        Debug.Log("[BlindCave] " + line);
        if (!PlaytestCsv.TryAppend(logPath, line, out string error))
            Debug.LogWarning($"BlindGameLoop: 無法寫入實測紀錄（檔案可能正被其他程式開著）：{error}");
    }

    void OnGUI()
    {
        OdysseyFonts.UseForGui();
        // 字級跟著螢幕高度放大，Game 視窗縮小時也讀得到。
        int fontSize = Mathf.Max(22, Screen.height / 28);
        var style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, wordWrap = true };
        style.normal.textColor = OdysseyPalette.DebugText;
        float line = fontSize * 1.4f;

        if (State.Phase == LoopPhase.Night)
        {
            DrawStones(fontSize);
            DrawStamina(fontSize);
        }
        if (State.Phase == LoopPhase.Night && player.AtBoulder && !Slide.IsOpen)
            DrawPushBar(fontSize);
        if (onShore && shoreChoice == null)
            DrawShoreChoice(style, fontSize);
    }

    /// <summary>岸邊三選一與剩下的時間（文字加陰影、不加背景）。</summary>
    void DrawShoreChoice(GUIStyle style, int fontSize)
    {
        var center = new GUIStyle(style) { alignment = TextAnchor.MiddleCenter, wordWrap = false };
        float lineH = fontSize * 1.5f;
        float y = Screen.height * 0.72f;
        string[] options = { "左鍵 拉弓射他", "空白鍵 喊出自己的名字", "不動 默默離開" };
        {
            var note = new GUIStyle(center) { fontSize = Mathf.Max(16, fontSize * 2 / 3) };
            note.normal.textColor = OdysseyPalette.ParchmentNote;
            GUI.Label(new Rect(0, y - lineH, Screen.width, lineH), "洞裡的巨人睡著了", note);
        }
        for (int i = 0; i < options.Length; i++)
        {
            var r = new Rect(0, y + i * lineH, Screen.width, lineH);
            var shadow = r;
            shadow.position += new Vector2(2f, 2f);
            center.normal.textColor = OdysseyPalette.TextShadow;
            GUI.Label(shadow, options[i], center);
            center.normal.textColor = OdysseyPalette.Parchment;
            GUI.Label(r, options[i], center);
        }
        float w = Screen.width * 0.25f, h = fontSize * 0.25f;
        float left = 1f - shoreTimer / ShoreChoice.TimeLimit;
        var bar = new Rect((Screen.width - w) / 2f, y + options.Length * lineH + h, w, h);
        Fill(bar, OdysseyPalette.Track);
        Fill(new Rect(bar.x, bar.y, w * Mathf.Clamp01(left), h), OdysseyPalette.MeterFill);
    }

    /// <summary>右下角三顆石子：有的亮、沒有的暗（箭改由第一人稱視角箭筒呈現，規格第 26 節 C、D）。</summary>
    void DrawStones(int fontSize)
    {
        float size = fontSize * 0.65f;
        float gap = size * 0.4f;
        float bottomPad = fontSize * 2.5f;
        for (int i = 0; i < EchoPlayer.MaxStones; i++)
        {
            var r = new Rect(Screen.width - (EchoPlayer.MaxStones - i) * (size + gap) - 15, Screen.height - bottomPad - size, size, size);
            Fill(r, i < player.Stones ? OdysseyPalette.StoneFull : OdysseyPalette.StoneEmpty);
        }
    }

    /// <summary>左下角體力條：滿格時隱藏；耗盡、還不能跑時是紅色（縮小呈現，規格第 26 節 C）。</summary>
    void DrawStamina(int fontSize)
    {
        var stamina = player.Stamina;
        if (stamina.Value >= 1f)
            return;
        float w = Screen.width * 0.12f, h = fontSize * 0.28f;
        var r = new Rect(15, Screen.height - fontSize * 2.5f - h, w, h);
        Fill(r, OdysseyPalette.Track);
        Color fill = stamina.CanRun ? OdysseyPalette.MeterFill : OdysseyPalette.StaminaOut;
        Fill(new Rect(r.x, r.y, w * stamina.Value, h), fill);
    }

    /// <summary>站在巨石前時畫面中央下方顯示開口。</summary>
    void DrawPushBar(int fontSize)
    {
        float w = Screen.width * 0.2f, h = fontSize * 0.4f;
        var r = new Rect((Screen.width - w) / 2f, Screen.height * 0.6f, w, h);
        Fill(r, OdysseyPalette.Track);
        Color fill = settleFlash > 0f ? Color.white : OdysseyPalette.MeterFill;
        Fill(new Rect(r.x, r.y, w * Slide.Opening / BoulderSlide.FullOpen, h), fill);
        // 地上的凹槽：每 25% 一道刻度，巨石放手最多滑回到下面那一道。
        for (int i = 1; i < 4; i++)
            Fill(new Rect(r.x + w * i / 4f - 1f, r.y - h * 0.5f, 2f, h * 2f), OdysseyPalette.Tick);
    }

    static void Fill(Rect r, Color c)
    {
        var old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }
}
