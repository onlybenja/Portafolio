(function () {
  'use strict';

  const canvas = document.getElementById('bg-canvas');
  const hero = document.getElementById('inicio');
  const btnVerMas = document.getElementById('btn-ver-mas');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let mouseX = 0;
  let mouseY = 0;
  let targetMX = 0;
  let targetMY = 0;
  let ripples = [];
  let lastRippleTime = 0;
  let droplets = [];
  let raf = 0;
  let heroInView = true;
  let prevPointerX = 0;
  let prevPointerY = 0;
  let prevPointerT = 0;
  let pointerInitialized = false;

  function viewportSize() {
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = Math.max(
      vv ? vv.height : 0,
      window.innerHeight,
      document.documentElement.clientHeight
    );
    return { vw, vh };
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { vw, vh } = viewportSize();
    w = vw;
    h = vh;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    initDroplets();
  }

  function initDroplets() {
    droplets = [];
    const count = reducedMotion ? 28 : Math.min(72, Math.floor((w * h) / 18000));
    const pad = 60;
    for (let i = 0; i < count; i++) {
      droplets.push({
        baseX: pad + Math.random() * (w - pad * 2),
        baseY: pad + Math.random() * (h - pad * 2),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        phase: Math.random() * Math.PI * 2,
        phase2: Math.random() * Math.PI * 2,
        drift: 0.12 + Math.random() * 0.18,
        r: 2 + Math.random() * 5,
        soft: 0.55 + Math.random() * 0.35,
      });
    }
    droplets.forEach((d) => {
      d.x = d.baseX;
      d.y = d.baseY;
    });
  }

  function pointerInHero(clientX, clientY) {
    if (!hero) return false;
    const r = hero.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  function waterEffectsActive(clientX, clientY) {
    return heroInView && pointerInHero(clientX, clientY);
  }

  /**
   * Menos ondas si el mouse va lento; más (y más fuertes) si va rápido.
   * speed ≈ px/ms
   */
  function tryAddRipples(x, y, speed, now) {
    if (reducedMotion) return;

    if (speed < 0.035) return;

    let cooldown;
    let maxPerStroke;
    let strengthBase;

    if (speed < 0.2) {
      cooldown = 360 - speed * 400;
      maxPerStroke = 1;
      strengthBase = 0.06 + speed * 0.45;
    } else if (speed < 0.65) {
      cooldown = 140 - (speed - 0.2) * 80;
      maxPerStroke = 1;
      strengthBase = 0.12 + speed * 0.15;
    } else if (speed < 1.35) {
      cooldown = 55 - (speed - 0.65) * 35;
      maxPerStroke = 2;
      strengthBase = 0.18 + speed * 0.12;
    } else {
      cooldown = Math.max(12, 48 - (speed - 1.35) * 28);
      maxPerStroke = Math.min(5, 2 + Math.floor((speed - 1.1) * 2.2));
      strengthBase = 0.22 + Math.min(0.2, (speed - 1.35) * 0.08);
    }

    if (now - lastRippleTime < cooldown) return;

    let n = maxPerStroke;
    if (ripples.length > 14) n = Math.min(n, 2);

    n = Math.max(1, n);
    for (let i = 0; i < n; i++) {
      const j = i * 0.5;
      ripples.push({
        x: x + (Math.random() - 0.5) * (6 + speed * 4) + j,
        y: y + (Math.random() - 0.5) * (6 + speed * 4) + j,
        r: 0,
        born: now + i * 18,
        maxR: 140 + Math.random() * (90 + speed * 40),
        strength: strengthBase * (0.85 + Math.random() * 0.25) * (i === 0 ? 1 : 0.75),
      });
    }
    if (ripples.length > 14) ripples.splice(0, ripples.length - 14);
    lastRippleTime = now;
  }

  function drawBg(ctx) {
    const g = ctx.createLinearGradient(0, 0, w * 0.7, h);
    g.addColorStop(0, '#0a1520');
    g.addColorStop(0.35, '#0f2840');
    g.addColorStop(0.7, '#123552');
    g.addColorStop(1, '#0d2138');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const t = performance.now() * 0.00015;
    const gx = mouseX + Math.sin(t * 1.7) * 40;
    const gy = mouseY + Math.cos(t * 1.3) * 35;
    const g2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.65);
    g2.addColorStop(0, 'rgba(120, 200, 220, 0.06)');
    g2.addColorStop(0.35, 'rgba(40, 120, 160, 0.03)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function stepDroplets(pointerActive) {
    const influenceR = reducedMotion ? 95 : 130;
    const influence = reducedMotion ? 0.08 : pointerActive ? 0.22 : 0;

    droplets.forEach((d) => {
      d.phase += 0.004 * d.drift;
      d.phase2 += 0.0033 * d.drift;
      const bx =
        d.baseX + Math.sin(d.phase * 1.1 + d.phase2) * 18 + Math.cos(d.phase2 * 0.7) * 8;
      const by =
        d.baseY + Math.cos(d.phase * 0.95) * 16 + Math.sin(d.phase * 0.6) * 10;

      let ax = 0;
      let ay = 0;
      if (pointerActive) {
        const dx = d.x - mouseX;
        const dy = d.y - mouseY;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < influenceR) {
          const t = smoothstep(influenceR, 0, dist);
          const f = t * t * t * influence;
          ax += (dx / dist) * f;
          ay += (dy / dist) * f;
        }
      }

      ax += (bx - d.x) * 0.045;
      ay += (by - d.y) * 0.045;

      d.vx = (d.vx + ax) * 0.92;
      d.vy = (d.vy + ay) * 0.92;
      d.x += d.vx;
      d.y += d.vy;
    });
  }

  function drawDroplet(ctx, d) {
    const pulse = 0.85 + Math.sin(d.phase * 1.4) * 0.08;
    const alpha = 0.09 * d.soft * pulse;
    const r = d.r * pulse;

    const grd = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r * 4.5);
    grd.addColorStop(0, `rgba(200, 245, 255, ${alpha * 1.4})`);
    grd.addColorStop(0.25, `rgba(140, 220, 240, ${alpha * 0.7})`);
    grd.addColorStop(0.55, `rgba(80, 160, 200, ${alpha * 0.25})`);
    grd.addColorStop(1, 'rgba(40, 100, 140, 0)');

    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.arc(d.x, d.y, r * 4.5, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    const hi = ctx.createRadialGradient(d.x - r * 0.35, d.y - r * 0.35, 0, d.x, d.y, r * 1.8);
    hi.addColorStop(0, `rgba(255, 255, 255, ${alpha * 2.2})`);
    hi.addColorStop(0.5, `rgba(200, 235, 255, ${alpha * 0.4})`);
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(d.x, d.y, r * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = hi;
    ctx.fill();
  }

  function drawRipples(ctx, now) {
    ctx.globalCompositeOperation = 'screen';
    ripples = ripples.filter((ripple) => {
      const age = (now - ripple.born) / 1000;
      ripple.r += reducedMotion ? 1.4 : 2 + (1 - ripple.r / ripple.maxR) * 1.2;

      const progress = ripple.r / ripple.maxR;
      if (progress >= 1 || ripple.strength < 0.008) return false;

      ripple.strength *= 0.992;

      const rings = 4;
      for (let k = 0; k < rings; k++) {
        const offset = k * 14;
        const rr = ripple.r - offset;
        if (rr < 2) continue;
        const wave = 0.5 + 0.5 * Math.sin(rr * 0.12 + age * 8);
        const a = ripple.strength * wave * (1 - progress) * (1 - k * 0.18);
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(160, 230, 255, ${a * 0.45})`;
        ctx.lineWidth = 1.2 - k * 0.15;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      return true;
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const t = now || performance.now();
    mouseX += (targetMX - mouseX) * 0.08;
    mouseY += (targetMY - mouseY) * 0.08;

    const pointerActive = waterEffectsActive(targetMX, targetMY);

    drawBg(ctx);
    stepDroplets(pointerActive);
    droplets.forEach((d) => drawDroplet(ctx, d));
    drawRipples(ctx, t);

    raf = requestAnimationFrame(frame);
  }

  function onPointerMove(e) {
    const x = e.clientX;
    const y = e.clientY;
    const now = performance.now();

    targetMX = x;
    targetMY = y;

    if (!pointerInitialized) {
      pointerInitialized = true;
      prevPointerX = x;
      prevPointerY = y;
      prevPointerT = now;
      return;
    }

    const dt = Math.max(1, now - prevPointerT);
    const dist = Math.hypot(x - prevPointerX, y - prevPointerY);
    const speed = dist / dt;

    prevPointerX = x;
    prevPointerY = y;
    prevPointerT = now;

    if (waterEffectsActive(x, y)) {
      tryAddRipples(x, y, speed, now);
    }
  }

  function onPointerLeave() {
    targetMX = w * 0.5;
    targetMY = h * 0.5;
  }

  function scrollToContent() {
    const el = document.getElementById('sobre-mi');
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    try {
      history.replaceState(null, '', '#sobre-mi');
    } catch (e) {
      window.location.hash = 'sobre-mi';
    }
  }

  if (hero && typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        heroInView = e.isIntersecting && e.intersectionRatio > 0.02;
      },
      { threshold: [0, 0.02, 0.08, 0.2] }
    );
    io.observe(hero);
  }

  if (canvas) {
    mouseX = window.innerWidth * 0.5;
    mouseY = window.innerHeight * 0.5;
    targetMX = mouseX;
    targetMY = mouseY;
    window.addEventListener('resize', resize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
      window.visualViewport.addEventListener('scroll', resize);
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.body.addEventListener('pointerleave', onPointerLeave);
    resize();
    raf = requestAnimationFrame(frame);
  }

  if (btnVerMas) {
    btnVerMas.addEventListener('click', scrollToContent);
  }
})();
