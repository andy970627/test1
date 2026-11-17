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
    public enum CyclopsState { Listen, Investigate, Search, Guard, Throw, Eat, Pray, Stagger, Drink }

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
        /// <summary>雷鳴（規格第 34 節 A）：先定住這麼久（和雅典娜與木馬的過場一樣長，過場中不會被抓），之後再聾 2～4 秒。</summary>
        public const float ThunderFreezeSeconds = 2.5f;
        public const float ThunderDeafMin = 2f, ThunderDeafMax = 4f;
        /// <summary>聾的時候朝你最後的位置慢慢摸過去（走路速度的倍率）。</summary>
        public const float DeafWalkMultiplier = 0.5f;
        /// <summary>刻痕（規格第 34 節 D）：摸索結束時，這麼近有刻痕就沿著往下一道走；下一道最遠這麼遠。</summary>
        public const float CarvingFollowReach = 15f;
        /// <summary>酒香引他過去時當成這麼大聲的目標：更大聲的聲音能把他叫走。</summary>
        const float WineTargetLoudness = 0.3f;
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
        float staggerDuration = StaggerSeconds;
        bool headingToWine;
        Vector2 drinkAt;
        readonly System.Collections.Generic.List<Vector2> judgedScents = new();
        Vector2? previousCarving;
        int carvingChain;

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

        /// <summary>還聾多久（雷鳴之後，規格第 34 節 A）；大於 0 時什麼都聽不見。</summary>
        public float DeafLeft { get; private set; }

        /// <summary>還醉多久（馬戎的酒，規格第 34 節 C）。</summary>
        public float DrunkLeft { get; private set; }
        public bool Drunk => DrunkLeft > 0f;

        /// <summary>最後一次聽見你（宙斯法則所說的聽見）的位置；還沒聽見過時是 null。</summary>
        public Vector2? LastHeardPlayerAt { get; private set; }

        /// <summary>巨人會學（規格第 34 節 E）：由遊戲迴圈保管，跨夜減半。</summary>
        public LureMemory Lures { get; set; } = new();

        /// <summary>岩壁上的刻痕（規格第 34 節 D）；沒有時是 null。</summary>
        public System.Collections.Generic.IReadOnlyList<Vector2> Carvings { get; set; }

        /// <summary>他不再全信一個誘餌（只走一半或不理）；給情境提示用。</summary>
        public event Action<LureTrust> LureDoubted;

        /// <summary>他喝完一灘酒（位置），開始醉。</summary>
        public event Action<Vector2> Drank;

        /// <summary>他摸到刻痕，往下一道刻痕走去（下一道的位置）。</summary>
        public event Action<Vector2> FollowedCarving;

        /// <summary>摸索範圍：醉的時候縮小。</summary>
        public float CurrentSearchRadius => Drunk ? WineSkin.DrunkSearchRadius : SearchRadius;

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
            if (State is CyclopsState.Guard or CyclopsState.Throw or CyclopsState.Eat or CyclopsState.Pray or CyclopsState.Stagger or CyclopsState.Drink || OnGuard || Drunk)
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
            headingToWine = false;
            staggerFrom = hitFrom;
            staggerDuration = StaggerSeconds;
            Enter(CyclopsState.Stagger);
        }

        /// <summary>
        /// 宙斯的雷鳴（規格第 34 節 A，取代第 31 節的衝鋒）：定住 2.5 秒，整段加上之後的 2～4 秒都聽不見；
        /// 定住結束後以一半的走路速度，朝最後聽見你的位置摸過去（沒聽見過就朝 fallback）。
        /// </summary>
        public void Thunderstruck(Vector2 fallback)
        {
            EndGuard();
            wandering = false;
            Charging = false;
            headingToWine = false;
            staggerFrom = LastHeardPlayerAt ?? fallback;
            staggerDuration = ThunderFreezeSeconds;
            DeafLeft = ThunderFreezeSeconds + ThunderDeafMin + (float)roll() * (ThunderDeafMax - ThunderDeafMin);
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
            headingToWine = false;
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
            LastHeardPlayerAt = null;
            ThrowCooldownLeft = 0f;
            DeafLeft = 0f;
            DrunkLeft = 0f;
            headingToWine = false;
            judgedScents.Clear();
            previousCarving = null;
            carvingChain = 0;
            staggerDuration = StaggerSeconds;
            Enter(CyclopsState.Listen);
        }

        public static bool RockHits(Vector2 landing, Vector2 p) => Vector2.Distance(landing, p) <= ImpactRadius + 1e-4f;

        public void Hear(SoundEvent e)
        {
            // 禱告中什麼都聽不到（禱告聲蓋過一切）。
            // 僵直中同樣什麼都聽不到。
            // 雷鳴之後聾了，也什麼都聽不到。
            if (State == CyclopsState.Pray || State == CyclopsState.Stagger || DeafLeft > 0f)
                return;
            if (!SoundRules.CanHear(e, Position, HearingMultiplierFor(e.Kind)))
                return;
            if (RevealsPlayer(e.Kind))
            {
                SecondsSinceHeardPlayer = 0f;
                LastHeardPlayerAt = e.Position;
            }

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
            if (State == CyclopsState.Throw || State == CyclopsState.Eat || State == CyclopsState.Drink)
                return;

            bool lure = e.Kind == SoundKind.Arrow || e.Kind == SoundKind.Stone || e.Kind == SoundKind.Bleat;
            if (OnGuard)
            {
                if (lure)
                {
                    LureTrust trust = Judge(e.Kind, e.Position);
                    if (trust == LureTrust.Ignore)
                        return;
                    if (TryThrow(e))
                        return;
                    EndGuard();
                    Investigate(e, trust);
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

            LureTrust heard = Judge(e.Kind, e.Position);
            if (heard == LureTrust.Ignore)
                return;
            if (TryThrow(e))
                return;
            if (State == CyclopsState.Investigate && !wandering && e.Loudness <= targetLoudness)
                return;
            Investigate(e, heard);
        }

        /// <summary>這個聲音若是誘餌，問記憶他還信多少（並記一次）；不是誘餌一律全信。</summary>
        LureTrust Judge(SoundKind kind, Vector2 at)
        {
            LureKind? lure = LureMemory.KindOf(kind);
            if (lure == null)
                return LureTrust.Full;
            LureTrust trust = Lures.Respond(at, lure.Value);
            if (trust != LureTrust.Full)
                LureDoubted?.Invoke(trust);
            return trust;
        }

        /// <summary>
        /// 聞到酒香（規格第 34 節 C）：在 10 m 內、手上沒有更要緊的事時，走過去喝。每一灘只判斷一次（巨人會學也算一次）。
        /// 回傳他是不是被引過去了。
        /// </summary>
        public bool Smell(Vector2 scent)
        {
            if (headingToWine || OnGuard || Vector2.Distance(scent, Position) > WineSkin.SmellReach)
                return false;
            bool idle = State == CyclopsState.Listen || State == CyclopsState.Search
                || (State == CyclopsState.Investigate && (wandering || !TargetIsPlayerSound) && !Charging && !returning);
            if (!idle)
                return false;
            foreach (var judged in judgedScents)
                if (Vector2.Distance(judged, scent) < 0.1f)
                    return false;
            judgedScents.Add(scent);
            LureTrust trust = Lures.Respond(scent, LureKind.Wine);
            if (trust != LureTrust.Full)
                LureDoubted?.Invoke(trust);
            if (trust == LureTrust.Ignore)
                return false;
            returning = false;
            wandering = false;
            ResetCarvingChain();
            Target = Sway(scent);
            targetLoudness = WineTargetLoudness;
            targetKind = SoundKind.Step;
            TargetIsPlayerSound = false;
            Charging = false;
            if (trust == LureTrust.Half)
            {
                Target = Position + (Target - Position) * 0.5f;
                wandering = true;
            }
            else
                headingToWine = true;
            Enter(CyclopsState.Investigate);
            return true;
        }

        /// <summary>推進時間並判斷是否抓到玩家或同伴；碰撞優先於摸到，玩家優先於同伴。</summary>
        public CyclopsTick Tick(float dt, Vector2 player, IReadOnlyList<Vector2> crew = null)
        {
            SecondsSinceHeardPlayer += dt;
            DeafLeft = Math.Max(0f, DeafLeft - dt);
            DrunkLeft = Math.Max(0f, DrunkLeft - dt);
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
                case CyclopsState.Drink:
                    if (StateElapsed >= WineSkin.DrinkSeconds)
                    {
                        DrunkLeft = WineSkin.DrunkSeconds;
                        Enter(CyclopsState.Listen);
                        Drank?.Invoke(drinkAt);
                    }
                    break;
                case CyclopsState.Stagger:
                    if (StateElapsed >= staggerDuration)
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
                if (Vector2.Distance(player, Position) <= CurrentSearchRadius)
                    return new CyclopsTick(FailReason.Touched, -1, false, default, false);
                if (StateElapsed >= searchDuration)
                    pull = EndSearch();
            }

            int eaten = -1;
            if (crew != null && State != CyclopsState.Eat && State != CyclopsState.Stagger)
                for (int i = 0; i < crew.Count; i++)
                {
                    float d = Vector2.Distance(crew[i], Position);
                    if (d <= BumpDistance || (State == CyclopsState.Search && d <= CurrentSearchRadius))
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
                * (Charging && State == CyclopsState.Investigate ? ChargeMultiplier : 1f)
                * (DeafLeft > 0f ? DeafWalkMultiplier : 1f);
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
                // 遊走到了（或半信半疑的誘餌只走一半）不摸索，直接再聽。
                wandering = false;
                Enter(CyclopsState.Listen);
                return;
            }
            if (headingToWine)
            {
                headingToWine = false;
                drinkAt = Target;
                Enter(CyclopsState.Drink);
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
            if (TryFollowCarving())
                return false;
            Enter(CyclopsState.Listen);
            return false;
        }

        /// <summary>
        /// 刻痕（規格第 34 節 D）：摸索的地方有刻痕，就往最近的下一道走（不走回上一道）。
        /// 一條線最多走 <see cref="Carvings.Max"/> 道，聽到聲音或遊走就重新算。
        /// </summary>
        bool TryFollowCarving()
        {
            if (Carvings == null || Carvings.Count < 2 || carvingChain >= Odyssey.Core.Carvings.Max)
                return false;
            int here = -1;
            float hereDistance = CurrentSearchRadius;
            for (int i = 0; i < Carvings.Count; i++)
            {
                float d = Vector2.Distance(Carvings[i], Position);
                if (d <= hereDistance)
                {
                    hereDistance = d;
                    here = i;
                }
            }
            if (here < 0)
                return false;
            int next = -1;
            float nextDistance = CarvingFollowReach;
            for (int i = 0; i < Carvings.Count; i++)
            {
                if (i == here || (previousCarving is Vector2 prev && Vector2.Distance(prev, Carvings[i]) < 0.1f))
                    continue;
                float d = Vector2.Distance(Carvings[i], Position);
                if (d <= nextDistance)
                {
                    nextDistance = d;
                    next = i;
                }
            }
            if (next < 0)
                return false;
            previousCarving = Carvings[here];
            carvingChain++;
            returning = false;
            wandering = false;
            Target = Sway(Carvings[next]);
            targetLoudness = 0f;
            targetKind = SoundKind.Step;
            TargetIsPlayerSound = false;
            Enter(CyclopsState.Investigate);
            FollowedCarving?.Invoke(Carvings[next]);
            return true;
        }

        void ResetCarvingChain()
        {
            previousCarving = null;
            carvingChain = 0;
        }

        /// <summary>醉的時候目標隨機偏一點（最多 ±1 m）。</summary>
        Vector2 Sway(Vector2 target) => Drunk
            ? target + new Vector2((float)(roll() * 2 - 1), (float)(roll() * 2 - 1)) * WineSkin.DrunkSway
            : target;

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
            // 醉了舉不起岩石。
            if (Drunk || ThrowCooldownLeft > 0f || Vector2.Distance(e.Position, Position) <= ThrowMinDistance)
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
            headingToWine = false;
            ResetCarvingChain();
            TargetIsPlayerSound = false;
            Enter(CyclopsState.Investigate);
        }

        /// <summary>循聲去查；半信半疑（巨人會學）時只走一半就停下來聽。</summary>
        void Investigate(SoundEvent e, LureTrust trust = LureTrust.Full)
        {
            returning = false;
            wandering = false;
            SetTarget(e.Position, e);
            Target = Sway(Target);
            if (trust == LureTrust.Half)
            {
                Target = Position + (Target - Position) * 0.5f;
                wandering = true;
            }
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
            headingToWine = false;
            ResetCarvingChain();
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
