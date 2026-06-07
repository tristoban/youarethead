(() => {
  "use strict";
  const root = document.getElementById("pb-root");
  if (!root) return;
  const JH = { "content-type": "application/json", accept: "application/json" };
  const B = String.fromCharCode(92);
  async function api(path, opts) { const r = await fetch(path, opts); let d = null; try { d = await r.json(); } catch (_) {} return { r, d }; }
  function esc(s) { return String(s).replace(/[<>&"']/g, ""); }

  let me = null, heads = ["o", "O", "ö", "ø", "@", "°"];

  async function boot() {
    const { d } = await api("/api/pueblo/me", { headers: { accept: "application/json" } });
    if (!d || !d.ok) { root.innerHTML = '<p class="pb-dim">El pueblo no responde. Probá de nuevo en un rato.</p>'; return; }
    if (!d.logged) {
      root.innerHTML = '<h2>El Pueblo</h2><p class="pb-p">Esto es solo para los que están adentro. Entrá con tu mail en <a class="pb-link" href="/tristos">Tristo&#39;s</a> y volvé.</p>';
      return;
    }
    if (!d.char) { if (d.heads) heads = d.heads; creation(); return; }
    me = d.char; game();
  }

  function creation() {
    root.innerHTML =
      '<h2>Creá tu personaje</h2>' +
      '<p class="pb-p">Elegí tu cabeza. El resto ya lo perdiste al entrar.</p>' +
      '<div class="pb-heads" id="pb-heads"></div>' +
      '<button class="pb-btn" id="pb-crear">Entrar al pueblo</button>' +
      '<p class="pb-msg" id="pb-cmsg"></p>';
    let sel = 0;
    const box = root.querySelector("#pb-heads");
    box.innerHTML = heads.map((h, i) => '<button class="pb-head' + (i === 0 ? " on" : "") + '" data-i="' + i + '">' + h + "</button>").join("");
    box.querySelectorAll(".pb-head").forEach((b) => {
      b.onclick = () => { sel = Number(b.getAttribute("data-i")); box.querySelectorAll(".pb-head").forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
    });
    root.querySelector("#pb-crear").onclick = async () => {
      const msg = root.querySelector("#pb-cmsg"); msg.textContent = "...";
      const { r, d } = await api("/api/pueblo/crear", { method: "POST", headers: JH, body: JSON.stringify({ head: heads[sel] }) });
      if (r.ok && d && d.char) { me = d.char; me.x = 0.5; me.y = 0.6; game(); }
      else msg.textContent = (d && d.message) || "No se pudo crear.";
    };
  }

  function game() {
    root.innerHTML =
      '<div class="pb-hud">' +
        '<span class="pb-who">' + esc(me.nick) + " " + esc(me.head) + '</span>' +
        '<div class="pb-stat"><label>Vida</label><div class="pb-bar" id="pb-vida"><i></i></div></div>' +
        '<div class="pb-stat"><label>Hambre</label><div class="pb-bar" id="pb-hambre"><i></i></div></div>' +
        '<div class="pb-stat"><label>Sueño</label><div class="pb-bar" id="pb-sueno"><i></i></div></div>' +
        '<span class="pb-n" id="pb-n"></span>' +
      '</div>' +
      '<canvas id="pb-cv" width="760" height="400"></canvas>' +
      '<div class="pb-actions" id="pb-acts"></div>' +
      '<div class="pb-says" id="pb-says"></div>' +
      '<p class="pb-msg" id="pb-msg"></p>';
    const cv = root.querySelector("#pb-cv"), ctx = cv.getContext("2d");
    const msgEl = root.querySelector("#pb-msg"), actsEl = root.querySelector("#pb-acts"), nEl = root.querySelector("#pb-n");
    const W = cv.width, H = cv.height;
    const Y0 = H * 0.42, Y1 = H * 0.9;
    const pos = { x: typeof me.x === "number" ? me.x : 0.5, y: typeof me.y === "number" ? me.y : 0.6 };
    const tgt = { x: pos.x, y: pos.y };
    let stats = { vida: me.vida, hambre: me.hambre, sueno: me.sueno };
    let others = [], sayQ = null, leg = false, legT = 0, last = performance.now();
    let says = ["hola", "jaja", "¿y el video?", "seguime", "quiero salir de acá", "tengo hambre", "tengo sueño", "¿alguien tiene café?", "no puedo dormir", "estamos atrapados"];
    let mySay = "", mySayUntil = 0, npcSay = "", npcSayUntil = 0, zzz = 0;

    function bars() {
      const set = (id, v) => { const el = root.querySelector("#" + id); if (el) { el.classList.toggle("low", v <= 25); el.firstElementChild.style.width = Math.max(0, Math.min(100, v)) + "%"; } };
      set("pb-vida", stats.vida); set("pb-hambre", stats.hambre); set("pb-sueno", stats.sueno);
    }
    bars();

    function paintSays() {
      const box = root.querySelector("#pb-says");
      box.innerHTML = says.map((s, i) => '<button class="pb-say" data-i="' + i + '">' + esc(s) + "</button>").join("");
      box.querySelectorAll(".pb-say").forEach((b) => {
        b.onclick = () => { const i = Number(b.getAttribute("data-i")); sayQ = i; mySay = says[i] || ""; mySayUntil = Date.now() + 4000; };
      });
    }
    paintSays();

    function zone() { if (pos.x >= 0.68) return "cafe"; if (pos.x <= 0.3) return "casa"; return ""; }
    function paintActs() {
      const z = zone();
      let html = "";
      if (z === "cafe") html = '<button class="pb-act" data-a="comer">Pedir café (hambre)</button><button class="pb-act" data-a="hablar">Hablar con Tristo</button>';
      else if (z === "casa") html = '<button class="pb-act" data-a="dormir">Dormir (sueño)</button>';
      else html = '<span class="pb-dim">Caminá hasta la cafetería (derecha) o la casa (izquierda) para hacer cosas.</span>';
      if (actsEl.getAttribute("data-z") !== z) {
        actsEl.setAttribute("data-z", z);
        actsEl.innerHTML = html;
        actsEl.querySelectorAll(".pb-act").forEach((b) => {
          b.onclick = async () => {
            const { d } = await api("/api/pueblo/accion", { method: "POST", headers: JH, body: JSON.stringify({ tipo: b.getAttribute("data-a") }) });
            if (d) {
              if (typeof d.hambre === "number") stats.hambre = d.hambre;
              if (typeof d.sueno === "number") { stats.sueno = d.sueno; zzz = Date.now() + 3000; }
              if (d.npc) { npcSay = d.npc; npcSayUntil = Date.now() + 5000; }
              msgEl.textContent = d.npc || d.message || "";
              bars();
            }
          };
        });
      }
    }

    cv.addEventListener("click", (e) => {
      const r = cv.getBoundingClientRect();
      tgt.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const py = (e.clientY - r.top) / r.height * H;
      tgt.y = Math.max(0, Math.min(1, (py - Y0) / (Y1 - Y0)));
    });
    document.addEventListener("keydown", (e) => {
      const k = e.key; const step = 0.06;
      if (k === "ArrowLeft") tgt.x = Math.max(0, tgt.x - step);
      else if (k === "ArrowRight") tgt.x = Math.min(1, tgt.x + step);
      else if (k === "ArrowUp") tgt.y = Math.max(0, tgt.y - step);
      else if (k === "ArrowDown") tgt.y = Math.min(1, tgt.y + step);
      else return;
      e.preventDefault();
    });

    async function tick() {
      const body = { x: pos.x, y: pos.y };
      if (sayQ != null) { body.say = sayQ; sayQ = null; }
      try {
        const { r, d } = await api("/api/pueblo/tick", { method: "POST", headers: JH, body: JSON.stringify(body) });
        if (r.status === 401) { root.innerHTML = '<p class="pb-p">Se te cerró la sesión. Entrá de nuevo en <a class="pb-link" href="/tristos">Tristo&#39;s</a>.</p>'; return; }
        if (d && d.ok) {
          stats = d.you; bars();
          if (d.says) says.length === d.says.length || (says = d.says, paintSays());
          nEl.textContent = d.n + (d.n === 1 ? " persona en el pueblo" : " personas en el pueblo");
          const mine = esc(me.nick);
          others = (d.players || []).filter((p) => esc(p.nick) !== mine).map((p) => {
            const prev = others.find((o) => o.nick === p.nick);
            return { nick: p.nick, head: p.head, x: prev ? prev.x : p.x, y: prev ? prev.y : p.y, tx: p.x, ty: p.y, say: p.say };
          });
        }
      } catch (_) {}
      setTimeout(tick, 1000);
    }
    tick();

    const npcAmbient = ['Tristo: "Pasá, pasá."', 'Tristo: "Hoy la noche está tranquila. Demasiado."', 'Tristo: "¿Otro café?"'];
    setInterval(() => { if (Date.now() > npcSayUntil && Math.random() < 0.25) { npcSay = npcAmbient[(Math.random() * npcAmbient.length) | 0]; npcSayUntil = Date.now() + 4000; } }, 8000);

    function gy(ny) { return Y0 + ny * (Y1 - Y0); }
    function drawChar(nx, ny, head, nick, say, bright, walking, legOn) {
      const x = nx * W, y = gy(ny), sc = 0.85 + ny * 0.4;
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = "800 " + Math.round(15 * sc) + 'px "Courier New", monospace';
      ctx.fillStyle = "rgba(235,238,245," + bright + ")";
      ctx.fillText(walking && legOn ? ("/" + B) : "||", x, y);
      ctx.fillText(head, x, y - 14 * sc);
      ctx.font = "700 " + Math.round(10 * sc) + 'px "Montserrat", sans-serif';
      ctx.fillStyle = "rgba(255,255,255," + Math.min(1, bright + 0.15) + ")";
      ctx.fillText(nick, x, y - 26 * sc);
      if (say) {
        ctx.font = "600 " + Math.round(11 * sc) + 'px "Montserrat", sans-serif';
        ctx.fillStyle = "rgba(255,255,255,.95)";
        ctx.fillText("« " + say + " »", Math.max(70, Math.min(W - 70, x)), y - 38 * sc);
      }
    }
    function building(cx, lines, label) {
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = '14px "Courier New", monospace'; ctx.fillStyle = "rgba(210,214,222,.34)";
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], cx, Y0 - 8 - (lines.length - 1 - i) * 14);
      ctx.font = '700 10px "Montserrat", sans-serif'; ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillText(label, cx, Y0 - 8 - lines.length * 14);
    }
    const CAFE = ["  ________  ", " /        " + B + " ", " |  CAFE  | ", " |  []  []| ", " |________| "];
    const CASA = ["  ____  ", " /    " + B + " ", " | [] | ", " |_||_| "];
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const sp = 0.14;
      const dx = tgt.x - pos.x, dy = tgt.y - pos.y, dist = Math.hypot(dx, dy);
      const moving = dist > 0.005;
      if (moving) { const m = Math.min(dist, sp * dt); pos.x += dx / dist * m; pos.y += dy / dist * m; }
      legT += dt; if (legT > 0.18) { legT = 0; leg = !leg; }
      for (const o of others) { const ox = o.tx - o.x, oy = o.ty - o.y, od = Math.hypot(ox, oy); if (od > 0.003) { const m = Math.min(od, sp * dt); o.x += ox / od * m; o.y += oy / od * m; o.moving = true; } else o.moving = false; }

      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Y1 + 14); ctx.lineTo(W, Y1 + 14); ctx.stroke();
      building(W * 0.83, CAFE, "LA CAFETERÍA DE TRISTO");
      building(W * 0.16, CASA, "CASA (DORMIR)");
      ctx.font = '13px "Courier New", monospace'; ctx.fillStyle = "rgba(200,205,215,.22)";
      ctx.fillText("/" + B, W * 0.45, Y0 - 24); ctx.fillText("||", W * 0.45, Y0 - 12);
      ctx.fillText("/" + B, W * 0.58, Y0 - 18); ctx.fillText("||", W * 0.58, Y0 - 6);

      const everyone = [];
      everyone.push({ nx: 0.845, ny: 0.22, head: "@", nick: "TRISTO", say: Date.now() < npcSayUntil ? npcSay.replace('Tristo: "', "").replace('"', "") : "", bright: 0.95, walking: false });
      for (const o of others) everyone.push({ nx: o.x, ny: o.y, head: o.head, nick: o.nick, say: o.say, bright: 0.55, walking: !!o.moving });
      everyone.push({ nx: pos.x, ny: pos.y, head: me.head, nick: me.nick, say: Date.now() < mySayUntil ? mySay : (Date.now() < zzz ? "Zzz" : ""), bright: 0.95, walking: moving });
      everyone.sort((a, b) => a.ny - b.ny);
      for (const p of everyone) drawChar(p.nx, p.ny, p.head, p.nick, p.say, p.bright, p.walking, leg);

      paintActs();
      window.requestAnimationFrame(loop);
    }
    window.requestAnimationFrame(loop);
  }

  boot();
})();
