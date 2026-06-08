(() => {
  "use strict";
  const root = document.getElementById("pf-root");
  if (!root) return;
  const JH = { "content-type": "application/json", accept: "application/json" };
  const AH = { headers: { accept: "application/json" } };
  const fmt = new Intl.NumberFormat("es-AR");
  async function api(p, o) { const r = await fetch(p, o); let d = null; try { d = await r.json(); } catch (_) {} return { r, d }; }
  function esc(s) { return String(s == null ? "" : s).replace(/[<>&"']/g, ""); }
  function cuando(t) { try { const d = new Date(t); const h = (Date.now() - d) / 3600000; if (h < 1) return Math.max(1, Math.round(h * 60)) + "m"; if (h < 24) return Math.round(h) + "h"; return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" }); } catch (_) { return ""; } }

  const notif = new Audio("/notification.mp3"); notif.volume = 0.7;
  function ping() { try { notif.currentTime = 0; const p = notif.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }

  const PAL = { H: "#b9bdc7", A: "#e8eaf0", D: "#14141a", B: "#383b44", L: "#23252d", W: "#a87848" };
  const HEADS = { "o": ["..HHHH..", "..HHHH..", "..HHHH..", "........"], "O": [".HHHHHH.", ".HHHHHH.", ".HHHHHH.", "........"], "ö": ["..HHHH..", "..HAAH..", "..HHHH..", "........"], "ø": ["..HHHA..", "..HAHH..", "..AHHH..", "........"], "@": [".DDDDDD.", ".DHHHHD.", ".DHHHHD.", "........"], "°": ["...AA...", "..HHHH..", "..HHHH..", "........"] };
  const HK = Object.keys(HEADS);
  const BODY = ["...BB...", "..BBBB..", ".BBBBBB.", "..BBBB..", "...BB...", "..L..L..", "..L..L..", ".LL..LL."];
  function headFor(nick) { let s = 0; const n = String(nick || ""); for (let i = 0; i < n.length; i++) s += n.charCodeAt(i); return HK[s % HK.length]; }
  function avatar(head) {
    const cv = document.createElement("canvas"); cv.width = 32; cv.height = 40;
    const ctx = cv.getContext("2d"); const rows = (HEADS[head] || HEADS["o"]).concat(BODY);
    const px = 4, x0 = Math.round(cv.width / 2 - 4 * px), y0 = cv.height - rows.length * px - 2;
    for (let r = 0; r < rows.length; r++) for (let i = 0; i < rows[r].length; i++) { const c = PAL[rows[r][i]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x0 + i * px, y0 + r * px, px, px); } }
    return cv.outerHTML;
  }
  function maskMail(e) { const a = String(e).split("@"); if (a.length !== 2) return ""; return (a[0] || "").slice(0, 2) + "***@" + a[1]; }
  function avaPic(photo, head) { return photo ? '<img class="pf-img" src="' + esc(photo) + '" alt="" referrerpolicy="no-referrer" />' : avatar(head); }
  function resizeImg(file, cb) {
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => {
      const S = 256, cv = document.createElement("canvas"); cv.width = S; cv.height = S;
      const ctx = cv.getContext("2d"), scale = Math.max(S / img.width, S / img.height), w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      try { cb(cv.toDataURL("image/jpeg", 0.82)); } catch (_) { cb(null); }
    }; img.onerror = () => cb(null); img.src = String(fr.result); };
    fr.onerror = () => cb(null); fr.readAsDataURL(file);
  }

  const IC = {
    inicio: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    feed: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    juegos: '<rect x="3" y="8" width="18" height="9" rx="4"/><path d="M8 12.5h3M9.5 11v3"/><circle cx="16" cy="12.5" r=".6" fill="currentColor"/>',
    canal: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none"/>',
    mensajes: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    amigos: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c0-3.3 3-5 5.5-5s5.5 1.7 5.5 5"/><path d="M16 6.5a3 3 0 010 6"/>',
    chat: '<path d="M5 5h14v10H9l-4 4z"/>',
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M5 20c0-4 3.2-6 7-6s7 2 7 6"/>',
    admin: '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/>',
    tienda: '<path d="M5 8h14l-1 11H6z"/><path d="M9 8a3 3 0 016 0"/>',
    salir: '<path d="M14 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2v-2"/><path d="M10 12h10m0 0l-3-3m3 3l-3 3"/>',
  };
  function ic(n) { return '<svg class="pf-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + "</svg>"; }

  let me = null, vt = [], rt = [], cur = "inicio";
  function clearView() { vt.forEach((t) => clearInterval(t)); vt = []; window.YATH_CONV = null; }

  async function boot() {
    const params = new URLSearchParams(location.search);
    const oauth = params.get("oauth");
    if (oauth) history.replaceState(null, "", location.pathname);
    if (oauth === "setup") { setupScreen(); return; }
    const { d } = await api("/api/hub/me", AH);
    if (!d || !d.ok) { root.innerHTML = '<p class="pf-loading">No responde. Probá en un rato.</p>'; return; }
    if (!d.logged) { login(oauth); return; }
    me = d;
    if (oauth === "migrated") { migrationModal(() => app()); return; }
    app();
  }
  async function enterApp() { const { d } = await api("/api/hub/me", AH); if (d && d.logged) { me = d; app(); } else login("error"); }

  /* ---------- Login (solo Google) ---------- */
  var GBTN = '<svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:-4px;margin-right:8px" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 5.9 12 5.9c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 11.5S6.9 20.7 12 20.7c5.3 0 8.8-3.7 8.8-9 0-.6-.06-1-.15-1.5H12z"/></svg>';
  function gbtn(label) { return '<a href="/api/auth/google" style="display:flex;align-items:center;justify-content:center;background:#fff;color:#111;font-weight:800;border-radius:10px;padding:13px 18px;text-decoration:none;margin-top:6px">' + GBTN + (label || "Entrar con Google") + "</a>"; }
  function login(err) {
    const emsg = err === "error" ? "No se pudo entrar con Google. Probá de nuevo." : err === "banned" ? "Tu cuenta está suspendida." : err === "off" ? "El ingreso con Google todavía no está activo. Volvé en un rato." : "";
    root.innerHTML =
      '<div style="max-width:380px;margin:12vh auto 0;text-align:center" class="pf-auth"><div class="pf-body">' +
      '<h2 class="pf-ctitle" style="padding:0 0 4px">Entrá a youarethead</h2>' +
      '<p class="pf-dimc" style="padding:0 0 14px">Una cuenta, una identidad. Entrá con Google: rápido y seguro.</p>' +
      (emsg ? '<p class="pf-msg" style="color:#ff6b6b;margin:0 0 8px">' + emsg + '</p>' : '') +
      gbtn("Entrar con Google") +
      '</div></div>';
  }
  function migrationModal(done) {
    root.innerHTML =
      '<div style="max-width:400px;margin:10vh auto 0;text-align:center" class="pf-auth"><div class="pf-body">' +
      '<h2 class="pf-ctitle" style="padding:0 0 6px">Nos fue mejor de lo esperado</h2>' +
      '<p class="pf-dimc" style="padding:0 0 14px">Superamos todas las expectativas de usuarios. Para mantener tu cuenta segura, ahora se entra con Google. Tu cuenta, tus amigos y tus posts siguen igual.</p>' +
      '<button class="pf-btn" id="mg-ok" style="width:100%">Entendido</button>' +
      '</div></div>';
    root.querySelector("#mg-ok").onclick = done;
  }
  async function setupScreen() {
    const { d } = await api("/api/auth/google/pending", AH);
    if (!d || !d.ok) { login("error"); return; }
    const suggest = d.suggest || "";
    root.innerHTML =
      '<div style="max-width:400px;margin:8vh auto 0" class="pf-auth"><div class="pf-body">' +
      '<h2 class="pf-ctitle" style="padding:0 0 6px;text-align:center">Nos fue mejor de lo esperado</h2>' +
      '<p class="pf-dimc" style="padding:0 0 12px;text-align:left">Superamos todas las expectativas de usuarios. Para mantener tu cuenta segura migramos el ingreso a Google. Una última cosa:</p>' +
      '<p style="font-weight:700;text-align:center;margin:0 0 10px">¿Ya tenías cuenta acá antes?</p>' +
      '<div class="pf-row"><button class="pf-btn" id="s-yes" style="flex:1">Sí, ya tenía</button><button class="pf-btn ghost" id="s-no" style="flex:1">No, soy nuevo</button></div>' +
      '<p class="pf-msg" id="s-msg"></p>' +
      '<div id="s-link" style="display:none;border-top:1px solid rgba(255,255,255,.1);margin-top:10px;padding-top:12px">' +
        '<p class="pf-dimc" style="text-align:left;margin:0 0 8px">Vinculá tu cuenta vieja con tu nick de siempre y tu PIN.</p>' +
        '<input class="pf-input" id="s-lnick" maxlength="14" placeholder="tu nick viejo" style="margin-bottom:8px" />' +
        '<input class="pf-input" id="s-lpin" type="password" inputmode="numeric" maxlength="6" placeholder="tu PIN viejo" />' +
        '<button class="pf-btn" id="s-lgo" style="margin-top:8px;width:100%">Vincular y entrar</button>' +
      '</div>' +
      '<div id="s-new" style="display:none;border-top:1px solid rgba(255,255,255,.1);margin-top:10px;padding-top:12px">' +
        '<p class="pf-dimc" style="text-align:left;margin:0 0 8px">Elegí tu nick (así te van a ver los demás).</p>' +
        '<input class="pf-input" id="s-nnick" maxlength="14" placeholder="tu nick" value="' + esc(suggest) + '" />' +
        '<button class="pf-btn" id="s-ngo" style="margin-top:8px;width:100%">Crear mi cuenta</button>' +
      '</div></div></div>';
    const msg = root.querySelector("#s-msg");
    const showB = (which) => { root.querySelector("#s-link").style.display = which === "link" ? "block" : "none"; root.querySelector("#s-new").style.display = which === "new" ? "block" : "none"; };
    root.querySelector("#s-yes").onclick = () => showB("link");
    root.querySelector("#s-no").onclick = () => showB("new");
    root.querySelector("#s-lgo").onclick = async () => { msg.textContent = "..."; const res = await api("/api/auth/google/link", { method: "POST", headers: JH, body: JSON.stringify({ nick: root.querySelector("#s-lnick").value.trim(), pin: root.querySelector("#s-lpin").value.trim() }) }); if (res.r.ok && res.d && res.d.logged) enterApp(); else msg.textContent = (res.d && res.d.message) || "No se pudo."; };
    root.querySelector("#s-ngo").onclick = async () => { msg.textContent = "..."; const res = await api("/api/auth/google/new", { method: "POST", headers: JH, body: JSON.stringify({ nick: root.querySelector("#s-nnick").value.trim() }) }); if (res.r.ok && res.d && res.d.logged) enterApp(); else msg.textContent = (res.d && res.d.message) || "No se pudo."; };
  }

  /* ---------- Shell ---------- */
  function app() {
    const myHead = me.char ? me.char.head : "o";
    root.innerHTML =
      '<div class="pf-app">' +
        '<aside class="pf-left"><a href="/" class="pf-brand">youarethead.com.ar</a><nav class="pf-nav" id="pf-nav">' +
          '<a href="/">' + ic("inicio") + '<span>Inicio</span></a>' + navItem("feed", "Feed") +
          navItem("mensajes", "Mensajes") + navItem("amigos", "Amigos") + navItem("chat", "Chat Global") +
          navItem("juegos", "Juegos") + navItem("tienda", "Tienda") + navItem("canal", "Insomnio Crónico") +
          navItem("perfil", "Perfil") + (me.admin ? navItem("admin", "Admin") : "") +
          '<button class="pf-postbtn" id="pf-postbtn">Postear</button>' +
          '<div class="pf-me" id="pf-me"><span class="pf-ava">' + avaPic(me.avatar, myHead) + '</span><div><b>' + esc(me.nick) + '</b><span>@' + esc(me.nick) + '</span></div></div>' +
          '<button class="pf-logout" id="pf-logout">' + ic("salir") + '<span>Cerrar sesión</span></button>' +
        '</nav></aside>' +
        '<main class="pf-center"><div class="pf-chead" id="pf-chead"></div><div id="pf-body"></div></main>' +
        '<aside class="pf-right" id="pf-right"></aside>' +
      '</div>';
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => { b.onclick = () => setView(b.getAttribute("data-v")); });
    root.querySelector("#pf-postbtn").onclick = () => { setView("feed"); const t = root.querySelector("#pf-post"); if (t) t.focus(); };
    root.querySelector("#pf-me").onclick = () => setView("perfil");
    root.querySelector("#pf-logout").onclick = async () => { await api("/api/hub/logout", { method: "POST", headers: JH, body: "{}" }); boot(); };
    rightRail();
    setView("feed");
  }
  function navItem(v, label) {
    if (v === "juegos") return '<a href="/tristos">' + ic("juegos") + "<span>" + label + "</span></a>";
    if (v === "canal") return '<a href="https://www.youtube.com/@tristoban" target="_blank" rel="noopener">' + ic("canal") + "<span>" + label + "</span></a>";
    if (v === "tienda") return '<button class="pf-soon" disabled>' + ic("tienda") + "<span>" + label + '</span><span class="pf-badge">pronto</span></button>';
    return '<button data-v="' + v + '">' + ic(v) + "<span>" + label + "</span></button>";
  }
  function chead(title, tabsHTML) { root.querySelector("#pf-chead").innerHTML = '<div class="pf-ctitle">' + title + "</div>" + (tabsHTML || ""); }
  function body() { return root.querySelector("#pf-body"); }
  function setView(v) {
    clearView(); cur = v;
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-v") === v));
    if (v === "feed") viewFeed();
    else if (v === "amigos") viewAmigos();
    else if (v === "mensajes") viewMsgs();
    else if (v === "chat") viewChat();
    else if (v === "admin") viewAdmin();
    else viewCuenta();
  }

  /* ---------- Feed ---------- */
  function postHTML(p) { return '<div class="pf-post"><span class="pf-ava">' + avaPic(p.avatar, headFor(p.nick)) + '</span><div class="pf-pb"><div class="pf-ph"><b>' + esc(p.nick) + '</b><span>@' + esc(p.nick) + " · " + cuando(p.t) + '</span></div><p>' + esc(p.body) + "</p></div></div>"; }
  function viewFeed() {
    let scope = "ti";
    chead("Feed", '<div class="pf-tabs2"><button data-s="ti" class="on">Para ti</button><button data-s="amigos">Amigos</button></div>');
    body().innerHTML =
      '<div class="pf-comp"><span class="pf-ava">' + avaPic(me.avatar, me.char ? me.char.head : "o") + '</span><div class="pf-cbox"><textarea id="pf-post" maxlength="280" placeholder="¿Qué está pasando ahí adentro?"></textarea><div class="pf-crow"><button class="pf-cbtn" id="pf-pub">Postear</button></div><p class="pf-msg" id="pf-pmsg"></p></div></div>' +
      '<div id="pf-feed"><p class="pf-dimc">Cargando…</p></div>';
    async function load() {
      const { d } = await api("/api/social/feed" + (scope === "amigos" ? "?scope=amigos" : ""), AH);
      const box = body().querySelector("#pf-feed"); if (!box) return;
      const posts = (d && d.posts) || [];
      box.innerHTML = posts.length ? posts.map(postHTML).join("") : '<p class="pf-empty">' + (scope === "amigos" ? "Tus amigos no postearon nada todavía." : "Nadie publicó nada. Sé la primera voz del encierro.") + "</p>";
    }
    load(); vt.push(setInterval(() => { if (!document.hidden) load(); }, 12000));
    root.querySelector("#pf-chead").querySelectorAll("[data-s]").forEach((b) => { b.onclick = () => { scope = b.getAttribute("data-s"); root.querySelectorAll("#pf-chead [data-s]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); load(); }; });
    body().querySelector("#pf-pub").onclick = async () => { const ta = body().querySelector("#pf-post"), pm = body().querySelector("#pf-pmsg"); pm.textContent = "..."; const { r, d } = await api("/api/social/post", { method: "POST", headers: JH, body: JSON.stringify({ body: ta.value }) }); if (r.ok) { ta.value = ""; pm.textContent = ""; scope = "ti"; root.querySelectorAll("#pf-chead [data-s]").forEach((x) => x.classList.toggle("on", x.getAttribute("data-s") === "ti")); load(); } else pm.textContent = (d && d.message) || "No se pudo."; };
  }

  /* ---------- Admin ---------- */
  function viewAdmin() {
    chead("Admin");
    body().innerHTML =
      '<div class="pf-row"><input class="pf-input" id="ad-q" maxlength="20" placeholder="buscar por nick…" /><button class="pf-btn" id="ad-go">Buscar</button></div>' +
      '<p class="pf-msg" id="ad-msg" style="min-height:1em"></p>' +
      '<div id="ad-list"><p class="pf-dimc">Cargando…</p></div>';
    const qEl = body().querySelector("#ad-q"), am = body().querySelector("#ad-msg");
    async function load() {
      const q = qEl.value.trim();
      const { d } = await api("/api/admin/users" + (q ? "?q=" + encodeURIComponent(q) : ""), AH);
      const box = body().querySelector("#ad-list"); if (!box) return;
      if (!d || !d.ok) { box.innerHTML = '<p class="pf-empty">No se pudo cargar (¿sos admin?).</p>'; return; }
      const us = d.users || [];
      box.innerHTML = us.length ? us.map((u) => {
        const tag = u.admin ? ' <span class="pf-dimc">· admin</span>' : (u.banned ? ' <span style="color:#D23B47">· baneado</span>' : "");
        const rs = u.banned && u.reason ? '<br><span class="pf-dimc">' + esc(u.reason) + "</span>" : "";
        const btn = u.admin ? "" : (u.banned ? '<button class="pf-btn ghost pf-mini" data-unban="' + esc(u.nick) + '">Desbanear</button>' : '<button class="pf-btn pf-mini" data-ban="' + esc(u.nick) + '">Banear</button>');
        return '<div class="pf-fila"><span><b>' + esc(u.nick) + "</b>" + tag + rs + "</span>" + btn + "</div>";
      }).join("") : '<p class="pf-empty">Sin resultados.</p>';
      box.querySelectorAll("[data-ban]").forEach((b) => b.onclick = async () => {
        const nick = b.getAttribute("data-ban");
        const reason = window.prompt("Motivo del baneo a " + nick + " (opcional):", "") || "";
        am.textContent = "..."; const { r, dd } = await api("/api/admin/ban", { method: "POST", headers: JH, body: JSON.stringify({ nick, reason }) }).then((x) => ({ r: x.r, dd: x.d }));
        am.textContent = r.ok ? "Baneado: " + nick : ((dd && dd.message) || "No se pudo."); load();
      });
      box.querySelectorAll("[data-unban]").forEach((b) => b.onclick = async () => {
        const nick = b.getAttribute("data-unban");
        am.textContent = "..."; const { r, dd } = await api("/api/admin/unban", { method: "POST", headers: JH, body: JSON.stringify({ nick }) }).then((x) => ({ r: x.r, dd: x.d }));
        am.textContent = r.ok ? "Desbaneado: " + nick : ((dd && dd.message) || "No se pudo."); load();
      });
    }
    body().querySelector("#ad-go").onclick = load;
    qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
    load();
  }

  /* ---------- Amigos ---------- */
  function viewAmigos() {
    chead("Amigos");
    body().innerHTML = '<div class="pf-row"><input class="pf-input" id="a-q" maxlength="14" placeholder="buscar por nick…" /><button class="pf-btn" id="a-go">Buscar</button></div><div id="a-res"></div><div id="a-sol"></div><h3 class="pf-h">Tus amigos</h3><div id="a-list"><p class="pf-dimc">Cargando…</p></div>';
    async function load() {
      const { d } = await api("/api/social/amigos", AH); if (!d || !d.ok) return;
      const sol = body().querySelector("#a-sol");
      sol.innerHTML = (d.recibidas || []).length ? '<h3 class="pf-h">Solicitudes</h3>' + d.recibidas.map((n) => '<div class="pf-fila"><b>' + esc(n) + '</b><span><button class="pf-btn pf-mini" data-ok="' + esc(n) + '">Aceptar</button> <button class="pf-btn ghost pf-mini" data-no="' + esc(n) + '">No</button></span></div>').join("") : "";
      const lst = body().querySelector("#a-list");
      lst.innerHTML = (d.amigos || []).length ? d.amigos.map((n) => '<div class="pf-fila"><b>' + esc(n) + '</b><button class="pf-btn ghost pf-mini" data-dm="' + esc(n) + '">Mensaje</button></div>').join("") : '<p class="pf-dimc">Todavía no tenés amigos.' + ((d.enviadas || []).length ? " Pendientes: " + d.enviadas.map(esc).join(", ") + "." : "") + "</p>";
      body().querySelectorAll("[data-ok]").forEach((b) => b.onclick = async () => { await api("/api/social/amigos/responder", { method: "POST", headers: JH, body: JSON.stringify({ nick: b.getAttribute("data-ok"), aceptar: true }) }); load(); });
      body().querySelectorAll("[data-no]").forEach((b) => b.onclick = async () => { await api("/api/social/amigos/responder", { method: "POST", headers: JH, body: JSON.stringify({ nick: b.getAttribute("data-no"), aceptar: false }) }); load(); });
      body().querySelectorAll("[data-dm]").forEach((b) => b.onclick = () => { window.__dmOpen = b.getAttribute("data-dm"); setView("mensajes"); });
    }
    load();
    async function buscar() {
      const q = body().querySelector("#a-q").value.trim(), res = body().querySelector("#a-res");
      if (q.length < 2) { res.innerHTML = '<p class="pf-dimc">Al menos 2 letras.</p>'; return; }
      const { d } = await api("/api/social/usuarios?q=" + encodeURIComponent(q), AH);
      const us = (d && d.usuarios) || [];
      res.innerHTML = us.length ? us.map((n) => '<div class="pf-fila"><b>' + esc(n) + '</b><button class="pf-btn pf-mini" data-add="' + esc(n) + '">Agregar</button></div>').join("") : '<p class="pf-dimc">Nadie con ese nick.</p>';
      res.querySelectorAll("[data-add]").forEach((b) => b.onclick = async () => { const { d: dd } = await api("/api/social/amigos/pedir", { method: "POST", headers: JH, body: JSON.stringify({ nick: b.getAttribute("data-add") }) }); b.outerHTML = '<span class="pf-dimc">' + esc((dd && dd.message) || "Listo") + "</span>"; load(); });
    }
    body().querySelector("#a-go").onclick = buscar;
    body().querySelector("#a-q").addEventListener("keydown", (e) => { if (e.key === "Enter") buscar(); });
  }

  /* ---------- Mensajes (DM + grupos) ---------- */
  function viewMsgs() {
    chead("Mensajes", '<div class="pf-row" style="padding:0 18px 12px"><button class="pf-btn pf-mini" id="m-new">+ Nuevo grupo</button></div>');
    body().innerHTML = '<div class="pf-dm"><div class="pf-dml" id="m-list"><p class="pf-dimc">Cargando…</p></div><div id="m-conv"><p class="pf-dimc">Elegí un amigo o grupo.</p></div></div>';
    let con = window.__dmOpen || null, g = null, maxId = 0; window.__dmOpen = null;
    function mark(b) { body().querySelectorAll(".pf-dmf").forEach((x) => x.classList.remove("on")); if (b) b.classList.add("on"); }
    async function loadList() {
      const ra = await api("/api/social/amigos", AH), rg = await api("/api/social/grupos", AH);
      const box = body().querySelector("#m-list"); if (!box) return;
      const am = (ra.d && ra.d.amigos) || [], gs = (rg.d && rg.d.grupos) || [];
      let h = "";
      if (gs.length) h += '<p class="pf-h">Grupos</p>' + gs.map((x) => '<button class="pf-dmf" data-g="' + x.id + '" data-n="' + esc(x.nombre) + '"># ' + esc(x.nombre) + " (" + x.miembros + ")</button>").join("");
      h += '<p class="pf-h">Amigos</p>' + (am.length ? am.map((n) => '<button class="pf-dmf" data-d="' + esc(n) + '">' + esc(n) + "</button>").join("") : '<p class="pf-dimc">Sin amigos.</p>');
      box.innerHTML = h;
      box.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { con = b.getAttribute("data-d"); g = null; maxId = 0; mark(b); clearView(); dm(); });
      box.querySelectorAll("[data-g]").forEach((b) => b.onclick = () => { g = { id: Number(b.getAttribute("data-g")), nombre: b.getAttribute("data-n") }; con = null; maxId = 0; mark(b); clearView(); grp(); });
    }
    function shell2(head) { body().querySelector("#m-conv").innerHTML = '<div class="pf-dmh">' + head + '</div><div class="pf-dmlog" id="m-log"></div><div class="pf-row" style="margin-top:8px"><input class="pf-input" id="m-txt" maxlength="300" placeholder="escribí…" autocomplete="off" /><button class="pf-btn" id="m-send">Enviar</button></div><p class="pf-msg" id="m-em"></p>'; }
    function add(m, grupo) { const log = body().querySelector("#m-log"); const div = document.createElement("div"); div.className = "pf-m" + (m.mio ? " mio" : ""); if (grupo && !m.mio && m.nick) { const n = document.createElement("b"); n.className = "pf-mn"; n.textContent = m.nick; div.appendChild(n); } div.appendChild(document.createTextNode(m.body)); log.appendChild(div); if (m.id > maxId) maxId = m.id; }
    function dm() {
      window.YATH_CONV = { dm: con }; shell2("con <b>" + esc(con) + "</b>");
      const log = body().querySelector("#m-log"), txt = body().querySelector("#m-txt"), em = body().querySelector("#m-em");
      async function load() { if (!con) return; const first = maxId === 0; const { r, d } = await api("/api/social/dm?con=" + encodeURIComponent(con) + (maxId ? "&since=" + maxId : ""), AH); if (r.status === 403) { em.textContent = "Tienen que ser amigos."; return; } if (d && d.mensajes && d.mensajes.length) { d.mensajes.forEach((m) => add(m, false)); log.scrollTop = log.scrollHeight; if (!first && d.mensajes.some((m) => !m.mio)) ping(); } }
      load(); vt.push(setInterval(() => { if (!document.hidden) load(); }, 3000));
      async function send() { const t = txt.value.trim(); if (!t) return; const { r, d } = await api("/api/social/dm", { method: "POST", headers: JH, body: JSON.stringify({ nick: con, body: t }) }); if (r.ok && d && d.mensaje) { add(d.mensaje, false); log.scrollTop = log.scrollHeight; txt.value = ""; } else em.textContent = (d && d.message) || "No se pudo."; }
      body().querySelector("#m-send").onclick = send; txt.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    }
    function grp() {
      window.YATH_CONV = { g: g.id };
      shell2('<b># ' + esc(g.nombre) + '</b> · <a href="#" id="g-add">+ sumar amigo</a> · <a href="#" id="g-out">salir</a>');
      const log = body().querySelector("#m-log"), txt = body().querySelector("#m-txt"), em = body().querySelector("#m-em");
      async function load() { if (!g) return; const first = maxId === 0; const { r, d } = await api("/api/social/grupos/msgs?id=" + g.id + (maxId ? "&since=" + maxId : ""), AH); if (r.status === 403) { em.textContent = "Ya no estás en el grupo."; return; } if (d && d.ok && d.mensajes && d.mensajes.length) { d.mensajes.forEach((m) => add(m, true)); log.scrollTop = log.scrollHeight; if (!first && d.mensajes.some((m) => !m.mio)) ping(); } }
      load(); vt.push(setInterval(() => { if (!document.hidden) load(); }, 3000));
      async function send() { const t = txt.value.trim(); if (!t) return; const { r, d } = await api("/api/social/grupos/msg", { method: "POST", headers: JH, body: JSON.stringify({ id: g.id, body: t }) }); if (r.ok && d && d.mensaje) { add(d.mensaje, true); log.scrollTop = log.scrollHeight; txt.value = ""; } else em.textContent = (d && d.message) || "No se pudo."; }
      body().querySelector("#m-send").onclick = send; txt.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
      body().querySelector("#g-add").onclick = async (e) => { e.preventDefault(); const nick = window.prompt("Nick del amigo a sumar:"); if (!nick) return; const { d } = await api("/api/social/grupos/agregar", { method: "POST", headers: JH, body: JSON.stringify({ id: g.id, nick: nick.trim() }) }); em.textContent = (d && d.message) || "Listo."; loadList(); };
      body().querySelector("#g-out").onclick = async (e) => { e.preventDefault(); if (!window.confirm("¿Salir del grupo?")) return; await api("/api/social/grupos/salir", { method: "POST", headers: JH, body: JSON.stringify({ id: g.id }) }); g = null; clearView(); viewMsgs(); };
    }
    body().parentNode && (root.querySelector("#m-new").onclick = async () => { const nombre = window.prompt("Nombre del grupo:"); if (!nombre) return; const { r, d } = await api("/api/social/grupos/crear", { method: "POST", headers: JH, body: JSON.stringify({ nombre: nombre.trim() }) }); if (r.ok && d && d.grupo) { g = { id: d.grupo.id, nombre: d.grupo.nombre }; con = null; maxId = 0; await loadList(); grp(); } else window.alert((d && d.message) || "No se pudo."); });
    loadList().then(() => { if (con) dm(); });
  }

  /* ---------- Chat Global (vista central) ---------- */
  function viewChat() {
    chead("Chat Global");
    body().innerHTML = '<div class="pf-gclog" id="c-log" style="height:auto;min-height:46vh"><p class="pf-dimc">Cargando…</p></div><div class="pf-gcform" style="border:0;padding:12px 0 0"><input id="c-txt" maxlength="200" placeholder="escribí en el chat global…" autocomplete="off" /><button class="pf-btn" id="c-send">Enviar</button></div><p class="pf-msg" id="c-em"></p>';
    const log = body().querySelector("#c-log"), txt = body().querySelector("#c-txt"); let maxId = 0, first = true;
    function add(m) { if (first) log.innerHTML = ""; const d = document.createElement("div"); d.className = "pf-gcm"; const b = document.createElement("b"); b.textContent = (m.name || "ANÓN") + ":"; const s = document.createElement("span"); s.textContent = " " + m.body; d.appendChild(b); d.appendChild(s); log.appendChild(d); if (m.id > maxId) maxId = m.id; }
    async function load() { const { d } = await api("/api/chat" + (maxId ? "?since=" + maxId : ""), AH); if (d && d.messages && d.messages.length) { const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80; d.messages.forEach(add); first = false; if (stick) log.scrollTop = log.scrollHeight; } else if (first) { log.innerHTML = '<p class="pf-dimc">Sé el primero.</p>'; } }
    load(); vt.push(setInterval(() => { if (!document.hidden) load(); }, 3000)); log.scrollTop = log.scrollHeight;
    async function send() { const t = txt.value.trim(); if (!t) return; const { r, d } = await api("/api/chat", { method: "POST", headers: JH, body: JSON.stringify({ body: t }) }); if (r.ok) { txt.value = ""; load(); } else body().querySelector("#c-em").textContent = (d && d.message) || "No se pudo."; }
    body().querySelector("#c-send").onclick = send; txt.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  }

  /* ---------- Cuenta ---------- */
  function viewCuenta() {
    chead("Perfil");
    const d = me, desde = d.desde ? new Date(d.desde).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "";
    body().innerHTML =
      '<div style="display:flex;gap:14px;align-items:center">' +
        '<span class="pf-ava" id="c-ava" style="width:56px;height:64px;cursor:pointer" title="Cambiar foto">' + avaPic(d.avatar, d.char ? d.char.head : "o") + '</span>' +
        '<div style="min-width:0"><div style="font-size:20px;font-weight:800">' + esc(d.nick) + '</div>' +
        '<div class="pf-dimc" style="padding:0">' + esc(maskMail(d.email)) + (desde ? " · desde " + desde : "") + '</div>' +
        '<div class="pf-row" style="margin-top:6px"><button class="pf-btn ghost pf-mini" id="c-photo">Cambiar foto</button>' + (d.avatar ? '<button class="pf-btn ghost pf-mini" id="c-photodel">Quitar</button>' : "") + '<span class="pf-msg" id="c-pmsg" style="margin:0"></span></div>' +
        '</div></div><input type="file" id="c-file" accept="image/*" style="display:none" />' +
      '<div style="margin-top:14px"><textarea class="pf-input" id="c-bio" maxlength="140" placeholder="Tu bio (140)" style="border-radius:12px;min-height:60px;width:100%">' + esc(d.bio || "") + '</textarea><div class="pf-row" style="margin-top:8px"><button class="pf-btn" id="c-bsave">Guardar bio</button><span class="pf-msg" id="c-bmsg"></span><button class="pf-btn ghost pf-mini" id="c-out" style="margin-left:auto">Salir</button></div></div>' +
      '<div class="pf-h">Tus números</div>' +
      '<div class="pf-fila"><b>El Botón</b><span>' + (d.caido ? "Caído N° " + fmt.format(d.caido) : "No caíste") + '</span></div>' +
      '<div class="pf-fila"><b>Récord TeTristo</b><span>' + fmt.format((d.best && d.best.tetristo) || 0) + '</span></div>' +
      '<div class="pf-fila"><b>Récord No Parpadees</b><span>' + fmt.format((d.best && d.best.parpadeo) || 0) + '</span></div>' +
      (d.char ? '<div class="pf-fila"><b>El Pueblo</b><span>Vida ' + d.char.vida + " · Hambre " + d.char.hambre + " · Sueño " + d.char.sueno + '</span></div>' : "");
    body().querySelector("#c-out").onclick = async () => { await api("/api/hub/logout", { method: "POST", headers: JH, body: "{}" }); boot(); };
    body().querySelector("#c-bsave").onclick = async () => { const bm = body().querySelector("#c-bmsg"); bm.textContent = "..."; const { r, d: dd } = await api("/api/hub/bio", { method: "POST", headers: JH, body: JSON.stringify({ bio: body().querySelector("#c-bio").value }) }); if (r.ok) { bm.textContent = "Guardada."; me.bio = dd && dd.bio; } else bm.textContent = (dd && dd.message) || "No se pudo."; };
    const fileEl = body().querySelector("#c-file"), pmsg = body().querySelector("#c-pmsg"), pick = () => fileEl.click();
    body().querySelector("#c-photo").onclick = pick; body().querySelector("#c-ava").onclick = pick;
    const setChip = () => { const chip = root.querySelector("#pf-me .pf-ava"); if (chip) chip.innerHTML = avaPic(me.avatar, me.char ? me.char.head : "o"); };
    fileEl.onchange = () => { const f = fileEl.files && fileEl.files[0]; if (!f) return; pmsg.textContent = "Subiendo…"; resizeImg(f, async (dataUrl) => { if (!dataUrl) { pmsg.textContent = "No se pudo leer la imagen."; return; } const { r, d: dd } = await api("/api/hub/avatar", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl }) }); if (r.ok) { me.avatar = dd.avatar; setChip(); viewCuenta(); } else pmsg.textContent = (dd && dd.message) || "No se pudo."; }); };
    const del = body().querySelector("#c-photodel"); if (del) del.onclick = async () => { pmsg.textContent = "..."; const { r } = await api("/api/hub/avatar", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl: null }) }); if (r.ok) { me.avatar = null; setChip(); viewCuenta(); } };
  }

  /* ---------- Columna derecha (persistente): Chat Global + Mensajes ---------- */
  function rightRail() {
    const r = root.querySelector("#pf-right"); if (!r) return;
    r.innerHTML =
      '<div class="pf-widget"><div class="pf-wh">Chat Global<span class="pf-live"><i></i>En vivo</span></div><div class="pf-gclog" id="rg-log"></div><div class="pf-gcform"><input id="rg-txt" maxlength="200" placeholder="escribí un mensaje…" autocomplete="off" /><button class="pf-btn pf-mini" id="rg-send">›</button></div><a class="pf-wlink" id="rg-full">Abrir en pantalla completa →</a></div>' +
      '<div class="pf-widget"><div class="pf-wh">Mensajes</div><div id="rg-prev"><p class="pf-dimc">Cargando…</p></div></div>';
    const log = r.querySelector("#rg-log"), txt = r.querySelector("#rg-txt"); let maxId = 0, first = true;
    function add(m) { if (first) log.innerHTML = ""; const d = document.createElement("div"); d.className = "pf-gcm"; const b = document.createElement("b"); b.textContent = (m.name || "ANÓN") + ":"; const s = document.createElement("span"); s.textContent = " " + m.body; d.appendChild(b); d.appendChild(s); log.appendChild(d); if (m.id > maxId) maxId = m.id; if (window.YATH_villager && m.name) window.YATH_villager(m.name); }
    async function load() { const { d } = await api("/api/chat" + (maxId ? "?since=" + maxId : ""), AH); if (d && d.messages && d.messages.length) { const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80; d.messages.forEach(add); first = false; if (stick) log.scrollTop = log.scrollHeight; } else if (first) { log.innerHTML = '<p class="pf-dimc" style="padding:14px">Silencio…</p>'; } }
    load(); rt.push(setInterval(() => { if (!document.hidden) load(); }, 3500));
    async function send() { const t = txt.value.trim(); if (!t) return; const { r: rr } = await api("/api/chat", { method: "POST", headers: JH, body: JSON.stringify({ body: t }) }); if (rr.ok) { txt.value = ""; load(); } }
    r.querySelector("#rg-send").onclick = send; txt.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    r.querySelector("#rg-full").onclick = () => setView("chat");
    async function prev() { const { d } = await api("/api/social/amigos", AH); const box = r.querySelector("#rg-prev"); if (!box) return; const am = (d && d.amigos) || []; box.innerHTML = am.length ? am.slice(0, 6).map((n) => '<div class="pf-prev" data-n="' + esc(n) + '"><span class="pf-ava">' + avatar(headFor(n)) + '</span><div><b>' + esc(n) + '</b><span>tocá para escribir</span></div></div>').join("") : '<p class="pf-dimc" style="padding:14px">Agregá amigos para chatear.</p>'; box.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => { window.__dmOpen = b.getAttribute("data-n"); setView("mensajes"); }); }
    prev(); rt.push(setInterval(() => { if (!document.hidden) prev(); }, 20000));
  }

  boot();
})();
