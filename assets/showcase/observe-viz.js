/* Under-the-hood app preview — Standby ↔ Detailed view + stream toggles */
(function () {
  var root = document.getElementById('obsPanel');
  if (!root) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var state = { cameras: true, depth: true, signals: true };
  var mode = 'observe';
  var recording = false;
  var recStarted = 0;
  var standbyBase = 12.4;

  var timerEl = document.getElementById('obsTimer');
  var standbyClock = document.getElementById('obsStandbyClock');
  var emptyEl = root.querySelector('.obs-empty');
  var standbyVideo = document.getElementById('obsStandbyVideo');

  function fmtRec(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function fmtStandby(sec) {
    var whole = Math.floor(sec);
    var frac = Math.floor((sec - whole) * 10);
    var m = Math.floor(whole / 60);
    var r = whole % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r + '.' + frac;
  }

  function tickClocks() {
    if (mode === 'standby' && standbyClock) {
      var t = standbyBase + ((Date.now() / 1000) % 47) * 0.02;
      standbyClock.textContent = fmtStandby(t);
    }
    if (mode === 'observe' && timerEl) {
      var elapsed = recording ? Date.now() - recStarted : 0;
      timerEl.textContent = fmtRec(elapsed);
    }
  }
  tickClocks();
  if (!reduce) setInterval(tickClocks, 100);

  function syncToggleInputs() {
    root.querySelectorAll('[data-obs-toggle]').forEach(function (input) {
      var key = input.getAttribute('data-obs-toggle');
      input.checked = !!state[key];
    });
  }

  function applyLayout() {
    var key =
      (state.cameras ? 'C' : '') +
      (state.depth ? 'D' : '') +
      (state.signals ? 'S' : '');
    root.setAttribute('data-cameras', state.cameras ? 'on' : 'off');
    root.setAttribute('data-depth', state.depth ? 'on' : 'off');
    root.setAttribute('data-signals', state.signals ? 'on' : 'off');
    root.setAttribute('data-layout', key || 'none');
    syncToggleInputs();

    root.querySelectorAll('.obs-pane[data-stream]').forEach(function (pane) {
      var stream = pane.getAttribute('data-stream');
      var on = !!state[stream];
      pane.hidden = !on;
      pane.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    if (emptyEl) emptyEl.hidden = key !== '';
    syncMedia();
  }

  function playEl(v) {
    if (!v || reduce) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }

  function syncMedia() {
    if (standbyVideo) {
      if (mode === 'standby' && !reduce) playEl(standbyVideo);
      else standbyVideo.pause();
    }

    root.querySelectorAll('.obs-pane video').forEach(function (v) {
      var pane = v.closest('.obs-pane');
      var on = mode === 'observe' && pane && !pane.hidden;
      if (on) playEl(v);
      else v.pause();
    });
  }

  function setMode(next) {
    if (next !== 'standby' && next !== 'observe') return;
    mode = next;
    root.setAttribute('data-mode', mode);

    root.querySelectorAll('[data-obs-mode]').forEach(function (btn) {
      var selected = btn.getAttribute('data-obs-mode') === mode;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    if (mode === 'observe') {
      recording = true;
      recStarted = Date.now();
      root.querySelectorAll('.obs-pane video').forEach(function (v) {
        try { v.currentTime = 0; } catch (e) {}
      });
    } else {
      recording = false;
    }

    applyLayout();
    tickClocks();
  }

  root.querySelectorAll('[data-obs-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setMode(btn.getAttribute('data-obs-mode'));
    });
  });

  var recordBtn = document.getElementById('obsRecordBtn');
  if (recordBtn) {
    recordBtn.addEventListener('click', function () {
      setMode('observe');
    });
  }

  var stopBtn = document.getElementById('obsStopBtn');
  if (stopBtn) {
    stopBtn.addEventListener('click', function () {
      setMode('standby');
    });
  }

  root.querySelectorAll('[data-obs-toggle]').forEach(function (input) {
    input.addEventListener('change', function () {
      var key = input.getAttribute('data-obs-toggle');
      state[key] = input.checked;
      applyLayout();
    });
  });

  setMode('observe');

  function sizeCanvas(canvas) {
    var r = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.floor(r.width));
    var h = Math.max(1, Math.floor(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function sampleSeries(times, values, t) {
    if (!times || !times.length) return null;
    if (t <= times[0]) return values[0];
    if (t >= times[times.length - 1]) return values[values.length - 1];
    var lo = 0, hi = times.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid; else hi = mid;
    }
    var span = times[hi] - times[lo] || 1;
    var f = (t - times[lo]) / span;
    var a = values[lo], b = values[hi];
    if (typeof a === 'number') return a + (b - a) * f;
    if (Array.isArray(a)) {
      return a.map(function (v, i) { return v + (b[i] - v) * f; });
    }
    return a;
  }

  function streamRate(EP, key, fallback) {
    var streams = (EP.integrity && EP.integrity.streams) || [];
    for (var i = 0; i < streams.length; i++) {
      if (streams[i].key === key) {
        var s = streams[i];
        var span = Math.max(0.001, (s.last || EP.duration_s || 1) - (s.first || 0));
        return s.count / span;
      }
    }
    var spans = EP.integrity && EP.integrity.spans;
    if (spans && spans[key]) {
      var sp = spans[key];
      var d = Math.max(0.001, sp.last - sp.first);
      return sp.count / d;
    }
    return fallback;
  }

  function fpsAt(base, t, seed) {
    /* Mild variation around measured stream rate — not IMU. */
    var wobble =
      Math.sin(t * 6.2 + seed) * 0.35 +
      Math.sin(t * 13.7 + seed * 1.7) * 0.18 +
      Math.sin(t * 2.1 + seed * 0.4) * 0.22;
    var drop = ((Math.sin(t * 0.7 + seed) + 1) * 0.5) > 0.94 ? 1.6 : 0;
    return Math.max(base * 0.72, base + wobble - drop);
  }

  function drawFps(canvas, valueEl, base, t, colour) {
    if (!canvas || !canvas.closest('.obs-pane') || canvas.closest('.obs-pane').hidden) return;
    if (mode !== 'observe') return;
    var s = sizeCanvas(canvas);
    var ctx = s.ctx, W = s.w, H = s.h;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1720';
    ctx.fillRect(0, 0, W, H);

    var pad = 8;
    var win = 1.6;
    var n = 48;
    var pts = [];
    var i;
    for (i = 0; i <= n; i++) {
      var u = i / n;
      var tt = t - win * (1 - u);
      if (tt < 0) tt += 1000;
      pts.push(fpsAt(base, tt, base * 0.17));
    }
    var live = pts[pts.length - 1];
    if (valueEl) valueEl.textContent = live.toFixed(1);

    var min = base - 5, max = base + 3;
    ctx.strokeStyle = 'rgba(236,226,207,0.06)';
    ctx.beginPath();
    ctx.moveTo(pad, H * 0.35);
    ctx.lineTo(W - pad, H * 0.35);
    ctx.stroke();

    ctx.beginPath();
    for (i = 0; i < pts.length; i++) {
      var x = pad + (i / (pts.length - 1)) * (W - pad * 2);
      var y = H - pad - ((pts[i] - min) / (max - min)) * (H - pad * 2.4);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = colour;
    ctx.beginPath();
    var lx = pad + (W - pad * 2);
    var ly = H - pad - ((live - min) / (max - min)) * (H - pad * 2.4);
    ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTactile(canvas, EP, t, fullScale) {
    if (!canvas || !canvas.closest('.obs-pane') || canvas.closest('.obs-pane').hidden) return;
    if (mode !== 'observe') return;
    var s = sizeCanvas(canvas);
    var ctx = s.ctx, W = s.w, H = s.h;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1720';
    ctx.fillRect(0, 0, W, H);

    var pad = 8;
    var cols = EP.colours || ['#e08a94', '#7f9e7f', '#6b8b98', '#a9a6d8', '#e8a44a'];
    var names = EP.tactile.names || ['S1', 'S2', 'S3', 'S4', 'S5'];
    var chInfo = EP.tactile.channels || [];
    var win = 1.2;
    var t0 = Math.max(0, t - win);
    var times = EP.tactile.t;
    var raw = EP.tactile.raw;
    var i0 = 0, i1 = times.length - 1;
    var i;
    for (i = 0; i < times.length; i++) {
      if (times[i] < t0) i0 = i;
      if (times[i] <= t) i1 = i;
    }

    var plotTop = 18;
    var plotH = H - plotTop - 16;
    for (var c = 0; c < 5; c++) {
      var dead = chInfo[c] && chInfo[c].dead;
      ctx.beginPath();
      for (i = i0; i <= i1; i++) {
        var u = (times[i] - t0) / win;
        var x = pad + u * (W - pad * 2);
        var v = Math.max(0, Math.min(1, (raw[i][c] || 0) / fullScale));
        var y = plotTop + plotH * (1 - v);
        if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = cols[c];
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = dead ? 0.28 : 0.9;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    var live = sampleSeries(times, raw, t) || [0, 0, 0, 0, 0];
    ctx.font = '8px Geist Mono, ui-monospace, monospace';
    var x0 = pad;
    for (c = 0; c < 5; c++) {
      ctx.fillStyle = cols[c];
      ctx.fillText(names[c], x0, H - 5);
      x0 += 28;
    }
    var sum = live.reduce(function (a, b) { return a + b; }, 0) / fullScale;
    ctx.fillStyle = 'rgba(236,226,207,0.55)';
    ctx.fillText('Σ ' + sum.toFixed(2), W - pad - 40, 12);
  }

  function makeGlove(EP) {
    var canvas = document.getElementById('obsGloveViz');
    var host = document.getElementById('obsGloveCh');
    if (!canvas || !host) return function () {};

    var FULL = EP.fullScale || 4095;
    var COLOURS = EP.colours || ['#e08a94', '#7f9e7f', '#6b8b98', '#a9a6d8', '#e8a44a'];
    var FINGERS = EP.fingers || [];
    var HW = (EP.handSpace && EP.handSpace[0]) || 360;
    var HH = (EP.handSpace && EP.handSpace[1]) || 526;
    var fingers = EP.channelFingers || ['thumb', 'index', 'middle', 'ring', 'pinky'];
    var chInfo = EP.tactile.channels || [];
    var smooth = [0, 0, 0, 0, 0];
    var scratch = {
      mask: document.createElement('canvas'),
      heat: document.createElement('canvas'),
      body: document.createElement('canvas')
    };
    scratch.mask.width = scratch.heat.width = scratch.body.width = HW;
    scratch.mask.height = scratch.heat.height = scratch.body.height = HH;

    host.innerHTML = '';
    var rows = COLOURS.map(function (colour, ch) {
      var info = chInfo[ch] || {};
      var row = document.createElement('div');
      row.className = 'ch' + (info.dead ? ' dead' : '');
      row.innerHTML =
        '<div class="label"><span class="swatch"></span></div><div class="val">0</div>' +
        '<div class="track"><div class="bar"></div></div>';
      row.querySelector('.swatch').style.background = colour;
      row.querySelector('.label').appendChild(
        document.createTextNode('S' + (ch + 1) + ' · ' + (fingers[ch] || ('ch' + (ch + 1))))
      );
      row.querySelector('.bar').style.background = colour;
      host.appendChild(row);
      return { val: row.querySelector('.val'), bar: row.querySelector('.bar') };
    });

    var grasp = document.createElement('div');
    grasp.className = 'grasp';
    grasp.innerHTML =
      '<div class="k">Grasp load</div><div class="row"><div class="v">0%</div><div class="tag">idle</div></div>';
    host.appendChild(grasp);
    var graspVal = grasp.querySelector('.v');
    var graspTag = grasp.querySelector('.tag');

    var maskImg = new Image();
    var maskReady = false;
    maskImg.onload = function () { maskReady = true; };
    maskImg.src = EP.mask || 'assets/showcase/hand-mask.png';

    function axis(f, u) {
      return [
        f.a[0] + (f.b[0] - f.a[0]) * u,
        f.a[1] + (f.b[1] - f.a[1]) * u
      ];
    }

    function blob(hc, x, y, r, v, mul) {
      if (!isFinite(x) || !isFinite(y) || !(r > 0)) return;
      var g = hc.createRadialGradient(x, y, 0, x, y, r);
      var a = (0.22 + 0.78 * v) * mul;
      g.addColorStop(0, 'rgba(255,' + Math.round(238 - 70 * (1 - v)) + ',' + Math.round(215 - 170 * v) + ',' + a + ')');
      g.addColorStop(0.24, 'rgba(' + Math.round(238 + 17 * v) + ',' + Math.round(128 + 45 * v) + ',' + Math.round(80 + 25 * v) + ',' + (a * 0.7) + ')');
      g.addColorStop(0.58, 'rgba(150,88,175,' + (a * 0.3) + ')');
      g.addColorStop(1, 'rgba(70,70,160,0)');
      hc.fillStyle = g;
      hc.beginPath();
      hc.arc(x, y, r, 0, Math.PI * 2);
      hc.fill();
    }

    return function draw(t, dt) {
      var pane = canvas.closest('.obs-pane');
      if (!pane || pane.hidden || mode !== 'observe') return;

      var raw = sampleSeries(EP.tactile.t, EP.tactile.raw, t) || [0, 0, 0, 0, 0];
      var c;
      for (c = 0; c < 5; c++) {
        var target = Math.max(0, Math.min(1, raw[c] / FULL));
        var k = 1 - Math.exp(-Math.max(dt || 0.05, 0) * 9);
        var next = smooth[c] + (target - smooth[c]) * k;
        smooth[c] = isFinite(next) ? next : target;
        rows[c].val.textContent = Math.round(raw[c]).toString();
        rows[c].bar.style.width = ((raw[c] / FULL) * 100).toFixed(1) + '%';
      }
      var load = Math.max.apply(null, smooth);
      graspVal.textContent = Math.round(load * 100) + '%';
      graspTag.textContent =
        load < 0.02 ? 'idle' : load < 0.3 ? 'contact' : load < 0.7 ? 'firm grip' : 'saturated';

      var box = canvas.parentElement.getBoundingClientRect();
      if (canvas.width !== Math.round(box.width * dpr)) canvas.width = Math.max(1, Math.round(box.width * dpr));
      if (canvas.height !== Math.round(box.height * dpr)) canvas.height = Math.max(1, Math.round(box.height * dpr));
      var ctx = canvas.getContext('2d');
      var w = box.width, h = box.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!maskReady) return;

      var mc = scratch.mask.getContext('2d');
      mc.clearRect(0, 0, HW, HH);
      mc.drawImage(maskImg, 0, 0, HW, HH);

      var bc = scratch.body.getContext('2d');
      bc.globalCompositeOperation = 'source-over';
      bc.clearRect(0, 0, HW, HH);
      var skin = bc.createLinearGradient(40, 20, 340, 500);
      skin.addColorStop(0, '#2e2b3c');
      skin.addColorStop(0.5, '#272533');
      skin.addColorStop(1, '#1e1c28');
      bc.fillStyle = skin;
      bc.fillRect(0, 0, HW, HH);
      bc.globalCompositeOperation = 'destination-in';
      bc.drawImage(scratch.mask, 0, 0);
      bc.globalCompositeOperation = 'source-over';

      var hc = scratch.heat.getContext('2d');
      hc.globalCompositeOperation = 'source-over';
      hc.clearRect(0, 0, HW, HH);
      hc.globalCompositeOperation = 'lighter';
      FINGERS.forEach(function (f, fi) {
        var v = Math.min(1, smooth[f.ch]);
        if (v < 0.004) return;
        var tip = axis(f, 0.92);
        var pulse = 1 + 0.035 * Math.sin(t * 3.1 + fi * 1.7) * v;
        var r = (22 + 84 * Math.pow(v, 0.68)) * pulse;
        blob(hc, tip[0], tip[1], r, v, 1);
        var down = axis(f, Math.max(0, 0.9 - 0.48 * v));
        blob(hc, down[0], down[1], r * 0.72, v * 0.85, 0.5 * v + 0.12);
        if (v > 0.25) {
          var kn = axis(f, 0.22);
          blob(hc, kn[0], kn[1], r * 0.6, v * 0.65, (v - 0.25) * 0.5);
        }
      });
      if (load > 0.05) {
        var g = hc.createRadialGradient(160, 415, 0, 160, 415, 62 + 100 * load);
        g.addColorStop(0, 'rgba(215,110,120,' + (0.16 * load) + ')');
        g.addColorStop(1, 'rgba(90,70,160,0)');
        hc.fillStyle = g;
        hc.beginPath();
        hc.arc(160, 415, 62 + 100 * load, 0, Math.PI * 2);
        hc.fill();
      }
      hc.globalCompositeOperation = 'destination-in';
      hc.drawImage(scratch.mask, 0, 0);
      hc.globalCompositeOperation = 'source-over';

      var scale = Math.min(w / HW, h / HH) * 0.9;
      ctx.save();
      ctx.translate(w / 2 - (HW / 2) * scale, h / 2 - (HH / 2) * scale);
      ctx.scale(scale, scale);
      if (load > 0.02) {
        var bg = ctx.createRadialGradient(170, 280, 0, 170, 280, 250);
        bg.addColorStop(0, 'rgba(232,164,74,' + (0.1 * load) + ')');
        bg.addColorStop(0.5, 'rgba(169,166,216,' + (0.06 * load) + ')');
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg;
        ctx.fillRect(-60, -60, 480, 660);
      }
      ctx.drawImage(scratch.body, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.drawImage(scratch.heat, 0, 0);
      ctx.restore();
      FINGERS.forEach(function (f) {
        var v = smooth[f.ch];
        var tip = axis(f, 0.92);
        ctx.beginPath();
        ctx.arc(tip[0], tip[1], 3.4 + 2.6 * v, 0, Math.PI * 2);
        ctx.fillStyle = COLOURS[f.ch];
        ctx.globalAlpha = 0.45 + 0.55 * v;
        ctx.fill();
        ctx.globalAlpha = 1;
      });
      ctx.restore();
    };
  }

  fetch('assets/showcase/episode.json')
    .then(function (r) { return r.json(); })
    .then(boot)
    .catch(function (err) { console.warn('observe episode failed', err); });

  function boot(EP) {
    var DUR = Math.max(0.001, EP.duration_s || 3.3);
    var FULL = EP.fullScale || 4095;
    var headFps = streamRate(EP, 'head', 30);
    var wlFps = streamRate(EP, 'wrist_left', 24.5);
    var wrFps = streamRate(EP, 'wrist_right', 24.5);

    var headCanvas = document.getElementById('obsHeadFps');
    var wlCanvas = document.getElementById('obsWristLFps');
    var wrCanvas = document.getElementById('obsWristRFps');
    var tactCanvas = document.getElementById('obsTactile');
    var headVal = document.getElementById('obsHeadFpsVal');
    var wlVal = document.getElementById('obsWristLFpsVal');
    var wrVal = document.getElementById('obsWristRFpsVal');
    var drawGlove = makeGlove(EP);

    var headLive = root.querySelector('.obs-pane--head .obs-pane-live');
    if (headLive) headLive.textContent = Math.round(headFps) + ' Hz · Live';

    root.querySelectorAll('video').forEach(function (v) {
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
    });
    syncMedia();

    var lastT = 0;
    function paint(t) {
      if (mode !== 'observe' || !state.signals) return;
      var dt = Math.max(0.016, Math.min(0.1, t - lastT || 0.04));
      if (t < lastT) dt = 0.04;
      lastT = t;
      drawFps(headCanvas, headVal, headFps, t, '#7BA3B8');
      drawFps(wlCanvas, wlVal, wlFps, t, '#b3ceac');
      drawFps(wrCanvas, wrVal, wrFps, t, '#c9a87a');
      drawTactile(tactCanvas, EP, t, FULL);
      drawGlove(t, dt);
    }

    if (reduce) {
      paint(DUR * 0.4);
      return;
    }

    var start = performance.now();
    var last = 0;
    (function loop(now) {
      var t = ((now - start) / 1000) % DUR;
      if (now - last > 40) {
        last = now;
        paint(t);
      }
      requestAnimationFrame(loop);
    })(start);

    window.addEventListener('resize', function () {
      paint(((performance.now() - start) / 1000) % DUR);
    });
  }
})();
