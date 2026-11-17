using System;
using System.Numerics;

namespace Odyssey.Core
{
    /// <summary>引開巨人用的手段（規格第 34 節 E）。箭不在這裡：箭沿用第 21 節 B 自己的學習（被騙 3 次後只理一半距離）。</summary>
    public enum LureKind { Stone, Pail, Cheese, Wine }

    /// <summary>巨人對一個誘餌的信任：整段走過去、只走一半就停下來聽、完全不理。</summary>
    public enum LureTrust { Full, Half, Ignore }

    /// <summary>
    /// 巨人會學（規格第 34 節 E）：記錄這一夜每種手段落在洞裡哪一區被他理會了幾次。
    /// 同一組合第 3 次起只走一半，第 5 次起不理；每過一夜所有計數減半（他會忘）。
    /// 洞以中心為原點、依方位切成 6 區。
    /// </summary>
    public sealed class LureMemory
    {
        public const int Regions = 6;
        public const int HalfFrom = 3;
        public const int IgnoreFrom = 5;

        readonly int[,] uses = new int[Regions, Enum.GetValues(typeof(LureKind)).Length];

        public static int RegionOf(Vector2 p)
        {
            double angle = Math.Atan2(p.Y, p.X);
            if (angle < 0)
                angle += Math.PI * 2;
            return Math.Min(Regions - 1, (int)(angle / (Math.PI * 2) * Regions));
        }

        public int Uses(Vector2 at, LureKind kind) => uses[RegionOf(at), (int)kind];

        /// <summary>巨人聽到（或聞到）一個誘餌：記一次，回傳這一次他有多相信。</summary>
        public LureTrust Respond(Vector2 at, LureKind kind)
        {
            int count = ++uses[RegionOf(at), (int)kind];
            if (count >= IgnoreFrom)
                return LureTrust.Ignore;
            return count >= HalfFrom ? LureTrust.Half : LureTrust.Full;
        }

        /// <summary>換夜：所有計數減半（無條件捨去）。</summary>
        public void NewNight()
        {
            for (int r = 0; r < uses.GetLength(0); r++)
                for (int k = 0; k < uses.GetLength(1); k++)
                    uses[r, k] /= 2;
        }

        public void Reset() => Array.Clear(uses, 0, uses.Length);

        /// <summary>這個聲音是不是誘餌、是哪一種；不是誘餌回傳 null。</summary>
        public static LureKind? KindOf(SoundKind kind) => kind switch
        {
            SoundKind.Stone => LureKind.Stone,
            SoundKind.Clatter => LureKind.Pail,
            SoundKind.Cheese => LureKind.Cheese,
            _ => null,
        };
    }
}
