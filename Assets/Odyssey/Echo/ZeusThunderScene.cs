using System;
using System.Collections;
using UnityEngine;

/// <summary>
/// 違背宙斯法則的呈現（規格第 31 節 B2，致敬電影裡貫穿全片的雅典娜與燃燒的木馬；低多邊形暫代）：
/// 0～1 秒雷光照亮全洞，離你最遠的岩壁前站著雅典娜的剪影（頭盔與羽冠、長矛、圓盾、一雙灰色微光的眼睛）看著你；
/// 0.4～1 秒她轉身背對你，貓頭鷹從她肩上飛走；1～2.2 秒岩壁前一匹燃燒的木馬慢慢燒成灰；
/// 1～1.8 秒鏡頭低頭、雙手垂下發抖（奧德修斯的神情）。2.5 秒全部收起。夜晚計時不停。
/// </summary>
public class ZeusThunderScene : MonoBehaviour
{
    public const float Duration = 2.5f;
    const float WallScale = 0.88f;
    const float RadiusX = 15f, RadiusZ = 10f;

    static readonly Color Robe = new(0.16f, 0.17f, 0.2f);
    static readonly Color RobeGlow = new(0.05f, 0.055f, 0.07f);
    static readonly Color EyeGlow = new(0.75f, 0.78f, 0.85f);
    static readonly Color Ember = new(1f, 0.38f, 0.08f);

    FirstPersonPlayer body;
    FirstPersonHands hands;
    Transform athena, athenaTurn, owl, owlWingL, owlWingR, horse;
    Material horseMaterial;
    Coroutine running;

    public bool Playing => running != null;

    /// <summary>貓頭鷹飛走（播叫聲與拍翅）。</summary>
    public event Action<Vector3> OwlFlies;

    /// <summary>木馬開始燃燒（播劈啪聲與遠處哭喊）。</summary>
    public event Action<Vector3> HorseBurns;

    /// <summary>整段播完（接著唸木馬的詩句）。</summary>
    public event Action Finished;

    public void Init(FirstPersonPlayer body, FirstPersonHands hands)
    {
        this.body = body;
        this.hands = hands;
        BuildAthena();
        BuildHorse();
        Hide();
    }

    /// <summary>洞裡的偷襲：雅典娜站在離玩家最遠的岩壁前。lightsCave＝這一夜第一次偷襲（雷光照亮全洞）。</summary>
    public void Play(Vector3 playerPos, bool lightsCave)
    {
        Vector3 wall = FarWall(playerPos);
        Begin(wall, playerPos, lightsCave);
    }

    /// <summary>岸邊射向睡著的巨人：雅典娜站在海面上，木馬的影子映在水面。</summary>
    public void PlayShore(Vector3 seaPoint, Vector3 viewer) => Begin(seaPoint, viewer, false);

    public void Stop()
    {
        if (running != null)
            StopCoroutine(running);
        running = null;
        Hide();
        if (body != null)
            body.ScenePitch = 0f;
        if (hands != null)
            hands.Lower = 0f;
    }

    void Begin(Vector3 at, Vector3 viewer, bool lightsCave)
    {
        Stop();
        running = StartCoroutine(Timeline(at, viewer, lightsCave));
    }

    /// <summary>從洞中央朝「離開玩家」的方向，碰到（內縮的）橢圓岩壁的那一點，貼地。</summary>
    static Vector3 FarWall(Vector3 player)
    {
        var d = new Vector2(-player.x, -player.z);
        if (d.sqrMagnitude < 0.25f)
            d = new Vector2(0f, -1f);
        d.Normalize();
        float k = 1f / Mathf.Sqrt(d.x * d.x / (RadiusX * RadiusX) + d.y * d.y / (RadiusZ * RadiusZ)) * WallScale;
        var p = new Vector3(d.x * k, 0f, d.y * k);
        p.y = CaveBuilder.GroundHeight(p);
        return p;
    }

    IEnumerator Timeline(Vector3 at, Vector3 viewer, bool lightsCave)
    {
        Vector3 toViewer = viewer - at;
        toViewer.y = 0f;
        Quaternion face = toViewer.sqrMagnitude > 1e-4f ? Quaternion.LookRotation(toViewer) : Quaternion.identity;
        Vector3 side = face * Vector3.right;

        athena.SetPositionAndRotation(at, face);
        athenaTurn.localRotation = Quaternion.identity;
        athena.gameObject.SetActive(true);
        owl.localPosition = new Vector3(0.45f, 2.6f, 0f);
        owl.gameObject.SetActive(true);
        horse.SetPositionAndRotation(at + side * 3f, face * Quaternion.Euler(0f, 90f, 0f));
        horse.localScale = Vector3.one;
        horse.gameObject.SetActive(false);
        if (lightsCave && EchoField.Instance != null)
            EchoField.Instance.FlashAll(at + Vector3.up * 3f, new Color(0.75f, 0.8f, 1f));

        bool owlGone = false, horseLit = false;
        Vector3 owlStart = owl.localPosition;
        for (float t = 0f; t < Duration; t += Time.deltaTime)
        {
            // 雅典娜轉身：0.4～1 秒轉 180°。
            float turn = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.4f, 1f, t));
            athenaTurn.localRotation = Quaternion.Euler(0f, 180f * turn, 0f);

            // 貓頭鷹：0.4 秒起往上、往後飛走，翅膀拍動。
            if (t >= 0.4f)
            {
                if (!owlGone)
                {
                    owlGone = true;
                    OwlFlies?.Invoke(owl.position);
                }
                float f = t - 0.4f;
                owl.localPosition = owlStart + new Vector3(0.5f * f, 2.2f * f, -1.5f * f);
                float flap = Mathf.Sin(f * 28f) * 50f;
                owlWingL.localRotation = Quaternion.Euler(0f, 0f, flap);
                owlWingR.localRotation = Quaternion.Euler(0f, 0f, -flap);
                if (f > 1.6f)
                    owl.gameObject.SetActive(false);
            }

            // 燃燒的木馬：1～2.2 秒火光閃動、慢慢燒塌成灰。
            if (t >= 1f)
            {
                if (!horseLit)
                {
                    horseLit = true;
                    horse.gameObject.SetActive(true);
                    HorseBurns?.Invoke(horse.position);
                }
                float burn = Mathf.InverseLerp(1f, 2.2f, t);
                float flicker = 0.75f + 0.25f * Mathf.PerlinNoise(t * 14f, 0.5f);
                OdysseyMaterials.SetEmission(horseMaterial, Ember * flicker * (1f - burn) * 1.4f);
                horse.localScale = new Vector3(1f, Mathf.Lerp(1f, 0.15f, burn * burn), 1f);
                if (burn >= 1f)
                    horse.gameObject.SetActive(false);
            }

            // 奧德修斯的神情：1～1.8 秒低頭 15° 再回正，雙手垂下發抖。
            float look = t >= 1f && t <= 1.8f ? Mathf.Sin(Mathf.PI * (t - 1f) / 0.8f) : 0f;
            if (body != null)
                body.ScenePitch = 15f * look;
            if (hands != null)
            {
                hands.Lower = look;
                hands.Tremble = Mathf.Max(hands.Tremble, look);
            }
            yield return null;
        }
        running = null;
        Hide();
        if (body != null)
            body.ScenePitch = 0f;
        if (hands != null)
            hands.Lower = 0f;
        Finished?.Invoke();
    }

    void Hide()
    {
        athena.gameObject.SetActive(false);
        horse.gameObject.SetActive(false);
    }

    void BuildAthena()
    {
        athena = new GameObject("Athena").transform;
        athena.SetParent(transform, false);
        athenaTurn = new GameObject("Turn").transform;
        athenaTurn.SetParent(athena, false);
        Material robe = OdysseyMaterials.Create(Robe, RobeGlow);
        Material eyes = OdysseyMaterials.Create(Color.black, EyeGlow);

        Part(PrimitiveType.Cylinder, athenaTurn, new Vector3(0f, 1.1f, 0f), new Vector3(0.7f, 1.1f, 0.5f), Quaternion.identity, robe);       // 長袍
        Part(PrimitiveType.Cube, athenaTurn, new Vector3(0f, 2.15f, 0f), new Vector3(0.75f, 0.45f, 0.4f), Quaternion.identity, robe);         // 肩與胸甲
        Part(PrimitiveType.Sphere, athenaTurn, new Vector3(0f, 2.6f, 0f), new Vector3(0.36f, 0.42f, 0.38f), Quaternion.identity, robe);       // 頭
        Part(PrimitiveType.Cube, athenaTurn, new Vector3(0f, 2.82f, 0f), new Vector3(0.42f, 0.18f, 0.45f), Quaternion.identity, robe);        // 頭盔
        Part(PrimitiveType.Cube, athenaTurn, new Vector3(0f, 3.0f, -0.05f), new Vector3(0.06f, 0.3f, 0.6f), Quaternion.identity, robe);       // 羽冠
        Part(PrimitiveType.Sphere, athenaTurn, new Vector3(-0.08f, 2.63f, 0.17f), Vector3.one * 0.05f, Quaternion.identity, eyes);           // 灰色的眼睛
        Part(PrimitiveType.Sphere, athenaTurn, new Vector3(0.08f, 2.63f, 0.17f), Vector3.one * 0.05f, Quaternion.identity, eyes);
        Part(PrimitiveType.Cylinder, athenaTurn, new Vector3(0.55f, 1.7f, 0.1f), new Vector3(0.05f, 1.7f, 0.05f), Quaternion.identity, robe); // 長矛
        Part(PrimitiveType.Cylinder, athenaTurn, new Vector3(-0.55f, 1.4f, 0.15f), new Vector3(0.9f, 0.04f, 0.9f), Quaternion.Euler(90f, 0f, 0f), robe); // 圓盾

        owl = new GameObject("Owl").transform;
        owl.SetParent(athenaTurn, false);
        Part(PrimitiveType.Sphere, owl, Vector3.zero, new Vector3(0.18f, 0.24f, 0.18f), Quaternion.identity, robe);
        Part(PrimitiveType.Sphere, owl, new Vector3(-0.04f, 0.06f, 0.08f), Vector3.one * 0.035f, Quaternion.identity, eyes);
        Part(PrimitiveType.Sphere, owl, new Vector3(0.04f, 0.06f, 0.08f), Vector3.one * 0.035f, Quaternion.identity, eyes);
        owlWingL = Pivot(owl, new Vector3(-0.08f, 0.02f, 0f));
        Part(PrimitiveType.Cube, owlWingL, new Vector3(-0.14f, 0f, 0f), new Vector3(0.28f, 0.02f, 0.14f), Quaternion.identity, robe);
        owlWingR = Pivot(owl, new Vector3(0.08f, 0.02f, 0f));
        Part(PrimitiveType.Cube, owlWingR, new Vector3(0.14f, 0f, 0f), new Vector3(0.28f, 0.02f, 0.14f), Quaternion.identity, robe);
    }

    void BuildHorse()
    {
        horse = new GameObject("BurningHorse").transform;
        horse.SetParent(transform, false);
        horseMaterial = OdysseyMaterials.Create(new Color(0.08f, 0.04f, 0.02f), Ember);
        Part(PrimitiveType.Cube, horse, new Vector3(0f, 1.6f, 0f), new Vector3(2.4f, 1f, 0.9f), Quaternion.identity, horseMaterial);           // 身體
        Part(PrimitiveType.Cube, horse, new Vector3(1.25f, 2.35f, 0f), new Vector3(0.45f, 1.2f, 0.45f), Quaternion.Euler(0f, 0f, -25f), horseMaterial); // 脖子
        Part(PrimitiveType.Cube, horse, new Vector3(1.65f, 2.95f, 0f), new Vector3(0.75f, 0.35f, 0.35f), Quaternion.identity, horseMaterial);  // 頭
        for (int i = 0; i < 4; i++)
        {
            float x = i < 2 ? 0.9f : -0.9f, z = i % 2 == 0 ? 0.3f : -0.3f;
            Part(PrimitiveType.Cube, horse, new Vector3(x, 0.75f, z), new Vector3(0.22f, 0.9f, 0.22f), Quaternion.identity, horseMaterial); // 腿
            Part(PrimitiveType.Cylinder, horse, new Vector3(x, 0.18f, z * 1.8f), new Vector3(0.36f, 0.04f, 0.36f), Quaternion.Euler(90f, 0f, 0f), horseMaterial); // 輪子
        }
        Part(PrimitiveType.Cube, horse, new Vector3(0f, 0.3f, 0f), new Vector3(2.8f, 0.12f, 1f), Quaternion.identity, horseMaterial);          // 底座
    }

    static Transform Pivot(Transform parent, Vector3 pos)
    {
        var t = new GameObject("Pivot").transform;
        t.SetParent(parent, false);
        t.localPosition = pos;
        return t;
    }

    static void Part(PrimitiveType type, Transform parent, Vector3 pos, Vector3 scale, Quaternion rot, Material mat)
    {
        var go = GameObject.CreatePrimitive(type);
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(parent, false);
        go.transform.localPosition = pos;
        go.transform.localRotation = rot;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = mat;
    }
}
