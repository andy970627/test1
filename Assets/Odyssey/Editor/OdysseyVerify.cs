using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Odyssey.Core;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;

/// <summary>
/// 驗證用自動實測：由 .claude/skills/verify-odyssey/run.ps1 以 -executeMethod OdysseyVerify.Run 啟動。
/// 開一個只有 BlindGameLoop 的暫存場景、進 Play，用虛擬鍵盤滑鼠照玩家的方式操作，
/// 每一步截圖並把檢查結果寫進 result.json，最後自己關掉 Unity（全過 0、有失敗 1、執行出錯 2）。
/// 不存任何場景、不改專案設定；手動在編輯器裡不會觸發。
/// </summary>
[InitializeOnLoad]
public static class OdysseyVerify
{
    const string KeyOut = "OdysseyVerify.Out";
    const string KeyJourneys = "OdysseyVerify.Journeys";
    const float TimeoutSeconds = 300f;

    public static readonly string[] AllJourneys = { "menu-start", "make-sound", "pause", "push-boulder" };

    static IEnumerator runner;
    static float waitUntil;
    static float deadline;
    static Keyboard kb;
    static Mouse mouse;
    static readonly HashSet<Key> held = new();
    static readonly List<string> heard = new();
    static Result result;
    static string outDir;

    static OdysseyVerify()
    {
        if (string.IsNullOrEmpty(SessionState.GetString(KeyOut, "")))
            return;
        EditorApplication.playModeStateChanged += OnPlayMode;
    }

    /// <summary>命令列入口：-verifyOut &lt;資料夾&gt; -verifyJourneys all|menu-start,make-sound,...</summary>
    public static void Run()
    {
        string dir = Arg("-verifyOut") ?? Path.GetFullPath("Logs/verify/manual");
        string journeys = Arg("-verifyJourneys") ?? "all";
        Directory.CreateDirectory(dir);
        SessionState.SetString(KeyOut, dir);
        SessionState.SetString(KeyJourneys, journeys);

        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        new GameObject("BlindGameLoop").AddComponent<BlindGameLoop>();
        EditorApplication.playModeStateChanged += OnPlayMode;
        EditorApplication.isPlaying = true;
    }

    static string Arg(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i] == name)
                return args[i + 1];
        return null;
    }

    static void OnPlayMode(PlayModeStateChange change)
    {
        if (change != PlayModeStateChange.EnteredPlayMode || runner != null)
            return;
        outDir = SessionState.GetString(KeyOut, "");
        string list = SessionState.GetString(KeyJourneys, "all");
        string[] journeys = list == "all" ? AllJourneys : list.Split(',');
        result = new Result { started = DateTime.Now.ToString("s"), outDir = outDir };

        // 編輯器沒有焦點時也要吃得到輸入（只改這次執行的記憶體副本，不存檔）。
        var settings = UnityEngine.Object.Instantiate(InputSystem.settings);
        settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
        settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
        InputSystem.settings = settings;
        kb = InputSystem.AddDevice<Keyboard>("VerifyKeyboard");
        mouse = InputSystem.AddDevice<Mouse>("VerifyMouse");
        kb.MakeCurrent();
        mouse.MakeCurrent();
        SoundBus.Emitted += (e, _) => heard.Add(e.Kind.ToString());
        FocusGameView();

        deadline = (float)EditorApplication.timeSinceStartup + TimeoutSeconds;
        runner = Script(journeys);
        EditorApplication.update += Tick;
    }

    static void Tick()
    {
        try
        {
            if (EditorApplication.timeSinceStartup > deadline)
            {
                result.error = $"超過 {TimeoutSeconds} 秒，整體逾時";
                Finish(2);
                return;
            }
            // 編輯器沒有焦點時可能整個停住遊戲迴圈；每拍要求跑一個遊戲畫面，讓遊戲照常前進。
            EditorApplication.QueuePlayerLoopUpdate();
            ReleaseTapIfDue();
            if (EditorApplication.timeSinceStartup < waitUntil || tapKey != null || WaitingForShot())
                return;
            if (!runner.MoveNext())
                Finish(result.AllPassed ? 0 : 1);
            else if (runner.Current is float seconds)
                waitUntil = (float)EditorApplication.timeSinceStartup + seconds;
        }
        catch (Exception ex)
        {
            result.error = ex.ToString();
            Finish(2);
        }
    }

    static void Finish(int code)
    {
        EditorApplication.update -= Tick;
        result.exitCode = code;
        result.finished = DateTime.Now.ToString("s");
        File.WriteAllText(Path.Combine(outDir, "result.json"), JsonUtility.ToJson(result, true), new UTF8Encoding(false));
        SessionState.EraseString(KeyOut);
        Debug.Log($"OdysseyVerify: 結束，代碼 {code}，結果在 {outDir}");
        EditorApplication.Exit(code);
    }

    // ---------- 腳本 ----------

    static IEnumerator Script(string[] journeys)
    {
        yield return 2f;
        var loop = UnityEngine.Object.FindFirstObjectByType<BlindGameLoop>();
        Check("場景裡有 BlindGameLoop", loop != null);
        if (loop == null)
            yield break;

        foreach (string j in journeys)
        {
            current = new Journey { name = j.Trim() };
            result.journeys.Add(current);
            IEnumerator steps = current.name switch
            {
                "menu-start" => MenuStart(loop),
                "make-sound" => MakeSound(loop),
                "pause" => PauseMenu(loop),
                "push-boulder" => PushBoulder(loop),
                _ => Unknown(current.name),
            };
            while (steps.MoveNext())
                yield return steps.Current;
            current.passed = current.checks.TrueForAll(c => c.pass);
        }
    }

    static IEnumerator Unknown(string name)
    {
        Check($"認得旅程「{name}」", false, "可用：" + string.Join(",", AllJourneys));
        yield break;
    }

    /// <summary>確保在夜晚中：還在主選單就按 Enter，開場卡片就等 2 秒後按空白鍵。</summary>
    static IEnumerator EnsureNight(BlindGameLoop loop)
    {
        if (loop.InNight && !Menus(loop).Open)
            yield break;
        if (Menus(loop).Open)
        {
            Tap(Key.Enter);
            yield return 1f;
        }
        yield return 2.2f;
        Tap(Key.Space);
        yield return 1f;
        LockCursorIfNeeded();
    }

    static IEnumerator MenuStart(BlindGameLoop loop)
    {
        yield return Shot("main-menu");
        yield return 0.5f;
        Check("開啟時顯示主選單", Menus(loop).Open);
        Check("主選單時還沒進夜晚", !loop.InNight);

        Tap(Key.Enter);
        yield return 1f;
        yield return Shot("briefing");
        yield return 0.5f;
        Check("Enter 後主選單關閉", !Menus(loop).Open);
        Check("Enter 後出現開場卡片", Hud(loop).BriefingOpen);

        yield return 1.5f;
        Tap(Key.Space);
        yield return 1.5f;
        LockCursorIfNeeded();
        yield return Shot("night");
        yield return 0.5f;
        Check("空白鍵後開場卡片關閉", !Hud(loop).BriefingOpen);
        Check("進入夜晚", loop.InNight, $"phase={loop.State.Phase}");
    }

    static IEnumerator MakeSound(BlindGameLoop loop)
    {
        var night = EnsureNight(loop);
        while (night.MoveNext())
            yield return night.Current;
        heard.Clear();
        Tap(Key.Space);
        yield return 0.4f;
        yield return Shot("make-sound");
        yield return 0.5f;
        Check("空白鍵發出製造聲音（Clap）", heard.Contains(nameof(SoundKind.Clap)), "聽到：" + string.Join(",", heard));
        Check("第一次照亮解鎖紀事「聲音就是光」", loop.Guide.IsUnlocked("law"));
    }

    static IEnumerator PauseMenu(BlindGameLoop loop)
    {
        var night = EnsureNight(loop);
        while (night.MoveNext())
            yield return night.Current;
        Tap(Key.Tab);
        yield return 0.6f;
        yield return Shot("pause");
        yield return 0.5f;
        Check("Tab 打開暫停選單", Menus(loop).Open);
        Check("暫停時時間停止", Mathf.Approximately(Time.timeScale, 0f), $"timeScale={Time.timeScale}");

        Tap(Key.Escape);
        yield return 0.6f;
        LockCursorIfNeeded();
        Check("Esc 關閉暫停選單", !Menus(loop).Open);
        Check("回到遊戲時間恢復", Mathf.Approximately(Time.timeScale, 1f), $"timeScale={Time.timeScale}");
    }

    static IEnumerator PushBoulder(BlindGameLoop loop)
    {
        var night = EnsureNight(loop);
        while (night.MoveNext())
            yield return night.Current;
        var boulder = loop.Layout.Boulder;
        var log = new StringBuilder();

        // 用滑鼠轉向、按住 W 走到巨石前面（真實輸入，不瞬移）。
        // 巨人會循聲抓人；被抓到這夜就結束，等下一夜淡入後重走，最多 3 次。
        for (int attempt = 1; attempt <= 3 && !loop.Player.AtBoulder; attempt++)
        {
            if (!loop.InNight)
            {
                float wait = (float)EditorApplication.timeSinceStartup + 15f;
                while (!loop.InNight && EditorApplication.timeSinceStartup < wait)
                    yield return 0.2f;
                yield return 0.5f;
                LockCursorIfNeeded();
            }
            float giveUp = (float)EditorApplication.timeSinceStartup + 45f;
            Hold(Key.W);
            while (!loop.Player.AtBoulder && EditorApplication.timeSinceStartup < giveUp && loop.InNight)
            {
                Steer(loop, boulder.PushPoint);
                yield return 0.05f;
            }
            Release(Key.W);
            yield return 0.3f;
            log.Append($"第 {attempt} 次：距離 {Vector3.Distance(loop.PlayerPosition, boulder.PushPoint):0.00} m，夜晚中={loop.InNight}；");
        }
        Check("走到巨石前並面向它", loop.Player.AtBoulder, log.ToString());

        float before = loop.Slide.Opening;
        heard.Clear();
        // 按住 E＋W 4 秒（巨石往外滑，玩家要跟著頂上去才搆得到），持續對準巨石。
        // 每 0.25 秒記一筆：在巨石前、推的模式、開口、夜晚中。
        // （不記 Keyboard.current.eKey：編輯器更新讀到的是編輯器自己的輸入緩衝，跟遊戲看到的不同。）
        var timeline = new StringBuilder();
        Hold(Key.E);
        Hold(Key.W);
        for (int i = 0; i < 16; i++)
        {
            for (int s = 0; s < 5; s++)
            {
                Steer(loop, boulder.PushPoint);
                yield return 0.05f;
            }
            timeline.Append($"[{i * 0.25f + 0.25f:0.00}s 前={(loop.Player.AtBoulder ? 1 : 0)} {loop.Player.PushMode} {loop.Slide.Opening:0.000} 夜={(loop.InNight ? 1 : 0)}] ");
            if (i == 11)
                yield return Shot("push-boulder");
        }
        Release(Key.W);
        Release(Key.E);
        result.notes.Add("推巨石時間線：" + timeline);
        float after = loop.Slide.Opening;
        Check("按住 E 巨石開口變大", after > before, $"開口 {before:0.000} → {after:0.000} m");
        Check("輕推發出磨擦聲（Grind）", heard.Contains(nameof(SoundKind.Grind)), "聽到：" + string.Join(",", heard));
    }

    // ---------- 輸入 ----------

    /// <summary>按下後隔 3 個畫面才放開：同一個畫面內按下又放開，遊戲讀不到 wasPressedThisFrame。</summary>
    static void Tap(Key key)
    {
        tapKey = key;
        tapReleaseFrame = Time.frameCount + 3;
        tapReleaseAt = EditorApplication.timeSinceStartup + 1.5;
        InputSystem.QueueStateEvent(kb, State(key));
    }

    static Key? tapKey;
    static int tapReleaseFrame;
    static double tapReleaseAt;

    /// <summary>過了 3 個畫面就放開；畫面卡住時 1.5 秒後也放開並記下來，不讓整個腳本卡死。</summary>
    static void ReleaseTapIfDue()
    {
        if (tapKey == null)
            return;
        bool framesDone = Time.frameCount >= tapReleaseFrame;
        if (!framesDone && EditorApplication.timeSinceStartup < tapReleaseAt)
            return;
        if (!framesDone)
            result.notes.Add($"按 {tapKey} 時遊戲畫面 1.5 秒沒前進（frame {Time.frameCount}），強制放開");
        tapKey = null;
        InputSystem.QueueStateEvent(kb, State());
    }

    static void Hold(Key key)
    {
        held.Add(key);
        InputSystem.QueueStateEvent(kb, State());
    }

    static void Release(Key key)
    {
        held.Remove(key);
        InputSystem.QueueStateEvent(kb, State());
    }

    static KeyboardState State(params Key[] extra)
    {
        var keys = new List<Key>(held);
        keys.AddRange(extra);
        return new KeyboardState(keys.ToArray());
    }

    /// <summary>算出要轉幾度，換成滑鼠水平位移送出（FirstPersonPlayer 每單位 0.08 度）。</summary>
    static void Steer(BlindGameLoop loop, Vector3 target)
    {
        Vector3 to = target - loop.PlayerPosition;
        to.y = 0f;
        Vector3 fwd = loop.Body.CameraTransform.forward;
        fwd.y = 0f;
        float angle = Vector3.SignedAngle(fwd, to, Vector3.up);
        float sensitivity = loop.Body.lookSensitivity;
        float dx = Mathf.Clamp(angle * 0.5f, -30f, 30f) / sensitivity;
        InputSystem.QueueStateEvent(mouse, new MouseState { delta = new Vector2(dx, 0f) });
    }

    /// <summary>
    /// 玩家本來點一下 Game 視窗就會鎖游標；編輯器沒焦點時鎖不住，這裡補鎖並記下來（屬於工具輔助，不算遊戲行為）。
    /// </summary>
    static void LockCursorIfNeeded()
    {
        if (Cursor.lockState == CursorLockMode.Locked)
            return;
        Cursor.lockState = CursorLockMode.Locked;
        result.notes.Add("游標沒有自動鎖定，工具已補鎖（編輯器沒有焦點時會發生）");
    }

    static void FocusGameView()
    {
        var type = Type.GetType("UnityEditor.GameView,UnityEditor");
        if (type != null)
            EditorWindow.GetWindow(type).Focus();
    }

    // ---------- 證據 ----------

    static Journey current;

    /// <summary>
    /// 截圖要等檔案真的寫出來才往下走：編輯器沒焦點時 Game 視窗很久才重畫一次，
    /// 不等的話截到的會是後面幾步的畫面。等待期間每拍強迫重畫。
    /// </summary>
    static float Shot(string name)
    {
        string file = $"{result.shots.Count + 1:00}-{name}.png";
        pendingShot = Path.Combine(outDir, file);
        shotDeadline = (float)EditorApplication.timeSinceStartup + 10f;
        ScreenCapture.CaptureScreenshot(pendingShot);
        result.shots.Add(file);
        if (current != null)
            current.shots.Add(file);
        return 0f;
    }

    static string pendingShot;
    static float shotDeadline;

    /// <summary>還在等截圖就回傳 true。逾時就記下來並放行。</summary>
    static bool WaitingForShot()
    {
        if (pendingShot == null)
            return false;
        if (File.Exists(pendingShot))
        {
            pendingShot = null;
            return false;
        }
        if (EditorApplication.timeSinceStartup > shotDeadline)
        {
            result.notes.Add($"截圖 10 秒內沒寫出：{Path.GetFileName(pendingShot)}");
            pendingShot = null;
            return false;
        }
        UnityEditorInternal.InternalEditorUtility.RepaintAllViews();
        return true;
    }

    static void Check(string what, bool pass, string detail = "")
    {
        var c = new CheckItem { what = what, pass = pass, detail = detail };
        (current?.checks ?? result.setup).Add(c);
        Debug.Log($"OdysseyVerify: [{(pass ? "過" : "失敗")}] {what} {detail}");
    }

    static GameMenus Menus(BlindGameLoop loop) => loop.GetComponent<GameMenus>();
    static MissionHud Hud(BlindGameLoop loop) => loop.GetComponent<MissionHud>();

    [Serializable] class CheckItem { public string what; public bool pass; public string detail; }

    [Serializable]
    class Journey
    {
        public string name;
        public bool passed;
        public List<CheckItem> checks = new();
        public List<string> shots = new();
    }

    [Serializable]
    class Result
    {
        public string started, finished, outDir, error;
        public int exitCode;
        public List<CheckItem> setup = new();
        public List<Journey> journeys = new();
        public List<string> shots = new();
        public List<string> notes = new();
        public bool AllPassed => string.IsNullOrEmpty(error) && setup.TrueForAll(c => c.pass)
            && journeys.TrueForAll(j => j.checks.TrueForAll(c => c.pass));
    }
}
