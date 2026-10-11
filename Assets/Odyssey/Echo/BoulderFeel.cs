using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 推巨石的份量感，只是畫面、不影響規則或聲音：巨石晃動、卡住時往回一頓、鏡頭前傾與震動、
/// 縫底的拖痕（寬 = 這一夜推到的最大開口）、底部掉下的小碎石（不出聲）。
/// </summary>
public class BoulderFeel : MonoBehaviour
{
    const float SwayHz = 3f;
    const float LightSway = 0.4f, HeavySway = 1.2f, SlideSway = 0.2f;
    const float LightBob = 0.005f, HeavyBob = 0.015f;
    const float CatchJolt = 0.04f, CatchJoltSeconds = 0.3f;
    const float LeanDegrees = 3f, LeanSeconds = 0.2f;
    const float HeavyShake = 0.01f;
    const float CameraKick = 0.05f, CameraKickSeconds = 0.25f;
    const float LightGritSeconds = 0.4f, HeavyGritSeconds = 0.15f;
    const int MaxGrit = 20;
    const float GritLifetime = 6f;
    static readonly Color MarkColor = new(0.5f, 0.42f, 0.3f);
    static readonly Color GritColor = new(0.55f, 0.45f, 0.32f);

    readonly List<GameObject> grit = new();
    Boulder boulder;
    FirstPersonPlayer player;
    Transform mark;
    Material gritMaterial;
    float time;
    float sway;
    float joltLeft;
    float kickLeft;
    float gritTimer;

    public void Init(Boulder boulder, FirstPersonPlayer player)
    {
        this.boulder = boulder;
        this.player = player;
        gritMaterial = EchoMaterials.Create(GritColor);

        var markGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
        markGo.name = "DragMark";
        Destroy(markGo.GetComponent<Collider>());
        markGo.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(MarkColor);
        mark = markGo.transform;
        mark.SetParent(transform, false);
        ResetForNight();
    }

    /// <summary>整個洞的震動幅度（公尺，例如巨人禱告時 0.02）；疊加在鏡頭上。</summary>
    public float Tremor { get; set; }

    /// <summary>每幀在 Boulder.SetOpening 之後呼叫。</summary>
    public void Tick(PushMode mode, bool catching, bool sliding, float maxOpening)
    {
        float dt = Time.deltaTime;
        time += dt;
        if (catching)
        {
            joltLeft = CatchJoltSeconds;
            kickLeft = CameraKickSeconds;
        }
        joltLeft = Mathf.Max(0f, joltLeft - dt);
        kickLeft = Mathf.Max(0f, kickLeft - dt);

        // 巨石：前後搖、上下震，卡住時往洞內（−Z）頓一下再回位。
        float targetSway = mode == PushMode.Heavy ? HeavySway : mode == PushMode.Light ? LightSway : sliding ? SlideSway : 0f;
        sway = Mathf.MoveTowards(sway, targetSway, HeavySway * 4f * dt);
        float wave = Mathf.Sin(time * SwayHz * 2f * Mathf.PI);
        float bob = mode == PushMode.Heavy ? HeavyBob : mode == PushMode.Light ? LightBob : 0f;
        Transform body = boulder.Body;
        body.localRotation = Quaternion.Euler(wave * sway, 0f, 0f);
        body.localPosition += new Vector3(0f, Mathf.Abs(wave) * bob, -CatchJolt * (joltLeft / CatchJoltSeconds));

        // 鏡頭：推的時候前傾，猛推時抖，卡住時往後震。
        bool pushing = mode != PushMode.None;
        player.FeelPitch = Mathf.MoveTowards(player.FeelPitch, pushing ? LeanDegrees : 0f, LeanDegrees / LeanSeconds * dt);
        Vector3 shake = mode == PushMode.Heavy ? Random.insideUnitSphere * HeavyShake : Vector3.zero;
        shake += Random.insideUnitSphere * Tremor;
        player.FeelOffset = shake + Vector3.back * (CameraKick * (kickLeft / CameraKickSeconds));

        UpdateMark(maxOpening);
        UpdateGrit(mode, dt);
    }

    public void ResetForNight()
    {
        time = 0f;
        sway = 0f;
        joltLeft = 0f;
        kickLeft = 0f;
        gritTimer = 0f;
        Tremor = 0f;
        if (boulder != null)
            boulder.Body.localRotation = Quaternion.identity;
        if (player != null)
        {
            player.FeelPitch = 0f;
            player.FeelOffset = Vector3.zero;
        }
        foreach (var g in grit)
            if (g != null)
                Destroy(g);
        grit.Clear();
        UpdateMark(0f);
    }

    /// <summary>縫底的拖痕：從巨石原本的左緣往右，寬 = 這一夜最大開口。</summary>
    void UpdateMark(float maxOpening)
    {
        bool show = maxOpening > 0.01f;
        mark.gameObject.SetActive(show);
        if (!show)
            return;
        Vector3 basePos = boulder.BaseCenter;
        mark.position = basePos + new Vector3(-Boulder.Width / 2f + maxOpening / 2f, 0.01f, 0f);
        mark.localScale = new Vector3(maxOpening, 0.01f, Boulder.Depth);
    }

    void UpdateGrit(PushMode mode, float dt)
    {
        grit.RemoveAll(g => g == null);
        if (mode == PushMode.None)
        {
            gritTimer = 0f;
            return;
        }
        gritTimer += dt;
        float interval = mode == PushMode.Heavy ? HeavyGritSeconds : LightGritSeconds;
        if (gritTimer < interval)
            return;
        gritTimer = 0f;

        if (grit.Count >= MaxGrit)
        {
            Destroy(grit[0]);
            grit.RemoveAt(0);
        }
        Vector3 face = boulder.PushPoint;
        var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        go.name = "Grit";
        go.GetComponent<Renderer>().sharedMaterial = gritMaterial;
        go.transform.localScale = Vector3.one * Random.Range(0.06f, 0.1f);
        go.transform.position = new Vector3(
            face.x + Random.Range(-Boulder.Width * 0.4f, Boulder.Width * 0.4f),
            boulder.BaseCenter.y + Random.Range(0.1f, 0.4f),
            face.z - 0.06f);
        go.AddComponent<SilentGrit>();
        var rb = go.AddComponent<Rigidbody>();
        rb.mass = 0.05f;
        rb.linearVelocity = new Vector3(Random.Range(-0.3f, 0.3f), Random.Range(0f, 0.4f), Random.Range(-0.8f, -0.2f));
        Destroy(go, GritLifetime);
        grit.Add(go);
    }
}
