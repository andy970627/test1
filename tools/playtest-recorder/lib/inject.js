/* playtest-recorder：頁面載入前注入（Playwright addInitScript）
 *
 * 1. 攔截所有 AudioContext 的輸出：任何節點 connect(ctx.destination) 都改接到一個「分接點」tap，
 *    tap 再接到真正的 destination（照常播放）＋ AudioWorklet 錄音節點（逐樣本擷取 PCM）。
 *    錄到的就是遊戲實際送到喇叭的聲音（含遊戲自己的削峰、殘響）。
 *    每塊 PCM 都帶 AudioWorklet 的 currentFrame，所以和 ctx.currentTime 的對應是逐樣本精確的。
 * 2. 記錄每個 AudioScheduledSourceNode.start(when) 的排程時間（任何 Web Audio 遊戲通用的「預定起音」）。
 * 3. 每幀（requestAnimationFrame）呼叫 profile 提供的 probe() 取遊戲狀態，存成時間軸；
 *    若掛了程式玩家 bot(api, sample)，也在這裡每幀呼叫。
 * 不改遊戲程式碼；只在頁面全域放 window.__rec。
 */
(() => {
  if (window.__rec) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  const rec = window.__rec = {
    ctxs: [],            // { ctx, tap, node, chunks: [{frame, ch:[Float32Array]}], firstFrame, ready, stamps: [] }
    starts: [],          // 排程起音時間（audio 秒，第一個 context）
    startsDropped: 0,
    timeline: [],
    events: [],
    probe: null,
    bot: null,
    botState: {},
    frames: 0,
    errors: [],
    capturing: true,
    wallAtInject: performance.timeOrigin + performance.now()
  };
  if (!AC) { rec.errors.push('no AudioContext'); return; }

  const WORKLET = `
    class RecTap extends AudioWorkletProcessor {
      constructor() { super(); this.n = 0; this.size = 8192; this.buf = null; this.start = 0; this.on = true;
        this.port.onmessage = (e) => { if (e.data === 'flush') this.flush(true); if (e.data === 'stop') { this.flush(true); this.on = false; } }; }
      flush(force) {
        if (!this.buf || this.n === 0) return;
        const out = this.buf.map(c => c.slice(0, this.n));
        this.port.postMessage({ frame: this.start, ch: out }, out.map(c => c.buffer));
        this.buf = null; this.n = 0;
      }
      process(inputs) {
        if (!this.on) return true;
        const inp = inputs[0];
        const len = inp && inp[0] ? inp[0].length : 128;
        if (!this.buf) { this.buf = [new Float32Array(this.size), new Float32Array(this.size)]; this.start = currentFrame; this.n = 0; }
        if (this.start + this.n !== currentFrame) { this.flush(); this.buf = [new Float32Array(this.size), new Float32Array(this.size)]; this.start = currentFrame; }
        for (let c = 0; c < 2; c++) {
          const src = inp && inp.length ? (inp[c] || inp[0]) : null;
          if (src) this.buf[c].set(src, this.n);
        }
        this.n += len;
        if (this.n + 128 > this.size) this.flush();
        return true;
      }
    }
    registerProcessor('rec-tap', RecTap);`;
  const workletURL = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));

  const origConnect = AudioNode.prototype.connect;
  const origDisconnect = AudioNode.prototype.disconnect;
  const isOffline = (c) => typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext;

  function entryFor(ctx) {
    let e = rec.ctxs.find(x => x.ctx === ctx);
    if (e) return e;
    const tap = ctx.createGain();
    origConnect.call(tap, ctx.destination);
    e = { ctx, tap, node: null, chunks: [], firstFrame: null, ready: false, stamps: [], sampleRate: ctx.sampleRate, mode: 'pending' };
    rec.ctxs.push(e);
    const attachSP = () => {        // 後備：沒有 AudioWorklet（非安全來源）時用 ScriptProcessor，時間對齊較粗
      const sp = ctx.createScriptProcessor(4096, 2, 2);
      sp.onaudioprocess = (ev) => {
        if (!rec.capturing) return;
        const b = ev.inputBuffer;
        const frame = Math.round(ev.playbackTime * ctx.sampleRate) - b.length;
        e.chunks.push({ frame, ch: [b.getChannelData(0).slice(), (b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0)).slice()] });
        if (e.firstFrame == null) e.firstFrame = frame;
      };
      origConnect.call(tap, sp); origConnect.call(sp, ctx.destination);
      e.node = sp; e.ready = true; e.mode = 'scriptprocessor';
    };
    if (ctx.audioWorklet) {
      ctx.audioWorklet.addModule(workletURL).then(() => {
        const node = new AudioWorkletNode(ctx, 'rec-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
        node.port.onmessage = (m) => {
          if (!rec.capturing && !m.data.final) { /* 停止後的最後一塊仍收下 */ }
          e.chunks.push(m.data);
          if (e.firstFrame == null) e.firstFrame = m.data.frame;
        };
        const mute = ctx.createGain(); mute.gain.value = 0;
        origConnect.call(tap, node); origConnect.call(node, mute); origConnect.call(mute, ctx.destination);
        e.node = node; e.ready = true; e.mode = 'audioworklet';
      }).catch((err) => { rec.errors.push('worklet: ' + err); attachSP(); });
    } else attachSP();
    // 音訊時鐘 ↔ 牆上時間 對應（給影片對齊用）
    const stamp = () => {
      try {
        const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
        e.stamps.push({ ct: ctx.currentTime, wall: performance.timeOrigin + performance.now(),
          ot: ts ? ts.contextTime : null, op: ts ? performance.timeOrigin + ts.performanceTime : null,
          base: ctx.baseLatency || 0, out: ctx.outputLatency || 0 });
      } catch (err) {}
    };
    stamp(); e.stampTimer = setInterval(stamp, 1000);
    return e;
  }

  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode && !isOffline(dest.context)) {
      const e = entryFor(dest.context);
      if (this !== e.tap && this !== e.node) { origConnect.call(this, e.tap, ...rest); return dest; }
    }
    return origConnect.call(this, dest, ...rest);
  };
  AudioNode.prototype.disconnect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode && !isOffline(dest.context)) {
      const e = rec.ctxs.find(x => x.ctx === dest.context);
      if (e && this !== e.tap) return origDisconnect.call(this, e.tap, ...rest);
    }
    return origDisconnect.call(this, dest, ...rest);
  };

  // 預定起音（只記第一個非離線 context；上限 20 萬筆）
  if (window.AudioScheduledSourceNode) {
    const origStart = AudioScheduledSourceNode.prototype.start;
    AudioScheduledSourceNode.prototype.start = function (when, ...rest) {
      try {
        const c = this.context;
        if (!isOffline(c) && (!rec.ctxs.length || rec.ctxs[0].ctx === c)) {
          const t = Math.max(+when || 0, c.currentTime);
          if (rec.starts.length < 200000) rec.starts.push(Math.round(t * 1e4) / 1e4); else rec.startsDropped++;
        }
      } catch (err) {}
      return origStart.call(this, when, ...rest);
    };
  }

  // 輸入工具（給程式玩家）：在 window 上派送鍵盤事件（isTrusted = false；遊戲若檢查 isTrusted 要改用劇本模式）
  const held = new Set();
  const keyOf = (code) => code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code.startsWith('Shift') ? 'Shift' : code;
  const fire = (type, code) => {
    const ev = new KeyboardEvent(type, { code, key: keyOf(code), bubbles: true, cancelable: true });
    (document.activeElement || document.body).dispatchEvent(ev);
  };
  rec.api = {
    down(code) { if (!held.has(code)) { held.add(code); fire('keydown', code); } },
    up(code) { if (held.has(code)) { held.delete(code); fire('keyup', code); } },
    press(code) { fire('keydown', code); held.delete(code); setTimeout(() => fire('keyup', code), 30); },
    set(code, on) { on ? this.down(code) : this.up(code); },
    releaseAll() { for (const c of [...held]) this.up(c); },
    held: () => [...held],
    log(type, data) { rec.events.push({ t: rec.lastT, src: 'bot', type, data }); }
  };

  // 影片同步標記：右下角 14×14 的黑方塊，擷取開始後每 5 秒（音訊時間）變白約 0.2 秒，
  // 記下變白那一幀的 ctx.currentTime；record.mjs 再從影片找出變白的時間，算出聲音與畫面的精確位移。
  rec.sync = { on: true, marks: [], next: null, el: null, offAt: 0 };
  const syncTick = () => {
    const S = rec.sync, e = rec.ctxs[0];
    if (!S.on || !e || e.firstFrame == null || !rec.capturing || !document.body) return;
    if (!S.el) {
      S.el = document.createElement('div');
      S.el.style.cssText = 'position:fixed;right:2px;bottom:2px;width:14px;height:14px;background:#000;z-index:2147483647;pointer-events:none';
      document.documentElement.appendChild(S.el);
      S.next = e.firstFrame / e.sampleRate + 1.0;
    }
    const t = e.ctx.currentTime;
    if (S.offAt && t >= S.offAt) { S.el.style.background = '#000'; S.offAt = 0; }
    if (t >= S.next && !S.offAt) {
      S.el.style.background = '#fff'; S.offAt = t + 0.2;
      S.marks.push({ t, wall: performance.timeOrigin + performance.now() });
      S.next += 5;
    }
  };

  // 每幀取樣
  let lastWall = null;
  const tick = () => {
    rec.frames++;
    try { syncTick(); } catch (err) {}
    const now = performance.now();
    if (rec.probe && rec.capturing) {
      try {
        const s = rec.probe();
        if (s) {
          s.wall = Math.round(now);
          if (lastWall != null) s.fdt = Math.round(now - lastWall);
          rec.lastT = s.t;
          if (s.events) { for (const ev of s.events) rec.events.push(Object.assign({ t: s.t }, ev)); delete s.events; }
          rec.timeline.push(s);
          if (rec.bot) {
            try { rec.bot(rec.api, s, rec.botState); } catch (err) { if (rec.errors.length < 50) rec.errors.push('bot: ' + (err && err.stack || err)); }
          }
        }
      } catch (err) { if (rec.errors.length < 50) rec.errors.push('probe: ' + (err && err.stack || err)); }
    }
    lastWall = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // 結束：停止擷取，把 PCM 合成交錯的 16-bit（依 frame 放回原位，缺塊補 0），回傳統計
  rec.finish = async () => {
    rec.capturing = false;
    for (const e of rec.ctxs) if (e.node && e.node.port) e.node.port.postMessage('stop');
    await new Promise(r => setTimeout(r, 400));
    const out = [];
    for (const e of rec.ctxs) {
      clearInterval(e.stampTimer);
      if (!e.chunks.length) { out.push({ frames: 0, mode: e.mode }); continue; }
      e.chunks.sort((a, b) => a.frame - b.frame);
      const f0 = e.chunks[0].frame, last = e.chunks[e.chunks.length - 1];
      const total = last.frame + last.ch[0].length - f0;
      const pcm = new Int16Array(total * 2);
      let gaps = 0, clip = 0, peak = 0, expect = f0; const gapList = [];
      for (const c of e.chunks) {
        if (c.frame > expect) { gaps += c.frame - expect; if (gapList.length < 50) gapList.push([+(expect / e.sampleRate).toFixed(3), c.frame - expect]); }
        const off = c.frame - f0, L = c.ch[0], R = c.ch[1] || c.ch[0];
        for (let i = 0; i < L.length; i++) {
          const l = L[i], r = R[i];
          const al = Math.abs(l), ar = Math.abs(r);
          if (al > peak) peak = al; if (ar > peak) peak = ar;
          if (al >= 0.999) clip++; if (ar >= 0.999) clip++;
          pcm[(off + i) * 2] = Math.max(-32768, Math.min(32767, Math.round(l * 32767)));
          pcm[(off + i) * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(r * 32767)));
        }
        expect = c.frame + L.length;
      }
      e.pcm = pcm;
      out.push({ frames: total, firstFrame: f0, startTime: f0 / e.sampleRate, sampleRate: e.sampleRate,
        gapFrames: gaps, gapList, clipSamplesFloat: clip, peakFloat: peak, mode: e.mode, stamps: e.stamps });
    }
    return out;
  };
  // 分段取出 base64（避免單次傳太大）
  rec.pcmSlice = (i, from, len) => {
    const e = rec.ctxs[i]; if (!e || !e.pcm) return '';
    const u8 = new Uint8Array(e.pcm.buffer, from * 2, Math.min(len, e.pcm.length - from) * 2);
    let s = '';
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
    return btoa(s);
  };
})();
