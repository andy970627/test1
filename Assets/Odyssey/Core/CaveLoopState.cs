using System;

namespace Odyssey.Core
{
    public enum LoopPhase { Intro, Night, Caught, Escaped, Wiped }

    /// <summary>被抓那一輪的夜數與當時剩下的同伴（被吃之前）。</summary>
    public readonly struct RoundRecord
    {
        public readonly int Night;
        public readonly int Crew;

        public RoundRecord(int night, int crew)
        {
            Night = night;
            Crew = crew;
        }
    }

    /// <summary>一夜的狀態機：開場 → 夜晚 → 逃出／被抓。</summary>
    public sealed class CaveLoopState
    {
        readonly CrewRoster roster;

        public LoopPhase Phase { get; private set; } = LoopPhase.Intro;
        public FailReason LastFail { get; private set; }

        public CaveLoopState(CrewRoster roster) => this.roster = roster;

        public void IntroDone() => Move(LoopPhase.Intro, LoopPhase.Night);
        public void Escape() => Move(LoopPhase.Night, LoopPhase.Escaped);
        public void CaughtDone() => Move(LoopPhase.Caught, LoopPhase.Intro);

        public RoundRecord Fail(FailReason reason)
        {
            if (Phase != LoopPhase.Night)
                throw new InvalidOperationException($"Cannot fail during {Phase}");
            var record = new RoundRecord(roster.Night, roster.Remaining);
            LastFail = reason;
            roster.Eat();
            Phase = roster.Wiped ? LoopPhase.Wiped : LoopPhase.Caught;
            return record;
        }

        public void Restart()
        {
            roster.Reset();
            LastFail = FailReason.None;
            Phase = LoopPhase.Intro;
        }

        void Move(LoopPhase from, LoopPhase to)
        {
            if (Phase != from)
                throw new InvalidOperationException($"Expected {from} but was {Phase}");
            Phase = to;
        }
    }
}
