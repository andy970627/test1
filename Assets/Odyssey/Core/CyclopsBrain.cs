using System;
using System.Collections.Generic;
using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>
    /// Listen＝原地聆聽；Investigate＝走向聲音（或遊走、走回巨石）；Search＝雙手掃摸；Guard＝聽到巨石，跑回洞口；
    /// Throw＝蓄力朝遠處的聲音丟岩石；Eat＝吃掉摸到的同伴；Pray＝向父親波塞頓禱告（聽不到、不動）；
    /// Stagger＝被石頭或箭打到的僵直（不動、聽不到），結束後去查來襲的方向。
    /// </summary>
    public enum CyclopsState { Listen, Investigate, Search, Guard, Throw, Eat, Pray, Stagger }

    /// <summary>巨人這一幀的結果。</summary>
    public readonly struct CyclopsTick
    {
        public readonly FailReason Player;
        /// <summary>這一幀吃掉的同伴 index；沒有為 −1。</summary>
        public readonly int EatenCrew;
        /// <summary>蓄力結束、岩石出手的那一幀為 true。</summary>
        public readonly bool RockReleased;
        public readonly Vector2 RockTarget;
        /// <summary>守石摸索完整結束的那一幀為 true：拔掉一顆楔子。</summary>
        public readonly bool PullWedge;

        public CyclopsTick(FailReason player, int eatenCrew, bool rockReleased, Vector2 rockTarget, bool pullWedge)
        {
            Player = player;
            EatenCrew = eatenCrew;
            RockReleased = rockReleased;
            RockTarget = rockTarget;
            PullWedge = pullWedge;
        }
    }

    /// <summary>
    /// 瞎眼的波呂斐摩斯：只靠聲音找人。位置都是平面座標（X＝世界 x，Y＝世界 z）。
    /// 聽到巨石的聲音就跑回去守；守著的時候巨石 4 m 內的聲音他會接著追，追完走回巨石；
    /// 只有石子或羊叫能把他引開。守石摸索摸完會拔掉一顆楔子，最多守 15 秒。
    /// 遠處（8 m 外）的聲音他有時會直接扔岩石過去。
    /// </summary>
    public sealed class CyclopsBrain
    {
        public const float WalkSpeed = 3.5f;
        public const float RunSpeed = 5f;
        public const float ArriveDistance = 0.5f;
        public const float SearchSeconds = 2f;
        public const float GuardSearchSeconds = 4f;
        public const float SearchRadius = 2f;
        public const float BumpDistance = 1f;

        /// <summary>守著巨石時，只追離巨石這麼近的聲音。</summary>
        public const float HoldLeash = 4f;
        public const float HoldSeconds = 15f;
        public const float WanderAfter = 5f;
        public const float WanderRadius = 6f;

        public const float ThrowMinDistance = 8f;
        public const float ThrowChance = 0.35f;
        public const float ThrowCooldown = 10f;
        public const float WindupSeconds = 1.2f;
        public const float FlightSeconds = 1f;
        public const float ImpactRadius = 1.5f;
        public const float Scatter = 1f;
        public const float EatSeconds = 5f;
        public const float PraySeconds = 8f;
        /// <summary>僵直秒數（被打到之後）。</summary>
        public const float StaggerSeconds = 2.5f;
        /// <summary>宙斯雷鳴後衝鋒的速度倍率（只用在走向目標時）。</summary>
        public const float ChargeMultiplier = 1.3f;
        /// <summary>衝刺目標的「聲量」：比箭、石子、腳步都大，只有巨石的聲音會改變他。</summary>
        const float ChargeHoldLoudness = 1f;

        readonly DecoyMemory memory;
        readonly Func<double> roll;
        float targetLoudness;
        SoundKind targetKind;
        float searchDuration;
        Vector2 holdPoint;
        Vector2 rockTarget;
        float holdElapsed;

        // guarding＝聽到巨石後、守石摸索結束前（跑回去或摸索中）。
        bool guarding;
        // chasingNearBoulder＝守石期間去追巨石附近的聲音，摸完要走回巨石。
        bool chasingNearBoulder;
        bool returning;
        bool wandering;
        Vector2 staggerFrom;

        public CyclopsState State { get; private set; }
        public Vector2 Position { get; private set; }
        public Vector2 Target { get; private set; }
        public float StateElapsed { get; private set; }
        public bool IsMoving => State == CyclopsState.Investigate || State == CyclopsState.Guard;
        public float ThrowCooldownLeft { get; private set; }

        /// <summary>距離上次「聽見」玩家發出的聲音幾秒（宙斯法則用）；即使他沒理會那個聲音也會歸零。</summary>
        public float SecondsSinceHeardPlayer { get; private set; } = 999f;

        /// <summary>目前的目標是不是來自玩家的聲音（遊走、走回巨石為 false；衝鋒為 true）。</summary>
        public bool TargetIsPlayerSound { get; private set; }

        /// <summary>宙斯雷鳴後的衝鋒中：走向目標與摸索期間為 true，摸索結束或換目標就清掉。</summary>
        public bool Charging { get; private set; }

        /// <summary>守住巨石中（摸完巨石之後到 15 秒或被引開為止）。</summary>
        public bool HoldingBoulder { get; private set; }

        bool OnGuard => guarding || HoldingBoulder || chasingNearBoulder;

        /// <summary>難度：乘在移動速度與聽覺半徑上（規格第 18 節）。</summary>
        public DifficultyLevel Level { get; set; } = DifficultyLevel.Normal;

        /// <summary>這種聲音的聽覺半徑倍率：難度 × 石子學習（回聲畫聽覺邊也用這個）。</summary>
        public float HearingMultiplierFor(SoundKind kind) =>
            (kind == SoundKind.Arrow ? memory.ArrowRadiusMultiplier : 1f) * Difficulty.HearingMultiplier(Level);

        /// <summary>
        /// 開始向父親波塞頓禱告（規格第 20 節 B）：停下、什麼都聽不到，8 秒後回到聆聽。
        /// 守石、蓄力、吃人、已在禱告時不行（回傳 false，等一下再試）。
        /// </summary>
        public bool TryPray()
        {
            if (State is CyclopsState.Guard or CyclopsState.Throw or CyclopsState.Eat or CyclopsState.Pray or CyclopsState.Stagger || OnGuard)
                return false;
            wandering = false;
            Enter(CyclopsState.Pray);
            return true;
        }

        /// <summary>被打到：停下僵直，取消丟石、守石、禱告與遊走；結束後以普通速度去查 hitFrom。</summary>
        public void Stagger(Vector2 hitFrom)
        {
            EndGuard();
            wandering = false;
            Charging = false;
            staggerFrom = hitFrom;
            Enter(CyclopsState.Stagger);
        }

        /// <summary>宙斯雷鳴後：結束守石，以 1.3 倍速度衝向 at，到了照常摸索。</summary>
        public void Charge(Vector2 at)
        {
            EndGuard();
            wandering = false;
            Target = at;
            // 衝刺中只有比一切都響的聲音（巨石，走守石那條路）能改變目標；打中時落在他腳邊的箭與石子不會取消衝刺。
            targetLoudness = ChargeHoldLoudness;
            targetKind = SoundKind.Step;
            TargetIsPlayerSound = true;
            Charging = true;
            Enter(CyclopsState.Investigate);
        }

        public CyclopsBrain(Vector2 start, DecoyMemory memory, Func<double> roll)
        {
            this.memory = memory;
            this.roll = roll;
            Reset(start);
        }

        public void Reset(Vector2 start)
        {
            Position = start;
            Target = start;
            EndGuard();
            wandering = false;
            Charging = false;
            TargetIsPlayerSound = false;
            SecondsSinceHeardPlayer = 999f;
            ThrowCooldownLeft = 0f;
            Enter(CyclopsState.Listen);
        }

        public static bool RockHits(Vector2 landing, Vector2 p) => Vector2.Distance(landing, p) <= ImpactRadius + 1e-4f;

        public void Hear(SoundEvent e)
        {
            // 禱告中什麼都聽不到（禱告聲蓋過一切）。
            // 僵直中同樣什麼都聽不到。
            if (State == CyclopsState.Pray || State == CyclopsState.Stagger)
                return;
            if (!SoundRules.CanHear(e, Position, HearingMultiplierFor(e.Kind)))
                return;
            if (RevealsPlayer(e.Kind))
                SecondsSinceHeardPlayer = 0f;

            // 巨石自己往回滑（Slip）時，已經守在旁邊的巨人不必重新摸一次：只記下巨石現在的位置。
            if (e.Kind == SoundKind.Slip && (guarding || HoldingBoulder) && Vector2.Distance(e.Position, holdPoint) <= HoldLeash)
            {
                holdPoint = e.Position;
                if (State == CyclopsState.Guard)
                    Target = e.Position;
                return;
            }
            if (SoundRules.IsBoulder(e.Kind))
            {
                // 巨石推開後位置會移動，跑向聲音實際發出的地方。
                guarding = true;
                HoldingBoulder = false;
                chasingNearBoulder = false;
                returning = false;
                wandering = false;
                holdPoint = e.Position;
                SetTarget(e.Position, e);
                Enter(CyclopsState.Guard);
                return;
            }
            if (State == CyclopsState.Throw || State == CyclopsState.Eat)
                return;

            bool lure = e.Kind == SoundKind.Arrow || e.Kind == SoundKind.Stone || e.Kind == SoundKind.Bleat;
            if (OnGuard)
            {
                if (lure)
                {
                    if (TryThrow(e))
                        return;
                    EndGuard();
                    Investigate(e);
                    return;
                }
                if (Vector2.Distance(e.Position, holdPoint) <= HoldLeash)
                {
                    if (chasingNearBoulder && State == CyclopsState.Investigate && !returning && e.Loudness <= targetLoudness)
                        return;
                    // 守石摸索被打斷就不算摸完，不拔楔子。
                    guarding = false;
                    chasingNearBoulder = true;
                    returning = false;
                    SetTarget(e.Position, e);
                    Enter(CyclopsState.Investigate);
                    return;
                }
                TryThrow(e);
                return;
            }

            if (TryThrow(e))
                return;
            if (State == CyclopsState.Investigate && !wandering && e.Loudness <= targetLoudness)
                return;
            Investigate(e);
        }

        /// <summary>推進時間並判斷是否抓到玩家或同伴；碰撞優先於摸到，玩家優先於同伴。</summary>
        public CyclopsTick Tick(float dt, Vector2 player, IReadOnlyList<Vector2> crew = null)
        {
            SecondsSinceHeardPlayer += dt;
            if (Vector2.Distance(player, Position) <= BumpDistance)
                return new CyclopsTick(FailReason.Bumped, -1, false, default, false);

            StateElapsed += dt;
            ThrowCooldownLeft = Math.Max(0f, ThrowCooldownLeft - dt);
            if (HoldingBoulder)
            {
                holdElapsed += dt;
                if (holdElapsed >= HoldSeconds)
                {
                    bool wasReturning = returning;
                    EndGuard();
                    if (wasReturning)
                        Enter(CyclopsState.Listen);
                }
            }

            bool released = false;
            bool pull = false;
            switch (State)
            {
                case CyclopsState.Throw:
                    if (StateElapsed >= WindupSeconds)
                    {
                        released = true;
                        ResumeAfterPause();
                    }
                    break;
                case CyclopsState.Eat:
                    if (StateElapsed >= EatSeconds)
                        ResumeAfterPause();
                    break;
                case CyclopsState.Pray:
                    if (StateElapsed >= PraySeconds)
                        Enter(CyclopsState.Listen);
                    break;
                case CyclopsState.Stagger:
                    if (StateElapsed >= StaggerSeconds)
                    {
                        Target = staggerFrom;
                        targetLoudness = 0f;
                        targetKind = SoundKind.Step;
                        TargetIsPlayerSound = true;
                        // 被打中的那一下他已經知道你在哪：之後追過來時再打他，仍算正面出手。
                        SecondsSinceHeardPlayer = 0f;
                        Enter(CyclopsState.Investigate);
                    }
                    break;
                case CyclopsState.Listen:
                    if (!OnGuard && StateElapsed >= WanderAfter)
                        Wander();
                    break;
                case CyclopsState.Investigate:
                case CyclopsState.Guard:
                    Move(dt);
                    break;
            }

            if (State == CyclopsState.Search)
            {
                if (Vector2.Distance(player, Position) <= SearchRadius)
                    return new CyclopsTick(FailReason.Touched, -1, false, default, false);
                if (StateElapsed >= searchDuration)
                    pull = EndSearch();
            }

            int eaten = -1;
            if (crew != null && State != CyclopsState.Eat && State != CyclopsState.Stagger)
                for (int i = 0; i < crew.Count; i++)
                {
                    float d = Vector2.Distance(crew[i], Position);
                    if (d <= BumpDistance || (State == CyclopsState.Search && d <= SearchRadius))
                    {
                        if (State == CyclopsState.Throw)
                            ThrowCooldownLeft = 0f;
                        eaten = i;
                        Enter(CyclopsState.Eat);
                        break;
                    }
                }

            return new CyclopsTick(FailReason.None, eaten, released, rockTarget, pull);
        }

        void Move(float dt)
        {
            float speed = (State == CyclopsState.Guard ? RunSpeed : WalkSpeed) * Difficulty.SpeedMultiplier(Level)
                * (Charging && State == CyclopsState.Investigate ? ChargeMultiplier : 1f);
            Vector2 toTarget = Target - Position;
            float distance = toTarget.Length();
            float step = Math.Min(speed * dt, distance);
            if (distance > 1e-6f)
                Position += toTarget / distance * step;

            if (returning)
            {
                if (distance - step > 1e-4f)
                    return;
                Position = Target;
                returning = false;
                ArriveAtBoulder();
                return;
            }
            if (Vector2.Distance(Position, Target) > ArriveDistance)
                return;
            if (wandering)
            {
                // 遊走到了不摸索，直接再聽。
                wandering = false;
                Enter(CyclopsState.Listen);
                return;
            }
            searchDuration = State == CyclopsState.Guard ? GuardSearchSeconds : SearchSeconds;
            Enter(CyclopsState.Search);
        }

        /// <summary>摸索結束；回傳是否該拔楔子（守石摸索完整摸完）。</summary>
        bool EndSearch()
        {
            Charging = false;
            if (guarding)
            {
                guarding = false;
                HoldingBoulder = true;
                holdElapsed = 0f;
                Enter(CyclopsState.Listen);
                return true;
            }
            if (targetKind == SoundKind.Arrow)
                memory.RecordFooled();
            if (chasingNearBoulder)
            {
                WalkBackToBoulder();
                return false;
            }
            Enter(CyclopsState.Listen);
            return false;
        }

        /// <summary>丟完岩石或吃完同伴：原本在守石就繼續守，否則回到聆聽。</summary>
        void ResumeAfterPause()
        {
            if (guarding)
            {
                Target = holdPoint;
                Enter(CyclopsState.Guard);
            }
            else if (OnGuard && Vector2.Distance(Position, holdPoint) > ArriveDistance)
                WalkBackToBoulder();
            else if (OnGuard)
                ArriveAtBoulder();
            else
                Enter(CyclopsState.Listen);
        }

        void WalkBackToBoulder()
        {
            returning = true;
            Target = holdPoint;
            targetLoudness = 0f;
            TargetIsPlayerSound = false;
            Enter(CyclopsState.Investigate);
        }

        void ArriveAtBoulder()
        {
            chasingNearBoulder = false;
            if (!HoldingBoulder)
            {
                // 守石摸索被打斷過：回到巨石旁就開始守，從現在起算 15 秒。
                HoldingBoulder = true;
                holdElapsed = 0f;
            }
            Enter(CyclopsState.Listen);
        }

        bool TryThrow(SoundEvent e)
        {
            if (ThrowCooldownLeft > 0f || Vector2.Distance(e.Position, Position) <= ThrowMinDistance)
                return false;
            if (roll() >= ThrowChance)
                return false;
            float dx = (float)(roll() * 2 - 1) * Scatter;
            float dy = (float)(roll() * 2 - 1) * Scatter;
            rockTarget = e.Position + new Vector2(dx, dy);
            ThrowCooldownLeft = ThrowCooldown;
            returning = false;
            wandering = false;
            Enter(CyclopsState.Throw);
            return true;
        }

        void Wander()
        {
            double angle = roll() * 2 * Math.PI;
            float radius = (float)roll() * WanderRadius;
            Target = Position + new Vector2((float)Math.Cos(angle), (float)Math.Sin(angle)) * radius;
            targetLoudness = 0f;
            wandering = true;
            TargetIsPlayerSound = false;
            Enter(CyclopsState.Investigate);
        }

        void Investigate(SoundEvent e)
        {
            returning = false;
            wandering = false;
            SetTarget(e.Position, e);
            Enter(CyclopsState.Investigate);
        }

        void EndGuard()
        {
            guarding = false;
            HoldingBoulder = false;
            chasingNearBoulder = false;
            returning = false;
            holdElapsed = 0f;
        }

        void SetTarget(Vector2 target, SoundEvent e)
        {
            Target = target;
            targetLoudness = e.Loudness;
            targetKind = e.Kind;
            TargetIsPlayerSound = SoundRules.Source(e.Kind) == SoundSource.Player && !IsLure(e.Kind);
            Charging = false;
        }

        /// <summary>石子、箭、奶桶、乳酪：落點在別處的誘餌，不是你所在的位置。</summary>
        static bool IsLure(SoundKind kind) =>
            kind is SoundKind.Stone or SoundKind.Arrow or SoundKind.Clatter or SoundKind.Cheese;

        /// <summary>
        /// 這個聲音算不算「聽見你」（宙斯法則的 3 秒）：玩家這邊的聲音，但不含誘餌的落點、
        /// 巨石自己往回滑（Slip），以及彈弓出手的「啪」（規格第 31 節 C1：要先彈一下讓他聽見，再出手）。
        /// </summary>
        public static bool RevealsPlayer(SoundKind kind) =>
            SoundRules.Source(kind) == SoundSource.Player && !IsLure(kind) && kind != SoundKind.Slip && kind != SoundKind.SnapShot;

        void Enter(CyclopsState state)
        {
            State = state;
            StateElapsed = 0f;
        }
    }
}
