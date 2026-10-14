using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 遊戲內的操作提示（規格第 26 節 A）：必要的「製造聲音 → 推 → 塞楔子 → 鑽出去」一次一行畫在下方中央；
/// 非必要的只在靠近同伴、木樁時浮在它們上方，其他讓玩家自己探索。
/// 同一種提示看到後做到 3 次就不再出現（PromptTracker）。文字加陰影、不加背景（規格第 19 節 D）。
/// </summary>
public class WorldPrompts : MonoBehaviour
{
    const float GapLift = 0.1f;
    const float StakeLift = 0.6f;
    const float CrewLift = 1.45f;
    const float StuckNoticeReach = 3f;
    const float EssentialHeight = 0.7f;

    static readonly Color Text = new(0.97f, 0.95f, 0.88f);
    static readonly Color Shadow = new(0f, 0f, 0f, 0.85f);

    // 每行文字與它的提示種類（固定顯示的行沒有種類）；畫出來的種類記為「出現過」。
    readonly List<(string Text, PromptKind? Kind)> lines = new();
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
        {
            style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, alignment = TextAnchor.MiddleCenter, wordWrap = false };
        }

        var player = loop.Player;
        Vector3 me = loop.PlayerPosition;
        Boulder boulder = loop.Layout.Boulder;

        // 巨石前不再列操作：推、塞楔子、鑽出去由必要引導那一行帶；猛推、拔楔子、插木樁讓玩家自己探索（規格第 26 節 A）。
        // 縫
        lines.Clear();
        bool nearGap = Flat(boulder.GapPoint - me).magnitude <= StuckNoticeReach;
        if (loop.Rush.Stuck && nearGap)
            lines.Add(("有羊卡在縫裡", null));
        else if (player.AtGap && !loop.Rush.GapClear)
            lines.Add(("有羊擠在縫裡", null));
        else if (player.AtGap)
        {
            if (loop.Crew.Crouching && loop.Crew.Followers.Count > 0)
                lines.Add(("F 讓蹲著的隊伍跟上", null));
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

        DrawEssential();
    }

    /// <summary>必要引導（規格第 26 節 A）：畫面下方中央一次只有一行，做到才換下一步。</summary>
    void DrawEssential()
    {
        string text = loop.Essential.Text;
        if (text == null)
            return;
        float lineHeight = style.fontSize * 1.35f;
        Label(new Rect(0f, Screen.height * EssentialHeight, Screen.width, lineHeight), text, style);
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
