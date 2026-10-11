using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 遊戲內的操作提示：靠近能互動的東西時，它能做的事全部浮在它上方（不排順序）；離開就消失。
/// 沒有特定物體的操作（走、拍手、射箭、放下木樁）是右下角石子圖示上方的小字按鍵說明，不擋畫面中央。
/// 同一種提示看到後做到 3 次就不再出現（PromptTracker）。文字加陰影、不加背景（規格第 19 節 D）。
/// </summary>
public class WorldPrompts : MonoBehaviour
{
    const float BoulderLift = 0.2f;
    const float GapLift = 0.1f;
    const float StakeLift = 0.6f;
    const float CrewLift = 1.45f;
    const float StuckNoticeReach = 3f;
    const float PerNightPromptSeconds = 20f;
    const float LegendScale = 0.75f;

    static readonly Color Text = new(0.97f, 0.95f, 0.88f);
    static readonly Color Shadow = new(0f, 0f, 0f, 0.85f);

    // 每行文字與它的提示種類（固定顯示的行沒有種類）；畫出來的種類記為「出現過」。
    readonly List<(string Text, PromptKind? Kind)> lines = new();
    BlindGameLoop loop;
    PromptTracker tracker;
    GUIStyle style, legendStyle;

    public void Init(BlindGameLoop loop, PromptTracker tracker)
    {
        this.loop = loop;
        this.tracker = tracker;
    }

    void OnGUI()
    {
        if (loop == null || loop.State.Phase != LoopPhase.Night)
            return;
        int fontSize = Mathf.Max(20, Screen.height / 34);
        if (style == null || style.fontSize != fontSize)
        {
            style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, alignment = TextAnchor.MiddleCenter, wordWrap = false };
            legendStyle = new GUIStyle(style) { fontSize = Mathf.RoundToInt(fontSize * LegendScale), alignment = TextAnchor.MiddleRight };
        }

        var player = loop.Player;
        Vector3 me = loop.PlayerPosition;
        Boulder boulder = loop.Layout.Boulder;

        // 巨石：能做的事全部列出。
        lines.Clear();
        if (player.AtBoulder && !loop.Slide.IsOpen)
        {
            Add(PromptKind.Push, "E 推・Shift＋E 猛推");
            if (player.Stones > 0 || loop.Slide.StoneWedges.Count > 0)
                Add(PromptKind.Wedge, "右鍵 塞石子當楔子（按住 拔回）");
            if (player.CarryingStake)
                Add(PromptKind.PlantStake, "G 插木樁");
        }
        DrawAt(boulder.PushPoint + Vector3.up * BoulderLift);

        // 縫
        lines.Clear();
        bool nearGap = Flat(boulder.GapPoint - me).magnitude <= StuckNoticeReach;
        if (loop.Rush.Stuck && nearGap)
            lines.Add(("有羊卡在縫裡：把巨石推開", null));
        else if (player.AtGap && !loop.Rush.GapClear)
            lines.Add(("有羊擠在縫裡", null));
        else if (player.AtGap)
        {
            if (loop.Crew.Crouching && loop.Crew.Followers.Count > 0)
                lines.Add(("隊伍還蹲著，不會跟你走：F 讓他們跟上", null));
            lines.Add(("E 鑽出去", PromptKind.Escape));
        }
        DrawAt(boulder.GapPoint + Vector3.up * GapLift);

        // 木樁
        lines.Clear();
        var stake = loop.Stake;
        if (!player.CarryingStake && Flat(stake.transform.position - me).magnitude <= EchoPlayer.StakeReach)
            Add(PromptKind.TakeStake, "E 拿起木樁");
        DrawAt(stake.transform.position + Vector3.up * StakeLift);

        // 同伴
        lines.Clear();
        var hiding = loop.Crew.NearestHiding(me, EchoPlayer.CrewReach);
        if (hiding != null)
        {
            Add(PromptKind.Recruit, "E 帶他走");
            DrawAt(hiding.transform.position + Vector3.up * CrewLift);
        }
        lines.Clear();
        var followers = loop.Crew.Followers;
        if (followers.Count > 0)
        {
            Add(PromptKind.Crouch, loop.Crew.Crouching ? "F 隊伍跟上" : "F 隊伍蹲下");
            DrawAt(followers[followers.Count - 1].transform.position + Vector3.up * CrewLift);
        }

        DrawCornerLegend(player);
    }

    /// <summary>
    /// 右下角石子圖示上方的小字按鍵說明，從圖示往上堆；符合條件且還沒學會的才畫。
    /// 位置對齊 BlindGameLoop.DrawStones（同一個字級公式）。
    /// </summary>
    void DrawCornerLegend(EchoPlayer player)
    {
        lines.Clear();
        // 走路只在每夜開頭提示。
        if (loop.Dawn.Elapsed < PerNightPromptSeconds)
            Add(PromptKind.Move, "WASD 走・Shift 跑");
        Add(PromptKind.Clap, "空白鍵 拍手：照亮四周（巨人也聽得到）");
        if (player.Arrows > 0 && !player.CarryingStake)
            Add(PromptKind.Shoot, "按住左鍵 拉弓・放開 射箭");
        if (player.CarryingStake && !player.AtBoulder)
            Add(PromptKind.DropStake, "G 放下木樁");
        if (player.Arrows > 0 && tracker.ShouldShow(PromptKind.Shoot))
            lines.Add(("箭：落點會照亮遠處、引開巨人（要撿回來）", null));
        if (player.Stones > 0 && tracker.ShouldShow(PromptKind.Wedge))
            lines.Add(("石子：塞進縫當楔子", null));
        if (lines.Count == 0)
            return;

        int hudFont = Mathf.Max(22, Screen.height / 28);
        float iconTop = Screen.height - hudFont * 3f - hudFont * 0.9f;
        float lineHeight = legendStyle.fontSize * 1.35f;
        for (int i = 0; i < lines.Count; i++)
        {
            float y = iconTop - 4f - (lines.Count - i) * lineHeight;
            var rect = new Rect(Screen.width - 810f, y, 800f, lineHeight);
            Label(rect, lines[i].Text, legendStyle);
            if (lines[i].Kind is PromptKind kind)
                tracker.MarkShown(kind, Time.time);
        }
    }

    void Add(PromptKind kind, string text)
    {
        if (tracker.ShouldShow(kind))
            lines.Add((text, kind));
    }

    void DrawAt(Vector3 world)
    {
        if (lines.Count == 0)
            return;
        Camera cam = loop.Body.Camera;
        Vector3 screen = cam.WorldToScreenPoint(world);
        if (screen.z <= 0f)
            return;
        // 站得很近時物體在視野上緣外：把提示夾在螢幕內，整疊字都看得到。
        float lineHeight = style.fontSize * 1.35f;
        float x = Mathf.Clamp(screen.x, 200f, Screen.width - 200f);
        float y = Mathf.Clamp(Screen.height - screen.y, lines.Count * lineHeight + 10f, Screen.height - 10f);
        DrawLines(new Vector2(x, y));
    }

    /// <summary>從錨點往上堆：最後一行貼著錨點。</summary>
    void DrawLines(Vector2 anchor)
    {
        float lineHeight = style.fontSize * 1.35f;
        for (int i = 0; i < lines.Count; i++)
        {
            float y = anchor.y - (lines.Count - i) * lineHeight;
            Label(new Rect(anchor.x - 400f, y, 800f, lineHeight), lines[i].Text, style);
            if (lines[i].Kind is PromptKind kind)
                tracker.MarkShown(kind, Time.time);
        }
    }

    static void Label(Rect rect, string text, GUIStyle style)
    {
        var shadowRect = rect;
        shadowRect.position += new Vector2(2f, 2f);
        style.normal.textColor = Shadow;
        GUI.Label(shadowRect, text, style);
        style.normal.textColor = Text;
        GUI.Label(rect, text, style);
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);
}
