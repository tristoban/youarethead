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
  const PLATS = [
    ["instagram", "Instagram", '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/>'],
    ["youtu", "YouTube", '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.5 9.2l4.5 2.8-4.5 2.8z" fill="currentColor" stroke="none"/>'],
    ["tiktok", "TikTok", '<path d="M14 4c.4 2.4 1.9 3.9 4.3 4.1v2.6c-1.6 0-3.1-.5-4.3-1.4V15a4.8 4.8 0 11-4.8-4.8c.3 0 .6 0 .9.1v2.6a2.2 2.2 0 101.6 2.1V4z"/>'],
    ["twitch", "Twitch", '<path d="M5 3h15v10l-4 4h-4l-3 3H6v-3H5z"/><path d="M11 8v4M15.5 8v4"/>'],
    ["steam", "Steam", '<circle cx="12" cy="12" r="9"/><circle cx="15.2" cy="9" r="2.2"/><circle cx="9" cy="15" r="1.9"/>'],
    ["whatsapp", "WhatsApp", '<path d="M4 20l1.4-3.8A8 8 0 1112 20a8 8 0 01-4-1.1z"/>'],
    ["wa.me", "WhatsApp", '<path d="M4 20l1.4-3.8A8 8 0 1112 20a8 8 0 01-4-1.1z"/>'],
    ["discord", "Discord", '<path d="M6 7a15 15 0 0112 0l2 9-3.2 2-1.4-2a10 10 0 01-6.8 0L7.2 18 4 16z"/>'],
    ["spotify", "Spotify", '<circle cx="12" cy="12" r="9"/><path d="M7.5 10c3.5-1 6.5-.5 9 1M8.5 13c2.6-.7 4.6-.3 6.5.8"/>'],
    ["nintendo", "Nintendo", '<rect x="4" y="4" width="16" height="16" rx="6"/><path d="M12 4v16"/><circle cx="8.5" cy="9" r="1.3" fill="currentColor" stroke="none"/>'],
    ["x.com", "X", '<path d="M5 5l14 14M19 5L5 19"/>'],
    ["twitter", "X", '<path d="M5 5l14 14M19 5L5 19"/>'],
  ];
  function platOf(url) { const u = String(url).toLowerCase(); for (const p of PLATS) if (u.includes(p[0])) return p; return ["", "Link", '<circle cx="12" cy="12" r="9"/><path d="M3.5 12h17M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/>']; }
  function linkSvg(paths) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>"; }
  function uname(nick) { return '<b class="pf-u" data-u="' + esc(nick) + '">' + esc(nick) + "</b>"; }
  function rich(s) {
    let h = esc(s == null ? "" : s);
    h = h.replace(/(^|[\s(>])@([a-zA-Z0-9_]{2,14})/g, '$1<b class="pf-u" data-u="$2">@$2</b>');
    h = h.replace(/(^|[\s(>])#([a-zA-Z0-9_]{2,40})/g, '$1<a class="pf-tag2" data-tag="$2">#$2</a>');
    h = h.replace(/(^|[\s(>])\$([0-9]{1,9})/g, '$1<a class="pf-ref" data-post="$2">$$2</a>');
    return h.replace(/\n/g, "<br>");
  }
  function skull() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2C7.3 2 4 5.4 4 9.8c0 2.2.9 3.9 2.4 5.2.3.3.6.7.6 1.2V18c0 1 .8 1.8 1.8 1.8h.4v-1.6h1.6v1.6h1.6v-1.6h1.6v1.6h.4c1 0 1.8-.8 1.8-1.8v-1.8c0-.5.3-.9.6-1.2C19.1 13.7 20 12 20 9.8 20 5.4 16.7 2 12 2zM8.6 11.3a1.7 1.7 0 110-3.4 1.7 1.7 0 010 3.4zm6.8 0a1.7 1.7 0 110-3.4 1.7 1.7 0 010 3.4zM12 12.4l1 2h-2l1-2z"/></svg>'; }
  function likeBtn(p) { return '<button class="pf-like' + (p.liked ? " on" : "") + '" data-like="' + p.id + '" type="button" title="Me cala">' + skull() + "<span>" + (p.nlik || 0) + "</span></button>"; }
  async function toggleLike(btn) {
    const id = btn.getAttribute("data-like");
    const { r, d } = await api("/api/social/like", { method: "POST", headers: JH, body: JSON.stringify({ postId: Number(id) }) });
    if (r.ok && d) { btn.classList.toggle("on", !!d.liked); const sp = btn.querySelector("span"); if (sp) sp.textContent = d.count; }
  }
  async function toggleClike(btn) {
    const id = btn.getAttribute("data-clike");
    const { r, d } = await api("/api/social/clike", { method: "POST", headers: JH, body: JSON.stringify({ commentId: Number(id) }) });
    if (r.ok && d) { btn.classList.toggle("on", !!d.liked); const sp = btn.querySelector("span"); if (sp) sp.textContent = d.count; }
  }
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
  function resizeBanner(file, cb) {
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => {
      const W = 1000, H = 300, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d"), scale = Math.max(W / img.width, H / img.height), w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      try { cb(cv.toDataURL("image/jpeg", 0.8)); } catch (_) { cb(null); }
    }; img.onerror = () => cb(null); img.src = String(fr.result); };
    fr.onerror = () => cb(null); fr.readAsDataURL(file);
  }

  const IC = {
    inicio: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    feed: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    notifs: '<path d="M6 9a6 6 0 1112 0c0 4 1.6 5.4 2 6H4c.4-.6 2-2 2-6"/><path d="M10 19a2 2 0 004 0"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
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
    const um = location.pathname.match(/^\/u\/(.+)$/);
    const wantUser = um ? decodeURIComponent(um[1]) : null;
    const { d } = await api("/api/hub/me", AH);
    if (!d || !d.ok) { root.innerHTML = '<p class="pf-loading">No responde. Probá en un rato.</p>'; return; }
    if (!d.logged) { if (wantUser) { guestProfile(wantUser); return; } login(oauth); return; }
    me = d;
    if (oauth === "migrated") { migrationModal(() => app()); return; }
    app();
    if (wantUser) viewUser(wantUser);
  }
  async function guestProfile(nick) {
    const { r, d } = await api("/api/social/perfil?nick=" + encodeURIComponent(nick), AH);
    if (!r.ok || !d || !d.ok) { root.innerHTML = '<div class="pf-guest"><p class="pf-empty">No se encontró ese perfil.</p><a class="pf-btn pf-spin" href="/yata">Entrá a youarethead</a></div>'; return; }
    const p = d.perfil, acc = (typeof p.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(p.accent)) ? p.accent : "var(--pf-acc)";
    const links = (Array.isArray(p.links) ? p.links : []).map((l) => { const pl = platOf(l.url); return '<a class="pf-link" href="' + esc(l.url) + '" target="_blank" rel="noopener"><span class="pf-link-i">' + linkSvg(pl[2]) + '</span><span class="pf-link-t">' + esc(l.title) + '</span><span class="pf-link-x">&#8599;</span></a>'; }).join("");
    const banner = p.banner ? '<div class="pf-banner" style="background-image:url(\'' + esc(p.banner) + '\')"></div>' : '<div class="pf-banner" style="background:linear-gradient(120deg,' + acc + '22,#0a0a0d)"></div>';
    root.innerHTML = '<div class="pf-guest">' + banner +
      '<div class="pf-uhead"><span class="pf-ava pf-uava">' + avaPic(p.avatar, headFor(p.nick)) + "</span></div>" +
      '<div class="pf-uname">' + esc(p.nick) + " " + badges(p) + "</div>" +
      '<div class="pf-dimc" style="padding:2px 0">@' + esc(p.nick) + (p.estado ? " · " + esc(p.estado) : "") + "</div>" +
      (p.bio ? '<p style="margin:8px 0 0;white-space:pre-wrap">' + esc(p.bio) + "</p>" : "") +
      (links ? '<div class="pf-links">' + links + "</div>" : "") +
      '<a class="pf-btn pf-spin" href="/yata" style="margin-top:18px;display:inline-flex">Entrá a youarethead</a>' +
      "</div>";
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
          '<button data-v="notifs" id="pf-navnotif">' + ic("notifs") + '<span>Notificaciones</span><i class="pf-ndot" id="pf-nb"></i></button>' +
          navItem("mensajes", "Mensajes") + navItem("amigos", "Amigos") + navItem("chat", "Chat Global") +
          navItem("juegos", "Juegos") + navItem("tienda", "Tienda") + navItem("canal", "Insomnio Crónico") +
          navItem("perfil", "Perfil") + (me.admin ? navItem("admin", "Admin") : "") +
          '<button class="pf-postbtn" id="pf-postbtn">Postear</button>' +
          '<div class="pf-me" id="pf-me"><span class="pf-ava">' + avaPic(me.avatar, myHead) + '</span><div><b>' + esc(me.nick) + '</b><span>@' + esc(me.nick) + '</span></div></div>' +
          '<button class="pf-logout" id="pf-logout">' + ic("salir") + '<span>Cerrar sesión</span></button>' +
        '</nav></aside>' +
        '<main class="pf-center"><div class="pf-chead" id="pf-chead"></div><div id="pf-body"></div></main>' +
        '<aside class="pf-right" id="pf-right"></aside>' +
      '</div>' +
      '<header class="pf-topbar"><a href="/" class="pf-tb-brand">youarethead</a><button class="pf-tbell" id="pf-tbell" type="button" aria-label="Notificaciones">' + ic("notifs") + '<span class="pf-tb-badge" id="pf-tbell-b" style="display:none">0</span></button></header>' +
      '<nav class="pf-tabbar">' +
        '<button class="pf-tab" data-v="feed" type="button">' + ic("inicio") + '<span>Inicio</span></button>' +
        '<button class="pf-tab" data-v="amigos" type="button">' + ic("amigos") + '<span>Amigos</span></button>' +
        '<button class="pf-tab pf-tab-mas" id="pf-tabmas" type="button" aria-label="Más">' + ic("mas") + '</button>' +
        '<button class="pf-tab" data-v="mensajes" type="button">' + ic("mensajes") + '<span>Mensajes</span></button>' +
        '<button class="pf-tab" data-v="perfil" type="button">' + ic("perfil") + '<span>Perfil</span></button>' +
      '</nav>' +
      '<div class="pf-sheet" id="pf-sheet" hidden><div class="pf-sheet-bg" id="pf-sheetbg"></div><div class="pf-sheet-card">' +
        '<div class="pf-sheet-h">¿Qué querés hacer?</div>' +
        '<button class="pf-sheet-i" data-act="postear" type="button">' + ic("feed") + '<span>Postear</span></button>' +
        '<a class="pf-sheet-i" href="/tristos">' + ic("juegos") + '<span>Juegos</span></a>' +
        '<button class="pf-sheet-i" data-act="chat" type="button">' + ic("chat") + '<span>Chat global</span></button>' +
        '<button class="pf-sheet-i" data-act="amigos" type="button">' + ic("amigos") + '<span>Buscar amigos</span></button>' +
        '<button class="pf-sheet-cancel" id="pf-sheetx" type="button">Cerrar</button>' +
      '</div></div>';
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => { b.onclick = () => setView(b.getAttribute("data-v")); });
    root.querySelector("#pf-postbtn").onclick = () => { setView("feed"); const t = root.querySelector("#pf-post"); if (t) t.focus(); };
    root.querySelector("#pf-me").onclick = () => setView("perfil");
    root.querySelector("#pf-logout").onclick = async () => { await api("/api/hub/logout", { method: "POST", headers: JH, body: "{}" }); boot(); };
    if (!root.__uwired) { root.__uwired = true; root.addEventListener("click", (e) => {
      const t = e.target; if (!t || !t.closest) return;
      const u = t.closest("[data-u]"); if (u) { e.preventDefault(); viewUser(u.getAttribute("data-u")); return; }
      const tg = t.closest("[data-tag]"); if (tg) { e.preventDefault(); viewFeedTag(tg.getAttribute("data-tag")); return; }
      const lk = t.closest("[data-like]"); if (lk) { e.preventDefault(); e.stopPropagation(); toggleLike(lk); return; }
      const cl = t.closest("[data-clike]"); if (cl) { e.preventDefault(); e.stopPropagation(); toggleClike(cl); return; }
      const ps = t.closest("[data-post]"); if (ps) { e.preventDefault(); viewPost(Number(ps.getAttribute("data-post"))); return; }
    }); }
    function closeSheet() { const s = root.querySelector("#pf-sheet"); if (s) s.hidden = true; }
    root.querySelectorAll(".pf-tabbar [data-v]").forEach((b) => b.onclick = () => { closeSheet(); setView(b.getAttribute("data-v")); });
    root.querySelector("#pf-tbell").onclick = () => { closeSheet(); setView("notifs"); };
    root.querySelector("#pf-tabmas").onclick = () => { const s = root.querySelector("#pf-sheet"); if (s) s.hidden = false; };
    root.querySelector("#pf-sheetbg").onclick = closeSheet;
    root.querySelector("#pf-sheetx").onclick = closeSheet;
    root.querySelectorAll(".pf-sheet-i[data-act]").forEach((b) => b.onclick = () => { const a = b.getAttribute("data-act"); closeSheet(); if (a === "postear") { setView("feed"); const t = root.querySelector("#pf-post"); if (t) t.focus(); } else if (a === "chat") setView("chat"); else if (a === "amigos") setView("amigos"); });
    pollNotifs(); rt.push(setInterval(pollNotifs, 25000));
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
    root.querySelectorAll(".pf-tabbar [data-v]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-v") === v));
    if (v === "feed") viewFeed();
    else if (v === "amigos") viewAmigos();
    else if (v === "mensajes") viewMsgs();
    else if (v === "chat") viewChat();
    else if (v === "notifs") viewNotifs();
    else if (v === "admin") viewAdmin();
    else viewCuenta();
  }

  /* ---------- Feed ---------- */
  function postHTML(p) {
    const raw = p.body || "";
    const snip = raw ? (raw.length > 220 ? esc(raw.slice(0, 220)).replace(/\n/g, " ") + "…" : esc(raw).replace(/\n/g, " ")) : "";
    const nc = p.ncom || 0;
    return '<article class="pf-post" data-post="' + p.id + '">' +
      '<div class="pf-post-h"><span class="pf-ava">' + avaPic(p.avatar, headFor(p.nick)) + "</span>" +
      '<div class="pf-post-meta">' + uname(p.nick) + '<span>@' + esc(p.nick) + " · " + cuando(p.t) + '</span></div><span class="pf-code" title="código del posteo">$' + p.id + "</span></div>" +
      (p.title ? '<h3 class="pf-post-t">' + esc(p.title) + "</h3>" : "") +
      (snip ? '<p class="pf-post-b">' + snip + "</p>" : "") +
      '<div class="pf-post-f">' + likeBtn(p) + '<span class="pf-cnt">' + nc + (nc === 1 ? " comentario" : " comentarios") + "</span></div>" +
      "</article>";
  }
  function viewFeed() {
    let scope = "ti";
    chead("Feed", '<div class="pf-tabs2"><button data-s="ti" class="on">Para ti</button><button data-s="amigos">Amigos</button></div>');
    body().innerHTML =
      '<div id="pf-carousel" class="pf-carousel"></div>' +
      '<div class="pf-comp">' +
        '<input class="pf-cti" id="pf-ttl" maxlength="120" placeholder="Título de tu posteo" />' +
        '<textarea id="pf-post" maxlength="2000" placeholder="Texto (opcional). @ para nombrar, # para temas, $ para citar otro posteo."></textarea>' +
        '<div class="pf-crow"><span class="pf-msg" id="pf-pmsg"></span><button class="pf-btn pf-spin" id="pf-pub">Publicar</button></div>' +
      "</div>" +
      '<div id="pf-feed"><p class="pf-dimc">Cargando…</p></div>';
    async function load() {
      const { d } = await api("/api/social/feed" + (scope === "amigos" ? "?scope=amigos" : ""), AH);
      const box = body().querySelector("#pf-feed"); if (!box) return;
      const posts = (d && d.posts) || [];
      box.innerHTML = posts.length ? posts.map(postHTML).join("") : '<p class="pf-empty">' + (scope === "amigos" ? "Tus amigos no postearon nada todavía." : "Nadie publicó nada. Sé la primera voz del encierro.") + "</p>";
    }
    load(); mountCarousel(); vt.push(setInterval(() => { if (!document.hidden) load(); }, 15000));
    root.querySelector("#pf-chead").querySelectorAll("[data-s]").forEach((b) => { b.onclick = () => { scope = b.getAttribute("data-s"); root.querySelectorAll("#pf-chead [data-s]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); load(); }; });
    body().querySelector("#pf-pub").onclick = async () => { const ti = body().querySelector("#pf-ttl"), ta = body().querySelector("#pf-post"), pm = body().querySelector("#pf-pmsg"); pm.textContent = "..."; const { r, d } = await api("/api/social/post", { method: "POST", headers: JH, body: JSON.stringify({ title: ti.value, body: ta.value }) }); if (r.ok) { ti.value = ""; ta.value = ""; pm.textContent = ""; scope = "ti"; root.querySelectorAll("#pf-chead [data-s]").forEach((x) => x.classList.toggle("on", x.getAttribute("data-s") === "ti")); load(); } else pm.textContent = (d && d.message) || "No se pudo."; };
  }

  function viewFeedTag(tag) {
    clearView(); cur = "feed";
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-v") === "feed"));
    chead("#" + esc(tag));
    body().innerHTML = '<div id="pf-feed"><p class="pf-dimc">Cargando…</p></div>';
    api("/api/social/feed?tag=" + encodeURIComponent(tag), AH).then(({ d }) => {
      const box = body().querySelector("#pf-feed"); if (!box) return;
      const posts = (d && d.posts) || [];
      box.innerHTML = posts.length ? posts.map(postHTML).join("") : '<p class="pf-empty">Nada con #' + esc(tag) + " todavía.</p>";
    });
  }

  function commentTree(comments) {
    const byParent = {};
    comments.forEach((c) => { const k = c.parent || 0; (byParent[k] = byParent[k] || []).push(c); });
    function render(parent, depth) {
      return (byParent[parent] || []).map((c) =>
        '<div class="pf-cmt" style="margin-left:' + Math.min(depth, 5) * 18 + 'px">' +
          '<div class="pf-cmt-h"><span class="pf-ava pf-ava-sm">' + avaPic(c.avatar, headFor(c.nick)) + '</span><div class="pf-cmt-meta">' + uname(c.nick) + "<span>" + cuando(c.t) + "</span></div></div>" +
          '<div class="pf-cmt-b">' + rich(c.body) + "</div>" +
          '<div class="pf-cmt-f"><button class="pf-like pf-like-sm' + (c.liked ? " on" : "") + '" data-clike="' + c.id + '" type="button" title="Me cala">' + skull() + "<span>" + (c.nlik || 0) + '</span></button><a class="pf-reply" data-reply="' + c.id + '">Responder</a></div>' +
          render(c.id, depth + 1) +
        "</div>"
      ).join("");
    }
    return render(0, 0);
  }

  async function viewPost(id) {
    clearView(); cur = "post";
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.remove("on"));
    chead("Posteo");
    body().innerHTML = '<p class="pf-dimc">Cargando…</p>';
    const { r, d } = await api("/api/social/post?id=" + id, AH);
    if (!r.ok || !d || !d.ok) { body().innerHTML = '<p class="pf-empty">Ese posteo no existe.</p>'; return; }
    const p = d.post, comments = d.comments || [];
    body().innerHTML =
      '<a class="pf-back2" id="pp-back">&#8592; volver al feed</a>' +
      '<article class="pf-postfull">' +
        '<div class="pf-post-h"><span class="pf-ava">' + avaPic(p.avatar, headFor(p.nick)) + "</span>" +
        '<div class="pf-post-meta">' + uname(p.nick) + '<span>@' + esc(p.nick) + " · " + cuando(p.t) + '</span></div><span class="pf-code">$' + p.id + "</span></div>" +
        (p.title ? '<h2 class="pf-postfull-t">' + esc(p.title) + "</h2>" : "") +
        (p.body ? '<div class="pf-postfull-b">' + rich(p.body) + "</div>" : "") +
        '<div class="pf-post-f" style="margin-top:14px">' + likeBtn(p) + "</div>" +
      "</article>" +
      '<div class="pf-h">Comentarios</div>' +
      '<div class="pf-comp pf-comp-c"><textarea id="pp-ctext" maxlength="1000" placeholder="Sumate al hilo… (@ # $)"></textarea><div class="pf-crow"><span class="pf-msg" id="pp-cmsg"></span><button class="pf-btn pf-spin" id="pp-csend">Comentar</button></div></div>' +
      '<div id="pp-comments"></div>';
    const cbox = body().querySelector("#pp-comments");
    cbox.innerHTML = comments.length ? commentTree(comments) : '<p class="pf-empty">Sin comentarios. Arrancá el hilo.</p>';
    body().querySelector("#pp-back").onclick = () => setView("feed");
    let replyTo = null;
    const cmsg = body().querySelector("#pp-cmsg"), ctext = body().querySelector("#pp-ctext");
    cbox.addEventListener("click", (e) => { const rb = e.target.closest ? e.target.closest("[data-reply]") : null; if (rb) { replyTo = Number(rb.getAttribute("data-reply")); ctext.focus(); cmsg.textContent = "Respondiendo en el hilo…"; } });
    body().querySelector("#pp-csend").onclick = async () => { cmsg.textContent = "..."; const { r: rr, d: dd } = await api("/api/social/comment", { method: "POST", headers: JH, body: JSON.stringify({ postId: id, parentId: replyTo, body: ctext.value }) }); if (rr.ok) { ctext.value = ""; replyTo = null; cmsg.textContent = ""; viewPost(id); } else cmsg.textContent = (dd && dd.message) || "No se pudo."; };
  }

  /* ---------- Admin ---------- */
  function viewAdmin() {
    chead("Admin");
    body().innerHTML =
      '<div class="pf-h">Último video (carrusel)</div>' +
      '<div class="pf-row"><input class="pf-input" id="ad-vid" placeholder="https://youtu.be/..." /><button class="pf-btn" id="ad-vidsave">Guardar</button></div>' +
      '<p class="pf-msg" id="ad-vidmsg" style="min-height:1em"></p>' +
      '<div class="pf-h">Usuarios</div>' +
      '<div class="pf-row"><input class="pf-input" id="ad-q" maxlength="20" placeholder="buscar por nick…" /><button class="pf-btn" id="ad-go">Buscar</button></div>' +
      '<p class="pf-msg" id="ad-msg" style="min-height:1em"></p>' +
      '<div id="ad-list"><p class="pf-dimc">Cargando…</p></div>';
    const qEl = body().querySelector("#ad-q"), am = body().querySelector("#ad-msg");
    (async () => { try { const c = await (await fetch("/api/config", AH)).json(); if (c && c.video) body().querySelector("#ad-vid").value = c.video; } catch (_) {} })();
    body().querySelector("#ad-vidsave").onclick = async () => { const vm = body().querySelector("#ad-vidmsg"); vm.textContent = "..."; const { r, d } = await api("/api/admin/config", { method: "POST", headers: JH, body: JSON.stringify({ video: body().querySelector("#ad-vid").value.trim() }) }); vm.textContent = r.ok ? "Guardado." : ((d && d.message) || "No se pudo."); };
    async function load() {
      const q = qEl.value.trim();
      const { d } = await api("/api/admin/users" + (q ? "?q=" + encodeURIComponent(q) : ""), AH);
      const box = body().querySelector("#ad-list"); if (!box) return;
      if (!d || !d.ok) { box.innerHTML = '<p class="pf-empty">No se pudo cargar (¿sos admin?).</p>'; return; }
      const us = d.users || [];
      box.innerHTML = us.length ? us.map((u) => {
        const tags = (u.admin ? ' <span class="pf-dimc">· admin</span>' : "") + (u.banned ? ' <span style="color:#D23B47">· baneado</span>' : "") + (u.muted ? ' <span style="color:#e2b23c">· muteado</span>' : "");
        const rs = u.banned && u.reason ? '<br><span class="pf-dimc">' + esc(u.reason) + "</span>" : "";
        let btn = "";
        if (!u.admin) {
          btn += u.muted ? '<button class="pf-btn ghost pf-mini" data-unmute="' + esc(u.nick) + '">Desmutear</button>' : '<button class="pf-btn ghost pf-mini" data-mute="' + esc(u.nick) + '">Mutear</button>';
          btn += u.banned ? '<button class="pf-btn ghost pf-mini" data-unban="' + esc(u.nick) + '">Desbanear</button>' : '<button class="pf-btn pf-mini" data-ban="' + esc(u.nick) + '">Banear</button>';
        }
        btn += u.admin ? '<button class="pf-btn ghost pf-mini" data-revoke="' + esc(u.nick) + '">Quitar admin</button>' : '<button class="pf-btn ghost pf-mini" data-grant="' + esc(u.nick) + '">Hacer admin</button>';
        return '<div class="pf-fila"><span>' + uname(u.nick) + tags + rs + '</span><span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' + btn + "</span></div>";
      }).join("") : '<p class="pf-empty">Sin resultados.</p>';
      const act = async (path, nick, extra) => { am.textContent = "..."; const { r, d: dd } = await api(path, { method: "POST", headers: JH, body: JSON.stringify(Object.assign({ nick }, extra || {})) }); am.textContent = r.ok ? "Listo: " + nick : ((dd && dd.message) || "No se pudo."); load(); };
      box.querySelectorAll("[data-ban]").forEach((b) => b.onclick = () => { const nick = b.getAttribute("data-ban"); const reason = window.prompt("Motivo del baneo a " + nick + " (opcional):", "") || ""; act("/api/admin/ban", nick, { reason }); });
      box.querySelectorAll("[data-unban]").forEach((b) => b.onclick = () => act("/api/admin/unban", b.getAttribute("data-unban")));
      box.querySelectorAll("[data-mute]").forEach((b) => b.onclick = () => act("/api/admin/mute", b.getAttribute("data-mute")));
      box.querySelectorAll("[data-unmute]").forEach((b) => b.onclick = () => act("/api/admin/unmute", b.getAttribute("data-unmute")));
      box.querySelectorAll("[data-grant]").forEach((b) => b.onclick = () => act("/api/admin/grant", b.getAttribute("data-grant")));
      box.querySelectorAll("[data-revoke]").forEach((b) => b.onclick = () => act("/api/admin/revoke", b.getAttribute("data-revoke")));
    }
    body().querySelector("#ad-go").onclick = load;
    qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
    load();
  }

  async function mountCarousel() {
    const el = body().querySelector("#pf-carousel"); if (!el) return;
    let remaining = null, video = "";
    try { const s = await (await fetch("/api/stats", AH)).json(); if (s && typeof s.remaining === "number") remaining = s.remaining; } catch (_) {}
    try { const c = await (await fetch("/api/config", AH)).json(); video = (c && c.video) || ""; } catch (_) {}
    const videoUrl = video || "https://www.youtube.com/@tristoban/videos";
    const slides = [
      { cls: "s-remera", html: '<div class="pf-cs-k">LA REMERA</div><div class="pf-cs-t">' + (remaining != null ? "Faltan <b>" + fmt.format(remaining) + "</b> para que salga a la venta" : "Anotate para que salga a la venta") + "</div>", href: "/" },
      { cls: "s-video", html: '<div class="pf-cs-k">Último video</div><div class="pf-cs-t">Mirá lo nuevo de Insomnio Crónico &#8599;</div>', href: videoUrl, blank: true },
      { cls: "s-tristo", html: '<div class="pf-cs-k">Tristo</div><div class="pf-cs-t">Todas las redes y links en un solo lugar &#8599;</div>', href: "/tristo" },
    ];
    let i = 0;
    const render = () => {
      const s = slides[i];
      el.innerHTML = '<a class="pf-cslide ' + s.cls + '" href="' + s.href + '"' + (s.blank ? ' target="_blank" rel="noopener"' : "") + ">" + s.html + "</a>" +
        '<div class="pf-cdots">' + slides.map((_, k) => '<span class="' + (k === i ? "on" : "") + '" data-k="' + k + '"></span>').join("") + "</div>";
      el.querySelectorAll("[data-k]").forEach((dot) => dot.onclick = (e) => { e.preventDefault(); e.stopPropagation(); i = Number(dot.getAttribute("data-k")); render(); });
    };
    render();
    vt.push(setInterval(() => { if (!document.hidden) { i = (i + 1) % slides.length; render(); } }, 6000));
  }

  /* ---------- Perfil público ---------- */
  function badges(p) {
    let h = "";
    if (p.admin) h += '<span class="pf-tag" style="background:#6b8cff;color:#06070d">verificado</span>';
    if (p.founder) h += '<span class="pf-tag" style="background:#e2b23c;color:#06070d">fundador</span>';
    return h;
  }
  async function viewUser(nick) {
    clearView(); cur = "user";
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.remove("on"));
    chead("Perfil");
    body().innerHTML = '<p class="pf-dimc">Cargando…</p>';
    const { r, d } = await api("/api/social/perfil?nick=" + encodeURIComponent(nick), AH);
    if (!r.ok || !d || !d.ok) { body().innerHTML = '<p class="pf-empty">No se encontró ese perfil.</p>'; return; }
    const p = d.perfil, acc = (typeof p.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(p.accent)) ? p.accent : "var(--pf-acc)";
    const desde = p.desde ? new Date(p.desde).toLocaleDateString("es-AR", { month: "long", year: "numeric" }) : "";
    const banner = p.banner ? '<div class="pf-banner" style="background-image:url(\'' + esc(p.banner) + '\')"></div>' : '<div class="pf-banner" style="background:linear-gradient(120deg,' + acc + '33,#0a0a0d)"></div>';
    const links = (Array.isArray(p.links) ? p.links : []).map((l) => { const pl = platOf(l.url); return '<a class="pf-link" href="' + esc(l.url) + '" target="_blank" rel="noopener" style="border-color:' + acc + '55"><span class="pf-link-i" style="color:' + acc + '">' + linkSvg(pl[2]) + '</span><span class="pf-link-t">' + esc(l.title) + '</span><span class="pf-link-x">&#8599;</span></a>'; }).join("");
    let action = "";
    if (p.rel === "me") action = '<button class="pf-btn" id="pu-edit">Editar perfil</button>';
    else if (p.rel === "amigos") action = '<button class="pf-btn" id="pu-msg">Mensaje</button>';
    else if (p.rel === "pendiente") action = '<button class="pf-btn ghost" disabled>Pendiente</button>';
    else action = '<button class="pf-btn" id="pu-add">Agregar amigo</button>';
    const isAdm = me && me.admin && p.rel !== "me";
    const modTools = isAdm ? '<button class="pf-btn ghost pf-mini" id="pu-mute">Mutear</button><button class="pf-btn ghost pf-mini" id="pu-ban">Banear</button>' : "";
    body().innerHTML =
      banner +
      '<div class="pf-uhead"><span class="pf-ava pf-uava">' + avaPic(p.avatar, headFor(p.nick)) + '</span>' +
      '<div class="pf-uact">' + action + modTools + '</div></div>' +
      '<div class="pf-uname">' + esc(p.nick) + " " + badges(p) + '</div>' +
      '<div class="pf-dimc" style="padding:2px 0">@' + esc(p.nick) + (p.estado ? " · " + esc(p.estado) : "") + '</div>' +
      (p.bio ? '<p style="margin:8px 0 0;white-space:pre-wrap">' + esc(p.bio) + "</p>" : "") +
      '<div class="pf-umeta">' + (p.location ? esc(p.location) + " · " : "") + (desde ? "desde " + desde : "") + " · " + fmt.format(p.amigos) + " amigos</div>" +
      (links ? '<div class="pf-links">' + links + "</div>" : "") +
      '<div class="pf-h">Números</div>' +
      '<div class="pf-fila"><b>TeTristo</b><span>' + fmt.format(p.best.tetristo) + '</span></div>' +
      '<div class="pf-fila"><b>No Parpadees</b><span>' + fmt.format(p.best.parpadeo) + '</span></div>' +
      (p.caido ? '<div class="pf-fila"><b>El Botón</b><span>Caído N° ' + fmt.format(p.caido) + '</span></div>' : "") +
      '<div class="pf-h">Posteos</div><div id="pu-posts"></div>';
    const box = body().querySelector("#pu-posts");
    const list = (p.pinned ? [Object.assign({ pin: true }, p.pinned)] : []).concat(p.posts || []);
    box.innerHTML = list.length ? list.map((x) => (x.pin ? '<div class="pf-pinlbl">Fijado</div>' : "") + postHTML(x) + (p.rel === "me" ? '<div class="pf-pinrow"><a data-pin="' + (x.pin ? "0" : x.id) + '">' + (x.pin ? "Quitar fijado" : "Fijar arriba") + "</a></div>" : "")).join("") : '<p class="pf-empty">Todavía no posteó nada.</p>';
    box.querySelectorAll("[data-pin]").forEach((a) => a.onclick = async () => { const id = Number(a.getAttribute("data-pin")); const { r } = await api("/api/hub/pin-post", { method: "POST", headers: JH, body: JSON.stringify({ id: id || null }) }); if (r.ok) { me.pinned = id || null; viewUser(p.nick); } });
    const edit = body().querySelector("#pu-edit"); if (edit) edit.onclick = () => setView("perfil");
    const msgb = body().querySelector("#pu-msg"); if (msgb) msgb.onclick = () => { window.__dmOpen = p.nick; setView("mensajes"); };
    const add = body().querySelector("#pu-add"); if (add) add.onclick = async () => { add.disabled = true; add.textContent = "..."; const res = await api("/api/social/amigos/pedir", { method: "POST", headers: JH, body: JSON.stringify({ nick: p.nick }) }); add.textContent = res.r.ok ? "Solicitud enviada" : ((res.d && res.d.message) || "No se pudo."); };
    const mute = body().querySelector("#pu-mute"); if (mute) mute.onclick = async () => { const res = await api("/api/admin/mute", { method: "POST", headers: JH, body: JSON.stringify({ nick: p.nick }) }); mute.textContent = res.r.ok ? "Muteado" : "Error"; };
    const ban = body().querySelector("#pu-ban"); if (ban) ban.onclick = async () => { if (!window.confirm("¿Banear a " + p.nick + "?")) return; const res = await api("/api/admin/ban", { method: "POST", headers: JH, body: JSON.stringify({ nick: p.nick, reason: "" }) }); ban.textContent = res.r.ok ? "Baneado" : "Error"; };
  }

  /* ---------- Amigos ---------- */
  function viewAmigos() {
    chead("Amigos");
    body().innerHTML = '<div class="pf-row"><input class="pf-input" id="a-q" maxlength="14" placeholder="buscar por nick…" /><button class="pf-btn" id="a-go">Buscar</button></div><div id="a-res"></div><div id="a-sol"></div><h3 class="pf-h">Tus amigos</h3><div id="a-list"><p class="pf-dimc">Cargando…</p></div>';
    async function load() {
      const { d } = await api("/api/social/amigos", AH); if (!d || !d.ok) return;
      const sol = body().querySelector("#a-sol");
      sol.innerHTML = (d.recibidas || []).length ? '<h3 class="pf-h">Solicitudes</h3>' + d.recibidas.map((n) => '<div class="pf-fila">' + uname(n) + '<span><button class="pf-btn pf-mini" data-ok="' + esc(n) + '">Aceptar</button> <button class="pf-btn ghost pf-mini" data-no="' + esc(n) + '">No</button></span></div>').join("") : "";
      const lst = body().querySelector("#a-list");
      lst.innerHTML = (d.amigos || []).length ? d.amigos.map((n) => '<div class="pf-fila">' + uname(n) + '<button class="pf-btn ghost pf-mini" data-dm="' + esc(n) + '">Mensaje</button></div>').join("") : '<p class="pf-dimc">Todavía no tenés amigos.' + ((d.enviadas || []).length ? " Pendientes: " + d.enviadas.map(esc).join(", ") + "." : "") + "</p>";
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
      res.innerHTML = us.length ? us.map((n) => '<div class="pf-fila">' + uname(n) + '<button class="pf-btn pf-mini" data-add="' + esc(n) + '">Agregar</button></div>').join("") : '<p class="pf-dimc">Nadie con ese nick.</p>';
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
    function add(m) { if (first) { log.innerHTML = ""; first = false; } const d = document.createElement("div"); d.className = "pf-gcm"; const b = document.createElement("b"); b.textContent = (m.name || "ANÓN") + ":"; const s = document.createElement("span"); s.textContent = " " + m.body; d.appendChild(b); d.appendChild(s); log.appendChild(d); if (m.id > maxId) maxId = m.id; }
    async function load() { const { d } = await api("/api/chat" + (maxId ? "?since=" + maxId : ""), AH); if (d && d.messages && d.messages.length) { const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80; d.messages.forEach(add); first = false; if (stick) log.scrollTop = log.scrollHeight; } else if (first) { log.innerHTML = '<p class="pf-dimc">Sé el primero.</p>'; } }
    load(); vt.push(setInterval(() => { if (!document.hidden) load(); }, 3000)); log.scrollTop = log.scrollHeight;
    async function send() { const t = txt.value.trim(); if (!t) return; const { r, d } = await api("/api/chat", { method: "POST", headers: JH, body: JSON.stringify({ body: t }) }); if (r.ok) { txt.value = ""; load(); } else body().querySelector("#c-em").textContent = (d && d.message) || "No se pudo."; }
    body().querySelector("#c-send").onclick = send; txt.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  }

  /* ---------- Cuenta ---------- */
  function viewCuenta() {
    chead("Editar perfil");
    const d = me, desde = d.desde ? new Date(d.desde).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "";
    const acc = (typeof d.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(d.accent)) ? d.accent : "#6b8cff";
    body().innerHTML =
      '<div class="pf-banner pf-bnedit" style="' + (d.banner ? "background-image:url('" + esc(d.banner) + "')" : "background:linear-gradient(120deg," + acc + "33,#0a0a0d)") + '"><div class="pf-bnbtns"><button class="pf-btn ghost pf-mini" id="c-bn">Portada</button>' + (d.banner ? '<button class="pf-btn ghost pf-mini" id="c-bndel">Quitar</button>' : "") + '</div></div>' +
      '<div class="pf-uhead"><span class="pf-ava pf-uava" id="c-ava" style="cursor:pointer" title="Cambiar foto">' + avaPic(d.avatar, d.char ? d.char.head : "o") + '</span></div>' +
      '<div class="pf-row" style="margin-top:6px"><button class="pf-btn ghost pf-mini" id="c-photo">Cambiar foto</button>' + (d.avatar ? '<button class="pf-btn ghost pf-mini" id="c-photodel">Quitar foto</button>' : "") + '<span class="pf-msg" id="c-pmsg" style="margin:0"></span></div>' +
      '<div class="pf-uname" style="margin-top:8px">' + esc(d.nick) + " " + badges(d) + '</div>' +
      '<div class="pf-dimc" style="padding:0">@' + esc(d.nick) + (desde ? " · desde " + desde : "") + '</div>' +
      '<input type="file" id="c-file" accept="image/*" style="display:none" /><input type="file" id="c-bnfile" accept="image/*" style="display:none" />' +
      '<div class="pf-h">Estado</div><input class="pf-input" id="c-estado" maxlength="80" placeholder="¿qué estás tramando?" value="' + esc(d.estado || "") + '" />' +
      '<div class="pf-h">Bio</div><textarea class="pf-input" id="c-bio" maxlength="200" placeholder="Contá quién sos (200)" style="border-radius:12px;min-height:64px;width:100%">' + esc(d.bio || "") + '</textarea>' +
      '<div class="pf-h">Ubicación</div><input class="pf-input" id="c-loc" maxlength="60" placeholder="Ciudad, país" value="' + esc(d.location || "") + '" />' +
      '<div class="pf-h">Color de acento</div><div class="pf-row"><input type="color" id="c-accent" value="' + acc + '" style="width:48px;height:38px;border:0;background:none;cursor:pointer;padding:0" /><span class="pf-dimc">Personalizá tu perfil</span></div>' +
      '<div class="pf-h">Tus links</div><div id="c-links"></div><button class="pf-btn ghost pf-mini" id="c-linkadd" style="margin-top:8px">+ Agregar link</button>' +
      '<div class="pf-row" style="margin-top:16px"><button class="pf-btn" id="c-save">Guardar perfil</button><span class="pf-msg" id="c-smsg"></span><button class="pf-btn ghost pf-mini" id="c-out" style="margin-left:auto">Cerrar sesión</button></div>' +
      '<div class="pf-h">Tus números</div>' +
      '<div class="pf-fila"><b>El Botón</b><span>' + (d.caido ? "Caído N° " + fmt.format(d.caido) : "No caíste") + '</span></div>' +
      '<div class="pf-fila"><b>Récord TeTristo</b><span>' + fmt.format((d.best && d.best.tetristo) || 0) + '</span></div>' +
      '<div class="pf-fila"><b>Récord No Parpadees</b><span>' + fmt.format((d.best && d.best.parpadeo) || 0) + '</span></div>';
    const linksBox = body().querySelector("#c-links");
    let links = (Array.isArray(d.links) ? d.links : []).map((l) => ({ title: l.title || "", url: l.url || "" }));
    function renderLinks() {
      linksBox.innerHTML = links.length ? links.map((l, i) => '<div class="pf-row" style="margin-bottom:6px"><input class="pf-input" data-lt="' + i + '" maxlength="40" placeholder="título" value="' + esc(l.title) + '" /><input class="pf-input" data-lu="' + i + '" maxlength="300" placeholder="https://..." value="' + esc(l.url) + '" /><button class="pf-btn ghost pf-mini" data-lx="' + i + '">&#10005;</button></div>').join("") : '<p class="pf-dimc" style="padding:4px 0">Sin links todavía.</p>';
      linksBox.querySelectorAll("[data-lt]").forEach((inp) => inp.oninput = () => { links[Number(inp.getAttribute("data-lt"))].title = inp.value; });
      linksBox.querySelectorAll("[data-lu]").forEach((inp) => inp.oninput = () => { links[Number(inp.getAttribute("data-lu"))].url = inp.value; });
      linksBox.querySelectorAll("[data-lx]").forEach((b) => b.onclick = () => { links.splice(Number(b.getAttribute("data-lx")), 1); renderLinks(); });
    }
    renderLinks();
    body().querySelector("#c-linkadd").onclick = () => { if (links.length < 12) { links.push({ title: "", url: "" }); renderLinks(); } };
    body().querySelector("#c-save").onclick = async () => {
      const sm = body().querySelector("#c-smsg"); sm.textContent = "...";
      const payload = { bio: body().querySelector("#c-bio").value, estado: body().querySelector("#c-estado").value, location: body().querySelector("#c-loc").value, accent: body().querySelector("#c-accent").value, links: links.filter((l) => l.title.trim() && /^https?:\/\//.test(l.url.trim())) };
      const { r, d: dd } = await api("/api/hub/profile", { method: "POST", headers: JH, body: JSON.stringify(payload) });
      if (r.ok && dd) { me.bio = dd.bio; me.estado = dd.estado; me.location = dd.location; me.accent = dd.accent; me.links = dd.links; sm.textContent = "¡Guardado!"; } else sm.textContent = (dd && dd.message) || "No se pudo.";
    };
    body().querySelector("#c-out").onclick = async () => { await api("/api/hub/logout", { method: "POST", headers: JH, body: "{}" }); boot(); };
    const fileEl = body().querySelector("#c-file"), pmsg = body().querySelector("#c-pmsg");
    const setChip = () => { const chip = root.querySelector("#pf-me .pf-ava"); if (chip) chip.innerHTML = avaPic(me.avatar, me.char ? me.char.head : "o"); };
    body().querySelector("#c-photo").onclick = () => fileEl.click(); body().querySelector("#c-ava").onclick = () => fileEl.click();
    fileEl.onchange = () => { const f = fileEl.files && fileEl.files[0]; if (!f) return; pmsg.textContent = "Subiendo…"; resizeImg(f, async (dataUrl) => { if (!dataUrl) { pmsg.textContent = "No se pudo leer la imagen."; return; } const { r, d: dd } = await api("/api/hub/avatar", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl }) }); if (r.ok) { me.avatar = dd.avatar; setChip(); viewCuenta(); } else pmsg.textContent = (dd && dd.message) || "No se pudo."; }); };
    const pdel = body().querySelector("#c-photodel"); if (pdel) pdel.onclick = async () => { const { r } = await api("/api/hub/avatar", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl: null }) }); if (r.ok) { me.avatar = null; setChip(); viewCuenta(); } };
    const bnFile = body().querySelector("#c-bnfile");
    body().querySelector("#c-bn").onclick = () => bnFile.click();
    bnFile.onchange = () => { const f = bnFile.files && bnFile.files[0]; if (!f) return; const sm = body().querySelector("#c-smsg"); sm.textContent = "Subiendo portada…"; resizeBanner(f, async (dataUrl) => { if (!dataUrl) { sm.textContent = "No se pudo."; return; } const { r, d: dd } = await api("/api/hub/banner", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl }) }); if (r.ok) { me.banner = dd.banner; sm.textContent = "Portada lista."; viewCuenta(); } else sm.textContent = (dd && dd.message) || "No se pudo."; }); };
    const bnDel = body().querySelector("#c-bndel"); if (bnDel) bnDel.onclick = async () => { const { r } = await api("/api/hub/banner", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl: null }) }); if (r.ok) { me.banner = null; viewCuenta(); } };
  }

  /* ---------- Notificaciones ---------- */
  function notifIcon(t) { if (t === "like_post" || t === "like_comment") return skull(); if (t === "comment" || t === "reply") return ic("chat"); if (t === "friend_req" || t === "friend_acc") return ic("amigos"); return ic("notifs"); }
  const NVERB = { like_post: "te calaveó un posteo", like_comment: "te calaveó un comentario", comment: "comentó tu posteo", reply: "respondió tu comentario", mention: "te nombró", cite: "citó tu posteo", friend_req: "te mandó solicitud de amistad", friend_acc: "ahora es tu amigo" };
  function notifLine(n) {
    const verb = NVERB[n.type] || "novedad";
    const tgt = n.postId ? ' data-post="' + n.postId + '"' : ' data-u="' + esc(n.actor) + '"';
    return '<div class="pf-nrow' + (n.read ? "" : " unread") + '"' + tgt + '>' +
      '<span class="pf-nic">' + notifIcon(n.type) + "</span>" +
      '<div class="pf-ntext"><b class="pf-u" data-u="' + esc(n.actor) + '">' + esc(n.actor) + "</b> " + verb +
      (n.body ? ' <span class="pf-ndim">· ' + esc(String(n.body).slice(0, 60)) + "</span>" : "") +
      '<span class="pf-nt">' + cuando(n.t) + "</span></div></div>";
  }
  async function viewNotifs() {
    chead("Notificaciones");
    body().innerHTML = '<div id="pf-notifs"><p class="pf-dimc">Cargando…</p></div>';
    const { d } = await api("/api/notifs", AH);
    const box = body().querySelector("#pf-notifs"); if (!box) return;
    const items = (d && d.items) || [];
    box.innerHTML = items.length ? items.map(notifLine).join("") : '<p class="pf-empty">Nada por acá todavía. Cuando te calaveen, comenten o te nombren, aparece acá.</p>';
    if (items.some((n) => !n.read)) await api("/api/notifs/read", { method: "POST", headers: JH, body: "{}" });
    setNotifBadge(0);
  }
  function setNotifBadge(n) {
    const dot = root.querySelector("#pf-nb"); if (dot) { dot.classList.toggle("on", n > 0); dot.textContent = n > 9 ? "9+" : String(n); }
    const mb = root.querySelector("#pf-tbell-b"); if (mb) { mb.style.display = n > 0 ? "flex" : "none"; mb.textContent = n > 9 ? "9+" : String(n); }
  }
  async function pollNotifs() { try { const { d } = await api("/api/notifs/count", AH); if (d && d.ok && cur !== "notifs") setNotifBadge(d.unread || 0); } catch (_) {} }

  /* ---------- Columna derecha (persistente): Chat Global + Mensajes ---------- */
  function rightRail() {
    const r = root.querySelector("#pf-right"); if (!r) return;
    r.innerHTML =
      '<div class="pf-widget"><div class="pf-wh">Chat Global<span class="pf-live"><i></i>En vivo</span></div><div class="pf-gclog" id="rg-log"></div><div class="pf-gcform"><input id="rg-txt" maxlength="200" placeholder="escribí un mensaje…" autocomplete="off" /><button class="pf-btn pf-mini" id="rg-send">›</button></div><a class="pf-wlink" id="rg-full">Abrir en pantalla completa →</a></div>' +
      '<div class="pf-widget"><div class="pf-wh">Tus mensajes</div><div id="rg-prev"><p class="pf-dimc">Cargando…</p></div></div>' +
      '<div class="pf-widget"><div class="pf-wh">Tops</div><div id="rg-tops"><p class="pf-dimc" style="padding:14px">Cargando…</p></div></div>';
    const log = r.querySelector("#rg-log"), txt = r.querySelector("#rg-txt"); let maxId = 0, first = true;
    function add(m) { if (first) { log.innerHTML = ""; first = false; } const d = document.createElement("div"); d.className = "pf-gcm"; const b = document.createElement("b"); b.textContent = (m.name || "ANÓN") + ":"; const s = document.createElement("span"); s.textContent = " " + m.body; d.appendChild(b); d.appendChild(s); log.appendChild(d); if (m.id > maxId) maxId = m.id; if (window.YATH_villager && m.name) window.YATH_villager(m.name); }
    async function load() { const { d } = await api("/api/chat" + (maxId ? "?since=" + maxId : ""), AH); if (d && d.messages && d.messages.length) { const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80; d.messages.forEach(add); first = false; if (stick) log.scrollTop = log.scrollHeight; } else if (first) { log.innerHTML = '<p class="pf-dimc" style="padding:14px">Silencio…</p>'; } }
    load(); rt.push(setInterval(() => { if (!document.hidden) load(); }, 3500));
    async function send() { const t = txt.value.trim(); if (!t) return; const { r: rr } = await api("/api/chat", { method: "POST", headers: JH, body: JSON.stringify({ body: t }) }); if (rr.ok) { txt.value = ""; load(); } }
    r.querySelector("#rg-send").onclick = send; txt.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    r.querySelector("#rg-full").onclick = () => setView("chat");
    async function prev() { const { d } = await api("/api/social/amigos", AH); const box = r.querySelector("#rg-prev"); if (!box) return; const am = (d && d.amigos) || []; box.innerHTML = am.length ? am.slice(0, 6).map((n) => '<div class="pf-prev" data-n="' + esc(n) + '"><span class="pf-ava">' + avatar(headFor(n)) + '</span><div>' + uname(n) + '<span>tocá para escribir</span></div></div>').join("") : '<p class="pf-dimc" style="padding:14px">Agregá amigos para chatear.</p>'; box.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => { window.__dmOpen = b.getAttribute("data-n"); setView("mensajes"); }); }
    prev(); rt.push(setInterval(() => { if (!document.hidden) prev(); }, 20000));
    (function mountTops() {
      const box = r.querySelector("#rg-tops"); if (!box) return;
      const games = [{ k: "tetristo", t: "TeTristo", href: "/tristos" }, { k: "parpadeo", t: "No Parpadees", href: "/tristos" }, { k: "laberinto", t: "El Laberinto", href: "/laberinto" }];
      const data = {};
      Promise.all(games.map((g) => fetch("/api/scores?game=" + g.k, AH).then((x) => x.json()).then((d) => { data[g.k] = (d && d.scores) || []; }).catch(() => { data[g.k] = []; }))).then(() => {
        let i = 0;
        const render = () => {
          const g = games[i], sc = (data[g.k] || []).slice(0, 5);
          box.innerHTML = '<div class="pf-tops-h"><b>' + g.t + '</b><a class="pf-wlink2" href="' + g.href + '">Jugar →</a></div>' +
            (sc.length ? '<ol class="pf-toplist">' + sc.map((s, k) => '<li><span>' + (k + 1) + ". " + esc(s.alias) + "</span><b>" + fmt.format(s.score) + "</b></li>").join("") + "</ol>" : '<p class="pf-dimc" style="padding:8px 0">Sin puntajes todavía.</p>') +
            '<div class="pf-cdots" style="margin-top:8px">' + games.map((_, k) => '<span class="' + (k === i ? "on" : "") + '" data-tk="' + k + '"></span>').join("") + "</div>";
          box.querySelectorAll("[data-tk]").forEach((dt) => dt.onclick = () => { i = Number(dt.getAttribute("data-tk")); render(); });
        };
        render();
        rt.push(setInterval(() => { if (!document.hidden) { i = (i + 1) % games.length; render(); } }, 6000));
      });
    })();
  }

  boot();
})();
