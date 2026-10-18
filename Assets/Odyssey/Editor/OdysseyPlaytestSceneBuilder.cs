using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class OdysseyPlaytestSceneBuilder
{
    const string MenuName = "Odyssey/Create Playtest Scene";
    public const string ScenePath = "Assets/Scenes/BlindCave.unity";

    [MenuItem(MenuName)]
    static void Create()
    {
        if (!LoopFailScreenBuilder.EnsureTmpEssentials(MenuName))
            return;
        if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            return;

        BuildScene();
        Debug.Log($"OdysseyPlaytestSceneBuilder: 已建立 {ScenePath}，按 Play 開始實測。");
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
