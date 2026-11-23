(() => {
  const surface = document.getElementById('survey-map');
  const canvas = document.getElementById('survey-canvas');
  const context = canvas?.getContext('2d');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);

  // 巡检线两段折线。地点锚点：北闸 (0.29, 0.25)、排水泵站 (0.68, 0.55)、旧货栈 (0.35, 0.76)。
  const routes = [
    [[0.215, 1.04], [0.244, 0.94], [0.28, 0.879], [0.35, 0.76], [0.382, 0.686], [0.428, 0.651], [0.475, 0.606], [0.498, 0.548], [0.485, 0.459], [0.452, 0.402], [0.392, 0.346], [0.29, 0.25], [0.267, 0.142], [0.229, 0.059], [0.201, -0.04]],
    [[0.498, 0.548], [0.544, 0.528], [0.597, 0.53], [0.635, 0.54], [0.68, 0.55], [0.741, 0.48], [0.765, 0.385], [0.799, 0.33], [0.855, 0.291], [0.91, 0.2], [0.986, 0.15]],
  ];
  const stations = { gate: [0.29, 0.25], pump: [0.68, 0.55], warehouse: [0.35, 0.76] };
  // 救援车从南端驶入，沿巡检线开到目的地。
  const drives = {
    warehouse: { path: routes[0].slice(0, 4), duration: 1700 },
    pump: { path: [...routes[0].slice(0, 8), ...routes[1].slice(1, 5)], duration: 2300 },
    gate: { path: routes[0].slice(0, 12), duration: 2600 },
  };
  const westBank = [
    [0.73, -0.06],
    [0.72, 0.075, 0.58, 0.15, 0.55, 0.273],
    [0.514, 0.406, 0.586, 0.43, 0.548, 0.56],
    [0.519, 0.652, 0.444, 0.722, 0.426, 0.82],
    [0.409, 0.916, 0.39, 0.973, 0.33, 1.06],
  ];
  const eastBank = [
    [0.414, 1.06],
    [0.469, 0.975, 0.472, 0.918, 0.494, 0.833],
    [0.524, 0.73, 0.589, 0.68, 0.62, 0.565],
    [0.645, 0.476, 0.58, 0.403, 0.619, 0.28],
    [0.648, 0.171, 0.799, 0.093, 0.818, -0.06],
  ];
  const midstream = [
    [0.775, -0.06],
    [0.76, 0.085, 0.616, 0.16, 0.585, 0.276],
    [0.547, 0.402, 0.613, 0.451, 0.583, 0.563],
    [0.554, 0.666, 0.483, 0.727, 0.458, 0.825],
    [0.438, 0.917, 0.43, 0.973, 0.37, 1.06],
  ];

  function sampleCurve(points, perSegment) {
    const samples = [];
    let [startX, startY] = points[0];
    for (const [handleX1, handleY1, handleX2, handleY2, endX, endY] of points.slice(1)) {
      for (let part = 0; part < perSegment; part += 1) {
        const t = part / perSegment;
        const u = 1 - t;
        samples.push([
          u * u * u * startX + 3 * u * u * t * handleX1 + 3 * u * t * t * handleX2 + t * t * t * endX,
          u * u * u * startY + 3 * u * u * t * handleY1 + 3 * u * t * t * handleY2 + t * t * t * endY,
        ]);
      }
      [startX, startY] = [endX, endY];
    }
    samples.push([startX, startY]);
    return samples;
  }

  // ---------- 雨 ----------
  // 三层雨丝，每层一次描边。地图和开场共用。
  function makeRain(target, density = 1) {
    const pen = target.getContext('2d');
    const layers = [
      { length: 9, speed: 430, alpha: 0.09, share: 0.45 },
      { length: 15, speed: 640, alpha: 0.14, share: 0.35 },
      { length: 24, speed: 900, alpha: 0.2, share: 0.2 },
    ];
    const slant = 0.17;
    let width = 0;
    let height = 0;

    function fit(nextWidth, nextHeight) {
      const ratio = pixelRatio();
      width = nextWidth;
      height = nextHeight;
      target.width = Math.round(width * ratio);
      target.height = Math.round(height * ratio);
      pen.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(170, (width * height) / 4600) * density;
      for (const layer of layers) {
        layer.drops = Array.from({ length: Math.round(count * layer.share) }, () => [
          Math.random() * (width + height * slant),
          Math.random() * (height + layer.length),
        ]);
      }
    }

    function step(seconds) {
      for (const layer of layers) {
        const fall = layer.speed * seconds;
        for (const drop of layer.drops ?? []) {
          drop[1] += fall;
          drop[0] -= fall * slant;
          if (drop[1] > height + layer.length) {
            drop[0] = Math.random() * (width + height * slant);
            drop[1] = -layer.length;
          }
        }
      }
    }

    function draw() {
      pen.lineWidth = 1;
      pen.lineCap = 'round';
      for (const layer of layers) {
        pen.strokeStyle = `rgba(178, 204, 214, ${layer.alpha})`;
        pen.beginPath();
        for (const [x, y] of layer.drops ?? []) {
          pen.moveTo(x, y);
          pen.lineTo(x - layer.length * slant, y + layer.length);
        }
        pen.stroke();
      }
    }

    return { pen, fit, step, draw, clear: () => pen.clearRect(0, 0, width, height) };
  }

  // 给开场用：一块独立的雨幕，返回停止函数。
  function rainLayer(target) {
    if (!target?.getContext || still.matches) return () => {};
    const rain = makeRain(target, 1.15);
    let alive = true;
    let last = 0;
    const fit = () => {
      const { width, height } = target.getBoundingClientRect();
      if (width > 0 && height > 0) rain.fit(width, height);
    };
    const watcher = new ResizeObserver(fit);
    watcher.observe(target);
    fit();
    const frame = (now) => {
      if (!alive) return;
      rain.step(Math.min(0.05, (now - last) / 1000));
      last = now;
      rain.clear();
      rain.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame((now) => { last = now; frame(now); });
    return () => {
      alive = false;
      watcher.disconnect();
    };
  }

  if (!surface || !context) {
    window.TerminalRadioMap = { drive: () => Promise.resolve(), preview() {}, clear() {}, rainLayer };
    return;
  }

  // ---------- 底图 ----------
  let width = 0;
  let height = 0;

  function drawSurvey() {
    const box = surface.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    width = box.width;
    height = box.height;

    const ratio = pixelRatio();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const ground = context.createLinearGradient(0, 0, width, height);
    ground.addColorStop(0, '#1b2123');
    ground.addColorStop(0.55, '#171c1e');
    ground.addColorStop(1, '#1a1f20');
    context.fillStyle = ground;
    context.fillRect(0, 0, width, height);

    drawGrid();
    drawContourHill(0.03, 0.15, 0.29, 0.4, 12, 1);
    drawContourHill(0.1, 0.85, 0.3, 0.44, 11, 3);
    drawContourHill(0.94, 0.23, 0.27, 0.36, 12, 2);
    drawContourHill(0.85, 0.81, 0.29, 0.44, 13, 4);
    drawRiver();
    drawStationGlow();
    drawRoutes();
    drawVignette();
    drawSurveyCorners();
    return true;
  }

  function drawGrid() {
    const spacing = width < 430 ? 25 : 34;
    context.lineWidth = 1;
    for (let x = spacing, line = 1; x < width; x += spacing, line += 1) {
      context.strokeStyle = line % 4 ? '#93a8a50d' : '#93a8a51c';
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, 0);
      context.lineTo(Math.round(x) + 0.5, height);
      context.stroke();
    }
    for (let y = spacing, line = 1; y < height; y += spacing, line += 1) {
      context.strokeStyle = line % 4 ? '#93a8a50d' : '#93a8a51c';
      context.beginPath();
      context.moveTo(0, Math.round(y) + 0.5);
      context.lineTo(width, Math.round(y) + 0.5);
      context.stroke();
    }
  }

  function drawContourHill(centerX, centerY, extentX, extentY, rings, phase) {
    for (let ring = 1; ring <= rings; ring += 1) {
      const radius = 0.15 + (ring / rings) * 0.85;
      context.beginPath();
      for (let part = 0; part <= 112; part += 1) {
        const direction = (part / 112) * Math.PI * 2;
        const bend = 1 + 0.13 * Math.sin(direction * 3 + phase + ring * 0.16)
          + 0.075 * Math.cos(direction * 5 - phase * 0.5 + ring * 0.1)
          + 0.027 * Math.sin(direction * 9 + phase);
        const x = (centerX + radius * extentX * Math.cos(direction) * bend) * width;
        const y = (centerY + radius * extentY * Math.sin(direction) * bend) * height;
        if (part === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.lineWidth = ring % 5 === 0 ? 1 : 0.75;
      context.strokeStyle = ring % 5 === 0 ? '#9fb0a638' : '#95a59c20';
      context.stroke();
    }
  }

  function traceBank(path, points, join = false) {
    const [[startX, startY], ...curves] = points;
    if (join) path.lineTo(startX * width, startY * height);
    else path.moveTo(startX * width, startY * height);
    for (const [handleX1, handleY1, handleX2, handleY2, endX, endY] of curves) {
      path.bezierCurveTo(handleX1 * width, handleY1 * height, handleX2 * width, handleY2 * height, endX * width, endY * height);
    }
  }

  function drawRiver() {
    const waterShape = new Path2D();
    traceBank(waterShape, westBank);
    traceBank(waterShape, eastBank, true);
    waterShape.closePath();

    const water = context.createLinearGradient(width * 0.36, height * 0.9, width * 0.82, height * 0.1);
    water.addColorStop(0, '#1b3138');
    water.addColorStop(0.5, '#20414a');
    water.addColorStop(1, '#1c343c');
    context.fillStyle = water;
    context.fill(waterShape);

    context.save();
    context.clip(waterShape);
    for (const [offset, color] of [[-0.023, '#a9d2dc1c'], [0.014, '#a9d2dc2e'], [0.028, '#a9d2dc16']]) {
      context.strokeStyle = color;
      context.lineWidth = 0.8;
      context.beginPath();
      const [[startX, startY], ...curves] = midstream;
      context.moveTo((startX + offset) * width, startY * height);
      for (const [handleX1, handleY1, handleX2, handleY2, endX, endY] of curves) {
        context.bezierCurveTo((handleX1 + offset) * width, handleY1 * height, (handleX2 + offset) * width, handleY2 * height, (endX + offset) * width, endY * height);
      }
      context.stroke();
    }
    context.restore();

    const banks = new Path2D();
    traceBank(banks, westBank);
    traceBank(banks, eastBank);
    context.lineWidth = 5;
    context.strokeStyle = '#7fb0bd1a';
    context.stroke(banks);
    context.lineWidth = 1;
    context.strokeStyle = '#8fbccb70';
    context.stroke(banks);

    // 河堤的短齿线，朝背水一侧。
    context.strokeStyle = '#8fbccb3d';
    context.lineWidth = 1;
    context.beginPath();
    for (const [bank, side] of [[westBank, -1], [eastBank, -1]]) {
      const samples = sampleCurve(bank, 26);
      for (let index = 1; index < samples.length - 1; index += 1) {
        const [x, y] = samples[index];
        const tangentX = (samples[index + 1][0] - samples[index - 1][0]) * width;
        const tangentY = (samples[index + 1][1] - samples[index - 1][1]) * height;
        const reach = Math.hypot(tangentX, tangentY) || 1;
        const normalX = (-tangentY / reach) * side;
        const normalY = (tangentX / reach) * side;
        context.moveTo(x * width + normalX * 3, y * height + normalY * 3);
        context.lineTo(x * width + normalX * 7.5, y * height + normalY * 7.5);
      }
    }
    context.stroke();
  }

  function drawStationGlow() {
    for (const [x, y] of Object.values(stations)) {
      const reach = Math.max(54, Math.min(width, height) * 0.2);
      const glow = context.createRadialGradient(x * width, y * height, 0, x * width, y * height, reach);
      glow.addColorStop(0, '#ffc46321');
      glow.addColorStop(1, '#ffc46300');
      context.fillStyle = glow;
      context.fillRect(x * width - reach, y * height - reach, reach * 2, reach * 2);
    }
  }

  function drawRoutes() {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const route of routes) {
      context.beginPath();
      route.forEach(([x, y], point) => {
        if (point === 0) context.moveTo(x * width, y * height);
        else context.lineTo(x * width, y * height);
      });
      context.lineWidth = 5;
      context.strokeStyle = '#0e1112cc';
      context.stroke();
      context.lineWidth = 1.7;
      context.strokeStyle = '#c9a45c8f';
      context.stroke();
      context.lineWidth = 0.8;
      context.strokeStyle = '#ffd995b3';
      context.setLineDash([2, 6]);
      context.stroke();
      context.setLineDash([]);
    }

    const bridgeStart = [0.535 * width, 0.5315 * height];
    const bridgeEnd = [0.626 * width, 0.538 * height];
    for (const shift of [-3.5, 3.5]) {
      context.strokeStyle = '#d8d2bc8c';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(bridgeStart[0], bridgeStart[1] + shift);
      context.lineTo(bridgeEnd[0], bridgeEnd[1] + shift);
      context.stroke();
    }
  }

  function drawVignette() {
    const shade = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
    shade.addColorStop(0, '#0c0f1000');
    shade.addColorStop(1, '#0c0f1099');
    context.fillStyle = shade;
    context.fillRect(0, 0, width, height);
  }

  function drawSurveyCorners() {
    const inset = 11;
    const size = 10;
    context.lineWidth = 1;
    context.strokeStyle = '#c6b69052';
    for (const [x, y, xDirection, yDirection] of [
      [inset, inset, 1, 1],
      [width - inset, inset, -1, 1],
      [inset, height - inset, 1, -1],
      [width - inset, height - inset, -1, -1],
    ]) {
      context.beginPath();
      context.moveTo(x, y + yDirection * size);
      context.lineTo(x, y);
      context.lineTo(x + xDirection * size, y);
      context.stroke();
    }
  }

  // ---------- 动态层：雨、水面雨圈、派车 ----------
  const live = document.createElement('canvas');
  live.className = 'survey-live';
  live.setAttribute('aria-hidden', 'true');
  canvas.after(live);
  const rain = makeRain(live);
  const pen = rain.pen;
  const riverLine = sampleCurve(midstream, 12);
  const ripples = [];
  let rippleDebt = 0;
  let preview = null;
  let drive = null;
  let running = false;
  let onScreen = true;
  let last = 0;

  function stepRipples(seconds) {
    rippleDebt += seconds * 7;
    while (rippleDebt > 1) {
      rippleDebt -= 1;
      const [x, y] = riverLine[Math.floor(Math.random() * riverLine.length)];
      if (y > 0.02 && y < 0.98) ripples.push({ x: x + (Math.random() - 0.5) * 0.06, y, age: 0, life: 0.7 + Math.random() * 0.5 });
    }
    pen.lineWidth = 1;
    for (let index = ripples.length - 1; index >= 0; index -= 1) {
      const ripple = ripples[index];
      ripple.age += seconds;
      const t = ripple.age / ripple.life;
      if (t >= 1) {
        ripples.splice(index, 1);
        continue;
      }
      pen.strokeStyle = `rgba(175, 214, 224, ${0.3 * (1 - t)})`;
      pen.beginPath();
      pen.ellipse(ripple.x * width, ripple.y * height, 2 + t * 9, 1 + t * 3.6, 0, 0, Math.PI * 2);
      pen.stroke();
    }
  }

  // 选中地点后，把救援车要走的路线点亮成一条行进中的虚线。
  function drawPreview(now) {
    if (!preview || drive) return;
    const fade = still.matches ? 1 : Math.min(1, (now - preview.since) / 260);
    pen.save();
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
    pen.beginPath();
    preview.path.forEach(([x, y], index) => {
      if (index) pen.lineTo(x * width, y * height);
      else pen.moveTo(x * width, y * height);
    });
    pen.strokeStyle = `rgba(255, 217, 149, ${0.15 * fade})`;
    pen.lineWidth = 8;
    pen.stroke();
    pen.setLineDash([3, 9]);
    pen.lineDashOffset = still.matches ? 0 : -(now / 36);
    pen.strokeStyle = `rgba(255, 228, 176, ${0.92 * fade})`;
    pen.lineWidth = 2.2;
    pen.stroke();
    pen.restore();
  }

  function drawDrive(now) {
    if (!drive) return;
    const points = drive.path.map(([x, y]) => [x * width, y * height]);
    const reach = [0];
    for (let index = 1; index < points.length; index += 1) {
      reach.push(reach[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
    }
    const elapsed = now - drive.start;
    const t = Math.min(1, elapsed / drive.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    const travelled = reach.at(-1) * eased;

    // 压暗底图，让车灯亮出来。到站后慢慢放开。
    const settle = drive.arrivedAt ? Math.min(1, (now - drive.arrivedAt) / 900) : 0;
    const dim = Math.min(1, elapsed / 320) * (0.5 - settle * 0.3);
    pen.fillStyle = `rgba(8, 10, 11, ${dim})`;
    pen.fillRect(0, 0, width, height);

    let segment = 1;
    while (segment < points.length - 1 && reach[segment] < travelled) segment += 1;
    const span = reach[segment] - reach[segment - 1] || 1;
    const along = Math.min(1, Math.max(0, (travelled - reach[segment - 1]) / span));
    const headX = points[segment - 1][0] + (points[segment][0] - points[segment - 1][0]) * along;
    const headY = points[segment - 1][1] + (points[segment][1] - points[segment - 1][1]) * along;
    const heading = Math.atan2(points[segment][1] - points[segment - 1][1], points[segment][0] - points[segment - 1][0]);

    pen.save();
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
    pen.beginPath();
    pen.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < segment; index += 1) pen.lineTo(points[index][0], points[index][1]);
    pen.lineTo(headX, headY);
    pen.shadowColor = '#ffc463';
    pen.shadowBlur = 12;
    pen.strokeStyle = '#ffd995';
    pen.lineWidth = 2.6;
    pen.stroke();
    pen.restore();

    if (t < 1) {
      pen.save();
      pen.translate(headX, headY);
      pen.rotate(heading);
      const beam = pen.createLinearGradient(0, 0, 58, 0);
      beam.addColorStop(0, 'rgba(255, 236, 196, 0.5)');
      beam.addColorStop(1, 'rgba(255, 236, 196, 0)');
      pen.fillStyle = beam;
      pen.beginPath();
      pen.moveTo(0, 0);
      pen.lineTo(58, -19);
      pen.lineTo(58, 19);
      pen.closePath();
      pen.fill();
      pen.restore();
    }
    const halo = pen.createRadialGradient(headX, headY, 0, headX, headY, 20);
    halo.addColorStop(0, 'rgba(255, 244, 220, 0.95)');
    halo.addColorStop(0.25, 'rgba(255, 207, 122, 0.6)');
    halo.addColorStop(1, 'rgba(255, 196, 99, 0)');
    pen.fillStyle = halo;
    pen.beginPath();
    pen.arc(headX, headY, 20, 0, Math.PI * 2);
    pen.fill();

    if (t >= 1) {
      drive.arrivedAt ??= now;
      const since = now - drive.arrivedAt;
      for (const delay of [0, 260]) {
        const ring = (since - delay) / 700;
        if (ring <= 0 || ring >= 1) continue;
        pen.strokeStyle = `rgba(255, 217, 149, ${0.75 * (1 - ring)})`;
        pen.lineWidth = 2;
        pen.beginPath();
        pen.arc(headX, headY, 14 + ring * 44, 0, Math.PI * 2);
        pen.stroke();
      }
      if (since > 620 && drive.resolve) {
        drive.resolve();
        drive.resolve = null;
      }
    }
  }

  function frame(now) {
    if (!running) return;
    const seconds = Math.min(0.05, (now - last) / 1000);
    last = now;
    rain.clear();
    if (!still.matches) {
      rain.step(seconds);
      stepRipples(seconds);
    }
    drawPreview(now);
    drawDrive(now);
    if (!still.matches) rain.draw();
    // 减弱动态时只在派车轨迹需要重画时继续。
    if (still.matches && (!drive || !drive.resolve)) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  function wake() {
    if (running || !width) return;
    if (still.matches ? !drive : !onScreen && !drive) return;
    running = true;
    requestAnimationFrame((now) => {
      last = now;
      frame(now);
    });
  }

  // 不跑动画时（减弱动态、地图在屏幕外）把静止的路线和轨迹画一遍。
  function paintStill() {
    if (running || !width) return;
    rain.clear();
    drawPreview(performance.now());
    drawDrive(performance.now());
  }

  function redraw() {
    if (!drawSurvey()) return;
    rain.fit(width, height);
    paintStill();
    wake();
  }

  new ResizeObserver(redraw).observe(surface);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) wake();
    else if (!drive?.resolve) running = false;
  }).observe(surface);
  still.addEventListener('change', () => {
    paintStill();
    wake();
  });
  redraw();

  window.TerminalRadioMap = {
    // 播放救援车驶向目的地。到站后 resolve，轨迹保留到 clear()。
    // 预览去某个地点的路线，传 null 取消。
    preview(location) {
      const plan = drives[location];
      preview = plan ? { path: plan.path, since: performance.now() } : null;
      paintStill();
      wake();
    },
    drive(location) {
      const plan = drives[location];
      preview = null;
      if (drive?.resolve) drive.resolve();
      if (!plan || !width) return Promise.resolve();
      return new Promise((resolve) => {
        const instant = still.matches;
        drive = {
          path: plan.path,
          duration: instant ? 1 : plan.duration,
          start: performance.now() - (instant ? 5000 : 0),
          arrivedAt: instant ? performance.now() - 5000 : null,
          resolve,
        };
        if (instant) {
          rain.clear();
          drawDrive(performance.now());
          drive.resolve?.();
          drive.resolve = null;
          return;
        }
        wake();
      });
    },
    clear() {
      if (drive?.resolve) drive.resolve();
      drive = null;
      preview = null;
      paintStill();
      wake();
    },
    rainLayer,
  };
})();
