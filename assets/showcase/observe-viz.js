/* Under-the-hood Observe panel — cameras / depth / signals toggles + episode media */
(function () {
  var root = document.getElementById('obsPanel');
  if (!root) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var state = { cameras: true, depth: true, signals: true };
  var timerEl = document.getElementById('obsTimer');
  var emptyEl = root.querySelector('.obs-empty');
  var t0 = Date.now();

  function fmt(s) {
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function tickClock() {
    if (timerEl) timerEl.textContent = fmt(Math.floor((Date.now() - t0) / 1000));
  }
  tickClock();
  if (!reduce) setInterval(tickClock, 1000);

  function applyLayout() {
    var key =
      (state.cameras ? 'C' : '') +
      (state.depth ? 'D' : '') +
      (state.signals ? 'S' : '');
    root.setAttribute('data-cameras', state.cameras ? 'on' : 'off');
    root.setAttribute('data-depth', state.depth ? 'on' : 'off');
    root.setAttribute('data-signals', state.signals ? 'on' : 'off');
    root.setAttribute('data-layout', key || 'none');

    root.querySelectorAll('.obs-pane[data-stream]').forEach(function (pane) {
      var stream = pane.getAttribute('data-stream');
      var on = !!state[stream];
      pane.hidden = !on;
      pane.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    if (emptyEl) emptyEl.hidden = key !== '';

    root.querySelectorAll('.obs-pane video').forEach(function (v) {
      var pane = v.closest('.obs-pane');
      var on = pane && !pane.hidden;
      if (on && !reduce) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        v.pause();
      }
    });
  }

  root.querySelectorAll('[data-obs-toggle]').forEach(function (input) {
    var key = input.getAttribute('data-obs-toggle');
    input.checked = !!state[key];
    input.addEventListener('change', function () {
      state[key] = input.checked;
      applyLayout();
    });
  });

  applyLayout();

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

  function fingerFlex(joints) {
    if (!joints || joints.length < 19) return [0, 0, 0, 0, 0];
    return [
      Math.max(joints[0], joints[1], joints[2]),
      Math.max(joints[3], joints[4], joints[5]),
      Math.max(joints[6], joints[7], joints[8]),
      Math.max(joints[9], joints[10], joints[11]),
      Math.max(joints[12], joints[13], joints[14])
    ];
  }

  function drawImu(canvas, series, t, labels, colours) {
    if (!canvas || canvas.closest('.obs-pane').hidden) return;
    var s = sizeCanvas(canvas);
    var ctx = s.ctx, W = s.w, H = s.h;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1720';
    ctx.fillRect(0, 0, W, H);

    var pad = 8;
    var win = 0.9;
    var t0w = Math.max(0, t - win);
    var times = series.t;
    var vals = series.v;
    var i0 = 0, i1 = times.length - 1;
    for (var i = 0; i < times.length; i++) {
      if (times[i] < t0w) i0 = i;
      if (times[i] <= t) i1 = i;
    }

    var mid = [0, 0, 0], peak = 0.01;
    var n = Math.max(1, i1 - i0 + 1);
    for (i = i0; i <= i1; i++) {
      for (var a = 0; a < 3; a++) {
        mid[a] += vals[i][a];
        peak = Math.max(peak, Math.abs(vals[i][a]));
      }
    }
    mid[0] /= n; mid[1] /= n; mid[2] /= n;

    var rowH = (H - pad * 2) / 3;
    ctx.font = '8px Geist Mono, ui-monospace, monospace';
    for (a = 0; a < 3; a++) {
      var base = pad + rowH * (a + 0.55);
      ctx.strokeStyle = 'rgba(236,226,207,0.06)';
      ctx.beginPath();
      ctx.moveTo(pad, base);
      ctx.lineTo(W - pad, base);
      ctx.stroke();
      ctx.beginPath();
      for (i = i0; i <= i1; i++) {
        var u = (times[i] - t0w) / win;
        var x = pad + u * (W - pad * 2);
        var y = base - ((vals[i][a] - mid[a]) / peak) * (rowH * 0.38);
        if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colours[a];
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = colours[a];
      ctx.fillText(labels[a], W - pad - 14, base - rowH * 0.28);
    }

    ctx.strokeStyle = 'rgba(236,226,207,0.4)';
    ctx.beginPath();
    ctx.moveTo(W - pad, pad);
    ctx.lineTo(W - pad, H - pad);
    ctx.stroke();
  }

  function drawHand(canvas, EP, t) {
    if (!canvas || canvas.closest('.obs-pane').hidden) return;
    var s = sizeCanvas(canvas);
    var ctx = s.ctx, W = s.w, H = s.h;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1720';
    ctx.fillRect(0, 0, W, H);

    var pad = 10;
    var grip = sampleSeries(EP.hand.t, EP.hand.grip, t) || 0;
    var joints = sampleSeries(EP.hand.t, EP.hand.joint_angles, t) || [];
    var flex = fingerFlex(joints);
    var colours = EP.colours || ['#e08a94', '#7f9e7f', '#6b8b98', '#a9a6d8', '#e8a44a'];

    ctx.fillStyle = 'rgba(236,226,207,0.55)';
    ctx.font = '8px Geist Mono, ui-monospace, monospace';
    ctx.fillText('GRIP', pad, 14);

    var gPct = Math.round(Math.max(0, Math.min(1, grip)) * 100);
    ctx.fillStyle = '#ECE2CF';
    ctx.font = '600 20px Geist, system-ui, sans-serif';
    ctx.fillText(gPct + '%', pad, 38);
    ctx.font = '8px Geist Mono, ui-monospace, monospace';
    ctx.fillStyle = grip > 0.55 ? '#B6E0B0' : 'rgba(236,226,207,0.45)';
    ctx.fillText(grip > 0.7 ? 'GRASP' : grip > 0.4 ? 'CLOSING' : 'REACH', pad, 52);

    var gx0 = pad;
    var gy0 = 62;
    var gw = Math.min(W * 0.36, 110);
    var gh = 20;
    ctx.strokeStyle = 'rgba(232,164,74,0.85)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (var i = 0; i < EP.hand.grip.length; i++) {
      var hx = gx0 + (i / Math.max(1, EP.hand.grip.length - 1)) * gw;
      var hy = gy0 + gh * (1 - EP.hand.grip[i]);
      if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.stroke();

    var names = ['TH', 'IX', 'MD', 'RG', 'PK'];
    var bx = W * 0.42;
    var bw = W * 0.52;
    var barH = Math.max(6, Math.min(9, (H - 28) / 5 - 4));
    for (i = 0; i < 5; i++) {
      var by = 16 + i * (barH + 5);
      var v = Math.max(0, Math.min(1, flex[i] || 0));
      ctx.fillStyle = 'rgba(236,226,207,0.08)';
      ctx.fillRect(bx + 22, by, bw - 22, barH);
      ctx.fillStyle = colours[i];
      ctx.globalAlpha = 0.35 + 0.65 * v;
      ctx.fillRect(bx + 22, by, (bw - 22) * v, barH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(236,226,207,0.55)';
      ctx.font = '8px Geist Mono, ui-monospace, monospace';
      ctx.fillText(names[i], bx, by + barH - 1);
    }
  }

  fetch('assets/showcase/episode.json')
    .then(function (r) { return r.json(); })
    .then(boot)
    .catch(function (err) { console.warn('observe episode failed', err); });

  function boot(EP) {
    var DUR = Math.max(0.001, EP.duration_s || 3.3);
    var accelCanvas = document.getElementById('obsAccel');
    var gyroCanvas = document.getElementById('obsGyro');
    var handCanvas = document.getElementById('obsHand');
    var videos = root.querySelectorAll('.obs-pane video');

    videos.forEach(function (v) {
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      if (!reduce) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        v.pause();
        try { v.currentTime = Math.min(0.4, (v.duration || 1) * 0.2); } catch (e) {}
      }
    });

    var accelCols = ['#cd8b8b', '#b3ceac', '#6f93b0'];
    var gyroCols = ['#c9a87a', '#9aa6c4', '#b6a5c6'];

    if (reduce) {
      drawImu(accelCanvas, { t: EP.head_imu.t, v: EP.head_imu.accel }, DUR * 0.4, ['AX', 'AY', 'AZ'], accelCols);
      drawImu(gyroCanvas, { t: EP.head_imu.t, v: EP.head_imu.gyro }, DUR * 0.4, ['GX', 'GY', 'GZ'], gyroCols);
      drawHand(handCanvas, EP, DUR * 0.4);
      return;
    }

    var start = performance.now();
    var last = 0;
    (function loop(now) {
      var wall = (now - start) / 1000;
      var t = wall % DUR;
      if (now - last > 40) {
        last = now;
        if (state.signals) {
          drawImu(accelCanvas, { t: EP.head_imu.t, v: EP.head_imu.accel }, t, ['AX', 'AY', 'AZ'], accelCols);
          drawImu(gyroCanvas, { t: EP.head_imu.t, v: EP.head_imu.gyro }, t, ['GX', 'GY', 'GZ'], gyroCols);
          drawHand(handCanvas, EP, t);
        }
      }
      requestAnimationFrame(loop);
    })(start);

    window.addEventListener('resize', function () {
      if (!state.signals) return;
      var t = ((performance.now() - start) / 1000) % DUR;
      drawImu(accelCanvas, { t: EP.head_imu.t, v: EP.head_imu.accel }, t, ['AX', 'AY', 'AZ'], accelCols);
      drawImu(gyroCanvas, { t: EP.head_imu.t, v: EP.head_imu.gyro }, t, ['GX', 'GY', 'GZ'], gyroCols);
      drawHand(handCanvas, EP, t);
    });
  }
})();
