using System;
using UnityEngine;

/// <summary>
/// 彈弓的石子或箭直接打中巨人（規格第 31 節 B）。打中的那一刻、在發出任何落點聲音之前回報，
/// 讓宙斯法則依「打中前」他有沒有聽到你來判斷，不會被打中本身的聲音算成「先出聲」。
/// </summary>
public static class CyclopsHits
{
    public static event Action<Vector3> Hit;

    public static void Report(Vector3 point) => Hit?.Invoke(point);
}
