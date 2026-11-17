using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 實測捷徑（手動與自動共用）：直接跳到要測的情況，不用每次從頭玩。
/// 手動：在編輯器或開發版按 F2～F10（見 PlaytestDriver）；自動：網頁版網址加 ?playtest=名稱，畫面測試腳本用。
/// </summary>
public enum PlaytestScene
{
    Night,      // 開始夜晚（跳過選單與開場卡片）
    Boulder,    // 空降到巨石前、面向它
    Ambush,     // 偷襲：雷鳴、雅典娜轉身、燃燒的木馬、手抖
    FairHit,    // 正面出手：先出聲再打中，巨人踉蹌
    Prayer,     // 巨人向波塞頓禱告
    DawnSoon,   // 快轉到天亮前 30 秒（海鳥聲、天光）
    Dawn,       // 天亮：巨人把巨石推回原位、死亡畫面
    FullOpen,   // 巨石全開（海風、羊群湧向縫口）
    Shore,      // 直接鑽出去到岸邊
    Death,      // 被巨人摸到（死亡畫面）
    Verse,      // 宙斯法則的吟遊詩句提示
    Wine,       // 馬戎的酒：在巨人前倒一灘酒，他走過去喝、醉倒（規格第 34 節 C）
    Carvings,   // 刻痕：沿岩壁刻三道，巨人摸到第一道後循線走（規格第 34 節 D）
    Favor,      // 雅典娜的眷顧：攢滿三分，換一次整洞回聲（規格第 34 節 F）
}

public partial class BlindGameLoop
{
    /// <summary>跳到某個實測情況。還在選單或開場卡片時會先開始夜晚；夜晚以外的其他階段（岸邊、死亡畫面）不動。</summary>
    public bool RunPlaytest(PlaytestScene scene)
    {
        if (!EnsureNight())
        {
            Debug.Log($"[PLAYTEST] skip {scene}: phase={State.Phase}");
            return false;
        }
        Vector3 p = body.transform.position;
        switch (scene)
        {
            case PlaytestScene.Night:
                break;
            case PlaytestScene.Boulder:
                StandAtBoulder();
                break;
            case PlaytestScene.Ambush:
                Ambush(new System.Numerics.Vector2(p.x, p.z));
                break;
            case PlaytestScene.FairHit:
                FairHitTest();
                break;
            case PlaytestScene.Prayer:
                if (Cyclops.Brain.TryPray())
                {
                    prayTimer = 0f;
                    prayJolts = 0;
                    prayVoice.Play();
                    Hint(HintKind.Prayer);
                }
                break;
            case PlaytestScene.DawnSoon:
                Dawn.Tick(Mathf.Max(0f, DawnClock.DefaultNightSeconds - 30f - Dawn.Elapsed));
                break;
            case PlaytestScene.Dawn:
                Dawn.Tick(DawnClock.DefaultNightSeconds - Dawn.Elapsed + 0.1f);
                break;
            case PlaytestScene.FullOpen:
                StandAtBoulder();
                OpenBoulderFully();
                break;
            case PlaytestScene.Shore:
                StandAtBoulder();
                OpenBoulderFully();
                Escape();
                break;
            case PlaytestScene.Death:
                Fail(FailReason.Touched);
                break;
            case PlaytestScene.Verse:
                Hint(HintKind.FirstStone);
                break;
            case PlaytestScene.Wine:
                WineTest();
                break;
            case PlaytestScene.Carvings:
                CarvingsTest();
                break;
            case PlaytestScene.Favor:
                Favor.OnFair();
                Favor.OnFair();
                UseBoon(FavorBoon.CaveFlash);
                break;
        }
        Debug.Log($"[PLAYTEST] ran {scene}");
        return true;
    }

    /// <summary>給畫面測試看的一行狀態（瀏覽器主控台）。</summary>
    public string PlaytestStatus()
    {
        Vector3 p = body.transform.position;
        var g = Cyclops != null ? Cyclops.Brain.Position : default;
        string hint = Hints.Current?.ToString() ?? "-";
        return $"phase={State.Phase} t={Dawn.Elapsed:0.0} player=({p.x:0.0},{p.z:0.0}) giant=({g.X:0.0},{g.Y:0.0}) " +
               $"state={Cyclops?.Brain.State} open={Slide.Opening:0.00} favor={Favor.Has} tremble={Favor.Tremble} " +
               $"terror={Terror.Layer} hint={hint} essential={Essential.Step} onShore={onShore} " +
               $"points={Favor.Points} deaf={Cyclops?.Brain.DeafLeft:0.0} drunk={Cyclops?.Brain.Drunk} carvings={Carved.Count} wine={Wine.PoursLeft}";
    }

    bool EnsureNight()
    {
        if (State.Phase == LoopPhase.Night)
            return true;
        if (menus.Open)
            menus.Close();
        if (hud.BriefingOpen)
            hud.SkipBriefing();
        if (State.Phase == LoopPhase.Intro)
            StartNight();
        return State.Phase == LoopPhase.Night;
    }

    /// <summary>巨人的座位離巨石只有約 3.5 m：空降到巨石前時先把他移到洞的另一頭，免得一落地就被抓。</summary>
    void ParkGiantFar() => Cyclops.Brain.Reset(new System.Numerics.Vector2(-9f, -2f));

    void StandAtBoulder()
    {
        ParkGiantFar();
        Vector3 face = Layout.Boulder.PushPoint;
        var at = new Vector3(face.x, 0f, face.z - 1f);
        at.y = CaveBuilder.GroundHeight(at);
        body.Teleport(at + Vector3.up * 0.05f, 0f);
    }

    void OpenBoulderFully()
    {
        for (int i = 0; i < 400 && !Slide.IsOpen; i++)
            Slide.Tick(0.1f, PushMode.Heavy, false);
        Layout.Boulder.SetOpening(Slide.Opening);
    }

    /// <summary>站到巨人前 5 m 面向他、拍一下讓他聽見，再算打中他：照宙斯法則應判正面出手。</summary>
    void FairHitTest()
    {
        var g = Cyclops.Brain.Position;
        var giant = new Vector3(g.X, 0f, g.Y);
        Vector3 dir = body.transform.position - giant;
        dir.y = 0f;
        if (dir.sqrMagnitude < 0.01f)
            dir = Vector3.back;
        Vector3 at = giant + dir.normalized * 5f;
        at.y = CaveBuilder.GroundHeight(at);
        body.Teleport(at + Vector3.up * 0.05f, Quaternion.LookRotation(-dir).eulerAngles.y);
        SoundBus.Emit(SoundKind.Clap, body.CameraTransform.position);
        OnCyclopsHit(Cyclops.HeadPosition);
    }

    /// <summary>站在巨人 7 m 外面向他，在兩人中間倒一灘酒：他聞到、走過去喝、醉倒（畫面測試在 mark drunk 時截圖）。</summary>
    void WineTest()
    {
        var g = Cyclops.Brain.Position;
        var giant = new Vector3(g.X, 0f, g.Y);
        Vector3 dir = body.transform.position - giant;
        dir.y = 0f;
        if (dir.sqrMagnitude < 0.01f)
            dir = Vector3.back;
        Vector3 at = giant + dir.normalized * 7f;
        at.y = CaveBuilder.GroundHeight(at);
        body.Teleport(at + Vector3.up * 0.05f, Quaternion.LookRotation(-dir).eulerAngles.y);
        Vector3 puddle = giant + dir.normalized * 3.5f;
        puddle.y = CaveBuilder.GroundHeight(puddle);
        PourWine(puddle);
    }

    /// <summary>沿著玩家附近的岩壁刻三道，再在第一道旁拍一下把巨人引過去：他摸到刻痕就循線走（mark carving）。</summary>
    void CarvingsTest()
    {
        ParkGiantFar();
        var giant = Cyclops.Brain.Position;
        for (int i = 0; i < 3; i++)
        {
            double a = System.Math.Atan2(giant.Y, giant.X) + (i - 1) * 0.25;
            var p = new System.Numerics.Vector2((float)System.Math.Cos(a) * 12.5f, (float)System.Math.Sin(a) * 8.3f);
            Carve(p);
        }
        Vector3 first = new Vector3(Carved.Marks[0].X, 0f, Carved.Marks[0].Y);
        first.y = CaveBuilder.GroundHeight(first);
        SoundBus.Emit(SoundKind.Clap, first + Vector3.up);
    }
}
