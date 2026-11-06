using System;
using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 實測捷徑的入口：
/// - 手動（Unity 編輯器與開發版）：夜晚中按 F2～F10 直接跳到要測的情況，F1 面板下方列出按鍵。
/// - 自動（網頁版畫面測試）：網址加 ?playtest=名稱（例如 ?playtest=ambush），開場就跳過去，並每秒在主控台寫一行 [PLAYTEST] 狀態。
/// </summary>
public class PlaytestDriver : MonoBehaviour
{
    public static readonly (Key Key, PlaytestScene Scene, string Label)[] Shortcuts =
    {
        (Key.F2, PlaytestScene.Boulder, "巨石前"),
        (Key.F3, PlaytestScene.Ambush, "偷襲"),
        (Key.F4, PlaytestScene.FairHit, "正面出手"),
        (Key.F5, PlaytestScene.Prayer, "禱告"),
        (Key.F6, PlaytestScene.DawnSoon, "天亮前 30 秒"),
        (Key.F7, PlaytestScene.Dawn, "天亮"),
        (Key.F8, PlaytestScene.FullOpen, "巨石全開"),
        (Key.F9, PlaytestScene.Shore, "岸邊"),
        (Key.F10, PlaytestScene.Death, "被摸到"),
    };

    /// <summary>自動畫面測試時，過場在關鍵瞬間停住這麼久（真實秒數），讓截圖拍得到。</summary>
    public const float MarkHoldSeconds = 6f;

    static PlaytestDriver s_Active;

    BlindGameLoop loop;
    bool automated;
    float nextLog;

    /// <summary>手動捷徑只在編輯器與開發版開啟，正式網頁版不會被玩家誤觸。</summary>
    public static bool ManualEnabled => Application.isEditor || Debug.isDebugBuild;

    public void Init(BlindGameLoop loop)
    {
        this.loop = loop;
        if (TryReadScene(out PlaytestScene scene))
        {
            automated = true;
            s_Active = this;
            StartCoroutine(RunAfterStart(scene));
        }
    }

    IEnumerator RunAfterStart(PlaytestScene scene)
    {
        // 等一幀，讓選單、回聲與巨人都初始化好。
        yield return null;
        Debug.Log($"[PLAYTEST] ready scene={scene}");
        loop.RunPlaytest(scene);
    }

    /// <summary>
    /// 過場的關鍵瞬間（例如木馬燒起來）。只在自動畫面測試時有作用：寫一行 [PLAYTEST] mark 名稱，並把遊戲暫停一下。
    /// 測試機用軟體繪圖，一秒只有一兩格，照真實秒數截圖會錯過整段過場；照這行截圖才拍得到。
    /// </summary>
    public static void Mark(string name)
    {
        if (s_Active == null)
            return;
        Debug.Log($"[PLAYTEST] mark {name}");
        s_Active.StartCoroutine(s_Active.Hold());
    }

    IEnumerator Hold()
    {
        float before = Time.timeScale;
        Time.timeScale = 0f;
        yield return new WaitForSecondsRealtime(MarkHoldSeconds);
        Time.timeScale = before == 0f ? 1f : before;
    }

    void OnDestroy()
    {
        if (s_Active == this)
            s_Active = null;
    }

    /// <summary>網址 ?playtest=名稱，或命令列 -playtest 名稱（不分大小寫）。</summary>
    static bool TryReadScene(out PlaytestScene scene)
    {
        scene = default;
        string value = null;
        string url = Application.absoluteURL ?? "";
        int q = url.IndexOf("playtest=", StringComparison.OrdinalIgnoreCase);
        if (q >= 0)
        {
            value = url.Substring(q + "playtest=".Length);
            int end = value.IndexOfAny(new[] { '&', '#' });
            if (end >= 0)
                value = value.Substring(0, end);
        }
        else
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i + 1 < args.Length; i++)
                if (string.Equals(args[i], "-playtest", StringComparison.OrdinalIgnoreCase))
                    value = args[i + 1];
        }
        return !string.IsNullOrEmpty(value) && Enum.TryParse(value, true, out scene);
    }

    void Update()
    {
        if (loop == null)
            return;
        if (automated && Time.unscaledTime >= nextLog)
        {
            nextLog = Time.unscaledTime + 1f;
            Debug.Log("[PLAYTEST] " + loop.PlaytestStatus());
        }
        var keyboard = Keyboard.current;
        if (!ManualEnabled || keyboard == null)
            return;
        foreach (var s in Shortcuts)
            if (keyboard[s.Key].wasPressedThisFrame)
            {
                loop.RunPlaytest(s.Scene);
                break;
            }
    }
}
