/* 独立音乐模块：不改动 app.js 的任何逻辑，仅监听 DOM 状态与按钮交互。 */
(() => {
  const SRC = './public/assets/christmas_card_music_00-54_to_01-46.mp3';
  const TARGET_VOLUME = 0.3;      // 目标音量 30%
  const FADE_MS = 1200;           // 淡入淡出时长
  const LOOP = false;             // 不循环

  const btn = document.querySelector('#music-btn');
  const main = document.querySelector('main');
  if (!btn || !main) return;

  const audio = new Audio(SRC);
  audio.preload = 'auto';
  audio.loop = LOOP;
  audio.volume = 0;

  const state = { started: false, intent: 'idle' }; // intent: idle|playing|paused|ended
  let fadeRaf = 0;
  let unlockHandlers = [];

  function setState(s) {
    state.intent = s;
    btn.dataset.state = s;
    const labels = {
      idle: '播放音乐', playing: '暂停音乐', paused: '继续播放', ended: '重新播放',
    };
    btn.setAttribute('aria-label', labels[s]);
    btn.setAttribute('title', labels[s]);
    btn.setAttribute('aria-pressed', String(s === 'playing'));
  }
  setState('idle');

  function cancelFade() {
    if (fadeRaf) cancelAnimationFrame(fadeRaf);
    fadeRaf = 0;
  }

  function fade(to, ms = FADE_MS, done) {
    cancelFade();
    const from = audio.volume;
    const startAt = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startAt) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t < 1) {
        fadeRaf = requestAnimationFrame(step);
      } else {
        fadeRaf = 0;
        if (done) done();
      }
    }
    fadeRaf = requestAnimationFrame(step);
  }

  // iOS Safari 需要在用户手势中解锁音频。
  // 仅用独立的 AudioContext 解锁，绝不触碰主 audio —— 避免与 playFromStart 产生竞态
  // （此前 audio.play().then(pause) 会把刚启动的播放又暂停掉）。
  function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    try {
      if (Ctx) {
        const ctx = new Ctx();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination); src.start(0);
        if (ctx.state === 'suspended') ctx.resume();
      }
    } catch (_) {}
    detachUnlock();
  }
  function attachUnlock() {
    const events = ['pointerdown', 'touchstart', 'click'];
    unlockHandlers = events.map((e) => {
      const fn = () => unlockAudio();
      window.addEventListener(e, fn, { once: true, passive: true });
      return [e, fn];
    });
  }
  function detachUnlock() {
    unlockHandlers.forEach(([e, fn]) => window.removeEventListener(e, fn));
    unlockHandlers = [];
  }

  // 由"首次开启贺卡"或"用户点按钮"触发的播放
  function playFromStart() {
    state.started = true;
    cancelFade();
    audio.muted = false;
    if (audio.ended || audio.currentTime >= (audio.duration || Infinity) - 0.05) {
      audio.currentTime = 0;
    }
    audio.volume = 0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { setState('playing'); fade(TARGET_VOLUME); })
       .catch(() => { setState('idle'); }); // 自动播放被浏览器拒绝
    } else {
      setState('playing'); fade(TARGET_VOLUME);
    }
  }

  function pause() {
    cancelFade();
    fade(0, Math.min(FADE_MS, 400), () => {
      audio.pause();
      setState('paused');
    });
  }

  function resume() {
    cancelFade();
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { setState('playing'); fade(TARGET_VOLUME); })
       .catch(() => { setState('paused'); });
    } else {
      setState('playing'); fade(TARGET_VOLUME);
    }
  }

  // 播放结束：停止且不循环，按钮回到可重播状态
  audio.addEventListener('ended', () => {
    cancelFade();
    audio.volume = 0;
    audio.currentTime = 0;
    setState('ended');
  });

  // 按钮：播放/暂停/继续/重播切换
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    unlockAudio();
    if (state.intent === 'playing') {
      pause();
    } else if (state.intent === 'paused') {
      resume();
    } else {
      // idle / ended -> 从头播放
      playFromStart();
    }
  });

  // 首次开启贺卡时尝试启动音乐。
  // 项目交互为"点击封面翻页"（无独立信封阶段），以 main[data-open] 由 false->true 判定开启。
  let prevOpen = main.dataset.open === 'true';
  const obs = new MutationObserver(() => {
    const nowOpen = main.dataset.open === 'true';
    if (nowOpen && !prevOpen && !state.started) {
      playFromStart();
    }
    prevOpen = nowOpen;
  });
  obs.observe(main, { attributes: true, attributeFilter: ['data-open'] });

  attachUnlock();
})();
