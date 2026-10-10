using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>Step＝蹲著走；Run＝跑；Clap＝拍手；Stone＝石子落地；Boulder＝推巨石；Bleat＝羊叫；Cyclops＝巨人的腳步與呼吸。</summary>
    public enum SoundKind { Step, Run, Clap, Stone, Boulder, Bleat, Cyclops }

    /// <summary>聲音是誰發出的，決定聲波的顏色。</summary>
    public enum SoundSource { Player, Cyclops, Sheep }

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
