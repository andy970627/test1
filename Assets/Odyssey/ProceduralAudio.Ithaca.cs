using UnityEngine;

/// <summary>
/// 動作音效的「樂器身分」（docs/design/2026-11-07-sound-design-analysis.md 第 3、4 節）：
/// 對齊電影原聲帶的古希臘音色——里拉琴的撥與刷、青銅鑼、aulos 的雙簧拍頻、皮筋上滑。
/// 只學樂器與奏法，旋律與錄音全是原創合成。
/// </summary>
public static partial class ProceduralAudio
{
    static AudioClip[] lyreShortCache;

    /// <summary>短促的里拉琴撥弦（0.3 秒、用手掌壓住弦的止音）：彈弓的身分音。</summary>
    public static AudioClip LyreShort(int degree)
    {
        lyreShortCache ??= new AudioClip[Dorian.Length];
        degree = Mathf.Clamp(degree, 0, Dorian.Length - 1);
        if (lyreShortCache[degree] != null)
            return lyreShortCache[degree];
        var data = KarplusStrong(Dorian[degree], 0.3f, 0.48f, 300 + degree);
        for (int i = 0; i < data.Length; i++)
            data[i] *= Mathf.Clamp01((data.Length - i) / (0.08f * SampleRate));
        lyreShortCache[degree] = Make("LyreShort" + degree, data);
        return lyreShortCache[degree];
    }

    /// <summary>里拉琴刷弦：D 多利安五個音相隔 30 ms 刷過（巨石全開）。</summary>
    public static AudioClip LyreStrum()
    {
        int[] degrees = { 0, 2, 4, 6, 7 };
        const float seconds = 1.8f;
        var data = new float[(int)(SampleRate * seconds)];
        for (int k = 0; k < degrees.Length; k++)
        {
            var pluck = KarplusStrong(Dorian[degrees[k]], 1.5f, 0.497f, 320 + k);
            int begin = (int)(k * 0.03f * SampleRate);
            for (int i = 0; i < pluck.Length && begin + i < data.Length; i++)
                data[begin + i] += 0.7f * pluck[i];
        }
        return Make("LyreStrum", data);
    }

    /// <summary>里拉琴上行三音 D–F–A（學會一個動作；取代現代音色的鈴聲）。</summary>
    public static AudioClip LyreTriad()
    {
        int[] degrees = { 0, 2, 4 };
        const float seconds = 1.6f;
        var data = new float[(int)(SampleRate * seconds)];
        for (int k = 0; k < degrees.Length; k++)
        {
            var pluck = KarplusStrong(Dorian[degrees[k]], 1.2f, 0.496f, 340 + k);
            int begin = (int)(k * 0.11f * SampleRate);
            for (int i = 0; i < pluck.Length && begin + i < data.Length; i++)
                data[begin + i] += 0.6f * pluck[i];
        }
        return Make("LyreTriad", data);
    }

    /// <summary>弓弦：Karplus–Strong 弦音加木弓身的低頻共鳴（比彈弓厚）。</summary>
    public static AudioClip BowTwang()
    {
        var data = KarplusStrong(110f, 0.6f, 0.49f, 360);
        AddThump(data, 0f, 0.35f, 70f, 22f);
        return Make("BowTwang", data);
    }

    /// <summary>
    /// 青銅鑼：不諧和泛音（×1、1.5、2.1、2.7、3.9）各自衰減，基頻最慢；起音一撮雜訊。
    /// hz 決定大小鑼（D2 73 Hz 大鑼、D3 147 Hz 中鑼）；muted 時全部 0.5 秒內壓住（喪鐘）。
    /// </summary>
    public static AudioClip Gong(string name, float hz, float seconds, float gain, bool muted = false)
    {
        var data = new float[(int)(SampleRate * seconds)];
        float[] ratios = { 1f, 1.5f, 2.1f, 2.7f, 3.9f };
        float[] amps = { 1f, 0.6f, 0.45f, 0.3f, 0.18f };
        float[] decays = { 1f / seconds * 1.2f, 1.6f, 2.4f, 3.2f, 4.5f };
        var rng = new System.Random(380 + (int)hz);
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float s = 0f;
            for (int k = 0; k < ratios.Length; k++)
                s += amps[k] * Mathf.Sin(2f * Mathf.PI * hz * ratios[k] * t * (1f + 0.002f * Mathf.Sin(2f * Mathf.PI * 0.7f * t))) * Mathf.Exp(-decays[k] * t);
            float strike = t < 0.02f ? ((float)rng.NextDouble() * 2f - 1f) * 0.6f * (1f - t / 0.02f) : 0f;
            float env = Mathf.Clamp01(t / 0.004f);
            if (muted)
                env *= Mathf.Exp(-4f * t);
            data[i] = gain * env * (s * 0.35f + strike);
        }
        return Make(name, data);
    }

    public static AudioClip GongLow() => Gong("GongLow", 73.42f, 4f, 0.8f);
    public static AudioClip GongMid() => Gong("GongMid", 146.83f, 2.5f, 0.7f);
    public static AudioClip GongMuted() => Gong("GongMuted", 73.42f, 1.5f, 0.9f, muted: true);

    /// <summary>刮鑼：鑼邊持續摩擦的高頻（3～6 kHz 帶通雜訊，2 Hz 起伏），4 秒可循環。恐懼第 3 層。</summary>
    public static AudioClip GongScrape()
    {
        const float seconds = 4f;
        var data = new float[(int)(SampleRate * seconds)];
        var rng = new System.Random(391);
        float lp = 0f, lp2 = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float n = (float)rng.NextDouble() * 2f - 1f;
            lp += 0.55f * (n - lp);   // 低通約 6 kHz
            lp2 += 0.3f * (lp - lp2); // 再低通約 3 kHz；相減得帶通
            float band = lp - lp2;
            float swell = 0.6f + 0.4f * Mathf.Sin(2f * Mathf.PI * 2f * t);
            float ring = 1f + 0.3f * Mathf.Sin(2f * Mathf.PI * 2200f * t);
            data[i] = 0.35f * band * swell * ring;
        }
        return Make("GongScrape", data);
    }

    /// <summary>aulos 雙簧持續音：兩個相差 3 Hz 的鋸齒波（拍頻）、低通、5 Hz 微顫；4 秒可循環。禱告時疊在人聲下。</summary>
    public static AudioClip AulosDrone()
    {
        const float seconds = 4f;
        var data = new float[(int)(SampleRate * seconds)];
        float f1 = 110f, f2 = 113f;
        float lp = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float vib = 1f + 0.004f * Mathf.Sin(2f * Mathf.PI * 5f * t);
            float s = Saw(f1 * vib * t) + Saw(f2 * vib * t);
            lp += 0.18f * (s - lp); // 低通約 1.5 kHz
            float env = Mathf.Min(1f, Mathf.Min(t / 0.3f, (seconds - t) / 0.3f) * 4f + 0.75f);
            data[i] = 0.16f * lp * Mathf.Clamp01(env);
        }
        return Make("AulosDrone", data);
    }

    /// <summary>拉彈弓時皮筋的音高：D 的鋸齒波帶 2% 雜訊，1 秒可循環；播放時用 pitch 從 1 滑到 1.5（D→A）。</summary>
    public static AudioClip BandTone()
    {
        const float seconds = 1f;
        var data = new float[(int)(SampleRate * seconds)];
        var rng = new System.Random(401);
        float lp = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float s = Saw(146.83f * t) * 0.6f + 0.02f * ((float)rng.NextDouble() * 2f - 1f);
            lp += 0.12f * (s - lp);
            data[i] = 0.2f * lp;
        }
        return Make("BandTone", data);
    }

    static float Saw(float phase) => 2f * (phase - Mathf.Floor(phase + 0.5f));

    /// <summary>Karplus–Strong 撥弦：hz 音高、seconds 長度、damping 越小衰減越快（0.497 約 1.5 秒、0.48 約 0.3 秒）。</summary>
    static float[] KarplusStrong(float hz, float seconds, float damping, int seed)
    {
        var data = new float[(int)(SampleRate * seconds)];
        int period = Mathf.Max(2, Mathf.RoundToInt(SampleRate / hz));
        var buffer = new float[period];
        var rng = new System.Random(seed);
        for (int i = 0; i < period; i++)
            buffer[i] = (float)rng.NextDouble() * 2f - 1f;
        for (int i = 0; i < data.Length; i++)
        {
            int j = i % period;
            float next = buffer[(j + 1) % period];
            float sample = buffer[j];
            buffer[j] = damping * (sample + next);
            data[i] = 0.4f * sample;
        }
        return data;
    }
}
