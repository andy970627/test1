using System;
using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 黑暗中的奧德修斯：腳步、跑（受體力限制，低體力會喘氣）、拍手、丟石子、撿石子；
/// 對巨石輕推（E）或猛推（Shift＋E）、塞或拔石子楔子（右鍵）；撿、放、插橄欖木樁（E／G）；帶同伴、讓隊伍蹲下（E／F）。
/// 每個動作都會發出聲音（SoundBus）。移動與視角沿用同一個物件上的 FirstPersonPlayer。
/// </summary>
public class EchoPlayer : MonoBehaviour
{
    public const float CrouchSpeed = 1.5f;
    public const float RunSpeed = 4f;
    public const float CrouchStepSeconds = 0.6f;
    public const float RunStepSeconds = 0.35f;
    public const int MaxStones = 3;
    public const int StartStones = 1;
    public const float PushReach = 1.5f;
    public const float PickupReach = 0.8f;
    public const float StakeReach = 1.2f;
    public const float CrewReach = 1.2f;
    public const float WedgeSeconds = 0.6f;
    public const float PullWedgeSeconds = 1f;
    const float PushFacingDot = 0.7f;

    FirstPersonPlayer body;
    Boulder boulder;
    BoulderSlide slide;
    IReadOnlyList<StonePickup> pickups;
    OliveStake stake;
    CrewLine crew;
    Func<Vector3, float> stepScale;
    CharacterController controller;
    Vector3 lastPosition;
    float stepTimer;
    bool wasLocked;
    bool inputEnabled;

    // 右鍵：按下開始計時；按住滿 1 秒拔回楔子，沒按滿就塞一顆（從按下起共花 0.6 秒）。
    float rightHeld = -1f;

    // 「推」的提示：這次推從哪個開口開始、是否已經算過。
    const float PushLearnMeters = 0.05f;
    float pushStartOpening;
    bool pushCounted;
    bool rightPulled;
    float wedgeBusy = -1f;

    public int Stones { get; private set; } = StartStones;

    /// <summary>身上的箭（規格第 21 節 C）：每夜補回 3 支，射出去的要撿回來。</summary>
    public int Arrows { get; private set; } = MaxArrows;
    public const int MaxArrows = 3;

    /// <summary>拉弓（按住左鍵）；拉弓中走速減半、不能跑。</summary>
    public BowDraw Bow { get; } = new();

    /// <summary>彈弓（空白鍵，規格第 31 節 A）：點一下空彈照亮身邊；按住拉、放開把石子射出去。</summary>
    public SlingshotDraw Slingshot { get; } = new();

    /// <summary>木馬的重量（規格第 31 節 B3）：偷襲之後這一夜手會抖，彈弓和弓的準頭左右上下晃這麼多度。</summary>
    public float AimTremble { get; set; }

    /// <summary>彈弓射出一顆石子。</summary>
    public event Action ShotStone;

    const float StretchNoiseSeconds = 0.4f;
    float stretchTimer;
    public Stamina Stamina { get; } = new();

    /// <summary>這一幀對巨石的推法，由 BlindGameLoop 傳給 BoulderSlide.Tick。</summary>
    public PushMode PushMode { get; private set; }
    public bool CarryingStake => stake != null && stake.Carried;

    /// <summary>站在巨石前、面向巨石（推的範圍內）。</summary>
    public bool AtBoulder { get; private set; }

    /// <summary>手貼在石面的哪裡（−1 左緣～+1 右緣）與身體正不正（cos），給 PushContact 用。</summary>
    public float PushLateral { get; private set; }
    public float PushFacing { get; private set; }

    /// <summary>正在塞楔子（0.6 秒內不能推）。</summary>
    public bool Wedging => wedgeBusy >= 0f;
    public float WedgeBusy => wedgeBusy;

    int enabledFrame = -1;

    public bool InputEnabled
    {
        get => inputEnabled;
        set
        {
            if (value && !inputEnabled)
                enabledFrame = Time.frameCount;
            inputEnabled = value;
            if (body != null)
                body.InputEnabled = value;
            if (!value)
                ClearActions();
        }
    }

    public event Action EscapeRequested;

    /// <summary>撿到一顆石子（地上的或彈出來的）；只給玩家聽的小回饋用。</summary>
    public event Action PickedUpStone;

    /// <summary>撿回一支箭；只給玩家聽的小回饋用。</summary>
    public event Action PickedUpArrow;

    /// <summary>E 的額外互動（例如拿起酒囊，規格第 34 節 C）：在撿木樁之後、帶同伴之前問一次；回傳 true 表示這一下已被用掉。</summary>
    public Func<bool> ExtraInteract;

    /// <summary>玩家用了某個操作（給遊戲內提示計次）。</summary>
    public event Action<PromptKind> Used;

    /// <summary>這一夜走過的距離（公尺）。</summary>
    public float MovedTonight { get; private set; }

    /// <summary>開口全開、站在縫前（按 E 就能鑽出去的位置）。</summary>
    public bool AtGap { get; private set; }

    public void Init(FirstPersonPlayer body, Boulder boulder, BoulderSlide slide, IReadOnlyList<StonePickup> pickups,
        OliveStake stake, CrewLine crew, Func<Vector3, float> stepScale)
    {
        this.body = body;
        this.boulder = boulder;
        this.slide = slide;
        this.pickups = pickups;
        this.stake = stake;
        this.crew = crew;
        this.stepScale = stepScale;
        controller = body.GetComponent<CharacterController>();
        InputEnabled = false;
        ResetForNight();
    }

    public void ResetForNight()
    {
        Stones = StartStones;
        Arrows = MaxArrows;
        Stamina.Reset();
        stepTimer = 0f;
        MovedTonight = 0f;
        lastPosition = transform.position;
        ClearActions();
    }

    void ClearActions()
    {
        PushMode = PushMode.None;
        rightHeld = -1f;
        rightPulled = false;
        wedgeBusy = -1f;
        Bow.Cancel();
        Slingshot.Cancel();
    }

    void Update()
    {
        var keyboard = Keyboard.current;
        var mouse = Mouse.current;
        bool locked = Cursor.lockState == CursorLockMode.Locked;
        if (keyboard == null || mouse == null || body == null)
            return;
        if (!inputEnabled)
        {
            PushMode = PushMode.None;
            lastPosition = transform.position;
            wasLocked = locked;
            return;
        }

        float dt = Time.deltaTime;
        bool shift = keyboard.leftShiftKey.isPressed || keyboard.rightShiftKey.isPressed;
        Vector3 forward = Flat(body.CameraTransform.forward).normalized;
        // 沿著整面石面都推得到（規格第 32 節 A），要面向它。
        bool touching = boulder.FaceContact(transform.position, forward, out float lateral, out float facing);
        PushLateral = lateral;
        PushFacing = facing;
        AtBoulder = touching && facing > PushFacingDot;
        AtGap = slide.IsOpen && Flat(boulder.GapPoint - transform.position).magnitude <= PushReach;
        PushMode wasPushing = PushMode;

        bool ePressedUsed = HandleInteract(keyboard);
        UpdateWedgeButton(mouse, dt);

        // 體力每幀只算一次：推巨石時 Shift 是猛推，否則是跑步（拿著木樁不能跑）。
        // 巨人拔楔子後的滑回期間（slide.PullingBack）推力無效，也不耗體力。
        bool pushing = AtBoulder && keyboard.eKey.isPressed && !ePressedUsed && !Wedging && rightHeld < 0f && !slide.PullingBack;
        bool running = false;
        if (pushing)
        {
            PushMode = Stamina.Tick(dt, shift) ? PushMode.Heavy : PushMode.Light;
            // 一次連續推的過程中巨石真的前進 5 cm 才算學會「推」（每次推最多算一次）。
            if (wasPushing == PushMode.None)
            {
                pushStartOpening = slide.Opening;
                pushCounted = false;
            }
            if (!pushCounted && slide.Opening - pushStartOpening >= PushLearnMeters)
            {
                pushCounted = true;
                Used?.Invoke(PromptKind.Push);
            }
        }
        else
        {
            PushMode = PushMode.None;
            bool wantRun = shift && !CarryingStake && !Bow.Drawing && !Slingshot.Drawing && Flat(controller.velocity).sqrMagnitude > 0.01f;
            running = Stamina.Tick(dt, wantRun);
        }
        if (Stamina.PantDue(dt))
            SoundBus.Emit(SoundKind.Pant, body.CameraTransform.position);
        body.walkSpeed = (running ? RunSpeed : CrouchSpeed) * Bow.WalkMultiplier * Slingshot.WalkMultiplier;
        crew.Running = running;
        UpdateSteps(running);

        UpdateSlingshot(keyboard, dt);

        UpdateBow(mouse, dt);

        if (keyboard.fKey.wasPressedThisFrame)
        {
            crew.ToggleCrouch();
            if (crew.Followers.Count > 0)
                Used?.Invoke(PromptKind.Crouch);
        }
        if (keyboard.gKey.wasPressedThisFrame && CarryingStake)
            DropOrPlantStake();

        UpdatePickups();
        wasLocked = locked;
    }

    /// <summary>E 按下的優先順序：鑽縫 → 撿木樁 → 帶同伴；回傳這一下是否已被用掉（就不算推）。</summary>
    bool HandleInteract(Keyboard keyboard)
    {
        if (!keyboard.eKey.wasPressedThisFrame)
            return false;
        if (slide.IsOpen && Flat(boulder.GapPoint - transform.position).magnitude <= PushReach)
        {
            EscapeRequested?.Invoke();
            return true;
        }
        if (!CarryingStake && Flat(stake.transform.position - transform.position).magnitude <= StakeReach)
        {
            if (stake.Planted)
                slide.RemoveStake();
            stake.AttachTo(body.CameraTransform);
            Used?.Invoke(PromptKind.TakeStake);
            return true;
        }
        if (ExtraInteract != null && ExtraInteract())
            return true;
        var hiding = crew.NearestHiding(transform.position, CrewReach);
        if (hiding != null)
        {
            crew.Recruit(hiding);
            Used?.Invoke(PromptKind.Recruit);
            return true;
        }
        return false;
    }

    void UpdateWedgeButton(Mouse mouse, float dt)
    {
        if (wedgeBusy >= 0f)
        {
            if (!AtBoulder)
            {
                wedgeBusy = -1f;
            }
            else
            {
                wedgeBusy -= dt;
                if (wedgeBusy < 0f)
                    PlaceWedge();
            }
        }

        if (mouse.rightButton.wasPressedThisFrame && AtBoulder && wedgeBusy < 0f)
        {
            rightHeld = 0f;
            rightPulled = false;
        }
        if (rightHeld < 0f)
            return;

        if (mouse.rightButton.isPressed && AtBoulder)
        {
            rightHeld += dt;
            if (!rightPulled && rightHeld >= PullWedgeSeconds)
            {
                rightPulled = true;
                PullWedge();
            }
            return;
        }

        // 放開（或離開巨石）：沒拔過就塞一顆，從按下起共花 0.6 秒。
        if (!rightPulled && AtBoulder && Stones > 0)
            wedgeBusy = Mathf.Max(0f, WedgeSeconds - rightHeld);
        rightHeld = -1f;
        if (wedgeBusy == 0f)
        {
            wedgeBusy = -1f;
            PlaceWedge();
        }
    }

    void PlaceWedge()
    {
        if (Stones <= 0)
            return;
        Stones--;
        slide.AddStoneWedge();
        Used?.Invoke(PromptKind.Wedge);
        SoundBus.Emit(SoundKind.Wedge, boulder.WedgePoint(slide.Opening));
    }

    void PullWedge()
    {
        if (!slide.RemoveOutermostStoneWedge())
            return;
        Used?.Invoke(PromptKind.Wedge);
        if (Stones < MaxStones)
            Stones++;
        else
            LooseStone.Spawn(transform.position + Vector3.up * 0.3f, Vector3.zero, controller);
    }

    /// <summary>把手上的木樁放在面前地上（改拿酒囊時，規格第 34 節 C）。</summary>
    public void DropStakeHere()
    {
        if (CarryingStake)
            stake.PlaceAt(transform.position + body.CameraTransform.forward * 0.5f);
    }

    void DropOrPlantStake()
    {
        if (AtBoulder)
        {
            stake.PlantAt(boulder.WedgePoint(slide.Opening));
            slide.PlantStake();
            Used?.Invoke(PromptKind.PlantStake);
        }
        else
        {
            stake.PlaceAt(transform.position + body.CameraTransform.forward * 0.5f);
            Used?.Invoke(PromptKind.DropStake);
        }
    }

    void UpdateSteps(bool running)
    {
        Vector3 delta = transform.position - lastPosition;
        delta.y = 0f;
        lastPosition = transform.position;
        MovedTonight += delta.magnitude;
        if (delta.sqrMagnitude < 1e-6f)
        {
            stepTimer = 0f;
            return;
        }
        stepTimer += Time.deltaTime;
        if (stepTimer < (running ? RunStepSeconds : CrouchStepSeconds))
            return;
        stepTimer = 0f;
        // 拿著木樁時是拖行聲；羊圈裡的腳步聲減半。
        SoundKind kind = CarryingStake ? SoundKind.Drag : running ? SoundKind.Run : SoundKind.Step;
        SoundBus.Emit(kind, transform.position, stepScale(transform.position));
    }

    /// <summary>
    /// 按住左鍵拉弓、放開射出（規格第 21 節 A）。這一幀才重新鎖住游標的那一下點擊不算；
    /// 拿著木樁不能拉弓（拉到一半拿起木樁就取消）。
    /// </summary>
    void UpdateBow(Mouse mouse, float dt)
    {
        if (CarryingStake || Arrows <= 0 || Cursor.lockState != CursorLockMode.Locked)
        {
            Bow.Cancel();
            return;
        }
        if (wasLocked && mouse.leftButton.wasPressedThisFrame)
            Bow.Begin();
        Bow.Tick(dt);
        if (!Bow.Drawing || mouse.leftButton.isPressed)
            return;
        float? speed = Bow.Release();
        if (speed == null)
            return;
        Arrows--;
        Transform cam = body.CameraTransform;
        SoundBus.Emit(SoundKind.Twang, cam.position);
        // 從鏡頭前 0.1 m（還在自己的身體裡、已忽略碰撞）射出，貼著牆也不會從牆裡面生出來。
        Vector3 dir = Aim(cam);
        Arrow.Shoot(cam.position + dir * 0.1f, dir * speed.Value, controller);
        Used?.Invoke(PromptKind.Shoot);
    }

    /// <summary>
    /// 空白鍵的彈弓（規格第 31 節 A）。點一下（不到 0.3 秒）空彈「啪」＝製造聲音；按住拉皮筋（細細的吱聲、不照亮），
    /// 拉超過 0.3 秒放開、身上有石子就射出去（出手的「啪」會照亮你身邊）。拿著木樁時只能空彈。
    /// 選單按空白鍵開始的那一幀不算。
    /// </summary>
    void UpdateSlingshot(Keyboard keyboard, float dt)
    {
        if (keyboard.spaceKey.wasPressedThisFrame && Time.frameCount != enabledFrame)
        {
            Slingshot.Begin();
            stretchTimer = 0f;
        }
        if (!Slingshot.Drawing)
            return;
        Slingshot.Tick(dt);
        Transform cam = body.CameraTransform;
        if (keyboard.spaceKey.isPressed)
        {
            if (Slingshot.Fraction * SlingshotDraw.FullDraw >= SlingshotDraw.TapSeconds)
            {
                stretchTimer += dt;
                if (stretchTimer >= StretchNoiseSeconds)
                {
                    stretchTimer = 0f;
                    SoundBus.Emit(SoundKind.Stretch, cam.position);
                }
            }
            return;
        }

        SlingshotShot shot = Slingshot.Release(Stones > 0 && !CarryingStake);
        if (shot.Kind == SlingshotShotKind.SnapOnly)
        {
            SoundBus.Emit(SoundKind.Clap, cam.position);
            Used?.Invoke(PromptKind.Clap);
        }
        else if (shot.Kind == SlingshotShotKind.Stone)
        {
            Stones--;
            SoundBus.Emit(SoundKind.SnapShot, cam.position);
            Vector3 dir = Aim(cam);
            LooseStone.Spawn(cam.position + dir * 0.15f, dir * shot.Speed, controller, fromSlingshot: true);
            Used?.Invoke(PromptKind.Clap);
            ShotStone?.Invoke();
        }
    }

    /// <summary>瞄準方向：鏡頭正前方，手抖時（AimTremble）用平滑的雜訊左右上下晃。</summary>
    Vector3 Aim(Transform cam)
    {
        if (AimTremble <= 0f)
            return cam.forward;
        float t = Time.time * 1.7f;
        float yaw = (Mathf.PerlinNoise(t, 0.3f) - 0.5f) * 2f * AimTremble;
        float pitch = (Mathf.PerlinNoise(0.7f, t) - 0.5f) * 2f * AimTremble;
        return Quaternion.AngleAxis(yaw, cam.up) * Quaternion.AngleAxis(pitch, cam.right) * cam.forward;
    }

    void UpdatePickups()
    {
        bool pickedArrow = false;
        // 射出去的箭：停下來、搆得到就撿回來。
        for (int i = Arrow.All.Count - 1; i >= 0 && Arrows < MaxArrows; i--)
        {
            var a = Arrow.All[i];
            if (a == null || !a.CanTake(transform.position, PickupReach))
                continue;
            a.Take();
            Arrows++;
            pickedArrow = true;
        }
        if (pickedArrow)
            PickedUpArrow?.Invoke();

        bool pickedStone = false;
        foreach (var p in pickups)
        {
            if (Stones >= MaxStones)
                break;
            if (p.Taken || Flat(p.transform.position - transform.position).magnitude > PickupReach)
                continue;
            p.Take();
            Stones++;
            pickedStone = true;
        }
        // 被拔掉、彈出來停在地上的石子也撿得回來。
        foreach (var s in new List<LooseStone>(LooseStone.All))
        {
            if (Stones >= MaxStones)
                break;
            if (s == null || !s.Settled || Flat(s.transform.position - transform.position).magnitude > PickupReach)
                continue;
            s.Take();
            Stones++;
            pickedStone = true;
        }
        if (pickedStone)
            PickedUpStone?.Invoke();
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);
}
