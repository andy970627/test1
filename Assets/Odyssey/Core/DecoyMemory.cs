namespace Odyssey.Core
{
    /// <summary>巨人這一夜被箭騙了幾次；騙滿 3 次後，箭的落點只有一半的距離引得動他（規格第 21 節 B）。</summary>
    public sealed class DecoyMemory
    {
        public const int FooledLimit = 3;
        public const float LearnedMultiplier = 0.5f;

        public int Fooled { get; private set; }
        public float ArrowRadiusMultiplier => Fooled >= FooledLimit ? LearnedMultiplier : 1f;

        public void RecordFooled() => Fooled++;

        public void Reset() => Fooled = 0;
    }
}
