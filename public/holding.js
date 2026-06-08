(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const JH = { "content-type": "application/json", accept: "application/json" };
  let worldAdd = function () {};
  window.YATH_villager = function (n) { worldAdd(n); };

  /* ---------- Fondo: niebla de ruido (igual que la landing) ---------- */
  const canvas = document.getElementById("bg");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    const perm = new Uint8Array(512);
    (() => { const p = new Uint8Array(256); for (let i=0;i<256;i++) p[i]=i; for (let i=255;i>0;i--){ const n=Math.floor(Math.random()*(i+1)); const t=p[i]; p[i]=p[n]; p[n]=t; } for (let i=0;i<512;i++) perm[i]=p[i&255]; })();
    const F3=1/3, G3=1/6;
    function noise3(xin,yin,zin){
      let n0,n1,n2,n3; const s=(xin+yin+zin)*F3;
      const i=Math.floor(xin+s), j=Math.floor(yin+s), k=Math.floor(zin+s);
      const t=(i+j+k)*G3; const x0=xin-(i-t), y0=yin-(j-t), z0=zin-(k-t);
      let i1,j1,k1,i2,j2,k2;
      if(x0>=y0){ if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;} else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;} else {i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;} }
      else { if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;} else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;} else {i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;} }
      const x1=x0-i1+G3,y1=y0-j1+G3,z1=z0-k1+G3, x2=x0-i2+2*G3,y2=y0-j2+2*G3,z2=z0-k2+2*G3, x3=x0-1+3*G3,y3=y0-1+3*G3,z3=z0-1+3*G3;
      const ii=i&255,jj=j&255,kk=k&255; let g;
      let a0=0.6-x0*x0-y0*y0-z0*z0; if(a0<0)n0=0; else { a0*=a0; g=grad3[perm[ii+perm[jj+perm[kk]]]%12]; n0=a0*a0*(g[0]*x0+g[1]*y0+g[2]*z0); }
      let a1=0.6-x1*x1-y1*y1-z1*z1; if(a1<0)n1=0; else { a1*=a1; g=grad3[perm[ii+i1+perm[jj+j1+perm[kk+k1]]]%12]; n1=a1*a1*(g[0]*x1+g[1]*y1+g[2]*z1); }
      let a2=0.6-x2*x2-y2*y2-z2*z2; if(a2<0)n2=0; else { a2*=a2; g=grad3[perm[ii+i2+perm[jj+j2+perm[kk+k2]]]%12]; n2=a2*a2*(g[0]*x2+g[1]*y2+g[2]*z2); }
      let a3=0.6-x3*x3-y3*y3-z3*z3; if(a3<0)n3=0; else { a3*=a3; g=grad3[perm[ii+1+perm[jj+1+perm[kk+1]]]%12]; n3=a3*a3*(g[0]*x3+g[1]*y3+g[2]*z3); }
      return 32*(n0+n1+n2+n3);
    }
    function fbm(x,y,z){ let v=0, amp=0.6, f=1; for(let o=0;o<3;o++){ v+=amp*noise3(x*f,y*f,z*f); f*=2; amp*=0.5; } return v; }
    const SC=16; let w=0,h=0,dpr=1,raf=0,zt=0,fw=0,fh=0;
    const fog=document.createElement("canvas"); const fctx=fog.getContext("2d"); let img=null;
    function size(){ dpr=Math.min(window.devicePixelRatio||1,2); w=window.innerWidth; h=window.innerHeight; canvas.width=Math.floor(w*dpr); canvas.height=Math.floor(h*dpr); canvas.style.width=w+"px"; canvas.style.height=h+"px"; ctx.setTransform(dpr,0,0,dpr,0,0); fw=Math.max(2,Math.ceil(w/SC)); fh=Math.max(2,Math.ceil(h/SC)); fog.width=fw; fog.height=fh; img=fctx.createImageData(fw,fh); }
    function render(){ const ar=h/w; zt+=0.0016; const d=img.data; let p=0; for(let j=0;j<fh;j++){ for(let i=0;i<fw;i++){ const u=i/fw, vv=j/fh; const v=0.6*fbm(u*2.6,vv*2.6*ar,zt)+0.4*fbm(u*1.1,vv*1.1*ar,zt*0.7+11.3); let a=(v+1)*0.5; a=(a-0.42)/0.58; if(a<0)a=0; else if(a>1)a=1; a=a*a*(3-2*a); d[p]=206; d[p+1]=209; d[p+2]=216; d[p+3]=(a*0.14*255)|0; p+=4; } } fctx.putImageData(img,0,0); ctx.globalCompositeOperation="source-over"; ctx.fillStyle="#060606"; ctx.fillRect(0,0,w,h); ctx.globalCompositeOperation="lighter"; ctx.imageSmoothingEnabled=true; ctx.filter="blur(18px)"; ctx.drawImage(fog,0,0,fw,fh,0,0,w,h); ctx.filter="none"; ctx.globalCompositeOperation="source-over"; }
    function loop(){ render(); raf=window.requestAnimationFrame(loop); }
    function start(){ if(!raf) raf=window.requestAnimationFrame(loop); }
    function stop(){ if(raf){ window.cancelAnimationFrame(raf); raf=0; } }
    size(); window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });
    if (reduce) { render(); } else { start(); }
  }

  /* ---------- Glitch del título: "YOU ARE THE AD" <-> "YOU ARE DEAD" (aleatorio) ---------- */
  (() => {
    if (reduce) return;
    const heads = Array.prototype.slice.call(document.querySelectorAll(".headline, .reflection"));
    if (!heads.length) return;
    const NORMAL = "YOU ARE THE AD", DEAD = "YOU ARE DEAD";
    const rand = (a, b) => a + Math.random() * (b - a);
    const setText = (t) => heads.forEach((el) => { el.textContent = t; });
    const deadOn = () => heads.forEach((el) => { el.classList.add("dead"); el.classList.remove("glitch"); void el.offsetWidth; el.classList.add("glitch"); });
    const deadOff = () => heads.forEach((el) => { el.classList.remove("dead", "glitch"); });
    function enter() {
      setText(DEAD); deadOn();
      if (Math.random() < 0.45) {
        setTimeout(() => setText(NORMAL), 70);
        setTimeout(() => { setText(DEAD); deadOn(); }, 140);
      }
      setTimeout(exit, rand(340, 820));
    }
    function exit() { setText(NORMAL); deadOff(); schedule(); }
    function schedule() {
      setTimeout(() => { if (document.hidden) schedule(); else enter(); }, rand(4000, 12000));
    }
    schedule();
  })();

  /* ---------- Música ambiente + botón ecualizador ---------- */
  (() => {
    const audio = document.getElementById("snd-audio");
    const btn = document.getElementById("snd");
    if (!audio || !btn) return;
    audio.volume = 0.5;
    audio.muted = true;
    let want = true, unlocked = false, justUnlocked = false, suspended = false;
    try { if (localStorage.getItem("yath-muted") === "1") want = false; } catch (_) {}
    function play() { const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
    function apply() {
      audio.muted = suspended || !(want && unlocked);
      btn.classList.toggle("playing", want);
      btn.setAttribute("aria-pressed", want ? "true" : "false");
      btn.setAttribute("aria-label", want ? "Silenciar música" : "Activar música");
    }
    function save() { try { localStorage.setItem("yath-muted", want ? "0" : "1"); } catch (_) {} }
    if (want) play();
    apply();
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      if (want) { audio.muted = false; play(); justUnlocked = true; setTimeout(() => { justUnlocked = false; }, 350); }
      ["pointerdown", "keydown", "touchstart", "scroll"].forEach((ev) => window.removeEventListener(ev, unlock));
    }
    ["pointerdown", "keydown", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
    btn.addEventListener("click", () => {
      if (suspended) return;
      if (justUnlocked) { justUnlocked = false; apply(); return; }
      want = !want;
      if (want) { unlocked = true; play(); }
      apply();
      save();
    });
    // Los juegos con música propia suspenden la música del sitio para que no se solapen.
    window.YATH_siteMusic = {
      suspend() { suspended = true; try { audio.muted = true; audio.pause(); } catch (_) {} btn.classList.add("snd-off"); },
      resume() { suspended = false; btn.classList.remove("snd-off"); apply(); if (want && unlocked) play(); },
    };
  })();

  /* ---------- Mundo ASCII (delante de la niebla, detrás del chat; 2 niveles) ---------- */
  (() => {
    const cv = document.getElementById("world");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const B = String.fromCharCode(92);
    const TREE = ["  /" + B + "  ", " /__" + B + " ", "/____" + B, "  ||  "];
    const HOUSE = [" ____ ", "/    " + B, "|[]  |", "|_||_|"];
    const PHR = [
      "Avisenme si ven una salida", "sáquenme de acá", "déjenme salir", "no encuentro la salida", "Llevo caminando un rato y no hay salida",
      "Okey... esto dejó de ser gracioso", "¿por qué no me puedo ir?", "¿dónde estoy?", "¿cómo llegué acá?", "¿qué es este lugar?",
      "¿esto es un sueño?", "esto no es real", "ayudame", "¿alguien me ve?", "¿hay alguien ahí?",
      "Si... te veo", "sé que me estás viendo", "nos están mirando", "NO HABLES EN EL CHAT", "¿sos real?",
      "no puedo despertar", "no puedo dormir", "hace días que no duermo", "tengo mucho sueño", "otra noche más acá",
      "acá siempre es de noche", "Solamente era un fan de un canal...", "¿esto es la publicidad?", "creo que soy un anuncio", "No debí ver ese video",
      "No. Pongas. Tu. Nombre", "¿cuándo sale el video?", "cuando salga el video... ¿muero?", "el video nos libera", "falta poco, aguanten",
      "tengo frío", "está muy oscuro", "escuché algo", "no estamos solos", "alguien dijo mi nombre",
      "no mires atrás", "ya me acostumbré", "me quiero ir a casa", "extraño el sol", "¿Soy esto?",
      "¿y mis cosas?", "guardame un lugar afuera", "contá que estuve acá", "no apaguen la luz", '¿Ese botón de arriba "Tetristo" será la salida?',
    ];
    const CELL = 13, LH = 14, SLOTW = 132, LANEGAP = 54; let MAX = 12;
    let W = 0, H = 0, DPR = 1, ground = 0, laneY = [0, 0], trees = [], houses = [], raf = 0, last = 0, spk = 0;
    const people = [];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (a) => a[(Math.random() * a.length) | 0];

    function layout() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
      cv.style.width = W + "px"; cv.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ground = H - 24; laneY = [ground, ground];
      MAX = Math.max(3, Math.min(10, Math.floor(W / SLOTW)));
      while (people.length > MAX) people.shift();
      trees = []; houses = [];
      const n = Math.max(4, Math.round(W / 170));
      for (let i = 0; i < n; i++) trees.push({ x: rnd(20, W - 20) });
      const hn = Math.max(2, Math.round(W / 420));
      for (let i = 0; i < hn; i++) houses.push({ x: (i + 1) * W / (hn + 1) + rnd(-24, 24) });
    }
    function laneCount(l) { let c = 0; for (const p of people) if (p.lane === l) c++; return c; }
    function spawn(name, seed) {
      const lane = 0;
      const left = Math.random() < 0.5;
      people.push({ name: (name || "").trim().slice(0, 14), seed: !!seed, lane, x: left ? -14 : W + 14, tgt: rnd(W * 0.12, W * 0.88), leg: false, legT: 0, bob: Math.random() * 6.28, a: 0, st: "walk", timer: 0, ph: "", pUntil: 0, head: Math.random() < 0.18 ? "O" : "o", spd: rnd(10, 18), goHouse: false, seen: performance.now() });
    }
    worldAdd = function (name) {
      name = (name || "").trim().slice(0, 14);
      if (!name) return;
      const ex = people.find((p) => !p.seed && p.name.toLowerCase() === name.toLowerCase());
      if (ex) { ex.seen = performance.now(); return; }
      if (people.length >= MAX) {
        let idx = people.findIndex((p) => p.seed);
        if (idx < 0) { let oldest = Infinity; for (let i = 0; i < people.length; i++) if (people[i].seen < oldest) { oldest = people[i].seen; idx = i; } }
        if (idx >= 0) people.splice(idx, 1);
      }
      spawn(name, false);
    };

    function step(dt, now) {
      for (let l = 0; l < 2; l++) {
        const arr = people.filter((p) => p.lane === l && p.a > 0.05).sort((a, b) => a.x - b.x);
        for (let i = 1; i < arr.length; i++) { const A = arr[i - 1], C = arr[i], gap = C.x - A.x; if (gap < SLOTW) { const push = (SLOTW - gap) / 2; A.x -= push; C.x += push; } }
      }
      for (const p of people) {
        if (p.x < -20) p.x = -20; if (p.x > W + 20) p.x = W + 20;
        const ta = (p.st === "inside") ? 0 : 1; p.a += (ta - p.a) * Math.min(1, dt * 4);
        if (p.st === "walk") {
          if (Math.abs(p.tgt - p.x) > 2) { p.x += Math.sign(p.tgt - p.x) * p.spd * dt; p.legT += dt; if (p.legT > 0.16) { p.legT = 0; p.leg = !p.leg; } p.bob += dt * 8; }
          else if (p.goHouse) { p.goHouse = false; p.st = "inside"; p.timer = rnd(3, 7); p.ph = ""; }
          else if (p.lane === 1 && houses.length && Math.random() < 0.3) { p.tgt = pick(houses).x; p.goHouse = true; }
          else p.tgt = rnd(W * 0.1, W * 0.9);
        } else if (p.st === "inside") { p.timer -= dt; if (p.timer <= 0) { p.st = "walk"; p.tgt = rnd(W * 0.1, W * 0.9); } }
      }
      const speaking = people.some((p) => p.ph && now < p.pUntil);
      spk -= dt;
      if (!speaking && spk <= 0) { spk = rnd(6, 12); const cand = people.filter((p) => p.a > 0.6 && p.st === "walk"); if (cand.length) { const s = pick(cand); s.ph = pick(PHR); s.pUntil = now + rnd(2600, 4200); } }
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.font = CELL + 'px "Courier New", monospace'; ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(210,213,220,0.10)";
      const cw = ctx.measureText("=").width || 7.8;
      ctx.fillText("=".repeat(Math.ceil(W / cw) + 2), 0, ground + 3);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(200,205,215,0.13)";
      for (const t of trees) for (let i = 0; i < TREE.length; i++) ctx.fillText(TREE[i], t.x, ground - (TREE.length - 1 - i) * LH);
      ctx.fillStyle = "rgba(205,208,216,0.15)";
      for (const h of houses) for (let i = 0; i < HOUSE.length; i++) ctx.fillText(HOUSE[i], h.x, ground - (HOUSE.length - 1 - i) * LH);
      const order = people.slice().sort((a, b) => a.lane - b.lane);
      for (const p of order) {
        if (p.a < 0.02) continue;
        const depth = 1;
        const by = laneY[p.lane];
        ctx.fillStyle = "rgba(228,231,238," + (0.30 * p.a * depth) + ")";
        ctx.fillText(p.leg ? ("/" + B) : "||", p.x, by);
        ctx.fillText(p.head, p.x, by - LH);
        if (p.name) { ctx.fillStyle = "rgba(255,255,255," + (0.6 * p.a * depth) + ")"; ctx.fillText(p.name, p.x, by - LH * 2 - 6); }
        if (p.ph && performance.now() < p.pUntil && p.st === "walk") {
          const bub = "« " + p.ph + " »", half = ctx.measureText(bub).width / 2;
          let bx = p.x; if (bx - half < 6) bx = half + 6; if (bx + half > W - 6) bx = W - half - 6;
          ctx.fillStyle = "rgba(255,255,255," + (0.9 * p.a) + ")"; ctx.fillText(bub, bx, by - LH * 3 - 12);
        }
      }
    }
    function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt, now); draw(); raf = window.requestAnimationFrame(loop); }
    layout();
    window.addEventListener("resize", layout);
    for (let i = 0; i < 4; i++) spawn("", true);
    if (reduce) { for (const p of people) p.a = 1; step(0.016, performance.now()); draw(); }
    else {
      document.addEventListener("visibilitychange", () => { if (document.hidden) { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } } else if (!raf) { last = performance.now(); raf = window.requestAnimationFrame(loop); } });
      last = performance.now(); raf = window.requestAnimationFrame(loop);
    }
  })();

  /* ---------- Botón admin (preview de la landing real) ---------- */
  (() => {
    const adm = document.getElementById("navAdmin");
    if (!adm) return;
    adm.addEventListener("click", (e) => {
      e.preventDefault();
      const k = window.prompt("Clave de admin:");
      if (k) window.location.href = "/admin?key=" + encodeURIComponent(k);
    });
  })();

  /* ---------- Botón entrar / mi perfil en el nav ---------- */
  (() => {
    const a = document.getElementById("navPerfil");
    if (!a) return;
    fetch("/api/hub/me", { headers: { accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => { if (d && d.logged) a.textContent = d.nick || "mi perfil"; })
      .catch(() => {});
  })();

  /* ---------- Chat en vivo (shoutbox con polling) ---------- */
  (() => {
    const log = document.getElementById("chat-log");
    const form = document.getElementById("chat-form");
    const nameEl = document.getElementById("chat-name");
    const textEl = document.getElementById("chat-text");
    const sendEl = document.getElementById("chat-send");
    const msgEl = document.getElementById("chat-msg");
    if (!log || !form) return;

    let maxId = 0, sending = false, emptyShown = false;
    const seen = new Set();

    try { const n = localStorage.getItem("yath-chat-name"); if (n && nameEl) nameEl.value = n; } catch (_) {}

    function setMsg(t, kind) { if (msgEl) { msgEl.textContent = t || ""; msgEl.className = "hd-msg" + (kind ? " " + kind : ""); } }
    function nearBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 60; }
    function showEmpty() {
      if (emptyShown || log.children.length) return;
      const e = document.createElement("div"); e.className = "hd-empty"; e.textContent = "Sé el primero en escribir.";
      log.appendChild(e); emptyShown = true;
    }
    function clearEmpty() { if (emptyShown) { log.innerHTML = ""; emptyShown = false; } }
    function addMsg(m) {
      if (!m || (m.id && seen.has(m.id))) return;
      if (m.id) seen.add(m.id);
      clearEmpty();
      if (m.name) worldAdd(m.name);
      const row = document.createElement("div"); row.className = "hd-m";
      const who = document.createElement("b"); who.className = "hd-who"; who.textContent = (m.name || "ANÓN") + ":";
      const bd = document.createElement("span"); bd.className = "hd-b"; bd.textContent = m.body || "";
      row.appendChild(who); row.appendChild(document.createTextNode(" ")); row.appendChild(bd);
      log.appendChild(row);
      if (typeof m.id === "number" && m.id > maxId) maxId = m.id;
    }
    function render(list) {
      const stick = nearBottom();
      let added = false;
      list.forEach((m) => { const before = seen.size; addMsg(m); if (seen.size !== before) added = true; });
      if (added && stick) log.scrollTop = log.scrollHeight;
    }

    async function load() {
      try {
        const url = maxId ? ("/api/chat?since=" + maxId) : "/api/chat";
        const r = await fetch(url, { headers: { accept: "application/json" } });
        const d = await r.json();
        if (d && Array.isArray(d.messages) && d.messages.length) render(d.messages);
        else if (!maxId) showEmpty();
      } catch (_) {}
    }
    load();
    log.scrollTop = log.scrollHeight;
    setInterval(() => { if (!document.hidden) load(); }, 2500);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (sending) return;
      const name = (nameEl && nameEl.value ? nameEl.value : "").trim();
      const text = (textEl && textEl.value ? textEl.value : "").trim();
      if (!text) { setMsg("Escribí algo.", "err"); return; }
      try { if (name) localStorage.setItem("yath-chat-name", name); } catch (_) {}
      sending = true; if (sendEl) sendEl.disabled = true; setMsg("");
      try {
        const r = await fetch("/api/chat", { method: "POST", headers: JH, body: JSON.stringify({ name, body: text }) });
        const d = await r.json();
        if (r.ok && d.message) {
          render([d.message]); log.scrollTop = log.scrollHeight; if (textEl) textEl.value = "";
          if (d.nameLocked && nameEl && !nameEl.readOnly) { nameEl.value = d.message.name; nameEl.readOnly = true; nameEl.classList.add("locked"); nameEl.title = "Tu nombre quedó fijo"; try { localStorage.setItem("yath-chat-name", d.message.name); } catch (_) {} }
        }
        else setMsg(d.message || "No se pudo enviar.", "err");
      } catch (_) { setMsg("Algo se rompió. Probá de nuevo.", "err"); }
      finally { sending = false; if (sendEl) sendEl.disabled = false; if (textEl) textEl.focus(); }
    });
  })();
})();
