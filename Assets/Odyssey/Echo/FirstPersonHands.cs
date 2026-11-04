using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 第一人稱動作畫面與古希臘英雄裝備美術（規格第 26 節 D）：
/// 奧德修斯曬黑結實的手臂、皮質護腕（含青銅釘飾）、希臘反曲複合木弓（含暗金飾邊）、
/// 青銅倒鉤箭頭、鷹羽箭翎、後背皮質箭筒，以及推巨石與塞楔子時的手部動態。
/// 材質帶微光自發光，在全黑洞穴中呈現輪廓與質感。
/// 規格第 31 節：空白鍵的彈弓（左手握 Y 形彈弓、右手拉皮筋，拉的時候弓收起）；
/// 偷襲後的手抖（Tremble）與低頭時雙手垂下（Lower），由遊戲迴圈與雅典娜過場設定。
/// </summary>
public class FirstPersonHands : MonoBehaviour
{
    static readonly Color SkinColor = new(0.38f, 0.30f, 0.24f);
    static readonly Color BracerLeather = new(0.20f, 0.14f, 0.09f);
    static readonly Color BronzeMetal = new(0.58f, 0.44f, 0.22f);
    static readonly Color GoldAccent = new(0.70f, 0.58f, 0.28f);
    static readonly Color BowWood = new(0.28f, 0.18f, 0.10f);
    static readonly Color StringColor = new(0.48f, 0.45f, 0.40f);
    static readonly Color ArrowWood = new(0.35f, 0.30f, 0.22f);
    static readonly Color FeatherWhite = new(0.65f, 0.63f, 0.58f);
    static readonly Color StoneColor = new(0.32f, 0.32f, 0.35f);

    EchoPlayer player;
    BoulderSlide slide;

    Transform leftArm, rightArm;
    Transform wedgeStone;
    Transform bowRoot, bowString, nockedArrow;
    Transform quiverRoot;
    Transform[] quiverArrows;

    float releaseTimer = 1f;
    bool wasDrawing;

    // 彈弓（規格第 31 節 A）。
    static readonly Color SlingBand = new(0.12f, 0.09f, 0.07f);
    const float SlingLinger = 0.25f;
    Transform slingRoot, slingBand;
    float slingShown;

    /// <summary>手抖（0～1）：木馬的重量，偷襲後的那一夜。</summary>
    public float Tremble { get; set; }

    /// <summary>雙手垂下（0～1）：偷襲過場裡奧德修斯低頭的那一刻。</summary>
    public float Lower { get; set; }

    public void Init(EchoPlayer player, BoulderSlide slide, Transform cameraTransform)
    {
        this.player = player;
        this.slide = slide;

        transform.SetParent(cameraTransform, false);
        transform.localPosition = Vector3.zero;
        transform.localRotation = Quaternion.identity;

        BuildArms();
        BuildBow();
        BuildQuiver();
        BuildSlingshot();
    }

    /// <summary>Y 形木柄＋皮筋；左手握柄，右手拉皮筋（只在拉彈弓時出現）。</summary>
    void BuildSlingshot()
    {
        slingRoot = new GameObject("SlingshotViewmodel").transform;
        slingRoot.SetParent(transform, false);
        var wood = EchoMaterials.Create(BowWood);
        Part(PrimitiveType.Cube, slingRoot, new Vector3(0f, 0f, 0f), new Vector3(0.025f, 0.12f, 0.025f), Quaternion.identity, wood);
        Part(PrimitiveType.Cube, slingRoot, new Vector3(-0.03f, 0.09f, 0f), new Vector3(0.02f, 0.09f, 0.02f), Quaternion.Euler(0f, 0f, 25f), wood);
        Part(PrimitiveType.Cube, slingRoot, new Vector3(0.03f, 0.09f, 0f), new Vector3(0.02f, 0.09f, 0.02f), Quaternion.Euler(0f, 0f, -25f), wood);
        slingBand = Part(PrimitiveType.Cube, slingRoot, Vector3.zero, Vector3.one * 0.01f, Quaternion.identity, EchoMaterials.Create(SlingBand));
        slingRoot.gameObject.SetActive(false);
    }

    static Transform Part(PrimitiveType type, Transform parent, Vector3 pos, Vector3 scale, Quaternion rot, Material mat)
    {
        var go = GameObject.CreatePrimitive(type);
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(parent, false);
        go.transform.localPosition = pos;
        go.transform.localRotation = rot;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = mat;
        return go.transform;
    }

    void BuildArms()
    {
        var skinMat = EchoMaterials.Create(SkinColor);
        leftArm = CreateArm("LeftArm", skinMat);
        rightArm = CreateArm("RightArm", skinMat);

        // 塞楔子時右手握著的花崗岩石子
        var stone = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        stone.name = "WedgeStone";
        Destroy(stone.GetComponent<Collider>());
        stone.transform.SetParent(rightArm, false);
        stone.transform.localPosition = new Vector3(0f, 0.26f, 0f);
        stone.transform.localScale = new Vector3(0.08f, 0.08f, 0.08f);
        stone.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(StoneColor);
        wedgeStone = stone.transform;
        wedgeStone.gameObject.SetActive(false);
    }

    static Transform CreateArm(string name, Material skinMat)
    {
        var arm = new GameObject(name).transform;

        // 手臂主體
        var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        Destroy(capsule.GetComponent<Collider>());
        capsule.transform.SetParent(arm, false);
        capsule.transform.localScale = new Vector3(0.095f, 0.25f, 0.095f);
        capsule.transform.localRotation = Quaternion.Euler(70f, 0f, 0f);
        capsule.GetComponent<Renderer>().sharedMaterial = skinMat;

        // 希臘戰士皮質護腕（Leather Bracer）
        var bracer = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(bracer.GetComponent<Collider>());
        bracer.name = "Bracer";
        bracer.transform.SetParent(arm, false);
        bracer.transform.localScale = new Vector3(0.108f, 0.09f, 0.108f);
        bracer.transform.localRotation = Quaternion.Euler(70f, 0f, 0f);
        bracer.transform.localPosition = new Vector3(0f, 0.04f, 0f);
        bracer.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(BracerLeather);

        // 護腕上的青銅鉚釘
        var stud = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Destroy(stud.GetComponent<Collider>());
        stud.name = "BronzeStud";
        stud.transform.SetParent(bracer.transform, false);
        stud.transform.localScale = new Vector3(0.24f, 0.15f, 0.24f);
        stud.transform.localPosition = new Vector3(0f, 0f, 0.52f);
        stud.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(BronzeMetal);

        return arm;
    }

    void BuildBow()
    {
        bowRoot = new GameObject("BowViewmodel").transform;
        bowRoot.SetParent(transform, false);

        var woodMat = EchoMaterials.Create(BowWood);
        var stringMat = EchoMaterials.Create(StringColor);
        var goldMat = EchoMaterials.Create(GoldAccent);

        // 5 段微彎木質弓身
        for (int i = -2; i <= 2; i++)
        {
            var seg = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(seg.GetComponent<Collider>());
            seg.transform.SetParent(bowRoot, false);
            float offset = Mathf.Abs(i) * 0.03f;
            seg.transform.localPosition = new Vector3(0f, i * 0.12f, -offset);
            seg.transform.localRotation = Quaternion.Euler(i * -12f, 0f, 0f);
            seg.transform.localScale = new Vector3(0.025f, 0.13f, 0.025f);
            seg.GetComponent<Renderer>().sharedMaterial = woodMat;

            // 上下弓稍（Siyahs）帶有古希臘暗金雕飾
            if (Mathf.Abs(i) == 2)
            {
                var tip = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Destroy(tip.GetComponent<Collider>());
                tip.transform.SetParent(seg.transform, false);
                tip.transform.localScale = new Vector3(1.1f, 0.3f, 1.1f);
                tip.transform.localPosition = new Vector3(0f, (i > 0 ? 0.45f : -0.45f), 0f);
                tip.GetComponent<Renderer>().sharedMaterial = goldMat;
            }
        }

        // 弓弦
        var str = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(str.GetComponent<Collider>());
        str.transform.SetParent(bowRoot, false);
        str.transform.localScale = new Vector3(0.005f, 0.30f, 0.005f);
        str.transform.localPosition = new Vector3(0f, 0f, 0.02f);
        str.GetComponent<Renderer>().sharedMaterial = stringMat;
        bowString = str.transform;

        // 搭在弓上的箭（含青銅倒鉤箭頭與鷹羽箭翎）
        nockedArrow = CreateArrowModel(bowRoot, true);
    }

    static Transform CreateArrowModel(Transform parent, bool fullLength)
    {
        var root = new GameObject("ArrowModel").transform;
        root.SetParent(parent, false);

        // 木桿
        var shaft = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(shaft.GetComponent<Collider>());
        shaft.transform.SetParent(root, false);
        float len = fullLength ? 0.35f : 0.18f;
        shaft.transform.localScale = new Vector3(0.012f, len, 0.012f);
        shaft.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
        shaft.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(ArrowWood);

        // 青銅箭頭
        var tip = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(tip.GetComponent<Collider>());
        tip.transform.SetParent(root, false);
        tip.transform.localScale = new Vector3(0.02f, 0.05f, 0.02f);
        tip.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
        tip.transform.localPosition = new Vector3(0f, 0f, len + 0.02f);
        tip.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(BronzeMetal);

        // 鷹羽箭翎（Fletching）
        var fletch = GameObject.CreatePrimitive(PrimitiveType.Quad);
        Destroy(fletch.GetComponent<Collider>());
        fletch.transform.SetParent(root, false);
        fletch.transform.localScale = new Vector3(0.04f, 0.06f, 0.04f);
        fletch.transform.localPosition = new Vector3(0f, 0f, -len + 0.04f);
        fletch.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(FeatherWhite);

        return root;
    }

    void BuildQuiver()
    {
        quiverRoot = new GameObject("QuiverViewmodel").transform;
        quiverRoot.SetParent(transform, false);
        quiverRoot.localPosition = new Vector3(0.38f, -0.32f, 0.45f);

        // 箭筒筒身（Leather Quiver Body）
        var tube = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(tube.GetComponent<Collider>());
        tube.name = "QuiverTube";
        tube.transform.SetParent(quiverRoot, false);
        tube.transform.localScale = new Vector3(0.09f, 0.16f, 0.09f);
        tube.transform.localRotation = Quaternion.Euler(20f, -15f, 0f);
        tube.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(BracerLeather);

        // 箭筒青銅鑲邊
        var band = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(band.GetComponent<Collider>());
        band.name = "BronzeBand";
        band.transform.SetParent(tube.transform, false);
        band.transform.localScale = new Vector3(1.08f, 0.12f, 1.08f);
        band.transform.localPosition = new Vector3(0f, 0.85f, 0f);
        band.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(BronzeMetal);

        quiverArrows = new Transform[3];
        for (int i = 0; i < 3; i++)
        {
            var arrow = CreateArrowModel(quiverRoot, false);
            arrow.localPosition = new Vector3((i - 1) * 0.022f, 0.08f, 0f);
            arrow.localRotation = Quaternion.Euler(20f, -15f + (i - 1) * 5f, 0f);
            quiverArrows[i] = arrow;
        }
    }

    void Update()
    {
        if (player == null)
            return;

        float dt = Time.deltaTime;
        UpdateBowState(dt);
        UpdatePushHands(dt);
        UpdateSlingshot(dt);
        UpdateTremble();
    }

    /// <summary>拉彈弓時：弓收起，左手把彈弓舉到畫面中下方，右手把皮筋往後拉；放開後再留 0.25 秒。</summary>
    void UpdateSlingshot(float dt)
    {
        bool drawing = player.Slingshot.Drawing;
        slingShown = drawing ? SlingLinger : Mathf.Max(0f, slingShown - dt);
        bool show = slingShown > 0f && !player.CarryingStake;
        slingRoot.gameObject.SetActive(show);
        if (!show)
            return;
        bowRoot.gameObject.SetActive(false);
        float pull = drawing ? player.Slingshot.Fraction : 0f;
        slingRoot.localPosition = new Vector3(-0.08f, -0.14f, 0.45f);
        slingRoot.localRotation = Quaternion.identity;

        leftArm.gameObject.SetActive(true);
        leftArm.localPosition = slingRoot.localPosition + new Vector3(0f, -0.12f, -0.02f);
        leftArm.localRotation = Quaternion.Euler(75f, 10f, 0f);
        rightArm.gameObject.SetActive(true);
        Vector3 hand = new Vector3(0f, 0.09f, -0.03f - 0.2f * pull);
        rightArm.localPosition = slingRoot.localPosition + hand + new Vector3(0.02f, -0.22f, 0f);
        rightArm.localRotation = Quaternion.Euler(80f, -10f, 0f);

        Vector3 fork = new Vector3(0f, 0.12f, 0f);
        Vector3 span = hand - fork;
        slingBand.localPosition = (hand + fork) / 2f;
        slingBand.localRotation = span.sqrMagnitude > 1e-6f ? Quaternion.LookRotation(span) : Quaternion.identity;
        slingBand.localScale = new Vector3(0.012f, 0.008f, Mathf.Max(0.01f, span.magnitude));
    }

    /// <summary>整組手部：手抖時平滑地晃、低頭時往下垂。</summary>
    void UpdateTremble()
    {
        float t = Time.time * 9f;
        Vector3 shake = Tremble > 0f
            ? new Vector3(Mathf.PerlinNoise(t, 0.1f) - 0.5f, Mathf.PerlinNoise(0.4f, t) - 0.5f, 0f) * 0.02f * Tremble
            : Vector3.zero;
        transform.localPosition = shake + new Vector3(0f, -0.25f * Lower, 0f);
    }

    void UpdateBowState(float dt)
    {
        bool hasBow = !player.CarryingStake;
        bowRoot.gameObject.SetActive(hasBow);
        quiverRoot.gameObject.SetActive(hasBow);

        if (!hasBow)
            return;

        // 箭筒顯示剩餘箭數
        for (int i = 0; i < quiverArrows.Length; i++)
            quiverArrows[i].gameObject.SetActive(i < player.Arrows);

        bool drawing = player.Bow.Drawing;
        if (wasDrawing && !drawing)
            releaseTimer = 0f;
        else if (!drawing)
            releaseTimer += dt;
        wasDrawing = drawing;

        float pull = ViewPose.StringPull(player.Bow.Fraction, drawing ? -1f : releaseTimer);

        // 拉弓時弓移向中央，放弦時彈回
        Vector3 idlePos = new(-0.28f, -0.22f, 0.50f);
        Vector3 drawPos = new(-0.02f, -0.05f, 0.42f);
        bowRoot.localPosition = Vector3.Lerp(idlePos, drawPos, drawing ? player.Bow.Fraction : 0f);
        bowRoot.localRotation = Quaternion.Euler(5f, drawing ? -8f : 15f, drawing ? 0f : -10f);

        // 弦與箭的拉扯位移
        bowString.localPosition = new Vector3(0f, 0f, 0.02f - pull * 0.18f);
        nockedArrow.gameObject.SetActive(drawing && player.Arrows > 0);
        nockedArrow.localPosition = new Vector3(0f, 0f, 0.12f - pull * 0.18f);
    }

    void UpdatePushHands(float dt)
    {
        bool pushing = player.AtBoulder && player.PushMode != PushMode.None;
        bool braced = player.AtBoulder && player.PushMode == PushMode.None && slide.Opening > 0.05f;
        bool wedging = player.Wedging;

        leftArm.SetParent(transform, false);
        rightArm.SetParent(transform, false);

        wedgeStone.gameObject.SetActive(wedging);

        if (pushing || braced)
        {
            float spread = ViewPose.HandSpread(braced);
            float shake = ViewPose.PushShake(player.PushMode);
            Vector3 jitter = shake > 0f ? Random.insideUnitSphere * shake : Vector3.zero;

            float reachZ = braced ? 0.45f : 0.58f;
            float heightY = braced ? -0.15f : -0.18f;

            leftArm.gameObject.SetActive(true);
            rightArm.gameObject.SetActive(true);

            leftArm.localPosition = new Vector3(-spread * 0.5f, heightY, reachZ) + jitter;
            leftArm.localRotation = Quaternion.Euler(75f, 10f, 0f);

            rightArm.localPosition = new Vector3(spread * 0.5f, heightY, reachZ) + jitter;
            rightArm.localRotation = Quaternion.Euler(75f, -10f, 0f);
        }
        else if (wedging)
        {
            leftArm.gameObject.SetActive(false);
            rightArm.gameObject.SetActive(true);

            float reach = ViewPose.WedgeReach(1f - (player.WedgeBusy / 0.6f));
            rightArm.localPosition = new Vector3(0.18f, -0.25f + reach * 0.3f, 0.35f + reach);
            rightArm.localRotation = Quaternion.Euler(85f, -15f, 0f);
        }
        else
        {
            // 待機隱藏在畫面下緣之外
            leftArm.gameObject.SetActive(false);
            rightArm.gameObject.SetActive(false);
        }
    }
}
