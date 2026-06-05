(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const JH = { "content-type": "application/json", accept: "application/json" };

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

  /* ---------- Música ambiente + botón ecualizador ---------- */
  (() => {
    const audio = document.getElementById("snd-audio");
    const btn = document.getElementById("snd");
    if (!audio || !btn) return;
    audio.volume = 0.5;
    audio.muted = true;
    let want = true, unlocked = false, justUnlocked = false;
    try { if (localStorage.getItem("yath-muted") === "1") want = false; } catch (_) {}
    function play() { const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
    function apply() {
      audio.muted = !(want && unlocked);
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
      if (justUnlocked) { justUnlocked = false; apply(); return; }
      want = !want;
      if (want) { unlocked = true; play(); }
      apply();
      save();
    });
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
        if (r.ok && d.message) { render([d.message]); log.scrollTop = log.scrollHeight; if (textEl) textEl.value = ""; }
        else setMsg(d.message || "No se pudo enviar.", "err");
      } catch (_) { setMsg("Algo se rompió. Probá de nuevo.", "err"); }
      finally { sending = false; if (sendEl) sendEl.disabled = false; if (textEl) textEl.focus(); }
    });
  })();
})();
