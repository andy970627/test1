using System;
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
    const float SoundHeight = 1.5f;

    Vector3 seat;
    Transform player;
    Transform leftArm;
    Transform rightArm;
    AudioSource roar;
    float soundTimer;

    public CyclopsBrain Brain { get; private set; }
    public bool Active { get; set; }
    public Vector3 HeadPosition => transform.position + Vector3.up * 3.8f;

    public event Action<FailReason> CaughtPlayer;

    public void Init(BlindCaveLayout layout, DecoyMemory memory, Transform player)
    {
        this.player = player;
        seat = layout.Cave.CyclopsSeat;
        Brain = new CyclopsBrain(Flat(seat), memory);
        BuildBody();

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
        soundTimer = 0f;
        SyncTransform();
    }

    public void Roar() => roar.Play();

    void OnSound(SoundEvent e, Vector3 worldPos)
    {
        if (Active)
            Brain.Hear(e);
    }

    void Update()
    {
        if (!Active || Brain == null)
            return;
        FailReason result = Brain.Tick(Time.deltaTime, Flat(player.position));
        SyncTransform();
        AnimateArms();
        EmitOwnSounds();
        if (result != FailReason.None)
        {
            Active = false;
            CaughtPlayer?.Invoke(result);
        }
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
            _ => IdleBreathSeconds,
        };
        soundTimer += Time.deltaTime;
        if (soundTimer < interval)
            return;
        soundTimer = 0f;
        SoundBus.Emit(SoundKind.Cyclops, transform.position + Vector3.up * SoundHeight);
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
