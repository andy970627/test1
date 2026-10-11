using System;
using Odyssey.Core;
using UnityEngine;
using Random = UnityEngine.Random;

/// <summary>
/// 每個會出聲的動作都有實際音效（規格第 19 節 B、第 22 節 A）：在聲音的位置播 3D 程式音效。
/// 巨人有自己專用的聲道（掛在他身上、不會被搶走），依狀態播腳步、跑步、掃摸、嚼食；
/// 其他聲音輪流用共用聲道（搶最早開始播的那個）。羊叫與同伴嗚咽已經在牠們身上播，不重播。
/// 另有 2D 聲道播只有玩家聽得到的小回饋（不經過 SoundBus，巨人聽不到、不照亮；規格第 22 節 B）。
/// </summary>
public class SoundPlayer : MonoBehaviour
{
    const int Voices = 16;
    const float GiantMin = 2f;
    const float GiantMax = 30f;

    readonly AudioSource[] voices = new AudioSource[Voices];
    readonly float[] startedAt = new float[Voices];
    AudioSource giantVoice, local;
    Func<float> openingFraction;
    AudioClip giantStep, giantSweep, chew, footStep, heavyStep, pant, rockImpact;
    AudioClip clap, stone, grind, heavy, slip, wedge, pail, soft, hay, scrape, wedgePulled, twang, arrowHit;

    public AudioClip Twang => twang;

    public AudioClip PebbleClick { get; private set; }
    public AudioClip CrewReply { get; private set; }
    public AudioClip WoodTap { get; private set; }
    public AudioClip LearnChime { get; private set; }
    public AudioClip BoulderSettle { get; private set; }

    /// <summary>openingFraction：巨石開口 ÷ 全開，磨擦聲的音高跟著變高。</summary>
    public void Init(BlindCyclops cyclops, Func<float> openingFraction)
    {
        this.openingFraction = openingFraction;
        giantStep = ProceduralAudio.GiantStep();
        giantSweep = ProceduralAudio.GiantSweep();
        chew = ProceduralAudio.Chew();
        footStep = ProceduralAudio.FootStep();
        heavyStep = ProceduralAudio.HeavyStep();
        pant = ProceduralAudio.Gasp();
        rockImpact = ProceduralAudio.RockImpact();
        clap = ProceduralAudio.Clap();
        stone = ProceduralAudio.StoneKnock();
        grind = ProceduralAudio.Grind();
        heavy = ProceduralAudio.BoulderHeavy();
        slip = ProceduralAudio.Slip();
        wedge = ProceduralAudio.WedgeClick();
        pail = ProceduralAudio.PailClatter();
        soft = ProceduralAudio.SoftThud();
        hay = ProceduralAudio.WoolRustle();
        scrape = ProceduralAudio.WoodScrape();
        wedgePulled = ProceduralAudio.WedgePulled();
        twang = ProceduralAudio.Twang();
        arrowHit = ProceduralAudio.ArrowHit();
        PebbleClick = ProceduralAudio.PebbleClick();
        CrewReply = ProceduralAudio.CrewReply();
        WoodTap = ProceduralAudio.WoodTap();
        LearnChime = ProceduralAudio.LearnChime();
        BoulderSettle = ProceduralAudio.BoulderSettle();

        for (int i = 0; i < Voices; i++)
        {
            var go = new GameObject("SoundVoice");
            go.transform.SetParent(transform, false);
            voices[i] = NewSource(go, 1f, 10f);
            startedAt[i] = float.NegativeInfinity;
        }
        var giantGo = new GameObject("GiantVoice");
        giantGo.transform.SetParent(cyclops.transform, false);
        giantVoice = NewSource(giantGo, GiantMin, GiantMax);
        local = NewSource(new GameObject("LocalVoice"), 1f, 2f);
        local.transform.SetParent(transform, false);
        local.spatialBlend = 0f;

        cyclops.Sounded += OnGiant;
        SoundBus.Emitted += OnSound;
    }

    void OnDestroy() => SoundBus.Emitted -= OnSound;

    static AudioSource NewSource(GameObject go, float min, float max)
    {
        var source = go.AddComponent<AudioSource>();
        source.playOnAwake = false;
        source.spatialBlend = 1f;
        source.rolloffMode = AudioRolloffMode.Logarithmic;
        source.minDistance = min;
        source.maxDistance = max;
        return source;
    }

    /// <summary>巨人的聲音依狀態：走＝腳步、守石（跑）＝較快較重的腳步、掃摸、嚼食；聆聽時只有呼吸（已在他身上循環）。</summary>
    void OnGiant(CyclopsState state)
    {
        switch (state)
        {
            case CyclopsState.Investigate:
                PlayGiant(giantStep, 1f, 0.9f);
                break;
            case CyclopsState.Guard:
                PlayGiant(giantStep, 0.85f, 1f);
                break;
            case CyclopsState.Search:
                PlayGiant(giantSweep, 1f, 0.8f);
                break;
            case CyclopsState.Eat:
                PlayGiant(chew, Random.Range(0.9f, 1.1f), 0.8f);
                break;
        }
    }

    void PlayGiant(AudioClip clip, float pitch, float volume)
    {
        giantVoice.pitch = pitch;
        giantVoice.volume = volume;
        giantVoice.PlayOneShot(clip);
    }

    void OnSound(SoundEvent e, Vector3 at)
    {
        float v = e.Loudness;
        switch (e.Kind)
        {
            case SoundKind.Step: Play(footStep, at, v, Random.Range(0.9f, 1.1f), 1f, 8f); break;
            case SoundKind.Run: Play(heavyStep, at, v, Random.Range(0.9f, 1.1f), 1f, 12f); break;
            case SoundKind.Pant: Play(pant, at, v, 0.8f, 1f, 8f); break;
            case SoundKind.RockImpact: Play(rockImpact, at, v, 1f, 3f, 40f); break;
            case SoundKind.Clap: Play(clap, at, v, Random.Range(0.95f, 1.05f), 2f, 20f); break;
            case SoundKind.Stone: Play(stone, at, v, Random.Range(0.9f, 1.15f), 1f, 20f); break;
            case SoundKind.Grind: Play(grind, at, v, 0.8f + 0.5f * Mathf.Clamp01(openingFraction()), 2f, 15f); break;
            case SoundKind.Boulder: Play(heavy, at, v * 0.7f, 0.9f + 0.3f * Mathf.Clamp01(openingFraction()), 3f, 30f); break;
            case SoundKind.Slip: Play(slip, at, v, 0.7f, 1f, 8f); break;
            case SoundKind.Wedge: Play(wedge, at, v, 1f, 1f, 10f); break;
            case SoundKind.Clatter: Play(pail, at, v, Random.Range(0.95f, 1.05f), 2f, 20f); break;
            case SoundKind.Cheese: Play(soft, at, v, 1f, 1f, 10f); break;
            case SoundKind.Wicker: Play(hay, at, v, 1.2f, 1f, 8f); break;
            case SoundKind.Drag: Play(scrape, at, v, Random.Range(0.9f, 1.1f), 1f, 8f); break;
            case SoundKind.Twang: Play(twang, at, 0.5f, Random.Range(0.97f, 1.03f), 1f, 6f); break;
            case SoundKind.Arrow: Play(arrowHit, at, v, Random.Range(0.9f, 1.1f), 2f, 20f); break;
        }
    }

    /// <summary>巨人拔掉楔子：「喀」一聲加石子彈出，在巨石位置播。</summary>
    public void WedgePulled(Vector3 at) => Play(wedgePulled, at, 0.6f, 1f, 2f, 20f);

    /// <summary>巨石被巨人拔回、往回滑：沉重的磨擦。</summary>
    public void PulledBack(Vector3 at) => Play(grind, at, 0.5f, 0.6f, 2f, 20f);

    /// <summary>只有玩家聽得到的小回饋。</summary>
    public void PlayLocal(AudioClip clip, float volume = 0.6f) => local.PlayOneShot(clip, volume);

    /// <summary>聲量越小越安靜（羊圈裡的腳步明顯變輕）；共用聲道搶最早開始播的那個。</summary>
    void Play(AudioClip clip, Vector3 at, float loudness, float pitch, float min, float max)
    {
        int oldest = 0;
        for (int i = 0; i < Voices; i++)
        {
            if (!voices[i].isPlaying)
            {
                oldest = i;
                break;
            }
            if (startedAt[i] < startedAt[oldest])
                oldest = i;
        }
        startedAt[oldest] = Time.time;
        var source = voices[oldest];
        source.transform.position = at;
        source.minDistance = min;
        source.maxDistance = max;
        source.volume = Mathf.Clamp01(0.15f + 1.2f * loudness);
        source.pitch = pitch;
        source.clip = clip;
        source.Play();
    }
}
