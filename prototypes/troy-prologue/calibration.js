/* 開場跟拍校準（2026-11-24，規則角色）
 *
 * 為什麼要有：判定只扣掉瀏覽器回報的 outputLatency，換喇叭或藍牙耳機時，實際延遲可能差上百毫秒，
 *   而腳步、暗號的判定窗只有 ±80 毫秒（STEP_WIN），整局都會踩不準
 *   （docs/design/2026-11-23-competitor-design-review.md 3.1「裝置延遲沒校準」）。
 *
 * 做法：開場請玩家跟著一串拍點敲幾下，量「敲擊時間 − 最近拍點」的差，取中位數當本局偏差。
 *   - 差 > 0：玩家聽到的比時鐘晚（例如藍牙耳機），判定時把按鍵時間往前拉。
 *   - 判定那邊：risset.js 用 actAt − inputOffsetMs ÷ 1000 當按鍵時間（state.inputOffsetMs，預設 0）。
 *
 * 介面約定（名稱不要改，聲音與畫面角色同時在用）：
 *   RissetCalib.estimate(tapTimesSec, beatTimesSec) → { offsetMs, spreadMs, ok, used, medianMs, total }
 *     - tapTimesSec：玩家每一下的時間（秒），和聲音層 calibClicks() 回傳的拍點用同一個時鐘。
 *     - 每下對最近的拍點取差；|差| > 200 毫秒的當離群值剔除。
 *     - 有效 ≥ 5 下才 ok。
 *     - medianMs：有效差的中位數（沒夾）；offsetMs：夾在 ±150 毫秒內的中位數。ok 為 false 時 offsetMs 一律 0，
 *       畫面就算忘了看 ok，直接寫進 state.inputOffsetMs 也不會亂偏。
 *     - spreadMs：有效差和中位數的「中位絕對偏差」（一半的敲擊離中位數不超過這麼多毫秒），
 *       用來告訴玩家敲得穩不穩；沒有有效敲擊時是 null。
 *     - used：有效下數；total：收到的有限數值下數。
 *     - 數字四捨五入到 0.1 毫秒。
 *   RissetCalib.apply(tSec, offsetMs) → 校正後的秒數（tSec − offsetMs ÷ 1000）；給還沒走規則判定的地方用（例如畫面自己判的敲暗號）。
 *   RissetCalib.OUTLIER_MS / MAX_MS / MIN_TAPS：200／150／5。
 *
 * 這個值只存這一局，不寫進存檔（下一局、換裝置都要重新量）。
 * 瀏覽器：<script src="calibration.js"> 掛 window.RissetCalib；Node：require('./calibration.js')。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RissetCalib = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';
  const OUTLIER_MS = 200;   // |差| 超過就剔除
  const MAX_MS = 150;       // 偏差上限（夾在 ±150 毫秒）
  const MIN_TAPS = 5;       // 有效下數 ≥ 5 才算數

  const r1 = (x) => Math.round(x * 10) / 10;
  const median = (arr) => {
    const s = arr.slice().sort((a, b) => a - b), n = s.length;
    if (!n) return null;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  const finite = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'number' && Number.isFinite(x)) : []);

  /** 已排序的拍點裡，離 t 最近的那一拍（二分搜尋）。 */
  function nearest(sorted, t) {
    let lo = 0, hi = sorted.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= t) lo = mid; else hi = mid;
    }
    return Math.abs(sorted[lo] - t) <= Math.abs(sorted[hi] - t) ? sorted[lo] : sorted[hi];
  }

  function estimate(tapTimesSec, beatTimesSec) {
    const taps = finite(tapTimesSec), beats = finite(beatTimesSec).sort((a, b) => a - b);
    const diffs = [];
    if (beats.length) {
      for (const t of taps) {
        const d = (t - nearest(beats, t)) * 1000;
        if (Math.abs(d) <= OUTLIER_MS + 1e-9) diffs.push(d);
      }
    }
    const used = diffs.length, ok = used >= MIN_TAPS;
    const med = median(diffs);
    const spread = med == null ? null : median(diffs.map((d) => Math.abs(d - med)));
    const clamped = med == null ? 0 : Math.max(-MAX_MS, Math.min(MAX_MS, med));
    return {
      offsetMs: ok ? r1(clamped) : 0,
      spreadMs: spread == null ? null : r1(spread),
      ok,
      used,
      medianMs: med == null ? null : r1(med),
      total: taps.length,
    };
  }

  function apply(tSec, offsetMs) {
    const o = typeof offsetMs === 'number' && Number.isFinite(offsetMs) ? Math.max(-MAX_MS, Math.min(MAX_MS, offsetMs)) : 0;
    return tSec - o / 1000;
  }

  return { estimate, apply, OUTLIER_MS, MAX_MS, MIN_TAPS };
});
