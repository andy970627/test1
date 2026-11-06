using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class OdysseyPlaytestSceneBuilder
{
    const string MenuName = "Odyssey/Create Playtest Scene";
    const string PlayMenuName = "Odyssey/Create Playtest Scene and Play";
    public const string ScenePath = "Assets/Scenes/BlindCave.unity";

    [MenuItem(MenuName)]
    static void Create() => CreateThen(false);

    /// <summary>建立場景後直接按下 Play（手動實測最常用的一步）。</summary>
    [MenuItem(PlayMenuName)]
    static void CreateAndPlay() => CreateThen(true);

    /// <summary>
    /// 遊戲執行中不能存場景（Unity 會丟 InvalidOperationException）：
    /// 先停止 Play，回到編輯模式後再建立；play 為 true 時建好就重新開始 Play。
    /// </summary>
    static void CreateThen(bool play)
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
        {
            void OnChanged(PlayModeStateChange change)
            {
                if (change != PlayModeStateChange.EnteredEditMode)
                    return;
                EditorApplication.playModeStateChanged -= OnChanged;
                EditorApplication.delayCall += () => CreateThen(play);
            }
            EditorApplication.playModeStateChanged += OnChanged;
            EditorApplication.isPlaying = false;
            Debug.Log("OdysseyPlaytestSceneBuilder: 先停止 Play，回到編輯模式後重建實測場景。");
            return;
        }
        if (!LoopFailScreenBuilder.EnsureTmpEssentials(MenuName))
            return;
        if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            return;

        BuildScene();
        Debug.Log($"OdysseyPlaytestSceneBuilder: 已建立 {ScenePath}" + (play ? "，開始 Play。" : "，按 Play 開始實測。"));
        if (play)
            EditorApplication.isPlaying = true;
    }

    /// <summary>建立並存檔實測場景；選單與雲端建置（OdysseyCiBuild）共用。</summary>
    public static void BuildScene()
    {
        var failScreen = LoopFailScreenBuilder.EnsurePrefab();
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        new GameObject("BlindGameLoop").AddComponent<BlindGameLoop>();
        PrefabUtility.InstantiatePrefab(failScreen);
        EditorSceneManager.SaveScene(scene, ScenePath);
    }
}
