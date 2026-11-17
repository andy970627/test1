using System;
using System.Collections.Generic;
using System.Numerics;
using Odyssey.Core;

namespace Odyssey.Sim
{
    /// <summary>機器人玩家：只能用 Perception 裡的資訊（看到、聽到的），不能直接讀巨人的狀態。</summary>
    public interface IBot
    {
        string Name { get; }
        string Blurb { get; }
        void NewNight(Night n);
        Intent Decide(Night n);
    }

    /// <summary>原地不動：基準線，看巨人自己會不會找到你、天亮要多久。</summary>
    public sealed class IdleBot : IBot
    {
        public string Name => "不動";
        public string Blurb => "原地不動，什麼都不做（基準線）";
        public void NewNight(Night n) { }
        public Intent Decide(Night n) => default;
    }

    /// <summary>新手：直接走到巨石、一直猛推。</summary>
    public sealed class RusherBot : IBot
    {
        public string Name => "猛衝";
        public string Blurb => "直接走去巨石，一路猛推到開（新手會做的事）";
        public void NewNight(Night n) { }

        public Intent Decide(Night n)
        {
            if (n.Slide.IsOpen)
                return new Intent { MoveTo = CaveMap.GapPoint };
            if (!n.AtBoulder)
                return new Intent { MoveTo = CaveMap.PushPoint };
            return new Intent { Push = PushMode.Heavy };
        }
    }

    /// <summary>
    /// 謹慎：蹲著走、看不清楚就製造聲音、巨人靠近就停住或退開、輕推、楔子、他禱告時猛推、守石時退開等他走。
    /// 可選：用箭把他引開（decoy）、先帶同伴（rescue）。
    /// </summary>
    public sealed class CarefulBot : IBot
    {
        readonly bool decoy, rescue, slingDecoy, slingGiant, oneTrick;
        /// <summary>「一招到底」的固定落點：洞西側（規格第 34 節 E 用來確認巨人會學）。</summary>
        static readonly Vector2 OneTrickSpot = new(-10f, 2f);
        readonly int rescueGoal;
        float lastClap = -999f, lastArrow = -999f;
        float lastWedgeOpening;
        int wedgingFrom = -1;

        public CarefulBot(bool decoy, bool rescue, int rescueGoal = 4, bool slingDecoy = false, bool slingGiant = false, bool oneTrick = false)
        {
            this.decoy = decoy;
            this.rescue = rescue;
            this.slingDecoy = slingDecoy || oneTrick;
            this.oneTrick = oneTrick;
            this.slingGiant = slingGiant;
            this.rescueGoal = rescueGoal;
        }

        public string Name => oneTrick ? "一招到底" : slingGiant ? "正面出手" : slingDecoy ? "彈弓引開" : rescue ? "帶人" : decoy ? "引開" : "謹慎";

        public string Blurb => oneTrick
            ? "「彈弓引開」但石子永遠射向同一個地方（洞西側）：確認巨人會學"
            : slingGiant
            ? "「謹慎」再加上：巨人朝你逼近到 6 m 內時，用彈弓直接打他（宙斯法則判定）"
            : slingDecoy
            ? "「謹慎」再加上：巨人靠近巨石時，用彈弓把石子射到他另一邊引開（不用箭）"
            : rescue
            ? "「引開」再加上：先找最多 4 名同伴再去巨石（前 120 秒）"
            : decoy
                ? "「謹慎」再加上：巨人靠近巨石時射箭到他另一邊引開"
                : "蹲著走、看不清就製造聲音、巨人靠近就停或退、輕推、塞楔子、他禱告時猛推";

        public void NewNight(Night n)
        {
            lastClap = lastArrow = -999f;
            lastWedgeOpening = 0f;
            wedgingFrom = -1;
        }

        public Intent Decide(Night n)
        {
            var k = n.Know;
            float now = n.Time;
            bool fresh = k.Fresh(now);
            float dist = fresh ? Vector2.Distance(n.Player, k.CyclopsPos) : 999f;
            bool approaching = fresh && Vector2.Distance(n.Player, k.CyclopsPos) < Vector2.Distance(n.Player, k.CyclopsPrevPos) - 1e-3f;
            float cyclopsToBoulder = fresh ? Vector2.Distance(k.CyclopsPos, CaveMap.PushPoint) : 999f;

            // 太久沒看到他：製造一次聲音看看四周（最多每 8 秒一次）。
            bool clap = !fresh && now - lastClap >= 8f && k.SinceSeen(now) > 6f;
            if (clap)
                lastClap = now;

            // 他正在禱告：這 8 秒什麼都聽不到，全力猛推或趕路。
            if (k.Praying)
            {
                if (n.Slide.IsOpen)
                    return new Intent { MoveTo = CaveMap.GapPoint, Run = true };
                if (n.AtBoulder)
                    return new Intent { Push = PushMode.Heavy };
                return new Intent { MoveTo = CaveMap.PushPoint, Run = true };
            }

            // 引開：他靠近巨石或靠近你時，把箭射到他另一邊。
            Vector2? shoot = null;
            if (decoy && fresh && n.ArrowsLeft > 0 && now - lastArrow >= 6f && (cyclopsToBoulder < 6f || dist < 6f))
            {
                Vector2 away = k.CyclopsPos - n.Player;
                if (away.LengthSquared() < 1e-4f)
                    away = new Vector2(1f, 0f);
                shoot = CaveMap.Clamp(k.CyclopsPos + Vector2.Normalize(away) * 6f + new Vector2(0f, -3f));
                lastArrow = now;
            }

            // 彈弓引開：同箭的時機，但用石子（石子也是楔子，留一顆）。
            Vector2? sling = null;
            if (slingDecoy && fresh && n.StonesCarried > 1 && now - lastArrow >= 6f && (cyclopsToBoulder < 6f || dist < 6f))
            {
                Vector2 away = k.CyclopsPos - n.Player;
                if (away.LengthSquared() < 1e-4f)
                    away = new Vector2(1f, 0f);
                sling = oneTrick ? OneTrickSpot : CaveMap.Clamp(k.CyclopsPos + Vector2.Normalize(away) * 6f + new Vector2(0f, -3f));
                lastArrow = now;
            }
            // 正面出手：他朝你逼近時直接打他。
            bool slingGiantNow = slingGiant && fresh && approaching && dist < 6f && n.StonesCarried > 0 && now - lastArrow >= 3f;
            if (slingGiantNow)
                lastArrow = now;
            if (sling.HasValue || slingGiantNow)
                return new Intent { SlingAt = sling, SlingAtGiant = slingGiantNow, Brace = n.AtBoulder };

            // 太近了：退開（離他遠一點的方向）。
            if (fresh && dist < 3f && approaching)
                return new Intent { MoveTo = Away(n.Player, k.CyclopsPos, 3f), Clap = false, ShootAt = shoot };
            // 他朝你過來：停住不出聲。
            if (fresh && dist < 7f && approaching)
                return new Intent { Brace = n.AtBoulder, ShootAt = shoot };

            if (n.Slide.IsOpen)
                return new Intent { MoveTo = CaveMap.GapPoint, Clap = clap, ShootAt = shoot };

            // 先帶同伴。
            if (rescue && now < 120f && CountFollowers(n) < rescueGoal)
            {
                SimCrew target = Nearest(n, k.KnownCrew);
                if (target != null)
                    return new Intent { MoveTo = target.Pos, Clap = clap, ShootAt = shoot };
                if (now < 60f)
                {
                    // 找人時多製造聲音（每 5 秒），照出躲著的同伴。
                    bool look = clap || now - lastClap >= 5f;
                    if (look)
                        lastClap = now;
                    return new Intent { MoveTo = Wander(n), Clap = look, ShootAt = shoot };
                }
            }

            // 順路撿石子。
            int stone = NearestStone(n, 5f);
            if (stone >= 0 && n.StonesCarried < Night.MaxStones)
                return new Intent { MoveTo = n.Stones[stone], Clap = clap, ShootAt = shoot };

            if (!n.AtBoulder)
            {
                // 他守在巨石邊：離遠一點等。
                if (cyclopsToBoulder < 4f)
                    return new Intent { MoveTo = Away(CaveMap.PushPoint, k.CyclopsPos, 7f) - new Vector2(0f, 2f), Clap = clap, ShootAt = shoot };
                return new Intent { MoveTo = CaveMap.PushPoint, Clap = clap, ShootAt = shoot };
            }

            // 在巨石前。
            if (cyclopsToBoulder < 4f)
                return new Intent { MoveTo = Away(n.Player, k.CyclopsPos, 4f), ShootAt = shoot };
            if (fresh && dist < 9f)
                return new Intent { Brace = true, ShootAt = shoot };
            // 塞楔子要按住 0.6 秒：一直按到身上的石子少一顆為止。
            if (wedgingFrom >= 0 && n.StonesCarried < wedgingFrom)
            {
                wedgingFrom = -1;
                lastWedgeOpening = n.Slide.Opening;
            }
            if (wedgingFrom < 0 && n.StonesCarried > 0 && n.Slide.Opening - lastWedgeOpening >= 0.25f)
                wedgingFrom = n.StonesCarried;
            if (wedgingFrom >= 0)
                return new Intent { Wedge = true, ShootAt = shoot };
            return new Intent { Push = PushMode.Light, Clap = clap, ShootAt = shoot };
        }

        static int CountFollowers(Night n)
        {
            int c = 0;
            foreach (var _ in n.Followers())
                c++;
            return c;
        }

        static SimCrew Nearest(Night n, IEnumerable<SimCrew> crew)
        {
            SimCrew best = null;
            float bestD = float.MaxValue;
            foreach (var c in crew)
            {
                if (c.Mode != CrewMode.Hiding)
                    continue;
                float d = Vector2.Distance(n.Player, c.Pos);
                if (d < bestD)
                {
                    bestD = d;
                    best = c;
                }
            }
            return best;
        }

        static int NearestStone(Night n, float within)
        {
            int best = -1;
            float bestD = within;
            foreach (int i in n.Know.KnownStones)
            {
                if (!n.StoneOnFloor[i])
                    continue;
                float d = Vector2.Distance(n.Player, n.Stones[i]);
                if (d < bestD)
                {
                    bestD = d;
                    best = i;
                }
            }
            return best;
        }

        static Vector2 Away(Vector2 from, Vector2 threat, float meters)
        {
            Vector2 dir = from - threat;
            if (dir.LengthSquared() < 1e-4f)
                dir = new Vector2(-1f, 0f);
            return CaveMap.Clamp(from + Vector2.Normalize(dir) * meters);
        }

        // 找同伴時在洞的中間一帶繞，讓嗚咽聽得到。
        static Vector2 Wander(Night n) => n.Time < 30f ? new Vector2(-6f, 1f) : new Vector2(1f, -2f);
    }
}
