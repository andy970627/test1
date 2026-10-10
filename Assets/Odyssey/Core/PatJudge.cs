namespace Odyssey.Core
{
    /// <summary>依巨人目前的摸羊步驟判定玩家是否被發現。</summary>
    public static class PatJudge
    {
        public const float BackHearingThreshold = 0.2f;

        /// <summary>手剛落到羊背上的這段時間不判定，讓玩家來得及憋氣。</summary>
        public const float BackGraceSeconds = 0.4f;

        public static FailReason Evaluate(PatStep step, ClingModel model) => Evaluate(step, float.MaxValue, model);

        public static FailReason Evaluate(PatStep step, float stepElapsed, ClingModel model)
        {
            if (step.Kind == PatKind.Back && stepElapsed >= BackGraceSeconds && model.Noise > BackHearingThreshold)
                return FailReason.Gasped;
            if (step.Kind == PatKind.Side && model.Lean == step.Side)
                return FailReason.Touched;
            return FailReason.None;
        }
    }
}
