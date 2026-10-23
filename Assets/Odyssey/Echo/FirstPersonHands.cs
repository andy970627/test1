using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 第一人稱動作畫面（規格第 26 節 D）：
/// 拿弓、拉弓／放箭、推巨石（雙臂按在石面上、輕推小抖、猛推大抖、頂住收近）、
/// 拿木樁時弓收起、塞楔子時右手伸向石縫。
/// 採用低多邊形自發光材質，在黑洞中可見微光輪廓。
/// </summary>
public class FirstPersonHands : MonoBehaviour
{
    static readonly Color SkinColor = new(0.28f, 0.24f, 0.20f);
    static readonly Color BowWood = new(0.32f, 0.22f, 0.12f);
    static readonly Color StringColor = new(0.45f, 0.42f, 0.38f);
    static readonly Color ArrowColor = new(0.35f, 0.30f, 0.22f);
    static readonly Color StoneColor = new(0.30f, 0.30f, 0.32f);

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
        var mat = EchoMaterials.Create(SkinColor);

        leftArm = CreateArm("LeftArm", mat);
        rightArm = CreateArm("RightArm", mat);

        // 塞楔子時右手握著的石子
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

    static Transform CreateArm(string name, Material mat)
    {
        var arm = new GameObject(name).transform;
        var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        Destroy(capsule.GetComponent<Collider>());
        capsule.transform.SetParent(arm, false);
        capsule.transform.localScale = new Vector3(0.09f, 0.25f, 0.09f);
        capsule.transform.localRotation = Quaternion.Euler(70f, 0f, 0f);
        capsule.GetComponent<Renderer>().sharedMaterial = mat;
        return arm;
    }

    void BuildBow()
    {
        bowRoot = new GameObject("BowViewmodel").transform;
        bowRoot.SetParent(transform, false);

        var woodMat = EchoMaterials.Create(BowWood);
        var stringMat = EchoMaterials.Create(StringColor);

        // 用 5 段方塊組合微彎的弓身
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
        }

        // 弓弦
        var str = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(str.GetComponent<Collider>());
        str.transform.SetParent(bowRoot, false);
        str.transform.localScale = new Vector3(0.005f, 0.30f, 0.005f);
        str.transform.localPosition = new Vector3(0f, 0f, 0.02f);
        str.GetComponent<Renderer>().sharedMaterial = stringMat;
        bowString = str.transform;

        // 搭在弓上的箭
        var arrow = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(arrow.GetComponent<Collider>());
        arrow.transform.SetParent(bowRoot, false);
        arrow.transform.localScale = new Vector3(0.012f, 0.35f, 0.012f);
        arrow.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
        arrow.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(ArrowColor);
        nockedArrow = arrow.transform;
    }

    void BuildQuiver()
    {
        quiverRoot = new GameObject("QuiverViewmodel").transform;
        quiverRoot.SetParent(transform, false);
        quiverRoot.localPosition = new Vector3(0.38f, -0.32f, 0.45f);

        quiverArrows = new Transform[3];
        var mat = EchoMaterials.Create(ArrowColor);
        for (int i = 0; i < 3; i++)
        {
            var arrow = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Destroy(arrow.GetComponent<Collider>());
            arrow.transform.SetParent(quiverRoot, false);
            arrow.transform.localPosition = new Vector3(i * 0.025f, 0f, 0f);
            arrow.transform.localRotation = Quaternion.Euler(20f, -15f, 0f);
            arrow.transform.localScale = new Vector3(0.01f, 0.18f, 0.01f);
            arrow.GetComponent<Renderer>().sharedMaterial = mat;
            quiverArrows[i] = arrow.transform;
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
