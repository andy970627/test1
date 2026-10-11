using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 情境提示（規格第 17 節 C）：看著巨人、巨石、羊群、雜物與聲音，某件事第一次發生時講一句，
/// 畫在畫面上方中央（文字加陰影、不加背景）。教學中與夜晚以外暫停。
/// </summary>
public class SituationHints : MonoBehaviour
{
    const float DecoyReach = 4f;
    const float WhimperReach = 8f;
    const float StakeNotice = 3f;
    const float HeavyAfterLight = 5f;
    const float DawnSoon = 0.75f;
    const float FadeSeconds = 0.5f;

    static readonly Color Text = new(0.97f, 0.95f, 0.88f);
    static readonly Color Shadow = new(0f, 0f, 0f, 0.85f);

    BlindGameLoop loop;
    HintQueue hints;
    GUIStyle style;
    float lightPush;

    public void Init(BlindGameLoop loop, HintQueue hints)
    {
        this.loop = loop;
        this.hints = hints;
        SoundBus.Emitted += OnSound;
    }

    void OnDestroy() => SoundBus.Emitted -= OnSound;

    bool Paused => loop.State.Phase != LoopPhase.Night || loop.Tutorial.Active;

    void OnSound(SoundEvent e, Vector3 at)
    {
        if (loop == null || Paused)
            return;
        switch (e.Kind)
        {
            case SoundKind.Whimper when Flat(at - loop.PlayerPosition).magnitude <= WhimperReach:
                hints.Trigger(HintKind.Whimper);
                break;
            case SoundKind.Clatter:
                hints.Trigger(HintKind.Pail);
                break;
            case SoundKind.Pant:
                hints.Trigger(HintKind.Pant);
                break;
        }
    }

    void Update()
    {
        if (loop == null)
            return;
        if (!Paused)
            Watch();
        else
            lightPush = 0f;
        hints.Tick(Time.deltaTime, Paused);
    }

    void Watch()
    {
        var player = loop.Player;
        Vector3 me = loop.PlayerPosition;

        var cyclops = loop.Cyclops;
        if (cyclops.Active && cyclops.Brain != null)
        {
            var brain = cyclops.Brain;
            switch (brain.State)
            {
                case CyclopsState.Investigate when player.Stones > 0
                    && (new System.Numerics.Vector2(me.x, me.z) - brain.Target).Length() <= DecoyReach:
                    hints.Trigger(HintKind.Decoy);
                    break;
                case CyclopsState.Guard:
                    hints.Trigger(HintKind.Guard);
                    break;
                case CyclopsState.Throw:
                    hints.Trigger(HintKind.RockWindup);
                    break;
            }
        }

        // 連續輕推 5 秒：教猛推。按著 Shift 卻因體力不足變成輕推的不算（他已經會猛推了）。
        var keyboard = Keyboard.current;
        bool shift = keyboard != null && keyboard.shiftKey.isPressed;
        lightPush = player.PushMode == PushMode.Light && !shift ? lightPush + Time.deltaTime : 0f;
        if (lightPush >= HeavyAfterLight)
            hints.Trigger(HintKind.Heavy);

        var stake = loop.Stake;
        if (!player.CarryingStake && Flat(stake.transform.position - me).magnitude <= StakeNotice)
            hints.Trigger(HintKind.Stake);

        if (loop.Dawn.Fraction >= DawnSoon)
            hints.Trigger(HintKind.Dawn);
        if (loop.Rush.Active)
            hints.Trigger(HintKind.Rush);
        if (loop.Rush.Stuck)
            hints.Trigger(HintKind.SheepStuck);
    }

    void OnGUI()
    {
        if (loop == null || hints.Current is not HintKind kind)
            return;
        int fontSize = Mathf.Max(20, Screen.height / 34);
        if (style == null || style.fontSize != fontSize)
            style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, alignment = TextAnchor.MiddleCenter, wordWrap = false };

        float alpha = Mathf.Clamp01(hints.Remaining / FadeSeconds);
        string text = HintText.Of(kind);
        float h = fontSize * 1.5f;
        var rect = new Rect(0f, Screen.height * 0.12f, Screen.width, h);
        var shadow = rect;
        shadow.position += new Vector2(2f, 2f);
        style.normal.textColor = new Color(Shadow.r, Shadow.g, Shadow.b, Shadow.a * alpha);
        GUI.Label(shadow, text, style);
        style.normal.textColor = new Color(Text.r, Text.g, Text.b, alpha);
        GUI.Label(rect, text, style);
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);
}
