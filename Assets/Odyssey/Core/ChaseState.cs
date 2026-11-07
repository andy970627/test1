namespace Odyssey.Core
{
    /// <summary>
    /// 追逐層的判定（規格第 31 節 H）：巨人衝刺、朝玩家的聲音投擲、或剛聽到玩家且很近地查探時進入追逐；
    /// 條件消失後再維持 3 秒才結束，避免心跳閃爍。
    /// </summary>
    public sealed class ChaseState
    {
        public const float CloseEnough = 12f;
        public const float Linger = 3f;
        public const float HeardWindow = 3f;

        private float _linger;

        public bool Chasing { get; private set; }

        public void Update(float dt, CyclopsState state, bool targetIsPlayerSound, float secondsSinceHeardPlayer, float distance, bool charging)
        {
            bool cond = charging
                || (state == CyclopsState.Throw && targetIsPlayerSound)
                || (state == CyclopsState.Investigate && targetIsPlayerSound
                    && secondsSinceHeardPlayer <= HeardWindow && distance <= CloseEnough);

            if (cond)
            {
                Chasing = true;
                _linger = Linger;
                return;
            }

            if (!Chasing)
                return;
            _linger -= dt;
            if (_linger <= 0f)
            {
                Chasing = false;
                _linger = 0f;
            }
        }

        public void Reset()
        {
            Chasing = false;
            _linger = 0f;
        }
    }
}
