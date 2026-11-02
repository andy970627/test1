using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 主選單、暫停選單、結局畫面、實驗頁與洞中紀事（規格第 25 節 B、第 27～29 節）。
/// 每個選單畫面都有同一組功能（使用者回饋「把主選單功能加到所有選單畫面」）：難度、紀事、實驗、回主選單、離開；
/// 主選單另有「開始」、暫停另有「繼續」、結局另有「重新開始」（R）。選單用不受暫停影響的時間。
/// </summary>
public class GameMenus : MonoBehaviour
{
    enum View { None, Main, Pause, Confirm, Chronicle, End, Lab }

    const float ToastSeconds = 3f;
    const string Start = "開始", Continue = "繼續", Restart = "重新開始", DifficultyItem = "難度",
        Chronicle = "紀事", Lab = "實驗", ToMenu = "回主選單", Quit = "離開", Back = "返回",
        Yes = "確定", No = "取消", PassiveItem = "被動聲音照亮", GuideItem = "必要引導",
        ZeusItem = "宙斯法則", StyleItem = "引導風格", TerrorItem = "恐懼半徑";

    static readonly Color Text = new(0.97f, 0.95f, 0.88f);
    static readonly Color Dim = new(0.97f, 0.95f, 0.88f, 0.45f);
    static readonly Color Gold = new(0.85f, 0.72f, 0.42f);
    static readonly Color Shadow = new(0f, 0f, 0f, 0.85f);
    static readonly Color Veil = new(0f, 0f, 0f, 0.88f);

    static readonly string[] MainItems = { Start, DifficultyItem, Chronicle, Lab, Quit };
    static readonly string[] PauseItems = { Continue, DifficultyItem, Chronicle, Lab, ToMenu, Quit };
    static readonly string[] EndItems = { Restart, DifficultyItem, Chronicle, Lab, ToMenu, Quit };
    static readonly string[] LabItems = { PassiveItem, GuideItem, ZeusItem, StyleItem, TerrorItem, Back };
    static readonly string[] ConfirmItems = { Yes, No };

    BlindGameLoop loop;
    View view;
    View chronicleReturn, labReturn;
    int cursor;
    int page;
    DifficultyLevel difficulty = DifficultyLevel.Normal;
    float toastUntil = -1f;
    string endTitle, endSubtitle;
    GUIStyle titleStyle, itemStyle, bodyStyle, smallStyle;

    public bool Open => view != View.None;

    public void Init(BlindGameLoop loop) => this.loop = loop;

    public void ShowMain(DifficultyLevel current)
    {
        difficulty = current;
        Go(View.Main);
    }

    /// <summary>結局畫面：標題與副標；R 或「重新開始」直接用同一個難度重新開始（不看開場卡片）。</summary>
    public void ShowEnd(string title, string subtitle, DifficultyLevel current)
    {
        endTitle = title;
        endSubtitle = subtitle;
        difficulty = current;
        Go(View.End);
    }

    public void ShowPause()
    {
        difficulty = loop.Difficulty;
        Go(View.Pause);
    }

    /// <summary>紀事第一次多了一則：小字 3 秒。</summary>
    public void NotifyNewEntry() => toastUntil = Time.unscaledTime + ToastSeconds;

    void Go(View next, int at = 0)
    {
        view = next;
        cursor = at;
        FreeCursor();
    }

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

        if (view == View.Chronicle)
        {
            UpdateChronicle(k);
            return;
        }

        if (itemStyle != null)
            HoverByMouse();
        string[] items = Items();
        if (k.wKey.wasPressedThisFrame || k.upArrowKey.wasPressedThisFrame)
            cursor = (cursor + items.Length - 1) % items.Length;
        if (k.sKey.wasPressedThisFrame || k.downArrowKey.wasPressedThisFrame)
            cursor = (cursor + 1) % items.Length;

        bool left = k.aKey.wasPressedThisFrame || k.leftArrowKey.wasPressedThisFrame;
        bool right = k.dKey.wasPressedThisFrame || k.rightArrowKey.wasPressedThisFrame;
        if (left || right)
            Adjust(items[cursor], left ? -1 : 1);

        if (view == View.End && k.rKey.wasPressedThisFrame)
            Choose(Restart);
        else if (k.escapeKey.wasPressedThisFrame || (k.tabKey.wasPressedThisFrame && view != View.Main))
            GoBack();
        else if (Confirmed(k))
            Choose(items[cursor]);
    }

    void UpdateChronicle(Keyboard k)
    {
        int pages = System.Enum.GetValues(typeof(GuidePage)).Length;
        if (k.wKey.wasPressedThisFrame || k.upArrowKey.wasPressedThisFrame || k.aKey.wasPressedThisFrame)
            page = (page + pages - 1) % pages;
        if (k.sKey.wasPressedThisFrame || k.downArrowKey.wasPressedThisFrame || k.dKey.wasPressedThisFrame)
            page = (page + 1) % pages;
        if (k.tabKey.wasPressedThisFrame || k.escapeKey.wasPressedThisFrame || k.backspaceKey.wasPressedThisFrame)
            Go(chronicleReturn, IndexOf(chronicleReturn, Chronicle));
    }

    static bool Confirmed(Keyboard k) =>
        k.spaceKey.wasPressedThisFrame || k.enterKey.wasPressedThisFrame || k.numpadEnterKey.wasPressedThisFrame;

    string[] Items() => ItemsOf(view);

    static string[] ItemsOf(View v) => v switch
    {
        View.Main => MainItems,
        View.Pause => PauseItems,
        View.End => EndItems,
        View.Lab => LabItems,
        View.Confirm => ConfirmItems,
        _ => null,
    };

    static int IndexOf(View v, string item) => Mathf.Max(0, System.Array.IndexOf(ItemsOf(v) ?? new string[0], item));

    /// <summary>A／D 切換：難度、實驗頁的開關。暫停中改難度立刻套用到這一夜。</summary>
    void Adjust(string item, int dir)
    {
        switch (item)
        {
            case DifficultyItem:
                var next = (DifficultyLevel)Mathf.Clamp((int)difficulty + dir, (int)DifficultyLevel.Familiar, (int)DifficultyLevel.Hard);
                if (next == difficulty)
                    return;
                difficulty = next;
                if (view == View.Pause)
                    loop.SetDifficulty(difficulty);
                break;
            case PassiveItem:
                loop.Flags.Passive = (PassiveLight)Mathf.Clamp((int)loop.Flags.Passive + dir, (int)PassiveLight.Off, (int)PassiveLight.Full);
                break;
            case GuideItem:
                loop.Flags.EssentialGuide = !loop.Flags.EssentialGuide;
                break;
            case ZeusItem:
                loop.Flags.ZeusLaw = !loop.Flags.ZeusLaw;
                break;
            case StyleItem:
                loop.Flags.Guide = loop.Flags.Guide == GuideStyle.Verse ? GuideStyle.Plain : GuideStyle.Verse;
                break;
            case TerrorItem:
                loop.Flags.Terror = (TerrorMode)Mathf.Clamp((int)loop.Flags.Terror + dir, (int)TerrorMode.Layered, (int)TerrorMode.Off);
                break;
        }
    }

    void Choose(string item)
    {
        switch (item)
        {
            case Start:
                view = View.None;
                loop.StartGame(difficulty);
                break;
            case Continue:
                view = View.None;
                loop.Resume();
                break;
            case Restart:
                view = View.None;
                loop.RestartNow(difficulty);
                break;
            case Chronicle:
                chronicleReturn = view;
                Go(View.Chronicle);
                break;
            case Lab:
                labReturn = view;
                Go(View.Lab);
                break;
            case ToMenu:
                if (view == View.Pause)
                    Go(View.Confirm, 1);
                else
                    ShowMain(difficulty);
                break;
            case Yes:
                view = View.None;
                loop.ReturnToMenu();
                break;
            case No:
                Go(View.Pause, IndexOf(View.Pause, ToMenu));
                break;
            case Back:
                Go(labReturn, IndexOf(labReturn, Lab));
                break;
            case Quit:
#if UNITY_EDITOR
                UnityEditor.EditorApplication.isPlaying = false;
#else
                Application.Quit();
#endif
                break;
        }
    }

    /// <summary>Esc（暫停中也可 Tab）：回上一層；主選單與結局畫面沒有上一層。</summary>
    void GoBack()
    {
        switch (view)
        {
            case View.Pause:
                Choose(Continue);
                break;
            case View.Confirm:
                Choose(No);
                break;
            case View.Lab:
                Choose(Back);
                break;
            case View.End:
                ShowMain(difficulty);
                break;
        }
    }

    float MenuTop() => view switch
    {
        View.Confirm => Screen.height * 0.42f,
        View.End => Screen.height * 0.46f,
        _ => Screen.height * 0.36f,
    };

    string ItemLabel(string item) => item switch
    {
        DifficultyItem => $"難度：{Difficulty.Name(difficulty)}（A／D）",
        PassiveItem => $"被動聲音照亮：{DesignFlags.Name(loop.Flags.Passive)}（A／D）",
        GuideItem => $"必要引導：{(loop.Flags.EssentialGuide ? "開" : "關")}（A／D）",
        ZeusItem => $"宙斯法則：{DesignFlags.Name(loop.Flags.ZeusLaw)}（A／D）",
        StyleItem => $"引導風格：{DesignFlags.Name(loop.Flags.Guide)}（A／D）",
        TerrorItem => $"恐懼半徑：{DesignFlags.Name(loop.Flags.Terror)}（A／D）",
        Restart => "重新開始（R）",
        _ => item,
    };

    string ItemNote(string item) => item switch
    {
        DifficultyItem => Difficulty.Blurb(difficulty) + (view == View.Pause ? "（立刻套用）" : ""),
        PassiveItem => "巨人腳步、羊叫、同伴嗚咽、腳步聲要不要照亮四周",
        GuideItem => "製造聲音 → 推 → 塞楔子 → 鑽出去 的一步一步提示",
        ZeusItem => "打中沒聽見你的巨人算偷襲，招來宙斯的雷鳴；關掉時一律算正面出手",
        StyleItem => "提示用吟遊詩人的詩句，或只有按鍵的一行",
        TerrorItem => "巨人靠近時的心跳與配樂：分層（16 m 起）／舊版（8 m 心跳）／關",
        Lab => "切換設計來比較，開關會記在實測紀錄裡",
        _ => null,
    };

    void OnGUI()
    {
        OdysseyFonts.UseForGui();
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
        if (view == View.Chronicle)
        {
            DrawChronicle();
            return;
        }

        switch (view)
        {
            case View.Main:
                Label(new Rect(0, Screen.height * 0.14f, Screen.width, titleStyle.fontSize * 1.6f), "獨眼巨人的洞穴", titleStyle, Gold);
                break;
            case View.Pause:
                Label(new Rect(0, Screen.height * 0.14f, Screen.width, titleStyle.fontSize * 1.6f), "暫停", titleStyle, Text);
                Label(new Rect(0, Screen.height * 0.14f + titleStyle.fontSize * 1.6f, Screen.width, bodyStyle.fontSize * 1.6f),
                    $"第 {loop.Roster.Night} 夜・跟隨 {loop.Crew.Followers.Count}／洞裡還有 {loop.Crew.Members.Count - loop.Crew.Followers.Count}", bodyStyle, Dim);
                break;
            case View.Confirm:
                Label(new Rect(0, Screen.height * 0.28f, Screen.width, bodyStyle.fontSize * 1.6f), "這一夜的進度會消失，確定回主選單？", bodyStyle, Text);
                break;
            case View.Lab:
                Label(new Rect(0, Screen.height * 0.14f, Screen.width, titleStyle.fontSize * 1.6f), "實驗", titleStyle, Gold);
                break;
            case View.End:
                Label(new Rect(0, Screen.height * 0.16f, Screen.width, titleStyle.fontSize * 1.6f), endTitle, titleStyle, Gold);
                Label(new Rect(Screen.width * 0.1f, Screen.height * 0.16f + titleStyle.fontSize * 1.8f, Screen.width * 0.8f, bodyStyle.fontSize * 3f), endSubtitle, bodyStyle, Text);
                break;
        }

        string[] items = Items();
        float top = MenuTop();
        DrawItems(items, top);
        string note = ItemNote(items[cursor]);
        if (note != null)
            Label(new Rect(0, ItemTop(top, items.Length) + 6f, Screen.width, bodyStyle.fontSize * 1.6f), note, bodyStyle, Dim);
    }

    float ItemTop(float top, int i) => top + i * itemStyle.fontSize * 1.6f;

    Rect ItemRect(float top, int i) => new(Screen.width * 0.3f, ItemTop(top, i), Screen.width * 0.4f, itemStyle.fontSize * 1.5f);

    /// <summary>滑鼠停在哪個選項上就選中（遊戲視窗不一定送 MouseMove 事件，改用滑鼠位置）。</summary>
    void HoverByMouse()
    {
        var m = Mouse.current;
        string[] items = Items();
        if (m == null || items == null || m.delta.ReadValue().sqrMagnitude < 0.01f)
            return;
        Vector2 p = m.position.ReadValue();
        p.y = Screen.height - p.y;
        float top = MenuTop();
        for (int i = 0; i < items.Length; i++)
            if (ItemRect(top, i).Contains(p))
                cursor = i;
    }

    void DrawItems(string[] items, float top)
    {
        for (int i = 0; i < items.Length; i++)
        {
            string s = ItemLabel(items[i]);
            if (i == cursor)
                s = $"〔 {s} 〕";
            Label(new Rect(0, ItemTop(top, i), Screen.width, itemStyle.fontSize * 1.5f), s, itemStyle, i == cursor ? Text : Dim);
        }
    }

    /// <summary>滑鼠點選項就確認；點有 A／D 的選項（難度、開關）就往右切一格。</summary>
    void HandleMouse()
    {
        var e = Event.current;
        string[] items = Items();
        if (items == null || e == null || e.type != EventType.MouseDown || e.button != 0)
            return;
        float top = MenuTop();
        for (int i = 0; i < items.Length; i++)
        {
            if (!ItemRect(top, i).Contains(e.mousePosition))
                continue;
            cursor = i;
            e.Use();
            if (items[i] is DifficultyItem or PassiveItem or GuideItem or ZeusItem or StyleItem or TerrorItem)
                Adjust(items[i], 1);
            else
                Choose(items[i]);
            return;
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
