using UnityEngine;

/// <summary>程式產生的佔位音效，不需要任何音檔。</summary>
public static class ProceduralAudio
{
    const int SampleRate = 44100;

    /// <summary>忘憂果的誘惑：撥弦的里拉琴旋律（Karplus-Strong 撥弦合成，五聲音階）。</summary>
    public static AudioClip Lyre()
    {
        float[] melody = { 329.63f, 392f, 440f, 392f, 329.63f, 293.66f, 261.63f, 293.66f,
                           329.63f, 329.63f, 293.66f, 261.63f, 293.66f, 329.63f, 392f, 261.63f };
        const float step = 0.6f;
        int length = (int)(SampleRate * melody.Length * step);
        var data = new float[length];
        var rng = new System.Random(11);
        for (int n = 0; n < melody.Length; n++)
        {
            int start = (int)(n * step * SampleRate);
            int noteLength = Mathf.Min(SampleRate * 2, length - start);
            int period = Mathf.Max(2, Mathf.RoundToInt(SampleRate / melody[n]));
            var buffer = new float[period];
            for (int i = 0; i < period; i++)
                buffer[i] = (float)rng.NextDouble() * 2f - 1f;
            for (int i = 0; i < noteLength; i++)
            {
                int idx = i % period;
                float sample = buffer[idx];
                buffer[idx] = 0.996f * 0.5f * (buffer[idx] + buffer[(idx + 1) % period]);
                data[start + i] += sample * 0.3f;
            }
        }
        return Make("Lyre", data);
    }

    /// <summary>獨眼巨人的怒吼：低頻 + 濾波噪音。</summary>
    public static AudioClip Roar()
    {
        int length = (int)(SampleRate * 2.8f);
        var data = new float[length];
        var rng = new System.Random(7);
        float lowpass = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            float envelope = Mathf.Clamp01(t / 0.25f) * Mathf.Exp(-0.9f * t);
            float tremolo = 1f + 0.45f * Mathf.Sin(2f * Mathf.PI * 7f * t);
            lowpass += 0.06f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            float tone = Mathf.Sin(2f * Mathf.PI * (48f - 10f * t) * t);
            data[i] = Mathf.Clamp((tone * 0.55f + lowpass * 3.5f) * envelope * tremolo, -1f, 1f);
        }
        return Make("Roar", data);
    }

    /// <summary>島外傳來的海浪聲：濾波噪音配上緩慢起伏（6 秒一道浪，12 秒循環）。</summary>
    public static AudioClip SeaWaves()
    {
        int length = SampleRate * 12;
        var data = new float[length];
        var rng = new System.Random(3);
        float lowpass = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += 0.03f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            float swell = Mathf.Sin(Mathf.PI * t / 6f);
            data[i] = lowpass * (0.25f + 0.75f * swell * swell) * 1.2f;
        }
        return Make("SeaWaves", data);
    }

    static AudioClip Make(string name, float[] data)
    {
        var clip = AudioClip.Create(name, data.Length, 1, SampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }
}
