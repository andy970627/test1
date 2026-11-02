using Odyssey.Core;
using UnityEngine;

/// <summary>
/// 事件回饋（規格第 25 節 E）與核心法則的示範（第 25 節 A）：
/// 同伴被吃（慘叫、紅邊脈動、方向弧、任務清單人數閃紅）、巨人靠近（心跳、暗角）、
/// 撞到東西（鏡頭輕震、只有玩家聽得到的撞擊聲）、岩石落在附近（大震、耳鳴）、
/// 第一次發聲時在回聲邊緣浮現「他聽得到這麼遠」。畫面效果只有暗角與色邊，不加背景。
/// </summary>
public class ScreenFeedback : MonoBehaviour
{
    const float PulseSeconds = 0.6f;
    const float ArcSeconds = 1.5f;
    const float RockNearMeters = 5f;
    const float TinnitusSeconds = 1.5f;
    const float TinnitusVolume = 0.4f;
    const float BumpCooldown = 0.5f;
    const float LawShowSeconds = 2f;

    static readonly Color Blood = new(0.55f, 0.03f, 0.02f);
    static readonly Color LawColor = new(0.97f, 0.95f, 0.88f);

    BlindGameLoop loop;
    FirstPersonPlayer body;
    BoulderFeel feel;
    AudioSource heart, ring;
    AudioClip scream, bump;
    float pulseLeft;
    float arcLeft;
    Vector3 arcFrom;
    float tinnitusLeft;
    float lastBump = -10f;
    float lawAt = -1f;
    Vector3 lawPoint;
    float heartIntensity;
    float terrorVignette;

    /// <summary>舊版 8 m 單層心跳（實驗開關「恐懼半徑：舊版」）；分層模式由 TerrorMusic 播心跳。</summary>
    public bool LegacyHeartbeat { get; set; } = true;

    /// <summary>恐懼半徑第 3 層與追殺時的四角變暗（0～1），由遊戲迴圈每幀設定。</summary>
    public void SetTerrorVignette(float amount) => terrorVignette = Mathf.Clamp01(amount);
    GUIStyle lawStyle;

    public static float RockNear => RockNearMeters;

    public void Init(BlindGameLoop loop, FirstPersonPlayer body)
    {
        this.loop = loop;
        this.body = body;
        feel = GetComponent<BoulderFeel>();
        scream = ProceduralAudio.Scream();
        bump = ProceduralAudio.SoftThud();

        heart = gameObject.AddComponent<AudioSource>();
        heart.clip = ProceduralAudio.Heartbeat();
        heart.loop = true;
        heart.spatialBlend = 0f;
        heart.volume = 0f;
        heart.playOnAwake = false;

        ring = gameObject.AddComponent<AudioSource>();
        ring.clip = ProceduralAudio.Tinnitus();
        ring.spatialBlend = 0f;
        ring.ignoreListenerVolume = true;
        ring.playOnAwake = false;
    }

    /// <summary>同伴在 at 被吃：慘叫從那裡傳來，畫面邊緣紅一下並指出方向。</summary>
    public void CrewEaten(Vector3 at)
    {
        AudioSource.PlayClipAtPoint(scream, at + Vector3.up, 1f);
        pulseLeft = PulseSeconds;
        arcLeft = ArcSeconds;
        arcFrom = at;
    }

    /// <summary>玩家撞到東西：鏡頭輕震＋只有玩家聽得到的撞擊聲（0.5 秒內只算一次）。</summary>
    public void Bump()
    {
        if (Time.time - lastBump < BumpCooldown)
            return;
        lastBump = Time.time;
        feel.Kick(0.02f, 0.15f);
        AudioSource.PlayClipAtPoint(bump, body.CameraTransform.position, 0.6f);
    }

    /// <summary>巨人丟的岩石落在附近沒砸中：大震、耳鳴，其他聲音暫時變小。</summary>
    public void RockNearMiss()
    {
        feel.Kick(0.08f, 0.4f);
        tinnitusLeft = TinnitusSeconds;
        ring.Play();
    }

    /// <summary>整場第一個會照亮的聲音：波前到達邊緣時，在玩家前方的邊緣浮現一行字。</summary>
    public void ShowLaw(Vector3 center, float radius)
    {
        Vector3 forward = body.CameraTransform.forward;
        forward.y = 0f;
        forward = forward.sqrMagnitude > 1e-4f ? forward.normalized : Vector3.forward;
        lawPoint = center + forward * radius + Vector3.up * 1.2f;
        lawAt = Time.time + EchoField.SpreadSeconds;
    }

    public void ResetAll()
    {
        if (tinnitusLeft > 0f)
            AudioListener.volume = 1f;
        pulseLeft = arcLeft = tinnitusLeft = 0f;
        heartIntensity = 0f;
        if (heart != null)
            heart.Stop();
        if (ring != null)
            ring.Stop();
    }

    void Update()
    {
        if (loop == null)
            return;
        float dt = Time.deltaTime;
        pulseLeft = Mathf.Max(0f, pulseLeft - dt);
        arcLeft = Mathf.Max(0f, arcLeft - dt);

        // 耳鳴：其他聲音壓到 40%，1.5 秒內慢慢恢復。
        if (tinnitusLeft > 0f)
        {
            tinnitusLeft = Mathf.Max(0f, tinnitusLeft - dt);
            AudioListener.volume = Mathf.Lerp(1f, TinnitusVolume, tinnitusLeft / TinnitusSeconds);
            if (tinnitusLeft <= 0f)
                AudioListener.volume = 1f;
        }

        // 心跳：巨人在 8 m 內才有，越近越快越大聲。
        float d = float.MaxValue;
        if (loop.InNight && loop.Cyclops.Active)
        {
            Vector3 g = loop.Cyclops.transform.position - loop.PlayerPosition;
            g.y = 0f;
            d = g.magnitude;
        }
        if (!LegacyHeartbeat)
            d = float.MaxValue;
        heartIntensity = Heartbeat.Active(d) ? Heartbeat.Intensity(d) : 0f;
        if (Heartbeat.Active(d))
        {
            if (!heart.isPlaying)
                heart.Play();
            heart.pitch = Heartbeat.BeatsPerMinute(d) / 60f;
            heart.volume = 0.25f + 0.65f * heartIntensity;
        }
        else if (heart.isPlaying)
            heart.Stop();
    }

    void OnGUI()
    {
        OdysseyFonts.UseForGui();
        if (loop == null)
            return;
        GUI.depth = -5;

        // 暗角：巨人越近越收緊。
        float dark = Mathf.Max(heartIntensity, terrorVignette);
        if (dark > 0f)
            Vignette(new Color(0f, 0f, 0f, 0.5f * dark), 0.18f);

        // 同伴被吃：四周暗紅脈動。
        if (pulseLeft > 0f)
            Vignette(new Color(Blood.r, Blood.g, Blood.b, 0.6f * Mathf.Sin(Mathf.PI * pulseLeft / PulseSeconds)), 0.12f);

        // 方向弧：螢幕邊緣指向事發的方向。
        if (arcLeft > 0f)
            DrawArc(arcFrom, Mathf.Clamp01(arcLeft / ArcSeconds));

        DrawLaw();
    }

    void DrawLaw()
    {
        if (lawAt < 0f || Time.time < lawAt)
            return;
        float age = Time.time - lawAt;
        if (age > LawShowSeconds)
        {
            lawAt = -1f;
            return;
        }
        Vector3 s = body.Camera.WorldToScreenPoint(lawPoint);
        if (s.z <= 0f)
            return;
        int size = Mathf.Max(20, Screen.height / 30);
        if (lawStyle == null || lawStyle.fontSize != size)
            lawStyle = new GUIStyle(GUI.skin.label) { fontSize = size, alignment = TextAnchor.MiddleCenter };
        float a = Mathf.Clamp01((LawShowSeconds - age) / 0.5f) * Mathf.Clamp01(age / 0.2f);
        var r = new Rect(s.x - 300f, Screen.height - s.y - size, 600f, size * 1.6f);
        var shadow = r;
        shadow.position += new Vector2(2f, 2f);
        lawStyle.normal.textColor = new Color(0f, 0f, 0f, 0.85f * a);
        GUI.Label(shadow, "他聽得到這麼遠", lawStyle);
        lawStyle.normal.textColor = new Color(LawColor.r, LawColor.g, LawColor.b, a);
        GUI.Label(r, "他聽得到這麼遠", lawStyle);
    }

    /// <summary>事發方向（相對鏡頭水平角度）在螢幕邊緣畫一段暗紅弧。</summary>
    void DrawArc(Vector3 from, float strength)
    {
        Transform cam = body.CameraTransform;
        Vector3 to = from - cam.position;
        to.y = 0f;
        Vector3 fwd = cam.forward;
        fwd.y = 0f;
        float angle = Vector3.SignedAngle(fwd, to, Vector3.up) * Mathf.Deg2Rad;
        var center = new Vector2(Screen.width / 2f, Screen.height / 2f);
        float rx = Screen.width * 0.45f, ry = Screen.height * 0.42f;
        var color = new Color(Blood.r * 1.6f, Blood.g, Blood.b, 0.85f * strength);
        for (int i = -6; i <= 6; i++)
        {
            float a = angle + i * 0.04f;
            var p = center + new Vector2(Mathf.Sin(a) * rx, -Mathf.Cos(a) * ry);
            float w = 10f * (1f - Mathf.Abs(i) / 7f) + 4f;
            Fill(new Rect(p.x - w / 2f, p.y - w / 2f, w, w), color);
        }
    }

    /// <summary>四邊由外往內漸淡的色帶（不是背景，只在畫面邊緣）。</summary>
    static void Vignette(Color c, float depth)
    {
        const int steps = 8;
        float dx = Screen.width * depth / steps, dy = Screen.height * depth / steps;
        for (int i = 0; i < steps; i++)
        {
            var col = new Color(c.r, c.g, c.b, c.a * (1f - (float)i / steps) / 2f);
            Fill(new Rect(i * dx, 0, dx, Screen.height), col);
            Fill(new Rect(Screen.width - (i + 1) * dx, 0, dx, Screen.height), col);
            Fill(new Rect(0, i * dy, Screen.width, dy), col);
            Fill(new Rect(0, Screen.height - (i + 1) * dy, Screen.width, dy), col);
        }
    }

    static void Fill(Rect r, Color c)
    {
        var old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }
}
