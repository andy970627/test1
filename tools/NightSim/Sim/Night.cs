using System;
using System.Collections.Generic;
using System.Numerics;
using Odyssey.Core;

namespace Odyssey.Sim
{
    public sealed class SimConfig
    {
        public DifficultyLevel Difficulty = DifficultyLevel.Normal;
        /// <summary>玩家不用回聲也知道巨人在哪的距離（腳步、呼吸、心跳）。現在遊戲的心跳是 8 m，規格第 31 節 H 的恐懼半徑是 16 m。</summary>
        public float Awareness = 8f;
        public float NightSeconds = DawnClock.DefaultNightSeconds;
        public float Dt = 0.05f;
        /// <summary>躲著的同伴嗚咽，玩家在這個距離內聽得出方向。</summary>
        public float WhimperHearing = 12f;
    }

    public enum CrewMode { Hiding, Following, Gone }

    public sealed class SimCrew
    {
        public Vector2 Pos;
        public CrewMode Mode;
        public float NextWhimper;
        public float StepTimer;
    }

    /// <summary>機器人這一幀想做的事。</summary>
    public struct Intent
    {
        public Vector2? MoveTo;
        public bool Run;
        public PushMode Push;
        /// <summary>站在巨石前不推：用身體頂住。</summary>
        public bool Brace;
        public bool Clap;
        public bool Wedge;
        public Vector2? ShootAt;
    }

    /// <summary>機器人知道的事：只來自回聲照亮、聽得到的距離、嗚咽與禱告聲。</summary>
    public sealed class Perception
    {
        public bool CyclopsKnown;
        public Vector2 CyclopsPos;
        public float CyclopsSeenAt = -999f;
        public Vector2 CyclopsPrevPos;
        public bool Praying;
        public readonly HashSet<SimCrew> KnownCrew = new();
        public readonly HashSet<int> KnownStones = new();

        public float SinceSeen(float now) => now - CyclopsSeenAt;
        /// <summary>最近 1.5 秒內知道他在哪。</summary>
        public bool Fresh(float now) => CyclopsKnown && SinceSeen(now) <= 1.5f;
    }

    public sealed class NightResult
    {
        public bool Escaped;
        public FailReason Fail;
        public float Seconds;
        public int Rescued;
        public int CrewLost;
        public int Prayers;
        public float SecondsNear5m;
        public float SecondsKnown;
        public int Claps, Arrows, Wedges, StonesPicked;
        public float MaxOpening;
        public int Guards;
    }

    /// <summary>一夜的模擬：規則全部來自 Odyssey.Core，空間與碰撞是平面近似。</summary>
    public sealed class Night
    {
        public readonly SimConfig Config;
        public readonly Random Rng;
        public readonly CyclopsBrain Brain;
        public readonly BoulderSlide Slide;
        public readonly DawnClock Dawn;
        public readonly PrayerClock Prayer = new();
        public readonly Stamina Stamina = new();
        public readonly Perception Know = new();
        public readonly List<SimCrew> Crew = new();
        public readonly List<Vector2> Stones = new();
        public readonly List<bool> StoneOnFloor = new();

        public Vector2 Player;
        public int StonesCarried;
        public int ArrowsLeft = 3;
        public float Time;
        public bool Running;
        public PushMode Pushing;

        readonly List<(Vector2 At, float Left)> arrows = new();
        readonly List<(Vector2 At, float Left)> rocks = new();
        float stepTimer, wedgeTimer;
        bool prayJolt3, prayJolt6;
        CyclopsState lastState;
        readonly NightResult result = new();

        public Night(SimConfig config, int seed, DecoyMemory memory, IReadOnlyList<Vector2> crewSpots, int crewCount, IReadOnlyList<Vector2> stoneSpots)
        {
            Config = config;
            Rng = new Random(seed);
            Brain = new CyclopsBrain(CaveMap.CyclopsSeat, memory, Rng.NextDouble) { Level = config.Difficulty };
            Slide = new BoulderSlide(Rng.NextDouble);
            Dawn = new DawnClock(config.NightSeconds);
            Prayer.NewNight(Rng.NextDouble);
            Player = CaveMap.PlayerSpawn;
            for (int i = 0; i < crewCount && i < crewSpots.Count; i++)
                Crew.Add(new SimCrew { Pos = crewSpots[i], Mode = CrewMode.Hiding, NextWhimper = 15f + (float)Rng.NextDouble() * 15f });
            foreach (var s in stoneSpots)
            {
                Stones.Add(s);
                StoneOnFloor.Add(true);
            }
            lastState = Brain.State;
        }

        public IEnumerable<SimCrew> Followers()
        {
            foreach (var c in Crew)
                if (c.Mode == CrewMode.Following)
                    yield return c;
        }

        public bool AtBoulder => Vector2.Distance(Player, CaveMap.PushPoint) <= CaveMap.PushReach;

        /// <summary>跑完一夜；bot 每幀決定要做什麼。</summary>
        public NightResult Run(IBot bot)
        {
            bot.NewNight(this);
            float dt = Config.Dt;
            while (true)
            {
                Time += dt;
                Dawn.Tick(dt);
                if (Dawn.IsDawn)
                    return Finish(false, FailReason.Dawn);

                UpdatePerception();
                Intent intent = bot.Decide(this);
                ApplyIntent(intent, dt);
                if (result.Escaped)
                    return result;

                UpdateCrew(dt);
                UpdatePrayer();
                UpdateBoulder(dt);
                UpdateProjectiles(dt);

                var crewPos = new List<Vector2>();
                var crewRefs = new List<SimCrew>();
                foreach (var c in Crew)
                    if (c.Mode != CrewMode.Gone)
                    {
                        crewPos.Add(c.Pos);
                        crewRefs.Add(c);
                    }
                CyclopsTick tick = Brain.Tick(dt, Player, crewPos);
                if (tick.Player != FailReason.None)
                    return Finish(false, tick.Player);
                if (tick.EatenCrew >= 0)
                    LoseCrew(crewRefs[tick.EatenCrew]);
                if (tick.RockReleased)
                    rocks.Add((tick.RockTarget, CyclopsBrain.FlightSeconds));
                if (tick.PullWedge && Slide.GiantPull())
                    AddFloorStone(CaveMap.PushPoint + new Vector2(0f, -0.6f));
                if (Brain.State == CyclopsState.Guard && lastState != CyclopsState.Guard)
                    result.Guards++;
                lastState = Brain.State;

                foreach (var r in rocks)
                    if (r.Left <= 0f && CyclopsBrain.RockHits(r.At, Player))
                        return Finish(false, FailReason.Crushed);
                rocks.RemoveAll(r => r.Left <= 0f);

                float d = Vector2.Distance(Player, Brain.Position);
                if (d <= 5f)
                    result.SecondsNear5m += dt;
                if (Know.Fresh(Time))
                    result.SecondsKnown += dt;
                result.MaxOpening = Math.Max(result.MaxOpening, Slide.Opening);
            }
        }

        NightResult Finish(bool escaped, FailReason reason)
        {
            result.Escaped = escaped;
            result.Fail = reason;
            result.Seconds = Time;
            return result;
        }

        void UpdatePerception()
        {
            Know.Praying = Brain.State == CyclopsState.Pray;
            if (Vector2.Distance(Player, Brain.Position) <= Config.Awareness)
                SeeCyclops();
        }

        void SeeCyclops()
        {
            Know.CyclopsPrevPos = Know.CyclopsKnown ? Know.CyclopsPos : Brain.Position;
            Know.CyclopsKnown = true;
            Know.CyclopsPos = Brain.Position;
            Know.CyclopsSeenAt = Time;
        }

        /// <summary>發出聲音：巨人可能聽到；會照亮的聲音讓玩家看到那一圈裡的東西。</summary>
        public void Emit(SoundKind kind, Vector2 at, float scale = 1f)
        {
            SoundEvent e = SoundRules.Create(kind, at, Time, null, scale);
            Brain.Hear(e);
            if (!SoundRules.Lights(kind))
                return;
            float r = SoundRules.Radius(e.Loudness);
            if (Vector2.Distance(at, Brain.Position) <= r)
                SeeCyclops();
            foreach (var c in Crew)
                if (c.Mode == CrewMode.Hiding && Vector2.Distance(at, c.Pos) <= r)
                    Know.KnownCrew.Add(c);
            for (int i = 0; i < Stones.Count; i++)
                if (StoneOnFloor[i] && Vector2.Distance(at, Stones[i]) <= r)
                    Know.KnownStones.Add(i);
        }

        void ApplyIntent(Intent it, float dt)
        {
            braceThisFrame = it.Brace;
            if (it.Clap)
            {
                Emit(SoundKind.Clap, Player);
                result.Claps++;
            }
            if (it.ShootAt is Vector2 aim && ArrowsLeft > 0)
            {
                ArrowsLeft--;
                result.Arrows++;
                Emit(SoundKind.Twang, Player);
                float flight = Vector2.Distance(Player, aim) / 25f;
                arrows.Add((CaveMap.Clamp(aim), flight));
            }

            Pushing = PushMode.None;
            bool atBoulder = AtBoulder;
            if (it.Wedge && atBoulder && StonesCarried > 0)
            {
                wedgeTimer += dt;
                if (wedgeTimer >= 0.6f)
                {
                    wedgeTimer = 0f;
                    StonesCarried--;
                    Slide.AddStoneWedge();
                    Emit(SoundKind.Wedge, CaveMap.PushPoint);
                    result.Wedges++;
                }
                Running = Stamina.Tick(dt, false);
                return;
            }
            wedgeTimer = 0f;

            if (it.Push != PushMode.None && atBoulder)
            {
                Pushing = it.Push;
                Running = Stamina.Tick(dt, false);
                stepTimer = 0f;
            }
            else if (it.MoveTo is Vector2 goal && Vector2.Distance(goal, Player) > 0.05f)
            {
                Running = Stamina.Tick(dt, it.Run);
                float speed = Running ? 4f : 1.5f;
                Vector2 dir = Vector2.Normalize(goal - Player);
                float step = Math.Min(speed * dt, Vector2.Distance(goal, Player));
                Player = CaveMap.Clamp(Player + dir * step);
                stepTimer += dt;
                if (stepTimer >= (Running ? 0.35f : 0.6f))
                {
                    stepTimer = 0f;
                    Emit(Running ? SoundKind.Run : SoundKind.Step, Player);
                }
            }
            else
            {
                Running = Stamina.Tick(dt, false);
                stepTimer = 0f;
            }
            if (Stamina.PantDue(dt))
                Emit(SoundKind.Pant, Player);

            PickUpStones();
            Recruit();

            if (Slide.IsOpen && Vector2.Distance(Player, CaveMap.GapPoint) <= CaveMap.PushReach && it.MoveTo is Vector2 g && Vector2.Distance(g, CaveMap.GapPoint) < 0.5f)
            {
                int rescued = 0;
                foreach (var f in Followers())
                    rescued++;
                result.Rescued = rescued;
                result.Escaped = true;
                result.Seconds = Time;
            }
        }

        /// <summary>站在巨石前沒推、bot 選擇頂住。</summary>
        bool braceThisFrame;

        void PickUpStones()
        {
            for (int i = 0; i < Stones.Count; i++)
                if (StoneOnFloor[i] && Vector2.Distance(Player, Stones[i]) <= CaveMap.PickupReach)
                {
                    StoneOnFloor[i] = false;
                    Know.KnownStones.Remove(i);
                    StonesCarried++;
                    result.StonesPicked++;
                }
        }

        void AddFloorStone(Vector2 at)
        {
            Stones.Add(at);
            StoneOnFloor.Add(true);
            Know.KnownStones.Add(Stones.Count - 1);
        }

        void Recruit()
        {
            foreach (var c in Crew)
                if (c.Mode == CrewMode.Hiding && Vector2.Distance(Player, c.Pos) <= CaveMap.CrewReach)
                {
                    c.Mode = CrewMode.Following;
                    Know.KnownCrew.Remove(c);
                }
        }

        void UpdateCrew(float dt)
        {
            Vector2 leader = Player;
            foreach (var c in Crew)
            {
                if (c.Mode == CrewMode.Hiding)
                {
                    if (Time >= c.NextWhimper)
                    {
                        c.NextWhimper = Time + 15f + (float)Rng.NextDouble() * 15f;
                        Emit(SoundKind.Whimper, c.Pos);
                        if (Vector2.Distance(Player, c.Pos) <= Config.WhimperHearing)
                            Know.KnownCrew.Add(c);
                    }
                    continue;
                }
                if (c.Mode != CrewMode.Following)
                    continue;
                // 一個跟一個，間隔 1 m（FollowTrail.Spacing）。
                Vector2 to = leader - c.Pos;
                float dist = to.Length();
                if (dist > 1f)
                {
                    float speed = (Running ? 4f : 1.5f) * 1.2f;
                    float step = Math.Min(speed * dt, dist - 1f);
                    c.Pos += to / dist * step;
                    c.StepTimer += dt;
                    if (c.StepTimer >= (Running ? 0.35f : 0.6f))
                    {
                        c.StepTimer = 0f;
                        Emit(Running ? SoundKind.Run : SoundKind.Step, c.Pos);
                    }
                }
                else
                    c.StepTimer = 0f;
                leader = c.Pos;
            }
        }

        void UpdatePrayer()
        {
            if (Brain.State != CyclopsState.Pray)
            {
                prayJolt3 = prayJolt6 = false;
                if (Prayer.Ready(Dawn.Elapsed) && Brain.TryPray())
                {
                    Prayer.Done(Dawn.Elapsed);
                    result.Prayers++;
                }
                return;
            }
            // 禱告震動：第 3、6 秒巨石各往回滑 0.05 m。
            if (!prayJolt3 && Brain.StateElapsed >= 3f)
            {
                prayJolt3 = true;
                Slide.Jolt(0.05f);
            }
            if (!prayJolt6 && Brain.StateElapsed >= 6f)
            {
                prayJolt6 = true;
                Slide.Jolt(0.05f);
            }
        }

        void UpdateBoulder(float dt)
        {
            bool braced = AtBoulder && Pushing == PushMode.None && braceThisFrame;
            BoulderNoise n = Slide.Tick(dt, Pushing, false, braced);
            if (n.Grind && !n.Catch)
                Emit(SoundKind.Grind, CaveMap.PushPoint);
            if (n.Heavy || n.Catch)
                Emit(SoundKind.Boulder, CaveMap.PushPoint);
            if (n.Slip)
                Emit(SoundKind.Slip, CaveMap.PushPoint);
        }

        void UpdateProjectiles(float dt)
        {
            for (int i = arrows.Count - 1; i >= 0; i--)
            {
                var a = arrows[i];
                a.Left -= dt;
                if (a.Left <= 0f)
                {
                    Emit(SoundKind.Arrow, a.At);
                    arrows.RemoveAt(i);
                }
                else
                    arrows[i] = a;
            }
            for (int i = 0; i < rocks.Count; i++)
            {
                var r = rocks[i];
                r.Left -= dt;
                rocks[i] = r;
                if (r.Left <= 0f)
                    foreach (var c in Crew)
                        if (c.Mode != CrewMode.Gone && CyclopsBrain.RockHits(r.At, c.Pos))
                            LoseCrew(c);
            }
        }

        void LoseCrew(SimCrew c)
        {
            c.Mode = CrewMode.Gone;
            Know.KnownCrew.Remove(c);
            result.CrewLost++;
        }
    }
}
