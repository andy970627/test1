using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 主選單、暫停選單與洞中紀事（規格第 25 節 B）。主選單一開場就出現（開始／難度／紀事／離開）；
/// 夜晚中按 Tab 暫停（繼續／紀事／回主選單）；紀事分頁、遇到才解鎖。選單用不受暫停影響的時間。
/// </summary>
public class GameMenus : MonoBehaviour
{
    enum View { None, Main, Pause, Confirm, Chronicle, End }

    const float ToastSeconds = 3f;

    static readonly Color Text = new(0.97f, 0.95f, 0.88f);
    static readonly Color Dim = new(0.97f, 0.95f, 0.88f, 0.45f);
    static readonly Color Gold = new(0.85f, 0.72f, 0.42f);
    static readonly Color Shadow = new(0f, 0f, 0f, 0.85f);
    static readonly Color Veil = new(0f, 0f, 0f, 0.88f);

    static readonly string[] MainItems = { "開始", "難度", "紀事", "離開" };
    static readonly string[] PauseItems = { "繼續", "紀事", "回主選單" };
    static readonly string[] ConfirmItems = { "確定", "取消" };

    BlindGameLoop loop;
    View view;
    View chronicleReturn;
    int cursor;
    int page;
    DifficultyLevel difficulty = DifficultyLevel.Normal;
    float toastUntil = -1f;
    GUIStyle titleStyle, itemStyle, bodyStyle, smallStyle;

    public bool Open => view != View.None;

    public void Init(BlindGameLoop loop) => this.loop = loop;

    public void ShowMain(DifficultyLevel current)
    {
        difficulty = current;
        view = View.Main;
        cursor = 0;
        FreeCursor();
    }

    /// <summary>結局畫面：標題與副標，R 直接用同一個難度重新開始，Esc 回主選單。</summary>
    public void ShowEnd(string title, string subtitle, DifficultyLevel current)
    {
        endTitle = title;
        endSubtitle = subtitle;
        difficulty = current;
        view = View.End;
        FreeCursor();
    }

    string endTitle, endSubtitle;

    public void ShowPause()
    {
        view = View.Pause;
        cursor = 0;
        FreeCursor();
    }

    /// <summary>紀事第一次多了一則：右上角小字 3 秒。</summary>
    public void NotifyNewEntry() => toastUntil = Time.unscaledTime + ToastSeconds;

    static void FreeCursor()
    {
        Cursor.lockState = CursorLockMode.None;
        Cursor.visible = true;
    }

    void Update()
    {
        var k = Keyboard.current;
        if (k == null || loop == null)
            return;

        // 選單開著時游標一定要看得到（玩家物件的 Start 可能晚一步鎖住游標）。
        if (view != View.None && Cursor.lockState != CursorLockMode.None)
            FreeCursor();

        if (view == View.None)
        {
            if (k.tabKey.wasPressedThisFrame && loop.CanPause)
                loop.Pause();
            return;
        }

        if (itemStyle != null)
            HoverByMouse();
        string[] items = Items();
        if (items != null)
        {
            if (k.wKey.wasPressedThisFrame || k.upArrowKey.wasPressedThisFrame)
                cursor = (cursor + items.Length - 1) % items.Length;
            if (k.sKey.wasPressedThisFrame || k.downArrowKey.wasPressedThisFrame)
                cursor = (cursor + 1) % items.Length;
        }

        switch (view)
        {
            case View.Main:
                if (cursor == 1 && (k.aKey.wasPressedThisFrame || k.leftArrowKey.wasPressedThisFrame) && difficulty > DifficultyLevel.Familiar)
                    difficulty--;
                if (cursor == 1 && (k.dKey.wasPressedThisFrame || k.rightArrowKey.wasPressedThisFrame) && difficulty < DifficultyLevel.Hard)
                    difficulty++;
                if (Confirmed(k))
                    ChooseMain(cursor);
                break;
            case View.Pause:
                if (k.tabKey.wasPressedThisFrame || k.escapeKey.wasPressedThisFrame)
                    Resume();
                else if (Confirmed(k))
                    ChoosePause(cursor);
                break;
            case View.Confirm:
                if (k.escapeKey.wasPressedThisFrame)
                    ShowPause();
                else if (Confirmed(k))
                {
                    if (cursor == 0)
                    {
                        view = View.None;
                        loop.ReturnToMenu();
                    }
                    else
                        ShowPause();
                }
                break;
            case View.End:
                if (k.rKey.wasPressedThisFrame)
                {
                    view = View.None;
                    loop.RestartNow(difficulty);
                }
                else if (k.escapeKey.wasPressedThisFrame)
                    ShowMain(difficulty);
                break;
            case View.Chronicle:
                int pages = System.Enum.GetValues(typeof(GuidePage)).Length;
                if (k.wKey.wasPressedThisFrame || k.upArrowKey.wasPressedThisFrame || k.aKey.wasPressedThisFrame)
                    page = (page + pages - 1) % pages;
                if (k.sKey.wasPressedThisFrame || k.downArrowKey.wasPressedThisFrame || k.dKey.wasPressedThisFrame)
                    page = (page + 1) % pages;
                if (k.tabKey.wasPressedThisFrame || k.escapeKey.wasPressedThisFrame || k.backspaceKey.wasPressedThisFrame)
                {
                    view = chronicleReturn;
                    cursor = 0;
                }
                break;
        }
    }

    static bool Confirmed(Keyboard k) =>
        k.spaceKey.wasPressedThisFrame || k.enterKey.wasPressedThisFrame || k.numpadEnterKey.wasPressedThisFrame;

    string[] Items() => view switch
    {
        View.Main => MainItems,
        View.Pause => PauseItems,
        View.Confirm => ConfirmItems,
        _ => null,
    };

    void ChooseMain(int item)
    {
        switch (item)
        {
            case 0:
                view = View.None;
                loop.StartGame(difficulty);
                break;
            case 2:
                OpenChronicle(View.Main);
                break;
            case 3:
#if UNITY_EDITOR
                UnityEditor.EditorApplication.isPlaying = false;
#else
                Application.Quit();
#endif
                break;
        }
    }

    void ChoosePause(int item)
    {
        switch (item)
        {
            case 0:
                Resume();
                break;
            case 1:
                OpenChronicle(View.Pause);
                break;
            case 2:
                view = View.Confirm;
                cursor = 1;
                break;
        }
    }

    void OpenChronicle(View from)
    {
        chronicleReturn = from;
        view = View.Chronicle;
    }

    void Resume()
    {
        view = View.None;
        loop.Resume();
    }

    void OnGUI()
    {
        if (loop == null)
            return;
        GUI.depth = -20;
        EnsureStyles();
        HandleMouse();

        if (view == View.None)
        {
            if (Time.unscaledTime < toastUntil && loop.InNight)
            {
                float y = Screen.height * 0.62f;
                var old = smallStyle.alignment;
                smallStyle.alignment = TextAnchor.MiddleRight;
                Label(new Rect(Screen.width - 820f, y, 800f, smallStyle.fontSize * 1.5f), "紀事多了一則（Tab）", smallStyle, Gold);
                smallStyle.alignment = old;
            }
            return;
        }

        Fill(new Rect(0, 0, Screen.width, Screen.height), Veil);
        switch (view)
        {
            case View.Main:
                Label(new Rect(0, Screen.height * 0.16f, Screen.width, titleStyle.fontSize * 1.6f), "獨眼巨人的洞穴", titleStyle, Gold);
                DrawItems(MainItems, Screen.height * 0.4f, i => i == 1 ? $"難度：{Difficulty.Name(difficulty)}（A／D）" : MainItems[i]);
                if (cursor == 1)
                    Label(new Rect(0, Screen.height * 0.4f + itemStyle.fontSize * 1.8f * MainItems.Length + 10f, Screen.width, bodyStyle.fontSize * 1.6f),
                        Difficulty.Blurb(difficulty), bodyStyle, Dim);
                break;
            case View.Pause:
                Label(new Rect(0, Screen.height * 0.2f, Screen.width, titleStyle.fontSize * 1.6f), "暫停", titleStyle, Text);
                DrawItems(PauseItems, Screen.height * 0.4f, i => PauseItems[i]);
                break;
            case View.Confirm:
                Label(new Rect(0, Screen.height * 0.28f, Screen.width, bodyStyle.fontSize * 1.6f), "這一夜的進度會消失，確定回主選單？", bodyStyle, Text);
                DrawItems(ConfirmItems, Screen.height * 0.42f, i => ConfirmItems[i]);
                break;
            case View.Chronicle:
                DrawChronicle();
                break;
            case View.End:
                Label(new Rect(0, Screen.height * 0.3f, Screen.width, titleStyle.fontSize * 1.6f), endTitle, titleStyle, Gold);
                Label(new Rect(Screen.width * 0.1f, Screen.height * 0.3f + titleStyle.fontSize * 1.8f, Screen.width * 0.8f, bodyStyle.fontSize * 3f), endSubtitle, bodyStyle, Text);
                Label(new Rect(0, Screen.height * 0.72f, Screen.width, itemStyle.fontSize * 1.6f), "R 重新開始・Esc 回主選單", itemStyle, Dim);
                break;
        }
    }

    delegate string ItemText(int i);

    float ItemTop(float top, int i) => top + i * itemStyle.fontSize * 1.8f;

    /// <summary>滑鼠停在哪個選項上就選中（遊戲視窗不一定送 MouseMove 事件，改用滑鼠位置）。</summary>
    void HoverByMouse()
    {
        var m = Mouse.current;
        string[] items = Items();
        if (m == null || items == null || m.delta.ReadValue().sqrMagnitude < 0.01f)
            return;
        Vector2 p = m.position.ReadValue();
        p.y = Screen.height - p.y;
        float top = view == View.Confirm ? Screen.height * 0.42f : Screen.height * 0.4f;
        for (int i = 0; i < items.Length; i++)
            if (new Rect(Screen.width * 0.3f, ItemTop(top, i), Screen.width * 0.4f, itemStyle.fontSize * 1.6f).Contains(p))
                cursor = i;
    }

    void DrawItems(string[] items, float top, ItemText text)
    {
        for (int i = 0; i < items.Length; i++)
        {
            string s = text(i);
            if (i == cursor)
                s = $"〔 {s} 〕";
            Label(new Rect(0, ItemTop(top, i), Screen.width, itemStyle.fontSize * 1.6f), s, itemStyle, i == cursor ? Text : Dim);
        }
    }

    /// <summary>滑鼠移到選項上就選中，點一下就確認。</summary>
    void HandleMouse()
    {
        var e = Event.current;
        string[] items = Items();
        if (items == null || e == null)
            return;
        float top = view == View.Confirm ? Screen.height * 0.42f : Screen.height * 0.4f;
        for (int i = 0; i < items.Length; i++)
        {
            var r = new Rect(Screen.width * 0.3f, ItemTop(top, i), Screen.width * 0.4f, itemStyle.fontSize * 1.6f);
            if (!r.Contains(e.mousePosition))
                continue;
            if (e.type == EventType.MouseMove || e.type == EventType.MouseDrag)
                cursor = i;
            if (e.type == EventType.MouseDown && e.button == 0)
            {
                cursor = i;
                e.Use();
                if (view == View.Main) ChooseMain(i);
                else if (view == View.Pause) ChoosePause(i);
                else if (view == View.Confirm)
                {
                    if (i == 0) { view = View.None; loop.ReturnToMenu(); }
                    else ShowPause();
                }
            }
        }
    }

    void DrawChronicle()
    {
        var book = loop.Guide;
        Label(new Rect(0, Screen.height * 0.06f, Screen.width, titleStyle.fontSize * 1.4f), "洞中紀事", titleStyle, Gold);

        var pages = (GuidePage[])System.Enum.GetValues(typeof(GuidePage));
        float left = Screen.width * 0.08f;
        float top = Screen.height * 0.2f;
        float pageH = itemStyle.fontSize * 1.5f;
        var oldAlign = itemStyle.alignment;
        itemStyle.alignment = TextAnchor.MiddleLeft;
        for (int i = 0; i < pages.Length; i++)
            Label(new Rect(left, top + i * pageH, Screen.width * 0.22f, pageH),
                (i == page ? "▸ " : "   ") + GuideBook.PageName(pages[i]), itemStyle, i == page ? Text : Dim);
        itemStyle.alignment = oldAlign;

        float x = Screen.width * 0.33f;
        float width = Screen.width * 0.6f;
        float y = top;
        var oldBody = bodyStyle.alignment;
        bodyStyle.alignment = TextAnchor.MiddleLeft;
        foreach (var entry in book.EntriesOn(pages[page]))
        {
            bool open = book.IsUnlocked(entry.Id);
            Label(new Rect(x, y, width, bodyStyle.fontSize * 1.4f), open ? entry.Title : "尚未經歷", bodyStyle, open ? Gold : Dim);
            y += bodyStyle.fontSize * 1.4f;
            if (!open)
            {
                y += bodyStyle.fontSize * 0.4f;
                continue;
            }
            string text = entry.Text + LiveValue(entry.Id);
            float h = smallStyle.CalcHeight(new GUIContent(text), width);
            Label(new Rect(x, y, width, h), text, smallStyle, Text);
            y += h + bodyStyle.fontSize * 0.7f;
        }
        bodyStyle.alignment = oldBody;

        var oldSmall = smallStyle.alignment;
        smallStyle.alignment = TextAnchor.MiddleCenter;
        Label(new Rect(0, Screen.height - smallStyle.fontSize * 2.5f, Screen.width, smallStyle.fontSize * 1.5f), "W／S 換頁・Tab 返回", smallStyle, Dim);
        smallStyle.alignment = oldSmall;
    }

    /// <summary>巨人頁的兩條說明在夜晚中附上目前的值（原本在 F1 面板，使用者指定移到這裡）。</summary>
    string LiveValue(string id)
    {
        if (!loop.InNight)
            return "";
        var brain = loop.Cyclops.Brain;
        return id switch
        {
            "rock" => brain.ThrowCooldownLeft <= 0f ? "\n現在：可以丟" : $"\n現在：還要 {Mathf.CeilToInt(brain.ThrowCooldownLeft)} 秒",
            "decoy" => $"\n現在：被騙 {Mathf.Min(loop.Decoys.Fooled, DecoyMemory.FooledLimit)}／{DecoyMemory.FooledLimit}",
            _ => "",
        };
    }

    void EnsureStyles()
    {
        int title = Mathf.Max(30, Screen.height / 14);
        int item = Mathf.Max(22, Screen.height / 26);
        int body = Mathf.Max(20, Screen.height / 32);
        int small = Mathf.Max(18, Screen.height / 38);
        if (titleStyle != null && titleStyle.fontSize == title)
            return;
        titleStyle = new GUIStyle(GUI.skin.label) { fontSize = title, alignment = TextAnchor.MiddleCenter };
        itemStyle = new GUIStyle(GUI.skin.label) { fontSize = item, alignment = TextAnchor.MiddleCenter };
        bodyStyle = new GUIStyle(GUI.skin.label) { fontSize = body, alignment = TextAnchor.MiddleCenter, wordWrap = true };
        smallStyle = new GUIStyle(GUI.skin.label) { fontSize = small, alignment = TextAnchor.UpperLeft, wordWrap = true };
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

    static void Fill(Rect r, Color c)
    {
        var old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }
}
