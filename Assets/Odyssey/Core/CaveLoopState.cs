using System;

namespace Odyssey.Core
{
    public enum LoopPhase { Intro, Sneak, Cling, Caught, Escaped, Wiped }

    /// <summary>一輪的狀態機：開場 → 選羊 → 抱緊 → 逃出／被抓。</summary>
    public sealed class CaveLoopState
    {
        readonly CrewRoster roster;

        public LoopPhase Phase { get; private set; } = LoopPhase.Intro;
        public FailReason LastFail { get; private set; }

        public CaveLoopState(CrewRoster roster) => this.roster = roster;

        public void IntroDone() => Move(LoopPhase.Intro, LoopPhase.Sneak);
        public void Grabbed() => Move(LoopPhase.Sneak, LoopPhase.Cling);
        public void Escape() => Move(LoopPhase.Cling, LoopPhase.Escaped);
        public void CaughtDone() => Move(LoopPhase.Caught, LoopPhase.Intro);

        public void Fail(FailReason reason)
        {
            if (Phase != LoopPhase.Sneak && Phase != LoopPhase.Cling)
                throw new InvalidOperationException($"Cannot fail during {Phase}");
            LastFail = reason;
            roster.Eat();
            Phase = roster.Wiped ? LoopPhase.Wiped : LoopPhase.Caught;
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
