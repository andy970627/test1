using Odyssey.Core;
using UnityEngine;
using UnityEngine.InputSystem;

/// <summary>
/// 情境提示（規格第 17 節 C）：看著巨人、巨石、羊群、雜物與聲音，某件事第一次發生時講一句，
/// 畫在畫面上方中央（文字加陰影、不加背景）。夜晚以外暫停。
/// </summary>
public class SituationHints : MonoBehaviour
{
    const float DecoyReach = 4f;
    const float WhimperReach = 8f;
    const float StakeNotice = 3f;
    const float HeavyAfterLight = 5f;
    const float DawnSoon = 0.75f;
    const float FadeSeconds = 0.5f;
    const float FindExitSeconds = 15f;
    const float FindExitDistance = 6f;

    static readonly Color Text = OdysseyPalette.Parchment;
    static readonly Color Shadow = OdysseyPalette.TextShadow;

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

    bool Paused => loop.State.Phase != LoopPhase.Night;

    bool lawShown;
    bool reachedBoulder;

    void OnSound(SoundEvent e, Vector3 at)
    {
        if (loop == null || Paused)
            return;
        // 核心法則：整場第一個會照亮的聲音，在回聲邊緣證明給玩家看（規格第 25 節 A）。
        if (SoundRules.Lights(e.Kind))
        {
            // 示範只給玩家自己發出的聲音（不含羊撞倒的奶桶等）。
            bool mine = e.Kind is SoundKind.Clap or SoundKind.SnapShot or SoundKind.Arrow or SoundKind.Grind or SoundKind.Boulder or SoundKind.Wedge;
            if (mine)
                loop.Essential.OnLit();
            if (!lawShown && mine)
            {
                lawShown = true;
                loop.ShowLaw(at, SoundRules.Radius(e.Loudness));
            }
            if (loop.Difficulty != DifficultyLevel.Normal)
                loop.Hint(HintKind.HearingRing);
        }
        switch (e.Kind)
        {
            case SoundKind.Whimper when Flat(at - loop.PlayerPosition).magnitude <= WhimperReach:
                loop.Hint(HintKind.Whimper);
                break;
            case SoundKind.Clatter:
                loop.Hint(HintKind.Pail);
                break;
            case SoundKind.Step when loop.Flags.Passive == PassiveLight.Off:
            case SoundKind.Run when loop.Flags.Passive == PassiveLight.Off:
                loop.Hint(HintKind.Footstep);
                break;
            case SoundKind.Arrow:
                loop.Hint(HintKind.ArrowClutter);
                break;
            case SoundKind.Pant:
                loop.Hint(HintKind.Pant);
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
                case CyclopsState.Investigate when player.Arrows > 0
                    && (new System.Numerics.Vector2(me.x, me.z) - brain.Target).Length() <= DecoyReach:
                    loop.Hint(HintKind.Decoy);
                    break;
                case CyclopsState.Guard:
                    loop.Hint(HintKind.Guard);
                    break;
                case CyclopsState.Throw:
                    loop.Hint(HintKind.RockWindup);
                    break;
                case CyclopsState.Pray:
                    loop.Hint(HintKind.Prayer);
                    break;
            }
        }

        // 連續輕推 5 秒：教猛推。按著 Shift 卻因體力不足變成輕推的不算（他已經會猛推了）。
        var keyboard = Keyboard.current;
        bool shift = keyboard != null && keyboard.shiftKey.isPressed;
        lightPush = player.PushMode == PushMode.Light && !shift ? lightPush + Time.deltaTime : 0f;
        if (lightPush >= HeavyAfterLight)
            loop.Hint(HintKind.Heavy);

        var stake = loop.Stake;
        if (!player.CarryingStake && Flat(stake.transform.position - me).magnitude <= StakeNotice)
            loop.Hint(HintKind.Stake);

        if (loop.Dawn.Fraction >= DawnSoon)
            loop.Hint(HintKind.Dawn);
        if (loop.Rush.Active)
        {
            loop.Hint(HintKind.Rush);
            loop.Unlock("rescue");
        }

        // 找不到洞口：夜晚開始 15 秒還沒靠近過巨石。
        if (loop.Dawn.Elapsed < 0.1f)
            reachedBoulder = false;
        if (Flat(loop.Layout.Boulder.PushPoint - me).magnitude <= FindExitDistance)
            reachedBoulder = true;
        if (!reachedBoulder && loop.Dawn.Elapsed >= FindExitSeconds)
            loop.Hint(HintKind.FindExit);
        if (loop.Rush.Stuck)
            loop.Hint(HintKind.SheepStuck);
    }

    void OnGUI()
    {
        OdysseyFonts.UseForGui();
        if (loop == null || hints.Current is not HintKind kind)
            return;
        int fontSize = Mathf.Max(20, Screen.height / 34);
        if (style == null || style.fontSize != fontSize)
            style = new GUIStyle(GUI.skin.label) { fontSize = fontSize, alignment = TextAnchor.MiddleCenter, wordWrap = false };

        float alpha = Mathf.Clamp01(hints.Remaining / FadeSeconds);
        float h = fontSize * 1.5f;
        var verse = VerseFor(kind);
        if (verse.HasValue)
        {
            // 吟遊詩句（規格第 31 節 D）：兩行一行一行淡入。
            float shown = HintQueue.ShowSeconds - hints.Remaining;
            float a1 = alpha * Mathf.Clamp01(shown / BardVerse.LineFadeIn);
            float a2 = alpha * Mathf.Clamp01((shown - BardVerse.LineFadeIn) / BardVerse.LineFadeIn);
            Draw(new Rect(0f, Screen.height * 0.10f, Screen.width, h), verse.Value.Item1, a1);
            if (!string.IsNullOrEmpty(verse.Value.Item2))
                Draw(new Rect(0f, Screen.height * 0.10f + h, Screen.width, h), verse.Value.Item2, a2);
            return;
        }
        Draw(new Rect(0f, Screen.height * 0.12f, Screen.width, h), HintText.Of(kind), alpha);
    }

    void Draw(Rect rect, string text, float alpha)
    {
        var shadow = rect;
        shadow.position += new Vector2(2f, 2f);
        style.normal.textColor = new Color(Shadow.r, Shadow.g, Shadow.b, Shadow.a * alpha);
        GUI.Label(shadow, text, style);
        style.normal.textColor = new Color(Text.r, Text.g, Text.b, alpha);
        GUI.Label(rect, text, style);
    }

    /// <summary>有詩句的提示（宙斯法則、雅典娜、巨人吃人、禱告），在「詩句」風格且有眷顧時改用詩句。</summary>
    (string, string)? VerseFor(HintKind kind)
    {
        // 偷襲與燃燒的木馬是失去眷顧的那一刻，照樣用詩句（只看引導風格）。
        if (kind is HintKind.Ambush or HintKind.Horse && loop.Flags.Guide == GuideStyle.Verse)
            return kind == HintKind.Ambush ? VerseBook.Ambush : VerseBook.Horse;
        if (!loop.VersesShown)
            return null;
        return kind switch
        {
            HintKind.FirstStone => VerseBook.FirstStone,
            HintKind.FairHit => VerseBook.FairHit,
            HintKind.Ambush => VerseBook.Ambush,
            HintKind.FavorRegained => VerseBook.Regained,
            HintKind.CrewEaten => VerseBook.CrewEaten,
            HintKind.Prayer => VerseBook.Prayer,
            HintKind.DawnStir => VerseBook.DawnStir,
            _ => ((string, string)?)null,
        };
    }

    HintKind? plucked;
    bool secondPlucked;
    SoundPlayer sounds;

    /// <summary>詩句每行開頭撥一聲里拉琴（只有玩家聽得到）。</summary>
    void LateUpdate()
    {
        if (loop == null || hints.Current is not HintKind kind || !VerseFor(kind).HasValue)
        {
            plucked = null;
            return;
        }
        sounds ??= GetComponent<SoundPlayer>();
        if (plucked != kind)
        {
            plucked = kind;
            secondPlucked = false;
            sounds?.PlayLyre(4, 0.3f);
            GetComponent<TerrorMusic>()?.Duck(HintQueue.ShowSeconds);
        }
        if (!secondPlucked && HintQueue.ShowSeconds - hints.Remaining >= BardVerse.LineFadeIn)
        {
            secondPlucked = true;
            sounds?.PlayLyre(2, 0.3f);
        }
    }

    static Vector3 Flat(Vector3 v) => new(v.x, 0f, v.z);
}
