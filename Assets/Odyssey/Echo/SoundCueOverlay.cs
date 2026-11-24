using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 聲音提示的呈現（實驗頁開關，預設關）：畫面邊緣標出海風與巨人的方向、一行狀況文字，
/// 面向洞口時響起越對越密的對準音。對準音是單聲道，筆電喇叭也聽得出來。
/// </summary>
public class SoundCueOverlay : MonoBehaviour
{
    const int MarkSegments = 5;
    const float SegmentDegrees = 5f;
    const float PingVolume = 0.28f;

    BlindGameLoop loop;
    FirstPersonPlayer body;
    BlindCyclops cyclops;
    System.Func<bool> menuOpen;
    AudioSource ping;
    GUIStyle style;
    float nextPing;
    float windBearing, giantBearing, giantDistance;

    public void Init(BlindGameLoop loop, FirstPersonPlayer body, BlindCyclops cyclops, System.Func<bool> menuOpen)
    {
        this.loop = loop;
        this.body = body;
        this.cyclops = cyclops;
        this.menuOpen = menuOpen;
        ping = gameObject.AddComponent<AudioSource>();
        ping.clip = ProceduralAudio.CueTick();
        ping.playOnAwake = false;
        ping.spatialBlend = 0f;
        ping.volume = PingVolume;
    }

    bool Showing => loop != null && loop.Flags.CueAssist && loop.State.Phase == LoopPhase.Night && !menuOpen();

    void Update()
    {
        if (!Showing)
            return;
        Vector3 at = body.transform.position, f = body.CameraTransform.forward;
        Vector3 toWind = loop.Layout.Boulder.GapPoint - at, toGiant = cyclops.transform.position - at;
        windBearing = SoundCues.Bearing(f.x, f.z, toWind.x, toWind.z);
        giantBearing = SoundCues.Bearing(f.x, f.z, toGiant.x, toGiant.z);
        giantDistance = new Vector2(toGiant.x, toGiant.z).magnitude;

        float interval = SoundCues.PingInterval(SoundCues.Alignment(windBearing));
        if (interval > 0f && Time.time >= nextPing)
        {
            ping.Play();
            nextPing = Time.time + interval;
        }
    }

    void OnGUI()
    {
        if (!Showing || Event.current.type != EventType.Repaint)
            return;
        OdysseyFonts.UseForGui();
        DrawMark(windBearing, OdysseyPalette.Gold, 0.85f, 1f);
        float urgency = SoundCues.Urgency(giantDistance);
        if (urgency > 0f)
        {
            float pulse = 0.75f + 0.25f * Mathf.Sin(Time.time * (3f + 7f * urgency));
            DrawMark(giantBearing, OdysseyPalette.FlashRed, (0.35f + 0.65f * urgency) * pulse, 1f + urgency);
        }

        int size = Mathf.Max(20, Screen.height / 34);
        style ??= new GUIStyle(GUI.skin.label) { alignment = TextAnchor.MiddleCenter, wordWrap = true };
        style.fontSize = size;
        var rect = new Rect(0f, Screen.height * 0.72f, Screen.width, size * 1.6f);
        string line = SoundCues.Line(windBearing, giantBearing, giantDistance);
        style.normal.textColor = OdysseyPalette.TextShadow;
        GUI.Label(new Rect(rect.x + 2f, rect.y + 2f, rect.width, rect.height), line, style);
        style.normal.textColor = OdysseyPalette.Parchment;
        GUI.Label(rect, line, style);
    }

    /// <summary>沿著畫面內緣的橢圓畫一小段弧：上＝前方、右＝右邊、下＝後方。</summary>
    static void DrawMark(float bearing, Color color, float alpha, float thickness)
    {
        float cx = Screen.width / 2f, cy = Screen.height / 2f;
        float rx = Screen.width * 0.46f, ry = Screen.height * 0.44f;
        float length = Mathf.Max(16f, Screen.height / 40f), height = Mathf.Max(4f, Screen.height / 180f) * thickness;
        Matrix4x4 saved = GUI.matrix;
        Color savedColor = GUI.color;
        for (int i = 0; i < MarkSegments; i++)
        {
            float offset = (i - (MarkSegments - 1) / 2f) * SegmentDegrees;
            float rad = (bearing + offset) * Mathf.Deg2Rad;
            var p = new Vector2(cx + Mathf.Sin(rad) * rx, cy - Mathf.Cos(rad) * ry);
            float tangent = Mathf.Atan2(Mathf.Sin(rad) * ry, Mathf.Cos(rad) * rx) * Mathf.Rad2Deg;
            float fade = 1f - Mathf.Abs(i - (MarkSegments - 1) / 2f) * 0.3f;
            GUI.color = new Color(color.r, color.g, color.b, alpha * fade);
            GUI.matrix = saved;
            GUIUtility.RotateAroundPivot(tangent, p);
            GUI.DrawTexture(new Rect(p.x - length / 2f, p.y - height / 2f, length, height), Texture2D.whiteTexture);
        }
        GUI.matrix = saved;
        GUI.color = savedColor;
    }
}
