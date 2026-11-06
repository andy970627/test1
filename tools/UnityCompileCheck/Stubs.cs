// 編譯檢查用的最小替身：只放本專案用到的 Input System 與 TextMeshPro 成員，不是真的實作。
namespace UnityEngine.InputSystem
{
    namespace Controls
    {
        public class ButtonControl
        {
            public bool wasPressedThisFrame => false;
            public bool wasReleasedThisFrame => false;
            public bool isPressed => false;
        }
        public class Vector2Control
        {
            public UnityEngine.Vector2 ReadValue() => default;
        }
        public class AnyKeyControl : ButtonControl { }
    }
    public enum Key { None, Space, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12 }
    public class Keyboard
    {
        public Controls.ButtonControl this[Key key] => new();
        public static Keyboard current => null;
        public Controls.AnyKeyControl anyKey => new();
        public Controls.ButtonControl spaceKey => new();
        public Controls.ButtonControl wKey => new();
        public Controls.ButtonControl aKey => new();
        public Controls.ButtonControl sKey => new();
        public Controls.ButtonControl dKey => new();
        public Controls.ButtonControl eKey => new();
        public Controls.ButtonControl fKey => new();
        public Controls.ButtonControl gKey => new();
        public Controls.ButtonControl rKey => new();
        public Controls.ButtonControl qKey => new();
        public Controls.ButtonControl tabKey => new();
        public Controls.ButtonControl escapeKey => new();
        public Controls.ButtonControl enterKey => new();
        public Controls.ButtonControl numpadEnterKey => new();
        public Controls.ButtonControl backspaceKey => new();
        public Controls.ButtonControl shiftKey => new();
        public Controls.ButtonControl leftShiftKey => new();
        public Controls.ButtonControl rightShiftKey => new();
        public Controls.ButtonControl upArrowKey => new();
        public Controls.ButtonControl downArrowKey => new();
        public Controls.ButtonControl leftArrowKey => new();
        public Controls.ButtonControl rightArrowKey => new();
        public Controls.ButtonControl f1Key => new();
        public Controls.ButtonControl f2Key => new();
        public Controls.ButtonControl f10Key => new();
        public Controls.ButtonControl f9Key => new();
        public Controls.ButtonControl f8Key => new();
        public Controls.ButtonControl f7Key => new();
        public Controls.ButtonControl f6Key => new();
        public Controls.ButtonControl f5Key => new();
        public Controls.ButtonControl f4Key => new();
        public Controls.ButtonControl f3Key => new();
        public Controls.ButtonControl ctrlKey => new();
        public Controls.ButtonControl altKey => new();
        public Controls.ButtonControl digit1Key => new();
        public Controls.ButtonControl digit2Key => new();
        public Controls.ButtonControl digit3Key => new();
    }
    public class Mouse
    {
        public static Mouse current => null;
        public Controls.ButtonControl leftButton => new();
        public Controls.ButtonControl rightButton => new();
        public Controls.ButtonControl middleButton => new();
        public Controls.Vector2Control delta => new();
        public Controls.Vector2Control position => new();
        public Controls.Vector2Control scroll => new();
    }
}

namespace TMPro
{
    public class TMP_FontAsset : UnityEngine.Object
    {
        public static TMP_FontAsset CreateFontAsset(UnityEngine.Font font) => null;
        public static TMP_FontAsset CreateFontAsset(string family, string style) => null;
    }
    public class TMP_Text : UnityEngine.MonoBehaviour
    {
        public string text { get; set; }
        public float fontSize { get; set; }
        public TMP_FontAsset font { get; set; }
        public UnityEngine.Color color { get; set; }
    }
    public class TextMeshProUGUI : TMP_Text { }
    public class TextMeshPro : TMP_Text { }
}
