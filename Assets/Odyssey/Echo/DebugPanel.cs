using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// F1 除錯面板：俯視小地圖（同伴、木樁、奶桶、羊圈、地上的石子、岩石落點）、巨人狀態、
/// 巨石（含楔子位置與推法）／天亮／岩石冷卻／石子吸引力長條、同伴與羊群狀況、死亡紀錄。只用圖像，不顯示原始數字，不加背景。
/// </summary>
public class DebugPanel : MonoBehaviour
{
    [Tooltip("F1 除錯面板是否一開始就顯示；遊戲中仍可按 F1 切換。")]
    public bool showDebug = true;

    const float MapMinX = -16f, MapMaxX = 16f, MapMinZ = -12f, MapMaxZ = 14f;

    static readonly Color Track = new(1f, 1f, 1f, 0.15f);
    static readonly Color TickGap = new(0f, 0f, 0f, 0.65f);
    static readonly Color Wall = new(0.6f, 0.55f, 0.5f, 0.8f);
    static readonly Color PlayerColor = Color.white;
    static readonly Color SheepColor = new(1f, 0.9f, 0.55f);
    static readonly Color BoulderColor = new(0.55f, 0.4f, 0.25f);
    static readonly Color CrewColor = new(0.55f, 0.9f, 0.6f);
    static readonly Color StakeColor = new(0.55f, 0.38f, 0.2f);
    static readonly Color WedgeColor = new(0.7f, 0.7f, 0.68f);
    static readonly Color StoneColor = new(0.75f, 0.75f, 0.72f);
    static readonly Color PailColor = new(0.7f, 0.55f, 0.35f);
    static readonly Color PenColor = new(0.6f, 0.5f, 0.3f, 0.8f);
    static readonly Color RockColor = new(0.95f, 0.15f, 0.1f);

    BlindGameLoop loop;

    public void Init(BlindGameLoop loop) => this.loop = loop;

    void Update()
    {
        var keyboard = Keyboard.current;
        if (keyboard != null && keyboard.f1Key.wasPressedThisFrame)
            showDebug = !showDebug;
    }

    static Color StateColor(CyclopsState s) => s switch
    {
        CyclopsState.Investigate => new Color(0.95f, 0.8f, 0.2f),
        CyclopsState.Search => new Color(0.9f, 0.25f, 0.2f),
        CyclopsState.Guard => new Color(0.65f, 0.35f, 0.9f),
        CyclopsState.Throw => new Color(1f, 0.45f, 0.1f),
        CyclopsState.Eat => new Color(0.6f, 0.05f, 0.05f),
        CyclopsState.Pray => new Color(0.3f, 0.45f, 0.9f),
        CyclopsState.Stagger => new Color(0.4f, 0.9f, 0.9f),
        _ => new Color(0.6f, 0.6f, 0.6f),
    };

    static Color OutcomeColor(NightOutcome outcome) => outcome switch
    {
        NightOutcome.Dawn => new Color(0.55f, 0.65f, 0.95f),
        NightOutcome.Escaped => new Color(0.55f, 0.9f, 0.6f),
        _ => new Color(0.9f, 0.25f, 0.2f),
    };

    string BoulderMode()
    {
        if (loop.Slide.PullingBack)
            return "被拔回";
        return loop.Player.PushMode switch
        {
            PushMode.Heavy => "猛推",
            PushMode.Light => "輕推",
            _ => loop.Slide.Opening > loop.Slide.Floor + 1e-4f ? "回滑" : "",
        };
    }

    static string StateName(CyclopsState s) => s switch
    {
        CyclopsState.Investigate => "追聲",
        CyclopsState.Search => "摸索",
        CyclopsState.Guard => "守石",
        CyclopsState.Throw => "丟岩石",
        CyclopsState.Eat => "吃同伴",
        CyclopsState.Pray => "禱告",
        CyclopsState.Stagger => "踉蹌",
        _ => "聆聽",
    };

    void OnGUI()
    {
        OdysseyFonts.UseForGui();
        if (!showDebug || loop == null || loop.Cyclops == null)
            return;

        int fontSize = Mathf.Max(22, Screen.height / 28);
        var style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, wordWrap = false };
        style.normal.textColor = new Color(0.95f, 0.93f, 0.87f);
        float line = fontSize * 1.4f;

        float mapH = Screen.height * 0.3f;
        float mapW = mapH * (MapMaxX - MapMinX) / (MapMaxZ - MapMinZ);
        float panelW = Mathf.Max(mapW, fontSize * 14f) + 20f;

        var map = new Rect(20, 20, mapW, mapH);
        DrawMap(map);

        // 小地圖圖例：只放最重要的四種。
        float y = map.yMax + 6f;
        var legend = new GUIStyle(style) { fontSize = Mathf.Max(16, fontSize * 2 / 3) };
        float lx = 20f, lh = legend.fontSize * 1.4f;
        foreach (var (name, color) in new[] { ("你", PlayerColor), ("巨人", StateColor(CyclopsState.Listen)), ("同伴", CrewColor), ("木樁", StakeColor) })
        {
            Fill(new Rect(lx, y + lh * 0.3f, lh * 0.4f, lh * 0.4f), color);
            GUI.Label(new Rect(lx + lh * 0.55f, y, legend.fontSize * 3f, lh), name, legend);
            lx += lh * 0.55f + legend.fontSize * (name.Length + 1.2f);
        }
        y += lh + 4f;
        CyclopsState state = loop.Cyclops.Brain.State;
        Fill(new Rect(20, y + line * 0.2f, line * 0.6f, line * 0.6f), StateColor(state));
        string hold = loop.Cyclops.Brain.HoldingBoulder ? "・守著巨石" : "";
        GUI.Label(new Rect(20 + line, y, panelW, line), $"巨人：{StateName(state)}{hold}・{Difficulty.Name(loop.Difficulty)}", style);
        y += line;

        float barW = panelW - fontSize * 6f - 20f;
        float boulderRow = y;
        Bar("巨石", loop.Slide.Opening / BoulderSlide.FullOpen, 0, new Color(0.75f, 0.6f, 0.4f), ref y, line, barW, style);
        DrawBoulderMarks(boulderRow, line, barW, style);
        Bar("天亮", loop.Dawn.Fraction, 0, new Color(0.7f, 0.75f, 0.95f), ref y, line, barW, style);
        // 「丟岩石冷卻」「箭的引誘力」暫放在洞中紀事的巨人頁（使用者指定，規格第 25 節 F）。

        int following = loop.Crew.Followers.Count;
        GUI.Label(new Rect(20, y, panelW, line), $"同伴：跟隨 {following}／躲著 {loop.Crew.Members.Count - following}", style);
        y += line;
        if (loop.Rush.Active)
        {
            int gone = 0;
            foreach (bool g in loop.Rush.Gone)
                if (g)
                    gone++;
            GUI.Label(new Rect(20, y, panelW, line), $"羊：出去 {gone}{(loop.Rush.Stuck ? "／卡住" : "")}", style);
            y += line;
        }
        if (loop.Hints.Current is HintKind hint)
        {
            GUI.Label(new Rect(20, y, panelW, line), $"提示：{hint}", style);
            y += line;
        }

        // 死亡紀錄：一夜一行，前面的色塊表示結果。
        foreach (var night in loop.Nights.Lines)
        {
            Fill(new Rect(20, y + line * 0.25f, line * 0.5f, line * 0.5f), OutcomeColor(night.Outcome));
            GUI.Label(new Rect(20 + line * 0.8f, y, panelW, line), night.Text, style);
            y += line;
        }
    }

    void Bar(string label, float value, int ticks, Color color, ref float y, float line, float width, GUIStyle style)
    {
        float x = 20 + style.fontSize * 4f;
        GUI.Label(new Rect(20, y, style.fontSize * 4f, line), label, style);
        var r = new Rect(x, y + line * 0.25f, width, line * 0.5f);
        Fill(r, Track);
        Fill(new Rect(r.x, r.y, r.width * Mathf.Clamp01(value), r.height), color);
        for (int i = 1; i < ticks; i++)
            Fill(new Rect(r.x + r.width * i / ticks - 1f, r.y, 2f, r.height), TickGap);
        y += line;
    }

    /// <summary>蓋在巨石長條上的楔子標記（石子灰點、木樁棕條），右邊寫推法；位置和 Bar 的長條一致。</summary>
    void DrawBoulderMarks(float y, float line, float width, GUIStyle style)
    {
        var r = new Rect(20 + style.fontSize * 4f, y + line * 0.25f, width, line * 0.5f);
        GUI.Label(new Rect(r.xMax + 8f, y, style.fontSize * 4f, line), BoulderMode(), style);
        foreach (float w in loop.Slide.StoneWedges)
        {
            float px = r.x + r.width * w / BoulderSlide.FullOpen;
            Fill(new Rect(px - r.height * 0.35f, r.y + r.height * 0.15f, r.height * 0.7f, r.height * 0.7f), WedgeColor);
        }
        if (loop.Slide.StakeWedge is float s)
            Fill(new Rect(r.x + r.width * s / BoulderSlide.FullOpen - 2f, r.y - r.height * 0.3f, 4f, r.height * 1.6f), StakeColor);
    }

    void DrawMap(Rect map)
    {
        // 洞壁：半軸 15 × 10 的橢圓。
        for (int i = 0; i < 64; i++)
        {
            float a = i * Mathf.PI * 2f / 64f;
            Dot(map, new Vector3(Mathf.Sin(a) * 15f, 0f, Mathf.Cos(a) * 10f), 3f, Wall);
        }

        foreach (var pulse in EchoField.Instance != null ? EchoField.Instance.Active : System.Array.Empty<EchoField.Pulse>())
        {
            float front = pulse.Radius * Mathf.Clamp01((Time.time - pulse.StartTime) / EchoField.SpreadSeconds);
            Circle(map, pulse.Position, front, pulse.Color);
        }

        foreach (var pen in loop.Layout.Pens)
            Frame(map, pen.Center, pen.Size, PenColor);
        foreach (var pail in loop.Layout.Pails)
            Dot(map, pail.transform.position, 8f, pail.Fallen ? Dim(PailColor) : PailColor);
        foreach (var stone in LooseStone.All)
            if (stone != null)
                Dot(map, stone.transform.position, 4f, StoneColor);
        if (!loop.Stake.Carried)
            Dot(map, loop.Stake.transform.position, 6f, StakeColor);

        Vector3 boulder = loop.Layout.Boulder.PushPoint;
        Dot(map, boulder, 12f, BoulderColor);
        foreach (var s in loop.Sheep)
            if (s.gameObject.activeSelf)
                Dot(map, s.transform.position, s.IsRam ? 9f : 7f, SheepColor);
        foreach (var m in loop.Crew.Members)
        {
            if (m == null)
                continue;
            bool follows = m.Current != CrewMember.Mode.Hiding;
            if (follows)
                Dot(map, m.transform.position, 10f, PlayerColor);
            Dot(map, m.transform.position, 7f, m.Current == CrewMember.Mode.Crouching ? Dim(CrewColor) : CrewColor);
        }
        if (loop.Cyclops.IncomingRock is Vector3 rock)
            Cross(map, rock, 12f, RockColor);
        var brain = loop.Cyclops.Brain;
        Dot(map, new Vector3(brain.Position.X, 0f, brain.Position.Y), 14f, StateColor(brain.State));
        Dot(map, loop.PlayerPosition, 10f, PlayerColor);
    }

    static Vector2 ToMap(Rect map, Vector3 world) => new(
        map.x + Mathf.InverseLerp(MapMinX, MapMaxX, world.x) * map.width,
        map.y + (1f - Mathf.InverseLerp(MapMinZ, MapMaxZ, world.z)) * map.height);

    static void Dot(Rect map, Vector3 world, float size, Color color)
    {
        Vector2 p = ToMap(map, world);
        Fill(new Rect(p.x - size / 2f, p.y - size / 2f, size, size), color);
    }

    static Color Dim(Color c) => new(c.r * 0.45f, c.g * 0.45f, c.b * 0.45f, c.a);

    /// <summary>平面上的矩形框（羊圈）。</summary>
    static void Frame(Rect map, Vector3 center, Vector2 size, Color color)
    {
        Vector2 a = ToMap(map, center + new Vector3(-size.x / 2f, 0f, size.y / 2f));
        Vector2 b = ToMap(map, center + new Vector3(size.x / 2f, 0f, -size.y / 2f));
        Fill(new Rect(a.x, a.y, b.x - a.x, 2f), color);
        Fill(new Rect(a.x, b.y - 2f, b.x - a.x, 2f), color);
        Fill(new Rect(a.x, a.y, 2f, b.y - a.y), color);
        Fill(new Rect(b.x - 2f, a.y, 2f, b.y - a.y), color);
    }

    /// <summary>岩石落點的叉。</summary>
    static void Cross(Rect map, Vector3 world, float size, Color color)
    {
        Vector2 p = ToMap(map, world);
        for (int i = -4; i <= 4; i++)
        {
            float o = i * size / 8f;
            Fill(new Rect(p.x + o - 1.5f, p.y + o - 1.5f, 3f, 3f), color);
            Fill(new Rect(p.x + o - 1.5f, p.y - o - 1.5f, 3f, 3f), color);
        }
    }

    static void Circle(Rect map, Vector3 center, float radius, Color color)
    {
        if (radius <= 0.01f)
            return;
        const int Segments = 32;
        for (int i = 0; i < Segments; i++)
        {
            float a = i * Mathf.PI * 2f / Segments;
            Dot(map, center + new Vector3(Mathf.Sin(a) * radius, 0f, Mathf.Cos(a) * radius), 2f, color);
        }
    }

    static void Fill(Rect r, Color c)
    {
        var old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }
}
