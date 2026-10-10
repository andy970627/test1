using System;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 抱在羊肚底下：把鏡頭掛到羊肚下，讀左右手、憋氣、重心輸入餵給 ClingModel，
/// 依巨人目前的摸羊步驟用 PatJudge 判定，並用身體回饋（下沉、抖動、心跳、暗角、傾斜、羊毛凹陷）表現狀態。
/// 滑鼠可在羊肚下有限範圍轉頭；按住 Shift 往所貼的一側探頭（那側的手得放開）。
/// </summary>
public class ClingController : MonoBehaviour
{
    public ClingParams parameters = new();
    public float lookSensitivity = 0.08f;
    public float defaultPitch = 5f;
    public float yawLimit = 80f;
    public float pitchMin = -30f;
    public float pitchMax = 60f;
    public float peekDistance = 0.6f;
    public float peekSeconds = 0.25f;
    public float slideDrop = 0.12f;
    public float fieldOfView = 95f;
    public float eyeHeight = 0.1f;
    public float minGroundClearance = 0.15f;
    public float eyeLightIntensity = 0.9f;
    public float leanRoll = 8f;
    public float leanShift = 0.1f;
    public float stepLength = 0.5f;
    public float stepBob = 0.03f;

    Camera cam;
    Transform originalParent;
    Vector3 originalLocalPosition;
    Quaternion originalLocalRotation;
    float originalNear;
    float originalFov;
    AudioSource breathing;
    AudioSource gasp;
    float holdTime;

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
    float lookYaw;
    float lookPitch;
    float peekAmount;
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
        lookYaw = 0f;
        lookPitch = defaultPitch;
        peekAmount = 0f;
        lastSheepPosition = sheep.transform.position;

        originalParent = cam.transform.parent;
        originalLocalPosition = cam.transform.localPosition;
        originalLocalRotation = cam.transform.localRotation;
        originalNear = cam.nearClipPlane;
        originalFov = cam.fieldOfView;

        rig = new GameObject("ClingRig").transform;
        rig.SetParent(sheep.BellyAnchor, false);
        cam.transform.SetParent(rig, false);
        rig.localPosition = new Vector3(0f, eyeHeight, 0f);
        cam.nearClipPlane = 0.02f;
        cam.fieldOfView = fieldOfView;
        BuildWool(sheep);
        // 眼睛適應黑暗後的微光：照亮羊肚、羊腿與附近地面。
        var eyeLight = new GameObject("EyeLight").AddComponent<Light>();
        eyeLight.transform.SetParent(rig, false);
        eyeLight.type = LightType.Point;
        eyeLight.color = new Color(0.8f, 0.76f, 0.68f);
        eyeLight.range = 4f;
        eyeLight.intensity = eyeLightIntensity;
        eyeLight.shadows = LightShadows.None;
        BuildVignette();

        heartbeat = gameObject.AddComponent<AudioSource>();
        heartbeat.clip = ProceduralAudio.Heartbeat();
        heartbeat.loop = true;
        heartbeat.volume = 0f;
        heartbeat.Play();
        rustle = gameObject.AddComponent<AudioSource>();
        rustle.clip = ProceduralAudio.WoolRustle();
        rustle.playOnAwake = false;
        breathing = gameObject.AddComponent<AudioSource>();
        breathing.clip = ProceduralAudio.Breathing();
        breathing.loop = true;
        breathing.Play();
        gasp = gameObject.AddComponent<AudioSource>();
        gasp.clip = ProceduralAudio.Gasp();
        gasp.playOnAwake = false;
        holdTime = 0f;

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
            cam.fieldOfView = originalFov;
        }
        if (rig != null)
            Destroy(rig.gameObject);
        if (vignetteCanvas != null)
            Destroy(vignetteCanvas);
        if (heartbeat != null)
            Destroy(heartbeat);
        if (rustle != null)
            Destroy(rustle);
        if (breathing != null)
            Destroy(breathing);
        if (gasp != null)
            Destroy(gasp);
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

        // 羊肚下有限範圍轉頭，從羊腿縫隙往外看。
        if (Cursor.lockState == CursorLockMode.Locked)
        {
            Vector2 look = mouse.delta.ReadValue() * lookSensitivity;
            lookYaw = Mathf.Clamp(lookYaw + look.x, -yawLimit, yawLimit);
            lookPitch = Mathf.Clamp(lookPitch + look.y, pitchMin, pitchMax);
        }

        bool peeking = keyboard.leftShiftKey.isPressed;
        peekAmount = Mathf.MoveTowards(peekAmount, peeking ? 1f : 0f, Time.deltaTime / peekSeconds);

        Side previousLean = Model.Lean;
        bool wasPeeking = Model.IsPeeking;
        FailReason reason = Model.Tick(Time.deltaTime, mouse.leftButton.isPressed, mouse.rightButton.isPressed, keyboard.spaceKey.isPressed, lean, peeking);
        if (Model.Lean != previousLean || (Model.IsPeeking && !wasPeeking))
            rustle.Play();

        PatStep? step = cyclops.PattingSheep == Sheep ? cyclops.CurrentStep : null;
        if (reason == FailReason.None && step.HasValue)
            reason = PatJudge.Evaluate(step.Value, cyclops.StepElapsed, Model);

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
        // 探頭時頭從羊肚下往所貼的一側滑出去、略為抬高。
        Vector3 peekOffset = new Vector3(sideSign * peekDistance, 0.1f, 0f) * peekAmount;
        cam.transform.localPosition = new Vector3(sideSign * leanShift, -Model.Slide * slideDrop + bob, 0f) + peekOffset + jitter;
        cam.transform.localRotation = Quaternion.Euler(-lookPitch, lookYaw, -sideSign * leanRoll * (1f - peekAmount));

        // 地面起伏時鏡頭不能沉進地板。
        Vector3 eye = cam.transform.position;
        float floor = CaveBuilder.GroundHeight(eye) + minGroundClearance;
        if (eye.y < floor)
            cam.transform.position = new Vector3(eye.x, floor, eye.z);

        float deprivation = 1f - Model.Oxygen;
        heartbeat.volume = deprivation;
        heartbeat.pitch = Mathf.Lerp(1f, 1.8f, deprivation);

        // 自己的呼吸：憋氣時完全安靜；越缺氧，喘得越大聲越急。憋超過 1.5 秒再放開會大口吸氣。
        breathing.volume = Model.HoldingBreath ? 0f : 0.3f + 0.7f * deprivation;
        breathing.pitch = Mathf.Lerp(1f, 1.6f, deprivation);
        if (Model.HoldingBreath)
            holdTime += Time.deltaTime;
        else
        {
            if (holdTime > 1.5f)
                gasp.PlayOneShot(gasp.clip, 0.5f + deprivation);
            holdTime = 0f;
        }
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
            dent.localPosition = new Vector3(dentSide, 0.14f - eyeHeight - press, 0f);
        }
    }

    void BuildWool(Sheep sheep)
    {
        Color wool = sheep.IsRam ? new Color(0.55f, 0.51f, 0.44f) : new Color(0.78f, 0.75f, 0.68f);
        float s = sheep.IsRam ? 1.4f : 1f;
        // 兩側垂下的羊毛遮住大半視野，只留前方縫隙看地面與月光。
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
