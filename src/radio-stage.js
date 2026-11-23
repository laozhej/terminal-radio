// 表现层：开场来电、音效、逐字回放、引用飞入、派车动画。
// 只听 radio-game.js 发出的 radio:* 事件，不读写游戏状态。整段删掉，游戏照常可玩。
(() => {
  const root = document.documentElement;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = window.matchMedia('(max-width: 760px)');
  const byId = (id) => document.getElementById(id);
  const desk = byId('desk');
  const intro = byId('intro');
  const answer = byId('answer-call');
  const soundToggle = byId('sound-toggle');
  const transmission = byId('current-transmission');
  const receiver = document.querySelector('.rx');
  const mapPanel = document.querySelector('.map-panel');
  const radioPanel = document.querySelector('.radio-panel');
  const map = () => window.TerminalRadioMap;
  const timers = new Map();

  function later(name, delay, task) {
    window.clearTimeout(timers.get(name));
    timers.set(name, window.setTimeout(task, delay));
  }

  // 给元素加一个限时的状态类，重复触发时从头再播。
  function flash(element, className, duration) {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), duration);
  }

  // ---------- 音效：全部现场合成，不加载任何文件 ----------
  const audio = (() => {
    const Engine = window.AudioContext || window.webkitAudioContext;
    let context = null;
    let master = null;
    let cueBus = null;
    let noise = null;
    let raining = false;
    let asleep = false;
    let enabled = true;
    try {
      enabled = window.localStorage.getItem('terminal-radio-sound') !== 'off';
    } catch {
      enabled = true;
    }

    function boot() {
      if (context) return true;
      if (!Engine) return false;
      try {
        context = new Engine();
      } catch {
        return false;
      }
      master = context.createGain();
      master.gain.value = enabled ? 1 : 0;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -16;
      limiter.ratio.value = 6;
      master.connect(limiter).connect(context.destination);
      // 提示音走单独一路，整体音量在这里调，不用逐个改。
      cueBus = context.createGain();
      cueBus.gain.value = 1.9;
      cueBus.connect(master);
      noise = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
      return true;
    }

    function envelope(start, length, peak) {
      const level = context.createGain();
      level.gain.setValueAtTime(0.0001, start);
      level.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.014, length / 3));
      level.gain.exponentialRampToValueAtTime(0.0001, start + length);
      level.connect(cueBus);
      return level;
    }

    function tone(at, from, length, peak, { to = from, type = 'sine' } = {}) {
      const start = context.currentTime + at;
      const voice = context.createOscillator();
      voice.type = type;
      voice.frequency.setValueAtTime(from, start);
      if (to !== from) voice.frequency.exponentialRampToValueAtTime(to, start + length);
      voice.connect(envelope(start, length, peak));
      voice.start(start);
      voice.stop(start + length + 0.04);
    }

    function hiss(at, band, length, peak, { to = band, width = 1 } = {}) {
      const start = context.currentTime + at;
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = width;
      filter.frequency.setValueAtTime(band, start);
      if (to !== band) filter.frequency.exponentialRampToValueAtTime(to, start + length);
      source.connect(filter).connect(envelope(start, length, peak));
      source.start(start, Math.random() * 3);
      source.stop(start + length + 0.04);
    }

    // 雨声：一层高频雨丝，一层低沉的雨幕，缓慢起伏。
    function rain() {
      if (raining) return;
      raining = true;
      const bed = context.createGain();
      bed.gain.setValueAtTime(0.0001, context.currentTime);
      bed.gain.exponentialRampToValueAtTime(1, context.currentTime + 2.4);
      bed.connect(master);
      for (const [type, frequency, width, level, offset] of [
        ['highpass', 1500, 0.4, 0.02, 0],
        ['bandpass', 420, 0.5, 0.034, 1.7],
      ]) {
        const source = context.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = width;
        const gain = context.createGain();
        gain.gain.value = level;
        source.connect(filter).connect(gain).connect(bed);
        source.start(0, offset);
      }
      const gust = context.createOscillator();
      const depth = context.createGain();
      gust.frequency.value = 0.07;
      depth.gain.value = 0.22;
      gust.connect(depth).connect(bed.gain);
      gust.start();
    }

    const cues = {
      answer() {
        hiss(0, 1700, 0.22, 0.05, { to: 3400, width: 1.6 });
        tone(0.06, 880, 0.08, 0.045);
        tone(0.16, 1320, 0.1, 0.045);
      },
      reply() {
        hiss(0, 2600, 0.1, 0.04, { width: 1.4 });
        tone(0.03, 1040, 0.07, 0.035);
      },
      evidence() {
        tone(0, 150, 0.15, 0.085, { to: 68 });
        hiss(0, 3800, 0.05, 0.05);
        tone(0.1, 1568, 0.2, 0.03, { type: 'triangle' });
      },
      quote() {
        hiss(0, 5200, 0.04, 0.045);
        tone(0.03, 740, 0.08, 0.032, { type: 'triangle' });
      },
      unquote() {
        tone(0, 520, 0.07, 0.028, { type: 'triangle' });
      },
      tune() {
        hiss(0, 900, 0.17, 0.045, { to: 3400, width: 2.4 });
        tone(0.14, 660, 0.05, 0.028);
      },
      deny() {
        tone(0, 196, 0.1, 0.06, { type: 'triangle' });
        tone(0.14, 196, 0.12, 0.06, { type: 'triangle' });
      },
      select() {
        tone(0, 520, 0.06, 0.032, { type: 'triangle' });
      },
      exclude() {
        tone(0, 330, 0.1, 0.036, { to: 220, type: 'triangle' });
      },
      dispatch() {
        tone(0, 1180, 0.13, 0.04);
        hiss(0.1, 130, 1.9, 0.09, { to: 250, width: 1.1 });
        tone(0.1, 62, 1.8, 0.07, { to: 96, type: 'triangle' });
      },
      success() {
        tone(0, 523.25, 0.5, 0.05);
        tone(0.13, 659.25, 0.5, 0.05);
        tone(0.26, 783.99, 0.9, 0.05);
      },
      partial() {
        tone(0, 523.25, 0.45, 0.045);
        tone(0.15, 622.25, 0.8, 0.045);
      },
      fail() {
        tone(0, 311.13, 0.5, 0.055, { type: 'triangle' });
        tone(0.18, 233.08, 1, 0.055, { type: 'triangle' });
      },
    };

    return {
      get enabled() {
        return enabled;
      },
      // 必须在用户手势里调用，浏览器才允许出声。
      unlock() {
        if (!boot()) return;
        if (context.state === 'suspended') context.resume().catch(() => {});
        rain();
      },
      play(name) {
        if (!context || !enabled || asleep || !cues[name]) return;
        if (context.state === 'running') cues[name]();
        else context.resume().then(() => cues[name]()).catch(() => {});
      },
      set(next) {
        enabled = next;
        try {
          window.localStorage.setItem('terminal-radio-sound', enabled ? 'on' : 'off');
        } catch {
          // 存不了也不影响本局。
        }
        if (context) master.gain.setTargetAtTime(enabled ? 1 : 0, context.currentTime, 0.04);
      },
      pause(hidden) {
        asleep = hidden;
        if (!context) return;
        if (hidden) context.suspend().catch(() => {});
        else context.resume().catch(() => {});
      },
    };
  })();

  if (soundToggle) {
    const showSound = () => soundToggle.setAttribute('aria-pressed', String(audio.enabled));
    showSound();
    soundToggle.addEventListener('click', () => {
      audio.unlock();
      audio.set(!audio.enabled);
      showSound();
      if (audio.enabled) window.setTimeout(() => audio.play('select'), 60);
    });
  }
  document.addEventListener('visibilitychange', () => audio.pause(document.hidden));

  // ---------- 示波器 ----------
  // 有人说话时是起伏的语音波形，等模型回话时是一条平稳的载波，其余时间几乎是直线。
  const scope = (() => {
    const canvas = document.querySelector('.scope');
    const pen = canvas?.getContext('2d');
    if (!pen) return { speak() {}, call() {} };
    let width = 0;
    let height = 0;
    let level = 0;
    let speaking = false;
    let calling = false;
    let running = false;

    function draw(now) {
      if (!width) return;
      const t = now / 1000;
      const target = speaking ? 1 : calling ? 0.5 : 0.04;
      level += (target - level) * (still.matches ? 1 : 0.14);
      const mid = height / 2;
      pen.clearRect(0, 0, width, height);
      pen.strokeStyle = 'rgba(255, 196, 99, 0.16)';
      pen.lineWidth = 1;
      pen.beginPath();
      pen.moveTo(0, Math.round(mid) + 0.5);
      pen.lineTo(width, Math.round(mid) + 0.5);
      pen.stroke();
      pen.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const u = x / width;
        const taper = Math.sin(Math.PI * u) ** 0.7;
        const shape = calling && !speaking
          ? Math.sin(u * 40 - t * 8)
          : (Math.sin(u * 52 - t * 14) * 0.5 + Math.sin(u * 97 + t * 8.3) * 0.28 + Math.sin(u * 19 - t * 4.7) * 0.34)
            * (0.3 + 0.7 * Math.abs(Math.sin(t * 5.3 + u * 2.6)));
        const y = mid + shape * level * (mid - 3) * taper;
        if (x) pen.lineTo(x, y);
        else pen.moveTo(x, y);
      }
      pen.strokeStyle = '#ffc463';
      pen.lineWidth = 1.6;
      pen.lineJoin = 'round';
      pen.shadowColor = '#ffc463';
      pen.shadowBlur = level > 0.1 ? 9 : 0;
      pen.globalAlpha = 0.35 + Math.min(0.65, level * 1.4);
      pen.stroke();
      pen.globalAlpha = 1;
      pen.shadowBlur = 0;
    }

    function frame(now) {
      draw(now);
      if (speaking || calling || level > 0.06) requestAnimationFrame(frame);
      else running = false;
    }

    function wake() {
      if (still.matches) {
        draw(performance.now());
        return;
      }
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    }

    new ResizeObserver(() => {
      const box = canvas.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      pen.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(performance.now());
    }).observe(canvas);

    return {
      speak(on) {
        speaking = on;
        wake();
      },
      call(on) {
        calling = on;
        wake();
      },
    };
  })();
  new MutationObserver(() => scope.call(root.dataset.busy === 'true'))
    .observe(root, { attributes: true, attributeFilter: ['data-busy'] });

  function setSpeaking(on) {
    receiver?.classList.toggle('is-speaking', on);
    scope.speak(on);
  }

  // 剧情时间跟着最新一条通话走。
  const storyClock = document.querySelector('[data-story-clock]');
  function syncClock() {
    const now = transmission?.querySelector('.transmission-clock')?.textContent;
    if (!storyClock || !now || storyClock.textContent === now) return;
    storyClock.textContent = now;
    flash(storyClock, 'is-ticking', 600);
  }

  // ---------- 逐字回放 ----------
  function replay(length = 0, delay = 0) {
    if (!transmission) return;
    transmission.style.setProperty('--reveal-delay', `${delay}ms`);
    transmission.classList.remove('is-fresh', 'is-settled');
    void transmission.offsetWidth;
    transmission.classList.add('is-fresh');
    if (still.matches) return;
    later('speaking-start', delay, () => setSpeaking(true));
    later('speaking-end', delay + length * 24 + 380, () => setSpeaking(false));
  }
  transmission?.addEventListener('click', () => {
    transmission.classList.add('is-settled');
    window.clearTimeout(timers.get('speaking-end'));
    setSpeaking(false);
  });

  // ---------- 开场来电 ----------
  // 自动化浏览器里默认跳过，避免挡住现有检查脚本。#intro=1 强制显示，#intro=0 强制跳过（写成 ?intro= 也认）。
  const wish = new URLSearchParams(window.location.hash.slice(1)).get('intro')
    ?? new URLSearchParams(window.location.search).get('intro');
  const showIntro = Boolean(intro && answer && desk) && (wish === '1' || (wish !== '0' && !navigator.webdriver));
  if (showIntro) {
    let stopRain = () => {};
    root.dataset.intro = 'ringing';
    intro.hidden = false;
    desk.inert = true;
    stopRain = map()?.rainLayer(intro.querySelector('canvas')) ?? stopRain;
    answer.focus({ preventScroll: true });
    answer.addEventListener('click', () => {
      audio.unlock();
      audio.play('answer');
      desk.inert = false;
      root.dataset.intro = 'leaving';
      replay(transmission?.textContent.length ?? 0, 620);
      window.setTimeout(() => {
        intro.hidden = true;
        stopRain();
        delete root.dataset.intro;
      }, 760);
      document.querySelector('main')?.focus({ preventScroll: true });
    }, { once: true });
  } else {
    const unlock = () => {
      audio.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  // ---------- 游戏事件 ----------
  let firstClueSeen = false;
  let staging = 0;

  document.addEventListener('radio:reset', ({ detail }) => {
    staging += 1;
    firstClueSeen = false;
    if (radioPanel) radioPanel.inert = false;
    map()?.clear();
    timers.forEach((timer) => window.clearTimeout(timer));
    setSpeaking(false);
    syncClock();
    if (!detail.replay) return;
    replay(transmission?.textContent.length ?? 0, 200);
    window.scrollTo({ top: 0, behavior: 'instant' });
    audio.play('answer');
  });

  document.addEventListener('radio:call', ({ detail }) => {
    audio.play('reply');
    replay(detail.length, 80);
    syncClock();
    flash(byId('call-count'), 'is-ticking', 600);
    if (detail.clue) {
      later('evidence-cue', 300, () => audio.play('evidence'));
      if (!firstClueSeen) {
        firstClueSeen = true;
        later('nudge', 900, () => flash(document.querySelector('.quote-empty'), 'is-nudged', 3200));
      }
    }
    if (narrow.matches) receiver?.scrollIntoView({ block: 'nearest', behavior: still.matches ? 'auto' : 'smooth' });
  });

  document.addEventListener('radio:denied', ({ detail }) => {
    audio.play('deny');
    flash(byId('radio-feedback'), 'is-shaking', 500);
    if (detail.reason !== 'quote') return;
    if (detail.held) flash(document.querySelector(`.quote-button[data-evidence-id="${detail.needs}"]`), 'is-wanted', 2600);
    else flash(document.querySelector('#radio-channels [data-channel="caller"]'), 'is-suggested', 2600);
  });

  document.addEventListener('radio:channel', () => audio.play('tune'));
  // 选中一个没被排除的地点，就在地图上点亮去那里的路线。
  function previewRoute(location) {
    const point = document.querySelector(`#map-points [data-location="${location}"]`);
    map()?.preview?.(point && !point.classList.contains('is-excluded') ? location : null);
  }
  document.addEventListener('radio:select', ({ detail }) => {
    audio.play('select');
    previewRoute(detail.location);
  });
  document.addEventListener('radio:exclude', ({ detail }) => {
    audio.play('exclude');
    previewRoute(detail.location);
  });

  // ---------- 把证据卡拖到「带上证词」 ----------
  // 和点「引用」是同一件事：落下时替玩家按那张卡的引用按钮。
  const board = byId('evidence-list');
  const dock = document.querySelector('.quote-dock');
  const dropZone = document.querySelector('.tx');
  if (board && dock && dropZone) {
    let carried = null;
    const arm = () => board.querySelectorAll('.evidence-card').forEach((card) => { card.draggable = true; });
    new MutationObserver(arm).observe(board, { childList: true });
    arm();
    const settle = () => {
      carried = null;
      dock.classList.remove('is-target', 'is-over');
    };
    board.addEventListener('dragstart', (event) => {
      const card = event.target.closest?.('.evidence-card');
      const button = card?.querySelector('.quote-button');
      if (!card || !button || button.disabled) {
        event.preventDefault();
        return;
      }
      carried = card.dataset.clue;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', card.querySelector('.evidence-name')?.textContent ?? '');
      dock.classList.add('is-target');
    });
    board.addEventListener('dragend', settle);
    dropZone.addEventListener('dragover', (event) => {
      if (!carried) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      dock.classList.add('is-over');
    });
    dropZone.addEventListener('dragleave', (event) => {
      if (!dropZone.contains(event.relatedTarget)) dock.classList.remove('is-over');
    });
    dropZone.addEventListener('drop', (event) => {
      if (!carried) return;
      event.preventDefault();
      const button = board.querySelector(`.quote-button[data-evidence-id="${carried}"]`);
      settle();
      if (button && !button.disabled && button.getAttribute('aria-pressed') !== 'true') button.click();
    });
  }

  document.addEventListener('radio:quote', ({ detail }) => {
    if (!detail.id) {
      audio.play('unquote');
      return;
    }
    audio.play('quote');
    const card = document.querySelector(`.evidence-card[data-clue="${detail.id}"]`);
    const dock = byId('active-quote');
    if (!card || !dock) return;
    flash(dock, 'is-landing', 700);
    if (still.matches || typeof card.animate !== 'function') return;
    const from = card.getBoundingClientRect();
    const to = dock.getBoundingClientRect();
    if (!from.width || !to.width) return;
    // 一张纸从证据板滑到发问区。不克隆卡片，免得页面里出现第二个引用按钮。
    const ghost = document.createElement('div');
    ghost.className = 'quote-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.textContent = card.querySelector('.evidence-name')?.textContent ?? '';
    Object.assign(ghost.style, {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
    });
    document.body.append(ghost);
    const flight = ghost.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 0.96 },
      {
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${Math.min(1, to.height / from.height)})`,
        opacity: 0.25,
      },
    ], { duration: 440, easing: 'cubic-bezier(.3, .7, .2, 1)' });
    flight.finished.catch(() => {}).then(() => ghost.remove());
  });

  document.addEventListener('radio:outcome', ({ detail }) => {
    const run = staging += 1;
    // 电台已经用不上了，连键盘焦点一起收走。
    if (radioPanel) radioPanel.inert = true;
    const drive = map()?.drive;
    if (!drive) return;
    // 结果已经写进页面。先把它藏住，等救援车开到再露出来。
    root.dataset.phase = 'dispatching';
    audio.play('dispatch');
    if (narrow.matches && mapPanel) {
      window.scrollTo({ top: Math.max(0, mapPanel.getBoundingClientRect().top + window.scrollY - 64), behavior: 'instant' });
    }
    drive(detail.target).then(() => {
      if (run !== staging) return;
      root.dataset.phase = 'outcome';
      audio.play(detail.correct ? (detail.fullEvidence ? 'success' : 'partial') : 'fail');
      if (narrow.matches) byId('outcome')?.scrollIntoView({ block: 'nearest', behavior: still.matches ? 'auto' : 'smooth' });
    });
  });
})();
