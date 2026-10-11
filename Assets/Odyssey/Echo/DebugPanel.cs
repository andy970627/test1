using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>F1 除錯面板：俯視小地圖、巨人狀態、巨石／天亮／石子吸引力長條與死亡紀錄。只用圖像，不顯示原始數字。</summary>
public class DebugPanel : MonoBehaviour
{
    [Tooltip("F1 除錯面板是否一開始就顯示；遊戲中仍可按 F1 切換。")]
    public bool showDebug = true;

    const float MapMinX = -16f, MapMaxX = 16f, MapMinZ = -12f, MapMaxZ = 14f;
    const int DeathLines = 6;

    static readonly Color Track = new(1f, 1f, 1f, 0.15f);
    static readonly Color TickGap = new(0f, 0f, 0f, 0.65f);
    static readonly Color Wall = new(0.6f, 0.55f, 0.5f, 0.8f);
    static readonly Color PlayerColor = Color.white;
    static readonly Color SheepColor = new(1f, 0.9f, 0.55f);
    static readonly Color BoulderColor = new(0.55f, 0.4f, 0.25f);

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
        _ => new Color(0.6f, 0.6f, 0.6f),
    };

    static string StateName(CyclopsState s) => s switch
    {
        CyclopsState.Investigate => "追聲",
        CyclopsState.Search => "摸索",
        CyclopsState.Guard => "守石",
        CyclopsState.Throw => "丟岩石",
        CyclopsState.Eat => "吃同伴",
        _ => "聆聽",
    };

    void OnGUI()
    {
        if (!showDebug || loop == null || loop.Cyclops == null)
            return;

        int fontSize = Mathf.Max(22, Screen.height / 28);
        var style = new GUIStyle(GUI.skin.label) { fontSize = fontSize };
        style.normal.textColor = new Color(0.95f, 0.93f, 0.87f);
        float line = fontSize * 1.4f;

        float mapH = Screen.height * 0.3f;
        float mapW = mapH * (MapMaxX - MapMinX) / (MapMaxZ - MapMinZ);
        float panelW = Mathf.Max(mapW, fontSize * 14f) + 20f;

        var map = new Rect(20, 20, mapW, mapH);
        DrawMap(map);

        float y = map.yMax + 10f;
        CyclopsState state = loop.Cyclops.Brain.State;
        Fill(new Rect(20, y + line * 0.2f, line * 0.6f, line * 0.6f), StateColor(state));
        string hold = loop.Cyclops.Brain.HoldingBoulder ? "・守著巨石" : "";
        GUI.Label(new Rect(20 + line, y, panelW, line), $"巨人：{StateName(state)}{hold}", style);
        y += line;

        float barW = panelW - fontSize * 6f - 20f;
        Bar("巨石", loop.Slide.Opening / BoulderSlide.FullOpen, 0, new Color(0.75f, 0.6f, 0.4f), ref y, line, barW, style);
        Bar("天亮", loop.Dawn.Fraction, 0, new Color(0.7f, 0.75f, 0.95f), ref y, line, barW, style);
        Bar("石子", loop.Decoys.StoneRadiusMultiplier, 0, new Color(0.85f, 0.85f, 0.8f), ref y, line, barW, style);
        for (int i = 0; i < DecoyMemory.FooledLimit; i++)
            Fill(new Rect(20 + fontSize * 4f + i * line * 0.7f, y + line * 0.25f, line * 0.5f, line * 0.5f),
                i < loop.Decoys.Fooled ? new Color(0.9f, 0.25f, 0.2f) : Track);
        y += line;

        int start = Mathf.Max(0, loop.Deaths.Count - DeathLines);
        for (int i = start; i < loop.Deaths.Count; i++)
        {
            GUI.Label(new Rect(20, y, panelW, line), loop.Deaths[i], style);
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

        Vector3 boulder = loop.Layout.Boulder.PushPoint;
        Dot(map, boulder, 12f, BoulderColor);
        foreach (var s in loop.Sheep)
            Dot(map, s.transform.position, s.IsRam ? 9f : 7f, SheepColor);
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
