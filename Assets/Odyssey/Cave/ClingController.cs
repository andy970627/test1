using System;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 抱在羊肚底下：把鏡頭掛到羊肚下，讀左右手、憋氣、重心輸入餵給 ClingModel，
/// 依巨人目前的摸羊步驟用 PatJudge 判定，並用身體回饋（下沉、抖動、心跳、暗角、傾斜、羊毛凹陷）表現狀態。
/// </summary>
public class ClingController : MonoBehaviour
{
    public ClingParams parameters = new();
    public float cameraPitch = 35f;
    public float slideDrop = 0.35f;
    public float leanRoll = 8f;
    public float leanShift = 0.1f;
    public float stepLength = 0.5f;
    public float stepBob = 0.03f;

    Camera cam;
    Transform originalParent;
    Vector3 originalLocalPosition;
    Quaternion originalLocalRotation;
    float originalNear;

    Cyclops cyclops;
    Transform rig;
    Transform dent;
    UnityEngine.UI.RawImage vignette;
    GameObject vignetteCanvas;
    AudioSource heartbeat;
    AudioSource rustle;
    Side lean = Side.Left;
    Vector3 lastSheepPosition;
    float walked;
    float bobTimer;
    bool active;

    public ClingModel Model { get; private set; }
    public Sheep Sheep { get; private set; }

    public event Action<FailReason> Failed;

    public void Begin(Sheep sheep, Camera camera, Cyclops giant)
    {
        Sheep = sheep;
        cam = camera;
        cyclops = giant;
        Model = new ClingModel(parameters, sheep.IsRam);
        lean = Side.Left;
        walked = 0f;
        bobTimer = 0f;
        lastSheepPosition = sheep.transform.position;

        originalParent = cam.transform.parent;
        originalLocalPosition = cam.transform.localPosition;
        originalLocalRotation = cam.transform.localRotation;
        originalNear = cam.nearClipPlane;

        rig = new GameObject("ClingRig").transform;
        rig.SetParent(sheep.BellyAnchor, false);
        cam.transform.SetParent(rig, false);
        cam.nearClipPlane = 0.02f;
        BuildWool(sheep);
        BuildVignette();

        heartbeat = gameObject.AddComponent<AudioSource>();
        heartbeat.clip = ProceduralAudio.Heartbeat();
        heartbeat.loop = true;
        heartbeat.volume = 0f;
        heartbeat.Play();
        rustle = gameObject.AddComponent<AudioSource>();
        rustle.clip = ProceduralAudio.WoolRustle();
        rustle.playOnAwake = false;

        active = true;
    }

    public void End()
    {
        active = false;
        if (cam != null)
        {
            cam.transform.SetParent(originalParent, false);
            cam.transform.localPosition = originalLocalPosition;
            cam.transform.localRotation = originalLocalRotation;
            cam.nearClipPlane = originalNear;
        }
        if (rig != null)
            Destroy(rig.gameObject);
        if (vignetteCanvas != null)
            Destroy(vignetteCanvas);
        if (heartbeat != null)
            Destroy(heartbeat);
        if (rustle != null)
            Destroy(rustle);
        Sheep = null;
        Model = null;
    }

    void Update()
    {
        if (!active || Sheep == null)
            return;
        var mouse = Mouse.current;
        var keyboard = Keyboard.current;
        if (mouse == null || keyboard == null)
            return;

        if (keyboard.aKey.isPressed && !keyboard.dKey.isPressed)
            lean = Side.Left;
        else if (keyboard.dKey.isPressed && !keyboard.aKey.isPressed)
            lean = Side.Right;

        Side previousLean = Model.Lean;
        FailReason reason = Model.Tick(Time.deltaTime, mouse.leftButton.isPressed, mouse.rightButton.isPressed, keyboard.spaceKey.isPressed, lean);
        if (Model.Lean != previousLean)
            rustle.Play();

        PatStep? step = cyclops.PattingSheep == Sheep ? cyclops.CurrentStep : null;
        if (reason == FailReason.None && step.HasValue)
            reason = PatJudge.Evaluate(step.Value, Model);

        UpdateFeedback(step);

        if (reason != FailReason.None)
        {
            active = false;
            Failed?.Invoke(reason);
        }
    }

    void UpdateFeedback(PatStep? step)
    {
        // 羊每走一步，畫面顛一下。
        Vector3 moved = Sheep.transform.position - lastSheepPosition;
        moved.y = 0f;
        walked += moved.magnitude;
        lastSheepPosition = Sheep.transform.position;
        if (walked >= stepLength)
        {
            walked -= stepLength;
            bobTimer = 0.15f;
        }
        bobTimer = Mathf.Max(0f, bobTimer - Time.deltaTime);
        float bob = Mathf.Sin(bobTimer / 0.15f * Mathf.PI) * stepBob;

        // 握力不足時抖動；巨人的手沿某側摸下來時那側輕微震動。
        float minGrip = Mathf.Min(Model.GripLeft, Model.GripRight);
        float shake = minGrip < 0.3f ? (0.3f - minGrip) / 0.3f * 0.02f : 0f;
        bool handAtSide = step.HasValue && step.Value.Kind == PatKind.Side;
        if (handAtSide)
            shake += 0.008f;
        Vector3 jitter = UnityEngine.Random.insideUnitSphere * shake;
        if (handAtSide)
            jitter.x += (step.Value.Side == Side.Left ? -1f : 1f) * Mathf.Abs(jitter.x);

        float sideSign = lean == Side.Left ? -1f : 1f;
        cam.transform.localPosition = new Vector3(sideSign * leanShift, -Model.Slide * slideDrop + bob, 0f) + jitter;
        cam.transform.localRotation = Quaternion.Euler(-cameraPitch, 0f, -sideSign * leanRoll);

        float deprivation = 1f - Model.Oxygen;
        heartbeat.volume = deprivation;
        heartbeat.pitch = Mathf.Lerp(1f, 1.8f, deprivation);
        var c = vignette.color;
        c.a = deprivation * 0.85f;
        vignette.color = c;

        // 頭頂羊毛被巨人的手壓下去的凹陷，指出手在哪一側。
        bool showDent = step.HasValue && step.Value.Kind != PatKind.Back;
        dent.gameObject.SetActive(step.HasValue);
        if (step.HasValue)
        {
            float dentSide = showDent ? (step.Value.Side == Side.Left ? -1f : 1f) * 0.2f : 0f;
            float press = step.Value.Kind == PatKind.Side ? 0.06f : 0.03f;
            dent.localPosition = new Vector3(dentSide, 0.14f - press, 0f);
        }
    }

    void BuildWool(Sheep sheep)
    {
        Color wool = sheep.IsRam ? new Color(0.55f, 0.51f, 0.44f) : new Color(0.78f, 0.75f, 0.68f);
        float s = sheep.IsRam ? 1.4f : 1f;
        // 兩側垂下的羊毛遮住大半視野，只留前方縫隙看地面與月光。
        foreach (float side in new[] { -1f, 1f })
            Wool("WoolFringe", new Vector3(side * 0.3f * s, 0.06f, 0f), new Vector3(0.06f, 0.22f, 1f * s), wool);
        Wool("WoolBack", new Vector3(0f, 0.06f, -0.45f * s), new Vector3(0.6f * s, 0.22f, 0.06f), wool);
        dent = Wool("HandDent", Vector3.zero, new Vector3(0.4f, 0.06f, 0.4f), new Color(0.12f, 0.1f, 0.09f)).transform;
        dent.gameObject.SetActive(false);
    }

    GameObject Wool(string name, Vector3 localPosition, Vector3 scale, Color color)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = name;
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(rig, false);
        go.transform.localPosition = localPosition;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = OdysseyMaterials.Create(color);
        return go;
    }

    void BuildVignette()
    {
        vignetteCanvas = new GameObject("VignetteCanvas");
        var canvas = vignetteCanvas.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 50;
        var imageGo = new GameObject("Vignette", typeof(RectTransform));
        imageGo.transform.SetParent(vignetteCanvas.transform, false);
        var rt = (RectTransform)imageGo.transform;
        rt.anchorMin = Vector2.zero;
        rt.anchorMax = Vector2.one;
        rt.offsetMin = rt.offsetMax = Vector2.zero;
        vignette = imageGo.AddComponent<UnityEngine.UI.RawImage>();
        vignette.texture = RadialTexture();
        vignette.raycastTarget = false;
        vignette.color = new Color(0f, 0f, 0f, 0f);
    }

    static Texture2D RadialTexture()
    {
        const int size = 128;
        var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
        for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float dx = (x + 0.5f) / size * 2f - 1f, dy = (y + 0.5f) / size * 2f - 1f;
                float a = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.35f, 1.1f, Mathf.Sqrt(dx * dx + dy * dy)));
                tex.SetPixel(x, y, new Color(1f, 1f, 1f, a));
            }
        tex.Apply();
        return tex;
    }
}
