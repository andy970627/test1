using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using Odyssey.Core;

namespace Odyssey.Sim
{
    /// <summary>一場遊戲：從 12 名同伴開始，一夜一夜玩到逃出或全滅（同遊戲的 CrewRoster 規則）。</summary>
    public static class Campaign
    {
        public static List<NightResult> Play(Func<IBot> makeBot, SimConfig config, int seed, int maxNights = 12)
        {
            var nights = new List<NightResult>();
            var layoutRng = new Random(seed);
            // 同 BlindCaveBuilder：躲藏點相隔 3 m（不夠就放寬到 1.5 m）、離巨石 5 m；石子 6 顆相隔 2 m、離巨石 3 m。
            List<Vector2> crewSpots = null;
            for (float spacing = 3f; spacing >= 1.5f; spacing -= 0.5f)
            {
                crewSpots = CaveMap.PickSpots(new Random(seed * 31 + 13), CrewRoster.StartingCrew, spacing, 5f);
                if (crewSpots.Count >= CrewRoster.StartingCrew)
                    break;
            }
            var stoneSpots = CaveMap.PickSpots(new Random(seed * 31 + 7), 6, 2f, 3f);
            var roster = new CrewRoster();
            IBot bot = makeBot();
            while (!roster.Wiped && nights.Count < maxNights)
            {
                // 每夜躲藏點換一個順序（同 ShuffledCrewSpots）。
                var spots = crewSpots.OrderBy(_ => layoutRng.Next()).ToList();
                var night = new Night(config, seed * 1000 + roster.Night, new DecoyMemory(), spots, roster.Remaining, stoneSpots);
                NightResult r = night.Run(bot);
                nights.Add(r);
                for (int i = 0; i < r.CrewLost; i++)
                    roster.Lose();
                if (r.Escaped)
                    break;
                roster.Eat();
            }
            return nights;
        }
    }

    /// <summary>很多場的統計。</summary>
    public sealed class Stats
    {
        public string Bot;
        public DifficultyLevel Difficulty;
        public float Awareness;
        public int Runs;
        public int Nights;
        public int FirstNightEscapes;
        public int RunsEscaped;
        public double NightsToEscape;
        public double EscapeSeconds;
        public double Rescued;
        public double CrewLostPerNight;
        public double Near5mPerNight;
        public double KnownShare;
        public double ClapsPerNight, ArrowsPerNight, GuardsPerNight, WedgesPerNight;
        public double FailedMaxOpening;
        public readonly Dictionary<FailReason, int> Fails = new();

        public double FirstNightRate => Runs == 0 ? 0 : (double)FirstNightEscapes / Runs;
        public double RunRate => Runs == 0 ? 0 : (double)RunsEscaped / Runs;
        public int FailedNights => Fails.Values.Sum();

        public static Stats Collect(string bot, SimConfig config, List<List<NightResult>> runs)
        {
            var s = new Stats { Bot = bot, Difficulty = config.Difficulty, Awareness = config.Awareness, Runs = runs.Count };
            var all = runs.SelectMany(r => r).ToList();
            s.Nights = all.Count;
            s.FirstNightEscapes = runs.Count(r => r.Count > 0 && r[0].Escaped);
            var escapedRuns = runs.Where(r => r.Count > 0 && r[^1].Escaped).ToList();
            s.RunsEscaped = escapedRuns.Count;
            s.NightsToEscape = escapedRuns.Count == 0 ? 0 : escapedRuns.Average(r => r.Count);
            var escapes = all.Where(n => n.Escaped).ToList();
            s.EscapeSeconds = escapes.Count == 0 ? 0 : escapes.Average(n => n.Seconds);
            s.Rescued = escapes.Count == 0 ? 0 : escapes.Average(n => n.Rescued);
            s.CrewLostPerNight = all.Average(n => n.CrewLost);
            s.Near5mPerNight = all.Average(n => n.SecondsNear5m);
            s.KnownShare = all.Sum(n => n.SecondsKnown) / Math.Max(1e-6, all.Sum(n => n.Seconds));
            s.ClapsPerNight = all.Average(n => n.Claps);
            s.ArrowsPerNight = all.Average(n => n.Arrows);
            s.GuardsPerNight = all.Average(n => n.Guards);
            s.WedgesPerNight = all.Average(n => n.Wedges);
            var failed = all.Where(n => !n.Escaped).ToList();
            s.FailedMaxOpening = failed.Count == 0 ? 0 : failed.Average(n => n.MaxOpening / BoulderSlide.FullOpen);
            foreach (var n in failed)
                s.Fails[n.Fail] = s.Fails.GetValueOrDefault(n.Fail) + 1;
            return s;
        }
    }
}
