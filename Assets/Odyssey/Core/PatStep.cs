namespace Odyssey.Core
{
    /// <summary>Back＝摸羊背；Telegraph＝手移到某一側（預兆，不判定）；Side＝沿該側摸到羊肚。</summary>
    public enum PatKind { Back, Telegraph, Side }

    public readonly struct PatStep
    {
        public readonly PatKind Kind;
        public readonly Side Side;
        public readonly float Duration;

        public PatStep(PatKind kind, Side side, float duration)
        {
            Kind = kind;
            Side = side;
            Duration = duration;
        }
    }
}
