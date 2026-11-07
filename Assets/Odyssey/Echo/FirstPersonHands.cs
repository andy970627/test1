using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 第一人稱動作畫面與古希臘英雄裝備美術（規格第 26 節 D）：
/// 奧德修斯曬黑結實的手臂、皮質護腕（含青銅釘飾）、希臘反曲複合木弓（含暗金飾邊）、
/// 青銅倒鉤箭頭、鷹羽箭翎、後背皮質箭筒，以及推巨石與塞楔子時的手部動態。
/// 材質帶微光自發光，在全黑洞穴中呈現輪廓與質感。
/// </summary>
public class FirstPersonHands : MonoBehaviour
{
    static readonly Color SkinColor = OdysseyPalette.HeroSkin;
    static readonly Color BracerLeather = OdysseyPalette.BracerLeather;
    static readonly Color BronzeMetal = OdysseyPalette.Bronze;
    static readonly Color GoldAccent = OdysseyPalette.IthacaGold;
    static readonly Color BowWood = OdysseyPalette.BowWood;
    static readonly Color StringColor = OdysseyPalette.BowString;
    static readonly Color ArrowWood = OdysseyPalette.ArrowWood;
    static readonly Color FeatherWhite = OdysseyPalette.Feather;
    static readonly Color StoneColor = OdysseyPalette.HandStone;

    EchoPlayer player;
    BoulderSlide slide;

    Transform leftArm, rightArm;
    Transform wedgeStone;
    Transform bowRoot, bowString, nockedArrow;
    Transform quiverRoot;
    Transform[] quiverArrows;

    float releaseTimer = 1f;
    bool wasDrawing;

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
