/* Modality-card visuals driven by assets/showcase/episode.json */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function sizeCanvas(canvas) {
    var r = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.floor(r.width));
    var h = Math.max(1, Math.floor(r.height));
    var need = canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr);
    if (need) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function loopT(wall, dur) {
    if (!(dur > 0)) return 0;
    var t = wall % dur;
    return t < 0 ? t + dur : t;
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

  function nearestByT(frames, t) {
    if (!frames.length) return null;
    var best = 0, gap = Math.abs(frames[0].t - t);
    for (var i = 1; i < frames.length; i++) {
      var d = Math.abs(frames[i].t - t);
      if (d < gap) { gap = d; best = i; }
    }
    return { frame: frames[best], gap: gap, index: best };
  }

  function decodeLidarFrames(lidar) {
    return lidar.frames.map(function (f) {
      var bin = atob(f.xyz);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { t: f.t, n: f.n, xyz: new Int16Array(bytes.buffer) };
    });
  }

  /* Independent local clocks so each card loops on its own. */
  var clocks = {
    lidar: 0,
    motion: 0,
    touch: 0,
    integrity: 0
  };
  /* Advances only while What we do is on screen; restarted on each enter. */
  var vizActive = false;

  window.__fmDeckViz = {
    restart: function () {
      clocks.lidar = clocks.motion = clocks.touch = clocks.integrity = 0;
    },
    setActive: function (on) {
      vizActive = !!on;
      if (on) this.restart();
    }
  };

  fetch('assets/showcase/episode.json')
    .then(function (r) { return r.json(); })
    .then(boot)
    .catch(function (err) { console.warn('showcase episode failed to load', err); });

  function boot(EP) {
    var DUR = Math.max(0.001, EP.duration_s || 3.3);
    var FULL = EP.fullScale || 4095;
    var COLOURS = EP.colours || ['#e08a94', '#7f9e7f', '#6b8b98', '#a9a6d8', '#e8a44a'];
    var FINGERS = EP.fingers || [];
    var HW = (EP.handSpace && EP.handSpace[0]) || 360;
    var HH = (EP.handSpace && EP.handSpace[1]) || 526;
    var lidarFrames = decodeLidarFrames(EP.lidar);
    var lidarScale = EP.lidar.scale || 0.01;
    var lidarView = { yaw: 0.55, pitch: -0.3, dist: 13 };

    var maskImg = new Image();
    var maskReady = false;
    maskImg.onload = function () { maskReady = true; };
    maskImg.src = EP.mask || 'assets/showcase/hand-mask.png';

    var off = {
      mask: document.createElement('canvas'),
      body: document.createElement('canvas'),
      heat: document.createElement('canvas')
    };
    off.mask.width = off.body.width = off.heat.width = HW;
    off.mask.height = off.body.height = off.heat.height = HH;
    var tactileSmooth = [0, 0, 0, 0, 0];

    /* Wire looping videos — playback is gated by section visibility. */
    document.querySelectorAll('.mod-viz video').forEach(function (v) {
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      if (!reduce && vizActive) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        v.pause();
        if (reduce) {
          try { v.currentTime = Math.min(0.4, (v.duration || 1) * 0.2); } catch (e) {}
        }
      }
    });

    /* Integrity DOM once */
    var intRoot = document.querySelector('.viz-integrity');
    if (intRoot && EP.integrity) {
      var I = EP.integrity;
      intRoot.innerHTML =
        '<div class="viz-int-meta">' +
          '<div><span class="k">DURATION</span><span class="v">' + I.duration_s.toFixed(1) + ' s</span></div>' +
          '<div><span class="k">RATE</span><span class="v">' + I.fps + ' fps</span></div>' +
          '<div><span class="k">CLOCK</span><span class="v">' + I.sync_source + '</span></div>' +
        '</div>' +
        '<div class="viz-int-chart">' +
          '<div class="viz-int-chart-head">' +
            '<span class="k">SYNC OFFSET · TACTILE → CLOCK</span>' +
            '<span class="v mod-sync-live">—</span>' +
          '</div>' +
          '<canvas class="mod-sync-chart" width="280" height="110"></canvas>' +
        '</div>' +
        '<div class="viz-int-foot">' +
          '<span>DROPPED <b class="mod-drop-live">0</b></span>' +
          '<span>P95 <b>' + I.sync_ms.p95.toFixed(1) + '</b> MS</span>' +
          '<span>TACTILE <b>' + I.tactile_rate_hz + '</b> HZ</span>' +
        '</div>';
    }

    function fingerFlex(joints) {
      /* 19 joint angles → 5 finger flexion levels */
      if (!joints || joints.length < 19) return [0, 0, 0, 0, 0];
      return [
        Math.max(joints[0], joints[1], joints[2]),
        Math.max(joints[3], joints[4], joints[5]),
        Math.max(joints[6], joints[7], joints[8]),
        Math.max(joints[9], joints[10], joints[11]),
        Math.max(joints[12], joints[13], joints[14])
      ];
    }

    function axis(f, u) {
      return [f.a[0] + (f.b[0] - f.a[0]) * u, f.a[1] + (f.b[1] - f.a[1]) * u];
    }

    function drawLidar(canvas, t, dt) {
      var s = sizeCanvas(canvas);
      var ctx = s.ctx, W = s.w, H = s.h;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0f0d12';
      ctx.fillRect(0, 0, W, H);
      if (!reduce) lidarView.yaw += dt * 0.18;

      var hit = nearestByT(lidarFrames, t);
      var cy = Math.cos(lidarView.yaw), sy = Math.sin(lidarView.yaw);
      var cp = Math.cos(lidarView.pitch), sp = Math.sin(lidarView.pitch);
      var focal = Math.min(W, H) * 0.95;
      function project(x, y, z) {
        var x1 = x * cy - y * sy, y1 = x * sy + y * cy;
        var y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
        var d = y2 + lidarView.dist;
        if (d < 0.35) return null;
        return [W / 2 + (x1 * focal) / d, H / 2 - (z2 * focal) / d, d];
      }
      ctx.strokeStyle = 'rgba(90,86,110,0.16)';
      ctx.lineWidth = 1;
      for (var g = -8; g <= 8; g += 2) {
        var a = project(g, -8, -1), b = project(g, 8, -1);
        var p = project(-8, g, -1), q = project(8, g, -1);
        if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        if (p && q) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
      }
      if (!hit || hit.gap > 0.4) return;
      var f = hit.frame;
      for (var i = 0; i < f.n; i++) {
        var x = f.xyz[i * 3] * lidarScale;
        var y = f.xyz[i * 3 + 1] * lidarScale;
        var z = f.xyz[i * 3 + 2] * lidarScale;
        var pt = project(x, y, z);
        if (!pt) continue;
        if (pt[0] < -4 || pt[0] > W + 4 || pt[1] < -4 || pt[1] > H + 4) continue;
        var lift = Math.max(0, Math.min(1, (z + 1.2) / 4.2));
        var r = Math.round(150 + 90 * lift);
        var g2 = Math.round(140 + 70 * (1 - lift));
        var b2 = Math.round(190 - 60 * lift);
        ctx.fillStyle = 'rgba(' + r + ',' + g2 + ',' + b2 + ',' + (0.35 + 0.55 * (1 - pt[2] / 45)).toFixed(3) + ')';
        var size = pt[2] < 6 ? 2 : 1.35;
        ctx.fillRect(pt[0], pt[1], size, size);
      }
    }

    function drawMotion(canvas, t) {
      var s = sizeCanvas(canvas);
      var ctx = s.ctx, W = s.w, H = s.h;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#191822';
      ctx.fillRect(0, 0, W, H);

      var pad = 8;
      var imuH = H * 0.46;
      var gripH = H * 0.48;
      var gripY = H * 0.52;

      /* IMU window: trailing 0.9s of accel */
      var win = 0.9;
      var t0 = Math.max(0, t - win);
      var cols = ['#cd8b8b', '#b3ceac', '#6f93b0'];
      var labels = ['AX', 'AY', 'AZ'];
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(156,153,164,0.85)';
      ctx.fillText('HEAD · IMU', pad, 12);

      var times = EP.head_imu.t;
      var acc = EP.head_imu.accel;
      /* find index range */
      var i0 = 0, i1 = times.length - 1;
      for (var i = 0; i < times.length; i++) {
        if (times[i] < t0) i0 = i;
        if (times[i] <= t) i1 = i;
      }
      var mid = [0, 0, 0], peak = 0.01;
      for (i = i0; i <= i1; i++) {
        for (var a = 0; a < 3; a++) {
          mid[a] += acc[i][a];
          peak = Math.max(peak, Math.abs(acc[i][a]));
        }
      }
      var n = Math.max(1, i1 - i0 + 1);
      mid[0] /= n; mid[1] /= n; mid[2] /= n;

      for (a = 0; a < 3; a++) {
        var base = 22 + a * ((imuH - 28) / 3);
        ctx.strokeStyle = 'rgba(246,244,238,0.06)';
        ctx.beginPath();
        ctx.moveTo(pad, base);
        ctx.lineTo(W - pad, base);
        ctx.stroke();
        ctx.beginPath();
        for (i = i0; i <= i1; i++) {
          var u = (times[i] - t0) / win;
          var x = pad + u * (W - pad * 2);
          var y = base - ((acc[i][a] - mid[a]) / peak) * 10;
          if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = cols[a];
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.fillStyle = cols[a];
        ctx.globalAlpha = 0.85;
        ctx.fillText(labels[a], W - pad - 14, base - 8);
        ctx.globalAlpha = 1;
      }
      /* playhead */
      ctx.strokeStyle = 'rgba(240,236,224,0.45)';
      ctx.beginPath();
      ctx.moveTo(W - pad, 16);
      ctx.lineTo(W - pad, imuH - 4);
      ctx.stroke();

      /* Grip + finger articulation */
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, gripY - 4, W, gripH + 8);

      var grip = sampleSeries(EP.hand.t, EP.hand.grip, t) || 0;
      var joints = sampleSeries(EP.hand.t, EP.hand.joint_angles, t) || [];
      var flex = fingerFlex(joints);
      var conf = sampleSeries(EP.hand.t, EP.hand.confidence, t) || 0;

      ctx.fillStyle = 'rgba(156,153,164,0.85)';
      ctx.fillText('HAND · GRIP', pad, gripY + 10);
      ctx.fillText('FLEX', W * 0.42, gripY + 10);

      var gPct = Math.round(Math.max(0, Math.min(1, grip)) * 100);
      ctx.fillStyle = '#f0ece0';
      ctx.font = '600 22px Geist, system-ui, sans-serif';
      ctx.fillText(gPct + '%', pad, gripY + 38);
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillStyle = grip > 0.55 ? '#b3ceac' : '#9c99a4';
      ctx.fillText(grip > 0.7 ? 'GRASP' : grip > 0.4 ? 'CLOSING' : 'REACH', pad, gripY + 52);

      /* grip sparkline full episode */
      var gx0 = pad;
      var gy0 = gripY + 62;
      var gw = W * 0.34;
      var gh = 22;
      ctx.strokeStyle = 'rgba(232,164,74,0.85)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (i = 0; i < EP.hand.grip.length; i++) {
        var hx = gx0 + (i / (EP.hand.grip.length - 1)) * gw;
        var hy = gy0 + gh * (1 - EP.hand.grip[i]);
        if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
      }
      ctx.stroke();
  /* playhead on grip */
      var gix = 0;
      for (i = 0; i < EP.hand.t.length; i++) if (EP.hand.t[i] <= t) gix = i;
      var gpx = gx0 + (gix / (EP.hand.grip.length - 1)) * gw;
      ctx.fillStyle = '#f0ece0';
      ctx.beginPath();
      ctx.arc(gpx, gy0 + gh * (1 - EP.hand.grip[gix]), 2.2, 0, Math.PI * 2);
      ctx.fill();

      /* finger bars */
      var names = ['TH', 'IX', 'MD', 'RG', 'PK'];
      var bx = W * 0.42;
      var bw = W * 0.52;
      var barH = 8;
      var gap = 5;
      for (i = 0; i < 5; i++) {
        var by = gripY + 18 + i * (barH + gap);
        var v = Math.max(0, Math.min(1, flex[i] || 0));
        ctx.fillStyle = 'rgba(246,244,238,0.08)';
        ctx.fillRect(bx + 22, by, bw - 22, barH);
        ctx.fillStyle = COLOURS[i];
        ctx.globalAlpha = 0.35 + 0.65 * v;
        ctx.fillRect(bx + 22, by, (bw - 22) * v, barH);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#9c99a4';
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillText(names[i], bx, by + 7);
      }

      ctx.fillStyle = 'rgba(156,153,164,0.7)';
      ctx.fillText('CONF ' + (conf * 100).toFixed(0) + '%', pad, H - 6);
    }

    function drawTactile(canvas, t, dt) {
      var s = sizeCanvas(canvas);
      var ctx = s.ctx, W = s.w, H = s.h;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#191822';
      ctx.fillRect(0, 0, W, H);

      var raw = sampleSeries(EP.tactile.t, EP.tactile.raw, t) || [0, 0, 0, 0, 0];
      var norm = raw.map(function (v) { return Math.max(0, Math.min(1, v / FULL)); });
      var k = 1 - Math.exp(-(dt || 0.05) * 10);
      for (var c = 0; c < 5; c++) tactileSmooth[c] += (norm[c] - tactileSmooth[c]) * k;
      var grasp = Math.max.apply(null, tactileSmooth);

      var handH = H * 0.72;
      var traceY = H * 0.74;
      var traceH = H * 0.22;
      var padX = 8;

      if (maskReady) {
        var mc = off.mask.getContext('2d');
        mc.clearRect(0, 0, HW, HH);
        mc.drawImage(maskImg, 0, 0, HW, HH);

        var bc = off.body.getContext('2d');
        bc.clearRect(0, 0, HW, HH);
        var skin = bc.createLinearGradient(40, 20, 340, 500);
        skin.addColorStop(0, '#2e2b3c');
        skin.addColorStop(0.5, '#272533');
        skin.addColorStop(1, '#1e1c28');
        bc.fillStyle = skin;
        bc.fillRect(0, 0, HW, HH);
        bc.globalCompositeOperation = 'destination-in';
        bc.drawImage(off.mask, 0, 0);
        bc.globalCompositeOperation = 'source-over';

        var hc = off.heat.getContext('2d');
        hc.clearRect(0, 0, HW, HH);
        hc.globalCompositeOperation = 'lighter';
        function blob(x, y, r, v, mul) {
          if (r <= 0 || v < 0.004) return;
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
        FINGERS.forEach(function (f, fi) {
          var v = tactileSmooth[f.ch];
          var tip = axis(f, 0.92);
          var pulse = 1 + 0.035 * Math.sin(t * 3.1 + fi * 1.7) * v;
          var r = (22 + 84 * Math.pow(v, 0.68)) * pulse;
          blob(tip[0], tip[1], r, v, 1);
          var down = axis(f, Math.max(0, 0.9 - 0.48 * v));
          blob(down[0], down[1], r * 0.72, v * 0.85, 0.5 * v + 0.12);
          if (v > 0.25) {
            var knuck = axis(f, 0.22);
            blob(knuck[0], knuck[1], r * 0.6, v * 0.65, (v - 0.25) * 0.5);
          }
        });
        if (grasp > 0.05) {
          var pcx = 160, pcy = 415, pr = 62 + 100 * grasp;
          var pg = hc.createRadialGradient(pcx, pcy, 0, pcx, pcy, pr);
          pg.addColorStop(0, 'rgba(215,110,120,' + (0.16 * grasp) + ')');
          pg.addColorStop(1, 'rgba(90,70,160,0)');
          hc.fillStyle = pg;
          hc.beginPath();
          hc.arc(pcx, pcy, pr, 0, Math.PI * 2);
          hc.fill();
        }
        hc.globalCompositeOperation = 'destination-in';
        hc.drawImage(off.mask, 0, 0);
        hc.globalCompositeOperation = 'source-over';

        var scale = Math.min(W / HW, handH / HH) * 0.92;
        var ox = W / 2 - (HW / 2) * scale;
        var oy = handH / 2 - (HH / 2) * scale;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.scale(scale, scale);
        if (grasp > 0.02) {
          var bg = ctx.createRadialGradient(170, 280, 0, 170, 280, 250);
          bg.addColorStop(0, 'rgba(232,164,74,' + (0.08 * grasp) + ')');
          bg.addColorStop(1, 'rgba(25,24,34,0)');
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(170, 280, 250, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.drawImage(off.body, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(off.heat, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        FINGERS.forEach(function (f) {
          var tip = axis(f, 0.92);
          var v = tactileSmooth[f.ch];
          ctx.beginPath();
          ctx.arc(tip[0], tip[1], 3.2 + 2.2 * v, 0, Math.PI * 2);
          ctx.fillStyle = COLOURS[f.ch];
          ctx.globalAlpha = 0.55 + 0.45 * v;
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      /* channel traces */
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, traceY - 4, W, traceH + 8);
      var traceW = W - padX * 2;
      var tt = EP.tactile.t;
      var tr = EP.tactile.raw;
      for (c = 0; c < 5; c++) {
        ctx.beginPath();
        var peak = 0;
        for (var i = 0; i < tr.length; i += 1) {
          var v = tr[i][c] / FULL;
          if (v > peak) peak = v;
          var x = padX + (i / (tr.length - 1)) * traceW;
          var y = traceY + traceH * (1 - v * 0.92);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = COLOURS[c];
        ctx.globalAlpha = peak < 0.05 ? 0.28 : 0.85;
        ctx.lineWidth = peak < 0.05 ? 1 : 1.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      var headU = 0;
      for (i = 0; i < tt.length; i++) if (tt[i] <= t) headU = i / (tt.length - 1);
      var px = padX + headU * traceW;
      ctx.strokeStyle = 'rgba(240,236,224,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, traceY - 2);
      ctx.lineTo(px, traceY + traceH);
      ctx.stroke();
      for (c = 0; c < 5; c++) {
        var lv = tactileSmooth[c];
        if (lv < 0.02) continue;
        ctx.beginPath();
        ctx.arc(px, traceY + traceH * (1 - lv * 0.92), 2.2, 0, Math.PI * 2);
        ctx.fillStyle = COLOURS[c];
        ctx.fill();
      }
    }

    function drawIntegrity(t) {
      var I = EP.integrity;
      if (!I) return;
      var sync = sampleSeries(EP.tactile.t, EP.tactile.sync_ms, t);
      var drop = sampleSeries(EP.tactile.t, EP.tactile.dropped, t) || 0;
      var live = document.querySelector('.mod-sync-live');
      if (live && sync != null) {
        live.textContent = Number(sync).toFixed(1) + ' ms';
        live.classList.toggle('ok', Math.abs(sync) < 15);
      }
      var dropEl = document.querySelector('.mod-drop-live');
      if (dropEl) dropEl.textContent = String(Math.round(drop));

      var chart = document.querySelector('.mod-sync-chart');
      if (!chart) return;
      var s = sizeCanvas(chart);
      var ctx = s.ctx, W = s.w, H = s.h;
      ctx.clearRect(0, 0, W, H);

      var times = EP.tactile.t;
      var series = EP.tactile.sync_ms;
      var tMin = times[0];
      var tMax = times[times.length - 1];
      var yMax = Math.max(12, Math.ceil((I.sync_ms.max + 2) / 4) * 4);
      var yMin = 0;
      var padL = 28, padR = 8, padT = 6, padB = 16;
      var plotW = W - padL - padR;
      var plotH = H - padT - padB;

      function xOf(tv) { return padL + ((tv - tMin) / (tMax - tMin || 1)) * plotW; }
      function yOf(ms) { return padT + (1 - (ms - yMin) / (yMax - yMin)) * plotH; }

      /* grid + axes */
      ctx.strokeStyle = 'rgba(246,244,238,0.08)';
      ctx.fillStyle = 'rgba(156,153,164,0.85)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.lineWidth = 1;
      var yTicks = 4;
      for (var g = 0; g <= yTicks; g++) {
        var ms = yMin + (yMax - yMin) * (g / yTicks);
        var gy = yOf(ms);
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(padL + plotW, gy);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(ms)), padL - 4, gy);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var xt = 0; xt <= 3; xt++) {
        var tv = tMin + (tMax - tMin) * (xt / 3);
        var gx = xOf(tv);
        ctx.fillText(tv.toFixed(1) + 's', gx, padT + plotH + 3);
      }
      ctx.fillStyle = 'rgba(156,153,164,0.55)';
      ctx.save();
      ctx.translate(9, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('ms', 0, 0);
      ctx.restore();

      /* line */
      ctx.beginPath();
      for (var i = 0; i < series.length; i++) {
        var x = xOf(times[i]);
        var y = yOf(series[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#b3ceac';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      /* playhead */
      var px = xOf(Math.max(tMin, Math.min(tMax, t)));
      var py = yOf(sync != null ? sync : series[0]);
      ctx.strokeStyle = 'rgba(240,236,224,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = '#f0ece0';
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    var lidarCanvas = document.querySelector('.mod-lidar-canvas');
    var motionCanvas = document.querySelector('.mod-motion-canvas');
    var tactileCanvas = document.querySelector('.mod-tactile-canvas');
    var last = performance.now();

    function paint(now) {
      var dt = Math.min(0.08, Math.max(0.016, (now - last) / 1000));
      last = now;
      if (!reduce && vizActive) {
        clocks.lidar = loopT(clocks.lidar + dt, DUR);
        clocks.motion = loopT(clocks.motion + dt, DUR);
        clocks.touch = loopT(clocks.touch + dt, DUR);
        clocks.integrity = loopT(clocks.integrity + dt, DUR);
      }
      if (lidarCanvas) drawLidar(lidarCanvas, clocks.lidar, dt);
      if (motionCanvas) drawMotion(motionCanvas, clocks.motion);
      if (tactileCanvas) drawTactile(tactileCanvas, clocks.touch, dt);
      drawIntegrity(clocks.integrity);
    }

    if (reduce) {
      clocks.lidar = clocks.motion = clocks.touch = clocks.integrity = DUR * 0.45;
      paint(performance.now());
      return;
    }

    (function loop(now) {
      paint(now);
      requestAnimationFrame(loop);
    })(performance.now());

    window.addEventListener('resize', function () {
      paint(performance.now());
    });
  }
})();
