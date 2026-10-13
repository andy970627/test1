using System.Collections.Generic;

namespace Odyssey.Core
{
    /// <summary>情境提示的種類（規格第 17 節 C）。</summary>
    public enum HintKind
    {
        Decoy, Guard, PulledWedge, Catch, Heavy, RockWindup, Whimper, CrewEaten,
        Stake, Pail, Pen, Pant, Dawn, Rush, SheepStuck, Prayer, Slip,
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

    public static class HintText
    {
        public static string Of(HintKind kind) => kind switch
        {
            HintKind.Decoy => "射箭：落點的聲音會把他引過去",
            HintKind.Guard => "他聽到巨石的聲音，跑回去守了",
            HintKind.PulledWedge => "他拔掉了楔子——先把他引開再推",
            HintKind.Catch => "巨石卡了一下，整個洞都聽得到",
            HintKind.Heavy => "Shift＋E 猛推：快，但很吵、很累",
            HintKind.RockWindup => "他在蓄力——快離開剛才出聲的地方",
            HintKind.Whimper => "有同伴在嗚咽：找到他，按 E 帶走",
            HintKind.CrewEaten => "巨人摸到誰就吃誰：按 F 讓隊伍蹲下",
            HintKind.Stake => "橄欖木樁：拿著推比較省力，插進縫巨人拔不掉",
            HintKind.Pail => "奶桶倒了很吵——也能拿來引開巨人",
            HintKind.Pen => "乾草讓腳步變輕",
            HintKind.Pant => "喘不過氣——喘息聲他也聽得到",
            HintKind.Dawn => "天快亮了",
            HintKind.Rush => "羊群聞到外面的氣味——小心牠們撞鬆楔子",
            HintKind.SheepStuck => "有羊卡住了：把巨石推開讓牠出去",
            HintKind.Slip => "巨石在往回滑：站在它前面頂住，或塞石子當楔子",
            HintKind.Prayer => "他在向父親波塞頓禱告——這時他什麼都聽不到",
            _ => null,
        };
    }
}
