(() => {
  "use strict";
  const root = document.getElementById("pf-root");
  if (!root) return;
  const JH = { "content-type": "application/json", accept: "application/json" };
  const AH = { headers: { accept: "application/json" } };
  const fmt = new Intl.NumberFormat("es-AR");
  async function api(path, opts) { const r = await fetch(path, opts); let d = null; try { d = await r.json(); } catch (_) {} return { r, d }; }
  function esc(s) { return String(s).replace(/[<>&"']/g, ""); }
  function cuando(t) { try { const d = new Date(t); return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }); } catch (_) { return ""; } }
  const notif = new Audio("/notification.mp3");
  notif.volume = 0.6;
  function ping() { try { notif.currentTime = 0; const p = notif.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }

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

  let meData = null, timers = [];
  function clearTimers() { timers.forEach((t) => clearInterval(t)); timers = []; }

  async function boot() {
    clearTimers();
    const { d } = await api("/api/hub/me", AH);
    if (!d || !d.ok) { root.innerHTML = '<p class="th-dim">No responde. Probá en un rato.</p>'; return; }
    if (!d.logged) { login(); return; }
    meData = d;
    shell();
  }

  /* ---------- Login ---------- */
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
      email = root.querySelector("#pf-email").value.trim(); msg.textContent = "...";
      const { r, d } = await api("/api/hub/login", { method: "POST", headers: JH, body: JSON.stringify({ email }) });
      msg.textContent = (d && d.message) || (r.ok ? "Código enviado." : "No se pudo.");
      if (r.ok) show("pf-l2");
    };
    root.querySelector("#pf-ver").onclick = async () => {
      const code = root.querySelector("#pf-code").value.trim(); msg.textContent = "...";
      const { r, d } = await api("/api/hub/verify", { method: "POST", headers: JH, body: JSON.stringify({ email, code }) });
      if (r.ok && d && d.logged) { if (!d.nick) { msg.textContent = "¡Adentro! Reservá tu nick."; show("pf-l3"); } else boot(); }
      else msg.textContent = (d && d.message) || "No se pudo.";
    };
    root.querySelector("#pf-nickb").onclick = async () => {
      const nick = root.querySelector("#pf-nick").value.trim(); msg.textContent = "...";
      const { r, d } = await api("/api/hub/nick", { method: "POST", headers: JH, body: JSON.stringify({ nick }) });
      if (r.ok && d && d.ok) boot();
      else msg.textContent = (d && d.message) || "No se pudo.";
    };
  }

  /* ---------- Shell con pestañas ---------- */
  function shell() {
    root.innerHTML =
      '<div class="pf-top">' +
        '<div class="pf-ava"><canvas width="56" height="76"></canvas></div>' +
        '<div><h2 class="pf-nick">' + esc(meData.nick || "sin nick") + '</h2><p class="pf-sub" id="pf-sub"></p></div>' +
      '</div>' +
      '<nav class="pf-tabs" id="pf-tabs">' +
        '<button data-t="feed" class="on">Feed</button>' +
        '<button data-t="amigos">Amigos</button>' +
        '<button data-t="msgs">Mensajes</button>' +
        '<button data-t="cuenta">Cuenta</button>' +
      '</nav>' +
      '<div id="pf-view"></div>';
    drawAvatar(root.querySelector(".pf-ava canvas"), meData.char ? meData.char.head : "o");
    root.querySelector("#pf-sub").textContent = meData.bio ? meData.bio : "Sin bio todavía.";
    root.querySelectorAll("#pf-tabs button").forEach((b) => {
      b.onclick = () => {
        root.querySelectorAll("#pf-tabs button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        go(b.getAttribute("data-t"));
      };
    });
    go("feed");
  }
  function view() { return root.querySelector("#pf-view"); }
  function go(t, arg) {
    clearTimers();
    window.YATH_CONV = null;
    if (t === "feed") tabFeed();
    else if (t === "amigos") tabAmigos();
    else if (t === "msgs") tabMsgs(arg);
    else tabCuenta();
  }

  /* ---------- Feed ---------- */
  function tabFeed() {
    view().innerHTML =
      '<div class="pf-comp"><textarea id="pf-post" maxlength="280" placeholder="¿Qué está pasando ahí adentro? (280 máx)"></textarea>' +
      '<div class="pf-row"><button class="th-btn" id="pf-pub">Publicar</button><span class="th-msg" id="pf-pmsg"></span></div></div>' +
      '<div class="pf-feed" id="pf-feed"><p class="th-dim">Cargando…</p></div>';
    async function load() {
      const { d } = await api("/api/social/feed", AH);
      const box = view().querySelector("#pf-feed"); if (!box) return;
      const posts = (d && d.posts) || [];
      box.innerHTML = posts.length
        ? posts.map((p) => '<div class="pf-post"><div class="pf-ph"><b>' + esc(p.nick) + '</b><span>' + cuando(p.t) + '</span></div><p>' + esc(p.body) + "</p></div>").join("")
        : '<p class="th-dim">Nadie publicó nada todavía. Sé la primera voz del encierro.</p>';
    }
    load();
    timers.push(setInterval(() => { if (!document.hidden) load(); }, 12000));
    view().querySelector("#pf-pub").onclick = async () => {
      const ta = view().querySelector("#pf-post"), pm = view().querySelector("#pf-pmsg");
      pm.textContent = "...";
      const { r, d } = await api("/api/social/post", { method: "POST", headers: JH, body: JSON.stringify({ body: ta.value }) });
      if (r.ok) { ta.value = ""; pm.textContent = ""; load(); }
      else pm.textContent = (d && d.message) || "No se pudo.";
    };
  }

  /* ---------- Amigos ---------- */
  function tabAmigos() {
    view().innerHTML =
      '<div class="pf-row"><input id="pf-buscar" maxlength="14" placeholder="buscar por nick…" /><button class="th-btn" id="pf-bgo">Buscar</button></div>' +
      '<div id="pf-bres"></div>' +
      '<div id="pf-solis"></div>' +
      '<h3 class="pf-h">Tus amigos</h3><div id="pf-lista"><p class="th-dim">Cargando…</p></div>';
    async function load() {
      const { d } = await api("/api/social/amigos", AH);
      if (!d || !d.ok) return;
      const solis = view().querySelector("#pf-solis");
      solis.innerHTML = (d.recibidas || []).length
        ? '<h3 class="pf-h">Solicitudes</h3>' + d.recibidas.map((n) => '<div class="pf-fila"><b>' + esc(n) + '</b><span><button class="th-btn pf-mini" data-ok="' + esc(n) + '">Aceptar</button><button class="th-btn th-ghost pf-mini" data-no="' + esc(n) + '">No</button></span></div>').join("")
        : "";
      const lista = view().querySelector("#pf-lista");
      lista.innerHTML = (d.amigos || []).length
        ? d.amigos.map((n) => '<div class="pf-fila"><b>' + esc(n) + '</b><button class="th-btn th-ghost pf-mini" data-dm="' + esc(n) + '">Mensaje</button></div>').join("")
        : '<p class="th-dim">Todavía no tenés amigos acá adentro.' + ((d.enviadas || []).length ? " Pendientes: " + d.enviadas.map(esc).join(", ") + "." : "") + "</p>";
      view().querySelectorAll("[data-ok]").forEach((b) => { b.onclick = async () => { await api("/api/social/amigos/responder", { method: "POST", headers: JH, body: JSON.stringify({ nick: b.getAttribute("data-ok"), aceptar: true }) }); load(); }; });
      view().querySelectorAll("[data-no]").forEach((b) => { b.onclick = async () => { await api("/api/social/amigos/responder", { method: "POST", headers: JH, body: JSON.stringify({ nick: b.getAttribute("data-no"), aceptar: false }) }); load(); }; });
      view().querySelectorAll("[data-dm]").forEach((b) => { b.onclick = () => { root.querySelectorAll("#pf-tabs button").forEach((x) => x.classList.toggle("on", x.getAttribute("data-t") === "msgs")); go("msgs", { dm: b.getAttribute("data-dm") }); }; });
    }
    load();
    async function buscar() {
      const q = view().querySelector("#pf-buscar").value.trim();
      const res = view().querySelector("#pf-bres");
      if (q.length < 2) { res.innerHTML = '<p class="th-dim">Escribí al menos 2 letras.</p>'; return; }
      const { d } = await api("/api/social/usuarios?q=" + encodeURIComponent(q), AH);
      const us = (d && d.usuarios) || [];
      res.innerHTML = us.length
        ? us.map((n) => '<div class="pf-fila"><b>' + esc(n) + '</b><button class="th-btn pf-mini" data-add="' + esc(n) + '">Agregar</button></div>').join("")
        : '<p class="th-dim">No hay nadie con ese nick.</p>';
      res.querySelectorAll("[data-add]").forEach((b) => {
        b.onclick = async () => { const { d: dd } = await api("/api/social/amigos/pedir", { method: "POST", headers: JH, body: JSON.stringify({ nick: b.getAttribute("data-add") }) }); b.outerHTML = '<span class="th-dim">' + esc((dd && dd.message) || "Listo") + "</span>"; load(); };
      });
    }
    view().querySelector("#pf-bgo").onclick = buscar;
    view().querySelector("#pf-buscar").addEventListener("keydown", (e) => { if (e.key === "Enter") buscar(); });
  }

  /* ---------- Mensajes (amigos + grupos) ---------- */
  function tabMsgs(sel) {
    view().innerHTML =
      '<div class="pf-row" style="margin-bottom:10px"><button class="th-btn pf-mini" id="pf-gnew">+ Nuevo grupo</button></div>' +
      '<div class="pf-dm"><div class="pf-dml" id="pf-dml"><p class="th-dim">Cargando…</p></div><div class="pf-dmc" id="pf-dmc"><p class="th-dim">Elegí un amigo o un grupo.</p></div></div>';
    let con = (sel && sel.dm) || null, gsel = null, maxId = 0;
    function marca(box, b) { box.querySelectorAll(".pf-dmf").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }
    async function loadLista() {
      const ra = await api("/api/social/amigos", AH);
      const rg = await api("/api/social/grupos", AH);
      const box = view().querySelector("#pf-dml"); if (!box) return;
      const am = (ra.d && ra.d.amigos) || [], gs = (rg.d && rg.d.grupos) || [];
      let html = "";
      if (gs.length) html += '<p class="pf-h">Grupos</p>' + gs.map((g) => '<button class="pf-dmf' + (gsel && gsel.id === g.id ? " on" : "") + '" data-g="' + g.id + '" data-n="' + esc(g.nombre) + '"># ' + esc(g.nombre) + " (" + g.miembros + ")</button>").join("");
      html += '<p class="pf-h">Amigos</p>';
      html += am.length ? am.map((n) => '<button class="pf-dmf' + (n === con ? " on" : "") + '" data-d="' + esc(n) + '">' + esc(n) + "</button>").join("") : '<p class="th-dim">Sin amigos aún.</p>';
      box.innerHTML = html;
      box.querySelectorAll("[data-d]").forEach((b) => { b.onclick = () => { con = b.getAttribute("data-d"); gsel = null; maxId = 0; marca(box, b); clearTimers(); dmConv(); }; });
      box.querySelectorAll("[data-g]").forEach((b) => { b.onclick = () => { gsel = { id: Number(b.getAttribute("data-g")), nombre: b.getAttribute("data-n") }; con = null; maxId = 0; marca(box, b); clearTimers(); gConv(); }; });
    }
    function dmConv() {
      window.YATH_CONV = { dm: con };
      const c = view().querySelector("#pf-dmc");
      c.innerHTML = '<div class="pf-dmh">con <b>' + esc(con) + '</b></div><div class="pf-dmlog" id="pf-dmlog"></div>' +
        '<div class="pf-row"><input id="pf-dmtxt" maxlength="300" placeholder="escribí…" autocomplete="off" /><button class="th-btn" id="pf-dmsend">Enviar</button></div><p class="th-msg" id="pf-dmmsg"></p>';
      const log = c.querySelector("#pf-dmlog"), txt = c.querySelector("#pf-dmtxt"), dmm = c.querySelector("#pf-dmmsg");
      function add(m) { const div = document.createElement("div"); div.className = "pf-m" + (m.mio ? " mio" : ""); div.textContent = m.body; log.appendChild(div); if (m.id > maxId) maxId = m.id; }
      async function load() {
        if (!con) return;
        const first = maxId === 0;
        const url = "/api/social/dm?con=" + encodeURIComponent(con) + (maxId ? "&since=" + maxId : "");
        const { r, d } = await api(url, AH);
        if (r.status === 403) { dmm.textContent = "Tienen que ser amigos para chatear."; return; }
        if (d && d.mensajes && d.mensajes.length) { d.mensajes.forEach(add); log.scrollTop = log.scrollHeight; if (!first && d.mensajes.some((m) => !m.mio)) ping(); }
      }
      load();
      timers.push(setInterval(() => { if (!document.hidden) load(); }, 3000));
      async function enviar() {
        const t = txt.value.trim(); if (!t) return;
        const { r, d } = await api("/api/social/dm", { method: "POST", headers: JH, body: JSON.stringify({ nick: con, body: t }) });
        if (r.ok && d && d.mensaje) { add(d.mensaje); log.scrollTop = log.scrollHeight; txt.value = ""; dmm.textContent = ""; }
        else dmm.textContent = (d && d.message) || "No se pudo.";
      }
      c.querySelector("#pf-dmsend").onclick = enviar;
      txt.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar(); });
    }
    function gConv() {
      window.YATH_CONV = { g: gsel.id };
      const c = view().querySelector("#pf-dmc");
      c.innerHTML = '<div class="pf-dmh"><b># ' + esc(gsel.nombre) + '</b> · <span class="th-dim" id="pf-gmiem"></span><br><a href="#" id="pf-gadd">+ sumar amigo</a> · <a href="#" id="pf-gout">salir del grupo</a></div>' +
        '<div class="pf-dmlog" id="pf-dmlog"></div>' +
        '<div class="pf-row"><input id="pf-dmtxt" maxlength="300" placeholder="escribí…" autocomplete="off" /><button class="th-btn" id="pf-dmsend">Enviar</button></div><p class="th-msg" id="pf-dmmsg"></p>';
      const log = c.querySelector("#pf-dmlog"), txt = c.querySelector("#pf-dmtxt"), dmm = c.querySelector("#pf-dmmsg");
      function add(m) {
        const div = document.createElement("div"); div.className = "pf-m" + (m.mio ? " mio" : "");
        if (!m.mio && m.nick) { const n = document.createElement("b"); n.className = "pf-mn"; n.textContent = m.nick; div.appendChild(n); }
        div.appendChild(document.createTextNode(m.body));
        log.appendChild(div);
        if (m.id > maxId) maxId = m.id;
      }
      async function load() {
        if (!gsel) return;
        const first = maxId === 0;
        const url = "/api/social/grupos/msgs?id=" + gsel.id + (maxId ? "&since=" + maxId : "");
        const { r, d } = await api(url, AH);
        if (r.status === 403) { dmm.textContent = "Ya no estás en este grupo."; return; }
        if (d && d.ok) {
          const mm = c.querySelector("#pf-gmiem");
          if (mm && d.miembros) mm.textContent = d.miembros.map(esc).join(", ");
          if (d.mensajes && d.mensajes.length) { d.mensajes.forEach(add); log.scrollTop = log.scrollHeight; if (!first && d.mensajes.some((m) => !m.mio)) ping(); }
        }
      }
      load();
      timers.push(setInterval(() => { if (!document.hidden) load(); }, 3000));
      async function enviar() {
        const t = txt.value.trim(); if (!t) return;
        const { r, d } = await api("/api/social/grupos/msg", { method: "POST", headers: JH, body: JSON.stringify({ id: gsel.id, body: t }) });
        if (r.ok && d && d.mensaje) { add(d.mensaje); log.scrollTop = log.scrollHeight; txt.value = ""; dmm.textContent = ""; }
        else dmm.textContent = (d && d.message) || "No se pudo.";
      }
      c.querySelector("#pf-dmsend").onclick = enviar;
      txt.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar(); });
      c.querySelector("#pf-gadd").onclick = async (e) => {
        e.preventDefault();
        const nick = window.prompt("Nick del amigo a sumar:");
        if (!nick) return;
        const { d } = await api("/api/social/grupos/agregar", { method: "POST", headers: JH, body: JSON.stringify({ id: gsel.id, nick: nick.trim() }) });
        dmm.textContent = (d && d.message) || (d && d.ok ? "Agregado." : "No se pudo.");
        load(); loadLista();
      };
      c.querySelector("#pf-gout").onclick = async (e) => {
        e.preventDefault();
        if (!window.confirm("¿Salir del grupo?")) return;
        await api("/api/social/grupos/salir", { method: "POST", headers: JH, body: JSON.stringify({ id: gsel.id }) });
        gsel = null; clearTimers(); tabMsgs();
      };
    }
    view().querySelector("#pf-gnew").onclick = async () => {
      const nombre = window.prompt("Nombre del grupo:");
      if (!nombre) return;
      const { r, d } = await api("/api/social/grupos/crear", { method: "POST", headers: JH, body: JSON.stringify({ nombre: nombre.trim() }) });
      if (r.ok && d && d.grupo) { gsel = { id: d.grupo.id, nombre: d.grupo.nombre }; con = null; maxId = 0; await loadLista(); gConv(); }
      else window.alert((d && d.message) || "No se pudo crear.");
    };
    loadLista().then(() => { if (con) dmConv(); });
  }

  /* ---------- Cuenta ---------- */
  function tabCuenta() {
    const d = meData;
    const desde = d.desde ? new Date(d.desde).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "";
    view().innerHTML =
      '<p class="pf-sub">' + esc(maskMail(d.email)) + (desde ? " · en el pueblo desde el " + desde : "") + '</p>' +
      '<div class="pf-bio"><textarea id="pf-bio" maxlength="140" placeholder="Tu bio (140 máx).">' + esc(d.bio || "") + '</textarea>' +
      '<div class="pf-row"><button class="th-btn" id="pf-bsave">Guardar bio</button><span class="th-msg" id="pf-bmsg"></span><button class="th-btn th-ghost pf-out" id="pf-out">Salir</button></div></div>' +
      '<div class="pf-grid">' +
        '<div class="pf-card"><label>El Botón</label><b>' + (d.caido ? "Caído N° " + fmt.format(d.caido) : "No caíste") + '</b></div>' +
        '<div class="pf-card"><label>Récord TeTristo</label><b>' + fmt.format((d.best && d.best.tetristo) || 0) + '</b></div>' +
        '<div class="pf-card"><label>Récord No Parpadees</label><b>' + fmt.format((d.best && d.best.parpadeo) || 0) + '</b></div>' +
        (d.char ? '<div class="pf-card"><label>El Pueblo</label><b>Vida ' + d.char.vida + " · Hambre " + d.char.hambre + " · Sueño " + d.char.sueno + '</b></div>' : "") +
      '</div>';
    view().querySelector("#pf-out").onclick = async () => { await api("/api/hub/logout", { method: "POST", headers: JH, body: "{}" }); boot(); };
    view().querySelector("#pf-bsave").onclick = async () => {
      const bm = view().querySelector("#pf-bmsg"); bm.textContent = "...";
      const { r, d: dd } = await api("/api/hub/bio", { method: "POST", headers: JH, body: JSON.stringify({ bio: view().querySelector("#pf-bio").value }) });
      if (r.ok) { bm.textContent = "Guardada."; meData.bio = dd && dd.bio; const s = root.querySelector("#pf-sub"); if (s) s.textContent = meData.bio || "Sin bio todavía."; }
      else bm.textContent = (dd && dd.message) || "No se pudo.";
    };
  }

  boot();
})();
