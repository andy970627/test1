using System;

namespace Odyssey.Core
{
    /// <summary>
    /// 聲音提示（主選單「實驗」頁的開關）：不戴耳機也能知道海風與巨人的方向。
    /// 只算方位、對準程度與描述文字；畫面與聲音由 SoundCueOverlay 呈現。
    /// 文字照情境提示的規則：只描述發生了什麼，不教怎麼做。
    /// </summary>
    public static class SoundCues
    {
        /// <summary>對準洞口的角度範圍：超過就沒有對準音。</summary>
        public const float AlignCone = 45f;
        /// <summary>算「正對」的角度。</summary>
        public const float FacingCone = 12f;
        /// <summary>巨人多近開始標出方向（公尺，和恐懼半徑的外圈相同）。</summary>
        public const float GiantNotice = 16f;
        /// <summary>巨人多近算「很近」（公尺）。</summary>
        public const float GiantClose = 6f;
        public const float SlowestPing = 1.1f;
        public const float FastestPing = 0.18f;

        /// <summary>目標相對面向的角度（度）：0＝正前方，正值＝右邊，±180＝正後方。座標是 Unity 的 XZ 平面。</summary>
        public static float Bearing(float forwardX, float forwardZ, float dx, float dz)
        {
            float cross = dx * forwardZ - dz * forwardX;
            float dot = dx * forwardX + dz * forwardZ;
            return (float)(Math.Atan2(cross, dot) * 180.0 / Math.PI);
        }

        /// <summary>對準程度：正對＝1，到 AlignCone 外＝0。</summary>
        public static float Alignment(float bearing)
        {
            float a = 1f - Math.Abs(bearing) / AlignCone;
            return a < 0f ? 0f : a;
        }

        /// <summary>對準音的間隔（秒）：越準越密；沒對準回傳 0，表示不響。</summary>
        public static float PingInterval(float alignment)
        {
            if (alignment <= 0f)
                return 0f;
            float a = alignment > 1f ? 1f : alignment;
            return SlowestPing + (FastestPing - SlowestPing) * a;
        }

        /// <summary>巨人的緊迫程度：GiantNotice 外＝0，貼到身邊＝1。</summary>
        public static float Urgency(float distance)
        {
            float u = 1f - distance / GiantNotice;
            return u < 0f ? 0f : u > 1f ? 1f : u;
        }

        public static string DirectionName(float bearing)
        {
            float a = Math.Abs(bearing);
            if (a <= FacingCone)
                return "正前方";
            if (a >= 180f - FacingCone)
                return "正後方";
            string side = bearing > 0f ? "右" : "左";
            return a < 65f ? side + "前方" : a <= 115f ? side + "邊" : side + "後方";
        }

        public static string WindLine(float bearing) =>
            Math.Abs(bearing) <= FacingCone ? "海風正對著你" : $"海風從{DirectionName(bearing)}吹來";

        /// <summary>巨人的描述；太遠回傳 null。</summary>
        public static string GiantLine(float bearing, float distance)
        {
            if (distance > GiantNotice)
                return null;
            string where = DirectionName(bearing);
            return distance <= GiantClose ? $"巨人就在{where}，很近" : $"巨人在{where}";
        }

        /// <summary>這一刻要顯示哪一句：巨人很近時優先，其他時候海風在前、巨人在後。</summary>
        public static string Line(float windBearing, float giantBearing, float giantDistance)
        {
            string giant = GiantLine(giantBearing, giantDistance);
            if (giant != null && giantDistance <= GiantClose)
                return giant;
            string wind = WindLine(windBearing);
            return giant == null ? wind : wind + "・" + giant;
        }
    }
}
