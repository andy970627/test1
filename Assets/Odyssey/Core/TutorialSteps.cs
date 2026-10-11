namespace Odyssey.Core
{
    public enum TutorialStep { Move, Clap, Approach, Push, Wedge, Wake, Done }

    /// <summary>
    /// 第一夜的循序教學（規格第 17 節 A）：巨人沉睡時一步一步學走、拍手、找到巨石、推、塞楔子，
    /// 學會一個才開下一個；最後巨人醒來。開口推到 0.3 m 就直接叫醒巨人，不能趁他睡著把巨石推開。
    /// </summary>
    public sealed class TutorialSteps
    {
        public const float MoveMeters = 3f;
        public const float WedgeTimeout = 20f;
        public const float WakeOpening = 0.3f;
        public const float WakeSeconds = 5f;

        float stepTime;

        public TutorialStep Step { get; private set; } = TutorialStep.Done;

        /// <summary>巨人還在睡：不動、不聽，天亮不計時。</summary>
        public bool Asleep => Step < TutorialStep.Wake;

        /// <summary>教學還在畫面上（含巨人醒來那一句）。</summary>
        public bool Active => Step < TutorialStep.Done;

        public void Start() => Go(TutorialStep.Move);

        public void Skip() => Go(TutorialStep.Done);

        public void OnMoved(float metersTonight)
        {
            if (Step == TutorialStep.Move && metersTonight >= MoveMeters)
                Go(TutorialStep.Clap);
        }

        public void OnAtBoulder()
        {
            if (Step == TutorialStep.Approach)
                Go(TutorialStep.Push);
        }

        public void OnUsed(PromptKind kind)
        {
            if (Step == TutorialStep.Clap && kind == PromptKind.Clap)
                Go(TutorialStep.Approach);
            else if (Step == TutorialStep.Push && kind == PromptKind.Push)
                Go(TutorialStep.Wedge);
            else if (Step == TutorialStep.Wedge && kind == PromptKind.Wedge)
                Go(TutorialStep.Wake);
        }

        public void Tick(float dt, float opening)
        {
            if (!Active)
                return;
            if (Asleep && opening >= WakeOpening)
            {
                Go(TutorialStep.Wake);
                return;
            }
            stepTime += dt;
            if (Step == TutorialStep.Wedge && stepTime >= WedgeTimeout)
                Go(TutorialStep.Wake);
            else if (Step == TutorialStep.Wake && stepTime >= WakeSeconds)
                Go(TutorialStep.Done);
        }

        /// <summary>這一步在準星下方的那一行；沒有教學時是 null。</summary>
        public string Text => Step switch
        {
            TutorialStep.Move => "WASD 走",
            TutorialStep.Clap => "Q 拍手：聲音會照亮四周",
            TutorialStep.Approach => "巨石在洞口：跟著海風的方向走過去",
            TutorialStep.Push => "E 推巨石",
            TutorialStep.Wedge => "放手它會滑回去：右鍵塞石子當楔子",
            TutorialStep.Wake => "巨人被吵醒了。聲音照亮的地方，他也聽得到。",
            _ => null,
        };

        /// <summary>這一步教的操作；做到時同時算學會這種提示一次。</summary>
        public PromptKind? Kind => Step switch
        {
            TutorialStep.Move => PromptKind.Move,
            TutorialStep.Clap => PromptKind.Clap,
            TutorialStep.Push => PromptKind.Push,
            TutorialStep.Wedge => PromptKind.Wedge,
            _ => null,
        };

        void Go(TutorialStep step)
        {
            Step = step;
            stepTime = 0f;
        }
    }
}
