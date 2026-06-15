(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = new Intl.NumberFormat("es-AR");

  const PHRASES = [
    "OBEDECÉ", "CONSUMÍ", "CONFORMATE", "SOMETETE", "COMPRÁ", "DORMÍ",
    "SCROLLEÁ", "YOU ARE THE AD", "REMERA", "ANOTATE", "ES TUYA", "A.D.",
  ];
  const WORDS = ["YOU", "ARE", "THE", "AD"];

  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
  };
  const KEYS = Object.keys(SHAPES);
  const COLS = 10, ROWS = 20;

  function rot(m) { const N = m.length, r = []; for (let y=0;y<N;y++){ r.push([]); for (let x=0;x<N;x++) r[y].push(m[N-1-x][y]); } return r; }

  let built = false, overlay, flashEl, shell, canvas, ctx, nextCanvas, nctx, holdCanvas, hctx, cell, screenEl, popEl;
  let board, piece, nextType, bag = [];
  let score = 0, lines = 0, level = 1, dropInt = 800, finalScore = 0;
  let best = Number(localStorage.getItem("yg_best") || 0);
  let raf = 0, running = false, paused = false, over = false, savedThisRun = false, lastDrop = 0;
  let holdType = null, holdUsed = false, lockTimer = 0, lockResets = 0, hyperOn = false;
  const LOCK_DELAY = 500, LOCK_MAX_RESETS = 15;
  // --- Modo hiper: a partir del millón el juego se vuelve increíblemente rápido ---
  const HYPER_START = 1000000, HYPER_STEP = 120000;   // cada 120k de puntos por encima del millón, otro escalón
  const HYPER_BASE = 20, HYPER_DEC = 2, HYPER_MIN = 5; // intervalo de caída en ms (arranca en 20, baja hasta 5)
  const HYPER_MAXSTEP = 3;                              // filas que puede caer una pieza por frame en lo más alto
  const HYPER_LOCK_BASE = 360, HYPER_LOCK_MIN = 180;   // lock delay reducido en hiper
  const HYPER_RESETS = 6;                              // menos margen para frenar la pieza abajo
  function hyperSteps() { return score < HYPER_START ? -1 : Math.floor((score - HYPER_START) / HYPER_STEP); }
  function effInterval() { const s = hyperSteps(); return s < 0 ? dropInt : Math.max(HYPER_MIN, HYPER_BASE - s * HYPER_DEC); }
  function effLockDelay() { const s = hyperSteps(); return s < 0 ? LOCK_DELAY : Math.max(HYPER_LOCK_MIN, HYPER_LOCK_BASE - s * 20); }
  function effMaxResets() { return score >= HYPER_START ? HYPER_RESETS : LOCK_MAX_RESETS; }
  function aceleraFlash() { if (reduce) return; flashQ.push({ text: "ACELERÁ", white: false }); flashQ.push({ text: "MÁS\nRÁPIDO", white: true }); if (!flashing) runFlash(); }

  const vpMeta = document.querySelector('meta[name="viewport"]');
  const vpDefault = vpMeta ? vpMeta.getAttribute("content") : null;

  function resetBoard() { board = []; for (let y=0;y<ROWS;y++) board.push(new Array(COLS).fill(0)); }
  function bagNext() {
    if (bag.length === 0) { bag = KEYS.slice(); for (let i=bag.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=bag[i]; bag[i]=bag[j]; bag[j]=t; } }
    return bag.pop();
  }
  function makePiece(type) {
    const m = SHAPES[type];
    piece = { type, m: m.map((r) => r.slice()), x: Math.floor((COLS - m.length) / 2), y: 0, word: WORDS[Math.floor(Math.random() * WORDS.length)] };
    lockTimer = 0; lockResets = 0;
    if (collide(piece.m, piece.x, piece.y)) endGame();
  }
  function spawn() {
    const type = nextType || bagNext();
    nextType = bagNext();
    holdUsed = false;
    makePiece(type);
    drawNext(); drawHold();
  }
  function collide(m, px, py) {
    for (let y=0;y<m.length;y++) for (let x=0;x<m.length;x++) {
      if (!m[y][x]) continue;
      const bx = px+x, by = py+y;
      if (bx<0 || bx>=COLS || by>=ROWS) return true;
      if (by>=0 && board[by][bx]) return true;
    }
    return false;
  }
  function merge() {
    let ko = false;
    for (let y=0;y<piece.m.length;y++) for (let x=0;x<piece.m.length;x++) {
      if (!piece.m[y][x]) continue;
      const by = piece.y+y, bx = piece.x+x;
      if (by<0) { ko = true; continue; }
      board[by][bx] = piece.word;
    }
    return ko;
  }
  function clearLines() {
    let n = 0;
    for (let y=ROWS-1;y>=0;y--) { if (board[y].every((c)=>c)) { board.splice(y,1); board.unshift(new Array(COLS).fill(0)); n++; y++; } }
    return n;
  }
  function lock() { const ko = merge(); const n = clearLines(); if (n>0) onClear(n); if (ko) { endGame(); return; } spawn(); }
  function resetLock() { if (lockTimer && lockResets < effMaxResets() && piece && collide(piece.m, piece.x, piece.y+1)) { lockTimer = performance.now(); lockResets++; } }
  function move(dx) { if (over||paused||!piece) return; if (!collide(piece.m, piece.x+dx, piece.y)) { piece.x+=dx; resetLock(); draw(); } }
  function rotate() { if (over||paused||!piece) return; const r = rot(piece.m); for (const k of [0,-1,1,-2,2]) { if (!collide(r, piece.x+k, piece.y)) { piece.m=r; piece.x+=k; resetLock(); draw(); return; } } }
  function softDrop() { if (over||paused||!piece) return; if (!collide(piece.m, piece.x, piece.y+1)) { piece.y++; score+=1; updateHud(); lastDrop = performance.now(); } draw(); }
  function hardDrop() { if (over||paused||!piece) return; let d=0; while (!collide(piece.m, piece.x, piece.y+1)) { piece.y++; d++; } score+=d*2; updateHud(); lock(); draw(); }
  function hold() {
    if (over||paused||!piece||holdUsed) return;
    const cur = piece.type;
    if (holdType == null) { holdType = cur; spawn(); } else { const t = holdType; holdType = cur; makePiece(t); }
    holdUsed = true; lastDrop = 0; drawHold(); draw();
  }

  function onClear(n) {
    const wasRecord = score > best;
    score += [0,100,300,500,800][n] * level;
    lines += n; level = Math.floor(lines/10)+1; dropInt = Math.max(80, 800-(level-1)*70);
    updateHud(); popup(n); shake();
    const record = score > best;
    if (n>=4 || (record && !wasRecord)) barrage(record ? 4 : 3); else flashOne();
    if (record) { best = score; localStorage.setItem("yg_best", String(best)); updateHud(); }
    checkRank();
  }

  let flashQ = [], flashing = false;
  function flashOne() { enqueue(1); }
  function barrage(k) { enqueue(k); }
  function enqueue(k) { if (reduce) return; for (let i=0;i<k;i++) flashQ.push({ text: PHRASES[Math.floor(Math.random()*PHRASES.length)], white: false }); if (!flashing) runFlash(); }
  function rankFlash(rank) { if (reduce) return; flashQ.push({ text: "#" + rank, white: true }); if (!flashing) runFlash(); }
  function runFlash() {
    if (flashQ.length === 0) { flashing = false; return; }
    flashing = true; const it = flashQ.shift();
    flashEl.firstChild.textContent = it.text;
    flashEl.classList.toggle("yg-inv", !it.white);
    flashEl.classList.add("yg-on");
    setTimeout(() => { flashEl.classList.remove("yg-on"); setTimeout(runFlash, 300); }, it.white ? 95 : 80);
  }
  let myRank = null, peeking = false;
  async function peekRank(sc) { try { const r = await fetch("/api/rank?game=tetristo&score=" + sc, { headers: { accept: "application/json" } }); const d = await r.json(); return d && d.ok ? d : null; } catch (_) { return null; } }
  function setRank(rank) { setText("yg-rank", rank ? "#" + fmt.format(rank) : "—"); }
  function checkRank() {
    if (peeking) return; peeking = true;
    peekRank(score).then((d) => { peeking = false; if (!d) return; const nr = d.rank; if (myRank != null && nr < myRank && nr <= 10) rankFlash(nr); myRank = nr; setRank(nr); });
  }
  function shake() { if (reduce || !shell) return; shell.classList.remove("yg-shake"); void shell.offsetWidth; shell.classList.add("yg-shake"); }
  function popup(n) { if (!popEl) return; popEl.textContent = ["", "¡LÍNEA!", "¡DOBLE!", "¡TRIPLE!", "¡TETRISTO!"][n] || ""; popEl.classList.remove("yg-go"); void popEl.offsetWidth; popEl.classList.add("yg-go"); }

  function drawCell(x, y, word, ghost) {
    if (y < 0) return;
    const s = cell, gx = x*s, gy = y*s;
    if (ghost) { ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 1; ctx.strokeRect(gx+2.5, gy+2.5, s-5, s-5); return; }
    ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(gx+1, gy+1, s-2, s-2);
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.5; ctx.strokeRect(gx+1.75, gy+1.75, s-3.5, s-3.5);
    if (word) {
      ctx.save();
      ctx.beginPath(); ctx.rect(gx+2, gy+2, s-4, s-4); ctx.clip();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const base = 26; ctx.font = "800 " + base + "px Montserrat, sans-serif";
      const m = ctx.measureText(word);
      const tw = Math.max(1, m.width);
      const th = Math.max(1, (m.actualBoundingBoxAscent || base * 0.72) + (m.actualBoundingBoxDescent || base * 0.06));
      const pad = 3.5;
      ctx.translate(gx + s/2, gy + s/2);
      ctx.scale((s - pad*2) / tw, (s - pad*2) / th);
      ctx.fillText(word, 0, 0);
      ctx.restore();
    }
  }
  function drawMatrix(m, px, py, word, ghost) { for (let y=0;y<m.length;y++) for (let x=0;x<m.length;x++) if (m[y][x]) drawCell(px+x, py+y, word, ghost); }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (piece) { let gy = piece.y; while (!collide(piece.m, piece.x, gy+1)) gy++; drawMatrix(piece.m, piece.x, gy, "", true); }
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (board[y][x]) drawCell(x, y, board[y][x], false);
    if (piece) drawMatrix(piece.m, piece.x, piece.y, piece.word, false);
    if (paused) { ctx.fillStyle = "rgba(4,4,6,.7)"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = "#fff"; ctx.font = "800 22px Montserrat, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("PAUSA", canvas.width/2, canvas.height/2); }
  }
  function drawNext() {
    if (!nctx) return;
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const m = SHAPES[nextType]; if (!m) return;
    const N = m.length, u = Math.floor(nextCanvas.width/4);
    const ox = Math.floor((nextCanvas.width - N*u)/2), oy = Math.floor((nextCanvas.height - N*u)/2);
    for (let y=0;y<N;y++) for (let x=0;x<N;x++) if (m[y][x]) {
      nctx.fillStyle = "rgba(255,255,255,.10)"; nctx.fillRect(ox+x*u+1, oy+y*u+1, u-2, u-2);
      nctx.strokeStyle = "rgba(255,255,255,.8)"; nctx.lineWidth = 1.5; nctx.strokeRect(ox+x*u+1.5, oy+y*u+1.5, u-3, u-3);
    }
  }
  function drawHold() {
    if (!hctx) return;
    hctx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    const m = SHAPES[holdType]; if (!m) return;
    const N = m.length, u = Math.floor(holdCanvas.width/4);
    const ox = Math.floor((holdCanvas.width - N*u)/2), oy = Math.floor((holdCanvas.height - N*u)/2);
    const a = holdUsed ? 0.32 : 1;
    for (let y=0;y<N;y++) for (let x=0;x<N;x++) if (m[y][x]) {
      hctx.fillStyle = "rgba(255,255,255," + (0.10*a) + ")"; hctx.fillRect(ox+x*u+1, oy+y*u+1, u-2, u-2);
      hctx.strokeStyle = "rgba(255,255,255," + (0.8*a) + ")"; hctx.lineWidth = 1.5; hctx.strokeRect(ox+x*u+1.5, oy+y*u+1.5, u-3, u-3);
    }
  }
  function updateHud() { setText("yg-score", fmt.format(score)); setText("yg-level", String(level)); setText("yg-lines", String(lines)); setText("yg-best", fmt.format(best)); }
  function setText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }

  function loop(t) {
    if (!running) return;
    if (!paused && !over && piece) {
      if (!lastDrop) lastDrop = t;
      if (!hyperOn && score >= HYPER_START) { hyperOn = true; aceleraFlash(); }
      if (collide(piece.m, piece.x, piece.y + 1)) {
        if (!lockTimer) lockTimer = t;
        if (t - lockTimer >= effLockDelay()) lock();
      } else {
        lockTimer = 0; lockResets = 0;
        const di = effInterval();
        if (t - lastDrop >= di) {
          let n = 1;
          if (score >= HYPER_START) { n = Math.floor((t - lastDrop) / di); if (n < 1) n = 1; else if (n > HYPER_MAXSTEP) n = HYPER_MAXSTEP; }
          for (let i = 0; i < n && !collide(piece.m, piece.x, piece.y + 1); i++) piece.y++;
          lastDrop = t; draw();
        }
      }
    }
    raf = window.requestAnimationFrame(loop);
  }

  function startGame() {
    resetBoard(); score=0; lines=0; level=1; dropInt=800; over=false; paused=false; savedThisRun=false;
    holdType=null; holdUsed=false; lockTimer=0; lockResets=0; hyperOn=false; myRank=null; peeking=false; setRank(0);
    nextType=null; bag=[]; spawn(); updateHud(); hideScreen(); running=true; lastDrop=0;
    peekRank(0).then((d) => { if (d) { myRank = d.rank; setRank(d.rank); } });
    window.cancelAnimationFrame(raf); raf = window.requestAnimationFrame(loop); draw();
  }
  function endGame() {
    over=true; running=false; finalScore=score; window.cancelAnimationFrame(raf);
    if (score>best) { best=score; localStorage.setItem("yg_best", String(best)); }
    updateHud(); showOver(); fetchScores();
  }
  function hideScreen() { screenEl.classList.remove("yg-show"); screenEl.innerHTML = ""; }
  function showStart() {
    screenEl.innerHTML =
      '<h2>TeTristo</h2>' +
      '<div class="yg-final">¿Podés ser el N°1?</div>' +
      '<div class="yg-final" id="yg-startpos"></div>' +
      '<button class="yg-btn" id="yg-play">JUGAR</button>' +
      '<div class="yg-warn">AVISO — No apto para personas fotosensibles ni con epilepsia. El juego tiene destellos. Jugás bajo tu responsabilidad.</div>' +
      '<div class="yg-lb" id="yg-lb"></div>';
    screenEl.classList.add("yg-show");
    const pb = document.getElementById("yg-play"); if (pb) pb.onclick = startGame;
    peekRank(0).then((d) => { const e = document.getElementById("yg-startpos"); if (e && d) e.textContent = "Sos uno de " + fmt.format(d.total) + ". Arrancás último: subí al top 10."; });
  }
  function showOver() {
    screenEl.innerHTML =
      '<h2>GAME OVER</h2>' +
      '<div class="yg-final">PUNTOS: ' + fmt.format(finalScore) + '</div>' +
      '<div class="yg-form">' +
        '<input id="yg-alias" maxlength="12" placeholder="tu alias" autocomplete="off">' +
        '<button class="yg-btn" id="yg-save">GUARDAR RÉCORD</button>' +
        '<div class="yg-msg" id="yg-save-msg"></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="yg-btn" id="yg-again">DE NUEVO</button>' +
        '<button class="yg-btn yg-ghost" id="yg-quit">SALIR</button>' +
      '</div>' +
      '<div class="yg-lb" id="yg-lb"></div>';
    screenEl.classList.add("yg-show");
    document.getElementById("yg-again").onclick = startGame;
    document.getElementById("yg-quit").onclick = closeGame;
    document.getElementById("yg-save").onclick = saveScore;
  }

  async function fetchScores() {
    try { const r = await fetch("/api/scores", { headers: { accept: "application/json" } }); const d = await r.json(); renderLB(d.scores || []); }
    catch (_) { renderLB([]); }
  }
  function renderLB(scores) {
    const box = document.getElementById("yg-lb"); if (!box) return;
    if (!scores.length) { box.innerHTML = '<h3>Top 10</h3><div style="color:#6c6c72;font-size:12px">Todavía nadie. Sé el primero.</div>'; return; }
    let html = '<h3>Top 10</h3><ol>';
    for (const s of scores) { const a = String(s.alias == null ? "ANON" : s.alias).replace(/[<>&]/g, ""); html += '<li><span class="yg-a">' + a + '</span><span class="yg-s">' + fmt.format(s.score) + '</span></li>'; }
    html += "</ol>"; box.innerHTML = html;
  }
  async function saveScore() {
    if (savedThisRun) return;
    const alias = (document.getElementById("yg-alias").value || "").trim();
    const msg = document.getElementById("yg-save-msg");
    const btn = document.getElementById("yg-save"); btn.disabled = true; const lbl = btn.textContent; btn.textContent = "...";
    try {
      const r = await fetch("/api/score", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ alias, score: finalScore }) });
      const d = await r.json();
      if (r.ok) {
        savedThisRun = true; btn.textContent = "GUARDADO"; msg.className = "yg-msg ok";
        msg.textContent = "¡Puesto #" + d.rank + "!";
        renderLB(d.scores || []);
      } else { btn.disabled = false; btn.textContent = lbl; msg.className = "yg-msg err"; msg.textContent = d.message || "No se pudo guardar."; }
    } catch (_) { btn.disabled = false; btn.textContent = lbl; msg.className = "yg-msg err"; msg.textContent = "Algo se rompió. Probá de nuevo."; }
  }
  function updateLanding(wl) { const rem = document.getElementById("remaining"); if (rem && typeof wl.remaining === "number") rem.textContent = fmt.format(wl.remaining); }

  function onKey(e) {
    if (over) { if (e.key === "Escape") closeGame(); return; }
    switch (e.key) {
      case "ArrowLeft": move(-1); break;
      case "ArrowRight": move(1); break;
      case "ArrowDown": softDrop(); break;
      case "ArrowUp": case "x": case "X": rotate(); break;
      case " ": hardDrop(); break;
      case "c": case "C": case "Shift": hold(); break;
      case "p": case "P": paused = !paused; draw(); break;
      case "Escape": closeGame(); break;
      default: return;
    }
    if ([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) >= 0) e.preventDefault();
  }

  function buildOverlay() {
    overlay = document.createElement("div"); overlay.id = "yg-overlay";
    overlay.innerHTML =
      '<button class="yg-close" aria-label="Cerrar">×</button>' +
      '<div class="yg-shell" id="yg-shell">' +
        '<div class="yg-boardwrap">' +
          '<canvas id="yg-board" width="300" height="600"></canvas>' +
          '<div class="yg-pop" id="yg-pop"></div>' +
          '<div class="yg-screen" id="yg-screen"></div>' +
        '</div>' +
        '<div class="yg-side">' +
          '<div class="yg-title">TeTristo</div>' +
          '<div class="yg-stat">Puntos<b id="yg-score">0</b></div>' +
          '<div class="yg-stat">Nivel<b id="yg-level">1</b></div>' +
          '<div class="yg-stat">Líneas<b id="yg-lines">0</b></div>' +
          '<div class="yg-stat">Siguiente</div>' +
          '<canvas id="yg-next" width="96" height="96"></canvas>' +
          '<div class="yg-stat">Reserva</div>' +
          '<canvas id="yg-hold" width="96" height="96" title="Guardar en reserva"></canvas>' +
          '<div class="yg-stat">Récord<b id="yg-best">0</b></div>' +
          '<div class="yg-stat">Puesto<b id="yg-rank">—</b></div>' +
          '<div class="yg-hint">← → mover · ↑ rotar · ↓ bajar<br>espacio: caída · C: reserva · P: pausa · Esc: salir</div>' +
          '<div class="yg-mobilectrl">' +
            '<div class="yg-stick" id="yg-stick"><div class="yg-knob" id="yg-knob"></div></div>' +
            '<div class="yg-actions">' +
              '<button data-act="rot" aria-label="Rotar">⟳</button>' +
              '<button data-act="hold" aria-label="Reserva">⇄</button>' +
              '<button data-act="drop" aria-label="Caída">⤓</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    flashEl = document.createElement("div"); flashEl.id = "yg-flash";
    const fspan = document.createElement("span"); fspan.style.whiteSpace = "pre-line"; flashEl.appendChild(fspan);
    document.body.appendChild(flashEl);

    shell = overlay.querySelector("#yg-shell");
    canvas = overlay.querySelector("#yg-board"); ctx = canvas.getContext("2d"); cell = canvas.width / COLS;
    nextCanvas = overlay.querySelector("#yg-next"); nctx = nextCanvas.getContext("2d");
    holdCanvas = overlay.querySelector("#yg-hold"); hctx = holdCanvas.getContext("2d"); holdCanvas.addEventListener("click", hold);
    screenEl = overlay.querySelector("#yg-screen"); popEl = overlay.querySelector("#yg-pop");
    resetBoard();

    overlay.querySelector(".yg-close").onclick = closeGame;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeGame(); });
    overlay.querySelectorAll(".yg-actions button").forEach((b) => {
      const act = b.getAttribute("data-act");
      b.addEventListener("click", () => { if (act === "rot") rotate(); else if (act === "drop") hardDrop(); else if (act === "hold") hold(); });
    });

    // --- Joystick (mobile) ---
    const stick = overlay.querySelector("#yg-stick"), knob = overlay.querySelector("#yg-knob");
    let stActive = false, scx = 0, scy = 0, dirX = 0, dirY = 0, lastMv = 0, lastDp = 0;
    const R = 42;
    function stUpdate(t) {
      let dx = t.clientX - scx, dy = t.clientY - scy;
      const dist = Math.hypot(dx, dy), cl = Math.min(dist, R), ang = Math.atan2(dy, dx);
      const kx = Math.cos(ang) * cl, ky = Math.sin(ang) * cl;
      knob.style.transform = "translate(" + kx + "px," + ky + "px)";
      dirX = Math.max(-1, Math.min(1, dx / R)); dirY = Math.max(-1, Math.min(1, dy / R));
    }
    stick.addEventListener("touchstart", (e) => { const t = e.touches[0]; const r = stick.getBoundingClientRect(); scx = r.left + r.width/2; scy = r.top + r.height/2; stActive = true; lastMv = 0; lastDp = 0; stUpdate(t); e.preventDefault(); }, { passive: false });
    stick.addEventListener("touchmove", (e) => { if (!stActive) return; stUpdate(e.touches[0]); e.preventDefault(); }, { passive: false });
    const stEnd = () => { stActive = false; dirX = 0; dirY = 0; knob.style.transform = "translate(0,0)"; };
    stick.addEventListener("touchend", stEnd); stick.addEventListener("touchcancel", stEnd);
    setInterval(() => {
      if (!stActive || over || paused || !running) return;
      const now = performance.now();
      if (dirX <= -0.45) { if (now - lastMv > 110) { move(-1); lastMv = now; } }
      else if (dirX >= 0.45) { if (now - lastMv > 110) { move(1); lastMv = now; } }
      else lastMv = 0;
      if (dirY >= 0.55) { if (now - lastDp > 55) { softDrop(); lastDp = now; } } else lastDp = 0;
    }, 16);
  }

  function hideSite(h) {
    const m = document.querySelector("main"); if (m) m.style.display = h ? "none" : "";
    const hd = document.querySelector("header"); if (hd) hd.style.display = h ? "none" : "";
  }
  function setNoZoom(on) {
    if (!vpMeta) return;
    if (on) vpMeta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    else if (vpDefault) vpMeta.setAttribute("content", vpDefault);
  }
  function openGame() {
    if (!built) { buildOverlay(); built = true; }
    overlay.classList.add("yg-open");
    hideSite(true); setNoZoom(true);
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    over = false; running = false; resetBoard(); piece = null; draw();
    updateHud(); showStart(); fetchScores();
    try {
      if (!window.__tmusic) { window.__tmusic = new Audio("/tetristomusic.mp3"); window.__tmusic.loop = true; window.__tmusic.volume = 0.5; }
      if (window.YATH_siteMusic) window.YATH_siteMusic.suspend();
      window.__tmusic.currentTime = 0; var _p = window.__tmusic.play(); if (_p && _p.catch) _p.catch(function () {});
    } catch (_) {}
  }
  function closeGame() {
    running = false; window.cancelAnimationFrame(raf);
    if (overlay) overlay.classList.remove("yg-open");
    hideSite(false); setNoZoom(false);
    document.documentElement.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    try { if (window.__tmusic) window.__tmusic.pause(); if (window.YATH_siteMusic) window.YATH_siteMusic.resume(); } catch (_) {}
  }

  window.clickeame = openGame;
  var _nav = document.getElementById("navGame");
  if (_nav) _nav.addEventListener("click", function (e) { e.preventDefault(); openGame(); });
})();
