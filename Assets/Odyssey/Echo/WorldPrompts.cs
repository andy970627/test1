using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 遊戲內的操作提示（規格第 26 節 A；少用文字設計第 3 節 A、第 8.4 節）。
/// 無字／鍵帽風格：必要引導「彈 → 推 → 塞楔子 → 鑽出去」與物體提示（木樁、同伴、隊伍）都用第一人稱雙手的手勢帶，
/// 旁邊浮一個鍵帽圖示（空白鍵、滑鼠用形狀，E／F 用字母）。無字風格的鍵帽只在這種提示第一次出現時畫，
/// 鍵帽風格每次都畫；同一種提示做到 3 次就不再出現（PromptTracker）。
/// 詩句風格：維持原本的文字——必要引導是吟遊詩人的兩行詩加按鍵小字，物體提示是一行字。
/// </summary>
public class WorldPrompts : MonoBehaviour
{
    const float GapLift = 0.1f;
    const float StakeLift = 0.6f;
    const float CrewLift = 1.45f;
    const float EssentialHeight = 0.7f;
    const float CapSizeFraction = 1f / 18f;

    static readonly Color Text = OdysseyPalette.Parchment;
    static readonly Color Shadow = OdysseyPalette.TextShadow;

    // 每行文字與它的提示種類（固定顯示的行沒有種類）；畫出來的種類記為「出現過」。
    readonly List<(string Text, PromptKind? Kind)> lines = new();
    // 這一幀要畫的鍵帽：世界座標、按鍵、種類。
    readonly List<(Vector3 World, CueKey Key, PromptKind Kind)> caps = new();
    readonly Dictionary<PromptKind, int> shows = new();
    readonly HashSet<PromptKind> visibleLast = new(), visibleNow = new();

    BlindGameLoop loop;
    PromptTracker tracker;
    GUIStyle style, keyStyle;

    BardVerse verse;
    int pluckDegree;
    SoundPlayer sounds;
    TerrorMusic music;

    public void Init(BlindGameLoop loop, PromptTracker tracker)
    {
        this.loop = loop;
        this.tracker = tracker;
    }

    GuideStyle Style => loop.Flags.Guide;

    void Update()
    {
        if (loop == null)
            return;
        bool night = loop.State.Phase == LoopPhase.Night;
        if (night && !GuideCues.ShowText(Style))
            UpdateCues();
        else if (loop.Hands != null)
            loop.Hands.Hint = Gesture.None;

        // 詩句風格的必要引導：兩行詩一行一行淡入、每行撥一聲里拉琴。
        string keys = night && loop.Flags.EssentialGuide ? loop.Essential.Text : null;
        var verseLines = loop.Essential.Verse;
        if (keys != null && loop.VersesShown && verseLines.HasValue)
        {
            if (verse == null || verse.Keys != keys || verse.Finished)
                verse = new BardVerse(verseLines.Value.Item1, verseLines.Value.Item2, keys);
        }
        else if (verse != null && !verse.Finished)
            verse.Complete();
        if (verse == null)
            return;
        verse.Tick(Time.deltaTime);
        sounds ??= GetComponent<SoundPlayer>();
        music ??= GetComponent<TerrorMusic>();
        for (int n = verse.TakePlucks(); n > 0; n--)
        {
            sounds?.PlayLyre(pluckDegree, 0.35f);
            pluckDegree = (pluckDegree + 2) % 8;
        }
        if (!verse.Finished)
            music?.Duck(0.1f);
    }

    /// <summary>無字／鍵帽風格：決定這一幀的手勢與鍵帽。必要引導優先，其次是離得近的物體。</summary>
    void UpdateCues()
    {
        caps.Clear();
        visibleNow.Clear();
        var hands = loop.Hands;
        var player = loop.Player;
        Vector3 me = loop.PlayerPosition;
        Boulder boulder = loop.Layout.Boulder;
        Gesture gesture = Gesture.None;
        Vector3 reach = Vector3.zero;

        // 必要引導：這一步到了出現條件才有手勢。
        if (loop.Flags.EssentialGuide && loop.Essential.Text != null)
        {
            var step = loop.Essential.Step;
            var cue = GuideCues.Essential(step, true);
            gesture = cue.Gesture;
            CueKey key = cue.Key;
            if (gesture == Gesture.ReachGap)
                reach = boulder.GapPoint;
            PromptKind kind = GuideCues.PromptOf(step);
            visibleNow.Add(kind);
            if (hands != null && hands.HintShown)
                caps.Add((hands.CueAnchor, key, kind));
        }

        // 物體提示：靠近才看得到的東西。手勢只給一個（最近的），鍵帽各自畫在物體上。
        float best = float.MaxValue;
        void Consider(PromptKind kind, Vector3 at, float lift)
        {
            if (!tracker.ShouldShow(kind))
                return;
            visibleNow.Add(kind);
            caps.Add((at + Vector3.up * lift, GuideCues.KeyOf(kind), kind));
            float d = Flat(at - me).magnitude;
            if (gesture == Gesture.None && d < best)
            {
                best = d;
                reach = at + Vector3.up * lift * 0.5f;
            }
        }

        var stake = loop.Stake;
        if (!player.CarryingStake && Flat(stake.transform.position - me).magnitude <= EchoPlayer.StakeReach)
            Consider(PromptKind.TakeStake, stake.transform.position, StakeLift);
        var hiding = loop.Crew.NearestHiding(me, EchoPlayer.CrewReach);
        if (hiding != null)
            Consider(PromptKind.Recruit, hiding.transform.position, CrewLift);
        var followers = loop.Crew.Followers;
        if (followers.Count > 0)
        {
            Vector3 last = followers[followers.Count - 1].transform.position;
            if (player.AtGap && loop.Rush.GapClear && loop.Crew.Crouching)
                caps.Add((last + Vector3.up * CrewLift, CueKey.F, PromptKind.Crouch)); // 隊伍蹲著不會跟你走：每次都提醒
            else if (tracker.ShouldShow(PromptKind.Crouch))
            {
                visibleNow.Add(PromptKind.Crouch);
                caps.Add((last + Vector3.up * CrewLift, CueKey.F, PromptKind.Crouch));
            }
        }
        if (gesture == Gesture.None && best < float.MaxValue)
            gesture = Gesture.ReachOut;

        if (hands != null)
        {
            hands.Hint = gesture;
            hands.ReachTarget = reach;
        }

        // 第一次出現的計數（無字風格的鍵帽只畫第一次）。
        foreach (var kind in visibleNow)
            if (!visibleLast.Contains(kind))
                shows[kind] = (shows.TryGetValue(kind, out int n) ? n : 0) + 1;
        visibleLast.Clear();
        visibleLast.UnionWith(visibleNow);
    }

    void OnGUI()
    {
        OdysseyFonts.UseForGui();
        if (loop == null || loop.State.Phase != LoopPhase.Night)
            return;
        int fontSize = Mathf.Max(20, Screen.height / 34);
        if (style == null || style.fontSize != fontSize)
            style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, alignment = TextAnchor.MiddleCenter, wordWrap = false };

        if (!GuideCues.ShowText(Style))
        {
            DrawCaps();
            return;
        }

        var player = loop.Player;
        Vector3 me = loop.PlayerPosition;
        Boulder boulder = loop.Layout.Boulder;

        // 縫前：隊伍蹲著不會跟你走。
        lines.Clear();
        if (player.AtGap && loop.Rush.GapClear && loop.Crew.Crouching && loop.Crew.Followers.Count > 0)
            lines.Add(("F 讓蹲著的隊伍跟上", null));
        DrawAt(boulder.GapPoint + Vector3.up * GapLift);

        lines.Clear();
        var stake = loop.Stake;
        if (!player.CarryingStake && Flat(stake.transform.position - me).magnitude <= EchoPlayer.StakeReach)
            Add(PromptKind.TakeStake, "E 拿起木樁");
        DrawAt(stake.transform.position + Vector3.up * StakeLift);

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

    /// <summary>鍵帽：畫在手或物體上方，碰到介面保護區就推開。</summary>
    void DrawCaps()
    {
        Camera cam = loop.Body.Camera;
        float size = Screen.height * CapSizeFraction;
        foreach (var (world, key, kind) in caps)
        {
            tracker.MarkShown(kind, Time.time);
            int before = (shows.TryGetValue(kind, out int n) ? n : 0) - 1;
            if (!GuideCues.ShowCap(Style, Mathf.Max(0, before)))
                continue;
            Vector3 s = cam.WorldToScreenPoint(world);
            if (s.z <= 0f)
                continue;
            float x = Mathf.Clamp(s.x, size, Screen.width - size);
            float y = Mathf.Clamp(Screen.height - s.y, size, Screen.height - size);
            var block = new HudRect((x - size) / Screen.width, (y - size) / Screen.height, 2f * size / Screen.width, 2f * size / Screen.height);
            HudRect placed = HudZones.PushOut(block, DebugPanel.Showing);
            KeyCap.Draw(new Vector2(x, placed.Bottom * Screen.height - size), key, size, 0.9f);
        }
    }

    /// <summary>詩句風格的必要引導（規格第 26 節 A）：畫面下方中央一次只有一行，做到才換下一步。</summary>
    void DrawEssential()
    {
        if (!loop.Flags.EssentialGuide)
            return;
        float lineHeight = style.fontSize * 1.35f;
        if (loop.VersesShown && verse != null && !verse.Finished)
        {
            // 兩行詩在上、按鍵小字在下，整組仍在下方中央那一區（規格第 26 節 C）。
            if (keyStyle == null || keyStyle.fontSize != Mathf.RoundToInt(style.fontSize * 0.75f))
                keyStyle = new GUIStyle(style) { fontSize = Mathf.RoundToInt(style.fontSize * 0.75f) };
            float top = Screen.height * EssentialHeight - lineHeight * 1.5f;
            Label(new Rect(0f, top, Screen.width, lineHeight), verse.Line1, style, verse.LineAlpha(0));
            if (!string.IsNullOrEmpty(verse.Line2))
                Label(new Rect(0f, top + lineHeight, Screen.width, lineHeight), verse.Line2, style, verse.LineAlpha(1));
            Label(new Rect(0f, top + lineHeight * 2.1f, Screen.width, lineHeight), verse.Keys, keyStyle, verse.KeyAlpha);
            return;
        }
        string text = loop.Essential.Text;
        if (text == null)
            return;
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
        DrawLines(new Vector2(x, AvoidHud(x, y, lineHeight)));
    }

    /// <summary>
    /// 整疊提示不准蓋到介面（規格第 26 節 C）：碰到 HudZones 的保護區就上下移到最近的空位，回傳新的錨點 Y。
    /// </summary>
    float AvoidHud(float anchorX, float anchorY, float lineHeight)
    {
        float width = 0f;
        foreach (var line in lines)
            width = Mathf.Max(width, style.CalcSize(new GUIContent(line.Text)).x);
        float height = lines.Count * lineHeight;
        float sw = Screen.width, sh = Screen.height;
        var block = new HudRect((anchorX - width / 2f) / sw, (anchorY - height) / sh, width / sw, height / sh);
        HudRect placed = HudZones.PushOut(block, DebugPanel.Showing);
        return placed.Bottom * sh;
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

    static void Label(Rect rect, string text, GUIStyle style, float alpha = 1f)
    {
        if (alpha <= 0.001f)
            return;
        var shadowRect = rect;
        shadowRect.position += new Vector2(2f, 2f);
        style.normal.textColor = new Color(Shadow.r, Shadow.g, Shadow.b, Shadow.a * alpha);
        GUI.Label(shadowRect, text, style);
        style.normal.textColor = new Color(Text.r, Text.g, Text.b, alpha);
        GUI.Label(rect, text, style);
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);
}
