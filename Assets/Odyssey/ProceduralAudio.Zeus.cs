using UnityEngine;

/// <summary>
/// 規格第 31 節的聲音：彈弓、宙斯的雷鳴、雅典娜的貓頭鷹、燃燒的木馬、里拉琴、恐懼半徑的配樂層、
/// 參考遊戲借來的提示音（同伴慘叫的和弦、巨石全開的海風、天亮前的海鳥）。全部是程式合成的原創聲音。
/// </summary>
public static partial class ProceduralAudio
{
    /// <summary>D 多利安音階（D3 起），里拉琴用。</summary>
    static readonly float[] Dorian = { 146.83f, 164.81f, 174.61f, 196.00f, 220.00f, 246.94f, 261.63f, 293.66f };

    /// <summary>彈弓空彈：0.07 秒、皮筋打在木柄上的「啪」，比拍掌低沉一點。</summary>
    public static AudioClip SlingSnap()
    {
        var data = new float[(int)(SampleRate * 0.12f)];
        AddThump(data, 0f, 0.35f, 220f, 45f);
        var rng = new System.Random(201);
        float lowpass = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += 0.7f * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            data[i] += 0.8f * lowpass * Mathf.Exp(-60f * t);
        }
        return Make("SlingSnap", data);
    }

    /// <summary>拉彈弓皮筋：0.35 秒、很小聲的細吱聲。</summary>
    public static AudioClip SlingStretch()
    {
        const float seconds = 0.35f;
        var data = new float[(int)(SampleRate * seconds)];
        float phase = 0f;
        var rng = new System.Random(203);
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            phase += 2f * Mathf.PI * (900f + 300f * t / seconds) / SampleRate;
            float grain = (float)rng.NextDouble() < 0.02f ? 1f : 0.3f;
            data[i] = 0.08f * grain * Mathf.Sin(phase) * Mathf.Sin(Mathf.PI * t / seconds);
        }
        return Make("SlingStretch", data);
    }

    /// <summary>宙斯的雷鳴：開頭一聲高頻碎裂，接 2.5 秒低沉滾動的轟鳴。</summary>
    public static AudioClip Thunder()
    {
        const float seconds = 2.8f;
        var data = new float[(int)(SampleRate * seconds)];
        var rng = new System.Random(211);
        float low = 0f, crack = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float noise = (float)rng.NextDouble() * 2f - 1f;
            crack += 0.8f * (noise - crack);
            low += 0.02f * (noise - low);
            float roll = 1f + 0.5f * Mathf.Sin(2f * Mathf.PI * 3f * t) * Mathf.Sin(2f * Mathf.PI * 0.7f * t);
            data[i] = Mathf.Clamp(0.9f * crack * Mathf.Exp(-14f * t) + 6f * low * roll * Mathf.Clamp01(t / 0.1f) * Mathf.Exp(-1.1f * t), -1f, 1f);
        }
        AddThump(data, 0.05f, 0.6f, 38f, 2.5f);
        return Make("Thunder", data);
    }

    /// <summary>貓頭鷹：兩聲低柔的「呼—呼」，約 0.9 秒。</summary>
    public static AudioClip OwlHoot()
    {
        var data = new float[(int)(SampleRate * 0.9f)];
        AddHoot(data, 0f, 0.25f, 380f);
        AddHoot(data, 0.4f, 0.4f, 340f);
        return Make("OwlHoot", data);
    }

    static void AddHoot(float[] data, float start, float seconds, float hz)
    {
        int begin = (int)(start * SampleRate);
        float phase = 0f;
        for (int i = 0; i < seconds * SampleRate && begin + i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            phase += 2f * Mathf.PI * hz * (1f - 0.08f * t / seconds) / SampleRate;
            data[begin + i] += 0.35f * Mathf.Sin(phase) * Mathf.Sin(Mathf.PI * t / seconds);
        }
    }

    /// <summary>拍翅：四下柔軟的氣流聲，越來越小（飛遠了）。</summary>
    public static AudioClip WingFlap()
    {
        var data = new float[(int)(SampleRate * 0.9f)];
        for (int k = 0; k < 4; k++)
            AddGravel(data, k * 0.2f, 0.12f, 0.5f * (1f - 0.2f * k), 221 + k);
        return Make("WingFlap", data);
    }

    /// <summary>燃燒的木頭：1.6 秒的劈啪聲加低沉的火焰呼聲。</summary>
    public static AudioClip FireCrackle()
    {
        const float seconds = 1.6f;
        var data = new float[(int)(SampleRate * seconds)];
        AddRumble(data, seconds, 0.03f, 0.25f, 231);
        var rng = new System.Random(233);
        for (int k = 0; k < 18; k++)
            AddThump(data, (float)rng.NextDouble() * (seconds - 0.05f), 0.15f + 0.2f * (float)rng.NextDouble(), 900f + 1500f * (float)rng.NextDouble(), 120f);
        return Make("FireCrackle", data);
    }

    /// <summary>遠處城破的哭喊：1.6 秒、很小聲、模糊的人聲。</summary>
    public static AudioClip DistantCries()
    {
        const float seconds = 1.6f;
        var data = new float[(int)(SampleRate * seconds)];
        float[] pitches = { 420f, 510f, 360f };
        for (int v = 0; v < pitches.Length; v++)
        {
            float phase = 0f;
            for (int i = 0; i < data.Length; i++)
            {
                float t = (float)i / SampleRate;
                phase += 2f * Mathf.PI * pitches[v] * (1f - 0.15f * t / seconds + 0.02f * Mathf.Sin(2f * Mathf.PI * 5f * t)) / SampleRate;
                float env = Mathf.Clamp01((t - 0.2f * v) / 0.2f) * Mathf.Clamp01((seconds - t) / 0.5f);
                data[i] += 0.05f * env * (Mathf.Sin(phase) + 0.4f * Mathf.Sin(2f * phase));
            }
        }
        return Make("DistantCries", data);
    }

    static AudioClip[] lyreCache;

    /// <summary>里拉琴撥弦（Karplus–Strong），D 多利安第 degree 音（0～7）。</summary>
    public static AudioClip Lyre(int degree)
    {
        lyreCache ??= new AudioClip[Dorian.Length];
        degree = Mathf.Clamp(degree, 0, Dorian.Length - 1);
        if (lyreCache[degree] != null)
            return lyreCache[degree];
        const float seconds = 1.6f;
        var data = new float[(int)(SampleRate * seconds)];
        int period = Mathf.Max(2, Mathf.RoundToInt(SampleRate / Dorian[degree]));
        var buffer = new float[period];
        var rng = new System.Random(240 + degree);
        for (int i = 0; i < period; i++)
            buffer[i] = (float)rng.NextDouble() * 2f - 1f;
        for (int i = 0; i < data.Length; i++)
        {
            int j = i % period;
            float next = buffer[(j + 1) % period];
            float sample = buffer[j];
            buffer[j] = 0.497f * (sample + next);
            data[i] = 0.4f * sample;
        }
        lyreCache[degree] = Make("Lyre" + degree, data);
        return lyreCache[degree];
    }

    /// <summary>持續的低音：D2 男聲哼鳴，4 秒可無縫循環（頻率取整數週期）。</summary>
    public static AudioClip Drone()
    {
        const float seconds = 4f;
        var data = new float[(int)(SampleRate * seconds)];
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float f = 73.5f;
            float breath = 0.85f + 0.15f * Mathf.Sin(2f * Mathf.PI * 0.5f * t);
            data[i] = 0.25f * breath * (Mathf.Sin(2f * Mathf.PI * f * t) + 0.5f * Mathf.Sin(2f * Mathf.PI * 2f * f * t) + 0.25f * Mathf.Sin(2f * Mathf.PI * 3f * f * t) + 0.15f * Mathf.Sin(2f * Mathf.PI * 1.5f * f * t));
        }
        return Make("Drone", data);
    }

    /// <summary>框鼓：一下悶擊（羊皮鼓面）。</summary>
    public static AudioClip FrameDrum()
    {
        var data = new float[(int)(SampleRate * 0.5f)];
        AddThump(data, 0f, 0.6f, 85f, 9f);
        AddThump(data, 0f, 0.15f, 170f, 20f);
        AddGravel(data, 0f, 0.04f, 0.15f, 251);
        return Make("FrameDrum", data);
    }

    /// <summary>低沉男聲吟唱：4 秒可循環，A2 與 D3 兩個母音交替。</summary>
    public static AudioClip Chant()
    {
        const float seconds = 4f;
        var data = new float[(int)(SampleRate * seconds)];
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float f = t < 2f ? 110f : 147f;
            float env = Mathf.Sin(Mathf.PI * (t % 2f) / 2f);
            float vowel = 1f + 0.6f * Mathf.Sin(2f * Mathf.PI * 3f * f * t) * (t < 2f ? 1f : 0.4f);
            data[i] = 0.18f * env * vowel * (Mathf.Sin(2f * Mathf.PI * f * t) + 0.4f * Mathf.Sin(2f * Mathf.PI * 2f * f * t));
        }
        return Make("Chant", data);
    }

    /// <summary>追殺時的里拉琴：2 秒、急促不和諧的反覆（D 與降 E 小二度），可循環。</summary>
    public static AudioClip ChaseLyre()
    {
        const float seconds = 2f;
        var data = new float[(int)(SampleRate * seconds)];
        float[] notes = { 293.66f, 311.13f, 293.66f, 415.30f };
        for (int k = 0; k < 16; k++)
        {
            float hz = notes[k % notes.Length];
            int begin = (int)(k * seconds / 16f * SampleRate);
            for (int i = 0; begin + i < data.Length && i < SampleRate / 6; i++)
            {
                float t = (float)i / SampleRate;
                data[begin + i] += 0.22f * Mathf.Sin(2f * Mathf.PI * hz * t) * Mathf.Exp(-14f * t) * (1f + 0.5f * Mathf.Sin(2f * Mathf.PI * 2f * hz * t));
            }
        }
        return Make("ChaseLyre", data);
    }

    /// <summary>同伴遇害時的低沉和弦：2.2 秒的 D 小調和弦（只有玩家聽得到）。</summary>
    public static AudioClip LowChord()
    {
        const float seconds = 2.2f;
        var data = new float[(int)(SampleRate * seconds)];
        float[] chord = { 73.42f, 87.31f, 110f, 146.83f };
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float env = Mathf.Clamp01(t / 0.15f) * Mathf.Clamp01((seconds - t) / 1.2f);
            float s = 0f;
            foreach (float f in chord)
                s += Mathf.Sin(2f * Mathf.PI * f * t);
            data[i] = 0.12f * env * s;
        }
        return Make("LowChord", data);
    }

    /// <summary>海風灌進來：2 秒、由弱到強再退去的氣流。</summary>
    public static AudioClip SeaGust()
    {
        const float seconds = 2f;
        var data = new float[(int)(SampleRate * seconds)];
        var rng = new System.Random(261);
        float a = 0f, b = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float n = (float)rng.NextDouble() * 2f - 1f;
            a += 0.08f * (n - a);
            b += 0.02f * (a - b);
            data[i] = 2.5f * (a - b) * Mathf.Sin(Mathf.PI * t / seconds);
        }
        return Make("SeaGust", data);
    }

    /// <summary>洞外的海鳥與浪：4 秒可循環，天亮前從縫外傳進來。</summary>
    public static AudioClip Seabirds()
    {
        const float seconds = 4f;
        var data = new float[(int)(SampleRate * seconds)];
        AddRumble(data, seconds, 0.01f, 0.35f, 271);
        var rng = new System.Random(273);
        for (int k = 0; k < 5; k++)
        {
            float start = (float)rng.NextDouble() * (seconds - 0.5f);
            float hz = 1300f + 600f * (float)rng.NextDouble();
            int begin = (int)(start * SampleRate);
            float phase = 0f;
            for (int i = 0; i < 0.35f * SampleRate && begin + i < data.Length; i++)
            {
                float t = (float)i / SampleRate;
                phase += 2f * Mathf.PI * hz * (1f - 0.4f * t / 0.35f) / SampleRate;
                data[begin + i] += 0.07f * Mathf.Sin(phase) * Mathf.Sin(Mathf.PI * t / 0.35f);
            }
        }
        // 頭尾交叉淡化，循環時不爆音。
        int fade = SampleRate / 10;
        for (int i = 0; i < fade; i++)
        {
            float w = (float)i / fade;
            data[i] *= w;
            data[data.Length - 1 - i] *= w;
        }
        return Make("Seabirds", data);
    }
}
