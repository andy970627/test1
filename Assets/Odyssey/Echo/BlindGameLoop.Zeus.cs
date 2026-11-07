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

    /// <summary>天亮前多久開始從縫外傳來海鳥與浪聲（DbD 終局崩塌的做法，規格第 31 節 H5）。</summary>
    const float SeabirdsBeforeDawn = 30f;
    /// <summary>巨人在這麼近時，他的腳步讓鏡頭輕震（借《惡靈古堡 2》暴君的沉重腳步）。</summary>
    const float StepShakeReach = 6f;
    const float StepShakeMeters = 0.012f;
    /// <summary>躲在羊圈裡時外界聲音變悶（借《異形：孤立》）。</summary>
    const float HiddenCutoff = 1400f, OpenCutoff = 22000f;

    TerrorMusic music;
    FirstPersonHands hands;
    /// <summary>第一人稱雙手（WorldPrompts 設定手勢提示用）。</summary>
    public FirstPersonHands Hands => hands;
    ZeusThunderScene thunderScene;
    float muffleCutoff = OpenCutoff;
    bool gustPlayed;

    void InitZeus()
    {
        CyclopsHits.Hit += OnCyclopsHit;
        player.PickedUpStone += () => Hint(HintKind.FirstStone);
        music = gameObject.AddComponent<TerrorMusic>();
        thunderScene = new GameObject("ZeusThunder").AddComponent<ZeusThunderScene>();
        thunderScene.Init(body, hands);
        thunderScene.OwlFlies += sounds.PlayOwl;
        thunderScene.HorseBurns += sounds.PlayFire;
        thunderScene.Finished += () => Hint(HintKind.Horse);
    }

    /// <summary>夜晚以外（選單、過場、岸邊）：配樂淡出、鏡頭不晃、聲音不悶。</summary>
    void LateUpdate()
    {
        if (State == null || State.Phase == LoopPhase.Night || music == null)
            return;
        music.Tick(default, TerrorMode.Off, true, Time.deltaTime);
        body.SceneShake = Vector3.zero;
        feedback.SetTerrorVignette(0f);
        if (muffleCutoff < OpenCutoff)
        {
            muffleCutoff = OpenCutoff;
            sounds.SetMuffle(OpenCutoff);
        }
    }

    void OnDestroy() => CyclopsHits.Hit -= OnCyclopsHit;

    void ZeusNewNight()
    {
        Favor.NewNight();
        Thunder.NewNight();
        Chase.Reset();
        gustPlayed = false;
        if (player != null)
            player.AimTremble = 0f;
        if (thunderScene != null)
            thunderScene.Stop();
        if (sounds != null)
            sounds.StopSeabirds();
        if (Layout.Boulder != null)
            Layout.Boulder.SetFavorNow(Favor.Has);
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

        float dt = Time.deltaTime;
        bool hush = listening && distance <= TerrorRadius.ListenSilence;
        music.DawnTension = 1f - Mathf.Clamp01((1f - Dawn.Fraction) * DawnClock.DefaultNightSeconds / SeabirdsBeforeDawn);
        music.Tick(Terror, Flags.Terror, hush, dt);
        feedback.LegacyHeartbeat = Flags.Terror == TerrorMode.Legacy;
        bool close = Flags.Terror == TerrorMode.Layered && Terror.Layer is TerrorLayer.Three or TerrorLayer.Chase;
        feedback.SetTerrorVignette(close ? (Terror.Layer == TerrorLayer.Chase ? 0.8f : 0.55f) : 0f);

        hands.Tremble = Favor.Tremble ? 0.6f : 0f;

        // 巨人走動時，越近腳步越讓鏡頭震。
        float shake = brain.IsMoving && distance < StepShakeReach ? (1f - distance / StepShakeReach) * StepShakeMeters : 0f;
        body.SceneShake = shake > 0f ? new Vector3(Random.Range(-1f, 1f), Random.Range(-1f, 1f), 0f) * shake : Vector3.zero;

        // 躲在羊圈裡：外面的聲音變悶。
        float cutoff = insidePen >= 0 ? HiddenCutoff : OpenCutoff;
        float next = Mathf.Lerp(muffleCutoff, cutoff, 1f - Mathf.Exp(-6f * dt));
        if (Mathf.Abs(next - muffleCutoff) > 1f)
        {
            muffleCutoff = next;
            sounds.SetMuffle(muffleCutoff);
        }

        // 巨石第一次全開：海風灌進來（DbD 大門通電的做法）。
        if (!gustPlayed && Slide.IsOpen)
        {
            gustPlayed = true;
            sounds.PlayGust(Layout.Boulder.GapPoint);
        }

        // 天亮前 30 秒：縫外的海鳥與浪聲越來越大。
        float left = (1f - Dawn.Fraction) * DawnClock.DefaultNightSeconds;
        if (left <= SeabirdsBeforeDawn)
        {
            sounds.StartSeabirds(Layout.Boulder.GapPoint);
            sounds.SetSeabirdsVolume(0.9f * (1f - left / SeabirdsBeforeDawn));
        }
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
        // 雷鳴震住所有人：過場（雅典娜轉身、燃燒的木馬）播完之前巨人不動也聽不到，播完才衝過來。
        // 否則他就在附近時，過場還沒播完玩家就被抓了（自動畫面測試抓到的問題）。
        Cyclops.Brain.Stagger(playerAt);
        StartCoroutine(ChargeAfterThunder(playerAt));
        if (strike.Penalty == ThunderPenalty.KillFollower && Crew.Followers.Count > 0)
        {
            CrewMember struck = Crew.Followers[Crew.Followers.Count - 1];
            feedback.CrewEaten(struck.transform.position);
            LoseCrew(struck);
            sounds.PlayLossChord();
        }
        else
            Slide.Jolt(BoulderSlide.FullOpen);
        Hint(HintKind.Ambush);
        if (Favor.OnAmbush())
            OnFavorLost();
        OnAmbushPresentation(strike);
    }

    System.Collections.IEnumerator ChargeAfterThunder(System.Numerics.Vector2 playerAt)
    {
        yield return new WaitForSeconds(ZeusThunderScene.Duration);
        if (State.Phase == LoopPhase.Night && Cyclops.Active)
            Cyclops.Brain.Charge(playerAt);
    }

    void OnFavorLost() => OnFavorChanged(false);

    void OnFavorRegained()
    {
        Hint(HintKind.FavorRegained);
        OnFavorChanged(true);
    }

    void OnFavorChanged(bool has)
    {
        Layout.Boulder.SetFavor(has);
        // 重新得到眷顧：貓頭鷹從巨石那邊叫一聲。
        if (has)
            sounds.PlayOwl(Layout.Boulder.GapPoint + Vector3.up * 2f);
    }

    void OnAmbushPresentation(ThunderStrike strike)
    {
        sounds.PlayThunder();
        music.PauseDrone(3f);
        thunderScene.Play(body.transform.position, body.CameraTransform.forward, strike.LightsCave);
    }

    /// <summary>岸邊射向睡著的巨人＝偷襲（規格第 31 節 B3 #4）：雅典娜在洞口旁轉身、木馬燒成灰；不扣同伴（照第 20 節的代價）。</summary>
    void ShoreAmbush()
    {
        if (!Flags.ZeusLaw)
            return;
        Favor.OnAmbush();
        sounds.PlayThunder();
        // 站在洞口外、巨石旁邊（玩家在縫外往洞裡看，這裡在視野右側），不會被巨石擋住。
        Vector3 gap = Layout.Boulder.GapPoint;
        Vector3 beside = new Vector3(gap.x + 3.5f, gap.y - 1f, gap.z + 1.5f);
        thunderScene.PlayShore(beside, body.transform.position);
    }

    /// <summary>結局多一句（規格第 31 節 B3 #5）：整場守住法則，或偷襲過而沒贖回。</summary>
    string ZeusEpilogue()
    {
        if (!Flags.ZeusLaw)
            return "";
        if (!Favor.EverAmbushed)
            return "\n" + VerseBook.EndingKept.Item1;
        if (!Favor.Has)
            return "\n" + VerseBook.EndingTurned.Item1;
        return "";
    }
}
