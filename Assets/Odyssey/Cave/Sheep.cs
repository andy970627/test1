using System;
using UnityEngine;

public enum SheepState { Wandering, Queued, AtEntrance, Exiting, Gone }

/// <summary>
/// 一隻羊：在洞裡遊走、輪到牠時排隊走向洞口、在洞口停下讓巨人摸、再走出洞外。
/// 肚子底下的 BellyAnchor 是玩家抱住時鏡頭掛的位置。
/// </summary>
public class Sheep : MonoBehaviour
{
    const float WanderSpeed = 0.6f;
    const float QueueSpeed = 0.8f;
    const float QueueSpacing = 1.6f;
    const float ArriveDistance = 0.25f;
    const float BleatSeconds = 0.8f;
    const float BleatMinInterval = 9f;
    const float BleatMaxInterval = 20f;

    static AudioClip s_BleatClip;

    CaveLayout layout;
    Vector3 wanderTarget;
    float nextWanderPick;
    int pathIndex;
    float nextBleat;
    float bleatUntil;
    AudioSource voice;

    public bool IsRam { get; private set; }
    public SheepState State { get; private set; }
    public Transform BellyAnchor { get; private set; }
    public bool IsBleating => Time.time < bleatUntil;

    /// <summary>排隊時前面那一隻（由 SheepFlock 設定），用來保持間距。</summary>
    internal Sheep Ahead { get; set; }

    public event Action<Sheep> ReachedEntrance;
    public event Action<Sheep> ReachedOutside;

    public void Init(bool isRam, CaveLayout caveLayout)
    {
        IsRam = isRam;
        layout = caveLayout;
        BuildBody(isRam ? 1.4f : 1f);

        if (s_BleatClip == null)
            s_BleatClip = ProceduralAudio.Bleat();
        voice = gameObject.AddComponent<AudioSource>();
        voice.clip = s_BleatClip;
        voice.spatialBlend = 1f;
        voice.minDistance = 1f;
        voice.maxDistance = 12f;
        voice.rolloffMode = AudioRolloffMode.Linear;
        voice.volume = 0.35f;
        voice.pitch = isRam ? 0.75f : UnityEngine.Random.Range(0.9f, 1.15f);
        voice.playOnAwake = false;

        State = SheepState.Wandering;
        nextBleat = Time.time + UnityEngine.Random.Range(BleatMinInterval, BleatMaxInterval);
        PickWanderTarget();
    }

    public void SendToQueue()
    {
        if (State != SheepState.Wandering)
            return;
        State = SheepState.Queued;
        pathIndex = 0;
    }

    public void ContinueOutside()
    {
        if (State == SheepState.AtEntrance)
            State = SheepState.Exiting;
    }

    void Update()
    {
        switch (State)
        {
            case SheepState.Wandering:
                if (Time.time >= nextWanderPick)
                    PickWanderTarget();
                MoveTowards(wanderTarget, WanderSpeed);
                break;
            case SheepState.Queued:
                UpdateQueue();
                break;
            case SheepState.Exiting:
                if (MoveTowards(layout.OutsidePoint, QueueSpeed))
                    Leave();
                break;
        }

        if (State != SheepState.Gone && Time.time >= nextBleat)
        {
            voice.Play();
            bleatUntil = Time.time + BleatSeconds;
            nextBleat = Time.time + UnityEngine.Random.Range(BleatMinInterval, BleatMaxInterval);
        }
    }

    void UpdateQueue()
    {
        if (Ahead != null && Ahead.State != SheepState.Gone && Ahead.State != SheepState.Exiting
            && Vector3.Distance(Flat(transform.position), Flat(Ahead.transform.position)) < QueueSpacing)
            return;
        if (Ahead != null && Ahead.State == SheepState.Exiting
            && Vector3.Distance(Flat(Ahead.transform.position), Flat(layout.EntrancePoint)) < QueueSpacing)
            return;

        if (!MoveTowards(layout.QueuePath[pathIndex], QueueSpeed))
            return;
        if (pathIndex < layout.QueuePath.Length - 1)
        {
            pathIndex++;
            return;
        }
        State = SheepState.AtEntrance;
        ReachedEntrance?.Invoke(this);
    }

    /// <summary>朝目標貼地移動，回傳是否已抵達。</summary>
    bool MoveTowards(Vector3 target, float speed)
    {
        Vector3 to = Flat(target) - Flat(transform.position);
        if (to.magnitude <= ArriveDistance)
            return true;
        Vector3 step = Vector3.ClampMagnitude(to.normalized * speed * Time.deltaTime, to.magnitude);
        Vector3 next = transform.position + step;
        next.y = CaveBuilder.GroundHeight(next);
        transform.SetPositionAndRotation(next, Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(to), Time.deltaTime * 4f));
        return false;
    }

    void PickWanderTarget()
    {
        var b = layout.Floor;
        wanderTarget = new Vector3(UnityEngine.Random.Range(b.min.x, b.max.x), 0f, UnityEngine.Random.Range(b.min.z, b.max.z));
        nextWanderPick = Time.time + UnityEngine.Random.Range(3f, 6f);
    }

    void Leave()
    {
        State = SheepState.Gone;
        // 不停用物件：玩家的鏡頭可能還掛在肚子底下。
        foreach (var r in GetComponentsInChildren<Renderer>())
            r.enabled = false;
        foreach (var c in GetComponentsInChildren<Collider>())
            c.enabled = false;
        ReachedOutside?.Invoke(this);
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);

    void BuildBody(float s)
    {
        Color wool = IsRam ? new Color(0.62f, 0.58f, 0.5f) : new Color(0.86f, 0.83f, 0.76f);
        Color dark = new(0.15f, 0.13f, 0.12f);
        float legHeight = 0.35f * s;

        Part(PrimitiveType.Cube, "Body", new Vector3(0f, legHeight + 0.275f * s, 0f), new Vector3(0.6f, 0.55f, 1f) * s, wool);
        Destroy(Part(PrimitiveType.Cube, "Head", new Vector3(0f, legHeight + 0.45f * s, 0.62f * s), new Vector3(0.3f, 0.32f, 0.4f) * s, dark).GetComponent<Collider>());
        foreach (var (x, z) in new[] { (-0.2f, 0.35f), (0.2f, 0.35f), (-0.2f, -0.35f), (0.2f, -0.35f) })
            Destroy(Part(PrimitiveType.Cube, "Leg", new Vector3(x * s, legHeight / 2f, z * s), new Vector3(0.12f * s, legHeight, 0.12f * s), dark).GetComponent<Collider>());
        if (IsRam)
        {
            foreach (float side in new[] { -1f, 1f })
            {
                var horn = Part(PrimitiveType.Cylinder, "Horn", new Vector3(side * 0.18f * s, legHeight + 0.62f * s, 0.55f * s), new Vector3(0.1f, 0.18f, 0.1f) * s, new Color(0.45f, 0.4f, 0.32f));
                horn.transform.localRotation = Quaternion.Euler(60f, 0f, side * 40f);
                Destroy(horn.GetComponent<Collider>());
            }
        }

        BellyAnchor = new GameObject("BellyAnchor").transform;
        BellyAnchor.SetParent(transform, false);
        BellyAnchor.localPosition = new Vector3(0f, legHeight - 0.15f, 0f);
    }

    GameObject Part(PrimitiveType type, string name, Vector3 localPosition, Vector3 scale, Color color)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        go.transform.SetParent(transform, false);
        go.transform.localPosition = localPosition;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = OdysseyMaterials.Create(color);
        return go;
    }
}
