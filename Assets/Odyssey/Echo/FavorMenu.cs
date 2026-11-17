using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 求雅典娜相助（規格第 34 節 F）：夜晚中按 Q 打開右側的小選單（遊戲不暫停），按 1～3 選擇，Q 或 5 秒後收起。
/// 神諭的兩行詩也在這裡顯示（上方中央、情境提示下面）。
/// </summary>
public class FavorMenu : MonoBehaviour
{
    const float AutoCloseSeconds = 5f;
    const float OracleSeconds = 6f;

    static readonly Color Text = new(0.97f, 0.95f, 0.88f);
    static readonly Color Dim = new(0.97f, 0.95f, 0.88f, 0.4f);
    static readonly Color Gold = new(0.92f, 0.8f, 0.45f);
    static readonly Color Shadow = new(0f, 0f, 0f, 0.85f);

    static readonly (FavorBoon Boon, string Label)[] Boons =
    {
        (FavorBoon.Moonbeam, "縫光：月光照亮巨石縫 20 秒"),
        (FavorBoon.Oracle, "神諭：詩人告訴你該做什麼"),
        (FavorBoon.CaveFlash, "整洞回聲：照亮整個洞一瞬"),
    };

    BlindGameLoop loop;
    float openFor;
    (string, string, string) oracle;
    float oracleLeft;
    GUIStyle style, small;

    public bool Open => openFor > 0f;

    public void Init(BlindGameLoop loop) => this.loop = loop;

    public void Close()
    {
        openFor = 0f;
        oracleLeft = 0f;
    }

    public void ShowOracle((string, string, string) lines)
    {
        oracle = lines;
        oracleLeft = OracleSeconds;
    }

    void Update()
    {
        oracleLeft = Mathf.Max(0f, oracleLeft - Time.deltaTime);
        if (loop == null || !loop.InNight)
        {
            openFor = 0f;
            return;
        }
        var keyboard = Keyboard.current;
        if (keyboard == null)
            return;
        if (keyboard.qKey.wasPressedThisFrame)
        {
            openFor = Open ? 0f : AutoCloseSeconds;
            return;
        }
        if (!Open)
            return;
        openFor = Mathf.Max(0f, openFor - Time.deltaTime);
        int pick = keyboard.digit1Key.wasPressedThisFrame ? 0
            : keyboard.digit2Key.wasPressedThisFrame ? 1
            : keyboard.digit3Key.wasPressedThisFrame ? 2 : -1;
        if (pick >= 0 && loop.UseBoon(Boons[pick].Boon))
            openFor = 0f;
    }

    void OnGUI()
    {
        if (loop == null || !loop.InNight || (!Open && oracleLeft <= 0f))
            return;
        OdysseyFonts.UseForGui();
        int fontSize = Mathf.Max(18, Screen.height / 40);
        if (style == null || style.fontSize != fontSize)
        {
            style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, alignment = TextAnchor.MiddleRight, wordWrap = false };
            small = new GUIStyle(style) { fontSize = Mathf.RoundToInt(fontSize * 0.8f), alignment = TextAnchor.MiddleCenter };
        }
        float line = fontSize * 1.5f;

        if (Open)
        {
            // 右側中段（畫面分區裡沒人用的地方）：避開左上的除錯面板、中央的進度條與必要引導、右側的紀事提示。
            float x = Screen.width * 0.56f, y = Screen.height * 0.30f;
            Label(new Rect(x, y, Screen.width * 0.4f, line), $"雅典娜的眷顧：{new string('●', loop.Favor.Points)}{new string('○', AthenaFavor.MaxPoints - loop.Favor.Points)}", style, Gold);
            for (int i = 0; i < Boons.Length; i++)
            {
                int cost = AthenaFavor.Cost(Boons[i].Boon);
                bool can = loop.Favor.CanSpend(Boons[i].Boon);
                Label(new Rect(x, y + line * (i + 1), Screen.width * 0.4f, line), $"{i + 1}  {Boons[i].Label}（{cost} 分）", style, can ? Text : Dim);
            }
        }

        if (oracleLeft > 0f)
        {
            float a = Mathf.Clamp01(oracleLeft / 1f);
            float top = Screen.height * 0.24f;
            Label(new Rect(0f, top, Screen.width, line), oracle.Item1, small, new Color(Gold.r, Gold.g, Gold.b, a));
            Label(new Rect(0f, top + line, Screen.width, line), oracle.Item2, small, new Color(Gold.r, Gold.g, Gold.b, a));
            Label(new Rect(0f, top + line * 2.1f, Screen.width, line), oracle.Item3, small, new Color(Text.r, Text.g, Text.b, a * 0.8f));
        }
    }

    static void Label(Rect r, string text, GUIStyle s, Color c)
    {
        var shadow = r;
        shadow.position += new Vector2(2f, 2f);
        s.normal.textColor = new Color(Shadow.r, Shadow.g, Shadow.b, Shadow.a * c.a);
        GUI.Label(shadow, text, s);
        s.normal.textColor = c;
        GUI.Label(r, text, s);
    }
}
