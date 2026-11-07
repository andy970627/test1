namespace Odyssey.Core
{
    /// <summary>
    /// 拉弓（規格第 21 節 A）：按住拉、放開射；拉滿 1 秒，不到 0.3 秒放開算取消。
    /// 箭速 = 12 + 18 × 拉弓比例（拉滿 30 m/s）；拉弓中走速 ×0.5。
    /// </summary>
    public sealed class BowDraw
    {
        public const float MinDraw = 0.3f;
        public const float FullDraw = 1f;
        public const float MinSpeed = 12f;
        public const float MaxSpeed = 30f;
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

        /// <summary>放開：回傳箭速；拉不到 0.3 秒或沒在拉就回傳 null（不射、不耗箭）。</summary>
        public float? Release()
        {
            if (!Drawing)
                return null;
            float fraction = Fraction;
            bool enough = held >= MinDraw;
            Cancel();
            return enough ? MinSpeed + (MaxSpeed - MinSpeed) * fraction : null;
        }

        public void Cancel()
        {
            Drawing = false;
            held = 0f;
        }
    }
}
