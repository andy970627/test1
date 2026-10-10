using System.IO;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class LoopFailScreenBuilder
{
    const string PrefabDir = "Assets/UI/LoopFail";
    const string PrefabPath = PrefabDir + "/LoopFailScreen.prefab";

    [MenuItem("Odyssey/UI/Create Loop Fail Screen")]
    static void Create()
    {
        if (!EnsureTmpEssentials("Odyssey/UI/Create Loop Fail Screen"))
            return;

        var prefab = BuildPrefab();
        var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
        Undo.RegisterCreatedObjectUndo(instance, "Create Loop Fail Screen");
        EditorSceneManager.MarkSceneDirty(instance.scene);
        Selection.activeGameObject = instance;
        Debug.Log($"LoopFailScreenBuilder: 已建立 {PrefabPath} 並放進目前場景。");
    }

    /// <summary>TMP Essential Resources 不存在時匯入它並回傳 false（匯入是非同步的，需要再執行一次選單）。</summary>
    public static bool EnsureTmpEssentials(string menuName)
    {
        if (AssetDatabase.IsValidFolder("Assets/TextMesh Pro"))
            return true;
        TMP_PackageResourceImporter.ImportResources(true, false, false);
        Debug.Log($"已匯入 TMP Essential Resources，等匯入完成後請再執行一次 {menuName}。");
        return false;
    }

    /// <summary>回傳既有的 prefab，沒有就建一個。</summary>
    public static GameObject EnsurePrefab()
    {
        var existing = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
        return existing != null ? existing : BuildPrefab();
    }

    static GameObject BuildPrefab()
    {
        var root = new GameObject("LoopFailScreen", typeof(RectTransform));
        root.layer = LayerMask.NameToLayer("UI");
        var canvas = root.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 100;
        var scaler = root.AddComponent<UnityEngine.UI.CanvasScaler>();
        scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        scaler.matchWidthOrHeight = 0.5f;
        root.AddComponent<UnityEngine.UI.GraphicRaycaster>();
        var screenGroup = root.AddComponent<CanvasGroup>();
        screenGroup.interactable = false;

        var blackout = CreateChild("Blackout", root.transform);
        Stretch(blackout);
        var blackoutImage = blackout.gameObject.AddComponent<UnityEngine.UI.Image>();
        blackoutImage.color = Color.black;

        var content = CreateChild("Content", root.transform);
        content.anchorMin = content.anchorMax = content.pivot = new Vector2(0.5f, 0.5f);
        content.sizeDelta = new Vector2(1200, 400);
        var contentGroup = content.gameObject.AddComponent<CanvasGroup>();
        contentGroup.interactable = false;
        contentGroup.blocksRaycasts = false;
        var layout = content.gameObject.AddComponent<UnityEngine.UI.VerticalLayoutGroup>();
        layout.childAlignment = TextAnchor.MiddleCenter;
        layout.spacing = 24;
        layout.childControlWidth = true;
        layout.childControlHeight = true;
        layout.childForceExpandWidth = true;
        layout.childForceExpandHeight = false;

        var yearText = CreateText("YearText", content, "", 40, new Color32(0x8A, 0x9B, 0xA8, 0xFF));
        var titleText = CreateText("TitleText", content, "", 72, new Color32(0xD9, 0xD4, 0xC7, 0xFF));
        var subtitleText = CreateText("SubtitleText", content, "", 28, new Color32(0x80, 0x80, 0x80, 0xFF));

        var screen = root.AddComponent<LoopFailScreen>();
        var so = new SerializedObject(screen);
        so.FindProperty("screenGroup").objectReferenceValue = screenGroup;
        so.FindProperty("contentGroup").objectReferenceValue = contentGroup;
        so.FindProperty("yearText").objectReferenceValue = yearText;
        so.FindProperty("titleText").objectReferenceValue = titleText;
        so.FindProperty("subtitleText").objectReferenceValue = subtitleText;
        so.ApplyModifiedPropertiesWithoutUndo();

        Directory.CreateDirectory(PrefabDir);
        var prefab = PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
        Object.DestroyImmediate(root);
        return prefab;
    }

    static RectTransform CreateChild(string name, Transform parent)
    {
        var go = new GameObject(name, typeof(RectTransform));
        go.layer = LayerMask.NameToLayer("UI");
        var rt = (RectTransform)go.transform;
        rt.SetParent(parent, false);
        return rt;
    }

    static void Stretch(RectTransform rt)
    {
        rt.anchorMin = Vector2.zero;
        rt.anchorMax = Vector2.one;
        rt.offsetMin = rt.offsetMax = Vector2.zero;
    }

    static TextMeshProUGUI CreateText(string name, Transform parent, string text, float size, Color color)
    {
        var rt = CreateChild(name, parent);
        var tmp = rt.gameObject.AddComponent<TextMeshProUGUI>();
        tmp.text = text;
        tmp.fontSize = size;
        tmp.color = color;
        tmp.alignment = TextAlignmentOptions.Center;
        tmp.textWrappingMode = TextWrappingModes.NoWrap;
        tmp.raycastTarget = false;
        return tmp;
    }
}
