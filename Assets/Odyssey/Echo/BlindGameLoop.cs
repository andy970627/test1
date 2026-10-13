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
        feel = gameObject.AddComponent<BoulderFeel>();
        feel.Init(Layout.Boulder, body);
        player.Used += kind =>
        {
            // 只有玩家聽得到的小回饋（規格第 22 節 B）：學會提示、拿起木樁、帶到同伴。
            MarkUsed(kind);
            if (kind == PromptKind.TakeStake)
                sounds?.PlayLocal(sounds.WoodTap);
            else if (kind == PromptKind.Recruit)
                sounds?.PlayLocal(sounds.CrewReply);
        };
        player.PickedUpStone += () => sounds?.PlayLocal(sounds.PebbleClick, 0.5f);
        gameObject.AddComponent<WorldPrompts>().Init(this, Prompts);
        gameObject.AddComponent<SituationHints>().Init(this, Hints);
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

    void Start() => BeginIntro();

    void BeginIntro()
    {
        player.InputEnabled = false;
        // 第一夜（含按 R 重來）先看任務簡報，3 秒後按空白鍵才開始。
        // 第一夜照電影的開場：跟著羊群走進洞裡（規格第 20 節 A）。
        string title = Roster.Night == 1 ? "你們跟著羊群走進洞裡，才發現這是巨人的家" : "巨人瞎了，洞口被巨石封住";
        string subtitle = Roster.Night == 1 ? $"他瞎了，洞口被巨石封住・剩下 {Roster.Remaining} 名同伴" : $"剩下 {Roster.Remaining} 名同伴";
        Show($"第 {Roster.Night} 夜", title, subtitle, ResetNight, () =>
        {
            if (Roster.Night == 1)
                hud.ShowBriefing(Difficulty, level =>
                {
                    Difficulty = level;
                    ApplyDifficulty();
                    StartNight();
                });
            else
                StartNight();
        });
    }

    void StartNight()
    {
        State.IntroDone();
        player.InputEnabled = true;
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
            Nights.Clear();
            BeginIntro();
            return;
        }

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
        Dawn.Tick(Time.deltaTime);
        UpdatePrayer();
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
        BoulderNoise noise = Slide.Tick(Time.deltaTime, player.PushMode, player.CarryingStake, braced);
        Layout.Boulder.SetOpening(Slide.Opening);
        gapWhistle.position = Layout.Boulder.GapPoint + Vector3.up;
        // 每推開 25%（這一夜第一次）巨石沉一聲、進度條閃一下（規格第 22 節 C）。
        if (milestones.Update(Slide.Opening) > 0)
        {
            sounds.PlayLocal(sounds.BoulderSettle, 0.7f);
            settleFlash = SettleFlashSeconds;
        }
        settleFlash = Mathf.Max(0f, settleFlash - Time.deltaTime);
        Layout.Boulder.ShowWedges(Slide.StoneWedges);
        feel.Tick(player.PushMode, noise.Catch, Slide.Opening < before, Slide.MaxOpening);
        Vector3 face = Layout.Boulder.PushPoint;
        // 卡住時只發 Boulder（巨響），不再同時發 Grind，避免兩聲疊在一起。
        if (noise.Grind && !noise.Catch)
            SoundBus.Emit(SoundKind.Grind, face);
        if (noise.Heavy || noise.Catch)
            SoundBus.Emit(SoundKind.Boulder, face);
        if (noise.Catch)
            Hints.Trigger(HintKind.Catch);
        if (noise.Slip)
        {
            SoundBus.Emit(SoundKind.Slip, face);
            Hints.Trigger(HintKind.Slip);
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

        int pen = PenIndexAt(pos);
        if (pen != insidePen)
            SoundBus.Emit(SoundKind.Wicker, pos);
        if (pen >= 0 && insidePen < 0)
            Hints.Trigger(HintKind.Pen);
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
        LoseCrew(Crew.Members[index]);
        Hints.Trigger(HintKind.CrewEaten);
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
        Vector3 gap = Layout.Boulder.GapPoint + new Vector3(0f, 0f, -0.3f);
        LooseStone.Spawn(gap, new Vector3(0f, 2f, -3f), null, knockedLoose: true);
        SoundBus.Emit(SoundKind.Cyclops, gap);
        sounds.WedgePulled(gap);
        Hints.Trigger(HintKind.PulledWedge);
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);

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

        string cause = FailReasonText.Describe(reason);
        Nights.End(night, NightLog.From(reason), eaten: record.Crew > 0);

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
        // 正在跟隨的同伴全部一起鑽出去；蹲著待命的隊伍留在原地（縫前會提示「F 隊伍跟上」）。
        RescuedLastEscape = Crew.Crouching ? 0 : Crew.Followers.Count;
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
        Show("", ShoreChoice.Title(action), ShoreChoice.Subtitle(action, rescued, lost), null, () => waitingRestart = true);
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
        string line = PlaytestCsv.Line(DateTime.Now, night, crew, Mathf.RoundToInt(Slide.MaxOpening * 100f), RescuedLastEscape, LostTonight, LoopPhase.Night, outcome, Time.time - nightStart, Difficulty);
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
        if (onShore && shoreChoice == null)
            DrawShoreChoice(style, fontSize);

        // 操作提示都在遊戲裡（WorldPrompts）；底部只留重新開始。
        string bottom = null;
        if (waitingRestart && (LoopFailScreen.Instance == null || !LoopFailScreen.Instance.IsPlaying))
            bottom = "按 R 重新開始";
        if (bottom != null)
        {
            // 依實際換行算高度，窄的 Game 視窗也不會把第二行切掉。
            float h = style.CalcHeight(new GUIContent(bottom), Screen.width - 48) + line * 0.4f;
            GUI.Box(new Rect(10, Screen.height - h - 10, Screen.width - 20, h), GUIContent.none);
            GUI.Label(new Rect(24, Screen.height - h - 4, Screen.width - 48, h), bottom, style);
        }
    }

    /// <summary>岸邊三選一與剩下的時間（文字加陰影、不加背景）。</summary>
    void DrawShoreChoice(GUIStyle style, int fontSize)
    {
        var center = new GUIStyle(style) { alignment = TextAnchor.MiddleCenter, wordWrap = false };
        float lineH = fontSize * 1.5f;
        float y = Screen.height * 0.72f;
        string[] options = { "左鍵 拉弓射他", "空白鍵 喊出你的名字", "不動 默默離開" };
        for (int i = 0; i < options.Length; i++)
        {
            var r = new Rect(0, y + i * lineH, Screen.width, lineH);
            var shadow = r;
            shadow.position += new Vector2(2f, 2f);
            center.normal.textColor = new Color(0f, 0f, 0f, 0.85f);
            GUI.Label(shadow, options[i], center);
            center.normal.textColor = new Color(0.97f, 0.95f, 0.88f);
            GUI.Label(r, options[i], center);
        }
        float w = Screen.width * 0.25f, h = fontSize * 0.25f;
        float left = 1f - shoreTimer / ShoreChoice.TimeLimit;
        var bar = new Rect((Screen.width - w) / 2f, y + options.Length * lineH + h, w, h);
        Fill(bar, new Color(1f, 1f, 1f, 0.15f));
        Fill(new Rect(bar.x, bar.y, w * Mathf.Clamp01(left), h), new Color(0.85f, 0.92f, 1f, 0.9f));
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

        // 石子左邊一列細長條＝箭；拉弓時最右那支隨拉弓程度變亮。
        float stonesLeft = Screen.width - EchoPlayer.MaxStones * (size + gap) - 10;
        float arrowW = size * 0.18f, arrowGap = size * 0.3f;
        for (int i = 0; i < EchoPlayer.MaxArrows; i++)
        {
            float x = stonesLeft - gap - (EchoPlayer.MaxArrows - i) * (arrowW + arrowGap);
            var r = new Rect(x, Screen.height - bottomPad - size * 1.3f, arrowW, size * 1.3f);
            bool have = i < player.Arrows;
            Color c = have ? new Color(0.75f, 0.6f, 0.4f, 0.9f) : new Color(1f, 1f, 1f, 0.12f);
            if (have && i == player.Arrows - 1 && player.Bow.Drawing)
                c = Color.Lerp(c, Color.white, player.Bow.Fraction);
            Fill(r, c);
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
        Color fill = settleFlash > 0f ? Color.white : new Color(0.85f, 0.92f, 1f, 0.9f);
        Fill(new Rect(r.x, r.y, w * Slide.Opening / BoulderSlide.FullOpen, h), fill);
        // 地上的凹槽：每 25% 一道刻度，巨石放手最多滑回到下面那一道。
        for (int i = 1; i < 4; i++)
            Fill(new Rect(r.x + w * i / 4f - 1f, r.y - h * 0.5f, 2f, h * 2f), new Color(1f, 1f, 1f, 0.5f));
    }

    static void Fill(Rect r, Color c)
    {
        var old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }
}
