// sfx.js —— 轻量音效合成（Web Audio API，无需任何音频文件）
// 在 pet.html / panel.html 中通过 <script src="sfx.js"></script> 引入，调用 window.SFX.play('click')
(function () {
  let ctx = null;
  let enabled = true;

  function ensureCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { ctx = null; }
    }
    // 某些情况下 ctx 处于 suspended，需要 resume
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // 播放一个音符
  function tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.2, delay = 0, slideTo = null }) {
    const c = ensureCtx();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    // 包络：快速起音 + 平滑衰减，避免爆音
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  const sounds = {
    // 点击：清脆短音
    click: () => tone({ freq: 660, type: 'triangle', dur: 0.08, vol: 0.18 }),
    // 打开面板：上滑音
    open: () => tone({ freq: 440, type: 'sine', dur: 0.18, vol: 0.16, slideTo: 880 }),
    // 关闭：下滑音
    close: () => tone({ freq: 660, type: 'sine', dur: 0.16, vol: 0.14, slideTo: 330 }),
    // 换装/佩戴：俏皮双音
    wear: () => { tone({ freq: 587, type: 'square', dur: 0.07, vol: 0.12 }); tone({ freq: 880, type: 'square', dur: 0.1, vol: 0.12, delay: 0.07 }); },
    // 切换皮肤：水滴音
    skin: () => tone({ freq: 1046, type: 'sine', dur: 0.12, vol: 0.15, slideTo: 1568 }),
    // 优化成功：愉悦三连音
    success: () => { [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.16, delay: i * 0.09 })); },
    // 升级：上行琶音
    levelup: () => { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.18, vol: 0.14, delay: i * 0.1 })); },
    // 出错：低沉双音
    error: () => { tone({ freq: 311, type: 'sawtooth', dur: 0.18, vol: 0.14 }); tone({ freq: 233, type: 'sawtooth', dur: 0.24, vol: 0.14, delay: 0.16 }); },
    // 逗它：可爱啾啾
    boop: () => tone({ freq: 880, type: 'sine', dur: 0.1, vol: 0.16, slideTo: 1320 }),
    // 躲藏：嗖一下
    hide: () => tone({ freq: 700, type: 'sine', dur: 0.2, vol: 0.1, slideTo: 200 }),
    // 出现：嗖回来
    show: () => tone({ freq: 300, type: 'sine', dur: 0.2, vol: 0.1, slideTo: 800 }),
  };

  window.SFX = {
    play(name) { if (enabled && sounds[name]) { try { sounds[name](); } catch {} } },
    setEnabled(v) { enabled = !!v; },
    isEnabled() { return enabled; },
  };
})();
