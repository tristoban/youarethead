(() => {
  "use strict";
  const root = document.getElementById("th-page");
  if (!root) return;
  const JH = { "content-type": "application/json", accept: "application/json" };
  const fmt = new Intl.NumberFormat("es-AR");
  let viewEl, identEl, muralPoll = 0, fxInt = 0;
  let me = { logged: false, nick: null };

  function esc(s) { return String(s).replace(/[<>&"']/g, ""); }
  function guestNick() { try { return localStorage.getItem("yath-chat-name") || ""; } catch (_) { return ""; } }
  function myNick() { return me.logged && me.nick ? me.nick : guestNick(); }
  async function api(path, opts) { const r = await fetch(path, opts); let d = null; try { d = await r.json(); } catch (_) {} return { r, d }; }
  function stopMural() { if (muralPoll) { clearInterval(muralPoll); muralPoll = 0; } if (fxInt) { clearInterval(fxInt); fxInt = 0; } }

  root.innerHTML =
    '<div class="th-shell">' +
      '<div class="th-head"><span class="th-logo">Tristo&#39;s</span><span class="th-ident" id="th-ident"></span></div>' +
      '<div class="th-view" id="th-view"></div>' +
    '</div>';
  viewEl = root.querySelector("#th-view");
  identEl = root.querySelector("#th-ident");

  async function refreshMe() {
    try { const { d } = await api("/api/hub/me", { headers: { accept: "application/json" } }); if (d && d.ok) me = { logged: !!d.logged, nick: d.nick || null }; } catch (_) {}
    paintIdent();
  }
  function paintIdent() {
    if (!identEl) return;
    if (me.logged) identEl.innerHTML = 'Jugás como <b>' + esc(me.nick || "sin nick") + '</b> · <a href="#" id="th-out">salir</a>';
    else identEl.innerHTML = 'Invitado' + (guestNick() ? ' <b>' + esc(guestNick()) + '</b>' : '') + ' · <a href="#" id="th-in">entrar con mail</a>';
    const out = root.querySelector("#th-out");
    if (out) out.onclick = async (e) => { e.preventDefault(); await api("/api/hub/logout", { method: "POST", headers: JH, body: "{}" }); me = { logged: false, nick: null }; paintIdent(); };
    const inn = root.querySelector("#th-in");
    if (inn) inn.onclick = (e) => { e.preventDefault(); viewLogin(); };
  }

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
        if (g === "tetristo") { if (window.clickeame) window.clickeame(); }
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
        '<div class="th-fallen" id="th-fallen" aria-hidden="true"></div>' +
        '<a href="#" class="th-back" id="th-back">← volver</a>' +
        '<p class="th-nopress">NO LO APRIETES</p>' +
        '<button id="th-bigbtn" aria-label="El botón"></button>' +
        '<p class="th-big" id="th-btotal">…</p>' +
        '<p class="th-msg" id="th-bmsg"></p>' +
      '</div>';
    viewEl.querySelector("#th-back").onclick = (e) => { e.preventDefault(); viewMenu(); };
    const total = viewEl.querySelector("#th-btotal"), bmsg = viewEl.querySelector("#th-bmsg"), btn = viewEl.querySelector("#th-bigbtn");
    let names = [];
    function setFell() { if (btn) btn.classList.add("th-fell"); }
    async function load() {
      const { d } = await api("/api/boton", { headers: { accept: "application/json" } });
      if (d && d.ok) { total.textContent = fmt.format(d.total) + (d.total === 1 ? " caído" : " caídos"); names = (d.ultimos || []).filter(Boolean); if (d.vos) setFell(); }
    }
    load();
    fxInt = setInterval(() => {
      const lay = viewEl.querySelector("#th-fallen");
      if (!lay || !names.length || document.hidden) return;
      const s = document.createElement("span");
      s.textContent = names[(Math.random() * names.length) | 0];
      s.style.left = (4 + Math.random() * 80) + "%";
      s.style.top = (4 + Math.random() * 86) + "%";
      lay.appendChild(s);
      setTimeout(() => s.remove(), 4200);
    }, 600);
    btn.onclick = async () => {
      const { r, d } = await api("/api/boton", { method: "POST", headers: JH, body: "{}" });
      if (r.status === 401) { bmsg.textContent = "Solo los logueados pueden caer. Entrá con tu mail y volvé."; return; }
      if (d && d.ok) { setFell(); bmsg.textContent = d.ya ? ("Ya habías caído. Sos el N° " + fmt.format(d.numero) + ".") : ("Caíste. Sos el caído N° " + fmt.format(d.numero) + "."); load(); }
      else bmsg.textContent = (d && d.message) || "No se pudo.";
    };
  }

  /* ---------- No Parpadees ---------- */
  function floatWords(word) {
    let lay = document.getElementById("th-float");
    if (!lay) { lay = document.createElement("div"); lay.id = "th-float"; document.body.appendChild(lay); }
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("span");
      s.textContent = word;
      s.style.left = (4 + Math.random() * 86) + "vw";
      s.style.top = (6 + Math.random() * 82) + "vh";
      const dx = (Math.random() * 2 - 1) * 200, dy = (Math.random() * 2 - 1) * 130;
      lay.appendChild(s);
      window.requestAnimationFrame(() => { s.style.transform = "translate(" + dx + "px," + dy + "px)"; s.style.opacity = "0"; });
      setTimeout(() => s.remove(), 1500);
    }
  }
  const PW = [
    "OBEDECÉ", "CONSUMÍ", "COMPRÁ", "DORMÍ", "SOMETETE", "CONFORMATE", "SCROLLEÁ", "DESPERTÁ",
    "SALÍ", "MIRÁ", "CALLATE", "CORRÉ", "QUEDATE", "DUDÁ", "CREÉ", "PARPADEÁ",
    "ESCAPÁ", "RENDITE", "ENTREGÁ", "ACEPTÁ", "NEGÁ", "GRITÁ", "ESPERÁ", "VOLVÉ",
    "SEGUÍ", "FRENÁ", "PAGÁ", "VENDÉ", "COMPARTÍ", "SUSCRIBÍ", "TRABAJÁ", "PRODUCÍ",
    "REPETÍ", "OLVIDÁ", "RECORDÁ", "CONFIÁ", "DESCONFIÁ", "RESPIRÁ", "AGUANTÁ", "SOÑÁ",
    "GASTÁ", "HUÍ", "OBSERVÁ", "ESCONDETE",
  ];
  function sinTilde(w) { return w.replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/Ú/g, "U"); }
  function trasponer(w) { if (w.length < 3) return w; const i = 1 + ((Math.random() * (w.length - 2)) | 0); return w.slice(0, i) + w.charAt(i + 1) + w.charAt(i) + w.slice(i + 2); }
  function decoys(target) {
    const out = [];
    const flat = sinTilde(target);
    if (flat !== target) out.push(flat);
    for (let k = 0; k < 6 && out.length < 3; k++) { const m = trasponer(target); if (m !== target && out.indexOf(m) < 0) out.push(m); }
    for (let k = 0; k < 6 && out.length < 3; k++) { const m = trasponer(flat); if (m !== target && out.indexOf(m) < 0) out.push(m); }
    while (out.length < 3) { const w = PW[(Math.random() * PW.length) | 0]; if (w !== target && out.indexOf(w) < 0) out.push(w); }
    return out;
  }
  function viewParpadeo() {
    stopMural();
    viewEl.innerHTML =
      '<div class="th-parp">' +
        '<a href="#" class="th-back" id="th-back">← volver</a>' +
        '<h3>No Parpadees</h3>' +
        '<p class="th-p th-dim">Una palabra aparece un instante. Decinos exactamente cuál fue.</p>' +
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
    const ANS = 2500;
    viewEl.querySelector("#th-go").onclick = start;
    function start() { score = 0; round = 0; scoreEl.textContent = ""; next(); }
    function next() {
      round++;
      target = PW[(Math.random() * PW.length) | 0];
      const dur = Math.max(45, 300 - round * 22);
      stage.innerHTML = '<div class="th-flashw">' + target + "</div>";
      setTimeout(() => {
        stage.innerHTML = '<div class="th-flashw th-mask">██████████</div>';
        setTimeout(() => {
          const opts = [target].concat(decoys(target));
          opts.sort(() => Math.random() - 0.5);
          stage.innerHTML = '<div class="th-timer"><i style="animation: th-timebar ' + ANS + 'ms linear forwards"></i></div><p class="th-p">¿Qué viste?</p><div class="th-opts">' + opts.map((w) => '<button class="th-opt">' + w + "</button>").join("") + "</div>";
          const t0 = performance.now();
          clearTimeout(timer); timer = setTimeout(gameOver, ANS);
          stage.querySelectorAll(".th-opt").forEach((b) => {
            b.onclick = () => {
              clearTimeout(timer);
              if (b.textContent === target) { floatWords(target); score += 100 + Math.max(0, Math.round((ANS - (performance.now() - t0)) / 100)); scoreEl.textContent = fmt.format(score); next(); }
              else gameOver();
            };
          });
        }, 130);
      }, dur);
    }
    function gameOver() {
      const pre = esc(myNick()).slice(0, 12);
      stage.innerHTML = '<h3>PARPADEASTE</h3><p class="th-big">' + fmt.format(score) + "</p>" +
        '<div class="th-row"><input id="th-palias" maxlength="12" placeholder="tu alias" value="' + pre + '" /><button class="th-btn" id="th-psave">GUARDAR</button></div>' +
        '<button class="th-btn th-ghost" id="th-pagain">DE NUEVO</button><p class="th-msg" id="th-pmsg"></p>';
      stage.querySelector("#th-pagain").onclick = start;
      let saved = false;
      const sbtn = stage.querySelector("#th-psave");
      sbtn.onclick = async () => {
        if (saved) return;
        const alias = stage.querySelector("#th-palias").value.trim();
        const pm = stage.querySelector("#th-pmsg"); pm.textContent = "...";
        sbtn.disabled = true;
        const { r, d } = await api("/api/score", { method: "POST", headers: JH, body: JSON.stringify({ alias, score, game: "parpadeo" }) });
        if (r.ok && d) { saved = true; sbtn.textContent = "GUARDADO"; pm.textContent = "¡Puesto #" + d.rank + "!"; loadLB(); }
        else { sbtn.disabled = false; pm.textContent = (d && d.message) || "No se pudo."; }
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

  refreshMe();
  viewMenu();
})();
