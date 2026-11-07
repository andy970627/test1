using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>情境提示的種類（規格第 17 節 C）。</summary>
    public enum HintKind
    {
        Decoy, Guard, PulledWedge, Catch, Heavy, RockWindup, Whimper, CrewEaten,
        Stake, Pail, Pen, Pant, Dawn, Rush, SheepStuck, Prayer, Slip,
        Notch, Footstep, HearingRing, ArrowClutter, FindExit, Brace,
        FirstStone, FairHit, Ambush, FavorRegained, Horse,
    }

    /// <summary>
    /// 情境提示：某件事第一次發生時才講。一次一則、每則 5 秒、整場遊戲每種只講一次；
    /// 排隊等超過 8 秒的已經不合時宜，丟掉且不算講過。暫停（夜晚以外）時不排隊也不前進。
    /// </summary>
    public sealed class HintQueue
    {
        public const float ShowSeconds = 5f;
        public const float MaxWait = 8f;

        readonly HashSet<HintKind> said = new();
        readonly List<(HintKind Kind, float Age)> waiting = new();
        bool paused;

        HintKind? current;

        /// <summary>正在顯示的提示；暫停時為 null。</summary>
        public HintKind? Current => paused ? null : current;

        public float Remaining { get; private set; }

        public void Trigger(HintKind kind)
        {
            if (paused || said.Contains(kind) || current == kind)
                return;
            foreach (var w in waiting)
                if (w.Kind == kind)
                    return;
            waiting.Add((kind, 0f));
        }

        /// <summary>
        /// 換夜：上一夜沒講完、還在排隊的提示都不合時宜了，丟掉；才剛出現不到 1 秒就被打斷的不算講過。
        /// </summary>
        public void NewNight()
        {
            if (current is HintKind cut && ShowSeconds - Remaining < CutGrace)
                said.Remove(cut);
            current = null;
            Remaining = 0f;
            waiting.Clear();
        }

        public const float CutGrace = 1f;

        public void Tick(float dt, bool paused)
        {
            this.paused = paused;
            if (paused)
                return;

            for (int i = waiting.Count - 1; i >= 0; i--)
            {
                float age = waiting[i].Age + dt;
                if (age > MaxWait)
                    waiting.RemoveAt(i);
                else
                    waiting[i] = (waiting[i].Kind, age);
            }

            if (current != null)
            {
                Remaining -= dt;
                if (Remaining <= 0f)
                    current = null;
            }

            if (current == null && waiting.Count > 0)
            {
                current = waiting[0].Kind;
                waiting.RemoveAt(0);
                said.Add(current.Value);
                Remaining = ShowSeconds;
            }
        }
    }
}
