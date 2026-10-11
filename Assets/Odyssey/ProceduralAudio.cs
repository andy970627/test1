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

    /// <summary>洞外的海風：低通噪音帶緩慢起伏，8 秒可循環。越接近洞口越大聲，當作離出口多遠的線索。</summary>
    public static AudioClip SeaWind()
    {
        int length = SampleRate * 8;
        var data = new float[length];
        var rng = new System.Random(13);
        float lowpass = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += 0.04f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            float swell = 0.55f + 0.45f * Mathf.Sin(2f * Mathf.PI * t / 8f);
            data[i] = lowpass * swell * 1.6f;
        }
        return Make("SeaWind", data);
    }

    /// <summary>玩家的呼吸：吸 1.2 秒、吐 1.5 秒的氣音，3 秒可循環。音量與速度由抱緊段依缺氧程度調整。</summary>
    public static AudioClip Breathing()
    {
        int length = SampleRate * 3;
        var data = new float[length];
        var rng = new System.Random(17);
        float lowpass = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += 0.18f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            float inhale = t < 1.2f ? Mathf.Sin(Mathf.PI * t / 1.2f) * 0.7f : 0f;
            float exhale = t >= 1.3f && t < 2.8f ? Mathf.Sin(Mathf.PI * (t - 1.3f) / 1.5f) : 0f;
            data[i] = lowpass * (inhale + exhale) * 0.9f;
        }
        return Make("Breathing", data);
    }

    /// <summary>憋太久後放開的大口吸氣：0.7 秒、急促上揚。</summary>
    public static AudioClip Gasp()
    {
        int length = (int)(SampleRate * 0.7f);
        var data = new float[length];
        var rng = new System.Random(19);
        float lowpass = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += 0.3f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            float envelope = Mathf.Clamp01(t / 0.08f) * Mathf.Exp(-3.5f * t);
            data[i] = lowpass * envelope * 1.4f;
        }
        return Make("Gasp", data);
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

    /// <summary>巨人的腳步：0.5 秒的低沉重踩（60Hz 加 120Hz 泛音，筆電喇叭也聽得到），加一點碎石噪音。</summary>
    public static AudioClip GiantStep()
    {
        var data = new float[(int)(SampleRate * 0.5f)];
        AddThump(data, 0f, 0.45f, 60f, 10f);
        AddThump(data, 0f, 0.2f, 120f, 14f);
        AddGravel(data, 0f, 0.25f, 0.25f, 11);
        return Make("GiantStep", data);
    }

    /// <summary>巨人雙手掃過地面：0.6 秒、先強後弱的粗糙摩擦。</summary>
    public static AudioClip GiantSweep()
    {
        var data = new float[(int)(SampleRate * 0.6f)];
        var rng = new System.Random(41);
        float lowpass = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += 0.15f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            data[i] = 0.9f * lowpass * Mathf.Sin(Mathf.PI * t / 0.6f);
        }
        return Make("GiantSweep", data);
    }

    /// <summary>嚼食：0.3 秒內兩下濕的碎裂聲。</summary>
    public static AudioClip Chew()
    {
        var data = new float[(int)(SampleRate * 0.3f)];
        AddThump(data, 0f, 0.3f, 90f, 25f);
        AddGravel(data, 0f, 0.08f, 0.45f, 51);
        AddGravel(data, 0.14f, 0.1f, 0.4f, 52);
        return Make("Chew", data);
    }

    /// <summary>巨人丟的岩石落地：0.9 秒的重擊加大片碎石。</summary>
    public static AudioClip RockImpact()
    {
        var data = new float[(int)(SampleRate * 0.9f)];
        AddThump(data, 0f, 0.5f, 55f, 6f);
        AddThump(data, 0f, 0.2f, 110f, 9f);
        AddGravel(data, 0f, 0.7f, 0.3f, 61);
        return Make("RockImpact", data);
    }

    /// <summary>蹲著走的腳步：0.12 秒的輕微碎石聲。</summary>
    public static AudioClip FootStep()
    {
        var data = new float[(int)(SampleRate * 0.12f)];
        AddGravel(data, 0f, 0.12f, 0.35f, 21);
        return Make("FootStep", data);
    }

    /// <summary>跑步的腳步：0.2 秒，較重的碎石聲加一下悶響。</summary>
    public static AudioClip HeavyStep()
    {
        var data = new float[(int)(SampleRate * 0.2f)];
        AddThump(data, 0f, 0.35f, 70f, 30f);
        AddGravel(data, 0f, 0.18f, 0.6f, 31);
        return Make("HeavyStep", data);
    }

    static void AddThump(float[] data, float start, float gain, float hz, float decay)
    {
        int begin = (int)(start * SampleRate);
        for (int i = 0; begin + i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            data[begin + i] += gain * Mathf.Sin(2f * Mathf.PI * hz * t) * Mathf.Exp(-decay * t);
        }
    }

    /// <summary>碎石：濾波噪音，起音快、指數衰減。</summary>
    static void AddGravel(float[] data, float start, float seconds, float gain, int seed)
    {
        var rng = new System.Random(seed);
        int begin = (int)(start * SampleRate);
        int length = (int)(seconds * SampleRate);
        float lowpass = 0f;
        for (int i = 0; i < length && begin + i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += 0.4f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            data[begin + i] += gain * lowpass * Mathf.Clamp01(t / 0.005f) * Mathf.Exp(-5f * t / seconds);
        }
    }

    static AudioClip Make(string name, float[] data)
    {
        var clip = AudioClip.Create(name, data.Length, 1, SampleRate, false);
        clip.SetData(data, 0);
        return clip;
    }
}
