using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 不照亮的聲音要真的聽得到（規格第 19 節 B）：在聲音的位置播 3D 程式音效。
/// 巨人有自己專用的聲道（掛在他身上、不會被搶走），依狀態播腳步、跑步、掃摸、嚼食；
/// 其他聲音（玩家與同伴的腳步、喘氣、岩石落地）輪流用共用聲道。羊叫與同伴嗚咽已經在牠們身上播，不重播。
/// </summary>
public class SoundPlayer : MonoBehaviour
{
    const int Voices = 12;
    const float GiantMin = 2f;
    const float GiantMax = 30f;

    readonly AudioSource[] voices = new AudioSource[Voices];
    int next;
    AudioSource giantVoice;
    AudioClip giantStep, giantSweep, chew, footStep, heavyStep, pant, rockImpact;

    public void Init(BlindCyclops cyclops)
    {
        giantStep = ProceduralAudio.GiantStep();
        giantSweep = ProceduralAudio.GiantSweep();
        chew = ProceduralAudio.Chew();
        footStep = ProceduralAudio.FootStep();
        heavyStep = ProceduralAudio.HeavyStep();
        pant = ProceduralAudio.Gasp();
        rockImpact = ProceduralAudio.RockImpact();

        for (int i = 0; i < Voices; i++)
        {
            var go = new GameObject("SoundVoice");
            go.transform.SetParent(transform, false);
            voices[i] = NewSource(go, 1f, 10f);
        }
        var giantGo = new GameObject("GiantVoice");
        giantGo.transform.SetParent(cyclops.transform, false);
        giantVoice = NewSource(giantGo, GiantMin, GiantMax);

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
        switch (e.Kind)
        {
            case SoundKind.Step:
                Play(footStep, at, e.Loudness, Random.Range(0.9f, 1.1f), 1f, 8f);
                break;
            case SoundKind.Run:
                Play(heavyStep, at, e.Loudness, Random.Range(0.9f, 1.1f), 1f, 12f);
                break;
            case SoundKind.Pant:
                Play(pant, at, e.Loudness, 0.8f, 1f, 8f);
                break;
            case SoundKind.RockImpact:
                Play(rockImpact, at, e.Loudness, 1f, 3f, 40f);
                break;
        }
    }

    /// <summary>聲量越小越安靜（羊圈裡的腳步明顯變輕）。</summary>
    void Play(AudioClip clip, Vector3 at, float loudness, float pitch, float min, float max)
    {
        var source = voices[next];
        next = (next + 1) % Voices;
        source.transform.position = at;
        source.minDistance = min;
        source.maxDistance = max;
        source.volume = Mathf.Clamp01(0.15f + 1.2f * loudness);
        source.pitch = pitch;
        source.clip = clip;
        source.Play();
    }
}
