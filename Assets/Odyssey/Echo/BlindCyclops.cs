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
        facing = Quaternion.identity;
        SyncTransform();
        SetMoonlit(false);
    }

    public void Roar() => roar.Play();

    static readonly Color MoonSilhouette = OdysseyPalette.MoonSilhouette;
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
            facing = Quaternion.LookRotation(new Vector3(dir.X, 0f, dir.Y));
        // 醉了東倒西歪（規格第 34 節 C）：左右慢慢晃 ±8°。
        float sway = Brain.Drunk ? Mathf.Sin(Time.time * 1.7f) * 8f : 0f;
        transform.rotation = facing * Quaternion.Euler(0f, 0f, sway);
    }

    Quaternion facing = Quaternion.identity;

    void AnimateArms()
    {
        switch (Brain.State)
        {
            case CyclopsState.Search:
            {
                float swing = Mathf.Sin(Time.time * 5f) * 55f;
                leftArm.localRotation = Quaternion.Euler(70f, swing, 0f);
                rightArm.localRotation = Quaternion.Euler(70f, -swing, 0f);
                break;
            }
            case CyclopsState.Throw:
            {
                // 蓄力丟岩石：雙臂高舉過頂
                float progress = Mathf.Clamp01(Brain.StateElapsed / CyclopsBrain.WindupSeconds);
                float reach = Mathf.Lerp(10f, -125f, progress);
                leftArm.localRotation = Quaternion.Euler(reach, 15f, 0f);
                rightArm.localRotation = Quaternion.Euler(reach, -15f, 0f);
                break;
            }
            case CyclopsState.Pray:
            {
                // 向波塞頓禱告：雙臂按在胸口微微顫抖
                float tremble = Mathf.Sin(Time.time * 20f) * 3f;
                leftArm.localRotation = Quaternion.Euler(45f + tremble, -20f, 0f);
                rightArm.localRotation = Quaternion.Euler(45f + tremble, 20f, 0f);
                break;
            }
            case CyclopsState.Drink:
            case CyclopsState.Eat:
            {
                // 嚼食：手捧在巨口前
                leftArm.localRotation = Quaternion.Euler(35f, -30f, 0f);
                rightArm.localRotation = Quaternion.Euler(35f, 30f, 0f);
                break;
            }
            case CyclopsState.Guard:
            {
                // 守石：警戒低垂
                leftArm.localRotation = Quaternion.Euler(20f, 10f, 0f);
                rightArm.localRotation = Quaternion.Euler(20f, -10f, 0f);
                break;
            }
            default:
            {
                // 聆聽：自然微晃
                float breath = Mathf.Sin(Time.time * 1.5f) * 5f;
                leftArm.localRotation = Quaternion.Euler(10f + breath, 0f, 0f);
                rightArm.localRotation = Quaternion.Euler(10f + breath, 0f, 0f);
                break;
            }
        }
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
        // 醉了腳步更重（規格第 34 節 C）：聲量 ×2，你更容易聽到他。
        SoundBus.Emit(SoundKind.Cyclops, transform.position + Vector3.up * SoundHeight, Brain.Drunk ? WineSkin.DrunkStepScale : 1f);
        Sounded?.Invoke(Brain.State);
    }

    void BuildBody()
    {
        var skin = OdysseyPalette.GiantSkin;
        var charred = OdysseyPalette.Charred;
        var ember = OdysseyPalette.Ember;

        // 雙腿（厚重粗糙巨腿）
        Part(PrimitiveType.Capsule, "LegL", transform, new Vector3(-0.45f, 0.9f, 0f), new Vector3(0.6f, 0.9f, 0.6f), skin);
        Part(PrimitiveType.Capsule, "LegR", transform, new Vector3(0.45f, 0.9f, 0f), new Vector3(0.6f, 0.9f, 0.6f), skin);

        // 巨軀與駝背斜方肌（Torso & Hunchback silhouette）
        Part(PrimitiveType.Capsule, "Torso", transform, new Vector3(0f, 2.5f, 0f), new Vector3(1.6f, 1.1f, 1.2f), skin);
        Part(PrimitiveType.Sphere, "Hunch", transform, new Vector3(0f, 3.2f, -0.3f), new Vector3(1.3f, 0.8f, 0.9f), skin);

        // 巨頭
        Part(PrimitiveType.Sphere, "Head", transform, new Vector3(0f, 3.75f, 0.1f), new Vector3(1f, 1.1f, 1.05f), skin);

        // 額頭正中被木樁刺穿燒焦的單一眼窩窟窿（焦黑血痂與餘燼微光）
        Part(PrimitiveType.Sphere, "BlindEyeSocket", transform, new Vector3(0f, 3.88f, 0.55f), new Vector3(0.42f, 0.30f, 0.22f), charred);
        Part(PrimitiveType.Sphere, "BlindEyeEmber", transform, new Vector3(0f, 3.88f, 0.60f), new Vector3(0.18f, 0.12f, 0.10f), ember);

        leftArm = Arm("ArmL", new Vector3(-1.05f, 3.1f, 0f), skin);
        rightArm = Arm("ArmR", new Vector3(1.05f, 3.1f, 0f), skin);
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
