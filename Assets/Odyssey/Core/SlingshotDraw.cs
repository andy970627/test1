namespace Odyssey.Core
{
    /// <summary>彈弓放開的結果：None＝沒在拉；SnapOnly＝只有空扣的「啪」（不耗石子）；Stone＝射出石子。</summary>
    public enum SlingshotShotKind { None, SnapOnly, Stone }

    /// <summary>一次放開的結果；Speed 只在 Kind 為 Stone 時有意義（其餘為 0）。</summary>
    public readonly struct SlingshotShot
    {
        public readonly SlingshotShotKind Kind;
        public readonly float Speed;

        public SlingshotShot(SlingshotShotKind kind, float speed)
        {
            Kind = kind;
            Speed = speed;
        }
    }

    /// <summary>
    /// 彈弓（規格第 31 節 A）：按住拉、放開射；拉滿 0.8 秒，不到 0.3 秒放開只有空扣的聲音（製造聲音）。
    /// 石速 = 10 + 14 × 拉的比例（拉滿 24 m/s）；拉彈弓中走速 ×0.5。
    /// </summary>
    public sealed class SlingshotDraw
    {
        public const float TapSeconds = 0.3f;
        public const float FullDraw = 0.8f;
        public const float MinSpeed = 10f;
        public const float MaxSpeed = 24f;
        public const float DrawWalkMultiplier = 0.5f;

        float held;

        public bool Drawing { get; private set; }
        public float Fraction => Drawing ? System.Math.Min(held / FullDraw, 1f) : 0f;
        public float WalkMultiplier => Drawing ? DrawWalkMultiplier : 1f;

        public void Begin()
        {
            Drawing = true;
            held = 0f;
        }

        public void Tick(float dt)
        {
            if (Drawing)
                held += dt;
        }

        /// <summary>放開：沒在拉回傳 None；拉不到 0.3 秒或沒有石子回傳 SnapOnly；否則射出石子並帶石速。放開後一律重置。</summary>
        public SlingshotShot Release(bool hasStone)
        {
            if (!Drawing)
                return new SlingshotShot(SlingshotShotKind.None, 0f);
            float fraction = Fraction;
            bool enough = held >= TapSeconds;
            Cancel();
            if (!enough || !hasStone)
                return new SlingshotShot(SlingshotShotKind.SnapOnly, 0f);
            return new SlingshotShot(SlingshotShotKind.Stone, MinSpeed + (MaxSpeed - MinSpeed) * fraction);
        }

        public void Cancel()
        {
            Drawing = false;
            held = 0f;
        }
    }
}
