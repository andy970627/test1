using System;
using Odyssey.Core;
using TMPro;
using UnityEngine;

/// <summary>
/// 坐在洞口、已被刺瞎的波呂斐摩斯。對每隻走到洞口的羊依序「摸背 → 手移到一側 → 沿那側摸到羊肚」；
/// 選羊段聽到聲音時，手會沿地面往聲音掃過去。
/// </summary>
public class Cyclops : MonoBehaviour
{
    public float sweepDuration = 1.5f;
    public float sweepReturn = 0.8f;
    public float sweepHitRadius = 1.2f;
    public float handFollow = 6f;

    static readonly string[] RamLines =
    {
        "我的好公羊，你今天怎麼最後才走？",
        "是那個「無人」害的嗎？",
        "要是你會說話，就能告訴我他躲在哪裡。",
    };

    readonly PatQueue<Sheep> queue = new();
    System.Random rng;
    Transform hand;
    Transform handShadow;
    Vector3 outside;
    AudioSource handRustle;
    Transform arm;
    Vector3 shoulder;
    Vector3 restPosition;
    AudioSource breath;
    AudioSource roar;
    TextMeshPro speech;
    float speechUntil;
    int ramLine;

    float sweepTime = -1f;
    Vector3 sweepTarget;

    public Sheep PattingSheep => queue.Current;
    public PatStep? CurrentStep => queue.CurrentStep;
    public float StepElapsed => queue.StepElapsed;
    public bool IsSweeping => sweepTime >= 0f;
    public Vector3 HandPosition => hand.position;
    public Vector3 HeadPosition => transform.TransformPoint(new Vector3(0f, 5.3f, 0f));

    public event Action<Sheep, PatStep> StepStarted;
    public event Action<Sheep> PatFinished;

    public void Init(CaveLayout layout, int seed)
    {
        rng = new System.Random(seed);
        Vector3 toCave = -layout.CyclopsSeat;
        toCave.y = 0f;
        transform.SetPositionAndRotation(layout.CyclopsSeat, Quaternion.LookRotation(toCave));
        BuildBody();
        shoulder = transform.TransformPoint(new Vector3(-1.1f, 4f, 0.3f));
        restPosition = transform.TransformPoint(new Vector3(-1.4f, 1.6f, 1.4f));
        outside = layout.OutsidePoint;
        hand.position = restPosition;

        breath = new GameObject("Breath").AddComponent<AudioSource>();
        breath.transform.SetParent(transform, false);
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

        handRustle = hand.gameObject.AddComponent<AudioSource>();
        handRustle.clip = ProceduralAudio.WoolRustle();
        handRustle.spatialBlend = 1f;
        handRustle.minDistance = 1.5f;
        handRustle.maxDistance = 25f;
        handRustle.playOnAwake = false;

        queue.StepStarted += OnStepStarted;
        queue.Finished += s => PatFinished?.Invoke(s);
    }

    public void PatSheep(Sheep sheep) => queue.Enqueue(sheep, PatSequence.Build(sheep.IsRam, rng));

    public void SweepToward(Vector3 point)
    {
        if (IsSweeping || PattingSheep != null)
            return;
        sweepTarget = new Vector3(point.x, CaveBuilder.GroundHeight(point) + 0.2f, point.z);
        sweepTime = 0f;
        roar.Play();
    }

    public bool SweepHits(Vector3 playerPosition)
    {
        if (!IsSweeping)
            return false;
        Vector3 d = hand.position - playerPosition;
        d.y = 0f;
        return d.magnitude < sweepHitRadius;
    }

    public void Roar() => roar.Play();

    /// <summary>清空正在摸與排隊中的羊（新一輪開始時）。</summary>
    public void ResetRound()
    {
        while (queue.Tick(1000f)) { }
        sweepTime = -1f;
        hand.position = restPosition;
    }

    void Update()
    {
        Vector3 target = restPosition;
        if (IsSweeping)
        {
            sweepTime += Time.deltaTime;
            if (sweepTime < sweepDuration)
                target = Vector3.Lerp(restPosition, sweepTarget, sweepTime / sweepDuration);
            else if (sweepTime < sweepDuration + sweepReturn)
                target = Vector3.Lerp(sweepTarget, restPosition, (sweepTime - sweepDuration) / sweepReturn);
            else
                sweepTime = -1f;
            hand.position = target;
        }
        else
        {
            queue.Tick(Time.deltaTime);
            if (PattingSheep != null && CurrentStep.HasValue)
                target = PatTarget(PattingSheep, CurrentStep.Value, StepElapsed);
            hand.position = Vector3.Lerp(hand.position, target, Time.deltaTime * handFollow);
        }

        UpdateArm();
        UpdateHandShadow();
        breath.transform.position = PattingSheep != null ? hand.position : HeadPosition;

        if (speech != null)
        {
            speech.gameObject.SetActive(Time.time < speechUntil);
            if (Camera.main != null)
                speech.transform.rotation = Quaternion.LookRotation(speech.transform.position - Camera.main.transform.position);
        }
    }

    static Vector3 PatTarget(Sheep sheep, PatStep step, float elapsed)
    {
        Bounds b = SheepBounds(sheep);
        float sign = step.Side == Side.Left ? -1f : 1f;
        Vector3 right = sheep.transform.right;
        Vector3 top = new(b.center.x, b.max.y, b.center.z);
        switch (step.Kind)
        {
            case PatKind.Back:
                return top + Vector3.up * 0.3f;
            case PatKind.Telegraph:
                return top + right * sign * (b.extents.x + 0.4f) + Vector3.up * 0.2f;
            default:
                float t = Mathf.Clamp01(elapsed / step.Duration);
                Vector3 side = top + right * sign * (b.extents.x + 0.25f);
                return Vector3.Lerp(side, new Vector3(side.x, b.min.y + 0.1f, side.z), t);
        }
    }

    static Bounds SheepBounds(Sheep sheep)
    {
        var renderers = sheep.GetComponentsInChildren<Renderer>();
        if (renderers.Length == 0)
            return new Bounds(sheep.transform.position, Vector3.one);
        Bounds b = renderers[0].bounds;
        for (int i = 1; i < renderers.Length; i++)
            b.Encapsulate(renderers[i].bounds);
        return b;
    }

    void OnStepStarted(Sheep sheep, PatStep step)
    {
        if (sheep.IsRam && step.Kind == PatKind.Back)
        {
            speech.text = RamLines[ramLine % RamLines.Length];
            ramLine++;
            speechUntil = Time.time + 3f;
        }
        // 手在羊毛上摩擦的聲音：排隊時聽得出前面的羊正被摸到哪一步。
        if (step.Kind != PatKind.Telegraph)
            handRustle.Play();
        StepStarted?.Invoke(sheep, step);
    }

    void UpdateHandShadow()
    {
        Vector3 away = outside - hand.position;
        away.y = 0f;
        float height = Mathf.Max(0f, hand.position.y - CaveBuilder.GroundHeight(hand.position));
        Vector3 p = hand.position + away.normalized * Mathf.Min(1.5f, height * 0.5f);
        p.y = CaveBuilder.GroundHeight(p) + 0.02f;
        handShadow.position = p;
        if (away.sqrMagnitude > 0.0001f)
            handShadow.rotation = Quaternion.LookRotation(away);
    }

    void UpdateArm()
    {
        Vector3 d = hand.position - shoulder;
        arm.position = shoulder + d / 2f;
        if (d.sqrMagnitude > 0.0001f)
            arm.rotation = Quaternion.LookRotation(d);
        arm.localScale = new Vector3(0.45f, 0.45f, d.magnitude);
    }

    void BuildBody()
    {
        Color skin = new(0.05f, 0.045f, 0.04f);
        Part(PrimitiveType.Capsule, "Body", transform, new Vector3(0f, 2.5f, 0f), new Vector3(2.2f, 2.5f, 2.2f), skin);
        Part(PrimitiveType.Sphere, "Head", transform, new Vector3(0f, 5.3f, 0f), Vector3.one * 1.6f, skin);
        // 被燒紅木樁刺瞎的獨眼：一道結痂的暗紅傷口，不發光。
        Part(PrimitiveType.Sphere, "BlindedEye", transform, new Vector3(0f, 5.45f, 0.72f), new Vector3(0.55f, 0.3f, 0.15f), new Color(0.22f, 0.02f, 0.02f));
        Part(PrimitiveType.Cube, "KneeL", transform, new Vector3(-0.9f, 1.2f, 1.2f), new Vector3(0.9f, 0.9f, 1.8f), skin);
        Part(PrimitiveType.Cube, "KneeR", transform, new Vector3(0.9f, 1.2f, 1.2f), new Vector3(0.9f, 0.9f, 1.8f), skin);

        hand = Part(PrimitiveType.Cube, "Hand", null, Vector3.zero, new Vector3(0.8f, 0.4f, 1.4f), skin).transform;
        arm = Part(PrimitiveType.Cube, "Arm", null, Vector3.zero, Vector3.one, skin).transform;
        // 炭火在洞內、手在洞口，影子往洞口外的地上落；從羊肚下往前看得到手在哪。
        handShadow = Part(PrimitiveType.Cylinder, "HandShadow", null, Vector3.zero, new Vector3(1.1f, 0.005f, 1.6f), new Color(0.01f, 0.01f, 0.01f)).transform;
        handShadow.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

        var speechGo = new GameObject("Speech");
        speechGo.transform.SetParent(transform, false);
        speechGo.transform.localPosition = new Vector3(0f, 6.7f, 0f);
        speech = speechGo.AddComponent<TextMeshPro>();
        if (OdysseyFonts.Cjk != null)
            speech.font = OdysseyFonts.Cjk;
        speech.rectTransform.sizeDelta = new Vector2(6f, 0.6f);
        speech.enableAutoSizing = true;
        speech.fontSizeMin = 0.1f;
        speech.fontSizeMax = 20f;
        speech.alignment = TextAlignmentOptions.Center;
        speech.color = new Color(0.85f, 0.8f, 0.7f);
        speechGo.SetActive(false);
    }

    GameObject Part(PrimitiveType type, string name, Transform parent, Vector3 localPosition, Vector3 scale, Color color)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        go.transform.SetParent(parent != null ? parent : transform.parent, false);
        if (parent != null)
            go.transform.localPosition = localPosition;
        go.transform.localScale = scale;
        Destroy(go.GetComponent<Collider>());
        go.GetComponent<Renderer>().sharedMaterial = OdysseyMaterials.Create(color);
        return go;
    }
}
