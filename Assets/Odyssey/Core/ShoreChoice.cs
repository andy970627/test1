using System;

namespace Odyssey.Core
{
    public enum ShoreAction { Shoot, Name, Leave }

    /// <summary>
    /// 逃出後在岸邊的抉擇（規格第 20 節 C）：射箭（電影）、喊出名字（荷馬）或默默離開。
    /// 報復會讓巨人追出來丟岩石，帶出的同伴每人 1/3 機率在路上被砸死。
    /// </summary>
    public static class ShoreChoice
    {
        public const float TimeLimit = 8f;
        public const double LossChance = 1.0 / 3.0;

        public static int Resolve(ShoreAction action, int rescued, Func<double> roll)
        {
            if (action == ShoreAction.Leave)
                return 0;
            int lost = 0;
            for (int i = 0; i < rescued; i++)
                if (roll() < LossChance)
                    lost++;
            return lost;
        }

        public static string Title(ShoreAction action) => action switch
        {
            ShoreAction.Shoot => "奧德修斯射中了沉睡的波塞頓之子。巨人追了出來。",
            ShoreAction.Name => "奧德修斯對著波呂斐摩斯，喊出了自己的名字。",
            _ => "奧德修斯沒有回頭。",
        };

        public static string Subtitle(ShoreAction action, int rescued, int lost) => action switch
        {
            ShoreAction.Shoot => $"帶出 {rescued} 名同伴，路上又失去 {lost} 名。波塞頓聽見了兒子的禱告。",
            ShoreAction.Name => $"帶出 {rescued} 名同伴，路上又失去 {lost} 名。波塞頓記住了這個名字。",
            _ => $"帶出 {rescued} 名同伴。",
        };
    }
}
