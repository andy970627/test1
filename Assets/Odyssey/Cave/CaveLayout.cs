using UnityEngine;

/// <summary>CaveBuilder 產生岩洞後回報的關鍵位置，供羊群、巨人、遊戲主控使用。</summary>
public struct CaveLayout
{
    public Vector3 PlayerSpawn;
    public Vector3 CyclopsSeat;
    /// <summary>巨人摸羊的位置；也是 QueuePath 的最後一點。</summary>
    public Vector3 EntrancePoint;
    /// <summary>洞口外約 8 公尺，羊走到這裡就算出洞。</summary>
    public Vector3 OutsidePoint;
    public Vector3 CrewCorner;
    public Vector3 BucketPosition;
    public Vector3[] QueuePath;
    /// <summary>羊遊走的範圍。</summary>
    public Bounds Floor;
    /// <summary>洞外照進來的月光；羊群越走越少，光就越接近黎明。</summary>
    public Light Moonlight;
}
