(() => {
  "use strict";
  const root = document.getElementById("pb-root");
  if (!root) return;
  const JH = { "content-type": "application/json", accept: "application/json" };
  async function api(path, opts) { const r = await fetch(path, opts); let d = null; try { d = await r.json(); } catch (_) {} return { r, d }; }
  function esc(s) { return String(s).replace(/[<>&"']/g, ""); }

  /* ---------- Sprites pixelart (sin imágenes: mapas de chars) ---------- */
  const PAL = { H: "#b9bdc7", A: "#e8eaf0", D: "#14141a", B: "#383b44", L: "#23252d", W: "#a87848" };
  const HEADS_PX = {
    "o": ["..HHHH..", "..HHHH..", "..HHHH..", "........"],
    "O": [".HHHHHH.", ".HHHHHH.", ".HHHHHH.", "........"],
    "ö": ["..HHHH..", "..HAAH..", "..HHHH..", "........"],
    "ø": ["..HHHA..", "..HAHH..", "..AHHH..", "........"],
    "@": [".DDDDDD.", ".DHHHHD.", ".DHHHHD.", "........"],
    "°": ["...AA...", "..HHHH..", "..HHHH..", "........"],
  };
  const BODY_A = ["...BB...", "..BBBB..", ".BBBBBB.", "..BBBB..", "...BB...", "..L..L..", "..L..L..", ".LL..LL."];
  const BODY_B = ["...BB...", "..BBBB..", ".BBBBBB.", "..BBBB..", "...BB...", "...LL...", "..L.L...", ".LL.LL.."];
  const BODY_NPC = ["...BB...", "..BWWB..", ".BBWWBB.", "..BWWB..", "...WW...", "..L..L..", "..L..L..", ".LL..LL."];
  function spriteRows(head, frameB, npc) {
    const h = HEADS_PX[head] || HEADS_PX["o"];
    return h.concat(npc ? BODY_NPC : (frameB ? BODY_B : BODY_A));
  }
  function drawSprite(ctx, rows, cx, baseY, px) {
    const x0 = Math.round(cx - 4 * px), y0 = Math.round(baseY - rows.length * px);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let i = 0; i < row.length; i++) {
        const c = PAL[row[i]];
        if (c) { ctx.fillStyle = c; ctx.fillRect(x0 + i * px, y0 + r * px, px, px); }
      }
    }
  }

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
      '<p class="pb-p">Elegí quién vas a ser. El resto ya lo perdiste al entrar.</p>' +
      '<div class="pb-heads" id="pb-heads"></div>' +
      '<button class="pb-btn" id="pb-crear">Entrar al pueblo</button>' +
      '<p class="pb-msg" id="pb-cmsg"></p>';
    let sel = 0;
    const box = root.querySelector("#pb-heads");
    box.innerHTML = heads.map((h, i) => '<button class="pb-head' + (i === 0 ? " on" : "") + '" data-i="' + i + '"><canvas width="40" height="56"></canvas></button>').join("");
    box.querySelectorAll(".pb-head").forEach((b, i) => {
      const c = b.querySelector("canvas").getContext("2d");
      drawSprite(c, spriteRows(heads[i], false, false), 20, 52, 4);
      b.onclick = () => { sel = i; box.querySelectorAll(".pb-head").forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
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
        '<span class="pb-who">' + esc(me.nick) + '</span>' +
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
    ctx.imageSmoothingEnabled = false;
    const msgEl = root.querySelector("#pb-msg"), actsEl = root.querySelector("#pb-acts"), nEl = root.querySelector("#pb-n");
    const W = cv.width, H = cv.height;
    const Y0 = H * 0.45, Y1 = H * 0.9, PX = 3;
    const pos = { x: typeof me.x === "number" ? me.x : 0.5, y: typeof me.y === "number" ? me.y : 0.6 };
    const tgt = { x: pos.x, y: pos.y };
    let stats = { vida: me.vida, hambre: me.hambre, sueno: me.sueno };
    let others = [], sayQ = null, leg = false, legT = 0, last = performance.now();
    let says = ["hola", "jaja", "¿y el video?", "seguime", "quiero salir de acá", "tengo hambre", "tengo sueño", "¿alguien tiene café?", "no puedo dormir", "estamos atrapados"];
    let mySay = "", mySayUntil = 0, npcSay = "", npcSayUntil = 0, zzz = 0;

    const noise = [];
    for (let i = 0; i < 240; i++) noise.push([Math.random() * W, Y0 - 20 + Math.random() * (Y1 - Y0 + 44), Math.random() < 0.5 ? "#15151b" : "#0c0c10"]);

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
      if (actsEl.getAttribute("data-z") === z) return;
      actsEl.setAttribute("data-z", z);
      let html = "";
      if (z === "cafe") html = '<button class="pb-act" data-a="comer">Pedir café (hambre)</button><button class="pb-act" data-a="hablar">Hablar con Tristo</button>';
      else if (z === "casa") html = '<button class="pb-act" data-a="dormir">Dormir (sueño)</button>';
      else html = '<span class="pb-dim">Caminá hasta la cafetería (derecha) o la casa (izquierda) para hacer cosas.</span>';
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
          if (d.says && d.says.length !== says.length) { says = d.says; paintSays(); }
          nEl.textContent = d.n + (d.n === 1 ? " persona en el pueblo" : " personas en el pueblo");
          const mine = esc(me.nick);
          others = (d.players || []).filter((p) => esc(p.nick) !== mine).map((p) => {
            const prev = others.find((o) => o.nick === p.nick);
            return { nick: p.nick, head: p.head, x: prev ? prev.x : p.x, y: prev ? prev.y : p.y, tx: p.x, ty: p.y, say: p.say, moving: false };
          });
        }
      } catch (_) {}
      setTimeout(tick, 1000);
    }
    tick();

    const npcAmbient = ['"Pasá, pasá."', '"Hoy la noche está tranquila. Demasiado."', '"¿Otro café?"'];
    setInterval(() => { if (Date.now() > npcSayUntil && Math.random() < 0.25) { npcSay = npcAmbient[(Math.random() * npcAmbient.length) | 0]; npcSayUntil = Date.now() + 4000; } }, 8000);

    function gy(ny) { return Y0 + ny * (Y1 - Y0); }
    function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
    function bubble(x, y, text, strong) {
      ctx.font = '600 11px "Montserrat", sans-serif';
      const w = ctx.measureText(text).width;
      const bx = Math.max(8 + w / 2, Math.min(W - 8 - w / 2, x));
      rect(bx - w / 2 - 7, y - 15, w + 14, 19, "rgba(8,8,11,.88)");
      ctx.fillStyle = strong ? "#e8d4b0" : "#e6e8ee";
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(text, bx, y - 1);
    }
    function nameTag(x, y, text, bright) {
      ctx.font = '700 9px "Montserrat", sans-serif';
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(220,224,232," + bright + ")";
      ctx.fillText(text, x, y);
    }
    function cafeteria(cx, by) {
      rect(cx - 92, by - 100, 184, 100, "#1b1b22");
      rect(cx - 100, by - 110, 200, 12, "#0d0d12");
      rect(cx - 100, by - 98, 200, 3, "#26262f");
      rect(cx - 70, by - 74, 30, 24, "#b98a52");
      rect(cx - 68, by - 72, 26, 20, "#d8aa6a");
      rect(cx + 40, by - 74, 30, 24, "#b98a52");
      rect(cx + 42, by - 72, 26, 20, "#d8aa6a");
      rect(cx - 16, by - 50, 32, 50, "#0c0c11");
      rect(cx - 92, by - 30, 184, 4, "#26262f");
      ctx.font = '700 12px "Courier New", monospace';
      ctx.textAlign = "center"; ctx.fillStyle = "#d8b07a";
      ctx.fillText("C A F E", cx, by - 84);
      const g = ctx.createRadialGradient(cx, by + 6, 0, cx, by + 6, 90);
      g.addColorStop(0, "rgba(185,138,82,0.10)"); g.addColorStop(1, "rgba(185,138,82,0)");
      ctx.fillStyle = g; ctx.fillRect(cx - 100, by - 10, 200, 60);
    }
    function casa(cx, by) {
      rect(cx - 56, by - 64, 112, 64, "#17171e");
      rect(cx - 64, by - 74, 128, 12, "#0c0c11");
      rect(cx - 36, by - 48, 22, 18, "#3d4654");
      rect(cx - 34, by - 46, 18, 14, "#566378");
      rect(cx + 10, by - 40, 24, 40, "#0b0b10");
      ctx.font = '700 9px "Montserrat", sans-serif';
      ctx.textAlign = "center"; ctx.fillStyle = "rgba(190,196,206,.5)";
      ctx.fillText("CASA", cx, by - 80);
    }
    function pine(cx, by) {
      rect(cx - 2, by - 8, 4, 8, "#1c1f1c");
      rect(cx - 12, by - 16, 24, 8, "#141a15");
      rect(cx - 9, by - 24, 18, 8, "#161c17");
      rect(cx - 6, by - 32, 12, 8, "#181f19");
    }

    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const sp = 0.14;
      const dx = tgt.x - pos.x, dy = tgt.y - pos.y, dist = Math.hypot(dx, dy);
      const moving = dist > 0.005;
      if (moving) { const m = Math.min(dist, sp * dt); pos.x += dx / dist * m; pos.y += dy / dist * m; }
      legT += dt; if (legT > 0.16) { legT = 0; leg = !leg; }
      for (const o of others) { const ox = o.tx - o.x, oy = o.ty - o.y, od = Math.hypot(ox, oy); if (od > 0.003) { const m = Math.min(od, sp * dt); o.x += ox / od * m; o.y += oy / od * m; o.moving = true; } else o.moving = false; }

      ctx.clearRect(0, 0, W, H);
      rect(0, Y0 - 26, W, Y1 - Y0 + 60, "#101015");
      rect(0, Y0 - 26, W, 2, "#1d1d26");
      for (const n of noise) { ctx.fillStyle = n[2]; ctx.fillRect(Math.round(n[0]), Math.round(n[1]), 2, 2); }
      pine(W * 0.44, Y0 + 2); pine(W * 0.56, Y0 - 4); pine(W * 0.36, Y0 - 8);
      cafeteria(W * 0.83, Y0 + 8);
      casa(W * 0.16, Y0 + 6);

      const everyone = [];
      everyone.push({ nx: 0.845, ny: 0.16, head: "@", nick: "TRISTO", say: Date.now() < npcSayUntil ? npcSay.replace(/^Tristo: /, "").replace(/"/g, "") : "", bright: 1, walking: false, npc: true });
      for (const o of others) everyone.push({ nx: o.x, ny: o.y, head: o.head, nick: o.nick, say: o.say, bright: 0.6, walking: !!o.moving, npc: false });
      everyone.push({ nx: pos.x, ny: pos.y, head: me.head, nick: me.nick, say: Date.now() < mySayUntil ? mySay : (Date.now() < zzz ? "Zzz" : ""), bright: 1, walking: moving, npc: false });
      everyone.sort((a, b) => a.ny - b.ny);
      for (const p of everyone) {
        const x = Math.round(p.nx * W), y = Math.round(gy(p.ny));
        ctx.globalAlpha = p.bright;
        drawSprite(ctx, spriteRows(p.head, p.walking && leg, p.npc), x, y, PX);
        ctx.globalAlpha = 1;
        nameTag(x, y - 12 * PX - 6, p.nick, Math.min(1, p.bright + 0.1));
        if (p.say) bubble(x, y - 12 * PX - 18, p.say, p.npc);
      }
      paintActs();
      window.requestAnimationFrame(loop);
    }
    window.requestAnimationFrame(loop);
  }

  boot();
})();
