namespace Odyssey.Core
{
    /// <summary>巨人這一夜被石子騙了幾次；騙滿 3 次後，石子只有一半的距離引得動他。</summary>
    public sealed class DecoyMemory
    {
        public const int FooledLimit = 3;
        public const float LearnedMultiplier = 0.5f;

        public int Fooled { get; private set; }
        public float StoneRadiusMultiplier => Fooled >= FooledLimit ? LearnedMultiplier : 1f;

        public void RecordFooled() => Fooled++;

        public void Reset() => Fooled = 0;
    }
}
