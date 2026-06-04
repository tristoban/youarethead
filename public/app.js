(() => {
  "use strict";

  const fmt = new Intl.NumberFormat("es-AR");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Fondo: estelas de luz suaves con parallax (tipo dark.netflix.io) ---------- */
  const canvas = document.getElementById("bg");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, raf = 0, streaks = [];
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 };

    const sprite = document.createElement("canvas");
    const sctx = sprite.getContext("2d");
    (function buildSprite() {
      const S = 256; sprite.width = S; sprite.height = S;
      const g = sctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, "rgba(232,233,238,0.95)");
      g.addColorStop(0.35, "rgba(200,202,210,0.32)");
      g.addColorStop(1, "rgba(200,202,210,0)");
      sctx.fillStyle = g;
      sctx.beginPath(); sctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); sctx.fill();
    })();

    function seed() {
      const n = Math.max(10, Math.min(30, Math.round((w * h) / 60000)));
      streaks = [];
      for (let i = 0; i < n; i++) {
        const depth = 0.25 + Math.random() * 0.85;
        streaks.push({
          x: Math.random() * w, y: Math.random() * h,
          len: 220 + Math.random() * 420,
          thick: 0.10 + Math.random() * 0.16,
          ang: Math.random() * 0.8 - 0.4,
          alpha: 0.06 + Math.random() * 0.11,
          depth: depth,
          vx: (Math.random() - 0.5) * 0.10 * depth,
          vy: (Math.random() - 0.5) * 0.05 * depth,
        });
      }
    }
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mouse.tx === 0 && mouse.ty === 0) { mouse.tx = mouse.x = w / 2; mouse.ty = mouse.y = h / 2; }
      seed();
    }
    function render() {
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      const ox = (mouse.x / w - 0.5), oy = (mouse.y / h - 0.5);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#060606"; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const s of streaks) {
        s.x += s.vx; s.y += s.vy;
        const m = s.len;
        if (s.x < -m) s.x = w + m; else if (s.x > w + m) s.x = -m;
        if (s.y < -m) s.y = h + m; else if (s.y > h + m) s.y = -m;
        const px = s.x + ox * 160 * s.depth, py = s.y + oy * 160 * s.depth;
        ctx.save();
        ctx.translate(px, py); ctx.rotate(s.ang); ctx.globalAlpha = s.alpha;
        ctx.drawImage(sprite, -s.len / 2, -(s.len * s.thick) / 2, s.len, s.len * s.thick);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    function loop() { render(); raf = window.requestAnimationFrame(loop); }
    function start() { if (!raf) raf = window.requestAnimationFrame(loop); }
    function stop() { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } }

    size();
    window.addEventListener("resize", size);
    window.addEventListener("mousemove", (e) => { mouse.tx = e.clientX; mouse.ty = e.clientY; });
    window.addEventListener("touchmove", (e) => { if (e.touches[0]) { mouse.tx = e.touches[0].clientX; mouse.ty = e.touches[0].clientY; } }, { passive: true });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });

    if (reduce) { render(); } else { start(); }
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
      remainingEl.textContent = fmt.format(Math.round(from + (target - from) * eased));
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
    } catch (_) {}
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
