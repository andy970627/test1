using UnityEngine;

/// <summary>規格第 33 節的環境聲：石灰岩洞的滴水、洞口外的蜂群、爐灶餘燼的劈啪聲。全部程式合成。</summary>
public static partial class ProceduralAudio
{
    /// <summary>一滴水落進小水窪：0.25 秒、音高往上滑的「咚」。</summary>
    public static AudioClip Drip(int seed)
    {
        const float seconds = 0.25f;
        var data = new float[(int)(SampleRate * seconds)];
        var rng = new System.Random(300 + seed);
        float hz = 900f + 500f * (float)rng.NextDouble();
        float phase = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            phase += 2f * Mathf.PI * hz * (1f + 1.5f * t / seconds) / SampleRate;
            data[i] = 0.35f * Mathf.Sin(phase) * Mathf.Exp(-22f * t);
        }
        return Make("Drip" + seed, data);
    }

    /// <summary>蜂群：3 秒可循環，很多隻蜜蜂翅膀的嗡嗡聲疊在一起（220～260 Hz 加泛音，緩慢起伏）。</summary>
    public static AudioClip BeeSwarm()
    {
        const float seconds = 3f;
        var data = new float[(int)(SampleRate * seconds)];
        var rng = new System.Random(311);
        for (int b = 0; b < 12; b++)
        {
            // 每隻蜂的頻率取整數週期（3 秒內整數圈），循環時不爆音。
            float hz = Mathf.Round((215f + 50f * (float)rng.NextDouble()) * seconds) / seconds;
            float wobble = Mathf.Round((0.5f + 2f * (float)rng.NextDouble()) * seconds) / seconds;
            float offset = (float)rng.NextDouble() * 6.28f;
            for (int i = 0; i < data.Length; i++)
            {
                float t = (float)i / SampleRate;
                float amp = 0.5f + 0.5f * Mathf.Sin(2f * Mathf.PI * wobble * t + offset);
                float s = Mathf.Sin(2f * Mathf.PI * hz * t + offset);
                data[i] += 0.025f * amp * (s + 0.5f * Mathf.Sign(s));
            }
        }
        return Make("BeeSwarm", data);
    }

    /// <summary>餘燼：2 秒可循環、很小聲的零星劈啪聲。</summary>
    public static AudioClip EmberCrackle()
    {
        const float seconds = 2f;
        var data = new float[(int)(SampleRate * seconds)];
        var rng = new System.Random(321);
        for (int k = 0; k < 9; k++)
            AddThump(data, (float)rng.NextDouble() * (seconds - 0.05f), 0.08f + 0.1f * (float)rng.NextDouble(), 1200f + 1600f * (float)rng.NextDouble(), 140f);
        return Make("EmberCrackle", data);
    }
}
