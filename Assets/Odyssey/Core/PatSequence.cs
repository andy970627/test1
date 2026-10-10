using System;
using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>巨人摸一隻羊的流程。普通羊一輪；大公羊 2～3 輪且摸背較久（原典裡巨人對公羊說話）。</summary>
    public static class PatSequence
    {
        public const float BackSeconds = 1.5f;
        public const float RamBackSeconds = 2.5f;
        public const float TelegraphSeconds = 1.0f;
        public const float SideSeconds = 1.2f;

        public static List<PatStep> Build(bool isRam, Random rng)
        {
            int rounds = isRam ? rng.Next(2, 4) : 1;
            float back = isRam ? RamBackSeconds : BackSeconds;
            var steps = new List<PatStep>(rounds * 3);
            for (int i = 0; i < rounds; i++)
            {
                var side = rng.Next(2) == 0 ? Side.Left : Side.Right;
                steps.Add(new PatStep(PatKind.Back, side, back));
                steps.Add(new PatStep(PatKind.Telegraph, side, TelegraphSeconds));
                steps.Add(new PatStep(PatKind.Side, side, SideSeconds));
            }
            return steps;
        }
    }
}
