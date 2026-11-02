using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>情境提示的種類（規格第 17 節 C）。</summary>
    public enum HintKind
    {
        Decoy, Guard, PulledWedge, Catch, Heavy, RockWindup, Whimper, CrewEaten,
        Stake, Pail, Pen, Pant, Dawn, Rush, SheepStuck, Prayer, Slip,
        Notch, Footstep, HearingRing, ArrowClutter, FindExit, Brace,
        FirstStone, FairHit, Ambush, FavorRegained,
    }

    /// <summary>
    /// 情境提示：某件事第一次發生時才講。一次一則、每則 5 秒、整場遊戲每種只講一次；
    /// 排隊等超過 8 秒的已經不合時宜，丟掉且不算講過。暫停（夜晚以外）時不排隊也不前進。
    /// </summary>
    public sealed class HintQueue
    {
        public const float ShowSeconds = 5f;
        public const float MaxWait = 8f;

        readonly HashSet<HintKind> said = new();
        readonly List<(HintKind Kind, float Age)> waiting = new();
        bool paused;

        HintKind? current;

        /// <summary>正在顯示的提示；暫停時為 null。</summary>
        public HintKind? Current => paused ? null : current;

        public float Remaining { get; private set; }

        public void Trigger(HintKind kind)
        {
            if (paused || said.Contains(kind) || current == kind)
                return;
            foreach (var w in waiting)
                if (w.Kind == kind)
                    return;
            waiting.Add((kind, 0f));
        }

        /// <summary>
        /// 換夜：上一夜沒講完、還在排隊的提示都不合時宜了，丟掉；才剛出現不到 1 秒就被打斷的不算講過。
        /// </summary>
        public void NewNight()
        {
            if (current is HintKind cut && ShowSeconds - Remaining < CutGrace)
                said.Remove(cut);
            current = null;
            Remaining = 0f;
            waiting.Clear();
        }

        public const float CutGrace = 1f;

        public void Tick(float dt, bool paused)
        {
            this.paused = paused;
            if (paused)
                return;

            for (int i = waiting.Count - 1; i >= 0; i--)
            {
                float age = waiting[i].Age + dt;
                if (age > MaxWait)
                    waiting.RemoveAt(i);
                else
                    waiting[i] = (waiting[i].Kind, age);
            }

            if (current != null)
            {
                Remaining -= dt;
                if (Remaining <= 0f)
                    current = null;
            }

            if (current == null && waiting.Count > 0)
            {
                current = waiting[0].Kind;
                waiting.RemoveAt(0);
                said.Add(current.Value);
                Remaining = ShowSeconds;
            }
        }
    }

    /// <summary>情境提示的文字（`docs/game-text.md` 第 5 節）：只描述發生了什麼，做法寫在洞中紀事。</summary>
    public static class HintText
    {
        public static string Of(HintKind kind) => kind switch
        {
            HintKind.Decoy => "巨人朝你走來了",
            HintKind.Guard => "他聽見巨石的聲音，跑回去守著",
            HintKind.PulledWedge => "他拔掉了楔子",
            HintKind.Catch => "巨石卡了一下，整個洞都聽得到",
            HintKind.Heavy => "巨石動得好慢",
            HintKind.RockWindup => "他舉起岩石，朝剛才的聲音瞄準",
            HintKind.Whimper => "附近有同伴在嗚咽",
            HintKind.CrewEaten => "巨人摸到一名同伴，把他吃了",
            HintKind.Stake => "一根削尖的橄欖木樁，正是刺瞎他的那一根",
            HintKind.Pail => "奶桶倒了，整個洞都聽得到",
            HintKind.Pen => "乾草讓腳步變輕了",
            HintKind.Pant => "你喘不過氣，他也聽得到",
            HintKind.Dawn => "天快亮了",
            HintKind.Rush => "羊群聞到外面的氣味，擠向縫口",
            HintKind.SheepStuck => "有羊卡在縫裡",
            HintKind.Prayer => "他在向父親波塞頓禱告，什麼都聽不到",
            HintKind.Slip => "巨石在往回滑",
            HintKind.Notch => "巨石卡進了地上的凹槽",
            HintKind.Footstep => "腳步聲照不亮四周",
            HintKind.HearingRing => "那道淡淡的邊，是他聽得到的地方",
            HintKind.ArrowClutter => "箭落在奶桶、乳酪架、羊圈上，那裡也會響",
            HintKind.FindExit => "海風從巨石那邊吹來，邊緣透著月光",
            HintKind.Brace => "你頂著巨石，它沒有往回滑",
            HintKind.FirstStone => "你撿起了一顆石子",
            HintKind.FairHit => "他聽見了你，石子才飛出去",
            HintKind.Ambush => "他沒聽見你，雷聲卻響了",
            HintKind.FavorRegained => "月光又照在巨石邊上",
            _ => null,
        };
    }
}
