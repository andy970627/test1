using UnityEngine;

/// <summary>
/// 全遊戲共用的顏色，與設計系統「Odyssey: Blind Cave Design System」的 tokens 一一對應
/// （名稱在註解裡，例如 parchment）。改顏色只改這裡，再同步回設計系統。
/// </summary>
public static class OdysseyPalette
{
    // ── 底與文字（UI）────────────────────────────────────────────
    /// <summary>cave-black：洞穴環境光，也是所有畫面的底。</summary>
    public static readonly Color CaveBlack = new(0.03f, 0.03f, 0.04f);
    /// <summary>veil：選單與紀事的全螢幕遮罩。</summary>
    public static readonly Color Veil = new(0f, 0f, 0f, 0.88f);
    /// <summary>briefing-veil：每夜簡報的遮罩（再乘上淡入淡出）。</summary>
    public static readonly Color BriefingVeil = new(0f, 0f, 0f, 0.85f);
    /// <summary>text-shadow：所有文字下方右下 2px 的陰影。</summary>
    public static readonly Color TextShadow = new(0f, 0f, 0f, 0.85f);
    /// <summary>死亡卡字的黑描邊。</summary>
    public static readonly Color TextOutline = new(0f, 0f, 0f, 0.9f);

    /// <summary>parchment：主要文字。</summary>
    public static readonly Color Parchment = new(0.97f, 0.95f, 0.88f);
    /// <summary>parchment-dim：未選中的選項、未解鎖的紀事。</summary>
    public static readonly Color ParchmentDim = new(0.97f, 0.95f, 0.88f, 0.45f);
    /// <summary>parchment-muted：簡報的次要行。</summary>
    public static readonly Color ParchmentMuted = new(0.97f, 0.95f, 0.88f, 0.55f);
    /// <summary>parchment-note：岸邊抉擇上方的小字。</summary>
    public static readonly Color ParchmentNote = new(0.97f, 0.95f, 0.88f, 0.6f);
    /// <summary>debug-text：除錯面板與岸邊抉擇的內文。</summary>
    public static readonly Color DebugText = new(0.95f, 0.93f, 0.87f);
    /// <summary>cause-text：死因。</summary>
    public static readonly Color CauseText = new(0.85f, 0.82f, 0.75f);

    /// <summary>gold：標題、已解鎖的紀事、紀事提示。</summary>
    public static readonly Color Gold = new(0.85f, 0.72f, 0.42f);
    /// <summary>meander-gold：死亡卡的回紋。</summary>
    public static readonly Color MeanderGold = new(0.55f, 0.45f, 0.25f);

    /// <summary>blood-red：「葬 身 洞 中」。</summary>
    public static readonly Color BloodRed = new(0.6f, 0.08f, 0.06f);
    /// <summary>dawn-grey：天亮結束時的死亡卡標題。</summary>
    public static readonly Color DawnGrey = new(0.85f, 0.85f, 0.8f);
    /// <summary>blood：受傷、同伴被吃的血色暈影。</summary>
    public static readonly Color Blood = new(0.55f, 0.03f, 0.02f);
    /// <summary>flash-red：失去同伴時任務行閃爍。</summary>
    public static readonly Color FlashRed = new(0.9f, 0.2f, 0.15f);

    // ── 回聲 ─────────────────────────────────────────────────
    /// <summary>echo-player：玩家發出的聲音；也是玩家自己的進度條顏色。</summary>
    public static readonly Color EchoPlayer = new(0.85f, 0.92f, 1f);
    /// <summary>echo-cyclops。</summary>
    public static readonly Color EchoCyclops = new(0.8f, 0.12f, 0.08f);
    /// <summary>echo-sheep。</summary>
    public static readonly Color EchoSheep = new(1f, 0.9f, 0.55f);
    /// <summary>echo-crew。</summary>
    public static readonly Color EchoCrew = new(0.55f, 0.9f, 0.6f);
    /// <summary>done：任務完成（與 echo-crew 同色）。</summary>
    public static readonly Color Done = new(0.55f, 0.9f, 0.6f);

    // ── 進度條 ───────────────────────────────────────────────
    /// <summary>track：所有進度條的空槽。</summary>
    public static readonly Color Track = new(1f, 1f, 1f, 0.15f);
    /// <summary>echo-player 90%：體力、推石、岸邊倒數的填色。</summary>
    public static readonly Color MeterFill = new(0.85f, 0.92f, 1f, 0.9f);
    /// <summary>stamina-out：喘不過氣、還不能跑。</summary>
    public static readonly Color StaminaOut = new(0.85f, 0.2f, 0.15f, 0.9f);
    /// <summary>tick：推石條 25／50／75% 的凹槽刻度。</summary>
    public static readonly Color Tick = new(1f, 1f, 1f, 0.5f);
    /// <summary>stone-full。</summary>
    public static readonly Color StoneFull = new(0.85f, 0.85f, 0.8f, 0.9f);
    /// <summary>stone-empty。</summary>
    public static readonly Color StoneEmpty = new(1f, 1f, 1f, 0.12f);
    /// <summary>boulder-bar：巨石還沒推開時的任務條。</summary>
    public static readonly Color BoulderBar = new(0.75f, 0.6f, 0.4f);
    /// <summary>night-bar：天亮條的夜晚端；也是巨石縫的夜光。</summary>
    public static readonly Color NightBar = new(0.05f, 0.08f, 0.25f);
    /// <summary>dawn-bar：天亮條的天亮端；也是巨石縫的晨光。</summary>
    public static readonly Color DawnBar = new(0.7f, 0.7f, 0.65f);

    // ── 場景光 ───────────────────────────────────────────────
    /// <summary>moon-light。</summary>
    public static readonly Color MoonLight = new(0.55f, 0.65f, 1f);
    /// <summary>fire-light。</summary>
    public static readonly Color FireLight = new(1f, 0.45f, 0.2f);
    /// <summary>巨石邊緣的月光自發光。</summary>
    public static readonly Color MoonGlow = new(0.10f, 0.12f, 0.18f);
    /// <summary>巨人背光剪影的自發光。</summary>
    public static readonly Color MoonSilhouette = new(0.10f, 0.11f, 0.15f);
    /// <summary>炭火的 HDR 自發光（大於 1）。</summary>
    public static readonly Color CoalsGlow = new(3f, 1f, 0.25f);

    // ── 材質（3D 物體的底色，不用在 UI）────────────────────────
    public static readonly Color HeroSkin = new(0.38f, 0.30f, 0.24f);       // mat-skin
    public static readonly Color BracerLeather = new(0.20f, 0.14f, 0.09f);  // mat-leather
    public static readonly Color Bronze = new(0.58f, 0.44f, 0.22f);         // bronze
    public static readonly Color IthacaGold = new(0.70f, 0.58f, 0.28f);     // ithaca-gold
    public static readonly Color BowWood = new(0.28f, 0.18f, 0.10f);        // mat-bow-wood
    public static readonly Color BowString = new(0.48f, 0.45f, 0.40f);      // mat-string
    public static readonly Color ArrowWood = new(0.35f, 0.30f, 0.22f);      // mat-arrow
    public static readonly Color Feather = new(0.65f, 0.63f, 0.58f);        // mat-feather
    public static readonly Color HandStone = new(0.32f, 0.32f, 0.35f);      // mat-stone
    public static readonly Color ArrowShaft = new(0.55f, 0.42f, 0.28f);     // mat-arrow-shaft（射出去的箭）

    public static readonly Color GiantSkin = new(0.42f, 0.35f, 0.28f);      // mat-giant-skin
    public static readonly Color Charred = new(0.06f, 0.03f, 0.02f);        // charred
    public static readonly Color Ember = new(0.55f, 0.12f, 0.05f);          // ember

    public static readonly Color CrewSkin = new(0.5f, 0.45f, 0.4f);         // mat-crew-skin
    public static readonly Color Linen = new(0.68f, 0.65f, 0.58f);          // mat-linen
    public static readonly Color CrewHair = new(0.12f, 0.10f, 0.08f);       // mat-crew-hair
    public static readonly Color CrewLeather = new(0.24f, 0.16f, 0.10f);    // mat-crew-leather

    public static readonly Color Wool = new(0.78f, 0.75f, 0.68f);           // mat-wool
    public static readonly Color WoolShade = new(0.68f, 0.64f, 0.58f);      // mat-wool-shade
    public static readonly Color SheepDark = new(0.24f, 0.20f, 0.18f);      // mat-sheep-dark
    public static readonly Color Horn = new(0.35f, 0.28f, 0.20f);           // mat-horn

    public static readonly Color BoulderStone = new(0.62f, 0.48f, 0.3f);    // mat-boulder
    public static readonly Color BoulderGroove = new(0.85f, 0.75f, 0.55f);  // mat-boulder-groove
    public static readonly Color BoulderShade = new(0.24f, 0.20f, 0.16f);   // mat-boulder-shade
    public static readonly Color BoulderMark = new(0.5f, 0.42f, 0.3f);      // mat-boulder-mark（地上刮痕）
    public static readonly Color Grit = new(0.55f, 0.45f, 0.32f);           // mat-grit
    public static readonly Color Pebble = new(0.6f, 0.6f, 0.58f);           // mat-pebble（石子、楔子）
    public static readonly Color ThrownRock = new(0.35f, 0.32f, 0.3f);      // mat-thrown-rock

    public static readonly Color CaveFloor = new(0.32f, 0.28f, 0.24f);      // mat-cave-floor
    public static readonly Color CaveWall = new(0.28f, 0.25f, 0.22f);       // mat-cave-wall
    public static readonly Color Rock = new(0.26f, 0.23f, 0.2f);            // mat-rock
    public static readonly Color RockDark = new(0.24f, 0.22f, 0.2f);        // mat-rock-dark
    public static readonly Color FireStone = new(0.2f, 0.18f, 0.16f);       // mat-fire-stone
    public static readonly Color Coals = new(0.3f, 0.08f, 0.02f);           // mat-coals
    public static readonly Color OliveWood = new(0.35f, 0.26f, 0.15f);      // mat-olive-stake
    public static readonly Color StakeTip = new(0.04f, 0.03f, 0.02f);       // mat-stake-tip
    public static readonly Color RackWood = new(0.33f, 0.24f, 0.15f);       // mat-rack-wood
    public static readonly Color Cheese = new(0.85f, 0.78f, 0.55f);         // mat-cheese
    public static readonly Color MilkPail = new(0.4f, 0.3f, 0.2f);          // mat-milk-pail
    public static readonly Color PailHoop = new(0.55f, 0.42f, 0.22f);       // mat-pail-hoop
    public static readonly Color Wicker = new(0.5f, 0.4f, 0.25f);           // mat-wicker
    public static readonly Color Hay = new(0.62f, 0.55f, 0.32f);            // mat-hay

    // ── 除錯面板（玩家看不到）─────────────────────────────────
    public static class DebugMap
    {
        public static readonly Color Investigate = new(0.95f, 0.8f, 0.2f);
        public static readonly Color Search = new(0.9f, 0.25f, 0.2f);
        public static readonly Color Guard = new(0.65f, 0.35f, 0.9f);
        public static readonly Color Throw = new(1f, 0.45f, 0.1f);
        public static readonly Color Eat = new(0.6f, 0.05f, 0.05f);
        public static readonly Color Pray = new(0.3f, 0.45f, 0.9f);
        public static readonly Color Stagger = new(0.4f, 0.9f, 0.9f);
        public static readonly Color Idle = new(0.6f, 0.6f, 0.6f);
        public static readonly Color Dawn = new(0.55f, 0.65f, 0.95f);
        public static readonly Color DawnBar = new(0.7f, 0.75f, 0.95f);
        public static readonly Color TickGap = new(0f, 0f, 0f, 0.65f);
        public static readonly Color Wall = new(0.6f, 0.55f, 0.5f, 0.8f);
        public static readonly Color Boulder = new(0.55f, 0.4f, 0.25f);
        public static readonly Color Stake = new(0.55f, 0.38f, 0.2f);
        public static readonly Color Wedge = new(0.7f, 0.7f, 0.68f);
        public static readonly Color Stone = new(0.75f, 0.75f, 0.72f);
        public static readonly Color Pail = new(0.7f, 0.55f, 0.35f);
        public static readonly Color Pen = new(0.6f, 0.5f, 0.3f, 0.8f);
        public static readonly Color Rock = new(0.95f, 0.15f, 0.1f);
    }

    /// <summary>同一個顏色，透明度乘上 alpha（淡入淡出用）。</summary>
    public static Color Fade(Color c, float alpha) => new(c.r, c.g, c.b, c.a * alpha);
}
