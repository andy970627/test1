using System.Collections;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 躲在洞裡的一名同伴：躲著時每 15～30 秒嗚咽一聲（淡綠聲波），玩家帶走後跟在隊伍裡，
/// 按 F 可以原地蹲下不出聲。被巨人吃掉或被岩石砸到就倒下消失。
/// </summary>
public class CrewMember : MonoBehaviour
{
    public enum Mode { Hiding, Following, Crouching }

    const float MinWhimper = 15f, MaxWhimper = 30f;
    static readonly Color Skin = OdysseyPalette.CrewSkin;

    System.Random rng;
    AudioSource voice;
    float nextWhimper;
    bool dying;

    public Mode Current { get; private set; }
    public bool Alive => !dying;

    public void Init(Vector3 hidePos, int seed)
    {
        rng = new System.Random(seed);
        BuildBody();
        Arrow.AddHitBox(gameObject, Vector3.up * 0.6f, 1.2f, 0.35f);
        voice = gameObject.AddComponent<AudioSource>();
        voice.clip = ProceduralAudio.Gasp();
        voice.spatialBlend = 1f;
        voice.rolloffMode = AudioRolloffMode.Linear;
        voice.minDistance = 0.5f;
        voice.maxDistance = 6f;
        voice.volume = 0.3f;
        voice.playOnAwake = false;

        transform.position = Ground(hidePos);
        transform.rotation = Quaternion.Euler(0f, (float)rng.NextDouble() * 360f, 0f);
        Current = Mode.Hiding;
        nextWhimper = Time.time + Range(MinWhimper, MaxWhimper);
    }

    public void Follow() => Current = Mode.Following;
    public void Crouch() => Current = Mode.Crouching;

    /// <summary>移到隊伍裡的位置（貼地、面向前進方向）。</summary>
    public void MoveTo(Vector3 p)
    {
        Vector3 to = p - transform.position;
        to.y = 0f;
        transform.position = Ground(p);
        if (to.sqrMagnitude > 1e-4f)
            transform.rotation = Quaternion.LookRotation(to);
    }

    public void Kill()
    {
        if (dying)
            return;
        dying = true;
        StartCoroutine(FallAndVanish());
    }

    void Update()
    {
        if (dying || Current != Mode.Hiding || Time.time < nextWhimper)
            return;
        nextWhimper = Time.time + Range(MinWhimper, MaxWhimper);
        voice.pitch = Range(0.9f, 1.1f);
        voice.Play();
        SoundBus.Emit(SoundKind.Whimper, transform.position + Vector3.up * 0.6f);
    }

    IEnumerator FallAndVanish()
    {
        Quaternion start = transform.rotation;
        Quaternion end = start * Quaternion.Euler(80f, 0f, 0f);
        for (float t = 0f; t < 0.6f; t += Time.deltaTime)
        {
            transform.rotation = Quaternion.Slerp(start, end, t / 0.6f);
            yield return null;
        }
        Destroy(gameObject);
    }

    static Vector3 Ground(Vector3 p) => new(p.x, CaveBuilder.GroundHeight(p), p.z);

    float Range(float min, float max) => min + (float)rng.NextDouble() * (max - min);

    /// <summary>蹲著的人形：亞麻短袍、束帶、深色髮絲與抱膝手臂。</summary>
    void BuildBody()
    {
        var skin = Skin;
        var tunic = OdysseyPalette.Linen;
        var hair = OdysseyPalette.CrewHair;
        var leather = OdysseyPalette.CrewLeather;

        // 希臘水手亞麻短袍軀幹（Linen Tunic Chiton）
        Part(PrimitiveType.Capsule, "TunicBody", new Vector3(0f, 0.45f, 0f), new Vector3(0.46f, 0.42f, 0.42f), tunic);
        // 皮革腰帶
        Part(PrimitiveType.Cylinder, "Belt", new Vector3(0f, 0.42f, 0f), new Vector3(0.48f, 0.05f, 0.44f), leather);
        // 頭部與髮絲
        Part(PrimitiveType.Sphere, "Head", new Vector3(0f, 0.95f, 0.08f), new Vector3(0.25f, 0.27f, 0.25f), skin);
        Part(PrimitiveType.Sphere, "Hair", new Vector3(0f, 1.02f, 0.04f), new Vector3(0.26f, 0.15f, 0.26f), hair);
        // 抱膝的雙臂與雙膝
        Part(PrimitiveType.Capsule, "Knees", new Vector3(0f, 0.3f, 0.22f), new Vector3(0.4f, 0.15f, 0.2f), tunic);
        Part(PrimitiveType.Capsule, "Arms", new Vector3(0f, 0.45f, 0.18f), new Vector3(0.38f, 0.12f, 0.18f), skin);
    }

    void Part(PrimitiveType type, string name, Vector3 localPos, Vector3 scale, Color color)
    {
        var go = GameObject.CreatePrimitive(type);
        go.name = name;
        Destroy(go.GetComponent<Collider>());
        go.transform.SetParent(transform, false);
        go.transform.localPosition = localPos;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(color);
    }
}
