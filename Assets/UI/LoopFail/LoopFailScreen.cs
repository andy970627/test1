using System;
using System.Collections;
using TMPro;
using UnityEngine;

/// <summary>
/// 失敗 / 重來畫面：畫面淡黑 → 浮現「第 N 年 / 被吹回島上」→ 在全黑時回呼讓呼叫端重置關卡 → 淡出。
/// 沒有按鈕，玩家無法選擇——只有「再試一次」。也提供不帶文字的快速轉場，以及自訂文字的訊息畫面。
/// </summary>
public class LoopFailScreen : MonoBehaviour
{
    public static LoopFailScreen Instance { get; private set; }

    [Header("References")]
    [SerializeField] CanvasGroup screenGroup;
    [SerializeField] CanvasGroup contentGroup;
    [SerializeField] TMP_Text yearText;
    [SerializeField] TMP_Text titleText;
    [SerializeField] TMP_Text subtitleText;

    [Header("Text")]
    [SerializeField] string yearFormat = "第 {0} 年";
    [Tooltip("周目數加上這個值才是顯示的年數。預設 7＝卡呂普索島的七年，第一次失敗顯示第 8 年。")]
    [SerializeField] int startingYear = 7;

    [Header("Timing (seconds, unscaled)")]
    [SerializeField] float fadeToBlack = 1.2f;
    [SerializeField] float textFadeIn = 0.8f;
    [SerializeField] float hold = 2.5f;
    [SerializeField] float textFadeOut = 0.6f;
    [SerializeField] float fadeFromBlack = 1.5f;
    [SerializeField] float quickFade = 0.3f;

    [Header("Font")]
    [Tooltip("有中文字形的 TMP 字型（例如 Noto Sans TC）。留空則嘗試載入系統字型。")]
    [SerializeField] TMP_FontAsset cjkFont;

    [SerializeField] bool persistAcrossScenes = true;

    string defaultTitle;
    string defaultSubtitle;

    public bool IsPlaying { get; private set; }

    void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        if (persistAcrossScenes)
            DontDestroyOnLoad(gameObject);

        defaultTitle = titleText != null ? titleText.text : "";
        defaultSubtitle = subtitleText != null ? subtitleText.text : "";
        ApplyCjkFont();
        SetHidden();
    }

    void OnDestroy()
    {
        if (Instance == this)
            Instance = null;
    }

    public string FormatYear(int loopCount) => string.Format(yearFormat, startingYear + loopCount);

    /// <summary>
    /// 播放失敗畫面。onBlackout 在畫面全黑時呼叫——在這裡重載場景或把玩家送回起點。
    /// </summary>
    public void Play(int loopCount, Action onBlackout = null, Action onComplete = null)
        => ShowMessage(FormatYear(loopCount), defaultTitle, defaultSubtitle, onBlackout, onComplete);

    /// <summary>同失敗畫面的流程，但文字自訂（例如結局）。</summary>
    public void ShowMessage(string year, string title, string subtitle, Action onBlackout = null, Action onComplete = null)
    {
        if (IsPlaying)
            return;
        if (yearText != null) yearText.text = year;
        if (titleText != null) titleText.text = title;
        if (subtitleText != null) subtitleText.text = subtitle;
        StartCoroutine(Run(true, onBlackout, onComplete));
    }

    /// <summary>不帶文字的短暫黑場轉場。</summary>
    public void QuickFade(Action onBlackout = null, Action onComplete = null)
    {
        if (IsPlaying)
            return;
        StartCoroutine(Run(false, onBlackout, onComplete));
    }

    IEnumerator Run(bool withText, Action onBlackout, Action onComplete)
    {
        IsPlaying = true;
        screenGroup.blocksRaycasts = true;
        contentGroup.alpha = 0f;

        yield return Fade(screenGroup, 0f, 1f, withText ? fadeToBlack : quickFade);
        onBlackout?.Invoke();
        if (withText)
        {
            yield return Fade(contentGroup, 0f, 1f, textFadeIn);
            yield return new WaitForSecondsRealtime(hold);
            yield return Fade(contentGroup, 1f, 0f, textFadeOut);
        }
        yield return Fade(screenGroup, 1f, 0f, withText ? fadeFromBlack : quickFade);

        SetHidden();
        IsPlaying = false;
        onComplete?.Invoke();
    }

    static IEnumerator Fade(CanvasGroup group, float from, float to, float duration)
    {
        for (float t = 0f; t < duration; t += Time.unscaledDeltaTime)
        {
            group.alpha = Mathf.Lerp(from, to, t / duration);
            yield return null;
        }
        group.alpha = to;
    }

    void SetHidden()
    {
        if (screenGroup != null)
        {
            screenGroup.alpha = 0f;
            screenGroup.blocksRaycasts = false;
        }
        if (contentGroup != null)
            contentGroup.alpha = 0f;
    }

    void ApplyCjkFont()
    {
        TMP_FontAsset font = cjkFont != null ? cjkFont : OdysseyFonts.Cjk;
        if (font == null)
            return;
        foreach (TMP_Text text in new[] { yearText, titleText, subtitleText })
        {
            if (text != null)
                text.font = font;
        }
    }

    [ContextMenu("Test Play (loop 1)")]
    void TestPlay() => Play(1, () => Debug.Log("LoopFailScreen: blackout — reset level here."));
}
