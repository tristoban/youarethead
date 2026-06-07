(() => {
  "use strict";
  const JH = { "content-type": "application/json", accept: "application/json" };
  const fmt = new Intl.NumberFormat("es-AR");
  let built = false, overlay, viewEl, identEl, muralPoll = 0;
  let me = { logged: false, nick: null };

  function esc(s) { return String(s).replace(/[<>&"']/g, ""); }
  function guestNick() { try { return localStorage.getItem("yath-chat-name") || ""; } catch (_) { return ""; } }
  function myNick() { return me.logged && me.nick ? me.nick : guestNick(); }
  async function api(path, opts) { const r = await fetch(path, opts); let d = null; try { d = await r.json(); } catch (_) {} return { r, d }; }

  function build() {
    overlay = document.createElement("div"); overlay.id = "th-overlay";
    overlay.innerHTML =
      '<div class="th-shell">' +
        '<button class="th-close" aria-label="Cerrar">×</button>' +
        '<div class="th-head"><span class="th-logo">Tristo&#39;s</span><span class="th-ident" id="th-ident"></span></div>' +
        '<div class="th-view" id="th-view"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    viewEl = overlay.querySelector("#th-view");
    identEl = overlay.querySelector("#th-ident");
    overlay.querySelector(".th-close").onclick = close;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  async function refreshMe() {
    try { const { d } = await api("/api/hub/me", { headers: { accept: "application/json" } }); if (d && d.ok) me = { logged: !!d.logged, nick: d.nick || null }; } catch (_) {}
    paintIdent();
  }
  function paintIdent() {
    if (!identEl) return;
    if (me.logged) identEl.innerHTML = 'Jugás como <b>' + esc(me.nick || "sin nick") + '</b> · <a href="#" id="th-out">salir</a>';
    else identEl.innerHTML = 'Invitado' + (guestNick() ? ' <b>' + esc(guestNick()) + '</b>' : '') + ' · <a href="#" id="th-in">entrar con mail</a>';
    const out = overlay.querySelector("#th-out");
    if (out) out.onclick = async (e) => { e.preventDefault(); await api("/api/hub/logout", { method: "POST", headers: JH }); me = { logged: false, nick: null }; paintIdent(); };
    const inn = overlay.querySelector("#th-in");
    if (inn) inn.onclick = (e) => { e.preventDefault(); viewLogin(); };
  }

  function stopMural() { if (muralPoll) { clearInterval(muralPoll); muralPoll = 0; } }

  /* ---------- Menú ---------- */
  function card(g, t, s) { return '<button class="th-card" data-g="' + g + '"><b>' + t + '</b><span>' + s + '</span></button>'; }
  function viewMenu() {
    stopMural();
    viewEl.innerHTML = '<div class="th-grid">' +
      card("tetristo", "TeTristo", "El tetris de la casa. Top 10 global.") +
      card("boton", "El Botón", "NO LO APRIETES.") +
      card("parpadeo", "No Parpadees", "¿Qué viste? Cada vez más rápido.") +
      card("mural", "El Mural", "Un lienzo entre todos. 1 px cada 5s.") +
      '</div>';
    viewEl.querySelectorAll(".th-card").forEach((c) => {
      c.onclick = () => {
        const g = c.getAttribute("data-g");
        if (g === "tetristo") { close(); if (window.clickeame) window.clickeame(); }
        else if (g === "boton") viewBoton();
        else if (g === "parpadeo") viewParpadeo();
        else if (g === "mural") viewMural();
      };
    });
  }

  /* ---------- Login (email + OTP + nick) ---------- */
  function viewLogin() {
    stopMural();
    viewEl.innerHTML =
      '<div class="th-login">' +
        '<a href="#" class="th-back" id="th-back">← volver</a>' +
        '<h3>Entrar a Tristo&#39;s</h3>' +
        '<p class="th-p th-dim">Sin contraseña: te mandamos un código al mail.</p>' +
        '<div class="th-row" id="th-l1"><input id="th-email" type="email" placeholder="tu@mail.com" /><button class="th-btn" id="th-send">Mandar código</button></div>' +
        '<div class="th-row th-hide" id="th-l2"><input id="th-code" inputmode="numeric" maxlength="6" placeholder="código de 6 dígitos" /><button class="th-btn" id="th-ver">Entrar</button></div>' +
        '<div class="th-row th-hide" id="th-l3"><input id="th-nick" maxlength="14" placeholder="elegí tu nick" /><button class="th-btn" id="th-nickb">Guardar nick</button></div>' +
        '<p class="th-msg" id="th-lmsg"></p>' +
      '</div>';
    const msg = viewEl.querySelector("#th-lmsg");
    const show = (id) => { ["th-l1", "th-l2", "th-l3"].forEach((k) => { const n = viewEl.querySelector("#" + k); if (n) n.classList.toggle("th-hide", k !== id); }); };
    viewEl.querySelector("#th-back").onclick = (e) => { e.preventDefault(); viewMenu(); };
    let email = "";
    viewEl.querySelector("#th-send").onclick = async () => {
      email = viewEl.querySelector("#th-email").value.trim();
      msg.textContent = "...";
      const { r, d } = await api("/api/hub/login", { method: "POST", headers: JH, body: JSON.stringify({ email }) });
      msg.textContent = (d && d.message) || (r.ok ? "Código enviado." : "No se pudo.");
      if (r.ok) show("th-l2");
    };
    viewEl.querySelector("#th-ver").onclick = async () => {
      const code = viewEl.querySelector("#th-code").value.trim();
      msg.textContent = "...";
      const { r, d } = await api("/api/hub/verify", { method: "POST", headers: JH, body: JSON.stringify({ email, code }) });
      if (r.ok && d && d.logged) {
        me = { logged: true, nick: d.nick || null }; paintIdent();
        if (!d.nick) { msg.textContent = "¡Adentro! Elegí tu nick."; show("th-l3"); }
        else viewMenu();
      } else msg.textContent = (d && d.message) || "No se pudo.";
    };
    viewEl.querySelector("#th-nickb").onclick = async () => {
      const nick = viewEl.querySelector("#th-nick").value.trim();
      msg.textContent = "...";
      const { r, d } = await api("/api/hub/nick", { method: "POST", headers: JH, body: JSON.stringify({ nick }) });
      if (r.ok && d && d.ok) { me.nick = d.nick; paintIdent(); viewMenu(); }
      else msg.textContent = (d && d.message) || "No se pudo.";
    };
  }

  /* ---------- El Botón ---------- */
  function viewBoton() {
    stopMural();
    viewEl.innerHTML =
      '<div class="th-boton">' +
        '<a href="#" class="th-back" id="th-back">← volver</a>' +
        '<p class="th-nopress">NO LO APRIETES</p>' +
        '<button id="th-bigbtn" aria-label="El botón"></button>' +
        '<p class="th-big" id="th-btotal">…</p>' +
        '<p class="th-msg" id="th-bmsg"></p>' +
        '<p class="th-p th-dim" id="th-bult"></p>' +
      '</div>';
    viewEl.querySelector("#th-back").onclick = (e) => { e.preventDefault(); viewMenu(); };
    const total = viewEl.querySelector("#th-btotal"), bmsg = viewEl.querySelector("#th-bmsg"), ult = viewEl.querySelector("#th-bult");
    async function load() {
      const { d } = await api("/api/boton", { headers: { accept: "application/json" } });
      if (d && d.ok) { total.textContent = fmt.format(d.total) + (d.total === 1 ? " caído" : " caídos"); if (d.ultimos && d.ultimos.length) ult.textContent = "Últimos: " + d.ultimos.filter(Boolean).map(esc).join(", "); }
    }
    load();
    viewEl.querySelector("#th-bigbtn").onclick = async () => {
      const { r, d } = await api("/api/boton", { method: "POST", headers: JH });
      if (r.status === 401) { bmsg.textContent = "Solo los logueados pueden caer. Entrá con tu mail y volvé."; return; }
      if (d && d.ok) { bmsg.textContent = d.ya ? ("Ya habías caído. Sos el N° " + fmt.format(d.numero) + ".") : ("Caíste. Sos el caído N° " + fmt.format(d.numero) + "."); load(); }
      else bmsg.textContent = (d && d.message) || "No se pudo.";
    };
  }

  /* ---------- No Parpadees ---------- */
  const PW = ["OBEDECÉ", "CONSUMÍ", "COMPRÁ", "DORMÍ", "SOMETETE", "CONFORMATE", "SCROLLEÁ", "DESPERTÁ", "SALÍ", "MIRÁ", "CALLATE", "CORRÉ", "QUEDATE", "DUDÁ", "CREÉ", "PARPADEÁ"];
  function viewParpadeo() {
    stopMural();
    viewEl.innerHTML =
      '<div class="th-parp">' +
        '<a href="#" class="th-back" id="th-back">← volver</a>' +
        '<h3>No Parpadees</h3>' +
        '<p class="th-p th-dim">Una palabra va a aparecer un instante. Decinos cuál fue.</p>' +
        '<div class="th-stage" id="th-stage"><button class="th-btn" id="th-go">JUGAR</button></div>' +
        '<p class="th-big" id="th-pscore"></p>' +
        '<div class="th-lb" id="th-plb"></div>' +
      '</div>';
    viewEl.querySelector("#th-back").onclick = (e) => { e.preventDefault(); viewMenu(); };
    const stage = viewEl.querySelector("#th-stage"), scoreEl = viewEl.querySelector("#th-pscore");
    async function loadLB() {
      const { d } = await api("/api/scores?game=parpadeo", { headers: { accept: "application/json" } });
      const box = viewEl.querySelector("#th-plb"); if (!box) return;
      const list = (d && d.scores) || [];
      box.innerHTML = "<h4>Top 10</h4>" + (list.length
        ? "<ol>" + list.map((s) => "<li><span>" + esc(s.alias == null ? "ANON" : s.alias) + "</span><b>" + fmt.format(s.score) + "</b></li>").join("") + "</ol>"
        : '<p class="th-dim">Nadie todavía. Sé el primero.</p>');
    }
    loadLB();
    let score = 0, round = 0, target = "", timer = 0;
    viewEl.querySelector("#th-go").onclick = start;
    function start() { score = 0; round = 0; scoreEl.textContent = ""; next(); }
    function next() {
      round++;
      target = PW[(Math.random() * PW.length) | 0];
      const dur = Math.max(70, 380 - round * 18);
      stage.innerHTML = '<div class="th-flashw">' + target + "</div>";
      setTimeout(() => {
        const opts = [target];
        while (opts.length < 4) { const w = PW[(Math.random() * PW.length) | 0]; if (opts.indexOf(w) < 0) opts.push(w); }
        opts.sort(() => Math.random() - 0.5);
        stage.innerHTML = '<p class="th-p">¿Qué viste?</p><div class="th-opts">' + opts.map((w) => '<button class="th-opt">' + w + "</button>").join("") + "</div>";
        const t0 = performance.now();
        clearTimeout(timer); timer = setTimeout(gameOver, 4000);
        stage.querySelectorAll(".th-opt").forEach((b) => {
          b.onclick = () => {
            clearTimeout(timer);
            if (b.textContent === target) { score += 100 + Math.max(0, Math.round((4000 - (performance.now() - t0)) / 100)); scoreEl.textContent = fmt.format(score); next(); }
            else gameOver();
          };
        });
      }, dur);
    }
    function gameOver() {
      const pre = esc(myNick()).slice(0, 12);
      stage.innerHTML = '<h3>PARPADEASTE</h3><p class="th-big">' + fmt.format(score) + "</p>" +
        '<div class="th-row"><input id="th-palias" maxlength="12" placeholder="tu alias" value="' + pre + '" /><button class="th-btn" id="th-psave">GUARDAR</button></div>' +
        '<button class="th-btn th-ghost" id="th-pagain">DE NUEVO</button><p class="th-msg" id="th-pmsg"></p>';
      stage.querySelector("#th-pagain").onclick = start;
      stage.querySelector("#th-psave").onclick = async () => {
        const alias = stage.querySelector("#th-palias").value.trim();
        const pm = stage.querySelector("#th-pmsg"); pm.textContent = "...";
        const { r, d } = await api("/api/score", { method: "POST", headers: JH, body: JSON.stringify({ alias, score, game: "parpadeo" }) });
        pm.textContent = (r.ok && d) ? ("¡Puesto #" + d.rank + "!") : ((d && d.message) || "No se pudo.");
        if (r.ok) loadLB();
      };
    }
  }

  /* ---------- El Mural ---------- */
  function viewMural() {
    stopMural();
    viewEl.innerHTML =
      '<div class="th-mural">' +
        '<a href="#" class="th-back" id="th-back">← volver</a>' +
        '<h3>El Mural</h3>' +
        '<p class="th-p th-dim">Un lienzo entre todos. 1 pixel cada 5 segundos. Lo que quede, queda.</p>' +
        '<canvas id="th-mcv" width="600" height="336"></canvas>' +
        '<div class="th-pal" id="th-pal"></div>' +
        '<p class="th-msg" id="th-mmsg"></p>' +
      '</div>';
    viewEl.querySelector("#th-back").onclick = (e) => { e.preventDefault(); viewMenu(); };
    const cv = viewEl.querySelector("#th-mcv"), mx = cv.getContext("2d"), mmsg = viewEl.querySelector("#th-mmsg");
    const GR = ["#000000", "#242424", "#484848", "#6d6d6d", "#919191", "#b6b6b6", "#dadada", "#ffffff"];
    let W = 100, H = 56, sel = 7, grid = null;
    const palEl = viewEl.querySelector("#th-pal");
    palEl.innerHTML = GR.map((c, i) => '<button class="th-sw' + (i === sel ? " on" : "") + '" data-i="' + i + '" style="background:' + c + '" aria-label="Tono ' + i + '"></button>').join("");
    palEl.querySelectorAll(".th-sw").forEach((b) => {
      b.onclick = () => { sel = Number(b.getAttribute("data-i")); palEl.querySelectorAll(".th-sw").forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
    });
    function drawAll() {
      if (!grid) return;
      const cw = cv.width / W, ch = cv.height / H;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { mx.fillStyle = GR[grid[y * W + x]] || "#000"; mx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5); }
    }
    async function load() {
      try {
        const { d } = await api("/api/mural", { headers: { accept: "application/json" } });
        if (d && d.ok && typeof d.d === "string") {
          W = d.w; H = d.h;
          grid = new Uint8Array(W * H);
          for (let i = 0; i < grid.length && i < d.d.length; i++) grid[i] = parseInt(d.d[i], 16) || 0;
          drawAll();
        }
      } catch (_) {}
    }
    load();
    muralPoll = setInterval(() => { if (!document.hidden) load(); }, 4000);
    cv.addEventListener("click", async (e) => {
      const r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      if (grid) { grid[y * W + x] = sel; drawAll(); }
      const { r: rr, d } = await api("/api/mural", { method: "POST", headers: JH, body: JSON.stringify({ x, y, v: sel }) });
      if (rr.status === 429) mmsg.textContent = "Esperá " + ((d && d.wait) || 5) + "s para pintar otro.";
      else if (rr.ok) mmsg.textContent = "";
      else { mmsg.textContent = (d && d.message) || "No se pudo."; load(); }
    });
  }

  /* ---------- Abrir / cerrar ---------- */
  function open() {
    if (!built) { build(); built = true; }
    overlay.classList.add("th-open");
    document.documentElement.style.overflow = "hidden";
    refreshMe(); viewMenu();
  }
  function close() {
    stopMural();
    if (overlay) overlay.classList.remove("th-open");
    document.documentElement.style.overflow = "";
  }
  window.tristos = open;
  const nav = document.getElementById("navHub");
  if (nav) nav.addEventListener("click", (e) => { e.preventDefault(); open(); });
})();
