using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 收集會照亮的聲波（SoundRules.Lights：只有玩家主動的聲音），每幀寫進回聲著色器的全域陣列。最多 16 個，滿了就取代最舊的。
/// 難度改變巨人的聽覺時，在巨人聽得到的那一圈多畫一道淡淡的邊（規格第 18 節 D）。
/// </summary>
public class EchoField : MonoBehaviour
{
    public const int MaxPulses = 16;
    public const float SpreadSeconds = 1f;
    public const float FadeSeconds = 2.5f;

    public readonly struct Pulse
    {
        public readonly Vector3 Position;
        public readonly float Radius;
        public readonly float StartTime;
        public readonly Color Color;
        /// <summary>巨人聽得到的半徑；0＝和回聲一樣（不另外畫邊）。</summary>
        public readonly float HearRadius;

        public Pulse(Vector3 position, float radius, float startTime, Color color, float hearRadius = 0f)
        {
            Position = position;
            Radius = radius;
            StartTime = startTime;
            Color = color;
            HearRadius = hearRadius;
        }
    }

    static readonly int PulsesId = Shader.PropertyToID("_EchoPulses");
    static readonly int ColorsId = Shader.PropertyToID("_EchoColors");
    static readonly int CountId = Shader.PropertyToID("_EchoCount");
    static readonly int NowId = Shader.PropertyToID("_EchoNow");
    static readonly int SpreadId = Shader.PropertyToID("_EchoSpread");
    static readonly int FadeId = Shader.PropertyToID("_EchoFade");
    static readonly int HearId = Shader.PropertyToID("_EchoHear");

    public static EchoField Instance { get; private set; }

    readonly List<Pulse> pulses = new();
    readonly Vector4[] positions = new Vector4[MaxPulses];
    readonly Vector4[] colors = new Vector4[MaxPulses];
    readonly float[] hears = new float[MaxPulses];
    readonly float[] evictRadii = new float[MaxPulses];
    readonly float[] evictAges = new float[MaxPulses];

    readonly List<Pulse> heard = new();
    const int MaxHeard = 32;

    /// <summary>F1 小地圖用：最近所有的聲音（含不照亮的），不送進著色器。</summary>
    public IReadOnlyList<Pulse> Active => heard;

    /// <summary>巨人對這種聲音的聽覺倍率（難度 × 石子學習）；為 1 時兩圈重疊，不畫邊。</summary>
    public System.Func<SoundKind, float> HearingFor { get; set; }

    /// <summary>這個聲音照亮的半徑倍率與亮度（DesignFlags.LightFor）；沒設定時只有主動的聲音照亮。</summary>
    public System.Func<SoundKind, (float Radius, float Brightness)> LightFor { get; set; }

    public static Color ColorFor(SoundSource source) => source switch
    {
        SoundSource.Cyclops => OdysseyPalette.EchoCyclops,
        SoundSource.Sheep => OdysseyPalette.EchoSheep,
        SoundSource.Crew => OdysseyPalette.EchoCrew,
        _ => OdysseyPalette.EchoPlayer,
    };

    void Awake() => Instance = this;

    void OnEnable() => SoundBus.Emitted += OnSound;

    void OnDisable()
    {
        SoundBus.Emitted -= OnSound;
        if (Instance == this)
            Instance = null;
    }

    /// <summary>
    /// 宙斯的雷光（規格第 31 節 B1）：從 center 一下子照亮整個洞（已經擴散完成），之後照一般回聲的速度淡出。
    /// 不是聲音，巨人不會因此聽到什麼。
    /// </summary>
    public void FlashAll(Vector3 center, Color color, float radius = 40f)
    {
        if (pulses.Count >= MaxPulses)
            pulses.RemoveAt(0);
        pulses.Add(new Pulse(center, radius, Time.time - SpreadSeconds, color));
    }

    public void Clear()
    {
        pulses.Clear();
        heard.Clear();
    }

    void OnSound(SoundEvent e, Vector3 worldPos)
    {
        float radius = SoundRules.Radius(e.Loudness);
        if (heard.Count >= MaxHeard)
            heard.RemoveAt(0);
        heard.Add(new Pulse(worldPos, radius, Time.time, ColorFor(SoundRules.Source(e.Kind))));
        // 主動的聲音一律照亮；被動的聲音依主選單「實驗」頁的開關（規格第 28 節）。
        var (lightRadius, brightness) = LightFor?.Invoke(e.Kind) ?? (SoundRules.Lights(e.Kind) ? (1f, 1f) : (0f, 0f));
        if (lightRadius <= 0f)
            return;
        if (pulses.Count >= MaxPulses)
        {
            for (int i = 0; i < pulses.Count; i++)
            {
                evictRadii[i] = pulses[i].Radius;
                evictAges[i] = Time.time - pulses[i].StartTime;
            }
            pulses.RemoveAt(EchoBudget.IndexToEvict(evictRadii, evictAges, SpreadSeconds + FadeSeconds));
        }
        float multiplier = HearingFor?.Invoke(e.Kind) ?? 1f;
        // 聽覺邊只畫在主動的聲音上。
        float hear = !SoundRules.Lights(e.Kind) || Mathf.Approximately(multiplier, 1f) ? 0f : radius * multiplier;
        pulses.Add(new Pulse(worldPos, radius * lightRadius, Time.time, ColorFor(SoundRules.Source(e.Kind)) * brightness, hear));
    }

    void LateUpdate()
    {
        float now = Time.time;
        pulses.RemoveAll(p => now - p.StartTime > SpreadSeconds + FadeSeconds);
        heard.RemoveAll(p => now - p.StartTime > SpreadSeconds + FadeSeconds);
        for (int i = 0; i < MaxPulses; i++)
        {
            if (i < pulses.Count)
            {
                var p = pulses[i];
                positions[i] = new Vector4(p.Position.x, p.Position.y, p.Position.z, p.StartTime);
                colors[i] = new Vector4(p.Color.r, p.Color.g, p.Color.b, p.Radius);
                hears[i] = p.HearRadius;
            }
            else
            {
                positions[i] = Vector4.zero;
                colors[i] = Vector4.zero;
                hears[i] = 0f;
            }
        }
        Shader.SetGlobalVectorArray(PulsesId, positions);
        Shader.SetGlobalVectorArray(ColorsId, colors);
        Shader.SetGlobalFloatArray(HearId, hears);
        Shader.SetGlobalFloat(CountId, pulses.Count);
        Shader.SetGlobalFloat(NowId, now);
        Shader.SetGlobalFloat(SpreadId, SpreadSeconds);
        Shader.SetGlobalFloat(FadeId, FadeSeconds);
    }
}
