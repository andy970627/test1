using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class OdysseyPlaytestSceneBuilder
{
    const string MenuName = "Odyssey/Create Playtest Scene";
    const string ScenePath = "Assets/Scenes/OdysseyPlaytest.unity";

    [MenuItem(MenuName)]
    static void Create()
    {
        if (!LoopFailScreenBuilder.EnsureTmpEssentials(MenuName))
            return;
        if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            return;

        var failScreen = LoopFailScreenBuilder.EnsurePrefab();
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        PrefabUtility.InstantiatePrefab(failScreen);
        EditorSceneManager.SaveScene(scene, ScenePath);
        Debug.Log($"OdysseyPlaytestSceneBuilder: 已建立 {ScenePath}，按 Play 開始實測。");
    }
}
