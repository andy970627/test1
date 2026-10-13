using System;
using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 魂系死亡畫面「葬身洞中」（規格第 25 節 D）：畫面暗下、中央黑帶（上下希臘回紋線）、暗紅大字放大淡入、
/// 下方說書人死因；低沉鐘鳴。約 3 秒，1 秒後可按任一鍵跳過；結束後呼叫 onDone（接原本的過場）。
/// </summary>
public class DeathScreen : MonoBehaviour
{
    static readonly Color BloodRed = new(0.6f, 0.08f, 0.06f);
    static readonly Color DawnGrey = new(0.85f, 0.85f, 0.8f);
    static readonly Color MeanderGold = new(0.55f, 0.45f, 0.25f);
    static readonly Color CauseColor = new(0.85f, 0.82f, 0.75f);
    const float BandHeight = 0.22f;
    const string Title = "葬 身 洞 中";

    Action onDone;
    float startedAt;
    string cause;
    bool dawn;
    AudioSource bell;
    GUIStyle titleStyle, causeStyle;

    public bool Showing { get; private set; }

    float T => Time.unscaledTime - startedAt;

    public void Play(string cause, bool dawn, Action onDone)
    {
        if (bell == null)
        {
            bell = gameObject.AddComponent<AudioSource>();
            bell.clip = ProceduralAudio.DeathBell();
            bell.spatialBlend = 0f;
            bell.playOnAwake = false;
        }
        this.cause = cause;
        this.dawn = dawn;
        this.onDone = onDone;
        startedAt = Time.unscaledTime;
        Showing = true;
        bell.Play();
    }

    public void Hide()
    {
        Showing = false;
        onDone = null;
        if (bell != null)
            bell.Stop();
    }

    void Update()
    {
        if (!Showing)
            return;
        var k = Keyboard.current;
        bool skip = DeathCard.CanSkip(T) && k != null && k.anyKey.wasPressedThisFrame;
        if (!skip && !DeathCard.Done(T))
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
            titleStyle = new GUIStyle(GUI.skin.label) { fontSize = size, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            causeStyle = new GUIStyle(GUI.skin.label) { fontSize = Mathf.Max(18, Screen.height / 34), alignment = TextAnchor.MiddleCenter };
        }

        Fill(new Rect(0, 0, Screen.width, Screen.height), new Color(0f, 0f, 0f, DeathCard.DimAlpha(t)));

        float bandA = DeathCard.BandAlpha(t);
        float bandH = Screen.height * BandHeight;
        float bandY = (Screen.height - bandH) / 2f;
        Fill(new Rect(0, bandY, Screen.width, bandH), new Color(0f, 0f, 0f, bandA));
        var gold = new Color(MeanderGold.r, MeanderGold.g, MeanderGold.b, bandA / DeathCard.BandMax);
        Meander(bandY + 4f, gold);
        Meander(bandY + bandH - 4f - MeanderHeight, gold);

        float a = DeathCard.TextAlpha(t);
        Color titleColor = dawn ? DawnGrey : BloodRed;
        titleColor.a = a;
        var center = new Vector2(Screen.width / 2f, Screen.height / 2f - bandH * 0.12f);
        var oldMatrix = GUI.matrix;
        GUIUtility.ScaleAroundPivot(Vector2.one * DeathCard.TextScale(t), center);
        titleStyle.normal.textColor = titleColor;
        GUI.Label(new Rect(0, center.y - size * 0.75f, Screen.width, size * 1.5f), Title, titleStyle);
        GUI.matrix = oldMatrix;

        var c = CauseColor;
        c.a = a;
        causeStyle.normal.textColor = c;
        GUI.Label(new Rect(0, center.y + size * 0.75f, Screen.width, causeStyle.fontSize * 1.6f), cause, causeStyle);
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
