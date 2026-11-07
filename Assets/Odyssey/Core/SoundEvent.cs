using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>
    /// Step＝蹲著走；Run＝跑；Clap＝彈弓空彈（玩家看到的是「製造聲音」，名字沿用拍手）；Stone＝石子落地；Boulder＝猛推巨石；Bleat＝羊叫；Cyclops＝巨人的腳步與呼吸；Pant＝體力低時喘氣；
    /// Whimper＝同伴嗚咽；RockImpact＝巨人的岩石落地；Drag＝拖木樁；Clatter＝奶桶；Cheese＝乳酪；Wicker＝跨過羊圈；
    /// Grind＝輕推巨石；Slip＝巨石回滑；Wedge＝塞楔子；Arrow＝箭的落點；Twang＝弓弦聲；
    /// SnapShot＝彈弓射出石子時的「啪」；Stretch＝拉彈弓皮筋（規格第 31 節 A）。
    /// </summary>
    public enum SoundKind { Step, Run, Clap, Stone, Boulder, Bleat, Cyclops, Pant, Whimper, RockImpact, Drag, Clatter, Cheese, Wicker, Grind, Slip, Wedge, Arrow, Twang, SnapShot, Stretch }

    /// <summary>聲音是誰發出的，決定聲波的顏色。</summary>
    public enum SoundSource { Player, Cyclops, Sheep, Crew }

    /// <summary>一個聲音：平面位置（X＝世界 x，Y＝世界 z）、套用遮蔽後的聲量、發生時間。</summary>
    public readonly struct SoundEvent
    {
        public readonly SoundKind Kind;
        public readonly Vector2 Position;
        public readonly float Loudness;
        public readonly float Time;

        public SoundEvent(SoundKind kind, Vector2 position, float loudness, float time)
        {
            Kind = kind;
            Position = position;
            Loudness = loudness;
            Time = time;
        }
    }
}
