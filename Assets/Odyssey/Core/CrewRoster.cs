namespace Odyssey.Core
{
    /// <summary>洞裡剩下的同伴與第幾夜。每次被抓，巨人吃掉一名同伴。</summary>
    public sealed class CrewRoster
    {
        public const int StartingCrew = 12;

        public int Remaining { get; private set; } = StartingCrew;
        public int Night { get; private set; } = 1;
        public bool Wiped => Remaining <= 0;

        public void Eat()
        {
            if (Remaining > 0)
                Remaining--;
            Night++;
        }

        public void Reset()
        {
            Remaining = StartingCrew;
            Night = 1;
        }
    }
}
