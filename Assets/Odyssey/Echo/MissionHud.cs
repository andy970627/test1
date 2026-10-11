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
    Action<DifficultyLevel> onStart;
    DifficultyLevel selected;
    float briefingSince;
    GUIStyle titleStyle, bodyStyle, listStyle, choiceStyle;

    public bool BriefingOpen { get; private set; }

    public void Init(BlindGameLoop loop) => this.loop = loop;

    /// <summary>開場簡報：一句目標＋選難度（預設上次選的）；3 秒後按空白鍵開始，回傳選的難度。</summary>
    public void ShowBriefing(DifficultyLevel current, Action<DifficultyLevel> onStart)
    {
        this.onStart = onStart;
        selected = current;
        briefingSince = Time.time;
        BriefingOpen = true;
    }

    bool CanStart => Time.time - briefingSince >= BriefingLockSeconds;

    void Update()
    {
        var keyboard = Keyboard.current;
        if (!BriefingOpen || keyboard == null)
            return;
        if ((keyboard.aKey.wasPressedThisFrame || keyboard.leftArrowKey.wasPressedThisFrame) && selected > DifficultyLevel.Familiar)
            selected--;
        if ((keyboard.dKey.wasPressedThisFrame || keyboard.rightArrowKey.wasPressedThisFrame) && selected < DifficultyLevel.Hard)
            selected++;
        if (keyboard.digit1Key.wasPressedThisFrame)
            selected = DifficultyLevel.Familiar;
        if (keyboard.digit2Key.wasPressedThisFrame)
            selected = DifficultyLevel.Normal;
        if (keyboard.digit3Key.wasPressedThisFrame)
            selected = DifficultyLevel.Hard;
        if (!CanStart || !keyboard.spaceKey.wasPressedThisFrame)
            return;
        BriefingOpen = false;
        var start = onStart;
        onStart = null;
        start?.Invoke(selected);
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

        // 只講目標；其他規則由物體提示與情境提示在用得到時講（規格第 17、18 節）。
        const string goal = "目標：天亮前把封住洞口的巨石推開，從縫裡鑽出去。";
        float goalH = bodyStyle.CalcHeight(new GUIContent(goal), width);
        Label(new Rect(x, y, width, goalH), goal, bodyStyle, Text);
        y += goalH + bodyStyle.fontSize * 2f;

        // 難度：三選一，選中的亮、其他暗；底下一句說明。
        float slot = width / 3f;
        float rowH = choiceStyle.fontSize * 1.6f;
        for (int i = 0; i < 3; i++)
        {
            var level = (DifficultyLevel)i;
            string name = level == selected ? $"［ {Difficulty.Name(level)} ］" : Difficulty.Name(level);
            Label(new Rect(x + slot * i, y, slot, rowH), name, choiceStyle, level == selected ? Text : Dim);
        }
        y += rowH;
        Label(new Rect(x, y, width, rowH), Difficulty.Blurb(selected), choiceStyle, Text);
        y += rowH;
        Label(new Rect(x, y, width, rowH), "A／D 選難度", choiceStyle, Dim);

        if (CanStart)
            Label(new Rect(0, Screen.height * 0.8f, Screen.width, titleStyle.fontSize), "按空白鍵開始", titleStyle, Dim);
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
        Label(new Rect(x, y, width, line), open ? "已推開：到縫前按 E 鑽出去" : "推開巨石", listStyle, open ? DoneColor : Text);
        y += line;
        Bar(new Rect(x, y, width, barH), slide.Opening / BoulderSlide.FullOpen, open ? DoneColor : BoulderBar);
        y += barH + font * 0.6f;

        int following = loop.Crew.Followers.Count;
        int hiding = loop.Crew.Members.Count - following;
        Label(new Rect(x, y, width, line), $"帶同伴：跟隨 {following}／洞裡還有 {hiding}", listStyle, Text);
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
