using System;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 開場任務簡報（第一夜前，3 秒後才能按空白鍵開始，亂按跳不過去）與夜裡右上角的任務清單：
/// 推開巨石的進度、帶同伴的人數、天亮前還剩多久。
/// </summary>
public class MissionHud : MonoBehaviour
{
    const float BriefingLockSeconds = 3f;

    static readonly Color Text = new(0.97f, 0.95f, 0.88f);
    static readonly Color Dim = new(0.97f, 0.95f, 0.88f, 0.55f);
    static readonly Color Shadow = new(0f, 0f, 0f, 0.85f);
    static readonly Color Track = new(1f, 1f, 1f, 0.15f);
    static readonly Color BoulderBar = new(0.75f, 0.6f, 0.4f);
    static readonly Color DoneColor = new(0.55f, 0.9f, 0.6f);
    static readonly Color NightBar = new(0.05f, 0.08f, 0.25f);
    static readonly Color DawnBar = new(0.7f, 0.7f, 0.65f);

    BlindGameLoop loop;
    Action onStart;
    float briefingSince;
    GUIStyle titleStyle, bodyStyle, listStyle, choiceStyle;

    public bool BriefingOpen { get; private set; }

    float crewFlashUntil = -1f;
    static readonly Color FlashRed = new(0.9f, 0.2f, 0.15f);

    /// <summary>同伴被吃：「帶同伴」那行閃紅 1 秒。</summary>
    public void FlashCrew() => crewFlashUntil = Time.time + 1f;

    public void Init(BlindGameLoop loop) => this.loop = loop;

    /// <summary>開場簡報：一句目標（難度在主選單選）；3 秒後按空白鍵開始。</summary>
    public void ShowBriefing(Action onStart)
    {
        this.onStart = onStart;
        briefingSince = Time.time;
        BriefingOpen = true;
    }

    bool CanStart => Time.time - briefingSince >= BriefingLockSeconds;

    void Update()
    {
        var keyboard = Keyboard.current;
        if (!BriefingOpen || keyboard == null)
            return;
        if (!CanStart || !keyboard.spaceKey.wasPressedThisFrame)
            return;
        BriefingOpen = false;
        var start = onStart;
        onStart = null;
        start?.Invoke();
    }

    void OnGUI()
    {
        if (loop == null)
            return;
        // 簡報要蓋在 F1 除錯面板上面（depth 越小越上層）。
        GUI.depth = -10;
        EnsureStyles();
        if (BriefingOpen)
            DrawBriefing();
        else if (loop.State.Phase == LoopPhase.Night)
            DrawObjectives();
    }

    void EnsureStyles()
    {
        int title = Mathf.Max(28, Screen.height / 16);
        int body = Mathf.Max(18, Screen.height / 30);
        int list = Mathf.Max(18, Screen.height / 40);
        if (titleStyle != null && titleStyle.fontSize == title && bodyStyle.fontSize == body && listStyle.fontSize == list)
            return;
        titleStyle = new GUIStyle(GUI.skin.label) { fontSize = title, alignment = TextAnchor.MiddleCenter };
        choiceStyle = new GUIStyle(GUI.skin.label) { fontSize = body, alignment = TextAnchor.MiddleCenter, wordWrap = false };
        bodyStyle = new GUIStyle(GUI.skin.label) { fontSize = body, alignment = TextAnchor.MiddleLeft, wordWrap = true };
        listStyle = new GUIStyle(GUI.skin.label) { fontSize = list, alignment = TextAnchor.MiddleLeft, wordWrap = false };
    }

    void DrawBriefing()
    {
        Fill(new Rect(0, 0, Screen.width, Screen.height), new Color(0f, 0f, 0f, 0.8f));
        float width = Mathf.Min(Screen.width * 0.7f, bodyStyle.fontSize * 30f);
        float x = (Screen.width - width) / 2f;
        float y = Screen.height * 0.18f;

        Label(new Rect(0, y, Screen.width, titleStyle.fontSize * 1.5f), $"第 {loop.Roster.Night} 夜", titleStyle, Text);
        y += titleStyle.fontSize * 2f;

        // 只講目標；難度在主選單選，其他規則由提示與洞中紀事講（規格第 25 節）。
        const string goal = "目標：天亮前推開封住洞口的巨石，從縫裡鑽出去";
        float goalH = bodyStyle.CalcHeight(new GUIContent(goal), width);
        Label(new Rect(x, y, width, goalH), goal, bodyStyle, Text);
        y += goalH + bodyStyle.fontSize * 2f;
        Label(new Rect(x, y, width, choiceStyle.fontSize * 1.6f), $"難度：{Difficulty.Name(loop.Difficulty)}", choiceStyle, Dim);

        if (CanStart)
            Label(new Rect(0, Screen.height * 0.8f, Screen.width, titleStyle.fontSize), "空白鍵 開始", titleStyle, Dim);
    }

    /// <summary>右上角任務清單：推開巨石、帶同伴、天亮前。</summary>
    void DrawObjectives()
    {
        int font = listStyle.fontSize;
        float line = font * 1.5f;
        float width = Mathf.Max(Screen.width * 0.22f, listStyle.CalcSize(new GUIContent("帶同伴：跟隨 12／洞裡還有 12")).x);
        float x = Screen.width - width - 20f;
        float y = 20f;
        float barH = font * 0.35f;

        var slide = loop.Slide;
        bool open = slide.IsOpen;
        Label(new Rect(x, y, width, line), open ? "已推開：到縫前 E 鑽出去" : "推開巨石", listStyle, open ? DoneColor : Text);
        y += line;
        Bar(new Rect(x, y, width, barH), slide.Opening / BoulderSlide.FullOpen, open ? DoneColor : BoulderBar);
        y += barH + font * 0.6f;

        int following = loop.Crew.Followers.Count;
        int hiding = loop.Crew.Members.Count - following;
        Label(new Rect(x, y, width, line), $"帶同伴：跟隨 {following}／洞裡還有 {hiding}", listStyle,
            Time.time < crewFlashUntil && Mathf.Repeat(Time.time * 6f, 1f) < 0.6f ? FlashRed : Text);
        y += line;

        Label(new Rect(x, y, width, line), "天亮前", listStyle, Text);
        y += line;
        float dawn = loop.Dawn.Fraction;
        Bar(new Rect(x, y, width, barH), dawn, Color.Lerp(NightBar, DawnBar, dawn));
    }

    static void Label(Rect r, string text, GUIStyle style, Color color)
    {
        var shadow = r;
        shadow.position += new Vector2(2f, 2f);
        style.normal.textColor = Shadow;
        GUI.Label(shadow, text, style);
        style.normal.textColor = color;
        GUI.Label(r, text, style);
    }

    static void Bar(Rect r, float value, Color color)
    {
        Fill(r, Track);
        Fill(new Rect(r.x, r.y, r.width * Mathf.Clamp01(value), r.height), color);
    }

    static void Fill(Rect r, Color c)
    {
        var old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }
}
