using System;
using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>Listen＝原地聆聽；Investigate＝走向聲音；Search＝雙手掃摸；Guard＝聽到巨石，跑回洞口。</summary>
    public enum CyclopsState { Listen, Investigate, Search, Guard }

    /// <summary>
    /// 瞎眼的波呂斐摩斯：只靠聲音找人。位置都是平面座標（X＝世界 x，Y＝世界 z）。
    /// 聽過推巨石之後，他會守在巨石旁不走：只查看巨石附近的聲音，查完就走回去；
    /// 只有石子或羊叫能把他引開。
    /// </summary>
    public sealed class CyclopsBrain
    {
        public const float WalkSpeed = 3.5f;
        public const float RunSpeed = 5f;
        public const float ArriveDistance = 0.5f;
        public const float SearchSeconds = 3f;
        public const float GuardSearchSeconds = 6f;
        public const float SearchRadius = 2f;
        public const float BumpDistance = 1f;

        /// <summary>守著巨石時，只查看離巨石這麼近的聲音。</summary>
        public const float HoldLeash = 4f;

        readonly DecoyMemory memory;
        float targetLoudness;
        SoundKind targetKind;
        bool guarding;
        bool returning;
        float searchDuration;
        Vector2 holdPoint;

        public CyclopsState State { get; private set; }
        public Vector2 Position { get; private set; }
        public Vector2 Target { get; private set; }
        public float StateElapsed { get; private set; }
        public bool IsMoving => State == CyclopsState.Investigate || State == CyclopsState.Guard;

        /// <summary>正守著巨石（只有石子或羊叫能引開）。</summary>
        public bool HoldingBoulder { get; private set; }

        public CyclopsBrain(Vector2 start, DecoyMemory memory)
        {
            this.memory = memory;
            Reset(start);
        }

        public void Reset(Vector2 start)
        {
            Position = start;
            Target = start;
            guarding = false;
            returning = false;
            HoldingBoulder = false;
            Enter(CyclopsState.Listen);
        }

        public void Hear(SoundEvent e)
        {
            float multiplier = e.Kind == SoundKind.Stone ? memory.StoneRadiusMultiplier : 1f;
            if (!SoundRules.CanHear(e, Position, multiplier))
                return;

            if (e.Kind == SoundKind.Boulder)
            {
                guarding = true;
                returning = false;
                holdPoint = e.Position; // 巨石推開後位置會移動，跑向聲音實際發出的地方。
                SetTarget(e.Position, e);
                Enter(CyclopsState.Guard);
                return;
            }
            if (guarding)
                return;

            bool lure = e.Kind == SoundKind.Stone || e.Kind == SoundKind.Bleat;
            if (HoldingBoulder && !lure && Vector2.Distance(e.Position, holdPoint) > HoldLeash)
                return;
            if (State == CyclopsState.Investigate && !returning && e.Loudness <= targetLoudness)
                return;

            if (lure)
                HoldingBoulder = false;
            returning = false;
            SetTarget(e.Position, e);
            Enter(CyclopsState.Investigate);
        }

        /// <summary>推進時間並判斷是否抓到玩家；碰撞優先於摸到。</summary>
        public FailReason Tick(float dt, Vector2 player)
        {
            if (Vector2.Distance(player, Position) <= BumpDistance)
                return FailReason.Bumped;

            StateElapsed += dt;
            if (IsMoving)
            {
                float speed = State == CyclopsState.Guard ? RunSpeed : WalkSpeed;
                Vector2 toTarget = Target - Position;
                float distance = toTarget.Length();
                float step = Math.Min(speed * dt, distance);
                if (distance > 1e-6f)
                    Position += toTarget / distance * step;
                if (returning && distance - step <= 1e-4f)
                {
                    Position = Target;
                    returning = false;
                    Enter(CyclopsState.Listen);
                }
                else if (!returning && Vector2.Distance(Position, Target) <= ArriveDistance)
                {
                    searchDuration = State == CyclopsState.Guard ? GuardSearchSeconds : SearchSeconds;
                    Enter(CyclopsState.Search);
                }
            }

            if (State == CyclopsState.Search)
            {
                if (Vector2.Distance(player, Position) <= SearchRadius)
                    return FailReason.Touched;
                if (StateElapsed >= searchDuration)
                    EndSearch();
            }
            return FailReason.None;
        }

        void EndSearch()
        {
            if (guarding)
            {
                guarding = false;
                HoldingBoulder = true;
                Enter(CyclopsState.Listen);
                return;
            }
            if (targetKind == SoundKind.Stone)
                memory.RecordFooled();
            if (HoldingBoulder)
            {
                // 查完巨石附近的聲音，走回巨石旁繼續守。
                returning = true;
                Target = holdPoint;
                targetLoudness = 0f;
                Enter(CyclopsState.Investigate);
                return;
            }
            Enter(CyclopsState.Listen);
        }

        void SetTarget(Vector2 target, SoundEvent e)
        {
            Target = target;
            targetLoudness = e.Loudness;
            targetKind = e.Kind;
        }

        void Enter(CyclopsState state)
        {
            State = state;
            StateElapsed = 0f;
        }
    }
}
