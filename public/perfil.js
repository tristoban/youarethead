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
  function cmtBtn(n) { return '<button class="pf-fact" data-cmt type="button" title="Comentarios">' + ic("chat") + "<span>" + (n || 0) + "</span></button>"; }
  function canDel(nick) { return !!me && (me.admin === true || (!!me.nick && me.nick === nick)); }
  function delBtnPost(p) { return canDel(p.nick) ? '<button class="pf-del" data-delpost="' + p.id + '" type="button" title="Borrar posteo">' + ic("trash") + "</button>" : ""; }
  function delBtnCmt(c) { return canDel(c.nick) ? '<button class="pf-del" data-delcomment="' + c.id + '" type="button" title="Borrar comentario">' + ic("trash") + "</button>" : ""; }
  async function delPost(id) { if (!window.confirm("¿Borrar este posteo? No se puede deshacer.")) return; const { r } = await api("/api/social/post/delete", { method: "POST", headers: JH, body: JSON.stringify({ id: Number(id) }) }); if (r.ok) setView("feed"); }
  async function delComment(id) { if (!window.confirm("¿Borrar este comentario?")) return; const { r } = await api("/api/social/comment/delete", { method: "POST", headers: JH, body: JSON.stringify({ id: Number(id) }) }); if (r.ok) { if (window.__curPost) viewPost(window.__curPost); else setView("feed"); } }
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
  /* ---- Tandas 1/3/4: compartir, fotos y encuestas ---- */
  const POLLS = {};
  function toast(msg) {
    let t = document.getElementById("pf-toast");
    if (!t) { t = document.createElement("div"); t.id = "pf-toast"; t.className = "pf-toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(t.__tt); t.__tt = setTimeout(() => t.classList.remove("on"), 2200);
  }
  function topicChip(p) { return p.topic ? '<a class="pf-topic" data-topic="' + esc(p.topic) + '">' + esc(p.topic) + "</a>" : ""; }
  function imgsHTML(p) {
    const im = Array.isArray(p.imgs) ? p.imgs.slice(0, 4) : [];
    if (!im.length) return "";
    return '<div class="pf-pimgs n' + im.length + '">' + im.map((u) => '<img loading="lazy" src="' + esc(u) + '" alt="" data-lbx="' + esc(u) + '" />').join("") + "</div>";
  }
  function lightbox(url) {
    const w = document.createElement("div"); w.className = "pf-lbx";
    w.innerHTML = '<img src="' + esc(url) + '" alt="" />';
    w.onclick = () => w.remove();
    document.body.appendChild(w);
  }
  function pollHTML(p) {
    if (!p.poll || !Array.isArray(p.poll.opts)) return "";
    POLLS[p.id] = p.poll;
    const q = p.poll, voted = q.mi !== null && q.mi !== undefined;
    return '<div class="pf-poll" data-pollbox="' + p.id + '">' + q.opts.map((o, i) => {
      if (!voted) return '<button class="pf-pop pf-pop-btn" data-vote="' + i + '" data-vpost="' + p.id + '" type="button"><span>' + esc(o) + "</span></button>";
      const n = q.votos[i] || 0, pc = q.total ? Math.round(n * 100 / q.total) : 0;
      return '<div class="pf-pop' + (q.mi === i ? " mia" : "") + '"><i style="width:' + pc + '%"></i><span>' + esc(o) + "</span><b>" + pc + "%</b></div>";
    }).join("") + '<div class="pf-poll-n">' + (q.total || 0) + ((q.total || 0) === 1 ? " voto" : " votos") + "</div></div>";
  }
  async function votePoll(btn) {
    const id = Number(btn.getAttribute("data-vpost")), op = Number(btn.getAttribute("data-vote"));
    const { r, d } = await api("/api/social/poll/votar", { method: "POST", headers: JH, body: JSON.stringify({ postId: id, opcion: op }) });
    if (!r.ok || !d || !d.ok) { toast((d && d.message) || "No se pudo votar."); return; }
    const q = POLLS[id] || { opts: [] };
    POLLS[id] = { opts: q.opts, votos: d.votos, total: d.total, mi: d.mi };
    document.querySelectorAll('[data-pollbox="' + id + '"]').forEach((el) => { const tmp = document.createElement("div"); tmp.innerHTML = pollHTML({ id: id, poll: POLLS[id] }); if (tmp.firstChild) el.replaceWith(tmp.firstChild); });
  }
  function shareBtn(p) { return '<button class="pf-shr" data-share="' + p.id + '" data-sht="' + esc(p.title || "") + '" type="button" title="Compartir">' + ic("share") + "</button>"; }
  async function sharePost(btn) {
    const id = btn.getAttribute("data-share");
    const url = location.origin + "/p/" + id;
    const title = btn.getAttribute("data-sht") || "Posteo en YATA";
    if (navigator.share) { try { await navigator.share({ title: title, url: url }); return; } catch (err) { if (err && err.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast("Link copiado. Repartilo."); } catch (_) { window.prompt("Copiá el link:", url); }
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
  let IMG_ON = false;
  function resizeToBlob(file, W, H, cb) {
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => {
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d"), scale = Math.max(W / img.width, H / img.height), w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      try { cv.toBlob((bl) => cb(bl), "image/webp", 0.85); } catch (_) { cb(null); }
    }; img.onerror = () => cb(null); img.src = String(fr.result); };
    fr.onerror = () => cb(null); fr.readAsDataURL(file);
  }
  async function subirPerfilR2(blob) {
    const sg = await api("/api/img/sign", { method: "POST", headers: JH, body: JSON.stringify({ type: blob.type, size: blob.size, scope: "perfil" }) });
    if (!sg.r.ok || !sg.d || !sg.d.ok) return null;
    try {
      const up = await fetch(sg.d.put, { method: "PUT", body: blob, headers: { "content-type": blob.type } });
      if (!up.ok) return null;
      return sg.d.url;
    } catch (_) { return null; }
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
    escritorios: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16v4"/>',
    feed: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    notifs: '<path d="M6 9a6 6 0 1112 0c0 4 1.6 5.4 2 6H4c.4-.6 2-2 2-6"/><path d="M10 19a2 2 0 004 0"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M7 7l1 13h8l1-13"/>',
    juegos: '<rect x="3" y="8" width="18" height="9" rx="4"/><path d="M8 12.5h3M9.5 11v3"/><circle cx="16" cy="12.5" r=".6" fill="currentColor"/>',
    canal: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none"/>',
    mensajes: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    amigos: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c0-3.3 3-5 5.5-5s5.5 1.7 5.5 5"/><path d="M16 6.5a3 3 0 010 6"/>',
    chat: '<path d="M5 5h14v10H9l-4 4z"/>',
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M5 20c0-4 3.2-6 7-6s7 2 7 6"/>',
    admin: '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/>',
    tienda: '<path d="M5 8h14l-1 11H6z"/><path d="M9 8a3 3 0 016 0"/>',
    salir: '<path d="M14 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2v-2"/><path d="M10 12h10m0 0l-3-3m3 3l-3 3"/>',
    share: '<path d="M12 4v11"/><path d="M8.5 7.5L12 4l3.5 3.5"/><path d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6"/>',
  };
  function ic(n) { return '<svg class="pf-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + "</svg>"; }

  let me = null, vt = [], rt = [], cur = "inicio";
  function clearView() { vt.forEach((t) => clearInterval(t)); vt = []; window.YATH_CONV = null; }
  function setUrl(path) { try { if (location.pathname !== path) history.pushState({}, "", path); } catch (_) {} }
  function rutear() {
    const p = location.pathname;
    let m = p.match(/^\/(?:u|demon)\/([^/]+)\/escritorio$/);
    if (m) { viewDesktop(decodeURIComponent(m[1])); return; }
    m = p.match(/^\/(?:u|demon)\/([^/]+)$/);
    if (m) { viewUser(decodeURIComponent(m[1])); return; }
    m = p.match(/^\/p\/(\d+)$/);
    if (m) { viewPost(Number(m[1])); return; }
    setView("feed");
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    const oauth = params.get("oauth");
    if (oauth) history.replaceState(null, "", location.pathname);
    if (oauth === "setup") { setupScreen(); return; }
    const um = location.pathname.match(/^\/(?:u|demon)\/([^/]+)$/);
    const wantUser = um ? decodeURIComponent(um[1]) : null;
    const pmm = location.pathname.match(/^\/p\/(\d+)$/);
    const wantPost = pmm ? Number(pmm[1]) : null;
    const dm2 = location.pathname.match(/^\/(?:u|demon)\/([^/]+)\/escritorio$/);
    const wantDesk = dm2 ? decodeURIComponent(dm2[1]) : null;
    const { d } = await api("/api/hub/me", AH);
    if (!d || !d.ok) { root.innerHTML = '<p class="pf-loading">No responde. Probá en un rato.</p>'; return; }
    if (!d.logged) {
      if (wantDesk) { root.innerHTML = '<div class="pf-guest" style="max-width:980px"><div class="pf-chead" id="pf-chead"></div><div id="pf-body"></div><a class="pf-btn pf-spin" href="/yata" style="margin-top:14px;display:inline-flex">Entrá a YATA</a></div>'; viewDesktop(wantDesk); return; }
      if (wantUser && !dm2) { guestProfile(wantUser); return; }
      if (wantPost) { guestPost(wantPost); return; }
      login(oauth); return;
    }
    me = d;
    if (oauth === "migrated") { migrationModal(() => app()); return; }
    app();
    if (wantDesk) viewDesktop(wantDesk);
    else if (wantUser) viewUser(wantUser);
    else if (wantPost) viewPost(wantPost);
  }
  async function guestPost(id) {
    const { r, d } = await api("/api/social/post?id=" + id, AH);
    if (!r.ok || !d || !d.ok) { root.innerHTML = '<div class="pf-guest"><p class="pf-empty">Ese posteo no existe (o se fue a dormir).</p><a class="pf-btn pf-spin" href="/yata">Entrá a YATA</a></div>'; return; }
    const p = d.post, comments = d.comments || [];
    root.innerHTML = '<div class="pf-guest">' +
      '<article class="pf-postfull">' +
        '<div class="pf-post-h"><span class="pf-ava">' + avaPic(p.avatar, headFor(p.nick)) + '</span>' +
        '<div class="pf-post-meta"><b>' + esc(p.nick) + '</b><span>@' + esc(p.nick) + " · " + cuando(p.t) + "</span></div></div>" +
        (p.title ? '<h2 class="pf-postfull-t">' + esc(p.title) + "</h2>" : "") +
        (p.body ? '<div class="pf-postfull-b">' + rich(p.body) + "</div>" : "") +
        imgsHTML(p) +
        '<div class="pf-dimc" style="padding:8px 0">' + (p.nlik || 0) + " calaveras · " + comments.length + (comments.length === 1 ? " comentario" : " comentarios") + "</div>" +
      "</article>" +
      '<a class="pf-btn pf-spin" href="/yata" style="margin-top:14px;display:inline-flex">Entrá a YATA para comentar</a>' +
      "</div>";
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
          '<a href="/">' + ic("tienda") + '<span>La remera</span></a>' + navItem("feed", "Feed") +
          '<button data-v="notifs" id="pf-navnotif">' + ic("notifs") + '<span>Notificaciones</span><i class="pf-ndot" id="pf-nb"></i></button>' +
          navItem("mensajes", "Mensajes") + navItem("amigos", "Amigos") + navItem("escritorios", "Escritorios") +
          navItem("juegos", "Juegos") + navItem("tienda", "Tienda") + navItem("canal", "Insomnio Crónico") +
          navItem("perfil", "My Hell") + (me.admin ? navItem("admin", "Admin") : "") +
          '<div class="pf-me" id="pf-me"><span class="pf-ava">' + avaPic(me.avatar, myHead) + '</span><div><b>' + esc(me.nick) + '</b><span>@' + esc(me.nick) + '</span></div></div>' +
          '<button class="pf-logout" id="pf-logout">' + ic("salir") + '<span>Cerrar sesión</span></button>' +
          '<button data-v="chat" class="pf-chatabajo">' + ic("chat") + '<span>Chat Global</span></button>' +
          '<div class="pf-online" id="pf-online"><i></i><span>despertando…</span></div>' +
        '</nav></aside>' +
        '<main class="pf-center"><div class="pf-chead" id="pf-chead"></div><div id="pf-body"></div></main>' +
        '<aside class="pf-right" id="pf-right"></aside>' +
      '</div>' +
      '<header class="pf-topbar"><a href="/" class="pf-tb-brand">youarethead</a><button class="pf-tbell" id="pf-tbell" type="button" aria-label="Notificaciones">' + ic("notifs") + '<span class="pf-tb-badge" id="pf-tbell-b" style="display:none">0</span></button></header>' +
      '<nav class="pf-tabbar">' +
        '<button class="pf-tab" data-v="feed" type="button">' + ic("inicio") + '<span>Inicio</span></button>' +
        '<button class="pf-tab" data-v="escritorios" type="button">' + ic("escritorios") + '<span>Escritorios</span></button>' +
        '<button class="pf-tab pf-tab-mas" id="pf-tabmas" type="button" aria-label="Más"><img src="/simbolomas.png" alt="Más" /></button>' +
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
    root.querySelector("#pf-me").onclick = () => setView("perfil");
    root.querySelector("#pf-logout").onclick = async () => { await api("/api/hub/logout", { method: "POST", headers: JH, body: "{}" }); boot(); };
    if (!root.__uwired) { root.__uwired = true; root.addEventListener("click", (e) => {
      const t = e.target; if (!t || !t.closest) return;
      const u = t.closest("[data-u]"); if (u) { e.preventDefault(); viewUser(u.getAttribute("data-u")); return; }
      const tg = t.closest("[data-tag]"); if (tg) { e.preventDefault(); viewFeedTag(tg.getAttribute("data-tag")); return; }
      const lk = t.closest("[data-like]"); if (lk) { e.preventDefault(); e.stopPropagation(); toggleLike(lk); return; }
      const cl = t.closest("[data-clike]"); if (cl) { e.preventDefault(); e.stopPropagation(); toggleClike(cl); return; }
      const dpst = t.closest("[data-delpost]"); if (dpst) { e.preventDefault(); e.stopPropagation(); delPost(dpst.getAttribute("data-delpost")); return; }
      const dcmt = t.closest("[data-delcomment]"); if (dcmt) { e.preventDefault(); e.stopPropagation(); delComment(dcmt.getAttribute("data-delcomment")); return; }
      const dots = t.closest("[data-dots]"); if (dots) { e.preventDefault(); e.stopPropagation(); postMenu(dots); return; }
      const vbtn = t.closest("[data-vote]"); if (vbtn) { e.preventDefault(); e.stopPropagation(); votePoll(vbtn); return; }
      const sbtn = t.closest("[data-share]"); if (sbtn) { e.preventDefault(); e.stopPropagation(); sharePost(sbtn); return; }
      const lbx = t.closest("[data-lbx]"); if (lbx) { e.preventDefault(); e.stopPropagation(); lightbox(lbx.getAttribute("data-lbx")); return; }
      const tpc = t.closest("[data-topic]"); if (tpc) { e.preventDefault(); e.stopPropagation(); viewFeedTopic(tpc.getAttribute("data-topic")); return; }
      const ps = t.closest("[data-post]"); if (ps) { e.preventDefault(); viewPost(Number(ps.getAttribute("data-post"))); return; }
    }); }
    function closeSheet() { const s = root.querySelector("#pf-sheet"); if (s) s.hidden = true; }
    root.querySelectorAll(".pf-tabbar [data-v]").forEach((b) => b.onclick = () => { closeSheet(); setView(b.getAttribute("data-v")); });
    root.querySelector("#pf-tbell").onclick = () => { closeSheet(); setView("notifs"); };
    root.querySelector("#pf-tabmas").onclick = () => { const s = root.querySelector("#pf-sheet"); if (s) s.hidden = false; };
    root.querySelector("#pf-sheetbg").onclick = closeSheet;
    root.querySelector("#pf-sheetx").onclick = closeSheet;
    root.querySelectorAll(".pf-sheet-i[data-act]").forEach((b) => b.onclick = () => { const a = b.getAttribute("data-act"); closeSheet(); if (a === "postear") { setView("feed"); const c = root.querySelector("#pf-comp"); if (c) c.classList.remove("pf-fold"); const t = root.querySelector("#pf-post"); if (t) t.focus(); } else if (a === "chat") setView("chat"); else if (a === "amigos") setView("amigos"); });
    pollNotifs(); rt.push(setInterval(pollNotifs, 25000));
    api("/api/img/cfg", AH).then(({ d }) => { IMG_ON = !!(d && d.on); }).catch(() => {});
    if (!window.__popWired) { window.__popWired = true; window.addEventListener("popstate", () => { if (me) rutear(); }); }
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
    if (me) setUrl("/yata");
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-v") === v));
    root.querySelectorAll(".pf-tabbar [data-v]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-v") === v));
    if (v === "feed") viewFeed();
    else if (v === "escritorios") viewEscritorios();
    else if (v === "amigos") viewAmigos();
    else if (v === "mensajes") viewMsgs();
    else if (v === "chat") viewChat();
    else if (v === "notifs") viewNotifs();
    else if (v === "admin") viewAdmin();
    else if (v === "editar") viewCuenta();
    else if (v === "perfil") viewUser(me.nick);
    else viewCuenta();
  }

  /* ---------- UX1: skeletons ---------- */
  function skLine(w, h2) { return '<span class="pf-sk pf-sk-line" style="width:' + w + '%' + (h2 ? ";height:" + h2 + "px" : "") + '"></span>'; }
  function skPost() { return '<div class="pf-skcard"><div class="pf-skrow"><span class="pf-sk pf-sk-ava"></span>' + skLine(34) + "</div>" + skLine(70) + skLine(96) + skLine(58) + "</div>"; }
  function skFeed(n) { let h = ""; for (let i = 0; i < (n || 4); i++) h += skPost(); return '<div class="pf-skwrap" aria-hidden="true">' + h + "</div>"; }
  function skPostFull() { return '<div class="pf-skwrap" aria-hidden="true"><div class="pf-skcard"><div class="pf-skrow"><span class="pf-sk pf-sk-ava"></span>' + skLine(30) + "</div>" + skLine(85, 13) + skLine(97) + skLine(94) + skLine(40) + "</div>" + skPost() + skPost() + "</div>"; }
  function skPerfil() { return '<div class="pf-skwrap" aria-hidden="true"><span class="pf-sk" style="display:block;height:130px;border-radius:16px"></span><div class="pf-skrow" style="margin-top:14px"><span class="pf-sk pf-sk-ava" style="width:74px;height:84px;border-radius:14px"></span>' + skLine(28, 14) + "</div>" + skLine(46) + skLine(64) + '<div class="pf-skrow" style="margin-top:12px;gap:8px"><span class="pf-sk pf-sk-chip"></span><span class="pf-sk pf-sk-chip"></span><span class="pf-sk pf-sk-chip"></span><span class="pf-sk pf-sk-chip"></span></div>' + skPost() + skPost() + "</div>"; }
  function skGrid(n) { let h = ""; for (let i = 0; i < (n || 6); i++) h += '<span class="pf-sk pf-sk-tile"></span>'; return '<div class="pf-skwrap" aria-hidden="true"><div class="pf-eskgrid">' + h + "</div></div>"; }
  function skRows(n) { let h = ""; for (let i = 0; i < (n || 5); i++) h += '<div class="pf-skrow"><span class="pf-sk pf-sk-ava" style="width:30px;height:34px"></span>' + skLine(22 + ((i * 19) % 46)) + "</div>"; return '<div class="pf-skwrap" aria-hidden="true">' + h + "</div>"; }

  /* ---------- Feed ---------- */
  function postHTML(p) {
    const raw = p.body || "";
    const largo = raw.length > 420 || (raw.match(/\n/g) || []).length >= 6;
    const snip = raw ? (raw.length > 420 ? esc(raw.slice(0, 420)).replace(/\n/g, " ") + "…" : esc(raw).replace(/\n/g, " ")) : "";
    return '<article class="pf-post" data-post="' + p.id + '">' +
      '<div class="pf-post-h"><span class="pf-ava">' + avaPic(p.avatar, headFor(p.nick)) + "</span>" +
      '<div class="pf-post-meta">' + uname(p.nick) + '<span>@' + esc(p.nick) + " · " + cuando(p.t) + '</span></div>' + topicChip(p) + "</div>" +
      (p.title ? '<h3 class="pf-post-t">' + esc(p.title) + "</h3>" : "") +
      (snip ? '<p class="pf-post-b">' + snip + "</p>" + (largo ? '<span class="pf-mas">ver más</span>' : "") : "") +
      imgsHTML(p) + pollHTML(p) +
      '<div class="pf-post-f">' + likeBtn(p) + cmtBtn(p.ncom) + shareBtn(p) + '<button class="pf-dots" data-dots="' + p.id + '" data-dnick="' + esc(p.nick) + '" type="button" title="Más opciones">⋯</button>' + "</div>" +
      "</article>";
  }
  function cerrarMenus() { const e = document.getElementById("pf-menu"); if (e) e.remove(); }
  function postMenu(btn) {
    const id = Number(btn.getAttribute("data-dots")), nick = btn.getAttribute("data-dnick");
    cerrarMenus();
    const m = document.createElement("div");
    m.className = "pf-menu"; m.id = "pf-menu";
    let h = '<button data-mcopy type="button">🔗 Copiar link</button><button data-mcode type="button">$ Copiar $' + id + "</button>";
    if (cur === "user" && me && me.nick === nick) h += '<button data-mpin type="button">📌 ' + (me.pinned === id ? "Quitar fijado" : "Fijar arriba") + "</button>";
    if (canDel(nick)) h += '<button data-mdel class="rojo" type="button">🗑 Borrar</button>';
    m.innerHTML = h;
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left - 60, window.innerWidth - 190)) + "px";
    m.style.top = Math.min(r.bottom + 6, window.innerHeight - m.offsetHeight - 10) + "px";
    m.querySelector("[data-mcopy]").onclick = async () => { try { await navigator.clipboard.writeText(location.origin + "/p/" + id); toast("Link copiado. Repartilo."); } catch (_) {} cerrarMenus(); };
    m.querySelector("[data-mcode]").onclick = async () => { try { await navigator.clipboard.writeText("$" + id); toast("Copiado: $" + id + ". Pegalo en un posteo para citar."); } catch (_) {} cerrarMenus(); };
    const mp = m.querySelector("[data-mpin]");
    if (mp) mp.onclick = async () => { const nuevo = me.pinned === id ? null : id; const { r: rr } = await api("/api/hub/pin-post", { method: "POST", headers: JH, body: JSON.stringify({ id: nuevo }) }); cerrarMenus(); if (rr.ok) { me.pinned = nuevo; toast(nuevo ? "Fijado arriba de tu perfil." : "Ya no está fijado."); viewUser(me.nick); } };
    const md = m.querySelector("[data-mdel]");
    if (md) md.onclick = () => { cerrarMenus(); delPost(id); };
  }
  if (!window.__menuWired) {
    window.__menuWired = true;
    document.addEventListener("click", (e) => { if (!e.target.closest("#pf-menu") && !e.target.closest("[data-dots]")) cerrarMenus(); });
  }
  const TOPIC_LIST = ["canal", "juegos", "arte", "random", "debate"];
  function viewFeed() {
    let scope = "ti", topId = 0, topic = "";
    chead("Feed", '<div class="pf-tabs2"><button data-s="ti" class="on">Para ti</button><button data-s="hot">En llamas</button><button data-s="top7">Top semana</button><button data-s="amigos">Amigos</button></div>');
    body().innerHTML =
      '<div id="pf-carousel" class="pf-carousel"></div>' +
      '<div class="pf-srch"><input id="pf-q" maxlength="60" placeholder="Buscar posteos y gente…" autocomplete="off" /><button class="pf-btn pf-mini" id="pf-qgo">Buscar</button></div>' +
      '<div class="pf-comp pf-fold" id="pf-comp">' +
        '<button class="pf-foldline" id="pf-foldgo" type="button">¿Qué está pasando en tu cabeza?</button>' +
        '<div class="pf-compwrap"><div class="pf-compin">' +
        '<input class="pf-cti" id="pf-ttl" maxlength="120" placeholder="Título de tu posteo" />' +
        '<textarea id="pf-post" maxlength="2000" placeholder="Texto (opcional). @ para nombrar, # para temas, $ para citar otro posteo."></textarea>' +
        '<div class="pf-tchips" id="pf-tchips">' + TOPIC_LIST.map((t) => '<button type="button" class="pf-tchip" data-tc="' + t + '">' + t + "</button>").join("") + "</div>" +
        '<div id="pf-poll" class="pf-pollc" style="display:none"></div>' +
        '<div id="pf-imgs" class="pf-attach" style="display:none"></div>' +
        '<div class="pf-crow"><button class="pf-ctool" id="pf-addpoll" type="button">+ Encuesta</button><button class="pf-ctool" id="pf-addimg" type="button" style="display:none">+ Fotos</button><input type="file" id="pf-file" accept="image/jpeg,image/png,image/webp" multiple style="display:none" /><span class="pf-msg" id="pf-pmsg"></span><button class="pf-btn pf-spin" id="pf-pub">Publicar</button></div>' +
        "</div></div>" +
      "</div>" +
      '<div class="pf-fchips" id="pf-fchips"><button class="pf-tchip on" data-ft="">todos</button>' + TOPIC_LIST.map((t) => '<button class="pf-tchip" data-ft="' + t + '">' + t + "</button>").join("") + "</div>" +
      '<button id="pf-new" class="pf-newpill" type="button" style="display:none"></button>' +
      '<div id="pf-pdd"></div>' +
      '<div id="pf-feed">' + skFeed(4) + "</div>";
    const qfor = () => {
      const ps = [];
      if (scope === "amigos") ps.push("scope=amigos");
      else if (scope === "hot") ps.push("scope=hot");
      else if (scope === "top7") ps.push("sort=top7");
      if (topic) ps.push("topic=" + encodeURIComponent(topic));
      return ps.length ? "?" + ps.join("&") : "";
    };
    async function load() {
      const { d } = await api("/api/social/feed" + qfor(), AH);
      const box = body().querySelector("#pf-feed"); if (!box) return;
      const posts = (d && d.posts) || [];
      topId = posts.reduce((m, p) => Math.max(m, p.id), 0);
      const np = body().querySelector("#pf-new"); if (np) np.style.display = "none";
      const pdb = body().querySelector("#pf-pdd");
      if (pdb) pdb.innerHTML = (d && d.pdd) ? '<div class="pf-pddlbl">★ Pregunta del día</div><div class="pf-pdd">' + postHTML(d.pdd) + "</div>" : "";
      box.innerHTML = posts.length ? posts.map(postHTML).join("") : '<p class="pf-empty">' + (scope === "amigos" ? "Tus amigos no postearon nada todavía." : topic ? "Nada en " + esc(topic) + " todavía. Estrenalo vos." : "Nadie publicó nada. Sé la primera voz del encierro.") + "</p>";
    }
    async function checkNew() {
      if (scope === "hot" || scope === "top7") return;
      const { d } = await api("/api/social/feed" + qfor(), AH);
      const newer = ((d && d.posts) || []).filter((p) => p.id > topId).length;
      const np = body().querySelector("#pf-new"); if (!np) return;
      if (newer > 0) { np.textContent = "↑ " + newer + (newer === 1 ? " posteo nuevo" : " posteos nuevos"); np.style.display = "block"; }
    }
    load(); mountCarousel(); vt.push(setInterval(() => { if (!document.hidden) checkNew(); }, 12000));
    body().querySelector("#pf-new").onclick = () => load();
    const compEl = body().querySelector("#pf-comp");
    body().querySelector("#pf-foldgo").onclick = () => { compEl.classList.remove("pf-fold"); const tx = body().querySelector("#pf-post"); if (tx) tx.focus(); };
    root.querySelector("#pf-chead").querySelectorAll("[data-s]").forEach((b) => { b.onclick = () => { scope = b.getAttribute("data-s"); root.querySelectorAll("#pf-chead [data-s]").forEach((x) => x.classList.remove("on")); b.classList.add("on"); load(); }; });
    body().querySelectorAll("#pf-fchips [data-ft]").forEach((b) => b.onclick = () => { topic = b.getAttribute("data-ft") || ""; body().querySelectorAll("#pf-fchips [data-ft]").forEach((x) => x.classList.toggle("on", x === b)); load(); });
    const qEl = body().querySelector("#pf-q");
    const goQ = () => { const q = qEl.value.trim(); if (q.length >= 2) viewSearch(q); };
    body().querySelector("#pf-qgo").onclick = goQ;
    qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") goQ(); });
    // composer: tema elegido
    let selTopic = "", pollOpts = null, files = [];
    const tch = body().querySelector("#pf-tchips");
    tch.querySelectorAll("[data-tc]").forEach((b) => b.onclick = () => { const v = b.getAttribute("data-tc"); selTopic = selTopic === v ? "" : v; tch.querySelectorAll("[data-tc]").forEach((x) => x.classList.toggle("on", x.getAttribute("data-tc") === selTopic)); });
    // composer: encuesta
    const pbox = body().querySelector("#pf-poll");
    function renderPoll() {
      if (!pollOpts) { pbox.style.display = "none"; pbox.innerHTML = ""; return; }
      pbox.style.display = "block";
      pbox.innerHTML = pollOpts.map((v, i) => '<input class="pf-input pf-popin" data-pi="' + i + '" maxlength="60" placeholder="Opción ' + (i + 1) + '" value="' + esc(v) + '" />').join("") +
        '<div class="pf-row" style="margin-top:6px">' + (pollOpts.length < 4 ? '<button class="pf-ctool" id="pf-pmas" type="button">+ opción</button>' : "") + '<button class="pf-ctool" id="pf-pno" type="button">Sacar encuesta</button></div>';
      pbox.querySelectorAll("[data-pi]").forEach((inp) => inp.oninput = () => { pollOpts[Number(inp.getAttribute("data-pi"))] = inp.value; });
      const pmas = pbox.querySelector("#pf-pmas"); if (pmas) pmas.onclick = () => { pollOpts.push(""); renderPoll(); };
      pbox.querySelector("#pf-pno").onclick = () => { pollOpts = null; renderPoll(); };
    }
    body().querySelector("#pf-addpoll").onclick = () => { pollOpts = pollOpts ? null : ["", ""]; renderPoll(); };
    // composer: fotos (solo si R2 está configurado)
    const ibox = body().querySelector("#pf-imgs"), fbtn = body().querySelector("#pf-addimg"), fileEl = body().querySelector("#pf-file");
    api("/api/img/cfg", AH).then(({ d }) => { if (d && d.on) fbtn.style.display = ""; });
    fbtn.onclick = () => fileEl.click();
    function renderImgs() {
      ibox.style.display = files.length ? "flex" : "none";
      ibox.innerHTML = files.map((f, i) => '<span class="pf-ath' + (f.url ? "" : " subiendo") + '"><img src="' + esc(f.prev) + '" alt="" /><button type="button" data-ix="' + i + '">&times;</button></span>').join("");
      ibox.querySelectorAll("[data-ix]").forEach((b) => b.onclick = () => { files.splice(Number(b.getAttribute("data-ix")), 1); renderImgs(); });
    }
    function compressImg(file, cb) {
      const fr = new FileReader();
      fr.onload = () => { const img = new Image(); img.onload = () => {
        const MX = 1600, sc = Math.min(1, MX / Math.max(img.width, img.height));
        const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        try { cv.toBlob((bl) => cb(bl), "image/webp", 0.82); } catch (_) { cb(null); }
      }; img.onerror = () => cb(null); img.src = String(fr.result); };
      fr.onerror = () => cb(null); fr.readAsDataURL(file);
    }
    fileEl.onchange = () => {
      const list = Array.from(fileEl.files || []).slice(0, 4 - files.length);
      fileEl.value = "";
      list.forEach((f) => {
        const ent = { url: "", prev: URL.createObjectURL(f) };
        files.push(ent); renderImgs();
        compressImg(f, async (bl) => {
          if (!bl) { files.splice(files.indexOf(ent), 1); renderImgs(); toast("No se pudo leer una imagen."); return; }
          const sg = await api("/api/img/sign", { method: "POST", headers: JH, body: JSON.stringify({ type: bl.type, size: bl.size }) });
          if (!sg.r.ok || !sg.d || !sg.d.ok) { files.splice(files.indexOf(ent), 1); renderImgs(); toast((sg.d && sg.d.message) || "No se pudo subir."); return; }
          try {
            const up = await fetch(sg.d.put, { method: "PUT", body: bl, headers: { "content-type": bl.type } });
            if (!up.ok) throw new Error("put");
            ent.url = sg.d.url; renderImgs();
          } catch (_) { files.splice(files.indexOf(ent), 1); renderImgs(); toast("Falló la subida. Probá de nuevo."); }
        });
      });
    };
    body().querySelector("#pf-pub").onclick = async () => {
      const ti = body().querySelector("#pf-ttl"), ta = body().querySelector("#pf-post"), pm = body().querySelector("#pf-pmsg");
      if (files.some((f) => !f.url)) { pm.textContent = "Esperá que terminen de subir las fotos."; return; }
      let poll = null;
      if (pollOpts) {
        const ops = pollOpts.map((s) => s.trim()).filter(Boolean);
        if (ops.length >= 2) poll = ops.slice(0, 4);
        else { pm.textContent = "La encuesta necesita al menos 2 opciones."; return; }
      }
      pm.textContent = "...";
      const payload = { title: ti.value, body: ta.value };
      if (selTopic) payload.topic = selTopic;
      if (poll) payload.poll = poll;
      if (files.length) payload.images = files.map((f) => f.url);
      const { r, d } = await api("/api/social/post", { method: "POST", headers: JH, body: JSON.stringify(payload) });
      if (r.ok) {
        ti.value = ""; ta.value = ""; pm.textContent = "";
        selTopic = ""; tch.querySelectorAll("[data-tc]").forEach((x) => x.classList.remove("on"));
        pollOpts = null; renderPoll(); files = []; renderImgs();
        scope = "ti"; root.querySelectorAll("#pf-chead [data-s]").forEach((x) => x.classList.toggle("on", x.getAttribute("data-s") === "ti"));
        load();
      } else pm.textContent = (d && d.message) || "No se pudo.";
    };
  }

  function viewFeedTopic(t) {
    clearView(); cur = "feed";
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-v") === "feed"));
    chead("Tema: " + esc(t));
    body().innerHTML = '<div id="pf-feed">' + skFeed(3) + "</div>";
    api("/api/social/feed?topic=" + encodeURIComponent(t), AH).then(({ d }) => {
      const box = body().querySelector("#pf-feed"); if (!box) return;
      const posts = (d && d.posts) || [];
      box.innerHTML = posts.length ? posts.map(postHTML).join("") : '<p class="pf-empty">Nada en ' + esc(t) + " todavía. Estrenalo vos.</p>";
    });
  }

  async function viewSearch(q) {
    clearView(); cur = "buscar";
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.remove("on"));
    chead("Buscar");
    body().innerHTML = '<div class="pf-srch"><input id="bs-q" maxlength="60" value="' + esc(q) + '" autocomplete="off" /><button class="pf-btn pf-mini" id="bs-go">Buscar</button></div><div id="bs-res">' + skFeed(2) + "</div>";
    const inp = body().querySelector("#bs-q");
    const go = () => { const v = inp.value.trim(); if (v.length >= 2) viewSearch(v); };
    body().querySelector("#bs-go").onclick = go;
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    const { d } = await api("/api/social/buscar?q=" + encodeURIComponent(q), AH);
    const box = body().querySelector("#bs-res"); if (!box) return;
    const us = (d && d.usuarios) || [], ps = (d && d.posts) || [];
    let h = "";
    if (us.length) h += '<div class="pf-h">Gente</div>' + us.map((n) => '<div class="pf-fila">' + uname(n) + '<button class="pf-btn ghost pf-mini" data-u="' + esc(n) + '">Ver perfil</button></div>').join("");
    if (ps.length) h += '<div class="pf-h">Posteos</div>' + ps.map(postHTML).join("");
    box.innerHTML = h || '<p class="pf-empty">Ni rastros de eso. Probá con otra palabra.</p>';
  }

  function viewFeedTag(tag) {
    clearView(); cur = "feed";
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-v") === "feed"));
    chead("#" + esc(tag));
    body().innerHTML = '<div id="pf-feed">' + skFeed(3) + "</div>";
    api("/api/social/feed?tag=" + encodeURIComponent(tag), AH).then(({ d }) => {
      const box = body().querySelector("#pf-feed"); if (!box) return;
      const posts = (d && d.posts) || [];
      box.innerHTML = posts.length ? posts.map(postHTML).join("") : '<p class="pf-empty">Nada con #' + esc(tag) + " todavía.</p>";
    });
  }

  function commentTree(comments, limit) {
    const byParent = {};
    comments.forEach((c) => { const k = c.parent || 0; (byParent[k] = byParent[k] || []).push(c); });
    function render(parent, depth) {
      let lista = byParent[parent] || [];
      if (parent === 0 && limit) lista = lista.slice(0, limit);
      return lista.map((c) =>
        '<div class="pf-cmt">' +
          '<div class="pf-cmt-h"><span class="pf-ava pf-ava-sm">' + avaPic(c.avatar, headFor(c.nick)) + '</span><div class="pf-cmt-meta">' + uname(c.nick) + "<span>" + cuando(c.t) + "</span></div></div>" +
          '<div class="pf-cmt-b">' + rich(c.body) + "</div>" +
          '<div class="pf-cmt-f"><button class="pf-like pf-like-sm' + (c.liked ? " on" : "") + '" data-clike="' + c.id + '" type="button" title="Me cala">' + skull() + "<span>" + (c.nlik || 0) + '</span></button><a class="pf-reply" data-reply="' + c.id + '">Responder</a>' + delBtnCmt(c) + "</div>" +
          ((byParent[c.id] || []).length ? '<div class="pf-cmt-kids">' + render(c.id, depth + 1) + "</div>" : "") +
        "</div>"
      ).join("");
    }
    return render(0, 0);
  }

  async function viewPost(id) {
    clearView(); cur = "post"; window.__curPost = Number(id);
    setUrl("/p/" + Number(id));
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.remove("on"));
    chead("Posteo");
    const expandir = !!window.__expandCmts; window.__expandCmts = false;
    body().innerHTML = skPostFull();
    const { r, d } = await api("/api/social/post?id=" + id, AH);
    if (!r.ok || !d || !d.ok) { body().innerHTML = '<p class="pf-empty">Ese posteo no existe.</p>'; return; }
    const p = d.post, comments = d.comments || [];
    body().innerHTML =
      '<a class="pf-back2" id="pp-back">&#8592; volver al feed</a>' +
      '<article class="pf-postfull">' +
        '<div class="pf-post-h"><span class="pf-ava">' + avaPic(p.avatar, headFor(p.nick)) + "</span>" +
        '<div class="pf-post-meta">' + uname(p.nick) + '<span>@' + esc(p.nick) + " · " + cuando(p.t) + "</span></div></div>" +
        (p.title ? '<h2 class="pf-postfull-t">' + esc(p.title) + "</h2>" : "") +
        (p.body ? '<div class="pf-postfull-b">' + rich(p.body) + "</div>" : "") +
        imgsHTML(p) + pollHTML(p) +
        '<div class="pf-post-f" style="margin-top:14px">' + likeBtn(p) + cmtBtn(comments.length) + shareBtn(p) + '<button class="pf-dots" data-dots="' + p.id + '" data-dnick="' + esc(p.nick) + '" type="button" title="Más opciones">⋯</button>' + "</div>" +
      "</article>" +
      '<div class="pf-h">Comentarios</div>' +
      '<div class="pf-comp pf-comp-c"><textarea id="pp-ctext" maxlength="1000" placeholder="Sumate al hilo… (@ # $)"></textarea><div class="pf-crow"><span class="pf-msg" id="pp-cmsg"></span><button class="pf-btn pf-spin" id="pp-csend">Comentar</button></div></div>' +
      '<div id="pp-comments"></div>';
    const cbox = body().querySelector("#pp-comments");
    const tops = comments.filter((c) => !c.parent);
    function pintaCmts(todos) {
      cbox.innerHTML = comments.length
        ? commentTree(comments, todos ? 0 : 3) + (!todos && tops.length > 3 ? '<button class="pf-vermas" id="pp-vermas" type="button">Ver los ' + comments.length + " comentarios</button>" : "")
        : '<p class="pf-empty">Sin comentarios. Arrancá el hilo.</p>';
      const vm = cbox.querySelector("#pp-vermas"); if (vm) vm.onclick = () => pintaCmts(true);
    }
    pintaCmts(expandir);
    const cfo = body().querySelector(".pf-postfull [data-cmt]"); if (cfo) cfo.onclick = () => { const t = body().querySelector("#pp-ctext"); if (t) t.focus(); };
    body().querySelector("#pp-back").onclick = () => setView("feed");
    let replyTo = null;
    const cmsg = body().querySelector("#pp-cmsg"), ctext = body().querySelector("#pp-ctext");
    cbox.addEventListener("click", (e) => { const rb = e.target.closest ? e.target.closest("[data-reply]") : null; if (rb) { replyTo = Number(rb.getAttribute("data-reply")); ctext.focus(); cmsg.textContent = "Respondiendo en el hilo…"; } });
    body().querySelector("#pp-csend").onclick = async () => { cmsg.textContent = "..."; const { r: rr, d: dd } = await api("/api/social/comment", { method: "POST", headers: JH, body: JSON.stringify({ postId: id, parentId: replyTo, body: ctext.value }) }); if (rr.ok) { ctext.value = ""; replyTo = null; cmsg.textContent = ""; toast("Comentario publicado."); window.__expandCmts = true; viewPost(id); } else cmsg.textContent = (dd && dd.message) || "No se pudo."; };
  }

  /* ---------- El Escritorio (S.O. de perfil) ---------- */
  const DK_APPS = {
    tetristo: { l: "TeTristo", go: "/tetristo", emb: "/tetristo" },
    parpadeo: { l: "No Parpadees", go: "/tristos?juego=parpadeo", emb: "/tristos?juego=parpadeo&embed=1" },
    laberinto: { l: "El Laberinto", go: "/laberinto" },
    chat: { l: "Chat Global", v: "chat" },
    boton: { l: "El Botón", go: "/tristos?juego=boton", emb: "/tristos?juego=boton&embed=1" },
    mural: { l: "Mural", go: "/tristos?juego=mural", emb: "/tristos?juego=mural&embed=1" },
    pueblo: { l: "Pueblo", go: "/pueblo" },
    feed: { l: "Feed", v: "feed" },
    msn: { l: "Mensajes", msn: true },
    consola: { l: "La Consola", go: "/consola", emb: "/consola?embed=1" },
  };
  const DK_GLYPH = {
    folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 01-10 0z"/><path d="M7 6H4a3 3 0 003 3M17 6h3a3 3 0 01-3 3M12 14v3M8 20h8M10 17h4v3h-4z"/>',
    tetristo: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    parpadeo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    laberinto: '<path d="M4 4h16v16H4z"/><path d="M8 8h8v8H8zM12 4v4M4 12h4M16 12h4M12 16v4"/>',
    chat: '<path d="M5 5h14v10H9l-4 4z"/>',
    boton: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
    mural: '<path d="M4 4h16v16H4z"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16"/>',
    pueblo: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    feed: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    tv: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 3l4 4 4-4"/><circle cx="17.5" cy="11" r="1" fill="currentColor" stroke="none"/>',
    msn: '<path d="M4 5h16v11H10l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    consola: '<rect x="2.5" y="8" width="19" height="9" rx="4.5"/><path d="M7.5 11v3M6 12.5h3"/><circle cx="15.5" cy="11.5" r=".8" fill="currentColor" stroke="none"/><circle cx="18" cy="13.5" r=".8" fill="currentColor" stroke="none"/>',
  };
  function dkSvg(g, color) { return '<svg viewBox="0 0 24 24" fill="none" stroke="' + (color || "currentColor") + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (DK_GLYPH[g] || DK_GLYPH.note) + "</svg>"; }
  async function viewDesktop(nick) {
    clearView(); cur = "desk";
    setUrl("/demon/" + encodeURIComponent(nick) + "/escritorio");
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.remove("on"));
    chead("Escritorio");
    body().innerHTML = '<p class="pf-dimc">Prendiendo el monitor…</p>';
    const { r, d } = await api("/api/desktop?nick=" + encodeURIComponent(nick), AH);
    if (!r.ok || !d || !d.ok) { body().innerHTML = '<p class="pf-empty">No se pudo cargar este escritorio.</p>'; return; }
    const D = d, own = !!d.own, CELL = 100;
    let zTop = 10, dragging = false, STATS = d.stats || {}, MIR = d.mirando || 1, CFG = d.config || {}, POSTW = d.post || null, MIRONES = d.mirones || null, lastReact = 0;
    const acc = (D.perfil && typeof D.perfil.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(D.perfil.accent)) ? D.perfil.accent : "#6b8cff";
    D.papelera = d.papelera || []; D.firmas = d.firmas || []; D.mascota = d.mascota || null;
    body().innerHTML =
      '<a class="pf-back2" id="dk-back">&#8592; Perfil de ' + esc(nick) + "</a>" +
      (own ? '<div class="dk-bar"><button class="pf-btn pf-mini" id="dk-crear">+ Crear</button><button class="pf-btn ghost pf-mini" id="dk-caja">Caja <b id="dk-cajan"></b></button><input type="file" id="dk-stkf" accept="image/*" style="display:none" /><span class="pf-dimc" id="dk-msg" style="margin-left:auto">clic derecho en el escritorio = menú</span></div>' : "") +
      '<div class="dk-surface" id="dk-s"><div class="dk-canvas" id="dk-c"></div><div class="dk-scan" id="dk-scan"></div><button class="dk-fsbtn" id="dk-fs" type="button" title="Pantalla completa">⛶</button><button class="dk-fsbtn dk-chatbtn" id="dk-dchat" type="button" title="Chat del escritorio">💬</button><button class="dk-fsbtn dk-firbtn" id="dk-fir" type="button" title="Libro de firmas">✒</button><span class="dk-pres" id="dk-pres" style="display:none"></span><div class="dk-reactbar" id="dk-rbar"></div></div>';
    body().querySelector("#dk-back").onclick = () => viewUser(nick);
    const LW = 1040, LH = 585;
    let SCALE = 1;
    function applyCfg() {
      const wp = String(CFG.wallpaper || "");
      if (wp) { S.style.background = ""; S.style.backgroundImage = "url('" + wp + "')"; }
      else if (D.perfil && D.perfil.banner) { S.style.background = ""; S.style.backgroundImage = "url('" + D.perfil.banner + "')"; }
      else { S.style.backgroundImage = ""; S.style.background = "linear-gradient(135deg," + acc + "22,#08080b 70%)"; }
      const sc = S.querySelector("#dk-scan"); if (sc) sc.style.display = CFG.scan === false ? "none" : "";
      S.classList.remove("dk-skin-win95", "dk-skin-fosforo", "dk-skin-vapor");
      if (CFG.skin && CFG.skin !== "crt") S.classList.add("dk-skin-" + CFG.skin);
      S.style.cursor = CFG.cursor ? "url('" + CFG.cursor + "') 4 4, auto" : "";
    }
    const S = body().querySelector("#dk-s");
    const C = S.querySelector("#dk-c");
    const colsN = () => Math.floor(LW / CELL);
    const rowsN = () => Math.floor(LH / CELL);
    function applyScale() {
      const fs = document.fullscreenElement === S || S.classList.contains("dk-full");
      if (fs) {
        SCALE = Math.min(window.innerWidth / LW, window.innerHeight / LH);
        C.style.left = Math.max(0, (window.innerWidth - LW * SCALE) / 2) + "px";
        C.style.top = Math.max(0, (window.innerHeight - LH * SCALE) / 2) + "px";
        S.style.height = "";
      } else {
        SCALE = Math.max(0.2, S.clientWidth / LW);
        C.style.left = "0px"; C.style.top = "0px";
        S.style.height = Math.round(LH * SCALE) + "px";
      }
      C.style.transform = "scale(" + SCALE + ")";
    }
    if (!window.__dkScaleWired) {
      window.__dkScaleWired = true;
      const reEsc = () => { if (cur !== "desk") return; const S2 = document.getElementById("dk-s"); if (S2 && window.__dkScale) window.__dkScale(); };
      window.addEventListener("resize", reEsc);
      document.addEventListener("fullscreenchange", reEsc);
    }
    window.__dkScale = applyScale;
    function rootItems() { return D.items.filter((i) => !i.parent && !i.hidden); }
    function cajaItems() { return D.items.filter((i) => i.hidden); }
    function trofeosSinPoner() { const puestos = new Set(D.items.filter((i) => i.type === "trophy").map((i) => String(i.data.kind))); return (D.trofeos || []).filter((t) => !puestos.has(t.kind)); }
    function gridItems() { return rootItems().filter((i) => i.type !== "deco" && i.type !== "marquee"); }
    function ocupado() { const m = {}; gridItems().forEach((i) => { m[i.x + "_" + i.y] = i.id; }); return m; }
    function freeCell() { const m = ocupado(); m["0_0"] = "sys"; const nc = colsN(), nr = rowsN(); for (let y = 0; y < nr; y++) for (let x = 0; x < nc; x++) if (!m[x + "_" + y]) return { x: x, y: y }; return { x: 0, y: 0 }; }
    function setCajaN() { const el = body().querySelector("#dk-cajan"); if (el) el.textContent = String(cajaItems().length + trofeosSinPoner().length || ""); }
    function navShortcut(app2) {
      const a = DK_APPS[app2];
      if (!a) return;
      if (a.msn) { winMsn(); return; }
      if (a.v) { setView(a.v); return; }
      const src = (a.emb || a.go) + ((a.emb || a.go).indexOf("?") >= 0 ? "&" : "?") + "cb=" + Date.now();
      const w = openWin("app" + app2, esc(a.l), '<div class="dk-appf"><iframe src="' + esc(src) + '" title="' + esc(a.l) + '"></iframe></div><div class="dk-fbar" style="margin-top:8px"><a class="pf-btn ghost pf-mini" href="' + esc(a.go) + '">Abrir afuera ↗</a></div>');
      w.classList.add("dk-appwin");
    }
    function winMsn() {
      const w = openWin("msn", "Mensajes", '<div id="msn-list"><p class="pf-dimc" style="padding:8px">Cargando contactos…</p></div>');
      (async () => {
        const { d: dd } = await api("/api/social/amigos", AH);
        const box = w.querySelector("#msn-list"); if (!box) return;
        const am = (dd && dd.amigos) || [];
        box.innerHTML = am.length
          ? am.map((n) => '<div class="dk-fila"><span><span class="dk-on"></span> ' + esc(n) + '</span><button class="pf-btn pf-mini" data-msn="' + esc(n) + '">Chatear</button></div>').join("")
          : '<p class="pf-dimc" style="padding:8px">Sin amigos todavía. Agregá gente desde el feed y volvé.</p>';
        box.querySelectorAll("[data-msn]").forEach((b) => b.onclick = () => dmWin(b.getAttribute("data-msn")));
      })();
    }
    function dmWin(con) {
      const key = "dm" + con.toLowerCase();
      const w = openWin(key, esc(con), '<div class="dk-chatlog" id="cl"></div><div class="pf-row" style="margin-top:8px"><input class="pf-input" id="ct" maxlength="300" placeholder="escribí…" autocomplete="off" /><button class="pf-btn pf-mini" id="cs">Enviar</button><button class="pf-btn ghost pf-mini" id="cz" title="Zumbido">⚡</button></div><p class="pf-msg" id="ce" style="margin:4px 0 0"></p>');
      const log = w.querySelector("#cl"), txt = w.querySelector("#ct"), em = w.querySelector("#ce");
      let maxId = 0;
      function add(m) { const dv = document.createElement("div"); dv.className = "pf-m" + (m.mio ? " mio" : ""); if (m.body === "*ZUMBIDO*") { dv.textContent = "⚡ ZUMBIDO"; dv.style.fontWeight = "800"; if (!m.mio) { w.classList.add("dk-shake"); setTimeout(() => w.classList.remove("dk-shake"), 650); } } else dv.textContent = m.body; log.appendChild(dv); if (m.id > maxId) maxId = m.id; }
      w.querySelector("#cz").onclick = async () => { const { r: rr, d: dd } = await api("/api/social/dm", { method: "POST", headers: JH, body: JSON.stringify({ nick: con, body: "*ZUMBIDO*" }) }); if (rr.ok && dd && dd.mensaje) { add(dd.mensaje); log.scrollTop = log.scrollHeight; w.classList.add("dk-shake"); setTimeout(() => w.classList.remove("dk-shake"), 650); } };
      async function load(first) {
        const { r: rr, d: dd } = await api("/api/social/dm?con=" + encodeURIComponent(con) + (maxId ? "&since=" + maxId : ""), AH);
        if (rr.status === 403) { em.textContent = "Tienen que ser amigos."; return; }
        if (dd && dd.mensajes && dd.mensajes.length) { dd.mensajes.forEach(add); log.scrollTop = log.scrollHeight; if (!first && dd.mensajes.some((m) => !m.mio)) ping(); }
      }
      load(true);
      const iv = setInterval(() => { if (!document.hidden) load(false); }, 3000);
      vt.push(iv);
      w.__onclose = () => clearInterval(iv);
      async function send() {
        const t = txt.value.trim(); if (!t) return;
        const { r: rr, d: dd } = await api("/api/social/dm", { method: "POST", headers: JH, body: JSON.stringify({ nick: con, body: t }) });
        if (rr.ok && dd && dd.mensaje) { add(dd.mensaje); log.scrollTop = log.scrollHeight; txt.value = ""; } else em.textContent = (dd && dd.message) || "No se pudo.";
      }
      w.querySelector("#cs").onclick = send;
      txt.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    }
    function winDeskChat() {
      const w = openWin("dchat", "Chat del escritorio", '<div class="dk-chatlog" id="dcl"><p class="pf-dimc">Los que están acá ahora, charlando. Se borra solo: lo que pasa en el escritorio, queda en el escritorio.</p></div>' + (me ? '<div class="pf-row" style="margin-top:8px"><input class="pf-input" id="dct" maxlength="200" placeholder="decí algo…" autocomplete="off" /><button class="pf-btn pf-mini" id="dcs">Enviar</button></div><p class="pf-msg" id="dce" style="margin:4px 0 0"></p>' : '<p class="pf-dimc" style="padding:8px 0 0">Entrá a YATA para chatear.</p>'));
      const log = w.querySelector("#dcl");
      let maxId = 0, first = true;
      function add(m) { if (first) { log.innerHTML = ""; first = false; } const dv = document.createElement("div"); dv.className = "pf-gcm"; const b = document.createElement("b"); b.textContent = m.nick + ":"; const sp = document.createElement("span"); sp.textContent = " " + m.body; dv.appendChild(b); dv.appendChild(sp); log.appendChild(dv); if (m.id > maxId) maxId = m.id; }
      async function load() {
        const { d: dd } = await api("/api/desktop/chat?nick=" + encodeURIComponent(nick) + (maxId ? "&since=" + maxId : ""), AH);
        if (dd && dd.ok && dd.mensajes && dd.mensajes.length) { const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60; dd.mensajes.forEach(add); if (stick) log.scrollTop = log.scrollHeight; }
      }
      load();
      const iv = setInterval(() => { if (!document.hidden) load(); }, 3000);
      vt.push(iv);
      w.__onclose = () => clearInterval(iv);
      const txt = w.querySelector("#dct");
      if (txt) {
        const em = w.querySelector("#dce");
        const send = async () => {
          const t = txt.value.trim(); if (!t) return;
          const { r: rr, d: dd } = await api("/api/desktop/chat", { method: "POST", headers: JH, body: JSON.stringify({ nick: nick, body: t }) });
          if (rr.ok) { txt.value = ""; load(); } else em.textContent = (dd && dd.message) || "No se pudo.";
        };
        w.querySelector("#dcs").onclick = send;
        txt.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
      }
    }
    function ctxMenu(it, px, py) {
      const w = openWin("ctx", it.type === "photo" ? "Foto" : "Ícono", '<div class="dk-fbar" style="flex-direction:column;align-items:stretch;margin:0">' +
        '<button class="pf-btn ghost pf-mini" id="cx-caja">Guardar en la Caja</button>' +
        ((it.type === "folder" || it.type === "note" || it.type === "shortcut") ? '<button class="pf-btn ghost pf-mini" id="cx-ico">Cambiar ícono</button><input type="file" id="cx-file" accept="image/*" style="display:none" />' : "") +
        (it.type === "folder" ? '<button class="pf-btn ghost pf-mini" id="cx-pin">' + (it.data.pin ? "Sacar candado" : "Ponerle candado (PIN)") + "</button>" : "") +
        '<button class="pf-btn pf-mini" id="cx-del" style="background:#D23B47;border-color:#D23B47">Tirar a la basura</button>' +
        '</div><p class="pf-msg" id="cx-m" style="margin:6px 0 0"></p>');
      const pinB = w.querySelector("#cx-pin");
      if (pinB) pinB.onclick = async () => {
        let nuevo = null;
        if (!it.data.pin) { nuevo = window.prompt("PIN de 4 dígitos para esta carpeta:"); if (!nuevo || !/^\d{4}$/.test(nuevo.trim())) { w.querySelector("#cx-m").textContent = "Tienen que ser 4 dígitos."; return; } nuevo = nuevo.trim(); }
        const data = { name: it.data.name };
        if (it.data.icon) data.icon = it.data.icon;
        if (nuevo) data.pin = nuevo;
        const { r: rr, d: dd } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, data: data }) });
        if (rr.ok) { it.data = (dd && dd.data) || data; refresh(); winKill("ctx"); toast(nuevo ? "Carpeta con candado." : "Candado afuera."); }
        else w.querySelector("#cx-m").textContent = (dd && dd.message) || "No se pudo.";
      };
      w.style.left = Math.max(0, Math.min(px, S.clientWidth - 200)) + "px";
      w.style.top = Math.max(0, Math.min(py, S.clientHeight - 160)) + "px";
      w.querySelector("#cx-caja").onclick = async () => {
        const { r: rr } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, hidden: true }) });
        if (rr.ok) { it.hidden = true; refresh(); winKill("ctx"); }
      };
      w.querySelector("#cx-del").onclick = async () => {
        const { r: rr } = await api("/api/desktop/borrar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id }) });
        if (rr.ok) {
          if (it.type === "folder") D.items.forEach((i) => { if (i.parent === it.id) i.parent = null; });
          if (it.type === "photo") D.fotos.unshift({ url: String(it.data.url || ""), post: 0 });
          D.items = D.items.filter((i) => i.id !== it.id);
          refresh(); winKill("ctx"); toast("A la basura. Sin papelera, sin culpa.");
        }
      };
      const ib = w.querySelector("#cx-ico");
      if (ib) {
        const fi = w.querySelector("#cx-file");
        ib.onclick = () => fi.click();
        fi.onchange = () => {
          const f = fi.files && fi.files[0]; if (!f) return;
          w.querySelector("#cx-m").textContent = "Subiendo ícono…";
          resizeToBlob(f, 96, 96, async (bl) => {
            if (!bl) { w.querySelector("#cx-m").textContent = "No se pudo leer."; return; }
            const url = await subirPerfilR2(bl);
            if (!url) { w.querySelector("#cx-m").textContent = "No se pudo subir."; return; }
            const data = it.type === "folder" ? { name: it.data.name, icon: url } : it.type === "note" ? { text: it.data.text, icon: url } : { app: it.data.app, icon: url };
            const { r: rr, d: dd } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, data: data }) });
            if (rr.ok) { it.data = (dd && dd.data) || data; refresh(); winKill("ctx"); toast("Ícono nuevo, escritorio tuyo."); }
            else w.querySelector("#cx-m").textContent = (dd && dd.message) || "No se pudo.";
          });
        };
      }
    }
    const GAME_LBL = { tetristo: "TeTristo", parpadeo: "No Parpadees", laberinto: "El Laberinto" };
    function wLabel(it) { const k = String(it.data.kind); if (k === "top") return "Top " + (GAME_LBL[String(it.data.game)] || "TeTristo"); if (k === "count") return esc(String(it.data.label || "Cuenta")); if (k === "post") return "Mi posteo"; return k === "reloj" ? "Reloj" : k === "karma" ? "Karma" : k === "racha" ? "Racha" : "Visitas"; }
    function wVal(k, game, it) {
      if (k === "reloj") { const t = new Date(); return ("0" + t.getHours()).slice(-2) + ":" + ("0" + t.getMinutes()).slice(-2); }
      if (k === "karma") return fmt.format(STATS.karma || 0);
      if (k === "racha") return (STATS.racha || 0) + "d";
      if (k === "visitas") return fmt.format(STATS.visitas || 0);
      if (k === "top") { const t = STATS.tops && STATS.tops[game]; return t ? "#" + t.rank : "—"; }
      if (k === "count") { const h = Number(it && it.data ? it.data.hasta : 0) - Date.now(); if (h <= 0) return "¡YA!"; const dd2 = Math.floor(h / 86400000), hh = Math.floor((h % 86400000) / 3600000), mm = Math.floor((h % 3600000) / 60000); return dd2 > 0 ? dd2 + "d " + hh + "h" : hh + "h " + mm + "m"; }
      if (k === "post") return POSTW ? "$" + POSTW.id : "—";
      return "—";
    }
    function updateWidgets() { S.querySelectorAll(".dk-wv").forEach((el) => { const id2 = Number(el.getAttribute("data-wid2")) || 0; const it = D.items.find((i) => i.id === id2); el.textContent = wVal(el.getAttribute("data-wk"), el.getAttribute("data-wgame") || "tetristo", it); }); }
    function setPres(n) { MIR = n || 1; const el = S.querySelector("#dk-pres"); if (!el) return; if (MIR >= 2) { el.style.display = ""; el.textContent = "👁 " + MIR + " mirando ahora"; } else el.style.display = "none"; }
    function winKill(key) { const w = S.querySelector('[data-win="' + key + '"]'); if (w) { if (w.__onclose) { try { w.__onclose(); } catch (_) {} } w.remove(); } }
    function openWin(key, title, html) {
      winKill(key);
      const w = document.createElement("div");
      w.className = "dk-win"; w.setAttribute("data-win", key);
      w.style.left = Math.min(40 + S.querySelectorAll(".dk-win").length * 26, S.clientWidth - 280) + "px";
      w.style.top = (30 + S.querySelectorAll(".dk-win").length * 24) + "px";
      w.style.zIndex = ++zTop;
      w.innerHTML = '<div class="dk-tit"><span>' + title + '</span><span class="dk-tbtns"><button class="dk-wb" data-wmin type="button" title="Minimizar">─</button><button class="dk-wb" data-wmax type="button" title="Maximizar">□</button><button class="dk-x" type="button" title="Cerrar">&times;</button></span></div><div class="dk-body">' + html + "</div>";
      S.appendChild(w);
      w.addEventListener("pointerdown", () => { w.style.zIndex = ++zTop; });
      w.querySelector(".dk-x").onclick = () => { if (w.__onclose) { try { w.__onclose(); } catch (_) {} } w.remove(); };
      const bMin = w.querySelector("[data-wmin]"), bMax = w.querySelector("[data-wmax]");
      function toggleMax() {
        w.classList.remove("dk-min");
        if (w.classList.contains("dk-max")) {
          w.classList.remove("dk-max");
          w.style.left = w.__pl || "40px"; w.style.top = w.__pt || "30px";
          w.style.width = w.__pw || ""; w.style.height = w.__ph || "";
        } else {
          w.__pl = w.style.left; w.__pt = w.style.top; w.__pw = w.style.width; w.__ph = w.style.height;
          w.classList.add("dk-max"); w.style.zIndex = ++zTop;
        }
      }
      bMin.onclick = (e) => { e.stopPropagation(); if (w.classList.contains("dk-max")) toggleMax(); w.classList.toggle("dk-min"); };
      bMax.onclick = (e) => { e.stopPropagation(); toggleMax(); };
      const tit = w.querySelector(".dk-tit");
      tit.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) toggleMax(); });
      tit.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        if (w.classList.contains("dk-max")) return;
        const sx = e.clientX - w.offsetLeft, sy = e.clientY - w.offsetTop;
        const mv = (ev) => { w.style.left = Math.max(0, Math.min(S.clientWidth - 60, ev.clientX - sx)) + "px"; w.style.top = Math.max(0, Math.min(S.clientHeight - 40, ev.clientY - sy)) + "px"; };
        const up = () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); };
        document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
        e.preventDefault();
      });
      return w;
    }
    function fotoThumbs(list, enCarpeta) {
      if (!list.length) return '<p class="pf-dimc" style="padding:10px">Vacío. Como tu heladera a fin de mes.</p>';
      const carpetas = D.items.filter((i) => i.type === "folder");
      return '<div class="dk-fgrid">' + list.map((f) => {
        const sel = own ? '<select class="dk-mv" data-url="' + esc(f.url) + '" data-rid="' + (f.id || "") + '"><option value="">mover…</option><option value="root">al Escritorio</option>' + carpetas.map((c) => '<option value="' + c.id + '">' + esc(c.data.name) + "</option>").join("") + (enCarpeta && f.id ? '<option value="sys">a Mis fotos</option>' : "") + "</select>" : "";
        return '<figure class="dk-foto"><img loading="lazy" src="' + esc(f.url) + '" data-lbx="' + esc(f.url) + '" alt="" />' + sel + "</figure>";
      }).join("") + "</div>";
    }
    function wireMv(w) {
      w.querySelectorAll(".dk-mv").forEach((s) => s.onchange = async () => {
        const v = s.value, url = s.getAttribute("data-url"), rid = Number(s.getAttribute("data-rid")) || 0;
        s.value = "";
        if (!v) return;
        if (rid) {
          if (v === "sys") { const { r: rr } = await api("/api/desktop/borrar", { method: "POST", headers: JH, body: JSON.stringify({ id: rid }) }); if (rr.ok) { D.items = D.items.filter((i) => i.id !== rid); D.fotos.unshift({ url: url, post: 0 }); refresh(); } return; }
          const fc = freeCell();
          const { r: rr } = await api("/api/desktop/mover", { method: "POST", headers: JH, body: JSON.stringify({ id: rid, x: v === "root" ? fc.x : 0, y: v === "root" ? fc.y : 0, parentId: v === "root" ? null : Number(v) }) });
          if (rr.ok) { const it = D.items.find((i) => i.id === rid); if (it) { it.parent = v === "root" ? null : Number(v); if (v === "root") { it.x = fc.x; it.y = fc.y; } } refresh(); }
          return;
        }
        const fc2 = freeCell();
        const payload = { type: "photo", data: { url: url }, x: v === "root" ? fc2.x : 0, y: v === "root" ? fc2.y : 0 };
        if (v !== "root" && v !== "sys") payload.parentId = Number(v);
        const { r: rr2, d: dd } = await api("/api/desktop/crear", { method: "POST", headers: JH, body: JSON.stringify(payload) });
        if (rr2.ok && dd && dd.item) { D.items.push(dd.item); D.fotos = D.fotos.filter((f) => f.url !== url); refresh(); }
        else toast((dd && dd.message) || "No se pudo.");
      });
    }
    function openTv(it) {
      const vid = String(it.data.video || ""), web = String(it.data.web || ""), t0 = Number(it.data.t0 || 0);
      const start = vid && t0 ? Math.max(0, Math.floor((Date.now() - t0) / 1000)) : 0;
      const frame = vid
        ? '<div class="dk-tvf"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(vid) + '?start=' + start + '&autoplay=1&mute=1&rel=0" title="YATA TV" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div><p class="pf-dimc" style="padding:6px 0 0">' + (own ? "Lo que pongas acá lo ven todos los que visiten tu escritorio." : "Sincronizada con este escritorio. Tocá play o sacale el mute si no arranca.") + "</p>"
        : web
        ? '<div class="dk-tvf"><iframe src="' + esc(web) + '" title="YATA TV" frameborder="0" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></div><p class="pf-dimc" style="padding:6px 0 0">Canal web en vivo. Si se ve negro, ese sitio no se deja incrustar — no depende de nosotros.</p>'
        : '<p class="pf-dimc" style="padding:8px 0">' + (own ? "Pegá un link de YouTube (o una URL https) y dejá algo sonando para las visitas." : "El dueño no dejó nada puesto. Pura estática.") + "</p>";
      const ctl = own ? '<div class="dk-fbar" style="margin-top:10px"><input class="pf-input" id="dk-tvu" placeholder="YouTube o URL https…" style="flex:1" /><button class="pf-btn pf-mini" id="dk-tvgo">Poner</button>' + ((vid || web) ? '<button class="pf-btn ghost pf-mini" id="dk-tvoff">Apagar</button>' : "") + '</div><p class="pf-msg" id="dk-tvm" style="margin:4px 0 0"></p>' : "";
      const w = openWin("tv" + it.id, "YATA TV", frame + ctl);
      w.classList.add("dk-tvwin");
      const go = w.querySelector("#dk-tvgo");
      if (go) go.onclick = async () => {
        const m2 = w.querySelector("#dk-tvm"); m2.textContent = "...";
        const { r: rr, d: dd } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, data: { url: w.querySelector("#dk-tvu").value.trim() } }) });
        if (rr.ok && dd && dd.data) { it.data = dd.data; refresh(); openTv(it); } else m2.textContent = (dd && dd.message) || "No se pudo.";
      };
      const off = w.querySelector("#dk-tvoff");
      if (off) off.onclick = async () => { const { r: rr, d: dd } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, data: { url: "" } }) }); if (rr.ok) { it.data = (dd && dd.data) || { video: "", t0: 0 }; refresh(); openTv(it); } };
    }
    function abrir(it) {
      if (it.sys) { const w = openWin("sys", "Mis fotos", fotoThumbs(D.fotos, false)); wireMv(w); return; }
      if (it.type === "widget") {
        const extra = own ? '<div class="dk-fbar"><button class="pf-btn ghost pf-mini" id="dk-wg">Guardar en la Caja</button></div>' : "";
        const w = openWin("w" + it.id, "Widget", '<div class="dk-tro"><b>' + esc(wLabel(it)) + ": " + esc(wVal(String(it.data.kind), String(it.data.game || "tetristo"))) + "</b></div>" + extra);
        const wg = w.querySelector("#dk-wg"); if (wg) wg.onclick = async () => { const { r: rr } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, hidden: true }) }); if (rr.ok) { it.hidden = true; refresh(); winKill("w" + it.id); } };
        return;
      }
      if (it.type === "tv") { openTv(it); return; }
      if (it.type === "folder" && it.data.locked && !own) {
        const w = openWin("f" + it.id, esc(it.data.name) + " 🔒", '<p class="pf-dimc" style="padding:4px 0 8px">Carpeta con candado. Si sabés el PIN, pasá.</p><div class="pf-row"><input class="pf-input" id="pin-i" inputmode="numeric" maxlength="4" placeholder="• • • •" style="text-align:center;letter-spacing:6px" /><button class="pf-btn pf-mini" id="pin-go">Abrir</button></div><p class="pf-msg" id="pin-m" style="margin:6px 0 0"></p>');
        w.querySelector("#pin-go").onclick = async () => {
          const m2 = w.querySelector("#pin-m"); m2.textContent = "...";
          const { r: rr, d: dd } = await api("/api/desktop/abrir", { method: "POST", headers: JH, body: JSON.stringify({ nick: nick, id: it.id, pin: w.querySelector("#pin-i").value.trim() }) });
          if (rr.ok && dd && dd.ok) {
            const dentro = (dd.items || []).map((i) => ({ url: String(i.data.url || ""), id: i.id }));
            winKill("f" + it.id);
            const w2 = openWin("f" + it.id, esc(it.data.name) + " 🔓", fotoThumbs(dentro, true)); wireMv(w2);
          } else m2.textContent = (dd && dd.message) || "No se pudo.";
        };
        return;
      }
      if (it.type === "folder") {
        const dentro = D.items.filter((i) => i.parent === it.id).map((i) => ({ url: String(i.data.url || ""), id: i.id }));
        const extra = own ? '<div class="dk-fbar"><button class="pf-btn ghost pf-mini" id="dk-fren">Renombrar</button><button class="pf-btn ghost pf-mini" id="dk-fdel">Tirar carpeta</button></div>' : "";
        const w = openWin("f" + it.id, esc(it.data.name), extra + fotoThumbs(dentro, true)); wireMv(w);
        const rn = w.querySelector("#dk-fren"); if (rn) rn.onclick = async () => { const name = window.prompt("Nuevo nombre:", it.data.name); if (!name) return; const { r: rr, d: dd } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, data: { name: name } }) }); if (rr.ok) { it.data.name = name.trim().slice(0, 24); refresh(); winKill("f" + it.id); } else toast((dd && dd.message) || "No se pudo."); };
        const dl = w.querySelector("#dk-fdel"); if (dl) dl.onclick = async () => { if (!window.confirm("¿Tirar la carpeta? Lo de adentro vuelve al escritorio.")) return; const { r: rr } = await api("/api/desktop/borrar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id }) }); if (rr.ok) { D.items.forEach((i) => { if (i.parent === it.id) i.parent = null; }); D.items = D.items.filter((i) => i.id !== it.id); refresh(); winKill("f" + it.id); } };
        return;
      }
      if (it.type === "note") {
        if (!own) { openWin("n" + it.id, "Nota", '<div class="dk-ntext">' + rich(it.data.text || "") + "</div>"); return; }
        const COLORES = ["#facc15", "#ec4899", "#38bdf8", "#22c55e"];
        const w = openWin("n" + it.id, "Nota", '<textarea class="dk-ta" maxlength="400">' + esc(it.data.text || "") + '</textarea><div class="dk-fbar" style="margin:8px 0 0">' + COLORES.map((c2) => '<button type="button" class="dk-cdot" data-nc="' + c2 + '" style="background:' + c2 + (String(it.data.c || "#facc15") === c2 ? ";outline:2px solid #fff" : "") + '"></button>').join("") + '<button class="pf-btn pf-mini" id="dk-ns" style="margin-left:auto">Guardar</button><button class="pf-btn ghost pf-mini" id="dk-nd">Tirar</button><span class="pf-msg" id="dk-nm" style="margin:0"></span></div>');
        let notaC = String(it.data.c || "");
        w.querySelectorAll("[data-nc]").forEach((b) => b.onclick = () => { notaC = b.getAttribute("data-nc"); w.querySelectorAll("[data-nc]").forEach((x) => x.style.outline = x === b ? "2px solid #fff" : ""); });
        w.querySelector("#dk-ns").onclick = async () => { const t = w.querySelector(".dk-ta").value; const data = { text: t }; if (it.data.icon) data.icon = it.data.icon; if (notaC) data.c = notaC; const { r: rr, d: dd } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, data: data }) }); w.querySelector("#dk-nm").textContent = rr.ok ? "Guardada." : ((dd && dd.message) || "No se pudo."); if (rr.ok) { it.data = (dd && dd.data) || data; refresh(); } };
        w.querySelector("#dk-nd").onclick = async () => { const { r: rr } = await api("/api/desktop/borrar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id }) }); if (rr.ok) { D.items = D.items.filter((i) => i.id !== it.id); refresh(); winKill("n" + it.id); } };
        return;
      }
      if (it.type === "trophy") {
        const extra = own ? '<div class="dk-fbar"><button class="pf-btn ghost pf-mini" id="dk-tg">Guardar en la Caja</button></div>' : "";
        const w = openWin("t" + it.id, "Trofeo", '<div class="dk-tro">' + dkSvg("trophy", "#e2b23c") + '<b>' + esc(it.data.label || it.data.kind) + "</b></div>" + extra);
        const tg = w.querySelector("#dk-tg"); if (tg) tg.onclick = async () => { const { r: rr } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, hidden: true }) }); if (rr.ok) { it.hidden = true; refresh(); winKill("t" + it.id); } };
        return;
      }
      if (it.type === "shortcut") { navShortcut(String(it.data.app)); return; }
      if (it.type === "photo") { lightbox(String(it.data.url || "")); return; }
      if (it.type === "widget" && String(it.data.kind) === "post" && POSTW) { if (own || me) viewPost(POSTW.id); else location.href = "/p/" + POSTW.id; return; }
    }
    function iconHTML(it) {
      if (it.sys) return '<span class="dk-g">' + dkSvg("folder", acc) + '</span><i class="dk-l">Mis fotos</i>';
      const cIco = it.data && it.data.icon ? '<span class="dk-g dk-gimg"><img src="' + esc(String(it.data.icon)) + '" alt="" /></span>' : "";
      if (it.type === "folder") return (cIco || '<span class="dk-g">' + dkSvg("folder") + "</span>") + '<i class="dk-l">' + esc(it.data.name) + "</i>";
      if (it.type === "note") return (cIco || '<span class="dk-g">' + dkSvg("note", String(it.data.c || "#facc15")) + "</span>") + '<i class="dk-l">' + esc(String(it.data.text || "nota").slice(0, 14)) + "</i>";
      if (it.type === "trophy") return '<span class="dk-g">' + dkSvg("trophy", String(it.data.kind) === "sello" ? "#ff5ba0" : "#e2b23c") + '</span><i class="dk-l">' + esc(it.data.label || "trofeo") + "</i>";
      if (it.type === "shortcut") { const a = DK_APPS[it.data.app] || { l: "?" }; return (cIco || '<span class="dk-g">' + dkSvg(String(it.data.app), acc) + "</span>") + '<i class="dk-l">' + esc(a.l) + "</i>"; }
      if (it.type === "photo") return '<span class="dk-g dk-gimg"><img src="' + esc(String(it.data.url || "")) + '" alt="" /></span><i class="dk-l">foto</i>';
      if (it.type === "widget") { const k = String(it.data.kind); return '<span class="dk-wv" data-wk="' + esc(k) + '" data-wid2="' + it.id + '"' + (it.data.game ? ' data-wgame="' + esc(String(it.data.game)) + '"' : "") + '>—</span><i class="dk-l">' + esc(wLabel(it)) + "</i>"; }
      if (it.type === "tv") { const prendida = !!(it.data.video || it.data.web); return '<span class="dk-g">' + dkSvg("tv", prendida ? "#e25b5b" : null) + '</span><i class="dk-l">' + (prendida ? "● EN VIVO" : "YATA TV") + "</i>"; }
      return "";
    }
    function place(el, x, y) { el.style.left = (x * CELL + 6) + "px"; el.style.top = (y * CELL + 6) + "px"; }
    function renderDecos() {
      S.querySelectorAll(".dk-deco, .dk-marq").forEach((e) => e.remove());
      rootItems().filter((i) => i.type === "deco").forEach((it) => {
        const el = document.createElement("img");
        el.className = "dk-deco"; el.src = String(it.data.url || ""); el.alt = "";
        el.style.left = (it.x / 10) + "%"; el.style.top = (it.y / 10) + "%";
        el.style.width = Number(it.data.w || 160) + "px";
        el.style.transform = "rotate(" + Number(it.data.r || 0) + "deg)";
        el.setAttribute("data-id", String(it.id));
        if (own) {
          el.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); const r2 = S.getBoundingClientRect(); ctxMenu(it, e.clientX - r2.left, e.clientY - r2.top); });
          el.addEventListener("pointerdown", (e) => {
            const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
            let mv2 = false;
            const mv = (ev) => { const dx = (ev.clientX - sx) / SCALE, dy = (ev.clientY - sy) / SCALE; if (!mv2 && Math.abs(dx) + Math.abs(dy) < 6) return; mv2 = true; dragging = true; el.style.left = Math.max(0, ox + dx) + "px"; el.style.top = Math.max(0, oy + dy) + "px"; };
            const up = async () => {
              document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up);
              setTimeout(() => { dragging = false; }, 0);
              if (!mv2) return;
              const nx = Math.max(0, Math.min(960, Math.round(el.offsetLeft / LW * 1000)));
              const ny = Math.max(0, Math.min(960, Math.round(el.offsetTop / LH * 1000)));
              const { r: rr } = await api("/api/desktop/mover", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, x: nx, y: ny }) });
              if (rr.ok) { it.x = nx; it.y = ny; }
              renderDecos();
            };
            document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
            e.preventDefault();
          });
        }
        C.appendChild(el);
      });
      rootItems().filter((i) => i.type === "marquee").forEach((it) => {
        const el = document.createElement("div");
        el.className = "dk-marq"; el.style.top = (it.y / 10) + "%";
        el.innerHTML = '<span>' + esc(String(it.data.text || "")) + "</span>";
        el.setAttribute("data-id", String(it.id));
        if (own) el.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); const r2 = S.getBoundingClientRect(); ctxMenu(it, e.clientX - r2.left, e.clientY - r2.top); });
        C.appendChild(el);
      });
      const vieja = S.querySelector(".dk-masco"); if (vieja) vieja.remove();
      if (D.mascota) {
        const mc = document.createElement("div");
        mc.className = "dk-masco";
        mc.innerHTML = avatar(D.mascota.head);
        mc.title = esc(nick) + " del Pueblo · vida " + D.mascota.vida + " · hambre " + D.mascota.hambre + " · sueño " + D.mascota.sueno;
        C.appendChild(mc);
      }
    }
    function refresh() {
      S.querySelectorAll(".dk-ico").forEach((e) => e.remove());
      const sys = { sys: true, x: 0, y: 0 };
      const list = [sys].concat(gridItems());
      list.forEach((it) => {
        const el = document.createElement("button");
        el.type = "button"; el.className = "dk-ico" + (it.sys ? " dk-sys" : "");
        el.setAttribute("data-id", it.sys ? "sys" : String(it.id));
        el.innerHTML = iconHTML(it);
        place(el, it.x, it.y);
        C.appendChild(el);
        let moved = false;
        if (own && !it.sys) {
          el.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); const r2 = S.getBoundingClientRect(); ctxMenu(it, e.clientX - r2.left, e.clientY - r2.top); });
          el.addEventListener("pointerdown", (e) => {
            if (e.button !== 0 && e.pointerType === "mouse") return;
            const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
            moved = false; dragging = false;
            const mv = (ev) => {
              const dx = (ev.clientX - sx) / SCALE, dy = (ev.clientY - sy) / SCALE;
              if (!moved && Math.abs(dx) + Math.abs(dy) < 7) return;
              moved = true; dragging = true; el.classList.add("drag"); el.style.zIndex = ++zTop;
              el.style.left = Math.max(0, Math.min(LW - 90, ox + dx)) + "px";
              el.style.top = Math.max(0, Math.min(LH - 90, oy + dy)) + "px";
            };
            const up = async () => {
              document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up);
              el.classList.remove("drag");
              setTimeout(() => { dragging = false; }, 0);
              if (!moved) return;
              let nx = Math.max(0, Math.min(colsN() - 1, Math.round((el.offsetLeft - 6) / CELL)));
              let ny = Math.max(0, Math.min(rowsN() - 1, Math.round((el.offsetTop - 6) / CELL)));
              const m = ocupado(); m["0_0"] = m["0_0"] || "sys";
              const sobre = m[nx + "_" + ny];
              const target = D.items.find((i) => i.id === sobre);
              if (target && target.type === "folder" && it.type !== "folder" && target.id !== it.id) {
                const { r: rr } = await api("/api/desktop/mover", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, x: 0, y: 0, parentId: target.id }) });
                if (rr.ok) { it.parent = target.id; toast("Guardado en " + esc(target.data.name)); }
                refresh(); return;
              }
              if (sobre && sobre !== it.id) { const fc = freeCell(); nx = fc.x; ny = fc.y; }
              const { r: rr2 } = await api("/api/desktop/mover", { method: "POST", headers: JH, body: JSON.stringify({ id: it.id, x: nx, y: ny }) });
              if (rr2.ok) { it.x = nx; it.y = ny; }
              refresh();
            };
            document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
            e.preventDefault();
          });
        }
        el.addEventListener("click", () => { if (!dragging && !moved) abrir(it); moved = false; });
      });
      setCajaN();
      const pn = body().querySelector("#dk-papen"); if (pn) pn.textContent = String(D.papelera.length || "");
      updateWidgets();
      renderDecos();
    }
    function winFirmas() {
      const lista = (D.firmas || []).map((f) => '<div class="dk-firma"><b>' + esc(f.nick) + "</b> " + esc(f.body) + '<span class="pf-nt">' + cuando(f.t) + "</span></div>").join("");
      const w = openWin("firmas", "Libro de firmas", '<div class="dk-chatlog" id="fir-l" style="height:180px">' + (lista || '<p class="pf-dimc">Nadie firmó todavía. Estrená el libro.</p>') + "</div>" + (me ? '<div class="pf-row" style="margin-top:8px"><input class="pf-input" id="fir-t" maxlength="120" placeholder="dejá tu firma…" autocomplete="off" /><button class="pf-btn pf-mini" id="fir-s">Firmar</button></div><p class="pf-msg" id="fir-m" style="margin:4px 0 0"></p>' : '<p class="pf-dimc" style="padding:8px 0 0">Entrá a YATA para firmar.</p>'));
      const tx = w.querySelector("#fir-t");
      if (tx) w.querySelector("#fir-s").onclick = async () => {
        const m2 = w.querySelector("#fir-m"); m2.textContent = "...";
        const { r: rr, d: dd } = await api("/api/desktop/firmar", { method: "POST", headers: JH, body: JSON.stringify({ nick: nick, body: tx.value }) });
        if (rr.ok && dd && dd.firma) { D.firmas.unshift(dd.firma); winKill("firmas"); winFirmas(); toast("Firmado. Quedó para la historia."); }
        else m2.textContent = (dd && dd.message) || "No se pudo.";
      };
    }
    function winMirones() {
      if (!MIRONES) return;
      const h = '<div class="pf-h" style="padding:0 0 6px">Mirando ahora</div>' +
        (MIRONES.nicks.length ? MIRONES.nicks.map((n) => '<div class="dk-fila"><span><span class="dk-on"></span> ' + esc(n) + "</span></div>").join("") : '<p class="pf-dimc">Nadie con nombre.</p>') +
        (MIRONES.fantasmas ? '<p class="pf-dimc" style="padding:4px 0">+ ' + MIRONES.fantasmas + (MIRONES.fantasmas === 1 ? " fantasma 👻" : " fantasmas 👻") + "</p>" : "") +
        (MIRONES.recientes && MIRONES.recientes.length ? '<div class="pf-h" style="padding:8px 0 6px">Pasaron por acá</div>' + MIRONES.recientes.map((v) => '<div class="dk-fila"><span>' + esc(v.nick) + '</span><span class="pf-nt">' + cuando(v.t) + "</span></div>").join("") : "") +
        (MIRONES.rey && MIRONES.rey.length ? '<div class="pf-h" style="padding:8px 0 6px">Los más clavados</div>' + MIRONES.rey.map((k2, i2) => '<div class="dk-fila"><span>' + (i2 === 0 ? "👑 " : "") + esc(k2.nick) + "</span><b>" + k2.min + " min</b></div>").join("") : "");
      openWin("mirones", "La puerta", h);
    }
    function winPapelera() {
      const h = D.papelera.length
        ? D.papelera.map((i) => '<div class="dk-fila"><span>' + esc(i.type === "note" ? String(i.data.text || "nota").slice(0, 18) : i.type === "folder" ? String(i.data.name || "carpeta") : i.type === "trophy" ? String(i.data.label || "trofeo") : i.type) + '</span><span style="display:flex;gap:6px"><button class="pf-btn pf-mini" data-res="' + i.id + '">Restaurar</button><button class="pf-btn ghost pf-mini" data-def="' + i.id + '">Borrar ya</button></span></div>').join("") + '<p class="pf-dimc" style="padding:6px 0 0">Lo de acá se borra solo a los 7 días.</p>'
        : '<p class="pf-dimc" style="padding:8px">Vacía. Sos de tirar poco.</p>';
      const w = openWin("pape", "Papelera", h);
      w.querySelectorAll("[data-res]").forEach((b) => b.onclick = async () => {
        const id2 = Number(b.getAttribute("data-res"));
        const { r: rr } = await api("/api/desktop/restaurar", { method: "POST", headers: JH, body: JSON.stringify({ id: id2 }) });
        if (rr.ok) { const it = D.papelera.find((i) => i.id === id2); if (it) { D.papelera = D.papelera.filter((i) => i.id !== id2); const fc = freeCell(); it.x = fc.x; it.y = fc.y; it.parent = null; D.items.push(it); await api("/api/desktop/mover", { method: "POST", headers: JH, body: JSON.stringify({ id: id2, x: fc.x, y: fc.y }) }); } refresh(); winKill("pape"); winPapelera(); }
      });
      w.querySelectorAll("[data-def]").forEach((b) => b.onclick = async () => {
        const id2 = Number(b.getAttribute("data-def"));
        const { r: rr } = await api("/api/desktop/borrar", { method: "POST", headers: JH, body: JSON.stringify({ id: id2, definitivo: true }) });
        if (rr.ok) { D.papelera = D.papelera.filter((i) => i.id !== id2); refresh(); winKill("pape"); winPapelera(); }
      });
    }
    function winPersonalizar() {
      const w = openWin("conf", "Personalizar", '<div class="dk-fbar" style="flex-direction:column;align-items:stretch;margin:0;gap:8px">' +
        '<button class="pf-btn ghost pf-mini" id="cf-wp">Subir fondo propio</button><input type="file" id="cf-wpf" accept="image/*" style="display:none" />' +
        '<button class="pf-btn ghost pf-mini" id="cf-wpx">Volver al banner</button>' +
        '<button class="pf-btn ghost pf-mini" id="cf-cur">Subir cursor (imagen chica)</button><input type="file" id="cf-curf" accept="image/*" style="display:none" />' +
        '<button class="pf-btn ghost pf-mini" id="cf-curx">Cursor normal</button>' +
        '<button class="pf-btn ghost pf-mini" id="cf-scan">Scanlines: <b>' + (CFG.scan === false ? "OFF" : "ON") + "</b></button>" +
        '<div class="pf-row" style="gap:6px">' + ["crt", "win95", "fosforo", "vapor"].map((s2) => '<button class="pf-btn ghost pf-mini" data-skin="' + s2 + '">' + s2 + "</button>").join("") + "</div>" +
        '</div><p class="pf-msg" id="cf-m" style="margin:6px 0 0"></p>');
      const m2 = w.querySelector("#cf-m");
      async function setCfg(patch) {
        const { r: rr, d: dd } = await api("/api/desktop/config", { method: "POST", headers: JH, body: JSON.stringify(patch) });
        if (rr.ok && dd) { CFG = dd.config || CFG; applyCfg(); winKill("conf"); winPersonalizar(); toast("Listo."); }
        else m2.textContent = (dd && dd.message) || "No se pudo.";
      }
      function subir(fileInputId, W2, H2, key) {
        const fi = w.querySelector(fileInputId);
        fi.onchange = () => {
          const f = fi.files && fi.files[0]; if (!f) return;
          m2.textContent = "Subiendo…";
          resizeToBlob(f, W2, H2, async (bl) => {
            if (!bl) { m2.textContent = "No se pudo leer."; return; }
            const url = await subirPerfilR2(bl);
            if (!url) { m2.textContent = "No se pudo subir."; return; }
            const patch = {}; patch[key] = url; setCfg(patch);
          });
        };
        fi.click();
      }
      w.querySelector("#cf-wp").onclick = () => subir("#cf-wpf", 1600, 900, "wallpaper");
      w.querySelector("#cf-wpx").onclick = () => setCfg({ wallpaper: "" });
      w.querySelector("#cf-cur").onclick = () => subir("#cf-curf", 32, 32, "cursor");
      w.querySelector("#cf-curx").onclick = () => setCfg({ cursor: "" });
      w.querySelector("#cf-scan").onclick = () => setCfg({ scan: CFG.scan === false });
      w.querySelectorAll("[data-skin]").forEach((b) => b.onclick = () => setCfg({ skin: b.getAttribute("data-skin") }));
    }
    function renderReact(rx) {
      const el = document.createElement("div");
      el.className = "dk-react";
      el.textContent = rx.e;
      el.title = rx.nick;
      el.style.left = (12 + Math.random() * 76) + "%";
      S.appendChild(el);
      setTimeout(() => el.remove(), 2600);
    }
    refresh();
    applyCfg();
    applyScale();
    if (D.reacts) D.reacts.forEach((rx) => { if (rx.id > lastReact) lastReact = rx.id; });
    const rbar = S.querySelector("#dk-rbar");
    if (rbar && me) {
      rbar.innerHTML = ["💀", "🔥", "👻", "❤️", "😂", "👍"].map((e2) => '<button type="button" data-re="' + e2 + '">' + e2 + "</button>").join("");
      rbar.querySelectorAll("[data-re]").forEach((b) => b.onclick = async () => {
        const e2 = b.getAttribute("data-re");
        renderReact({ e: e2, nick: me.nick, id: 0 });
        await api("/api/desktop/reaccion", { method: "POST", headers: JH, body: JSON.stringify({ nick: nick, e: e2 }) });
      });
    }
    const firB = S.querySelector("#dk-fir");
    if (firB) firB.onclick = () => winFirmas();
    const presEl = S.querySelector("#dk-pres");
    if (presEl && (own || (me && me.admin))) presEl.style.cursor = "pointer", presEl.onclick = () => winMirones();
    if (!window.__konamiWired) {
      window.__konamiWired = true;
      let kseq = [];
      const KONAMI = "ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a";
      document.addEventListener("keydown", (e) => {
        if (cur !== "desk") return;
        const S2 = document.getElementById("dk-s"); if (!S2) return;
        kseq.push(e.key); if (kseq.length > 10) kseq.shift();
        if (kseq.join(",") === KONAMI) {
          kseq = [];
          for (let i2 = 0; i2 < 24; i2++) setTimeout(() => { const sk = document.createElement("div"); sk.className = "dk-lluvia"; sk.textContent = "💀"; sk.style.left = Math.random() * 96 + "%"; sk.style.animationDuration = (1.2 + Math.random() * 1.6) + "s"; (S2.querySelector("#dk-c") || S2).appendChild(sk); setTimeout(() => sk.remove(), 3000); }, i2 * 90);
          toast("Modo insomnio total.");
        }
      });
    }
    setPres(MIR);
    vt.push(setInterval(updateWidgets, 1000));
    const fsB = S.querySelector("#dk-fs");
    if (fsB) fsB.onclick = () => {
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
      if (S.requestFullscreen) { S.requestFullscreen().catch(() => S.classList.toggle("dk-full")); }
      else S.classList.toggle("dk-full");
    };
    const dcB = S.querySelector("#dk-dchat");
    if (dcB) dcB.onclick = () => winDeskChat();
    function pillRefull() {
      if (S.querySelector("#dk-refull")) return;
      const b = document.createElement("button");
      b.id = "dk-refull"; b.className = "dk-refull"; b.type = "button"; b.textContent = "⛶ Volver a pantalla completa";
      b.onclick = () => { b.remove(); if (S.requestFullscreen) S.requestFullscreen().catch(() => {}); };
      S.appendChild(b);
      setTimeout(() => { if (b.parentNode) b.remove(); }, 20000);
    }
    window.__dkPillRefull = pillRefull;
    if (!window.__refullWired) {
      window.__refullWired = true;
      document.addEventListener("fullscreenchange", () => {
        if (document.fullscreenElement) { const p = document.getElementById("dk-refull"); if (p) p.remove(); return; }
        if (cur !== "desk") return;
        const S2 = document.getElementById("dk-s");
        if (S2 && S2.querySelector(".dk-appwin") && window.__dkPillRefull) setTimeout(window.__dkPillRefull, 250);
      });
    }
    async function pollDesk() {
      if (document.hidden || dragging) return;
      const res = await api("/api/desktop?nick=" + encodeURIComponent(nick) + "&poll=1", AH);
      if (!res.r.ok || !res.d || !res.d.ok) return;
      const nd = res.d;
      STATS = nd.stats || STATS; setPres(nd.mirando); D.trofeos = nd.trofeos || D.trofeos;
      MIRONES = nd.mirones || MIRONES; D.firmas = nd.firmas || D.firmas; D.mascota = nd.mascota || D.mascota; POSTW = nd.post || POSTW; D.papelera = nd.papelera || D.papelera;
      if (JSON.stringify(nd.config || {}) !== JSON.stringify(CFG)) { CFG = nd.config || {}; applyCfg(); }
      (nd.reacts || []).forEach((rx) => { if (rx.id > lastReact) { lastReact = rx.id; if (!me || rx.nick !== me.nick) renderReact(rx); } });
      if ((nd.fotos || []).length !== D.fotos.length) D.fotos = nd.fotos || [];
      const prev = new Map(D.items.map((i) => [i.id, i]));
      let structural = false;
      const moves = [];
      (nd.items || []).forEach((ni) => {
        const old = prev.get(ni.id);
        if (!old) { structural = true; return; }
        prev.delete(ni.id);
        if (old.hidden !== ni.hidden || old.parent !== ni.parent) structural = true;
        else if (old.x !== ni.x || old.y !== ni.y) moves.push(ni);
        if (JSON.stringify(old.data) !== JSON.stringify(ni.data)) {
          old.data = ni.data;
          if (old.type === "tv") { if (!own && S.querySelector('[data-win="tv' + ni.id + '"]')) openTv(old); const el = S.querySelector('.dk-ico[data-id="' + ni.id + '"]'); if (el) el.innerHTML = iconHTML(old); }
          else structural = true;
        }
      });
      if (prev.size) structural = true;
      if (structural) { D.items = nd.items || []; refresh(); return; }
      moves.forEach((ni) => { const it = D.items.find((i) => i.id === ni.id); if (it) { it.x = ni.x; it.y = ni.y; const el = S.querySelector('.dk-ico[data-id="' + ni.id + '"]'); if (el) place(el, ni.x, ni.y); } });
      updateWidgets();
    }
    vt.push(setInterval(pollDesk, own ? 6000 : 4000));
    window.__deskPoll = pollDesk;
    if (!window.__deskWired) {
      window.__deskWired = true;
      const wake = () => { if (!document.hidden && cur === "desk" && window.__deskPoll) window.__deskPoll(); };
      document.addEventListener("visibilitychange", wake);
      window.addEventListener("focus", wake);
    }
    if (own) {
      const crearCarpeta = async () => {
        const name = window.prompt("Nombre de la carpeta:"); if (!name) return;
        const fc = freeCell();
        const { r: rr, d: dd } = await api("/api/desktop/crear", { method: "POST", headers: JH, body: JSON.stringify({ type: "folder", data: { name: name }, x: fc.x, y: fc.y }) });
        if (rr.ok && dd && dd.item) { D.items.push(dd.item); refresh(); } else toast((dd && dd.message) || "No se pudo.");
      };
      const crearNota = async () => {
        const fc = freeCell();
        const { r: rr, d: dd } = await api("/api/desktop/crear", { method: "POST", headers: JH, body: JSON.stringify({ type: "note", data: { text: "Escribime…" }, x: fc.x, y: fc.y }) });
        if (rr.ok && dd && dd.item) { D.items.push(dd.item); refresh(); abrir(dd.item); } else toast((dd && dd.message) || "No se pudo.");
      };
      const winAccesos = () => {
        const w = openWin("nacc", "Accesos directos", '<div class="dk-apps">' + Object.keys(DK_APPS).map((k) => '<button class="dk-app" data-app="' + k + '" type="button"><span class="dk-g">' + dkSvg(k, acc) + "</span><i>" + esc(DK_APPS[k].l) + "</i></button>").join("") + "</div>");
        w.querySelectorAll("[data-app]").forEach((b) => b.onclick = async () => {
          const fc = freeCell();
          const { r: rr, d: dd } = await api("/api/desktop/crear", { method: "POST", headers: JH, body: JSON.stringify({ type: "shortcut", data: { app: b.getAttribute("data-app") }, x: fc.x, y: fc.y }) });
          if (rr.ok && dd && dd.item) { D.items.push(dd.item); refresh(); winKill("nacc"); } else toast((dd && dd.message) || "No se pudo.");
        });
      };
      const winWidgets = () => {
        const opts = [["reloj", "Reloj"], ["karma", "Karma"], ["racha", "Racha"], ["visitas", "Visitas"], ["top|tetristo", "Top TeTristo"], ["top|parpadeo", "Top No Parpadees"], ["top|laberinto", "Top Laberinto"], ["count", "Cuenta regresiva"], ["post", "Mi posteo fijado"]];
        const w = openWin("nwid", "Widgets", '<div class="dk-apps">' + opts.map((o) => { const ps = o[0].split("|"); return '<button class="dk-app" data-wid="' + o[0] + '" type="button"><span class="dk-wv2">' + esc(wVal(ps[0], ps[1] || "tetristo")) + "</span><i>" + o[1] + "</i></button>"; }).join("") + "</div>");
        w.querySelectorAll("[data-wid]").forEach((b) => b.onclick = async () => {
          const ps = b.getAttribute("data-wid").split("|");
          const fc = freeCell();
          const data = { kind: ps[0] }; if (ps[1]) data.game = ps[1];
          if (ps[0] === "count") {
            const label = window.prompt("¿Qué estamos esperando? (ej: Próximo video)"); if (!label) return;
            const hasta = window.prompt("¿Cuándo? (AAAA-MM-DD o AAAA-MM-DD HH:MM)"); if (!hasta) return;
            data.label = label; data.hasta = hasta.trim().replace(" ", "T");
          }
          const { r: rr, d: dd } = await api("/api/desktop/crear", { method: "POST", headers: JH, body: JSON.stringify({ type: "widget", data: data, x: fc.x, y: fc.y }) });
          if (rr.ok && dd && dd.item) { D.items.push(dd.item); refresh(); winKill("nwid"); } else toast((dd && dd.message) || "No se pudo.");
        });
      };
      const crearSticker = () => { const el = body().querySelector("#dk-stkf"); if (el) el.click(); };
      body().querySelector("#dk-stkf").onchange = () => {
        const fi = body().querySelector("#dk-stkf");
        const f = fi.files && fi.files[0]; if (!f) return;
        fi.value = "";
        toast("Subiendo sticker…");
        resizeToBlob(f, 480, 480, async (bl) => {
          if (!bl) { toast("No se pudo leer la imagen."); return; }
          const url = await subirPerfilR2(bl);
          if (!url) { toast("No se pudo subir."); return; }
          const { r: rr, d: dd } = await api("/api/desktop/crear", { method: "POST", headers: JH, body: JSON.stringify({ type: "deco", data: { url: url, w: 180, r: 0 }, x: 350, y: 300 }) });
          if (rr.ok && dd && dd.item) { D.items.push(dd.item); renderDecos(); toast("Sticker puesto. Arrastralo a gusto."); } else toast((dd && dd.message) || "No se pudo.");
        });
      };
      const crearMarquesina = async () => {
        const text = window.prompt("Texto de la marquesina (corre por el escritorio):"); if (!text) return;
        const { r: rr, d: dd } = await api("/api/desktop/crear", { method: "POST", headers: JH, body: JSON.stringify({ type: "marquee", data: { text: text }, x: 0, y: 80 }) });
        if (rr.ok && dd && dd.item) { D.items.push(dd.item); renderDecos(); } else toast((dd && dd.message) || "No se pudo.");
      };
      const crearTele = async () => {
        const ya = D.items.find((i) => i.type === "tv");
        if (ya) {
          if (ya.hidden) { const { r: rr } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: ya.id, hidden: false }) }); if (rr.ok) { ya.hidden = false; refresh(); } }
          openTv(ya); return;
        }
        const fc = freeCell();
        const { r: rr, d: dd } = await api("/api/desktop/crear", { method: "POST", headers: JH, body: JSON.stringify({ type: "tv", data: {}, x: fc.x, y: fc.y }) });
        if (rr.ok && dd && dd.item) { D.items.push(dd.item); refresh(); openTv(dd.item); } else toast((dd && dd.message) || "No se pudo.");
      };
      const winCaja = () => {
        const ocultos = cajaItems(), nuevos = trofeosSinPoner();
        let h = "";
        if (nuevos.length) h += '<div class="pf-h" style="padding:0 0 6px">Trofeos ganados</div>' + nuevos.map((t) => '<div class="dk-fila"><span>' + dkSvg("trophy", "#e2b23c") + " " + esc(t.label) + '</span><button class="pf-btn pf-mini" data-tk="' + esc(t.kind) + '">Al escritorio</button></div>').join("");
        if (ocultos.length) h += '<div class="pf-h" style="padding:8px 0 6px">Guardado</div>' + ocultos.map((i) => '<div class="dk-fila"><span>' + esc(i.type === "trophy" ? (i.data.label || "trofeo") : i.type === "note" ? String(i.data.text || "nota").slice(0, 20) : i.type === "widget" ? wLabel(i) : i.type === "tv" ? "YATA TV" : String(i.data.name || i.type)) + '</span><button class="pf-btn pf-mini" data-sk="' + i.id + '">Sacar</button></div>').join("");
        const w = openWin("caja", "La Caja", h || '<p class="pf-dimc" style="padding:8px">Vacía. Todo lo tuyo está a la vista.</p>');
        w.querySelectorAll("[data-tk]").forEach((b) => b.onclick = async () => {
          const fc = freeCell();
          const { r: rr, d: dd } = await api("/api/desktop/crear", { method: "POST", headers: JH, body: JSON.stringify({ type: "trophy", data: { kind: b.getAttribute("data-tk") }, x: fc.x, y: fc.y }) });
          if (rr.ok && dd && dd.item) { D.items.push(dd.item); refresh(); winKill("caja"); toast("Trofeo al escritorio. Chapeá tranquilo."); } else toast((dd && dd.message) || "No se pudo.");
        });
        w.querySelectorAll("[data-sk]").forEach((b) => b.onclick = async () => {
          const id = Number(b.getAttribute("data-sk")); const fc = freeCell();
          const { r: rr } = await api("/api/desktop/editar", { method: "POST", headers: JH, body: JSON.stringify({ id: id, hidden: false }) });
          if (rr.ok) { const it = D.items.find((i) => i.id === id); if (it) { it.hidden = false; it.x = fc.x; it.y = fc.y; await api("/api/desktop/mover", { method: "POST", headers: JH, body: JSON.stringify({ id: id, x: fc.x, y: fc.y }) }); } refresh(); winKill("caja"); }
        });
      };
      function menuCrear(px, py) {
        const fila = (id2, em, t, extra) => '<button class="dk-mit" id="' + id2 + '" type="button"><span>' + em + "</span>" + t + (extra ? "<b>" + extra + "</b>" : "") + "</button>";
        const w = openWin("crear", "Escritorio",
          '<div class="dk-menu">' +
          fila("mc-car", "📁", "Nueva carpeta") + fila("mc-nota", "📝", "Nueva nota") + fila("mc-acc", "▶", "Acceso directo") +
          fila("mc-wid", "📊", "Widget") + fila("mc-tv", "📺", "Tele") + fila("mc-stk", "🖼", "Sticker") + fila("mc-mar", "📜", "Marquesina") +
          '<div class="dk-msep"></div>' +
          fila("mc-conf", "🎨", "Personalizar") + fila("mc-pape", "🗑", "Papelera", D.papelera.length || "") + fila("mc-caja", "📦", "La Caja", (cajaItems().length + trofeosSinPoner().length) || "") +
          "</div>");
        if (px != null) { w.style.left = Math.max(0, Math.min(px, S.clientWidth - 220)) + "px"; w.style.top = Math.max(0, Math.min(py, S.clientHeight - 340)) + "px"; }
        const go = (id2, fn) => { const b = w.querySelector("#" + id2); if (b) b.onclick = () => { winKill("crear"); fn(); }; };
        go("mc-car", crearCarpeta); go("mc-nota", crearNota); go("mc-acc", winAccesos); go("mc-wid", winWidgets);
        go("mc-tv", crearTele); go("mc-stk", crearSticker); go("mc-mar", crearMarquesina);
        go("mc-conf", winPersonalizar); go("mc-pape", winPapelera); go("mc-caja", winCaja);
      }
      body().querySelector("#dk-crear").onclick = () => menuCrear();
      body().querySelector("#dk-caja").onclick = () => winCaja();
      S.addEventListener("contextmenu", (e) => {
        if (e.target !== S && e.target !== C) return;
        e.preventDefault();
        const r2 = S.getBoundingClientRect();
        menuCrear(e.clientX - r2.left, e.clientY - r2.top);
      });
    }
  }

  /* ---------- Admin ---------- */
  function viewAdmin() {
    chead("Admin");
    body().innerHTML =
      '<div class="pf-h">Último video (carrusel)</div>' +
      '<div class="pf-row"><input class="pf-input" id="ad-vid" placeholder="https://youtu.be/..." /><button class="pf-btn" id="ad-vidsave">Guardar</button></div>' +
      '<p class="pf-msg" id="ad-vidmsg" style="min-height:1em"></p>' +
      '<div class="pf-h">Pregunta del día</div>' +
      '<div class="pf-row"><input class="pf-input" id="ad-pdd" inputmode="numeric" placeholder="ID del posteo (el $número)" /><button class="pf-btn" id="ad-pddsave">Fijar</button><button class="pf-btn ghost" id="ad-pddoff">Sacar</button></div>' +
      '<p class="pf-msg" id="ad-pddmsg" style="min-height:1em"></p>' +
      '<div class="pf-h">Usuarios</div>' +
      '<div class="pf-row"><input class="pf-input" id="ad-q" maxlength="20" placeholder="buscar por nick…" /><button class="pf-btn" id="ad-go">Buscar</button></div>' +
      '<p class="pf-msg" id="ad-msg" style="min-height:1em"></p>' +
      '<div id="ad-list"><p class="pf-dimc">Cargando…</p></div>';
    const qEl = body().querySelector("#ad-q"), am = body().querySelector("#ad-msg");
    (async () => { try { const c = await (await fetch("/api/config", AH)).json(); if (c && c.video) body().querySelector("#ad-vid").value = c.video; } catch (_) {} })();
    body().querySelector("#ad-vidsave").onclick = async () => { const vm = body().querySelector("#ad-vidmsg"); vm.textContent = "..."; const { r, d } = await api("/api/admin/config", { method: "POST", headers: JH, body: JSON.stringify({ video: body().querySelector("#ad-vid").value.trim() }) }); vm.textContent = r.ok ? "Guardado." : ((d && d.message) || "No se pudo."); };
    (async () => { try { const { d } = await api("/api/admin/pdd", AH); if (d && d.ok && d.pdd) body().querySelector("#ad-pdd").value = d.pdd; } catch (_) {} })();
    body().querySelector("#ad-pddsave").onclick = async () => { const m2 = body().querySelector("#ad-pddmsg"); m2.textContent = "..."; const { r, d } = await api("/api/admin/pdd", { method: "POST", headers: JH, body: JSON.stringify({ id: Number(body().querySelector("#ad-pdd").value) || 0 }) }); m2.textContent = r.ok ? "Fijada arriba del feed." : ((d && d.message) || "No se pudo."); };
    body().querySelector("#ad-pddoff").onclick = async () => { const m2 = body().querySelector("#ad-pddmsg"); m2.textContent = "..."; const { r } = await api("/api/admin/pdd", { method: "POST", headers: JH, body: JSON.stringify({ id: null }) }); m2.textContent = r.ok ? "Sacada." : "No se pudo."; body().querySelector("#ad-pdd").value = ""; };
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
  function vhex(c) { return (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)) ? c : "#6b8cff"; }
  function badgeList(p) { let arr = Array.isArray(p.badges) ? p.badges : null; if (!arr) { arr = []; if (p.admin) arr.push({ t: "verificado", c: "#6b8cff" }); if (p.founder) arr.push({ t: "fundador", c: "#e2b23c" }); } return arr; }
  function badges(p) { return badgeList(p).slice(0, 6).map((b) => '<span class="pf-tag" style="background:' + vhex(b.c) + ';color:#06070d">' + esc(b.t) + "</span>").join(""); }
  async function viewUser(nick) {
    clearView(); cur = "user";
    setUrl("/demon/" + encodeURIComponent(nick));
    root.querySelectorAll("#pf-nav [data-v]").forEach((b) => b.classList.remove("on"));
    chead("Perfil");
    body().innerHTML = skPerfil();
    const { r, d } = await api("/api/social/perfil?nick=" + encodeURIComponent(nick), AH);
    if (!r.ok || !d || !d.ok) { body().innerHTML = '<p class="pf-empty">No se encontró ese perfil.</p>'; return; }
    const p = d.perfil, acc = (typeof p.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(p.accent)) ? p.accent : "var(--pf-acc)";
    const desde = p.desde ? new Date(p.desde).toLocaleDateString("es-AR", { month: "long", year: "numeric" }) : "";
    const banner = p.banner ? '<div class="pf-banner" style="background-image:url(\'' + esc(p.banner) + '\')"></div>' : '<div class="pf-banner" style="background:linear-gradient(120deg,' + acc + '33,#0a0a0d)"></div>';
    const links = (Array.isArray(p.links) ? p.links : []).map((l) => { const pl = platOf(l.url); return '<a class="pf-link" href="' + esc(l.url) + '" target="_blank" rel="noopener"><span class="pf-link-i" style="color:' + acc + '">' + linkSvg(pl[2]) + '</span><span class="pf-link-t">' + esc(l.title) + "</span></a>"; }).join("");
    let action = "";
    if (p.rel === "me") action = '<button class="pf-btn" id="pu-edit">Editar perfil</button>';
    else if (p.rel === "amigos") action = '<button class="pf-btn" id="pu-msg">Mensaje</button>';
    else if (p.rel === "pendiente") action = '<button class="pf-btn ghost" disabled>Pendiente</button>';
    else action = '<button class="pf-btn" id="pu-add">Agregar amigo</button>';
    const isAdm = me && me.admin && p.rel !== "me";
    const modTools = isAdm ? '<button class="pf-btn ghost pf-mini" id="pu-admin" title="Moderación">⋯</button>' : "";
    const chip = (label, val) => '<div class="pf-chip"><span>' + label + "</span><b>" + val + "</b></div>";
    const chips =
      chip("Karma", fmt.format(p.karma || 0)) + chip("Racha", (p.streak || 0) + ((p.streak || 0) === 1 ? " día" : " días")) +
      chip("Laberinto", fmt.format(p.best.laberinto || 0)) + chip("TeTristo", fmt.format(p.best.tetristo || 0)) +
      chip("No Parpadees", fmt.format(p.best.parpadeo || 0)) + (p.caido ? chip("El Botón", "N° " + fmt.format(p.caido)) : "") +
      chip("Posteos", fmt.format(p.nposts || 0)) + chip("Amigos", fmt.format(p.amigos || 0));
    body().innerHTML =
      banner +
      '<div class="pf-uhead"><span class="pf-ava pf-uava" style="border-color:' + acc + '">' + avaPic(p.avatar, headFor(p.nick)) + '</span>' +
      '<div class="pf-uact">' + action + '<button class="pf-btn ghost pf-mini" id="pu-desk">Escritorio</button><button class="pf-btn ghost pf-mini" id="pu-share">Compartir</button>' + modTools + '</div></div>' +
      '<div class="pf-uname">' + esc(p.nick) + " " + badges(p) + '</div>' +
      '<div class="pf-dimc" style="padding:2px 0">@' + esc(p.nick) + (desde ? " · desde " + desde : "") + '</div>' +
      (p.estado ? '<div class="pf-estado" style="border-color:' + acc + '66">' + esc(p.estado) + "</div>" : "") +
      (p.bio ? '<p class="pf-ubio">' + esc(p.bio) + "</p>" : "") +
      (p.location ? '<div class="pf-umeta">' + esc(p.location) + "</div>" : "") +
      (links ? '<div class="pf-links">' + links + "</div>" : "") +
      (isAdm ? '<div id="pu-badges"></div>' : "") +
      '<div class="pf-chips">' + chips + "</div>" +
      '<div class="pf-h">Posteos</div><div id="pu-posts"></div>';
    const box = body().querySelector("#pu-posts");
    const list = (p.pinned ? [Object.assign({ pin: true }, p.pinned)] : []).concat(p.posts || []);
    box.innerHTML = list.length ? list.map((x) => (x.pin ? '<div class="pf-pinlbl">📌 Fijado</div>' : "") + postHTML(x)).join("") : '<p class="pf-empty">Todavía no posteó nada.</p>';
    const edit = body().querySelector("#pu-edit"); if (edit) edit.onclick = () => setView("editar");
    const dsk = body().querySelector("#pu-desk"); if (dsk) dsk.onclick = () => viewDesktop(p.nick);
    const sh = body().querySelector("#pu-share"); if (sh) sh.onclick = async () => { const url = location.origin + "/demon/" + encodeURIComponent(p.nick); try { await navigator.clipboard.writeText(url); sh.textContent = "¡Copiado!"; } catch (_) { sh.textContent = url; } };
    const adm = body().querySelector("#pu-admin");
    if (adm) adm.onclick = (e) => {
      e.stopPropagation(); cerrarMenus();
      const m = document.createElement("div"); m.className = "pf-menu"; m.id = "pf-menu";
      m.innerHTML = '<button data-abadge type="button">🏷 Badges</button><button data-amute type="button">🔇 Mutear</button><button data-aban class="rojo" type="button">🚫 Banear</button>';
      document.body.appendChild(m);
      const rb = adm.getBoundingClientRect();
      m.style.left = Math.max(8, Math.min(rb.left, window.innerWidth - 190)) + "px";
      m.style.top = Math.min(rb.bottom + 6, window.innerHeight - m.offsetHeight - 10) + "px";
      m.querySelector("[data-abadge]").onclick = () => { cerrarMenus(); openBadgeEditor(p.nick, badgeList(p)); };
      m.querySelector("[data-amute]").onclick = async () => { cerrarMenus(); const res = await api("/api/admin/mute", { method: "POST", headers: JH, body: JSON.stringify({ nick: p.nick }) }); toast(res.r.ok ? "Muteado." : "No se pudo."); };
      m.querySelector("[data-aban]").onclick = async () => { cerrarMenus(); if (!window.confirm("¿Banear a " + p.nick + "?")) return; const res = await api("/api/admin/ban", { method: "POST", headers: JH, body: JSON.stringify({ nick: p.nick, reason: "" }) }); toast(res.r.ok ? "Baneado." : "No se pudo."); };
    };
    const msgb = body().querySelector("#pu-msg"); if (msgb) msgb.onclick = () => { window.__dmOpen = p.nick; setView("mensajes"); };
    const add = body().querySelector("#pu-add"); if (add) add.onclick = async () => { add.disabled = true; add.textContent = "..."; const res = await api("/api/social/amigos/pedir", { method: "POST", headers: JH, body: JSON.stringify({ nick: p.nick }) }); add.textContent = res.r.ok ? "Solicitud enviada" : ((res.d && res.d.message) || "No se pudo."); };
  }

  function openBadgeEditor(nick, current) {
    const box = body().querySelector("#pu-badges"); if (!box) return;
    let list = (Array.isArray(current) ? current : []).map((b) => ({ t: String(b.t || ""), c: vhex(b.c) })).filter((b) => b.t);
    const presets = [["verificado", "#6b8cff"], ["fundador", "#e2b23c"], ["staff", "#22c55e"], ["mvp", "#f97316"], ["beta", "#a78bfa"], ["vip", "#ec4899"]];
    function render() {
      box.innerHTML =
        '<div class="pf-h">Badges de ' + esc(nick) + "</div>" +
        '<div class="pf-bdedit">' + (list.length ? list.map((b, i) => '<span class="pf-tag" style="background:' + vhex(b.c) + ';color:#06070d">' + esc(b.t) + ' <a data-bx="' + i + '">&times;</a></span>').join("") : '<span class="pf-dimc">Sin badges.</span>') + "</div>" +
        '<div class="pf-bdpre">' + presets.map((pr) => '<button class="pf-btn ghost pf-mini" data-bp="' + pr[0] + "|" + pr[1] + '">+ ' + pr[0] + "</button>").join("") + "</div>" +
        '<div class="pf-row" style="margin-top:8px"><input class="pf-input" id="bd-t" maxlength="16" placeholder="badge custom" /><input type="color" id="bd-c" value="#6b8cff" style="width:44px;height:38px;border:0;background:none;padding:0;cursor:pointer" /><button class="pf-btn pf-mini" id="bd-add">Sumar</button></div>' +
        '<div class="pf-row" style="margin-top:10px"><button class="pf-btn" id="bd-save">Guardar badges</button><span class="pf-msg" id="bd-msg" style="margin:0"></span></div>';
      box.querySelectorAll("[data-bx]").forEach((a) => a.onclick = () => { list.splice(Number(a.getAttribute("data-bx")), 1); render(); });
      box.querySelectorAll("[data-bp]").forEach((b) => b.onclick = () => { const parts = b.getAttribute("data-bp").split("|"); if (list.length < 6 && !list.some((x) => x.t === parts[0])) list.push({ t: parts[0], c: parts[1] }); render(); });
      box.querySelector("#bd-add").onclick = () => { const t = box.querySelector("#bd-t").value.trim().slice(0, 16); const c = box.querySelector("#bd-c").value; if (t && list.length < 6) { list.push({ t, c }); render(); } };
      box.querySelector("#bd-save").onclick = async () => { const m = box.querySelector("#bd-msg"); m.textContent = "..."; const { r } = await api("/api/admin/badges", { method: "POST", headers: JH, body: JSON.stringify({ nick, badges: list }) }); if (r.ok) { m.textContent = "Guardado."; viewUser(nick); } else m.textContent = "No se pudo."; };
    }
    render();
  }

  /* ---------- Escritorios (directorio estilo Twitch) ---------- */
  async function viewEscritorios() {
    chead("Escritorios");
    body().innerHTML = skGrid(6);
    const { d } = await api("/api/escritorios", AH);
    if (!d || !d.ok) { body().innerHTML = '<p class="pf-empty">No se pudo cargar el barrio.</p>'; return; }
    const todos = d.escritorios || [];
    const tiene = (e, t) => Array.isArray(e.badges) && e.badges.some((b) => String(b.t || "").toLowerCase() === t);
    const fundador = todos.filter((e) => e.founder);
    const staff = todos.filter((e) => !e.founder && (e.admin || tiene(e, "staff")));
    const vips = todos.filter((e) => !e.founder && !e.admin && !tiene(e, "staff") && (tiene(e, "vip") || tiene(e, "mvp")));
    const resto = todos.filter((e) => !fundador.includes(e) && !staff.includes(e) && !vips.includes(e));
    const tarjeta = (e) => {
      const acc = (typeof e.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(e.accent)) ? e.accent : "#6b8cff";
      const fondo = e.banner ? 'background-image:url(\'' + esc(e.banner) + '\')' : "background:linear-gradient(135deg," + acc + "33,#0b0b0e)";
      return '<button class="pf-eskc" data-esk="' + esc(e.nick) + '" type="button" style="' + fondo + '">' +
        '<span class="pf-eskv">' + (e.adentro > 0 ? '<i class="pf-eskon"></i>' + e.adentro + " adentro" : fmt.format(e.visitas) + " visitas") + "</span>" +
        '<span class="pf-eskb"><span class="pf-ava pf-ava-sm">' + avaPic(e.avatar, headFor(e.nick)) + "</span><b>" + esc(e.nick) + "</b></span>" +
        "</button>";
    };
    const seccion = (titulo, lista) => lista.length ? '<div class="pf-h">' + titulo + '</div><div class="pf-eskgrid">' + lista.map(tarjeta).join("") + "</div>" : "";
    body().innerHTML =
      seccion("El Fundador", fundador) +
      seccion("Staff", staff) +
      seccion("VIPs", vips) +
      seccion("Demonios", resto) +
      (todos.length ? "" : '<p class="pf-empty">Ni un escritorio todavía. Armá el tuyo y estrenás el barrio.</p>');
    body().querySelectorAll("[data-esk]").forEach((b) => b.onclick = () => viewDesktop(b.getAttribute("data-esk")));
  }

  /* ---------- Amigos ---------- */
  function viewAmigos() {
    chead("Amigos");
    body().innerHTML = '<div class="pf-row"><input class="pf-input" id="a-q" maxlength="14" placeholder="buscar por nick…" /><button class="pf-btn" id="a-go">Buscar</button></div><div id="a-res"></div><div id="a-sol"></div><h3 class="pf-h">Tus amigos</h3><div id="a-list">' + skRows(4) + "</div>";
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
    chead("Mensajes", '<div class="pf-row" style="padding:0 18px 12px"><button class="pf-btn pf-mini" id="m-new">+ Nuevo grupo</button><button class="pf-btn ghost pf-mini" id="m-amigos">Amigos</button></div>');
    root.querySelector("#m-amigos").onclick = () => setView("amigos");
    body().innerHTML = '<div class="pf-dm"><div class="pf-dml" id="m-list">' + skRows(4) + '</div><div id="m-conv"><p class="pf-dimc">Elegí un amigo o grupo.</p></div></div>';
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
      '<div class="pf-h">Tu nick</div>' +
      (((d.nickDays || 0) > 0)
        ? '<p class="pf-dimc" style="padding:0">Lo cambiaste hace poco. Podés cambiarlo de nuevo en <b>' + (d.nickDays || 0) + '</b> días.</p>'
        : '<div class="pf-row"><input class="pf-input" id="c-nick" maxlength="14" placeholder="nuevo nick (2-14)" value="' + esc(d.nick) + '" /><button class="pf-btn" id="c-nicksave">Cambiar</button></div><p class="pf-dimc" style="padding:2px 0">Se puede una vez cada 14 días.</p>') +
      '<p class="pf-msg" id="c-nmsg"></p>' +
      '<div class="pf-h">Estado</div><input class="pf-input" id="c-estado" maxlength="80" placeholder="¿En qué andas?" value="' + esc(d.estado || "") + '" />' +
      '<div class="pf-h">Bio</div><textarea class="pf-input" id="c-bio" maxlength="200" placeholder="Contá quién sos (200)" style="border-radius:12px;min-height:64px;width:100%">' + esc(d.bio || "") + '</textarea>' +
      '<div class="pf-h">Ubicación</div><input class="pf-input" id="c-loc" maxlength="60" placeholder="Ciudad, país" value="' + esc(d.location || "") + '" />' +
      '<div class="pf-h">Color de acento</div><div class="pf-row"><input type="color" id="c-accent" value="' + acc + '" style="width:48px;height:38px;border:0;background:none;cursor:pointer;padding:0" /><span class="pf-dimc">Personalizá tu perfil</span></div>' +
      '<div class="pf-h">Tus links</div><div id="c-links"></div><button class="pf-btn ghost pf-mini" id="c-linkadd" style="margin-top:8px">+ Agregar link</button>' +
      '<div class="pf-row" style="margin-top:16px"><button class="pf-btn" id="c-save">Guardar perfil</button><span class="pf-msg" id="c-smsg"></span><button class="pf-btn ghost pf-mini" id="c-out" style="margin-left:auto">Cerrar sesión</button></div>' +
      '<div class="pf-h">Tus números</div>' +
      '<div class="pf-fila"><b>El Botón</b><span>' + (d.caido ? "Caído N° " + fmt.format(d.caido) : "No caíste") + '</span></div>' +
      '<div class="pf-fila"><b>Récord TeTristo</b><span>' + fmt.format((d.best && d.best.tetristo) || 0) + '</span></div>' +
      '<div class="pf-fila"><b>Récord No Parpadees</b><span>' + fmt.format((d.best && d.best.parpadeo) || 0) + '</span></div>';
    body().insertAdjacentHTML("afterbegin", '<a class="pf-back2" id="c-back">&#8592; Mi perfil</a>');
    body().querySelector("#c-back").onclick = () => setView("perfil");
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
      if (r.ok && dd) { me.bio = dd.bio; me.estado = dd.estado; me.location = dd.location; me.accent = dd.accent; me.links = dd.links; sm.textContent = "¡Guardado!"; setTimeout(() => setView("perfil"), 500); } else sm.textContent = (dd && dd.message) || "No se pudo.";
    };
    const nb = body().querySelector("#c-nicksave"); if (nb) nb.onclick = async () => { const nm = body().querySelector("#c-nmsg"), nv = body().querySelector("#c-nick"); nm.textContent = "..."; const { r, d: dd } = await api("/api/hub/nick", { method: "POST", headers: JH, body: JSON.stringify({ nick: nv.value }) }); if (r.ok && dd) { nm.textContent = "¡Listo! Ahora sos " + esc(dd.nick); setTimeout(boot, 800); } else nm.textContent = (dd && dd.message) || "No se pudo."; };
    body().querySelector("#c-out").onclick = async () => { await api("/api/hub/logout", { method: "POST", headers: JH, body: "{}" }); boot(); };
    const fileEl = body().querySelector("#c-file"), pmsg = body().querySelector("#c-pmsg");
    const setChip = () => { const chip = root.querySelector("#pf-me .pf-ava"); if (chip) chip.innerHTML = avaPic(me.avatar, me.char ? me.char.head : "o"); };
    body().querySelector("#c-photo").onclick = () => fileEl.click(); body().querySelector("#c-ava").onclick = () => fileEl.click();
    fileEl.onchange = () => {
      const f = fileEl.files && fileEl.files[0]; if (!f) return;
      pmsg.textContent = "Subiendo…";
      if (IMG_ON) {
        resizeToBlob(f, 512, 512, async (bl) => {
          if (!bl) { pmsg.textContent = "No se pudo leer la imagen."; return; }
          const url = await subirPerfilR2(bl);
          if (!url) { pmsg.textContent = "No se pudo subir. Probá de nuevo."; return; }
          const { r, d: dd } = await api("/api/hub/avatar", { method: "POST", headers: JH, body: JSON.stringify({ url: url }) });
          if (r.ok) { me.avatar = dd.avatar; setChip(); viewCuenta(); } else pmsg.textContent = (dd && dd.message) || "No se pudo.";
        });
        return;
      }
      resizeImg(f, async (dataUrl) => { if (!dataUrl) { pmsg.textContent = "No se pudo leer la imagen."; return; } const { r, d: dd } = await api("/api/hub/avatar", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl }) }); if (r.ok) { me.avatar = dd.avatar; setChip(); viewCuenta(); } else pmsg.textContent = r.status === 413 ? "La foto quedó muy pesada. Probá una más liviana." : ((dd && dd.message) || "No se pudo."); });
    };
    const pdel = body().querySelector("#c-photodel"); if (pdel) pdel.onclick = async () => { const { r } = await api("/api/hub/avatar", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl: null }) }); if (r.ok) { me.avatar = null; setChip(); viewCuenta(); } };
    const bnFile = body().querySelector("#c-bnfile");
    body().querySelector("#c-bn").onclick = () => bnFile.click();
    bnFile.onchange = () => {
      const f = bnFile.files && bnFile.files[0]; if (!f) return;
      const sm = body().querySelector("#c-smsg"); sm.textContent = "Subiendo portada…";
      if (IMG_ON) {
        resizeToBlob(f, 1280, 384, async (bl) => {
          if (!bl) { sm.textContent = "No se pudo leer la imagen."; return; }
          const url = await subirPerfilR2(bl);
          if (!url) { sm.textContent = "No se pudo subir. Probá de nuevo."; return; }
          const { r, d: dd } = await api("/api/hub/banner", { method: "POST", headers: JH, body: JSON.stringify({ url: url }) });
          if (r.ok) { me.banner = dd.banner; sm.textContent = "Portada lista."; viewCuenta(); } else sm.textContent = (dd && dd.message) || "No se pudo.";
        });
        return;
      }
      resizeBanner(f, async (dataUrl) => { if (!dataUrl) { sm.textContent = "No se pudo."; return; } const { r, d: dd } = await api("/api/hub/banner", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl }) }); if (r.ok) { me.banner = dd.banner; sm.textContent = "Portada lista."; viewCuenta(); } else sm.textContent = r.status === 413 ? "La imagen quedó muy pesada. Probá una más liviana." : ((dd && dd.message) || "No se pudo."); });
    };
    const bnDel = body().querySelector("#c-bndel"); if (bnDel) bnDel.onclick = async () => { const { r } = await api("/api/hub/banner", { method: "POST", headers: JH, body: JSON.stringify({ dataUrl: null }) }); if (r.ok) { me.banner = null; viewCuenta(); } };
  }

  /* ---------- Notificaciones ---------- */
  function notifIcon(t) { if (t === "like_post" || t === "like_comment") return skull(); if (t === "comment" || t === "reply") return ic("chat"); if (t === "friend_req" || t === "friend_acc") return ic("amigos"); return ic("notifs"); }
  const NVERB = { like_post: "te calaveó un posteo", like_comment: "te calaveó un comentario", comment: "comentó tu posteo", reply: "respondió tu comentario", mention: "te nombró", cite: "citó tu posteo", friend_req: "te mandó solicitud de amistad", friend_acc: "ahora es tu amigo", desk_visit: "pasó por tu escritorio", sello: "te dejó el Sello de Tristo 🏵" };
  function notifLine(n) {
    const verb = NVERB[n.type] || "novedad";
    const tgt = n.postId ? ' data-post="' + n.postId + '"' : ' data-u="' + esc(n.actor) + '"';
    const acciones = n.type === "friend_req" ? '<span class="pf-nact"><button class="pf-btn pf-mini" data-fok="' + esc(n.actor) + '">Aceptar</button><button class="pf-btn ghost pf-mini" data-fno="' + esc(n.actor) + '">No</button></span>' : "";
    return '<div class="pf-nrow' + (n.read ? "" : " unread") + '"' + tgt + '>' +
      '<span class="pf-nic">' + notifIcon(n.type) + "</span>" +
      '<div class="pf-ntext"><b class="pf-u" data-u="' + esc(n.actor) + '">' + esc(n.actor) + "</b> " + verb +
      (n.body ? ' <span class="pf-ndim">· ' + esc(String(n.body).slice(0, 60)) + "</span>" : "") +
      acciones +
      '<span class="pf-nt">' + cuando(n.t) + "</span></div></div>";
  }
  async function viewNotifs() {
    chead("Notificaciones");
    body().innerHTML = '<div id="pf-notifs">' + skRows(6) + "</div>";
    const { d } = await api("/api/notifs", AH);
    const box = body().querySelector("#pf-notifs"); if (!box) return;
    const items = (d && d.items) || [];
    box.innerHTML = items.length ? items.map(notifLine).join("") : '<p class="pf-empty">Nada por acá todavía. Cuando te calaveen, comenten o te nombren, aparece acá.</p>';
    const resolver = async (b, aceptar) => {
      b.disabled = true;
      const { r } = await api("/api/social/amigos/responder", { method: "POST", headers: JH, body: JSON.stringify({ nick: b.getAttribute(aceptar ? "data-fok" : "data-fno"), aceptar: aceptar }) });
      const act = b.closest(".pf-nact");
      if (act) act.outerHTML = '<b class="pf-nok">' + (r.ok ? (aceptar ? " ✓ ahora son amigos" : " · rechazada") : " · ya estaba resuelta") + "</b>";
    };
    box.querySelectorAll("[data-fok]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); resolver(b, true); });
    box.querySelectorAll("[data-fno]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); resolver(b, false); });
    if (items.some((n) => !n.read)) await api("/api/notifs/read", { method: "POST", headers: JH, body: "{}" });
    setNotifBadge(0);
  }
  function setNotifBadge(n) {
    const dot = root.querySelector("#pf-nb"); if (dot) { dot.classList.toggle("on", n > 0); dot.textContent = n > 9 ? "9+" : String(n); }
    const mb = root.querySelector("#pf-tbell-b"); if (mb) { mb.style.display = n > 0 ? "flex" : "none"; mb.textContent = n > 9 ? "9+" : String(n); }
  }
  async function pollNotifs() {
    try {
      const { d } = await api("/api/notifs/count", AH);
      if (!d || !d.ok) return;
      if (cur !== "notifs") setNotifBadge(d.unread || 0);
      const on = root.querySelector("#pf-online");
      if (on) {
        const n = d.online || 0;
        const quien = (d.despiertos || []).slice(0, 3).join(", ");
        on.innerHTML = "<i></i><span>" + n + (n === 1 ? " despierto" : " despiertos") + " ahora" + (quien ? " · " + esc(quien) + (n > 3 ? "…" : "") : "") + "</span>";
      }
    } catch (_) {}
  }

  /* ---------- Columna derecha (persistente): Chat Global + Mensajes ---------- */
  function rightRail() {
    const r = root.querySelector("#pf-right"); if (!r) return;
    r.innerHTML =
      '<div class="pf-widget"><div class="pf-wh">De qué se habla</div><div id="rg-trend"><p class="pf-dimc" style="padding:14px">Cargando…</p></div></div>' +
      '<div class="pf-widget"><div class="pf-wh">Tus mensajes</div><div id="rg-prev"><p class="pf-dimc">Cargando…</p></div></div>' +
      '<div class="pf-widget"><div class="pf-wh">Tops</div><div id="rg-tops"><p class="pf-dimc" style="padding:14px">Cargando…</p></div></div>';
    (async function trend() {
      const box = r.querySelector("#rg-trend"); if (!box) return;
      const { d } = await api("/api/social/trending", AH);
      const tags = (d && d.tags) || [];
      box.innerHTML = tags.length ? tags.map((t) => '<a class="pf-trow" data-tag="' + esc(t.tag) + '">#' + esc(t.tag) + "<b>" + t.n + "</b></a>").join("") : '<p class="pf-dimc" style="padding:14px">Tirá el primer #hashtag y arrancá la conversación.</p>';
    })();
    async function prev() { const { d } = await api("/api/social/amigos", AH); const box = r.querySelector("#rg-prev"); if (!box) return; const am = (d && d.amigos) || []; box.innerHTML = am.length ? am.slice(0, 6).map((n) => '<div class="pf-prev" data-n="' + esc(n) + '"><span class="pf-ava">' + avatar(headFor(n)) + '</span><div>' + uname(n) + '<span>tocá para escribir</span></div></div>').join("") : '<p class="pf-dimc" style="padding:14px">Agregá amigos para chatear.</p>'; box.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => { window.__dmOpen = b.getAttribute("data-n"); setView("mensajes"); }); }
    prev(); rt.push(setInterval(() => { if (!document.hidden) prev(); }, 20000));
    (function mountTops() {
      const box = r.querySelector("#rg-tops"); if (!box) return;
      const games = [{ k: "tetristo", t: "TeTristo", href: "/tristos" }, { k: "parpadeo", t: "No Parpadees", href: "/tristos" }, { k: "laberinto", t: "El Laberinto", href: "/laberinto" }, { k: "__users", t: "Top karma", href: "" }];
      const data = {};
      const fetches = games.filter((g) => g.k !== "__users").map((g) => fetch("/api/scores?game=" + g.k, AH).then((x) => x.json()).then((d) => { data[g.k] = (d && d.scores) || []; }).catch(() => { data[g.k] = []; }));
      fetches.push(fetch("/api/social/top-users", AH).then((x) => x.json()).then((d) => { data["__users"] = ((d && d.users) || []).map((u) => ({ alias: u.nick, score: u.karma, user: true })); }).catch(() => { data["__users"] = []; }));
      Promise.all(fetches).then(() => {
        let i = 0;
        const render = () => {
          const g = games[i], sc = (data[g.k] || []).slice(0, 5);
          box.innerHTML = '<div class="pf-tops-h"><b>' + g.t + "</b>" + (g.href ? '<a class="pf-wlink2" href="' + g.href + '">Jugar →</a>' : "") + "</div>" +
            (sc.length ? '<ol class="pf-toplist">' + sc.map((s, k) => '<li><span>' + (k + 1) + ". " + (s.user ? '<b class="pf-u" data-u="' + esc(s.alias) + '">' + esc(s.alias) + "</b>" : esc(s.alias)) + "</span><b>" + fmt.format(s.score) + "</b></li>").join("") + "</ol>" : '<p class="pf-dimc" style="padding:8px 0">Sin datos todavía.</p>') +
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
