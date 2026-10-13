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

    /// <summary>拍掌：0.08 秒的清脆高頻噪音。</summary>
    public static AudioClip Clap() => Burst("Clap", 0.08f, 0.9f, 0.9f, 71);

    /// <summary>石頭敲擊：0.15 秒，一聲 420Hz 的短敲加細碎噪音。</summary>
    public static AudioClip StoneKnock()
    {
        var data = new float[(int)(SampleRate * 0.15f)];
        AddThump(data, 0f, 0.4f, 420f, 45f);
        AddGravel(data, 0f, 0.05f, 0.3f, 81);
        return Make("StoneKnock", data);
    }

    /// <summary>巨石磨擦：0.5 秒的低頻粗噪音，起落平緩；音高由播放時決定。</summary>
    public static AudioClip Grind() => Rumble("Grind", 0.5f, 0.06f, 0.7f, 91);

    /// <summary>猛推、卡住：重磨擦加一聲悶響。</summary>
    public static AudioClip BoulderHeavy()
    {
        var data = new float[(int)(SampleRate * 0.6f)];
        AddRumble(data, 0.6f, 0.08f, 0.6f, 101);
        AddThump(data, 0f, 0.25f, 65f, 9f);
        return Make("BoulderHeavy", data);
    }

    /// <summary>巨石回滑：0.8 秒小聲的慢磨擦。</summary>
    public static AudioClip Slip() => Rumble("Slip", 0.8f, 0.03f, 0.4f, 111);

    /// <summary>石子卡進縫：一聲短促的「咔」。</summary>
    public static AudioClip WedgeClick()
    {
        var data = new float[(int)(SampleRate * 0.1f)];
        AddThump(data, 0f, 0.5f, 900f, 70f);
        AddGravel(data, 0f, 0.04f, 0.3f, 121);
        return Make("WedgeClick", data);
    }

    /// <summary>木桶翻倒：0.5 秒內三下空心的木頭碰撞。</summary>
    public static AudioClip PailClatter()
    {
        var data = new float[(int)(SampleRate * 0.5f)];
        AddThump(data, 0f, 0.4f, 180f, 30f);
        AddThump(data, 0.14f, 0.3f, 210f, 35f);
        AddThump(data, 0.3f, 0.2f, 160f, 35f);
        return Make("PailClatter", data);
    }

    /// <summary>軟物落地（乳酪）。</summary>
    public static AudioClip SoftThud()
    {
        var data = new float[(int)(SampleRate * 0.15f)];
        AddThump(data, 0f, 0.5f, 110f, 35f);
        return Make("SoftThud", data);
    }

    /// <summary>拖木樁：0.3 秒的木頭刮地。</summary>
    public static AudioClip WoodScrape() => Rumble("WoodScrape", 0.3f, 0.3f, 0.5f, 131);

    /// <summary>撿到石子：兩顆小石子輕碰（只有玩家聽得到）。</summary>
    public static AudioClip PebbleClick()
    {
        var data = new float[(int)(SampleRate * 0.15f)];
        AddThump(data, 0f, 0.25f, 1100f, 80f);
        AddThump(data, 0.06f, 0.18f, 1300f, 80f);
        return Make("PebbleClick", data);
    }

    /// <summary>同伴低聲回應：0.35 秒的低沉氣聲（只有玩家聽得到）。</summary>
    public static AudioClip CrewReply()
    {
        var data = new float[(int)(SampleRate * 0.35f)];
        float phase = 0f;
        var rng = new System.Random(141);
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            phase += 2f * Mathf.PI * Mathf.Lerp(150f, 120f, t / 0.35f) / SampleRate;
            float breath = ((float)rng.NextDouble() * 2f - 1f) * 0.15f;
            data[i] = (0.25f * Mathf.Sin(phase) + breath) * Mathf.Sin(Mathf.PI * t / 0.35f);
        }
        return Make("CrewReply", data);
    }

    /// <summary>拿起木樁：木頭輕敲（只有玩家聽得到）。</summary>
    public static AudioClip WoodTap()
    {
        var data = new float[(int)(SampleRate * 0.12f)];
        AddThump(data, 0f, 0.4f, 260f, 40f);
        return Make("WoodTap", data);
    }

    /// <summary>提示學會：輕柔的一聲鈴（只有玩家聽得到）。</summary>
    public static AudioClip LearnChime()
    {
        var data = new float[(int)(SampleRate * 0.6f)];
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            data[i] = 0.2f * (Mathf.Sin(2f * Mathf.PI * 880f * t) + 0.5f * Mathf.Sin(2f * Mathf.PI * 1320f * t)) * Mathf.Exp(-6f * t);
        }
        return Make("LearnChime", data);
    }

    /// <summary>巨石每推開 25%：低沉的一聲「咚」（只有玩家聽得到）。</summary>
    public static AudioClip BoulderSettle()
    {
        var data = new float[(int)(SampleRate * 0.7f)];
        AddThump(data, 0f, 0.6f, 50f, 6f);
        AddThump(data, 0f, 0.25f, 100f, 8f);
        return Make("BoulderSettle", data);
    }

    /// <summary>巨人拔掉楔子：一聲「喀」加石子彈出。</summary>
    public static AudioClip WedgePulled()
    {
        var data = new float[(int)(SampleRate * 0.4f)];
        AddThump(data, 0f, 0.5f, 700f, 50f);
        AddThump(data, 0.12f, 0.3f, 420f, 45f);
        AddGravel(data, 0.12f, 0.15f, 0.25f, 151);
        return Make("WedgePulled", data);
    }

    /// <summary>
    /// 巨人向波塞頓禱告：8 秒迴盪、聽不清的低沉人聲（85Hz 起伏的母音，一句一句），
    /// 加上 0.35／0.7 秒的回聲與地底低頻。
    /// </summary>
    public static AudioClip Prayer()
    {
        const float seconds = 8f;
        int length = (int)(SampleRate * seconds);
        var dry = new float[length];
        float phase = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            float pitch = 85f * (1f + 0.06f * Mathf.Sin(2f * Mathf.PI * 0.4f * t) + 0.02f * Mathf.Sin(2f * Mathf.PI * 5f * t));
            phase += 2f * Mathf.PI * pitch / SampleRate;
            // 一句一句：每 1.6 秒一句，句中 2.5Hz 的音節起伏。
            float sentence = Mathf.Clamp01(Mathf.Sin(Mathf.PI * (t % 1.6f) / 1.4f));
            float syllable = 0.6f + 0.4f * Mathf.Sin(2f * Mathf.PI * 2.5f * t);
            float voice = Mathf.Sin(phase) + 0.5f * Mathf.Sin(2f * phase) + 0.3f * Mathf.Sin(3f * phase) + 0.15f * Mathf.Sin(5f * phase);
            float fade = Mathf.Clamp01(t / 0.5f) * Mathf.Clamp01((seconds - t) / 1f);
            dry[i] = 0.18f * voice * sentence * syllable * fade;
        }
        var data = new float[length];
        int echo1 = (int)(0.35f * SampleRate), echo2 = (int)(0.7f * SampleRate);
        for (int i = 0; i < length; i++)
        {
            float v = dry[i];
            if (i >= echo1) v += 0.45f * dry[i - echo1];
            if (i >= echo2) v += 0.25f * dry[i - echo2];
            data[i] = v;
        }
        AddRumble(data, seconds, 0.02f, 0.5f, 161);
        return Make("Prayer", data);
    }

    /// <summary>奧德修斯喊出自己的名字：1 秒的人聲吶喊，加洞口的回聲。</summary>
    public static AudioClip Shout()
    {
        const float seconds = 1.6f;
        int length = (int)(SampleRate * seconds);
        var dry = new float[length];
        float phase = 0f;
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            if (t > 1f)
                break;
            float pitch = Mathf.Lerp(230f, 190f, t);
            phase += 2f * Mathf.PI * pitch / SampleRate;
            float env = Mathf.Clamp01(t / 0.05f) * Mathf.Clamp01((1f - t) / 0.25f);
            dry[i] = 0.25f * env * (Mathf.Sin(phase) + 0.6f * Mathf.Sin(2f * phase) + 0.4f * Mathf.Sin(3f * phase));
        }
        var data = new float[length];
        int echo = (int)(0.3f * SampleRate);
        for (int i = 0; i < length; i++)
            data[i] = dry[i] + (i >= echo ? 0.4f * dry[i - echo] : 0f);
        return Make("Shout", data);
    }

    /// <summary>弓弦：0.35 秒、140Hz 很快衰減的弦聲。</summary>
    public static AudioClip Twang()
    {
        var data = new float[(int)(SampleRate * 0.35f)];
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float f = 140f * (1f + 0.15f * Mathf.Exp(-30f * t));
            data[i] = 0.4f * (Mathf.Sin(2f * Mathf.PI * f * t) + 0.4f * Mathf.Sin(4f * Mathf.PI * f * t)) * Mathf.Exp(-9f * t) * Mathf.Clamp01(t / 0.002f);
        }
        return Make("Twang", data);
    }

    /// <summary>箭插進岩壁或地面：短促的木頭撞擊。</summary>
    public static AudioClip ArrowHit()
    {
        var data = new float[(int)(SampleRate * 0.2f)];
        AddThump(data, 0f, 0.35f, 320f, 35f);
        AddGravel(data, 0f, 0.06f, 0.3f, 171);
        return Make("ArrowHit", data);
    }

    /// <summary>死亡畫面：一聲低沉的鐘鳴（110Hz 加不和諧泛音）加地底低頻，3 秒。</summary>
    public static AudioClip DeathBell()
    {
        var data = new float[SampleRate * 3];
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float bell = Mathf.Sin(2f * Mathf.PI * 110f * t) + 0.6f * Mathf.Sin(2f * Mathf.PI * 263f * t) + 0.35f * Mathf.Sin(2f * Mathf.PI * 417f * t);
            data[i] = 0.22f * bell * Mathf.Exp(-1.2f * t) * Mathf.Clamp01(t / 0.01f);
        }
        AddRumble(data, 3f, 0.02f, 0.5f, 181);
        return Make("DeathBell", data);
    }

    /// <summary>同伴被抓時的慘叫：0.9 秒、音高往上撕裂的人聲。</summary>
    public static AudioClip Scream()
    {
        const float seconds = 0.9f;
        var data = new float[(int)(SampleRate * seconds)];
        var rng = new System.Random(191);
        float phase = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            float pitch = Mathf.Lerp(380f, 620f, Mathf.Clamp01(t / 0.3f)) * (1f + 0.03f * Mathf.Sin(2f * Mathf.PI * 9f * t));
            phase += 2f * Mathf.PI * pitch / SampleRate;
            float rasp = ((float)rng.NextDouble() * 2f - 1f) * 0.25f;
            float env = Mathf.Clamp01(t / 0.03f) * Mathf.Clamp01((seconds - t) / 0.35f);
            data[i] = 0.3f * env * (Mathf.Sin(phase) + 0.5f * Mathf.Sin(2f * phase) + 0.3f * Mathf.Sin(3f * phase) + rasp);
        }
        return Make("Scream", data);
    }

    /// <summary>耳鳴：1.5 秒的 4kHz 高頻嗡聲，慢慢淡出。</summary>
    public static AudioClip Tinnitus()
    {
        const float seconds = 1.5f;
        var data = new float[(int)(SampleRate * seconds)];
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            data[i] = 0.12f * Mathf.Sin(2f * Mathf.PI * 4000f * t) * Mathf.Clamp01(t / 0.05f) * Mathf.Clamp01((seconds - t) / 1f);
        }
        return Make("Tinnitus", data);
    }

    static AudioClip Burst(string name, float seconds, float gain, float smoothing, int seed)
    {
        var data = new float[(int)(SampleRate * seconds)];
        var rng = new System.Random(seed);
        float lowpass = 0f;
        for (int i = 0; i < data.Length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += smoothing * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            data[i] = gain * lowpass * Mathf.Exp(-40f * t) * Mathf.Clamp01((seconds - t) / 0.01f);
        }
        return Make(name, data);
    }

    static AudioClip Rumble(string name, float seconds, float smoothing, float gain, int seed)
    {
        var data = new float[(int)(SampleRate * seconds)];
        AddRumble(data, seconds, smoothing, gain, seed);
        return Make(name, data);
    }

    /// <summary>低頻粗噪音，起落平緩（磨擦、刮地）。</summary>
    static void AddRumble(float[] data, float seconds, float smoothing, float gain, int seed)
    {
        var rng = new System.Random(seed);
        float lowpass = 0f;
        int length = Mathf.Min(data.Length, (int)(SampleRate * seconds));
        for (int i = 0; i < length; i++)
        {
            float t = (float)i / SampleRate;
            lowpass += smoothing * ((float)rng.NextDouble() * 2f - 1f - lowpass);
            float envelope = Mathf.Clamp01(t / 0.05f) * Mathf.Clamp01((seconds - t) / 0.1f);
            data[i] += gain * lowpass / Mathf.Sqrt(smoothing) * 0.6f * envelope;
        }
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
