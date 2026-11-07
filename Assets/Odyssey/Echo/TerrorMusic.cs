using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 恐懼半徑的配樂（規格第 31 節 H1、H3、H4，借 Dead by Daylight 的分層做法）：
/// 第 1 層慢心跳＋低音；第 2 層加框鼓隔拍；第 3 層每拍框鼓＋男聲吟唱；追殺時換成急促心跳、急鼓與不和諧的里拉琴。
/// 他停下聆聽時全部在 1 秒內淡出（安靜才最可怕）；禱告時淡出，讓他的禱告聲當搖籃曲。
/// 全部是 2D、只有玩家聽得到，不經過 SoundBus（巨人聽不到、不照亮）。
/// </summary>
public class TerrorMusic : MonoBehaviour
{
    const float Crossfade = 0.5f;
    const float SilenceFade = 1f;
    const float BaseDrone = 0.08f;

    AudioSource drone, chant, chase, beats;
    AudioClip heartbeat, drum;
    float droneVol, chantVol, chaseVol, heartVol, drumVol;
    float beatTimer;
    int beatCount;
    float duckLeft, dronePauseLeft;
    TerrorLayer layer = TerrorLayer.Silent;
    float bpm;

    /// <summary>目前的層（給除錯面板與畫面四角變暗用）。</summary>
    public TerrorLayer Layer => layer;

    void Awake()
    {
        heartbeat = ProceduralAudio.Heartbeat();
        drum = ProceduralAudio.FrameDrum();
        drone = Loop(ProceduralAudio.Drone());
        chant = Loop(ProceduralAudio.Chant());
        chase = Loop(ProceduralAudio.ChaseLyre());
        beats = gameObject.AddComponent<AudioSource>();
        beats.spatialBlend = 0f;
        beats.playOnAwake = false;
    }

    AudioSource Loop(AudioClip clip)
    {
        var s = gameObject.AddComponent<AudioSource>();
        s.clip = clip;
        s.loop = true;
        s.spatialBlend = 0f;
        s.volume = 0f;
        s.playOnAwake = false;
        return s;
    }

    /// <summary>詩句出現時其他聲音降 6 dB（規格第 31 節 H6）。</summary>
    public void Duck(float seconds) => duckLeft = Mathf.Max(duckLeft, seconds);

    /// <summary>雷鳴之後背景低音停 3 秒。</summary>
    public void PauseDrone(float seconds) => dronePauseLeft = Mathf.Max(dronePauseLeft, seconds);

    /// <summary>停止全部（夜晚以外）。</summary>
    public void StopAll()
    {
        layer = TerrorLayer.Silent;
        droneVol = chantVol = chaseVol = heartVol = drumVol = 0f;
        Apply(1f);
        drone.Stop();
        chant.Stop();
        chase.Stop();
    }

    /// <summary>
    /// 每幀：依恐懼半徑讀數與實驗開關調整各層。Off 與 Legacy（舊版心跳在 ScreenFeedback）時這裡全部靜音。
    /// hush：他在附近停下聆聽（讀數是 Silent 的那種），連背景低音都收掉；離得遠的 Silent 只留很小聲的低音。
    /// </summary>
    public void Tick(TerrorReading reading, TerrorMode mode, bool hush, float dt)
    {
        layer = mode == TerrorMode.Layered ? reading.Layer : TerrorLayer.Silent;
        bpm = mode == TerrorMode.Layered ? reading.Bpm : 0f;
        bool off = mode != TerrorMode.Layered;

        float tDrone = off || hush ? 0f : BaseDrone, tChant = 0f, tChase = 0f, tHeart = 0f, tDrum = 0f;
        switch (layer)
        {
            case TerrorLayer.One: tDrone = 0.3f; tHeart = 0.35f; break;
            case TerrorLayer.Two: tDrone = 0.35f; tHeart = 0.5f; tDrum = 0.35f; break;
            case TerrorLayer.Three: tDrone = 0.4f; tHeart = 0.7f; tDrum = 0.5f; tChant = 0.3f; break;
            case TerrorLayer.Chase: tDrone = 0.25f; tHeart = 0.85f; tDrum = 0.65f; tChase = 0.45f; break;
            case TerrorLayer.Prayer: tDrone = 0f; break;
        }

        if (dronePauseLeft > 0f)
        {
            dronePauseLeft -= dt;
            tDrone = 0f;
        }
        float fade = layer == TerrorLayer.Silent || layer == TerrorLayer.Prayer ? SilenceFade : Crossfade;
        float step = dt / fade;
        droneVol = Mathf.MoveTowards(droneVol, tDrone, step * 0.5f);
        chantVol = Mathf.MoveTowards(chantVol, tChant, step * 0.5f);
        chaseVol = Mathf.MoveTowards(chaseVol, tChase, step * 0.5f);
        heartVol = Mathf.MoveTowards(heartVol, tHeart, step);
        drumVol = Mathf.MoveTowards(drumVol, tDrum, step);

        float duck = 1f;
        if (duckLeft > 0f)
        {
            duckLeft -= dt;
            duck = 0.5f;
        }
        Apply(duck);
        UpdateBeats(dt, duck);
    }

    void Apply(float duck)
    {
        SetLoop(drone, droneVol * duck);
        SetLoop(chant, chantVol * duck);
        SetLoop(chase, chaseVol * duck);
    }

    static void SetLoop(AudioSource s, float volume)
    {
        s.volume = volume;
        if (volume > 0.001f && !s.isPlaying)
            s.Play();
        else if (volume <= 0.001f && s.isPlaying)
            s.Pause();
    }

    /// <summary>心跳與框鼓照 bpm 打拍子：第 2 層鼓隔拍、第 3 層與追殺每拍。</summary>
    void UpdateBeats(float dt, float duck)
    {
        if (bpm <= 0f || heartVol <= 0.001f)
        {
            beatTimer = 0f;
            return;
        }
        beatTimer += dt;
        float interval = 60f / bpm;
        if (beatTimer < interval)
            return;
        beatTimer -= interval;
        beatCount++;
        beats.PlayOneShot(heartbeat, heartVol * duck);
        bool drumThisBeat = layer == TerrorLayer.Two ? beatCount % 2 == 0 : layer is TerrorLayer.Three or TerrorLayer.Chase;
        if (drumThisBeat && drumVol > 0.001f)
            beats.PlayOneShot(drum, drumVol * duck);
    }
}
