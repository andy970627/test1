using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 遊戲內的操作提示：靠近能互動的東西時，提示浮在它上方；離開就消失。
/// 同一種提示用過 3 次就不再出現（PromptTracker）。文字加陰影、不加背景。
/// </summary>
public class WorldPrompts : MonoBehaviour
{
    const float BoulderLift = 0.2f;
    const float GapLift = 0.1f;
    const float StakeLift = 0.6f;
    const float CrewLift = 1.45f;
    const float CenterHeight = 0.62f;
    const float StuckNoticeReach = 3f;

    static readonly Color Text = new(0.97f, 0.95f, 0.88f);
    static readonly Color Shadow = new(0f, 0f, 0f, 0.85f);

    readonly List<string> lines = new();
    BlindGameLoop loop;
    PromptTracker tracker;
    GUIStyle style;

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
            style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, alignment = TextAnchor.MiddleCenter, wordWrap = false };

        var player = loop.Player;
        Vector3 me = loop.PlayerPosition;
        Boulder boulder = loop.Layout.Boulder;

        // 巨石
        lines.Clear();
        if (player.AtBoulder && !loop.Slide.IsOpen)
        {
            Add(PromptKind.Push, "E 推・Shift＋E 猛推");
            if (player.Stones > 0 || loop.Slide.StoneWedges.Count > 0)
                Add(PromptKind.Wedge, "右鍵 塞楔子（按住 拔回）");
            if (player.CarryingStake)
                Add(PromptKind.PlantStake, "G 插木樁");
        }
        DrawAt(boulder.PushPoint + Vector3.up * BoulderLift);

        // 縫
        lines.Clear();
        bool nearGap = Flat(boulder.GapPoint - me).magnitude <= StuckNoticeReach;
        if (loop.Rush.Stuck && nearGap)
            lines.Add("有羊卡在縫裡：把巨石推開");
        else if (player.AtGap && !loop.Rush.GapClear)
            lines.Add("有羊擠在縫裡");
        else if (player.AtGap)
            lines.Add("E 鑽出去");
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

        // 準星下方：沒有特定物體的操作
        lines.Clear();
        Add(PromptKind.Move, "WASD 走・Shift 跑");
        Add(PromptKind.Clap, "Q 拍手 照亮四周");
        if (player.Stones > 0 && !player.CarryingStake)
            Add(PromptKind.Throw, "左鍵 丟石子");
        if (player.CarryingStake && !player.AtBoulder)
            Add(PromptKind.DropStake, "G 放下木樁");
        DrawLines(new Vector2(Screen.width / 2f, Screen.height * CenterHeight));
    }

    void Add(PromptKind kind, string text)
    {
        if (tracker.ShouldShow(kind))
            lines.Add(text);
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
            var rect = new Rect(anchor.x - 400f, y, 800f, lineHeight);
            var shadowRect = rect;
            shadowRect.position += new Vector2(2f, 2f);
            style.normal.textColor = Shadow;
            GUI.Label(shadowRect, lines[i], style);
            style.normal.textColor = Text;
            GUI.Label(rect, lines[i], style);
        }
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);
}
