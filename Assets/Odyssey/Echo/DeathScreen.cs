using System;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 魂系死亡畫面「葬身洞中」（規格第 25 節 D）：畫面暗下、中央黑帶（上下希臘回紋線）、暗紅大字放大淡入、
/// 下方說書人死因與這一夜的代價；低沉鐘鳴。3 秒後淡成全黑（onBlackout：重置下一夜），再直接淡入下一夜（onDone），
/// 不再接其他過場。1 秒後可按任一鍵跳到淡出。
/// </summary>
public class DeathScreen : MonoBehaviour
{
    static readonly Color BloodRed = OdysseyPalette.BloodRed;
    static readonly Color DawnGrey = OdysseyPalette.DawnGrey;
    static readonly Color MeanderGold = OdysseyPalette.MeanderGold;
    static readonly Color CauseColor = OdysseyPalette.CauseText;
    const float BandHeight = 0.22f;
    const string Title = "葬 身 洞 中";

    Action onBlackout;
    Action onDone;
    bool blackedOut;
    string detail;
    float startedAt;
    string cause;
    bool dawn;
    AudioSource bell;
    GUIStyle titleStyle, causeStyle;

    public bool Showing { get; private set; }

    float T => Time.unscaledTime - startedAt;

    public void Play(string cause, string detail, bool dawn, Action onBlackout, Action onDone)
    {
        if (bell == null)
        {
            bell = gameObject.AddComponent<AudioSource>();
            bell.clip = ProceduralAudio.DeathBell();
            bell.spatialBlend = 0f;
            bell.playOnAwake = false;
        }
        this.cause = cause;
        this.detail = detail;
        this.dawn = dawn;
        this.onBlackout = onBlackout;
        this.onDone = onDone;
        blackedOut = false;
        startedAt = Time.unscaledTime;
        Showing = true;
        bell.Play();
    }

    public void Hide()
    {
        Showing = false;
        onDone = null;
        onBlackout = null;
        if (bell != null)
            bell.Stop();
    }

    void Update()
    {
        if (!Showing)
            return;
        var k = Keyboard.current;
        if (DeathCard.CanSkip(T) && T < DeathCard.SkipTo && k != null && k.anyKey.wasPressedThisFrame)
            startedAt = Time.unscaledTime - DeathCard.SkipTo;
        if (!blackedOut && T >= DeathCard.BlackoutAt)
        {
            blackedOut = true;
            var blackout = onBlackout;
            onBlackout = null;
            blackout?.Invoke();
            // 回主選單會在這裡把畫面收掉。
            if (!Showing)
                return;
        }
        if (!DeathCard.Done(T))
            return;
        Showing = false;
        var done = onDone;
        onDone = null;
        done?.Invoke();
    }

    void OnGUI()
    {
        if (!Showing)
            return;
        GUI.depth = -15;
        float t = T;
        int size = Mathf.Max(40, Screen.height / 9);
        if (titleStyle == null || titleStyle.fontSize != size)
        {
            // 源流明體 Heavy 本身就是最粗的字重，不再加 Bold（避免假粗體把楔形襯線糊掉）；找不到字型時才退回 Bold。
            var heavy = OdysseyFonts.InscriptionHeavy;
            titleStyle = new GUIStyle(GUI.skin.label) { fontSize = size, alignment = TextAnchor.MiddleCenter, font = heavy, fontStyle = heavy != null ? FontStyle.Normal : FontStyle.Bold };
            causeStyle = new GUIStyle(GUI.skin.label) { fontSize = Mathf.Max(18, Screen.height / 34), alignment = TextAnchor.MiddleCenter };
        }

        Fill(new Rect(0, 0, Screen.width, Screen.height), new Color(0f, 0f, 0f, DeathCard.DimAlpha(t)));

        // 不加黑帶：只留上下兩條回紋線框住文字，畫面照樣看得到。
        float bandA = DeathCard.BandAlpha(t);
        float bandH = Screen.height * BandHeight;
        float bandY = (Screen.height - bandH) / 2f;
        var gold = new Color(MeanderGold.r, MeanderGold.g, MeanderGold.b, bandA / DeathCard.BandMax);
        Meander(bandY + 4f, gold);
        Meander(bandY + bandH - 4f - MeanderHeight, gold);

        float a = DeathCard.TextAlpha(t);
        Color titleColor = dawn ? DawnGrey : BloodRed;
        titleColor.a = a;
        var center = new Vector2(Screen.width / 2f, Screen.height / 2f - bandH * 0.12f);
        var oldMatrix = GUI.matrix;
        GUIUtility.ScaleAroundPivot(Vector2.one * DeathCard.TextScale(t), center);
        var titleRect = new Rect(0, center.y - size * 0.75f, Screen.width, size * 1.5f);
        Outline(titleRect, Title, titleStyle, a, 3f);
        titleStyle.normal.textColor = titleColor;
        GUI.Label(titleRect, Title, titleStyle);
        GUI.matrix = oldMatrix;

        var c = CauseColor;
        c.a = a;
        var causeRect = new Rect(0, center.y + size * 0.75f, Screen.width, causeStyle.fontSize * 1.6f);
        Outline(causeRect, cause, causeStyle, a, 2f);
        causeStyle.normal.textColor = c;
        GUI.Label(causeRect, cause, causeStyle);
        if (!string.IsNullOrEmpty(detail))
        {
            var d = new Color(c.r, c.g, c.b, a * 0.7f);
            var detailRect = new Rect(0, center.y + size * 0.75f + causeStyle.fontSize * 1.6f, Screen.width, causeStyle.fontSize * 1.6f);
            Outline(detailRect, detail, causeStyle, a, 2f);
            causeStyle.normal.textColor = d;
            GUI.Label(detailRect, detail, causeStyle);
        }
    }

    /// <summary>沒有黑底時字要讀得到：四周各畫一層黑色描邊。</summary>
    static void Outline(Rect r, string text, GUIStyle style, float alpha, float width)
    {
        style.normal.textColor = OdysseyPalette.Fade(OdysseyPalette.TextOutline, alpha);
        foreach (var o in new[] { new Vector2(-width, 0f), new Vector2(width, 0f), new Vector2(0f, -width), new Vector2(0f, width), new Vector2(width, width) })
        {
            var shifted = r;
            shifted.position += o;
            GUI.Label(shifted, text, style);
        }
    }

    const float MeanderHeight = 10f;

    /// <summary>希臘回紋：一排方形回鉤，橫跨整個黑帶。</summary>
    static void Meander(float y, Color color)
    {
        const float unit = 10f;
        float h = MeanderHeight;
        for (float x = 0f; x < Screen.width; x += unit * 2f)
        {
            Fill(new Rect(x, y + h - 2f, unit * 2f, 2f), color);          // 底線
            Fill(new Rect(x, y, 2f, h), color);                            // 左豎
            Fill(new Rect(x, y, unit * 1.2f, 2f), color);                  // 上橫
            Fill(new Rect(x + unit * 1.2f - 2f, y, 2f, h * 0.6f), color);  // 回鉤
            Fill(new Rect(x + unit * 0.6f, y + h * 0.6f - 2f, unit * 0.6f, 2f), color);
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
