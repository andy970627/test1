namespace Odyssey.Core
{
    /// <summary>依巨人目前的摸羊步驟判定玩家是否被發現。</summary>
    public static class PatJudge
    {
        public const float BackHearingThreshold = 0.2f;

        public static FailReason Evaluate(PatStep step, ClingModel model)
        {
            if (step.Kind == PatKind.Back && model.Noise > BackHearingThreshold)
                return FailReason.Gasped;
            if (step.Kind == PatKind.Side && model.Lean == step.Side)
                return FailReason.Touched;
            return FailReason.None;
        }
    }
}
