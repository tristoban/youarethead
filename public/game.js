(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = new Intl.NumberFormat("es-AR");

  const PHRASES = [
    "YOU ARE THE AD", "PEDÍ LA REMERA", "ANOTATE", "ES TUYA",
    "VOS QUERÉS\nLA REMERA", "NO EMPEZÓ\nEN VOS", "CLICKEAME", "A.D.",
    "FUNCIONA MEJOR\nCUANDO CREÉS\nQUE EMPEZÓ EN VOS",
  ];

  const SHAPES = {
    I: { color: "#2ee6ff", cells: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    O: { color: "#ffe94d", cells: [[1,1],[1,1]] },
    T: { color: "#a05cff", cells: [[0,1,0],[1,1,1],[0,0,0]] },
    S: { color: "#8cff3a", cells: [[0,1,1],[1,1,0],[0,0,0]] },
    Z: { color: "#ff4d4d", cells: [[1,1,0],[0,1,1],[0,0,0]] },
    J: { color: "#3a7bff", cells: [[1,0,0],[1,1,1],[0,0,0]] },
    L: { color: "#ff8a3d", cells: [[0,0,1],[1,1,1],[0,0,0]] },
  };
  const KEYS = Object.keys(SHAPES);
  const COLS = 10, ROWS = 20;

  function rot(m) {
    const N = m.length, r = [];
    for (let y = 0; y < N; y++) { r.push([]); for (let x = 0; x < N; x++) r[y].push(m[N - 1 - x][y]); }
    return r;
  }

  let built = false, overlay, flashEl, shell, canvas, ctx, nextCanvas, nctx, cell, screenEl, popEl;
  let board, piece, nextType, bag = [];
  let score = 0, lines = 0, level = 1, dropInt = 800, finalScore = 0;
  let best = Number(localStorage.getItem("yg_best") || 0);
  let raf = 0, running = false, paused = false, over = false, savedThisRun = false, lastDrop = 0;

  function resetBoard() { board = []; for (let y = 0; y < ROWS; y++) board.push(new Array(COLS).fill(0)); }
  function bagNext() {
    if (bag.length === 0) {
      bag = KEYS.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
    }
    return bag.pop();
  }
  function spawn() {
    const type = nextType || bagNext();
    nextType = bagNext();
    const def = SHAPES[type];
    piece = { type, color: def.color, m: def.cells.map((r) => r.slice()), x: Math.floor((COLS - def.cells.length) / 2), y: 0 };
    drawNext();
    if (collide(piece.m, piece.x, piece.y)) endGame();
  }
  function collide(m, px, py) {
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
      if (!m[y][x]) continue;
      const bx = px + x, by = py + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
    return false;
  }
  function merge() {
    let ko = false;
    for (let y = 0; y < piece.m.length; y++) for (let x = 0; x < piece.m.length; x++) {
      if (!piece.m[y][x]) continue;
      const by = piece.y + y, bx = piece.x + x;
      if (by < 0) { ko = true; continue; }
      board[by][bx] = piece.color;
    }
    return ko;
  }
  function clearLines() {
    let n = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every((c) => c)) { board.splice(y, 1); board.unshift(new Array(COLS).fill(0)); n++; y++; }
    }
    return n;
  }
  function lock() {
    const ko = merge();
    const n = clearLines();
    if (n > 0) onClear(n);
    if (ko) { endGame(); return; }
    spawn();
  }
  function move(dx) { if (over || paused) return; if (!collide(piece.m, piece.x + dx, piece.y)) { piece.x += dx; draw(); } }
  function rotate() {
    if (over || paused) return;
    const r = rot(piece.m);
    for (const k of [0, -1, 1, -2, 2]) { if (!collide(r, piece.x + k, piece.y)) { piece.m = r; piece.x += k; draw(); return; } }
  }
  function softDrop() {
    if (over || paused) return;
    if (!collide(piece.m, piece.x, piece.y + 1)) { piece.y++; score += 1; updateHud(); } else { lock(); }
    lastDrop = performance.now(); draw();
  }
  function hardDrop() {
    if (over || paused) return;
    let d = 0; while (!collide(piece.m, piece.x, piece.y + 1)) { piece.y++; d++; }
    score += d * 2; updateHud(); lock(); draw();
  }
  function gravity() { if (!collide(piece.m, piece.x, piece.y + 1)) piece.y++; else lock(); draw(); }

  function onClear(n) {
    const wasRecord = score > best;
    score += [0, 100, 300, 500, 800][n] * level;
    lines += n;
    level = Math.floor(lines / 10) + 1;
    dropInt = Math.max(80, 800 - (level - 1) * 70);
    updateHud();
    popup(n);
    shake();
    const record = score > best;
    if (n >= 4 || (record && !wasRecord)) barrage(record ? 4 : 3); else flashOne();
    if (record) { best = score; localStorage.setItem("yg_best", String(best)); updateHud(); }
  }

  let flashQ = [], flashing = false;
  function flashOne() { enqueue(1); }
  function barrage(k) { enqueue(k); }
  function enqueue(k) { if (reduce) return; for (let i = 0; i < k; i++) flashQ.push(PHRASES[Math.floor(Math.random() * PHRASES.length)]); if (!flashing) runFlash(); }
  function runFlash() {
    if (flashQ.length === 0) { flashing = false; return; }
    flashing = true;
    const p = flashQ.shift();
    flashEl.firstChild.textContent = p;
    flashEl.classList.toggle("yg-inv", Math.random() < 0.5);
    flashEl.classList.add("yg-on");
    setTimeout(() => { flashEl.classList.remove("yg-on"); setTimeout(runFlash, 300); }, 80);
  }

  function shake() { if (reduce || !shell) return; shell.classList.remove("yg-shake"); void shell.offsetWidth; shell.classList.add("yg-shake"); }
  function popup(n) {
    if (!popEl) return;
    popEl.textContent = ["", "¡LÍNEA!", "¡DOBLE!", "¡TRIPLE!", "¡CLICKEADA!"][n] || "";
    popEl.classList.remove("yg-go"); void popEl.offsetWidth; popEl.classList.add("yg-go");
  }

  function drawCell(x, y, color, ghost) {
    if (y < 0) return;
    const s = cell, gx = x * s, gy = y * s;
    if (ghost) { ctx.globalAlpha = 0.16; ctx.fillStyle = color; ctx.fillRect(gx + 1, gy + 1, s - 2, s - 2); ctx.globalAlpha = 1; return; }
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.fillStyle = color; ctx.fillRect(gx + 1, gy + 1, s - 2, s - 2); ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(gx + 1, gy + 1, s - 2, 3);
  }
  function drawMatrix(m, px, py, color, ghost) { for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) drawCell(px + x, py + y, color, ghost); }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (piece) { let gy = piece.y; while (!collide(piece.m, piece.x, gy + 1)) gy++; drawMatrix(piece.m, piece.x, gy, piece.color, true); }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y][x]) drawCell(x, y, board[y][x], false);
    if (piece) drawMatrix(piece.m, piece.x, piece.y, piece.color, false);
    if (paused) { ctx.fillStyle = "rgba(4,4,10,.7)"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#fff"; ctx.font = "20px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.fillText("PAUSA", canvas.width / 2, canvas.height / 2); }
  }
  function drawNext() {
    if (!nctx) return;
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const def = SHAPES[nextType]; if (!def) return;
    const m = def.cells, N = m.length, u = Math.floor(nextCanvas.width / 4);
    const ox = Math.floor((nextCanvas.width - N * u) / 2), oy = Math.floor((nextCanvas.height - N * u) / 2);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y][x]) {
      nctx.save(); nctx.shadowColor = def.color; nctx.shadowBlur = 8; nctx.fillStyle = def.color;
      nctx.fillRect(ox + x * u + 1, oy + y * u + 1, u - 2, u - 2); nctx.restore();
    }
  }
  function updateHud() {
    setText("yg-score", fmt.format(score));
    setText("yg-level", String(level));
    setText("yg-lines", String(lines));
    setText("yg-best", fmt.format(best));
  }
  function setText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }

  function loop(t) {
    if (!running) return;
    if (!paused && !over) { if (!lastDrop) lastDrop = t; if (t - lastDrop > dropInt) { gravity(); lastDrop = t; } }
    raf = window.requestAnimationFrame(loop);
  }

  function startGame() {
    resetBoard(); score = 0; lines = 0; level = 1; dropInt = 800; over = false; paused = false; savedThisRun = false;
    nextType = null; bag = []; spawn(); updateHud(); hideScreen(); running = true; lastDrop = 0;
    window.cancelAnimationFrame(raf); raf = window.requestAnimationFrame(loop); draw();
  }
  function endGame() {
    over = true; running = false; finalScore = score; window.cancelAnimationFrame(raf);
    if (score > best) { best = score; localStorage.setItem("yg_best", String(best)); }
    updateHud(); showOver(); fetchScores();
  }

  function hideScreen() { screenEl.classList.remove("yg-show"); screenEl.innerHTML = ""; }
  function showStart() {
    screenEl.innerHTML =
      '<h2>CLICKEAME</h2>' +
      '<div class="yg-final">¿podés clickearla?</div>' +
      '<button class="yg-btn yg-cyan" id="yg-play">JUGAR</button>' +
      '<div class="yg-warn">Aviso: el juego tiene destellos rápidos. Si sos sensible a las luces, mejor no juegues.</div>' +
      '<div class="yg-lb" id="yg-lb"></div>';
    screenEl.classList.add("yg-show");
    const pb = document.getElementById("yg-play"); if (pb) pb.onclick = startGame;
  }
  function showOver() {
    screenEl.innerHTML =
      '<h2>GAME OVER</h2>' +
      '<div class="yg-final">PUNTOS: ' + fmt.format(finalScore) + '</div>' +
      '<div class="yg-form">' +
        '<input id="yg-alias" maxlength="12" placeholder="tu alias" autocomplete="off">' +
        '<input id="yg-email" type="email" placeholder="tu@email.com" autocomplete="email">' +
        '<button class="yg-btn" id="yg-save">GUARDAR RÉCORD</button>' +
        '<div class="yg-msg" id="yg-save-msg"></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="yg-btn yg-cyan" id="yg-again">DE NUEVO</button>' +
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
    if (!scores.length) { box.innerHTML = '<h3>TOP 10</h3><div style="color:#6c6c80;font-size:12px">Todavía nadie. Sé el primero.</div>'; return; }
    let html = '<h3>TOP 10</h3><ol>';
    for (const s of scores) {
      const a = String(s.alias == null ? "ANON" : s.alias).replace(/[<>&]/g, "");
      html += '<li><span class="yg-a">' + a + '</span><span class="yg-s">' + fmt.format(s.score) + '</span></li>';
    }
    html += "</ol>";
    box.innerHTML = html;
  }

  async function saveScore() {
    if (savedThisRun) return;
    const alias = (document.getElementById("yg-alias").value || "").trim();
    const email = (document.getElementById("yg-email").value || "").trim();
    const msg = document.getElementById("yg-save-msg");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.className = "yg-msg err"; msg.textContent = "Poné un mail válido."; return; }
    const btn = document.getElementById("yg-save"); btn.disabled = true; const lbl = btn.textContent; btn.textContent = "...";
    try {
      const r = await fetch("/api/score", {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ alias, email, score: finalScore }),
      });
      const d = await r.json();
      if (r.ok) {
        savedThisRun = true; btn.textContent = "GUARDADO";
        msg.className = "yg-msg ok";
        let extra = "";
        if (d.wishlist && typeof d.wishlist.remaining === "number") {
          extra = d.wishlist.unlocked ? " ¡Ya salió a la venta!" : " Sumaste tu mail: faltan " + fmt.format(d.wishlist.remaining) + ".";
          updateLanding(d.wishlist);
        }
        msg.textContent = "¡Puesto #" + d.rank + "!" + extra;
        renderLB(d.scores || []);
      } else {
        btn.disabled = false; btn.textContent = lbl;
        msg.className = "yg-msg err"; msg.textContent = d.message || "No se pudo guardar.";
      }
    } catch (_) {
      btn.disabled = false; btn.textContent = lbl;
      msg.className = "yg-msg err"; msg.textContent = "Algo se rompió. Probá de nuevo.";
    }
  }
  function updateLanding(wl) {
    const rem = document.getElementById("remaining");
    if (rem && typeof wl.remaining === "number") rem.textContent = fmt.format(wl.remaining);
  }

  function onKey(e) {
    if (over) { if (e.key === "Escape") closeGame(); return; }
    switch (e.key) {
      case "ArrowLeft": move(-1); break;
      case "ArrowRight": move(1); break;
      case "ArrowDown": softDrop(); break;
      case "ArrowUp": case "x": case "X": rotate(); break;
      case " ": hardDrop(); break;
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
          '<div class="yg-title">CLICKE<br>AME</div>' +
          '<div class="yg-stat">PUNTOS<b id="yg-score">0</b></div>' +
          '<div class="yg-stat">NIVEL<b id="yg-level">1</b></div>' +
          '<div class="yg-stat">LÍNEAS<b id="yg-lines">0</b></div>' +
          '<div class="yg-stat">SIGUIENTE</div>' +
          '<canvas id="yg-next" width="96" height="96"></canvas>' +
          '<div class="yg-stat">RÉCORD<b id="yg-best">0</b></div>' +
          '<div class="yg-hint">← → mover · ↑ rotar · ↓ bajar<br>espacio: caída · P: pausa · Esc: salir</div>' +
          '<div class="yg-pad">' +
            '<button data-act="left">◀</button>' +
            '<button data-act="down">▼</button>' +
            '<button data-act="rot">⟳</button>' +
            '<button data-act="right">▶</button>' +
            '<button data-act="drop" style="grid-column:1/-1">⤓ CAÍDA</button>' +
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
    screenEl = overlay.querySelector("#yg-screen"); popEl = overlay.querySelector("#yg-pop");
    resetBoard();

    overlay.querySelector(".yg-close").onclick = closeGame;
    overlay.querySelectorAll(".yg-pad button").forEach((b) => {
      const act = b.getAttribute("data-act");
      b.addEventListener("click", () => {
        if (act === "left") move(-1); else if (act === "right") move(1);
        else if (act === "down") softDrop(); else if (act === "rot") rotate(); else if (act === "drop") hardDrop();
      });
    });
  }

  function openGame() {
    if (!built) { buildOverlay(); built = true; }
    overlay.classList.add("yg-open");
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    over = false; running = false; resetBoard(); piece = null; draw();
    updateHud(); showStart(); fetchScores();
  }
  function closeGame() {
    running = false; window.cancelAnimationFrame(raf);
    if (overlay) overlay.classList.remove("yg-open");
    document.documentElement.style.overflow = "";
    document.removeEventListener("keydown", onKey);
  }

  // ---- Easter egg: ficha flotante "clickeame" ----
  function eggSvg() {
    const t = KEYS[Math.floor(Math.random() * KEYS.length)], def = SHAPES[t], m = def.cells, N = m.length, u = 15;
    let rects = "";
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y][x]) rects += '<rect x="' + (x * u) + '" y="' + (y * u) + '" width="' + (u - 2) + '" height="' + (u - 2) + '" rx="2" fill="' + def.color + '"/>';
    return '<svg width="' + (N * u) + '" height="' + (N * u) + '" viewBox="0 0 ' + (N * u) + ' ' + (N * u) + '" style="color:' + def.color + '">' + rects + "</svg>";
  }
  function spawnEgg() {
    if (document.querySelectorAll(".yg-egg").length >= 2 || document.hidden) { scheduleEgg(); return; }
    const el = document.createElement("div"); el.className = "yg-egg";
    el.innerHTML = eggSvg() + '<span class="yg-word">clickeame</span>';
    el.style.left = (6 + Math.random() * 80) + "vw"; el.style.top = "100vh";
    document.body.appendChild(el);
    el.addEventListener("click", () => { el.remove(); openGame(); });
    const driftX = reduce ? 0 : (Math.random() * 16 - 8), rotEnd = reduce ? 0 : (Math.random() * 60 - 30);
    const frames = reduce
      ? [{ opacity: 0 }, { opacity: 0.5, offset: 0.2 }, { opacity: 0.5, offset: 0.8 }, { opacity: 0 }]
      : [{ transform: "translate(0,0) rotate(0deg)", opacity: 0 }, { opacity: 0.55, offset: 0.15 }, { opacity: 0.55, offset: 0.82 }, { transform: "translate(" + driftX + "vw,-120vh) rotate(" + rotEnd + "deg)", opacity: 0 }];
    const anim = el.animate(frames, { duration: 11000 + Math.random() * 5000, easing: "linear" });
    anim.onfinish = () => el.remove();
    scheduleEgg();
  }
  function scheduleEgg() { setTimeout(spawnEgg, 7000 + Math.random() * 9000); }

  window.clickeame = openGame;
  setTimeout(spawnEgg, 4000);
})();
