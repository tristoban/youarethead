(() => {
  "use strict";

  const fmt = new Intl.NumberFormat("es-AR");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Fondo: campo de flujo (humo/luz tipo dark.netflix.io) ----------
     Cada partícula avanza siguiendo el ángulo que le da un ruido simplex 3D
     (la 3a dimensión es el tiempo, por eso "respira"). No se borra el frame:
     se pinta un negro semitransparente encima => estela => filamentos de humo.
     El mouse hace dos cosas: corre el campo entero (parallax) y genera un
     remolino alrededor del cursor. */
  const canvas = document.getElementById("bg");
  if (canvas) {
    const ctx = canvas.getContext("2d");

    // --- simplex noise 3D (dominio público, compacto) ---
    const grad3 = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
    ];
    const perm = new Uint8Array(512);
    (() => {
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const n = Math.floor(Math.random() * (i + 1));
        const t = p[i]; p[i] = p[n]; p[n] = t;
      }
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    })();
    const F3 = 1 / 3, G3 = 1 / 6;
    function noise3(xin, yin, zin) {
      let n0, n1, n2, n3;
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (t0 < 0) n0 = 0; else { t0 *= t0; const g = grad3[perm[ii + perm[jj + perm[kk]]] % 12]; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0); }
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (t1 < 0) n1 = 0; else { t1 *= t1; const g = grad3[perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12]; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1); }
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (t2 < 0) n2 = 0; else { t2 *= t2; const g = grad3[perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12]; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2); }
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (t3 < 0) n3 = 0; else { t3 *= t3; const g = grad3[perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12]; n3 = t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3); }
      return 32 * (n0 + n1 + n2 + n3);
    }

    let w = 0, h = 0, dpr = 1, parts = [], raf = 0, zt = 0;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const SCALE = 0.0016, SPEED = 0.9, SWIRL_R = 200;

    function spawn(p) {
      p.x = Math.random() * w;
      p.y = Math.random() * h;
      p.life = 60 + Math.random() * 260;
    }
    function seed() {
      const n = Math.max(220, Math.min(1000, Math.floor((w * h) / 2200)));
      parts = new Array(n);
      for (let i = 0; i < n; i++) { const p = {}; spawn(p); parts[i] = p; }
    }
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#06060a";
      ctx.fillRect(0, 0, w, h);
      if (mouse.tx === 0 && mouse.ty === 0) { mouse.x = mouse.tx = w / 2; mouse.y = mouse.ty = h / 2; }
      seed();
    }

    function step() {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(6,6,10,0.055)";
      ctx.fillRect(0, 0, w, h);

      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      const ox = (mouse.x / w - 0.5), oy = (mouse.y / h - 0.5);

      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.1;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const a = noise3(p.x * SCALE + ox * 1.1, p.y * SCALE + oy * 1.1, zt) * Math.PI * 2;
        let vx = Math.cos(a), vy = Math.sin(a);
        const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
        let near = 0;
        if (d < SWIRL_R) {
          near = 1 - d / SWIRL_R;
          const dd = d || 1;
          vx += (-dy / dd) * near * 1.7;
          vy += (dx / dd) * near * 1.7;
        }
        const nx = p.x + vx * SPEED, ny = p.y + vy * SPEED;
        ctx.strokeStyle = "rgba(150,170,225," + (0.05 + near * 0.16).toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        p.x = nx; p.y = ny; p.life -= 1;
        if (p.life <= 0 || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) spawn(p);
      }
      zt += 0.0016;
    }

    function frame() { step(); raf = window.requestAnimationFrame(frame); }
    function start() { if (!raf) raf = window.requestAnimationFrame(frame); }
    function stop() { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } }

    size();
    window.addEventListener("resize", size);
    window.addEventListener("mousemove", (e) => { mouse.tx = e.clientX; mouse.ty = e.clientY; });
    window.addEventListener("mouseleave", () => { mouse.tx = w / 2; mouse.ty = h / 2; });
    window.addEventListener("touchmove", (e) => {
      if (e.touches[0]) { mouse.tx = e.touches[0].clientX; mouse.ty = e.touches[0].clientY; }
    }, { passive: true });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });

    if (reduce) { for (let f = 0; f < 120; f++) step(); } else { start(); }
  }

  /* ---------- Wishlist ---------- */
  const remainingEl = document.getElementById("remaining");
  const counterEl = document.getElementById("counter");
  const unlockedEl = document.getElementById("unlocked");
  const form = document.getElementById("form");
  const emailEl = document.getElementById("email");
  const submitEl = document.getElementById("submit");
  const msgEl = document.getElementById("msg");

  let shown = null;

  function setNumber(target) {
    if (!remainingEl || typeof target !== "number") return;
    const from = shown == null ? target : shown;
    shown = target;
    const startT = performance.now();
    const dur = 700;
    function tick(t) {
      const k = Math.min(1, (t - startT) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      const val = Math.round(from + (target - from) * eased);
      remainingEl.textContent = fmt.format(val);
      if (k < 1) window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  function showUnlocked() {
    if (counterEl) counterEl.classList.add("hidden");
    if (form) form.classList.add("hidden");
    if (unlockedEl) unlockedEl.classList.remove("hidden");
  }

  function applyStats(d) {
    if (!d) return;
    if (d.unlocked) showUnlocked();
    else if (typeof d.remaining === "number") setNumber(d.remaining);
  }

  function setMsg(text, kind) {
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.className = "msg" + (kind ? " " + kind : "");
  }

  async function loadStats() {
    try {
      const r = await fetch("/api/stats", { headers: { accept: "application/json" } });
      applyStats(await r.json());
    } catch (_) { /* sin conexión: dejamos el guion */ }
  }
  loadStats();

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = (emailEl && emailEl.value ? emailEl.value : "").trim();
      if (!email) { setMsg("Escribí tu mail.", "err"); return; }
      setMsg("");
      let label = "Anotarme";
      if (submitEl) { label = submitEl.textContent; submitEl.disabled = true; submitEl.textContent = "..."; }
      try {
        const r = await fetch("/api/wishlist", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ email }),
        });
        const d = await r.json();
        applyStats(d);
        if (r.ok) { setMsg(d.message || "Listo. Estás en la lista.", "ok"); form.reset(); }
        else { setMsg(d.message || "No se pudo. Probá de nuevo.", "err"); }
      } catch (_) {
        setMsg("Algo se rompió. Probá de nuevo.", "err");
      } finally {
        if (submitEl) { submitEl.disabled = false; submitEl.textContent = label; }
      }
    });
  }
})();
