(() => {
  "use strict";

  const fmt = new Intl.NumberFormat("es-AR");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Fondo: niebla de ruido (tipo dark.netflix.io) ----------
     fbm de simplex 3D renderizado en un canvas chico y escalado con blur =>
     humo suave y continuo (sin líneas). La 3a dimensión es el tiempo (deriva
     lenta) y el mouse corre dos capas distinto => parallax con profundidad. */
  const canvas = document.getElementById("bg");
  if (canvas) {
    const ctx = canvas.getContext("2d");

    // --- simplex noise 3D (dominio público) ---
    const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    const perm = new Uint8Array(512);
    (() => { const p = new Uint8Array(256); for (let i=0;i<256;i++) p[i]=i;
      for (let i=255;i>0;i--){ const n=Math.floor(Math.random()*(i+1)); const t=p[i]; p[i]=p[n]; p[n]=t; }
      for (let i=0;i<512;i++) perm[i]=p[i&255]; })();
    const F3=1/3, G3=1/6;
    function noise3(xin,yin,zin){
      let n0,n1,n2,n3; const s=(xin+yin+zin)*F3;
      const i=Math.floor(xin+s), j=Math.floor(yin+s), k=Math.floor(zin+s);
      const t=(i+j+k)*G3; const x0=xin-(i-t), y0=yin-(j-t), z0=zin-(k-t);
      let i1,j1,k1,i2,j2,k2;
      if(x0>=y0){ if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;} else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;} else {i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;} }
      else { if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;} else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;} else {i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;} }
      const x1=x0-i1+G3,y1=y0-j1+G3,z1=z0-k1+G3, x2=x0-i2+2*G3,y2=y0-j2+2*G3,z2=z0-k2+2*G3, x3=x0-1+3*G3,y3=y0-1+3*G3,z3=z0-1+3*G3;
      const ii=i&255,jj=j&255,kk=k&255; let g;
      let a0=0.6-x0*x0-y0*y0-z0*z0; if(a0<0)n0=0; else { a0*=a0; g=grad3[perm[ii+perm[jj+perm[kk]]]%12]; n0=a0*a0*(g[0]*x0+g[1]*y0+g[2]*z0); }
      let a1=0.6-x1*x1-y1*y1-z1*z1; if(a1<0)n1=0; else { a1*=a1; g=grad3[perm[ii+i1+perm[jj+j1+perm[kk+k1]]]%12]; n1=a1*a1*(g[0]*x1+g[1]*y1+g[2]*z1); }
      let a2=0.6-x2*x2-y2*y2-z2*z2; if(a2<0)n2=0; else { a2*=a2; g=grad3[perm[ii+i2+perm[jj+j2+perm[kk+k2]]]%12]; n2=a2*a2*(g[0]*x2+g[1]*y2+g[2]*z2); }
      let a3=0.6-x3*x3-y3*y3-z3*z3; if(a3<0)n3=0; else { a3*=a3; g=grad3[perm[ii+1+perm[jj+1+perm[kk+1]]]%12]; n3=a3*a3*(g[0]*x3+g[1]*y3+g[2]*z3); }
      return 32*(n0+n1+n2+n3);
    }
    function fbm(x,y,z){ let v=0, amp=0.6, f=1; for(let o=0;o<3;o++){ v+=amp*noise3(x*f,y*f,z*f); f*=2; amp*=0.5; } return v; }

    const SC = 12;
    let w=0,h=0,dpr=1,raf=0,zt=0,fw=0,fh=0;
    const fog = document.createElement("canvas");
    const fctx = fog.getContext("2d");
    let img = null;
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 };

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fw = Math.max(2, Math.ceil(w / SC)); fh = Math.max(2, Math.ceil(h / SC));
      fog.width = fw; fog.height = fh; img = fctx.createImageData(fw, fh);
      if (mouse.tx === 0 && mouse.ty === 0) { mouse.tx = mouse.x = w / 2; mouse.ty = mouse.y = h / 2; }
    }
    function render() {
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      const ox = (mouse.x / w - 0.5), oy = (mouse.y / h - 0.5);
      zt += 0.0016;
      const d = img.data; let p = 0;
      for (let j = 0; j < fh; j++) {
        for (let i = 0; i < fw; i++) {
          const v = 0.6 * fbm(i * 0.065 + ox * 3.0, j * 0.065 + oy * 3.0, zt)
                  + 0.4 * fbm(i * 0.022 + ox * 1.3, j * 0.022 + oy * 1.3, zt * 0.7);
          let a = (v + 1) * 0.5; a = (a - 0.5) / 0.5;
          if (a < 0) a = 0; else if (a > 1) a = 1;
          a = a * a * (3 - 2 * a);
          d[p] = 206; d[p + 1] = 209; d[p + 2] = 216; d[p + 3] = (a * 0.42 * 255) | 0;
          p += 4;
        }
      }
      fctx.putImageData(img, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#060606"; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingEnabled = true;
      ctx.filter = "blur(6px)";
      ctx.drawImage(fog, 0, 0, fw, fh, 0, 0, w, h);
      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-over";
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
