using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 規格第 31 節：宙斯法則（打中巨人時判正面或偷襲）、宙斯的雷鳴、雅典娜的眷顧、木馬的重量、追殺與恐懼半徑。
/// 畫面、音效、配樂的元件由各自的檔案負責，這裡只接線。
/// </summary>
public partial class BlindGameLoop
{
    /// <summary>木馬的重量：偷襲之後這一夜準頭晃動的角度（規格第 31 節 B3）。</summary>
    const float TrembleDegrees = 1.5f;

    void InitZeus()
    {
        CyclopsHits.Hit += OnCyclopsHit;
        player.PickedUpStone += () => Hint(HintKind.FirstStone);
    }

    void OnDestroy() => CyclopsHits.Hit -= OnCyclopsHit;

    void ZeusNewNight()
    {
        Favor.NewNight();
        Thunder.NewNight();
        Chase.Reset();
        if (player != null)
            player.AimTremble = 0f;
    }

    /// <summary>每一幀（夜晚中）：追殺狀態與恐懼半徑的讀數、手抖。</summary>
    void UpdateZeus()
    {
        CyclopsBrain brain = Cyclops.Brain;
        Vector3 p = body.transform.position;
        float distance = Vector2.Distance(new Vector2(p.x, p.z), new Vector2(brain.Position.X, brain.Position.Y));
        Chase.Update(Time.deltaTime, brain.State, brain.TargetIsPlayerSound, brain.SecondsSinceHeardPlayer, distance, brain.Charging);
        bool listening = brain.State == CyclopsState.Listen;
        bool praying = brain.State == CyclopsState.Pray;
        Terror = TerrorRadius.Evaluate(distance, Chase.Chasing, listening, praying, Difficulty);
        player.AimTremble = Favor.Tremble ? TrembleDegrees : 0f;
    }

    /// <summary>石子或箭直接打中巨人：依宙斯法則判定（打中前他有沒有聽見你、是不是正循著你的聲音而來）。</summary>
    void OnCyclopsHit(Vector3 point)
    {
        if (State.Phase != LoopPhase.Night || !Cyclops.Active)
            return;
        CyclopsBrain brain = Cyclops.Brain;
        ZeusVerdict verdict = ZeusLaw.Judge(brain.State, brain.HoldingBoulder, brain.SecondsSinceHeardPlayer, brain.TargetIsPlayerSound, Flags.ZeusLaw);
        Vector3 p = body.transform.position;
        var from = new System.Numerics.Vector2(p.x, p.z);
        if (verdict == ZeusVerdict.Fair)
        {
            brain.Stagger(from);
            Hint(HintKind.FairHit);
            if (Favor.OnFair())
                OnFavorRegained();
            return;
        }
        Ambush(from);
    }

    /// <summary>偷襲：宙斯的雷鳴、雅典娜轉身、燃燒的木馬、這一夜手抖。</summary>
    void Ambush(System.Numerics.Vector2 playerAt)
    {
        ThunderStrike strike = Thunder.Strike(Crew.Followers.Count);
        Cyclops.Brain.Charge(playerAt);
        if (strike.Penalty == ThunderPenalty.KillFollower && Crew.Followers.Count > 0)
        {
            CrewMember struck = Crew.Followers[Crew.Followers.Count - 1];
            feedback.CrewEaten(struck.transform.position);
            hud.FlashCrew();
            LoseCrew(struck);
        }
        else
            Slide.Jolt(BoulderSlide.FullOpen);
        if (Favor.OnAmbush())
            OnFavorLost();
        Hint(HintKind.Ambush);
        OnAmbushPresentation(strike);
    }

    void OnFavorLost() => OnFavorChanged(false);

    void OnFavorRegained()
    {
        Hint(HintKind.FavorRegained);
        OnFavorChanged(true);
    }

    // 下面三個由畫面／音效接上（第 1、2 批合併後補齊）。
    partial void OnFavorChanged(bool has);
    partial void OnAmbushPresentation(ThunderStrike strike);
}
