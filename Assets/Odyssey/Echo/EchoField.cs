using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>收集目前的聲波，每幀寫進回聲著色器的全域陣列。最多 16 個，滿了就取代最舊的。</summary>
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

        public Pulse(Vector3 position, float radius, float startTime, Color color)
        {
            Position = position;
            Radius = radius;
            StartTime = startTime;
            Color = color;
        }
    }

    static readonly int PulsesId = Shader.PropertyToID("_EchoPulses");
    static readonly int ColorsId = Shader.PropertyToID("_EchoColors");
    static readonly int CountId = Shader.PropertyToID("_EchoCount");
    static readonly int NowId = Shader.PropertyToID("_EchoNow");
    static readonly int SpreadId = Shader.PropertyToID("_EchoSpread");
    static readonly int FadeId = Shader.PropertyToID("_EchoFade");

    public static EchoField Instance { get; private set; }

    readonly List<Pulse> pulses = new();
    readonly Vector4[] positions = new Vector4[MaxPulses];
    readonly Vector4[] colors = new Vector4[MaxPulses];

    public IReadOnlyList<Pulse> Active => pulses;

    public static Color ColorFor(SoundSource source) => source switch
    {
        SoundSource.Cyclops => new Color(0.8f, 0.12f, 0.08f),
        SoundSource.Sheep => new Color(1f, 0.9f, 0.55f),
        _ => new Color(0.85f, 0.92f, 1f),
    };

    void Awake() => Instance = this;

    void OnEnable() => SoundBus.Emitted += OnSound;

    void OnDisable()
    {
        SoundBus.Emitted -= OnSound;
        if (Instance == this)
            Instance = null;
    }

    public void Clear() => pulses.Clear();

    void OnSound(SoundEvent e, Vector3 worldPos)
    {
        if (pulses.Count >= MaxPulses)
            pulses.RemoveAt(0);
        pulses.Add(new Pulse(worldPos, SoundRules.Radius(e.Loudness), Time.time, ColorFor(SoundRules.Source(e.Kind))));
    }

    void LateUpdate()
    {
        float now = Time.time;
        pulses.RemoveAll(p => now - p.StartTime > SpreadSeconds + FadeSeconds);
        for (int i = 0; i < MaxPulses; i++)
        {
            if (i < pulses.Count)
            {
                var p = pulses[i];
                positions[i] = new Vector4(p.Position.x, p.Position.y, p.Position.z, p.StartTime);
                colors[i] = new Vector4(p.Color.r, p.Color.g, p.Color.b, p.Radius);
            }
            else
            {
                positions[i] = Vector4.zero;
                colors[i] = Vector4.zero;
            }
        }
        Shader.SetGlobalVectorArray(PulsesId, positions);
        Shader.SetGlobalVectorArray(ColorsId, colors);
        Shader.SetGlobalFloat(CountId, pulses.Count);
        Shader.SetGlobalFloat(NowId, now);
        Shader.SetGlobalFloat(SpreadId, SpreadSeconds);
        Shader.SetGlobalFloat(FadeId, FadeSeconds);
    }
}
