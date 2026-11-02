using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Odyssey.Core;
using Odyssey.Sim;

// 夜晚模擬器：dotnet run -c Release --project tools/NightSim -- [--runs 200] [--seed 1] [--out docs/playtest/sim-report.md]
static class Program
{
    static int Main(string[] args)
    {
        int runs = 200, seed = 1;
        string output = "docs/playtest/sim-report.md";
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--runs": runs = int.Parse(args[++i], CultureInfo.InvariantCulture); break;
                case "--seed": seed = int.Parse(args[++i], CultureInfo.InvariantCulture); break;
                case "--out": output = args[++i]; break;
                case "--help":
                    Console.WriteLine("--runs N（每種組合幾場，預設 200）  --seed S（預設 1）  --out 報告路徑");
                    return 0;
            }
        }

        var bots = new (string Key, Func<IBot> Make)[]
        {
            ("idle", () => new IdleBot()),
            ("rush", () => new RusherBot()),
            ("careful", () => new CarefulBot(decoy: false, rescue: false)),
            ("decoy", () => new CarefulBot(decoy: true, rescue: false)),
            ("rescue", () => new CarefulBot(decoy: true, rescue: true)),
        };
        var levels = new[] { DifficultyLevel.Familiar, DifficultyLevel.Normal, DifficultyLevel.Hard };

        var main = new List<Stats>();
        foreach (var level in levels)
            foreach (var bot in bots)
                main.Add(RunMany(bot.Make, new SimConfig { Difficulty = level, Awareness = 8f }, runs, seed));

        // 規格第 31 節 H：恐懼半徑 16 m（玩家更早知道巨人在哪）對比現在的 8 m，只看普通難度。
        var awareness = new List<Stats>();
        foreach (var bot in bots.Where(b => b.Key is "careful" or "decoy" or "rescue"))
            foreach (float a in new[] { 8f, 16f })
                awareness.Add(RunMany(bot.Make, new SimConfig { Difficulty = DifficultyLevel.Normal, Awareness = a }, runs, seed));

        string report = Report.Write(main, awareness, runs, seed, bots.Select(b => b.Make()).ToList());
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output)));
        File.WriteAllText(output, report, new UTF8Encoding(false));
        Console.WriteLine(report);
        return 0;
    }

    static Stats RunMany(Func<IBot> make, SimConfig config, int runs, int seed)
    {
        var results = new List<NightResult>[runs];
        Parallel.For(0, runs, i => results[i] = Campaign.Play(make, config, seed * 100003 + i));
        return Stats.Collect(make().Name, config, results.ToList());
    }
}
