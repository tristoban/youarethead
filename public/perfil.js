(() => {
  "use strict";
  const root = document.getElementById("pf-root");
  if (!root) return;
  const JH = { "content-type": "application/json", accept: "application/json" };
  const fmt = new Intl.NumberFormat("es-AR");
  async function api(path, opts) { const r = await fetch(path, opts); let d = null; try { d = await r.json(); } catch (_) {} return { r, d }; }
  function esc(s) { return String(s).replace(/[<>&"']/g, ""); }

  const PAL = { H: "#b9bdc7", A: "#e8eaf0", D: "#14141a", B: "#383b44", L: "#23252d", W: "#a87848" };
  const HEADS_PX = {
    "o": ["..HHHH..", "..HHHH..", "..HHHH..", "........"],
    "O": [".HHHHHH.", ".HHHHHH.", ".HHHHHH.", "........"],
    "ö": ["..HHHH..", "..HAAH..", "..HHHH..", "........"],
    "ø": ["..HHHA..", "..HAHH..", "..AHHH..", "........"],
    "@": [".DDDDDD.", ".DHHHHD.", ".DHHHHD.", "........"],
    "°": ["...AA...", "..HHHH..", "..HHHH..", "........"],
  };
  const BODY = ["...BB...", "..BBBB..", ".BBBBBB.", "..BBBB..", "...BB...", "..L..L..", "..L..L..", ".LL..LL."];
  function drawAvatar(cv, head) {
    const ctx = cv.getContext("2d");
    const rows = (HEADS_PX[head] || HEADS_PX["o"]).concat(BODY);
    const px = 5, x0 = Math.round(cv.width / 2 - 4 * px), y0 = Math.round(cv.height - rows.length * px - 4);
    for (let r = 0; r < rows.length; r++) for (let i = 0; i < rows[r].length; i++) { const c = PAL[rows[r][i]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x0 + i * px, y0 + r * px, px, px); } }
  }

  function maskMail(e) { const a = String(e).split("@"); if (a.length !== 2) return ""; return (a[0] || "").slice(0, 2) + "***@" + a[1]; }

  async function boot() {
    const { d } = await api("/api/hub/me", { headers: { accept: "application/json" } });
    if (!d || !d.ok) { root.innerHTML = '<p class="th-dim">No responde. Probá en un rato.</p>'; return; }
    if (!d.logged) { login(); return; }
    profile(d);
  }

  function login() {
    root.innerHTML =
      '<div class="th-head"><span class="th-logo">Tu cuenta</span></div>' +
      '<p class="th-p th-dim">Sin contraseña: te mandamos un código a tu mail. Tu nick queda reservado y nadie más puede usarlo.</p>' +
      '<div class="th-row" id="pf-l1"><input id="pf-email" type="email" placeholder="tu@mail.com" /><button class="th-btn" id="pf-send">Mandar código</button></div>' +
      '<div class="th-row th-hide" id="pf-l2"><input id="pf-code" inputmode="numeric" maxlength="6" placeholder="código de 6 dígitos" /><button class="th-btn" id="pf-ver">Entrar</button></div>' +
      '<div class="th-row th-hide" id="pf-l3"><input id="pf-nick" maxlength="14" placeholder="elegí tu nick (único)" /><button class="th-btn" id="pf-nickb">Reservar nick</button></div>' +
      '<p class="th-msg" id="pf-lmsg"></p>';
    const msg = root.querySelector("#pf-lmsg");
    const show = (id) => { ["pf-l1", "pf-l2", "pf-l3"].forEach((k) => { const n = root.querySelector("#" + k); if (n) n.classList.toggle("th-hide", k !== id); }); };
    let email = "";
    root.querySelector("#pf-send").onclick = async () => {
      email = root.querySelector("#pf-email").value.trim();
      msg.textContent = "...";
      const { r, d } = await api("/api/hub/login", { method: "POST", headers: JH, body: JSON.stringify({ email }) });
      msg.textContent = (d && d.message) || (r.ok ? "Código enviado." : "No se pudo.");
      if (r.ok) show("pf-l2");
    };
    root.querySelector("#pf-ver").onclick = async () => {
      const code = root.querySelector("#pf-code").value.trim();
      msg.textContent = "...";
      const { r, d } = await api("/api/hub/verify", { method: "POST", headers: JH, body: JSON.stringify({ email, code }) });
      if (r.ok && d && d.logged) {
        if (!d.nick) { msg.textContent = "¡Adentro! Reservá tu nick."; show("pf-l3"); }
        else boot();
      } else msg.textContent = (d && d.message) || "No se pudo.";
    };
    root.querySelector("#pf-nickb").onclick = async () => {
      const nick = root.querySelector("#pf-nick").value.trim();
      msg.textContent = "...";
      const { r, d } = await api("/api/hub/nick", { method: "POST", headers: JH, body: JSON.stringify({ nick }) });
      if (r.ok && d && d.ok) boot();
      else msg.textContent = (d && d.message) || "No se pudo.";
    };
  }

  function profile(d) {
    const desde = d.desde ? new Date(d.desde).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "";
    root.innerHTML =
      '<div class="pf-top">' +
        '<div class="pf-ava"><canvas width="56" height="76"></canvas></div>' +
        '<div><h2 class="pf-nick">' + esc(d.nick || "sin nick") + '</h2>' +
        '<p class="pf-sub">' + esc(maskMail(d.email)) + (desde ? " · en el pueblo desde el " + desde : "") + '</p></div>' +
        '<button class="th-btn th-ghost pf-out" id="pf-out">Salir</button>' +
      '</div>' +
      '<div class="pf-bio"><textarea id="pf-bio" maxlength="140" placeholder="Tu bio (140 máx). Contales quién eras antes de quedar atrapado.">' + esc(d.bio || "") + '</textarea>' +
      '<div class="pf-row"><button class="th-btn" id="pf-bsave">Guardar bio</button><span class="th-msg" id="pf-bmsg"></span></div></div>' +
      '<div class="pf-grid">' +
        '<div class="pf-card"><label>El Botón</label><b>' + (d.caido ? "Caído N° " + fmt.format(d.caido) : "Todavía no caíste") + '</b></div>' +
        '<div class="pf-card"><label>Récord TeTristo</label><b>' + fmt.format(d.best && d.best.tetristo || 0) + '</b></div>' +
        '<div class="pf-card"><label>Récord No Parpadees</label><b>' + fmt.format(d.best && d.best.parpadeo || 0) + '</b></div>' +
        (d.char ? '<div class="pf-card"><label>El Pueblo</label><b>Vida ' + d.char.vida + " · Hambre " + d.char.hambre + " · Sueño " + d.char.sueno + '</b></div>' : "") +
      '</div>' +
      '<p class="th-p th-dim">Tu nick es único: nadie puede usarlo en el chat ni en los juegos sin tu cuenta. <a class="pb-link" href="/tristos">Ir a Tristo&#39;s →</a></p>';
    drawAvatar(root.querySelector(".pf-ava canvas"), d.char ? d.char.head : "o");
    root.querySelector("#pf-out").onclick = async () => { await api("/api/hub/logout", { method: "POST", headers: JH, body: "{}" }); boot(); };
    root.querySelector("#pf-bsave").onclick = async () => {
      const bmsg = root.querySelector("#pf-bmsg"); bmsg.textContent = "...";
      const bio = root.querySelector("#pf-bio").value;
      const { r, d: dd } = await api("/api/hub/bio", { method: "POST", headers: JH, body: JSON.stringify({ bio }) });
      bmsg.textContent = r.ok ? "Guardada." : ((dd && dd.message) || "No se pudo.");
    };
  }

  boot();
})();
