using System;
using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>Listen＝原地聆聽；Investigate＝走向聲音；Search＝雙手掃摸；Guard＝聽到巨石，跑回洞口。</summary>
    public enum CyclopsState { Listen, Investigate, Search, Guard }

    /// <summary>瞎眼的波呂斐摩斯：只靠聲音找人。位置都是平面座標（X＝世界 x，Y＝世界 z）。</summary>
    public sealed class CyclopsBrain
    {
        public const float WalkSpeed = 2.5f;
        public const float RunSpeed = 4f;
        public const float ArriveDistance = 0.5f;
        public const float SearchSeconds = 3f;
        public const float GuardSearchSeconds = 6f;
        public const float SearchRadius = 1.5f;
        public const float BumpDistance = 1f;


        readonly DecoyMemory memory;
        float targetLoudness;
        SoundKind targetKind;
        bool guarding;
        float searchDuration;

        public CyclopsState State { get; private set; }
        public Vector2 Position { get; private set; }
        public Vector2 Target { get; private set; }
        public float StateElapsed { get; private set; }
        public bool IsMoving => State == CyclopsState.Investigate || State == CyclopsState.Guard;

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
                SetTarget(e.Position, e); // 巨石推開後位置會移動，跑向聲音實際發出的地方。
                Enter(CyclopsState.Guard);
                return;
            }
            if (guarding)
                return;

            if (State == CyclopsState.Investigate && e.Loudness <= targetLoudness)
                return;
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
                if (distance > 1e-6f)
                    Position += toTarget / distance * Math.Min(speed * dt, distance);
                if (Vector2.Distance(Position, Target) <= ArriveDistance)
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
                {
                    if (!guarding && targetKind == SoundKind.Stone)
                        memory.RecordFooled();
                    guarding = false;
                    Enter(CyclopsState.Listen);
                }
            }
            return FailReason.None;
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
