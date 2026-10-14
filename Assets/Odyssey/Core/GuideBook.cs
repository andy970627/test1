using System.Collections.Generic;

namespace Odyssey.Core
{
    public enum GuidePage { Controls, SoundLight, Boulder, Giant, Crew, Bow, Sheep, Escape }

    public readonly struct GuideEntry
    {
        public readonly string Id;
        public readonly GuidePage Page;
        public readonly string Title;
        public readonly string Text;

        public GuideEntry(string id, GuidePage page, string title, string text)
        {
            Id = id;
            Page = page;
            Title = title;
            Text = text;
        }
    }

    /// <summary>
    /// 洞中紀事（規格第 25 節 B）：說書人口吻的玩法說明，分頁、遇到才解鎖；「操作」頁一開始全開。
    /// 情境提示只描述發生了什麼，「怎麼做」寫在這裡。解鎖整場保留（同情境提示）。
    /// </summary>
    public sealed class GuideBook
    {
        static readonly GuideEntry[] All =
        {
            new("move", GuidePage.Controls, "走與跑", "WASD 走・Shift 跑。跑太久會喘，喘氣聲巨人也聽得到。"),
            new("clap", GuidePage.Controls, "製造聲音", "空白鍵 製造聲音，照亮四周。"),
            new("bow", GuidePage.Controls, "弓", "按住左鍵 拉弓・放開 射箭。拿著木樁時不能拉弓。"),
            new("push", GuidePage.Controls, "推巨石", "E 推・Shift＋E 猛推。"),
            new("wedge", GuidePage.Controls, "楔子", "右鍵 塞石子當楔子（按住 拔回）。"),
            new("crew", GuidePage.Controls, "同伴", "E 帶他走・F 隊伍蹲下或跟上。"),
            new("stakekeys", GuidePage.Controls, "木樁", "E 拿起木樁・G 插進縫裡或放下。"),
            new("pause", GuidePage.Controls, "暫停", "Tab 暫停，翻閱這本紀事。"),

            new("law", GuidePage.SoundLight, "聲音就是光", "在波呂斐摩斯的洞裡，聲音就是光。照亮了哪裡，他就聽得到哪裡。"),
            new("footstep", GuidePage.SoundLight, "會發光的聲音", "腳步、喘氣、羊叫、同伴的嗚咽都只有聲音，照不亮四周。只有製造聲音、射箭、推巨石、塞楔子、撞倒奶桶這些刻意的聲音會發光。"),
            new("ring", GuidePage.SoundLight, "聽覺的邊", "回聲裡那道淡淡的邊，是巨人真正聽得到的範圍。在邊外發出的聲音，他聽不到。"),
            new("pen", GuidePage.SoundLight, "乾草", "羊圈裡的乾草讓腳步聲變輕。"),
            new("pail", GuidePage.SoundLight, "奶桶", "奶桶倒下很吵，整個洞都聽得到；也能拿來把巨人引到別處。"),
            new("pant", GuidePage.SoundLight, "喘息", "跑太久就會喘，喘息聲巨人也聽得到。停下來休息就好。"),

            new("exit", GuidePage.Boulder, "洞口", "洞口在海風吹來的方向，巨石邊緣透著一絲月光。"),
            new("slip", GuidePage.Boulder, "回滑", "巨石一放手，三秒後就慢慢滑回，開得越大滑得越快。站在它前面頂住，或把石子塞進縫裡當楔子。"),
            new("notch", GuidePage.Boulder, "凹槽", "地上每四分之一有一道凹槽。巨石滑回時，最多只退到下面那一道。"),
            new("brace", GuidePage.Boulder, "頂住", "站在巨石前不推，用身體頂住，它就不會滑回。"),
            new("heavy", GuidePage.Boulder, "猛推", "Shift＋E 猛推：快，但很吵，也很耗力氣。"),
            new("catch", GuidePage.Boulder, "卡住", "輕推太久，巨石會卡一下，發出整個洞都聽得到的巨響。猛推不會卡。"),
            new("stake", GuidePage.Boulder, "橄欖木樁", "那根削尖的橄欖木樁，正是刺瞎巨人的那一根。拿著推比較省力；插進縫裡，巨人拔不掉。"),

            new("decoy", GuidePage.Giant, "箭的引誘力", "巨人循聲而來。射一支箭到遠處，落點的聲音會把他引開；被騙三次後，他只理會一半距離內的落點。"),
            new("guard", GuidePage.Giant, "守石", "他一聽到巨石的聲音，就跑回去守著。"),
            new("pull", GuidePage.Giant, "拔楔子", "他摸完巨石，會拔掉最外面的石子楔子，巨石跟著滑回。先把他引開再推。"),
            new("rock", GuidePage.Giant, "丟岩石冷卻", "聲音太遠摸不到時，他會舉起岩石朝聲音丟過去。丟完要等一陣子才能再丟；趕快離開剛才出聲的地方。"),
            new("prayer", GuidePage.Giant, "禱告", "波呂斐摩斯偶爾停下，向父親波塞頓禱告。禱告時他什麼都聽不見，正是猛推巨石的時候；但整個洞會跟著震動。"),

            new("whimper", GuidePage.Crew, "嗚咽", "同伴躲在洞裡各處，偶爾嗚咽。找到他，E 帶他走。"),
            new("eaten", GuidePage.Crew, "被吃", "巨人摸到誰就吃誰。隊伍跟在身後時，F 讓他們蹲下不動。"),

            new("arrows", GuidePage.Bow, "箭", "箭的落點會照亮那一帶，也會把巨人引過去。射中奶桶、乳酪架、羊圈，那裡也會響。每夜三支，射出去要走過去撿回來。"),

            new("rush", GuidePage.Sheep, "羊群", "巨石全開時，羊群聞到外面的氣味擠向縫口，會撞鬆巨石、撞掉石子楔子。"),
            new("stuck", GuidePage.Sheep, "卡住的羊", "羊卡在縫裡時誰也出不去；把巨石再推開一點，牠就能掙脫。"),

            new("dawn", GuidePage.Escape, "天亮", "天亮時巨人會把巨石推回原處，還在洞裡的人就出不去了。"),
            new("rescue", GuidePage.Escape, "帶出同伴", "鑽出去時，跟在身後的同伴一起逃出；蹲著的會留在洞裡。"),
            new("shore", GuidePage.Escape, "岸邊", "逃出洞外後，可以報復，也可以默默離開。報復會讓巨人追出來，帶出的同伴可能死在路上。"),
        };

        readonly HashSet<string> unlocked = new();

        public GuideBook()
        {
            foreach (var e in All)
                if (e.Page == GuidePage.Controls)
                    unlocked.Add(e.Id);
        }

        public IReadOnlyList<GuideEntry> Entries => All;

        public bool Has(string id)
        {
            foreach (var e in All)
                if (e.Id == id)
                    return true;
            return false;
        }

        public bool IsUnlocked(string id) => unlocked.Contains(id);

        /// <summary>解鎖一條；第一次解鎖回傳 true（顯示「紀事多了一則」），已解鎖或沒有這條回傳 false。</summary>
        public bool Unlock(string id) => Has(id) && unlocked.Add(id);

        public List<GuideEntry> EntriesOn(GuidePage page)
        {
            var list = new List<GuideEntry>();
            foreach (var e in All)
                if (e.Page == page)
                    list.Add(e);
            return list;
        }

        public static string PageName(GuidePage page) => page switch
        {
            GuidePage.Controls => "操作",
            GuidePage.SoundLight => "黑暗與聲音",
            GuidePage.Boulder => "巨石",
            GuidePage.Giant => "巨人",
            GuidePage.Crew => "同伴",
            GuidePage.Bow => "弓箭",
            GuidePage.Sheep => "羊群",
            _ => "天亮與逃出",
        };
    }

    /// <summary>情境提示與紀事條目的對應：提示觸發時同一條紀事一起解鎖。</summary>
    public static class HintGuide
    {
        public static string EntryFor(HintKind kind) => kind switch
        {
            HintKind.Decoy => "decoy",
            HintKind.Guard => "guard",
            HintKind.PulledWedge => "pull",
            HintKind.Catch => "catch",
            HintKind.Heavy => "heavy",
            HintKind.RockWindup => "rock",
            HintKind.Whimper => "whimper",
            HintKind.CrewEaten => "eaten",
            HintKind.Stake => "stake",
            HintKind.Pail => "pail",
            HintKind.Pen => "pen",
            HintKind.Pant => "pant",
            HintKind.Dawn => "dawn",
            HintKind.Rush => "rush",
            HintKind.SheepStuck => "stuck",
            HintKind.Prayer => "prayer",
            HintKind.Slip => "slip",
            HintKind.Notch => "notch",
            HintKind.Footstep => "footstep",
            HintKind.HearingRing => "ring",
            HintKind.ArrowClutter => "arrows",
            HintKind.FindExit => "exit",
            HintKind.Brace => "brace",
            _ => null,
        };
    }
}
