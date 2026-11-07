using System;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

/// <summary>雲端建置（GitHub Actions＋game-ci）的進入點：產生實測場景，輸出網頁版。</summary>
public static class OdysseyCiBuild
{
    const string DefaultPath = "build/WebGL/WebGL";

    public static void BuildWebGL()
    {
        if (!AssetDatabase.IsValidFolder("Assets/TextMesh Pro"))
            throw new Exception("OdysseyCiBuild: 缺少 Assets/TextMesh Pro（TMP Essential Resources）。");

        OdysseyPlaytestSceneBuilder.BuildScene();

        // 只在這次建置設定，不改版控裡的 ProjectSettings：Gzip＋解壓縮備援，itch.io 不必另設回應標頭。
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
        PlayerSettings.WebGL.decompressionFallback = true;
        // 自適應模板：畫布填滿 itch.io 嵌入框，並把高解析度螢幕的算圖倍率固定在 1（見 Assets/WebGLTemplates/Odyssey）。
        PlayerSettings.WebGL.template = "PROJECT:Odyssey";

        var options = new BuildPlayerOptions
        {
            scenes = new[] { OdysseyPlaytestSceneBuilder.ScenePath },
            locationPathName = ArgValue("-customBuildPath") ?? DefaultPath,
            target = BuildTarget.WebGL,
            options = BuildOptions.None,
        };
        BuildReport report = BuildPipeline.BuildPlayer(options);
        BuildSummary summary = report.summary;
        Debug.Log($"OdysseyCiBuild: {summary.result}，{summary.totalErrors} 個錯誤，{summary.totalSize / (1024 * 1024)} MB → {options.locationPathName}");
        if (summary.result != BuildResult.Succeeded)
            throw new Exception($"OdysseyCiBuild: 建置失敗（{summary.result}）。");
    }

    static string ArgValue(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i] == name)
                return args[i + 1];
        return null;
    }
}
