(() => {
  "use strict";
  const notif = new Audio("/notification.mp3");
  notif.volume = 0.7;
  function ping() { try { notif.currentTime = 0; const p = notif.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
  function lsGet(k) { try { return Number(localStorage.getItem(k) || 0); } catch (_) { return 0; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} }
  let activo = true;

  function toast(texto) {
    let t = document.getElementById("yath-toast");
    if (!t) {
      t = document.createElement("a");
      t.id = "yath-toast";
      t.href = "/yata";
      t.style.cssText = "position:fixed;right:14px;bottom:72px;z-index:99990;background:rgba(8,8,11,.92);border:1px solid rgba(255,255,255,.3);color:#fff;font:700 12px Montserrat,system-ui,sans-serif;padding:11px 16px;border-radius:10px;text-decoration:none;max-width:260px;box-shadow:0 12px 40px rgba(0,0,0,.5);display:none";
      document.body.appendChild(t);
    }
    t.textContent = texto;
    t.style.display = "block";
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.display = "none"; }, 6000);
    const nav = document.getElementById("navPerfil");
    if (nav && nav.textContent.indexOf("●") < 0) nav.textContent = "● " + nav.textContent;
  }

  async function check() {
    if (!activo) return;
    try {
      const r = await fetch("/api/social/nuevos", { headers: { accept: "application/json" } });
      if (r.status === 401) { activo = false; return; }
      const d = await r.json();
      if (!d || !d.ok) return;
      const sd = lsGet("yath-seen-dm"), sg = lsGet("yath-seen-grupo");
      const conv = window.YATH_CONV || null;
      let aviso = null;
      if (d.dm && d.dm.id > sd) {
        if (sd > 0 && !(conv && conv.dm === d.dm.de && !document.hidden)) aviso = "Mensaje nuevo de " + d.dm.de;
        lsSet("yath-seen-dm", d.dm.id);
      }
      if (d.grupo && d.grupo.id > sg) {
        if (sg > 0 && !(conv && conv.g === d.grupo.gid && !document.hidden)) aviso = "# " + d.grupo.nombre + " — mensaje de " + d.grupo.de;
        lsSet("yath-seen-grupo", d.grupo.id);
      }
      if (aviso) { ping(); toast(aviso); }
    } catch (_) {}
  }
  check();
  setInterval(() => { if (!document.hidden) check(); }, 10000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
})();
