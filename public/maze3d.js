import * as THREE from "https://esm.sh/three@0.160.0";

(() => {
  "use strict";
  const canvas = document.getElementById("c");
  const miniCv = document.getElementById("mini");
  const timeEl = document.getElementById("time");
  const warnEl = document.getElementById("warn");
  const intro = document.getElementById("intro");
  const dead = document.getElementById("dead");
  if (!canvas) return;

  /* ---------- Audio ---------- */
  const music = new Audio("/mazemusicloop.mp3"); music.loop = true; music.volume = 0.5;
  const stepA = new Audio("/step1.mp3"), stepB = new Audio("/step2.mp3"), stepStop = new Audio("/stepstop.mp3"), monster = new Audio("/monsterwins.mp3");
  [stepA, stepB, stepStop].forEach((a) => { a.volume = 0.65; });
  function sfx(a) { try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }

  /* ---------- Config ---------- */
  const CELL = 4, WALL_H = 3.0, VIEW = 8, R = 0.34, EYE = 1.5;
  const MOVE = 3.4;            // velocidad del jugador
  const ENT_BASE = 1.05;       // entidad: lenta
  const ENT_RAMP = 0.018;      // se acelera de a poco con el tiempo
  const SEED = 90210;

  /* ---------- Laberinto procedural infinito (determinístico) ---------- */
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 0 N(-z) 1 E(+x) 2 S(+z) 3 W(-x)
  function hash(x, z, s) {
    let h = (x | 0) * 374761393 + (z | 0) * 668265263 + (s | 0) * 2147483647 + SEED * 69069;
    h = (h ^ (h >> 13)) >>> 0; h = (h * 1274126177) >>> 0; h = (h ^ (h >> 16)) >>> 0;
    return h / 4294967296;
  }
  function carveDir(x, z) { return Math.floor(hash(x, z, 7) * 4) & 3; }
  function wallBetween(x, z, dir) {
    if (carveDir(x, z) === dir) return false;
    const d = DIRS[dir], nx = x + d[0], nz = z + d[1], back = (dir + 2) & 3;
    if (carveDir(nx, nz) === back) return false;
    return true;
  }

  /* ---------- Three.js ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.05);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x3c3c4e, 0x0c0c14, 0.5));
  // Linterna (más fuerte y ancha)
  const torch = new THREE.SpotLight(0xfff1da, 13.0, 42, Math.PI / 4.0, 0.5, 1.05);
  camera.add(torch); camera.add(torch.target); torch.position.set(0, 0, 0); torch.target.position.set(0, -0.05, -1);
  // Halo alrededor del jugador (que se vea lo cercano)
  const glow = new THREE.PointLight(0xb8bcd0, 0.9, 10, 1.5); camera.add(glow);

  // Texturas (procedurales, reemplazables por /maze-wall.png y /maze-floor.png)
  function noiseTex(base, lines) {
    const s = 128, cv = document.createElement("canvas"); cv.width = cv.height = s;
    const x = cv.getContext("2d");
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    const img = x.getImageData(0, 0, s, s), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() * 28) | 0; d[i] += n - 14; d[i + 1] += n - 14; d[i + 2] += n - 14; }
    x.putImageData(img, 0, 0);
    if (lines) { x.strokeStyle = "rgba(0,0,0,.5)"; x.lineWidth = 3; x.strokeRect(0, 0, s, s); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  const wallTex = noiseTex("#15151a", true);
  const floorTex = noiseTex("#0c0c10", false); floorTex.repeat.set(40, 40);
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xc2c2ce, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: 0x9a9aa6 });
  new THREE.TextureLoader().load("/maze-wall.png", (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; wallMat.map = t; wallMat.color.set(0xffffff); wallMat.needsUpdate = true; }, undefined, () => {});

  const wallGeoN = new THREE.PlaneGeometry(CELL, WALL_H);
  const wallGroup = new THREE.Group(); scene.add(wallGroup);
  const FSIZE = (VIEW * 2 + 4) * CELL;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FSIZE, FSIZE), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = 0; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(FSIZE, FSIZE), new THREE.MeshLambertMaterial({ map: floorTex, color: 0x4c4c58, side: THREE.DoubleSide })); ceil.rotation.x = Math.PI / 2; ceil.position.y = WALL_H; scene.add(ceil);

  let builtCx = 9999, builtCz = 9999;
  function buildWalls(cx, cz) {
    for (let i = wallGroup.children.length - 1; i >= 0; i--) wallGroup.remove(wallGroup.children[i]);
    for (let z = cz - VIEW; z <= cz + VIEW; z++) {
      for (let x = cx - VIEW; x <= cx + VIEW; x++) {
        if (wallBetween(x, z, 0)) { const m = new THREE.Mesh(wallGeoN, wallMat); m.position.set(x * CELL + CELL / 2, WALL_H / 2, z * CELL); wallGroup.add(m); }
        if (wallBetween(x, z, 3)) { const m = new THREE.Mesh(wallGeoN, wallMat); m.position.set(x * CELL, WALL_H / 2, z * CELL + CELL / 2); m.rotation.y = Math.PI / 2; wallGroup.add(m); }
      }
    }
    builtCx = cx; builtCz = cz;
    floor.position.set(cx * CELL + CELL / 2, 0, cz * CELL + CELL / 2);
    ceil.position.set(cx * CELL + CELL / 2, WALL_H, cz * CELL + CELL / 2);
  }

  /* ---------- Entidad (placeholder, reemplazable por /maze-entity.png) ---------- */
  function entityTex() {
    const w = 128, h = 256, cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(235,235,240,.95)"); g.addColorStop(.7, "rgba(180,180,190,.55)"); g.addColorStop(1, "rgba(120,120,130,0)");
    x.fillStyle = g; x.beginPath(); x.ellipse(w / 2, h * 0.42, w * 0.32, h * 0.42, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#0a0a0e"; x.beginPath(); x.ellipse(w * 0.40, h * 0.32, 8, 14, 0, 0, 7); x.ellipse(w * 0.60, h * 0.32, 8, 14, 0, 0, 7); x.fill();
    return new THREE.CanvasTexture(cv);
  }
  const entMat = new THREE.SpriteMaterial({ map: entityTex(), transparent: true, depthWrite: false, fog: false });
  const entity = new THREE.Sprite(entMat); entity.scale.set(2.0, 3.0, 1); entity.position.y = 1.5; scene.add(entity);
  new THREE.TextureLoader().load("/enemymaze.png", (t) => { t.colorSpace = THREE.SRGBColorSpace; entMat.map = t; entMat.needsUpdate = true; }, undefined, () => {});

  /* ---------- CRT post-proceso (curva ovalada) ---------- */
  let rt = new THREE.WebGLRenderTarget(2, 2);
  const crtScene = new THREE.Scene();
  const crtCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const crtMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, time: { value: 0 }, res: { value: new THREE.Vector2(2, 2) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: [
      "varying vec2 vUv; uniform sampler2D tDiffuse; uniform float time; uniform vec2 res;",
      "void main(){",
      "  vec2 cc = vUv*2.0-1.0;",
      "  vec2 off = abs(cc.yx) / vec2(7.0, 4.0);",       // X poca curva (ovalado ancho), Y un poco más
      "  cc = cc + cc*off*off;",
      "  vec2 uv = cc*0.5+0.5;",
      "  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor=vec4(0.0,0.0,0.0,1.0); return; }",
      "  float ca = 0.0016;",
      "  float r = texture2D(tDiffuse, uv+vec2(ca,0.0)).r;",
      "  float g = texture2D(tDiffuse, uv).g;",
      "  float b = texture2D(tDiffuse, uv-vec2(ca,0.0)).b;",
      "  vec3 col = vec3(r,g,b);",
      "  col *= 0.90 + 0.10*sin(uv.y*res.y*1.4);",       // scanlines
      "  col *= 0.96 + 0.04*sin(uv.x*res.x*2.0);",       // máscara
      "  float v = uv.x*(1.0-uv.x)*uv.y*(1.0-uv.y);",
      "  col *= clamp(pow(v*16.0, 0.22), 0.0, 1.0);",    // viñeta
      "  float n = fract(sin(dot(floor(uv*res), vec2(12.9898,78.233)) + time*60.0)*43758.5453);",
      "  col += (n-0.5)*0.05;",                          // ruido
      "  col *= 0.975 + 0.025*sin(time*9.0);",           // flicker
      "  gl_FragColor = vec4(col, 1.0);",
      "}"
    ].join("\n"),
  });
  crtScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), crtMat));
  let crtOn = true;

  function resize() {
    const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
    renderer.setSize(w, h, false);
    rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
    crtMat.uniforms.res.value.set(Math.floor(w * pr), Math.floor(h * pr));
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);

  /* ---------- Estado / input ---------- */
  let px = CELL / 2, pz = CELL / 2, yaw = 0, pitch = 0;
  let ex = 0, ez = 0, estep = null;
  const keys = {};
  let running = false, alive = false, t0 = 0, elapsed = 0, last = 0, bfsTimer = 0, stepT = 0, stepToggle = false, moving = false;
  addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "KeyC") crtOn = !crtOn; });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  canvas.addEventListener("click", () => { if (alive && !running) canvas.requestPointerLock(); });
  document.addEventListener("pointerlockchange", () => { running = document.pointerLockElement === canvas; });
  document.addEventListener("mousemove", (e) => {
    if (!running) return;
    yaw -= e.movementX * 0.0024; pitch -= e.movementY * 0.0024;
    pitch = Math.max(-1.2, Math.min(1.2, pitch));
  });

  function collide() {
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    let lx = px - cx * CELL, lz = pz - cz * CELL;
    if (wallBetween(cx, cz, 3) && lx < R) lx = R;
    if (wallBetween(cx, cz, 1) && lx > CELL - R) lx = CELL - R;
    if (wallBetween(cx, cz, 0) && lz < R) lz = R;
    if (wallBetween(cx, cz, 2) && lz > CELL - R) lz = CELL - R;
    px = cx * CELL + lx; pz = cz * CELL + lz;
  }

  function bfsStep(sx, sz, tx, tz) {
    if (sx === tx && sz === tz) return null;
    const q = [[sx, sz]], seen = new Set([sx + "," + sz]), prev = new Map();
    let lim = 700, found = false;
    while (q.length && lim-- > 0) {
      const c = q.shift();
      if (c[0] === tx && c[1] === tz) { found = true; break; }
      for (let i = 0; i < 4; i++) {
        if (wallBetween(c[0], c[1], i)) continue;
        const nx = c[0] + DIRS[i][0], nz = c[1] + DIRS[i][1], k = nx + "," + nz;
        if (seen.has(k)) continue; seen.add(k); prev.set(k, c[0] + "," + c[1]); q.push([nx, nz]);
      }
    }
    if (!found) { // greedy fallback hacia el jugador
      let best = null, bd = 1e9;
      for (let i = 0; i < 4; i++) { if (wallBetween(sx, sz, i)) continue; const nx = sx + DIRS[i][0], nz = sz + DIRS[i][1]; const dd = (nx - tx) ** 2 + (nz - tz) ** 2; if (dd < bd) { bd = dd; best = [nx, nz]; } }
      return best;
    }
    let cur = tx + "," + tz, start = sx + "," + sz;
    while (prev.get(cur) && prev.get(cur) !== start) cur = prev.get(cur);
    if (prev.get(cur) === start) { const p = cur.split(","); return [parseInt(p[0], 10), parseInt(p[1], 10)]; }
    return null;
  }

  /* ---------- Minimapa (fog of war) ---------- */
  const mctx = miniCv.getContext("2d");
  const seenCells = new Set();
  function drawMini() {
    const W = miniCv.width, H = miniCv.height, cellPx = 11;
    mctx.clearRect(0, 0, W, H);
    const pcx = Math.floor(px / CELL), pcz = Math.floor(pz / CELL);
    const range = Math.ceil((W / 2) / cellPx);
    for (let z = pcz - range; z <= pcz + range; z++) for (let x = pcx - range; x <= pcx + range; x++) {
      if (!seenCells.has(x + "," + z)) continue;
      const sx = W / 2 + (x - pcx) * cellPx, sy = H / 2 + (z - pcz) * cellPx;
      mctx.fillStyle = "rgba(150,150,165,.10)"; mctx.fillRect(sx, sy, cellPx, cellPx);
      mctx.strokeStyle = "rgba(200,200,220,.55)"; mctx.lineWidth = 1.5; mctx.beginPath();
      if (wallBetween(x, z, 0)) { mctx.moveTo(sx, sy); mctx.lineTo(sx + cellPx, sy); }
      if (wallBetween(x, z, 3)) { mctx.moveTo(sx, sy); mctx.lineTo(sx, sy + cellPx); }
      if (wallBetween(x, z, 2)) { mctx.moveTo(sx, sy + cellPx); mctx.lineTo(sx + cellPx, sy + cellPx); }
      if (wallBetween(x, z, 1)) { mctx.moveTo(sx + cellPx, sy); mctx.lineTo(sx + cellPx, sy + cellPx); }
      mctx.stroke();
    }
    // entidad si está cerca
    const ecx = Math.floor(ex / CELL), ecz = Math.floor(ez / CELL);
    if (Math.abs(ecx - pcx) <= range && Math.abs(ecz - pcz) <= range) {
      mctx.fillStyle = "#d23b47"; const sx = W / 2 + (ecx - pcx + 0.5) * cellPx, sy = H / 2 + (ecz - pcz + 0.5) * cellPx;
      mctx.beginPath(); mctx.arc(sx, sy, 3.5, 0, 7); mctx.fill();
    }
    // jugador (flecha)
    mctx.save(); mctx.translate(W / 2 + cellPx / 2, H / 2 + cellPx / 2); mctx.rotate(-yaw);
    mctx.fillStyle = "#ededf0"; mctx.beginPath(); mctx.moveTo(0, -5); mctx.lineTo(4, 5); mctx.lineTo(-4, 5); mctx.closePath(); mctx.fill(); mctx.restore();
  }

  /* ---------- Muerte / score ---------- */
  async function die() {
    if (!alive) return; alive = false; running = false;
    try { music.pause(); } catch (_) {} sfx(monster);
    if (document.pointerLockElement) document.exitPointerLock();
    const sec = Math.floor(elapsed);
    document.getElementById("dscore").textContent = sec;
    dead.classList.remove("hidden");
    try {
      const me = await (await fetch("/api/hub/me", { headers: { accept: "application/json" } })).json();
      const alias = (me && me.nick) || "ANÓN";
      await fetch("/api/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: "laberinto", alias, score: sec }) });
      const rk = await (await fetch("/api/rank?game=laberinto&score=" + sec, { headers: { accept: "application/json" } })).json();
      if (rk && rk.ok) document.getElementById("drank").textContent = "Puesto #" + rk.rank + " de " + rk.total;
    } catch (_) {}
  }

  /* ---------- Loop ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (alive && running) {
      elapsed = (now - t0) / 1000;
      // mover jugador
      const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      if (f || s) {
        const sin = Math.sin(yaw), cos = Math.cos(yaw), spd = MOVE * dt;
        px += (-sin * f + cos * s) * spd; pz += (-cos * f - sin * s) * spd;
        collide();
        stepT -= dt; if (stepT <= 0) { sfx(stepToggle ? stepA : stepB); stepToggle = !stepToggle; stepT = 0.42; }
        moving = true;
      } else {
        if (moving) sfx(stepStop);
        moving = false; stepT = 0;
      }
      // entidad
      const espd = (ENT_BASE + elapsed * ENT_RAMP) * dt;
      bfsTimer -= dt;
      const ecx = Math.floor(ex / CELL), ecz = Math.floor(ez / CELL), pcx = Math.floor(px / CELL), pcz = Math.floor(pz / CELL);
      if (bfsTimer <= 0 || !estep) { estep = bfsStep(ecx, ecz, pcx, pcz); bfsTimer = 0.35; }
      if (estep) {
        const tx = estep[0] * CELL + CELL / 2, tz = estep[1] * CELL + CELL / 2;
        const dx = tx - ex, dz = tz - ez, dl = Math.hypot(dx, dz);
        if (dl < 0.12) { estep = null; } else { ex += (dx / dl) * espd; ez += (dz / dl) * espd; }
      }
      entity.position.x = ex; entity.position.z = ez;
      // proximidad
      const pd = Math.hypot(px - ex, pz - ez);
      warnEl.classList.toggle("show", pd < CELL * 1.8);
      if (pd < 1.25) { die(); }
      // descubrir minimapa
      seenCells.add(pcx + "," + pcz);
      for (let i = 0; i < 4; i++) seenCells.add((pcx + DIRS[i][0]) + "," + (pcz + DIRS[i][1]));
      timeEl.textContent = elapsed.toFixed(1);
    }
    // cámara
    camera.position.set(px, EYE, pz); camera.rotation.y = yaw; camera.rotation.x = pitch;
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    if (cx !== builtCx || cz !== builtCz) buildWalls(cx, cz);
    // render (CRT)
    crtMat.uniforms.time.value = now / 1000;
    if (crtOn) {
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(crtScene, crtCam);
    } else {
      renderer.setRenderTarget(null); renderer.render(scene, camera);
    }
    if (alive && running) drawMini();
  }

  function start() {
    seenCells.clear();
    px = CELL / 2; pz = CELL / 2; yaw = 0; pitch = 0;
    // entidad arranca a ~7 celdas
    ex = 7 * CELL + CELL / 2; ez = 6 * CELL + CELL / 2; estep = null; bfsTimer = 0;
    buildWalls(0, 0);
    alive = true; t0 = performance.now(); elapsed = 0; moving = false; stepT = 0;
    intro.classList.add("hidden"); dead.classList.add("hidden");
    try { music.currentTime = 0; music.play().catch(() => {}); } catch (_) {}
    canvas.requestPointerLock();
  }
  document.getElementById("play").onclick = start;
  document.getElementById("retry").onclick = start;

  resize();
  requestAnimationFrame(frame);
})();
