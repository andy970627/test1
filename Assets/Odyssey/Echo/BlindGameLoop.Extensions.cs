using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;
using NVector2 = System.Numerics.Vector2;

/// <summary>
/// 規格第 34 節的延伸玩法接線：雷鳴耳鳴（A，在 Zeus 檔的 Ambush）、天亮前（B）、馬戎的酒（C）、
/// 刻痕（D）、巨人會學（E）、雅典娜的眷顧點數（F）。規則都在 Odyssey.Core，這裡只接輸入、畫面與聲音。
/// </summary>
public partial class BlindGameLoop
{
    /// <summary>巨人會學：跨夜保留、每夜減半，新遊戲清空。</summary>
    public LureMemory Lures { get; } = new();

    /// <summary>馬戎的酒：整場遊戲一囊、倒兩次。</summary>
    public WineSkin Wine { get; } = new();

    /// <summary>岩壁上的刻痕：跨夜保留，新遊戲清空。</summary>
    public Carvings Carved { get; } = new();

    const float WineReach = 1.2f;
    const float WinePromptReach = 2.5f;
    const float CarvePromptAfter = 3f;
    const int CarvePromptUntil = 3;
    static readonly Color PuddleColor = new(0.32f, 0.05f, 0.08f);
    static readonly Color CarvingColor = new(0.85f, 0.82f, 0.72f);
    static readonly Color CaveFlashColor = new(0.85f, 0.82f, 0.6f);

    Transform wineskin;
    Vector3 wineskinHome;
    Quaternion wineskinHomeRotation;
    bool carryingWine;
    float pourHeld;
    bool pourNeedsRelease;

    readonly List<(Vector3 At, float Left, GameObject Mark)> puddles = new();
    readonly List<GameObject> carvingMarks = new();
    float carveHeld;
    bool carveNeedsRelease;
    float wallLinger;

    float stirBleatTimer;
    bool stirHinted;
    FavorMenu favorMenu;

    void InitExtensions()
    {
        CyclopsBrain brain = Cyclops.Brain;
        brain.Lures = Lures;
        brain.Carvings = Carved.Marks;
        brain.LureDoubted += _ => Hint(HintKind.LureDoubted);
        brain.Drank += OnGiantDrank;
        brain.FollowedCarving += _ =>
        {
            Hint(HintKind.CarvingFollowed);
            PlaytestDriver.Mark("carving");
        };
        player.ExtraInteract = TryTakeWine;
        player.Used += kind =>
        {
            if (kind == PromptKind.TakeStake)
                DropWine();
        };
        favorMenu = gameObject.AddComponent<FavorMenu>();
        favorMenu.Init(this);
    }

    /// <summary>每夜重置：誘餌記憶減半、地上的酒乾掉、酒囊回到床邊、縫光與天光收起。刻痕留著。</summary>
    void ExtensionsNewNight()
    {
        Lures.NewNight();
        ClearPuddles();
        PutWineskinHome();
        pourHeld = carveHeld = wallLinger = 0f;
        pourNeedsRelease = carveNeedsRelease = false;
        stirBleatTimer = 0f;
        stirHinted = false;
        if (echo != null)
            echo.Ambient = 0f;
        if (Layout.Boulder != null)
            Layout.Boulder.StopMoonbeam();
        if (favorMenu != null)
            favorMenu.Close();
    }

    /// <summary>新遊戲：誘餌記憶、酒囊、刻痕全部清空。</summary>
    void ExtensionsNewGame()
    {
        Lures.Reset();
        Wine.Reset();
        Carved.Reset();
        foreach (var mark in carvingMarks)
            if (mark != null)
                Destroy(mark);
        carvingMarks.Clear();
    }

    /// <summary>夜晚中的每一幀。</summary>
    void UpdateExtensions()
    {
        float dt = Time.deltaTime;
        UpdateWine(dt);
        UpdateCarving(dt);
        UpdateDawnStir(dt);
    }

    // ---------- C. 馬戎的酒 ----------

    void FindWineskin()
    {
        if (wineskin != null)
            return;
        var go = GameObject.Find("Wineskin");
        if (go == null)
            return;
        wineskin = go.transform;
        wineskinHome = wineskin.position;
        wineskinHomeRotation = wineskin.rotation;
    }

    bool TryTakeWine()
    {
        FindWineskin();
        if (carryingWine || wineskin == null || Wine.Empty || Flat(wineskin.position - PlayerPosition).magnitude > WineReach)
            return false;
        if (player.CarryingStake)
            player.DropStakeHere();
        wineskin.SetParent(body.CameraTransform, false);
        wineskin.localPosition = new Vector3(0.3f, -0.35f, 0.55f);
        wineskin.localRotation = Quaternion.Euler(10f, 20f, 0f);
        carryingWine = true;
        MarkUsed(PromptKind.TakeWine);
        return true;
    }

    /// <summary>改拿木樁時把酒囊放在腳邊。</summary>
    void DropWine()
    {
        if (!carryingWine || wineskin == null)
            return;
        carryingWine = false;
        wineskin.SetParent(null, true);
        Vector3 at = PlayerPosition + body.CameraTransform.forward * 0.5f;
        at.y = CaveBuilder.GroundHeight(at) + 0.25f;
        wineskin.SetPositionAndRotation(at, wineskinHomeRotation);
    }

    void PutWineskinHome()
    {
        FindWineskin();
        carryingWine = false;
        if (wineskin == null)
            return;
        wineskin.SetParent(null, true);
        wineskin.SetPositionAndRotation(wineskinHome, wineskinHomeRotation);
    }

    void UpdateWine(float dt)
    {
        var keyboard = Keyboard.current;
        if (carryingWine && keyboard != null && player.InputEnabled && !Wine.Empty)
        {
            bool held = keyboard.gKey.isPressed;
            if (!held)
                pourNeedsRelease = false;
            if (held && !pourNeedsRelease)
            {
                pourHeld += dt;
                if (pourHeld >= WineSkin.PourHoldSeconds)
                {
                    Vector3 at = PlayerPosition + body.CameraTransform.forward * 0.8f;
                    at.y = CaveBuilder.GroundHeight(at);
                    PourWine(at);
                    pourHeld = 0f;
                    pourNeedsRelease = true;
                }
            }
            else
                pourHeld = 0f;
        }

        // 酒香：每一灘都讓巨人聞一次（同一灘巨人只判斷一次），時間到就乾掉。
        for (int i = puddles.Count - 1; i >= 0; i--)
        {
            var p = puddles[i];
            p.Left -= dt;
            if (p.Left <= 0f)
            {
                if (p.Mark != null)
                    Destroy(p.Mark);
                puddles.RemoveAt(i);
                continue;
            }
            puddles[i] = p;
            if (Cyclops.Active)
                Cyclops.Brain.Smell(new NVector2(p.At.x, p.At.z));
        }
    }

    /// <summary>倒一次酒：地上一灘暗紅（只有回聲照得到）、悶悶的水聲（巨人聽得到）。</summary>
    void PourWine(Vector3 at)
    {
        if (!Wine.Pour())
            return;
        SoundBus.Emit(SoundKind.Pour, at);
        var mark = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        mark.name = "WinePuddle";
        Destroy(mark.GetComponent<Collider>());
        mark.transform.position = at + Vector3.up * 0.02f;
        mark.transform.localScale = new Vector3(0.9f, 0.01f, 0.7f);
        mark.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(PuddleColor);
        puddles.Add((at, WineSkin.ScentSeconds, mark));
        MarkUsed(PromptKind.Pour);
        if (Wine.Empty)
            DropWine();
    }

    void OnGiantDrank(NVector2 at)
    {
        int nearest = -1;
        float best = float.MaxValue;
        for (int i = 0; i < puddles.Count; i++)
        {
            float d = NVector2.Distance(new NVector2(puddles[i].At.x, puddles[i].At.z), at);
            if (d < best)
            {
                best = d;
                nearest = i;
            }
        }
        if (nearest >= 0)
        {
            if (puddles[nearest].Mark != null)
                Destroy(puddles[nearest].Mark);
            puddles.RemoveAt(nearest);
        }
        Hint(HintKind.Drunk);
        PlaytestDriver.Mark("drunk");
    }

    void ClearPuddles()
    {
        foreach (var p in puddles)
            if (p.Mark != null)
                Destroy(p.Mark);
        puddles.Clear();
    }

    // ---------- D. 刻痕 ----------

    void UpdateCarving(float dt)
    {
        NVector2 here = new(PlayerPosition.x, PlayerPosition.z);
        bool nearWall = Carvings.NearWall(here);
        wallLinger = nearWall ? wallLinger + dt : 0f;

        var keyboard = Keyboard.current;
        if (keyboard == null || !player.InputEnabled)
            return;
        bool held = keyboard.rKey.isPressed;
        if (!held)
            carveNeedsRelease = false;
        if (!held || carveNeedsRelease || !nearWall)
        {
            carveHeld = 0f;
            return;
        }
        carveHeld += dt;
        if (carveHeld < Carvings.CarveSeconds)
            return;
        carveHeld = 0f;
        carveNeedsRelease = true;
        Carve(here);
    }

    /// <summary>在面前的岩壁刻一道：刮擦聲（巨人聽得到），岩壁上一道淡色的刻痕（回聲掃過時亮起）。</summary>
    void Carve(NVector2 at)
    {
        if (Carved.Add(at) == 0 && carvingMarks.Count > 0)
        {
            if (carvingMarks[0] != null)
                Destroy(carvingMarks[0]);
            carvingMarks.RemoveAt(0);
        }
        Vector3 outward = new Vector3(at.X / (15f * 15f), 0f, at.Y / (10f * 10f)).normalized;
        Vector3 ground = new Vector3(at.X, 0f, at.Y);
        Vector3 pos = ground + outward * 0.6f;
        pos.y = CaveBuilder.GroundHeight(ground) + 1.4f;
        var mark = GameObject.CreatePrimitive(PrimitiveType.Cube);
        mark.name = "Carving";
        Destroy(mark.GetComponent<Collider>());
        mark.transform.SetPositionAndRotation(pos, Quaternion.LookRotation(-outward) * Quaternion.Euler(0f, 0f, 20f));
        mark.transform.localScale = new Vector3(0.06f, 0.45f, 0.04f);
        mark.GetComponent<Renderer>().sharedMaterial = EchoMaterials.Create(CarvingColor);
        carvingMarks.Add(mark);
        SoundBus.Emit(SoundKind.Carve, pos);
        MarkUsed(PromptKind.Carve);
    }

    // ---------- B. 天亮前 ----------

    float SecondsToDawn => (1f - Dawn.Fraction) * DawnClock.DefaultNightSeconds;

    void UpdateDawnStir(float dt)
    {
        float left = SecondsToDawn;
        echo.Ambient = DawnStir.Ambient(left);
        if (!DawnStir.Active(left))
            return;
        if (!stirHinted)
        {
            stirHinted = true;
            Hint(HintKind.DawnStir);
        }
        // 羊群被天光騷動：每 1.5 秒一隻羊叫（羊叫遮聲的規則照舊）。
        stirBleatTimer += dt;
        if (stirBleatTimer < DawnStir.BleatSeconds || sheep.Count == 0)
            return;
        stirBleatTimer = 0f;
        for (int tries = 0; tries < sheep.Count; tries++)
        {
            var s = sheep[Random.Range(0, sheep.Count)];
            if (s != null && s.isActiveAndEnabled)
            {
                s.Bleat();
                break;
            }
        }
    }

    /// <summary>天亮前羊叫淹沒一切：你聽巨人的距離縮成一半（恐懼半徑跟著縮）。</summary>
    float FeltDistance(float distance) => DawnStir.Active(SecondsToDawn) ? distance / DawnStir.HearingScale : distance;

    // ---------- F. 雅典娜的眷顧 ----------

    /// <summary>正面出手得到一分（已經有眷顧時）；第一次攢到 2 分時提示可以求她相助。</summary>
    void OnFavorPoint()
    {
        Hint(HintKind.FavorGained);
        if (Favor.MostPoints >= 2)
            Hint(HintKind.FavorSpendable);
    }

    /// <summary>花點數求雅典娜相助；點數不夠回傳 false。</summary>
    public bool UseBoon(FavorBoon boon)
    {
        if (!InNight || !Favor.Spend(boon))
            return false;
        MarkUsed(PromptKind.Favor);
        Unlock("boons");
        switch (boon)
        {
            case FavorBoon.Moonbeam:
                Layout.Boulder.Moonbeam(AthenaFavor.MoonbeamSeconds);
                sounds.PlayOwl(Layout.Boulder.GapPoint + Vector3.up * 2f);
                break;
            case FavorBoon.Oracle:
                favorMenu.ShowOracle(OracleLines());
                break;
            case FavorBoon.CaveFlash:
                // 和雷光一樣照亮整個洞一瞬，但不是聲音：巨人聽不到，也不算偷襲。
                echo.FlashAll(Vector3.up * 3f, CaveFlashColor);
                PlaytestDriver.Mark("flash");
                break;
        }
        return true;
    }

    /// <summary>神諭：必要引導鏈的下一步（詩兩行＋按鍵）；全部做完就是最後一句。</summary>
    (string, string, string) OracleLines()
    {
        var v = VerseBook.Essential(Essential.Step);
        if (v != null)
            return v.Value;
        return ("縫已打開，海風在呼喚", "帶著還活著的人，走出去", "E 鑽出去");
    }

    // ---------- 世界內提示（WorldPrompts 每幀來問） ----------

    /// <summary>延伸玩法的物體提示：拿酒囊、倒酒、刻記號、求雅典娜相助。</summary>
    public void ExtensionPrompts(List<(PromptKind Kind, string Text, Vector3 At)> into)
    {
        into.Clear();
        FindWineskin();
        Vector3 me = PlayerPosition;
        Vector3 ahead = body.CameraTransform.position + body.CameraTransform.forward * 1.6f - Vector3.up * 0.3f;
        if (!carryingWine && wineskin != null && !Wine.Empty && Flat(wineskin.position - me).magnitude <= WinePromptReach)
            into.Add((PromptKind.TakeWine, "E 拿起酒囊", wineskin.position + Vector3.up * 0.6f));
        if (carryingWine && !Wine.Empty)
            into.Add((PromptKind.Pour, "按住 G 倒酒", ahead));
        if (wallLinger >= CarvePromptAfter && Carved.Count < CarvePromptUntil)
            into.Add((PromptKind.Carve, "R 刻下記號", ahead));
        if (Favor.MostPoints >= 2 && Favor.Points >= 1 && favorMenu != null && !favorMenu.Open)
            into.Add((PromptKind.Favor, "Q 求雅典娜相助", ahead - Vector3.up * 0.25f));
    }
}
