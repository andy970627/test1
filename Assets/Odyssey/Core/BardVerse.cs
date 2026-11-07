using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 吟遊詩人的一首詩（規格第 31 節 D）：兩行詩依序淡入（每行 0.6 秒），按鍵行與第一行同時出現；
    /// <see cref="Complete"/> 後整首 0.8 秒淡出。<see cref="TakePlucks"/> 給豎琴撥弦音效用。
    /// </summary>
    public sealed class BardVerse
    {
        public const float LineFadeIn = 0.6f;
        public const float FadeOut = 0.8f;

        readonly bool hasLine2;
        float time;
        float outTime = -1f;
        int plucksGiven;

        public string Line1 { get; }
        public string Line2 { get; }
        public string Keys { get; }

        public BardVerse(string line1, string line2, string keys)
        {
            Line1 = line1;
            Line2 = line2;
            Keys = keys;
            hasLine2 = !string.IsNullOrEmpty(line2);
        }

        public void Tick(float dt)
        {
            time += dt;
            if (outTime >= 0f)
                outTime += dt;
        }

        public void Complete()
        {
            if (outTime < 0f)
                outTime = 0f;
        }

        public bool Finished => outTime >= FadeOut;

        float Out => outTime < 0f ? 1f : Math.Max(0f, 1f - outTime / FadeOut);

        static float Clamp01(float v) => v < 0f ? 0f : v > 1f ? 1f : v;

        public float LineAlpha(int line)
        {
            if (line == 1 && !hasLine2)
                return 0f;
            float fadeIn = Clamp01((time - line * LineFadeIn) / LineFadeIn);
            return fadeIn * Out;
        }

        /// <summary>按鍵行一出現就要讀得到，與第一行同步。</summary>
        public float KeyAlpha => LineAlpha(0);

        /// <summary>自上次呼叫以來，開始淡入的行數（豎琴撥弦用）。第一行一開始就算。</summary>
        public int TakePlucks()
        {
            int started = 1;
            if (hasLine2 && time >= LineFadeIn)
                started = 2;
            int n = started - plucksGiven;
            plucksGiven = started;
            return n;
        }
    }
}
