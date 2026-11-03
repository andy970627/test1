using System;
using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;
using NVector2 = System.Numerics.Vector2;

/// <summary>
/// 被刺瞎的波呂斐摩斯：由 CyclopsBrain 決定往哪走、何時摸索；這裡負責身體、掃手動畫、
/// 腳步與呼吸聲（巨人只有出聲時才看得見）。
/// </summary>
public class BlindCyclops : MonoBehaviour
{
    const float MoveStepSeconds = 0.7f;
    const float RunStepSeconds = 0.45f;
    const float IdleBreathSeconds = 4f;
    const float EatChewSeconds = 0.5f;
    const float SoundHeight = 1.5f;

    Vector3 seat;
    Transform player;
    Transform leftArm;
    Transform rightArm;
    AudioSource roar;
    float soundTimer;

    public CyclopsBrain Brain { get; private set; }
    public bool Active { get; set; }
    /// <summary>參考電影的巨人比例（規格第 33 節 D）：放大 1.4 倍，約 6 m，頭快碰到洞頂。只是外觀與箭的判定範圍，大腦的距離規則不變。</summary>
    public const float Scale = 1.4f;

    public Vector3 HeadPosition => transform.position + Vector3.up * 3.8f * Scale;

    public event Action<FailReason> CaughtPlayer;
    public event Action<int> AteCrew;
    public event Action<Vector3> RockLanded;
    public event Action PulledWedge;
    /// <summary>巨人自己發出聲音的那一刻（腳步、掃摸、嚼食、呼吸），帶著當時的狀態；SoundPlayer 依狀態播音效。</summary>
    public event Action<CyclopsState> Sounded;

    /// <summary>飛行中岩石的落點（給除錯面板）；沒有為 null。</summary>
    public Vector3? IncomingRock => rock != null ? rock.Target : null;

    Func<IReadOnlyList<NVector2>> crewPositions;
    ThrownRock rock;
    CyclopsState lastState;

    public void Init(BlindCaveLayout layout, DecoyMemory memory, Transform player, Func<IReadOnlyList<NVector2>> crewPositions)
    {
        this.player = player;
        this.crewPositions = crewPositions;
        seat = layout.Cave.CyclopsSeat;
        var rng = new System.Random();
        Brain = new CyclopsBrain(Flat(seat), memory, rng.NextDouble);
        BuildBody();
        // 只給箭判斷「射中巨人」用的觸發範圍；巨人碰撞仍由 CyclopsBrain 的距離規則決定。跟著整體一起放大。
        Arrow.AddHitBox(gameObject, Vector3.up * 2.1f, 4.2f, 0.9f);
        transform.localScale = Vector3.one * Scale;

        var breath = new GameObject("Breath").AddComponent<AudioSource>();
        breath.transform.SetParent(transform, false);
        breath.transform.localPosition = Vector3.up * 3.6f;
        breath.clip = ProceduralAudio.GiantBreath();
        breath.loop = true;
        breath.spatialBlend = 1f;
        breath.minDistance = 2f;
        breath.maxDistance = 30f;
        breath.volume = 0.9f;
        breath.Play();

        roar = gameObject.AddComponent<AudioSource>();
        roar.clip = ProceduralAudio.Roar();
        roar.spatialBlend = 0.6f;
        roar.minDistance = 4f;
        roar.maxDistance = 40f;
        roar.playOnAwake = false;

        SoundBus.Emitted += OnSound;
        ResetForNight();
    }

    void OnDestroy() => SoundBus.Emitted -= OnSound;

    public void ResetForNight()
    {
        Active = false;
        Brain.Reset(Flat(seat));
        lastState = Brain.State;
        soundTimer = 0f;
        if (rock != null)
            Destroy(rock.gameObject);
        rock = null;
        transform.rotation = Quaternion.identity;
        SyncTransform();
        SetMoonlit(false);
    }

    public void Roar() => roar.Play();

    static readonly Color MoonSilhouette = new(0.10f, 0.11f, 0.15f);
    Material moonMaterial;
    readonly System.Collections.Generic.Dictionary<Renderer, Material> darkMaterials = new();

    /// <summary>
    /// 岸邊（規格第 20 節 C）：巨人睡在巨石內側，靠縫裡透進的月光看得到輪廓。
    /// moonlit 為 true 時身體改用暗淡的自發光材質，false 時換回回聲材質。
    /// </summary>
    public void SetMoonlit(bool moonlit)
    {
        if (moonMaterial == null)
            moonMaterial = OdysseyMaterials.Create(Color.black, MoonSilhouette);
        foreach (var r in GetComponentsInChildren<Renderer>())
        {
            if (moonlit)
            {
                if (!darkMaterials.ContainsKey(r))
                    darkMaterials[r] = r.sharedMaterial;
                r.sharedMaterial = moonMaterial;
            }
            else if (darkMaterials.TryGetValue(r, out var original))
                r.sharedMaterial = original;
        }
    }

    /// <summary>岸邊：把巨人放在 ground 處坐著睡，面向 face。</summary>
    public void PlaceSleeping(Vector3 ground, Vector3 face)
    {
        Active = false;
        if (rock != null)
            Destroy(rock.gameObject);
        rock = null;
        transform.position = ground;
        Vector3 dir = face - ground;
        dir.y = 0f;
        if (dir.sqrMagnitude > 1e-4f)
            transform.rotation = Quaternion.LookRotation(dir);
        SetMoonlit(true);
    }

    void OnSound(SoundEvent e, Vector3 worldPos)
    {
        if (Active)
            Brain.Hear(e);
    }

    void Update()
    {
        if (!Active || Brain == null)
            return;
        CyclopsTick tick = Brain.Tick(Time.deltaTime, Flat(player.position), crewPositions());
        SyncTransform();
        AnimateArms();

        // 開始蓄力丟岩石時低吼一聲。
        if (Brain.State == CyclopsState.Throw && lastState != CyclopsState.Throw)
        {
            Roar();
            SoundBus.Emit(SoundKind.Cyclops, HeadPosition);
        }
        lastState = Brain.State;
        EmitOwnSounds();

        if (tick.RockReleased)
            Throw(tick.RockTarget);
        if (tick.PullWedge)
            PulledWedge?.Invoke();
        if (tick.EatenCrew >= 0)
            AteCrew?.Invoke(tick.EatenCrew);
        if (tick.Player != FailReason.None)
        {
            Active = false;
            CaughtPlayer?.Invoke(tick.Player);
        }
    }

    void Throw(NVector2 target)
    {
        var to = new Vector3(target.X, 0f, target.Y);
        to.y = CaveBuilder.GroundHeight(to);
        rock = new GameObject("ThrownRock").AddComponent<ThrownRock>();
        rock.Launch(HeadPosition + Vector3.up * 0.5f, to, CyclopsBrain.FlightSeconds, landing =>
        {
            rock = null;
            SoundBus.Emit(SoundKind.RockImpact, landing + Vector3.up * 0.3f);
            RockLanded?.Invoke(landing);
        });
    }

    void SyncTransform()
    {
        var p = new Vector3(Brain.Position.X, 0f, Brain.Position.Y);
        p.y = CaveBuilder.GroundHeight(p);
        transform.position = p;
        NVector2 dir = Brain.Target - Brain.Position;
        if (Brain.IsMoving && dir.LengthSquared() > 1e-4f)
            transform.rotation = Quaternion.LookRotation(new Vector3(dir.X, 0f, dir.Y));
    }

    void AnimateArms()
    {
        float swing = Brain.State == CyclopsState.Search ? Mathf.Sin(Time.time * 5f) * 55f : 0f;
        float reach = Brain.State == CyclopsState.Search ? 70f : 10f;
        leftArm.localRotation = Quaternion.Euler(reach, swing, 0f);
        rightArm.localRotation = Quaternion.Euler(reach, -swing, 0f);
    }

    void EmitOwnSounds()
    {
        float interval = Brain.State switch
        {
            CyclopsState.Guard => RunStepSeconds,
            CyclopsState.Investigate => MoveStepSeconds,
            CyclopsState.Search => MoveStepSeconds,
            CyclopsState.Eat => EatChewSeconds,
            _ => IdleBreathSeconds,
        };
        soundTimer += Time.deltaTime;
        if (soundTimer < interval)
            return;
        soundTimer = 0f;
        SoundBus.Emit(SoundKind.Cyclops, transform.position + Vector3.up * SoundHeight);
        Sounded?.Invoke(Brain.State);
    }

    void BuildBody()
    {
        var skin = new Color(0.45f, 0.36f, 0.3f);
        Part(PrimitiveType.Capsule, "LegL", transform, new Vector3(-0.45f, 0.9f, 0f), new Vector3(0.6f, 0.9f, 0.6f), skin);
        Part(PrimitiveType.Capsule, "LegR", transform, new Vector3(0.45f, 0.9f, 0f), new Vector3(0.6f, 0.9f, 0.6f), skin);
        Part(PrimitiveType.Capsule, "Torso", transform, new Vector3(0f, 2.5f, 0f), new Vector3(1.6f, 1f, 1.1f), skin);
        Part(PrimitiveType.Sphere, "Head", transform, new Vector3(0f, 3.7f, 0f), new Vector3(1f, 1.05f, 1f), skin);
        // 被木樁刺瞎的獨眼：額頭正中一個焦黑的窟窿。
        Part(PrimitiveType.Sphere, "BlindEye", transform, new Vector3(0f, 3.85f, 0.45f), new Vector3(0.35f, 0.25f, 0.2f), new Color(0.04f, 0.02f, 0.02f));
        leftArm = Arm("ArmL", new Vector3(-1f, 3.1f, 0f), skin);
        rightArm = Arm("ArmR", new Vector3(1f, 3.1f, 0f), skin);
    }

    Transform Arm(string name, Vector3 shoulder, Color color)
    {
        var pivot = new GameObject(name).transform;
        pivot.SetParent(transform, false);
        pivot.localPosition = shoulder;
        Part(PrimitiveType.Capsule, name + "Limb", pivot, new Vector3(0f, -1f, 0f), new Vector3(0.4f, 1f, 0.4f), color);
        Part(PrimitiveType.Sphere, name + "Hand", pivot, new Vector3(0f, -2.1f, 0f), new Vector3(0.6f, 0.4f, 0.7f), color);
        return pivot;
    }

    static void Part(PrimitiveType type, string name, Transform parent, Vector3 localPos, Vector3 scale, Color color)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(parent, false);
        go.transform.localPosition = localPos;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(color);
    }

    static NVector2 Flat(Vector3 v) => new(v.x, v.z);
}
