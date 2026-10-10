using UnityEngine;

/// <summary>程式產生的佔位音效，不需要任何音檔。</summary>
public static class ProceduralAudio
{
    const int SampleRate = 44100;

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

    /// <summary>羊叫：約 0.8 秒，基頻 300→250Hz、6Hz 顫音，帶一點鼻音泛音。</summary>
    public static AudioClip Bleat()
    {
        int length = (int)(SampleRate * 0.8f);
        var data = new float[length];
        float phase = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            float f = Mathf.Lerp(300f, 250f, t / 0.8f) * (1f + 0.04f * Mathf.Sin(2f * Mathf.PI * 6f * t));
            phase += 2f * Mathf.PI * f / SampleRate;
            float envelope = Mathf.Clamp01(t / 0.05f) * Mathf.Clamp01((0.8f - t) / 0.2f);
            data[i] = envelope * (0.35f * Mathf.Sin(phase) + 0.15f * Mathf.Sin(2f * phase) + 0.1f * Mathf.Sin(3f * phase));
        }
        return Make("Bleat", data);
    }

    /// <summary>心跳：1 秒一拍、兩下 50Hz 低頻脈衝，可無縫循環。</summary>
    public static AudioClip Heartbeat()
    {
        var data = new float[SampleRate];
        AddThump(data, 0f, 0.8f);
        AddThump(data, 0.22f, 0.55f);
        return Make("Heartbeat", data);
    }

    /// <summary>羊毛摩擦：0.4 秒的濾波噪音。</summary>
    public static AudioClip WoolRustle()
    {
        int length = (int)(SampleRate * 0.4f);
        var data = new float[length];
        var rng = new System.Random(5);
        float lowpass = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += 0.25f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            float envelope = Mathf.Sin(Mathf.PI * t / 0.4f);
            data[i] = lowpass * envelope * 0.8f;
        }
        return Make("WoolRustle", data);
    }

    /// <summary>巨人的呼吸：3 秒一吸一吐的低頻濾波噪音，可無縫循環。</summary>
    public static AudioClip GiantBreath()
    {
        int length = SampleRate * 3;
        var data = new float[length];
        var rng = new System.Random(9);
        float lowpass = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += 0.015f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            float swell = Mathf.Sin(Mathf.PI * t / 1.5f);
            data[i] = lowpass * swell * swell * 4f;
        }
        return Make("GiantBreath", data);
    }

    static void AddThump(float[] data, float start, float gain)
    {
        int begin = (int)(start * SampleRate);
        int length = (int)(0.15f * SampleRate);
        for (int i = 0; i < length && begin + i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            data[begin + i] += gain * Mathf.Sin(2f * Mathf.PI * 50f * t) * Mathf.Exp(-25f * t);
        }
    }

    static AudioClip Make(string name, float[] data)
    {
        var clip = AudioClip.Create(name, data.Length, 1, SampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }
}
