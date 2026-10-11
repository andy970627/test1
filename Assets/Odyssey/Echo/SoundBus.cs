using System;
using System.Collections.Generic;
using Odyssey.Core;
using UnityEngine;
using NVector2 = System.Numerics.Vector2;

/// <summary>所有聲音的廣播站：回聲畫面、巨人、除錯面板都從這裡收到同一個聲音。</summary>
public static class SoundBus
{
    static readonly List<SoundEvent> recentBleats = new();

    /// <summary>聲音（含羊叫遮蔽後的聲量）與它在世界中的位置。</summary>
    public static event Action<SoundEvent, Vector3> Emitted;

    /// <summary>scale：聲量倍率（羊圈內的腳步 0.5、撞擊依力道）。</summary>
    public static void Emit(SoundKind kind, Vector3 worldPos, float scale = 1f)
    {
        float now = Time.time;
        recentBleats.RemoveAll(b => now - b.Time > SoundRules.MaskSeconds);
        var e = SoundRules.Create(kind, new NVector2(worldPos.x, worldPos.z), now, recentBleats, scale);
        if (kind == SoundKind.Bleat)
            recentBleats.Add(e);
        Emitted?.Invoke(e, worldPos);
    }

    /// <summary>清掉訂閱與羊叫紀錄；關閉 Domain Reload 時靜態欄位會殘留到下一次 Play。</summary>
    public static void Clear()
    {
        Emitted = null;
        recentBleats.Clear();
    }
}
