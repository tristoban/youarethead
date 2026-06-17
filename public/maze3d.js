import * as THREE from "https://esm.sh/three@0.160.0";

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const canvas = $("c");
  const miniCv = $("mini");
  const timeEl = $("time"), levelEl = $("depth");
  const proxEl = $("prox"), proxTxt = $("proxtxt");
  const flashBar = $("flashbar"), keyEl = $("keyind"), stamBar = $("stambar"), flareEl = $("flareind");
  const hidePrompt = $("hideprompt"), hideOv = $("hidev"), hideBar = $("hidebar");
  const energizerEl = $("energizer"), ezBar = $("ezbar");
  const scrapEl = $("scrapind"), canEl = $("canind"), safePrompt = $("safeprompt"), shopEl = $("shop");
  const intro = $("intro"), dead = $("dead"), deadTitle = $("deadtitle");
  const refuge = $("refuge"), rgLvl = $("rg-lvl"), rgScore = $("rg-score");
  if (!canvas) return;

  /* ---------- Audio ---------- */
  const music = new Audio("/mazemusicloop.mp3"); music.loop = true; music.volume = 0.5;
  const rainSnd = new Audio("/rain.mp3"); rainSnd.loop = true; rainSnd.volume = 0.45;
  const stepA = new Audio("/step1.mp3"), stepB = new Audio("/step2.mp3"), stepStop = new Audio("/stepstop.mp3"), monster = new Audio("/monsterwins.mp3");
  [stepA, stepB, stepStop].forEach((a) => { a.volume = 0.6; });
  function sfx(a) { try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
  let actx = null;
  function initAudio() { if (actx) return; try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }
  function thump(t, vol) { if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = "sine"; o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.12); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.22); }
  function heartbeat(vol) { if (!actx) return; const t = actx.currentTime; thump(t, vol); thump(t + 0.24, vol * 0.62); }
  function tone(freq, t0, dur, vol, type) { if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.type = type || "square"; o.frequency.setValueAtTime(freq, t0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02); }
  function powerupSfx() { if (!actx) return; const t = actx.currentTime; [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.06, 0.13, 0.16, "square")); }
  function popSfx() { if (!actx) return; const t = actx.currentTime; tone(200, t, 0.07, 0.2, "sawtooth"); tone(90, t + 0.05, 0.13, 0.2, "sawtooth"); }
  function energizerEndSfx() { if (!actx) return; const t = actx.currentTime; [659, 523, 392].forEach((f, i) => tone(f, t + i * 0.08, 0.15, 0.12, "triangle")); }

  /* ---------- Config ---------- */
  const CELL = 4, WALL_H = 3.0, VIEW = 8, R = 0.34, EYE = 1.5;
  const MOVE = 3.4, SPRINT_MULT = 1.8, STAM_DRAIN = 0.26, STAM_REGEN = 0.26; // sprint más usable como herramienta de escape
  const ENT_BASE = 1.1, ENT_RAMP = 0.010, ENT_DEPTH_BOOST = 0.30;            // antes 0.42: la curva por nivel pegaba demasiado
  const ENT_CAP = MOVE * SPRINT_MULT * 0.86;                                  // 5.26 < sprint 6.12 → SIEMPRE podés escapar esprintando
  const FLASH_FREEZE = 5, FLASH_CD_BASE = 20;
  const FLARE_MAX = 3, FLARE_LIFE = 12, FLARE_R = 4.4;
  const HIDE_MAX = 7;
  // --- Energizer (lata de Tristo): power-up estilo Pac-Man ---
  const ENERGIZER_TIME = 8, ENERGIZER_SPEED = 1.5, ENERGIZER_SLOW = 0.5, ENERGIZER_BONUS = 250;
  const HIDE_SEARCH = 2.6, EXIT_GRACE = 1.2;   // el caracol busca 2.6s y deja de campear; gracia al salir del locker
  const SEED = 90210;
  let mazeSeed = SEED, runSeed = SEED;

  /* ---------- Estado ---------- */
  let px = CELL / 2, pz = CELL / 2, yaw = 0, pitch = 0;
  const keys = {};
  let running = false, alive = false, inRefuge = false, activeTime = 0, last = 0, stepT = 0, stepToggle = false, moving = false;
  let depth = 0, hasKey = false, flashCharge = 1, freezeT = 0, flashLt = 0, hbT = 0, keyCell = [5, 0], doorCell = [9, 0];
  let stamina = 1, sprinting = false;
  let hidden = false, hideT = 0, lastSeen = [0, 0], alertT = 0;
  let flareCount = FLARE_MAX;
  let energizerT = 0, levelTime = 0, bonus = 0, graceT = 0, hideSearchT = 0, canCell = null, canTaken = false;
  // --- Zona segura + economía híbrida ---
  let scrap = 0, spent = 0, inSafe = false, shopOpen = false, nearNpc = null, nearExit = false, carryCan = false;
  let stamMax = 1, flashCdMul = 1, reveal = false, flareCapBonus = 0;
  const npcs = [];
  let safeExitCell = [0, 0];
  function curScore() { return depth * 1000 + Math.floor(activeTime) + bonus - spent; }
  function flashCd() { return (FLASH_CD_BASE + depth * 2) * flashCdMul; }
  const isTouch = matchMedia("(pointer: coarse)").matches || ("ontouchstart" in window);
  const TRAPPED = /[?&]trapped=1/.test(location.search);
  function escapeWorld() {
    alive = false; running = false; try { music.pause(); rainSnd.pause(); } catch (_) {}
    if (document.pointerLockElement) document.exitPointerLock();
    if (deadTitle) deadTitle.textContent = "ESCAPASTE";
    const ds = $("dscore"); if (ds) ds.textContent = ""; const dr = $("drank"); if (dr) dr.textContent = "Sobreviviste. Tu racha sigue en pie.";
    if (dead) dead.classList.remove("hidden");
    setTimeout(function () { try { document.body.style.transition = "opacity .7s"; document.body.style.opacity = "0"; } catch (_) {} setTimeout(function () { location.href = "/yata?escaped=1"; }, 700); }, 1500);
  }
  async function caughtWorld() {
    if (!alive) return; alive = false; running = false; try { music.pause(); rainSnd.pause(); } catch (_) {} try { sfx(monster); } catch (_) {}
    if (document.pointerLockElement) document.exitPointerLock();
    if (deadTitle) deadTitle.textContent = "TE ATRAPARON";
    const ds = $("dscore"); if (ds) ds.textContent = ""; const dr = $("drank"); if (dr) dr.textContent = "Tu racha se reinició. Volviendo al mundo…";
    if (dead) dead.classList.remove("hidden");
    try { await fetch("/api/world/fell", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); } catch (_) {}
    setTimeout(function () { location.href = "/yata?caught=1"; }, 2600);
  }
  let touchF = 0, touchS = 0, moveId = null, lookId = null, mLastX = 0, mLastY = 0, stickCX = 0, stickCY = 0;
  const tbHide = $("tb-hide");

  /* ---------- Laberinto por niveles (acotado, recursive backtracker determinístico) ---------- */
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 0 N(-z) 1 E(+x) 2 S(+z) 3 W(-x)
  let MW = 16, MH = 16, grid = new Uint8Array(MW * MH);
  function hash(x, z, s) {
    let h = (x | 0) * 374761393 + (z | 0) * 668265263 + (s | 0) * 2147483647 + mazeSeed * 69069;
    h = (h ^ (h >> 13)) >>> 0; h = (h * 1274126177) >>> 0; h = (h ^ (h >> 16)) >>> 0;
    return h / 4294967296;
  }
  function genMaze() {
    MW = MH = Math.min(25, 13 + depth * 2);              // crece por nivel, acotado
    grid = new Uint8Array(MW * MH);
    const vis = new Uint8Array(MW * MH);
    let s = (mazeSeed >>> 0) || 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const stack = [[0, 0]]; vis[0] = 1;
    while (stack.length) {
      const cur = stack[stack.length - 1], x = cur[0], z = cur[1];
      const opt = [];
      for (let i = 0; i < 4; i++) { const nx = x + DIRS[i][0], nz = z + DIRS[i][1]; if (nx >= 0 && nx < MW && nz >= 0 && nz < MH && !vis[nz * MW + nx]) opt.push(i); }
      if (!opt.length) { stack.pop(); continue; }
      const i = opt[Math.floor(rnd() * opt.length)], nx = x + DIRS[i][0], nz = z + DIRS[i][1];
      grid[z * MW + x] |= (1 << i); grid[nz * MW + nx] |= (1 << ((i + 2) & 3));
      vis[nz * MW + nx] = 1; stack.push([nx, nz]);
    }
    // algunos atajos: rompe paredes extra para que haya loops (menos pasillo único)
    const extra = Math.floor(MW * MH * 0.08);
    for (let k = 0; k < extra; k++) {
      const x = Math.floor(rnd() * MW), z = Math.floor(rnd() * MH), i = Math.floor(rnd() * 4), nx = x + DIRS[i][0], nz = z + DIRS[i][1];
      if (nx >= 0 && nx < MW && nz >= 0 && nz < MH) { grid[z * MW + x] |= (1 << i); grid[nz * MW + nx] |= (1 << ((i + 2) & 3)); }
    }
  }
  function wallBetween(x, z, dir) {
    if (x < 0 || x >= MW || z < 0 || z >= MH) return true;
    const nx = x + DIRS[dir][0], nz = z + DIRS[dir][1];
    if (nx < 0 || nx >= MW || nz < 0 || nz >= MH) return true; // borde exterior del nivel
    return !(grid[z * MW + x] & (1 << dir));
  }
  function openNeighbors(x, z) { const o = []; for (let i = 0; i < 4; i++) if (!wallBetween(x, z, i)) o.push([x + DIRS[i][0], z + DIRS[i][1]]); return o; }

  /* ---------- Three.js ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  if ("useLegacyLights" in renderer) renderer.useLegacyLights = true; // three r155+ pasó a luz física → todo negro sin esto
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.05);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  camera.rotation.order = "YXZ"; scene.add(camera);
  const ambient = new THREE.HemisphereLight(0x46465c, 0x101018, 0.66); scene.add(ambient);
  const torch = new THREE.SpotLight(0xfff1da, 15.0, 46, Math.PI / 3.8, 0.5, 1.0);
  camera.add(torch); camera.add(torch.target); torch.position.set(0, 0, 0); torch.target.position.set(0, -0.05, -1);
  const glow = new THREE.PointLight(0xc2c6da, 1.2, 12, 1.4); camera.add(glow);

  // --- Texturas procedurales: cripta / piedra antigua (reemplazables por PNG, ver hooks) ---
  function stoneTex(size, cols, rows, baseHex, mortarHex, jitter) {
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const c = cv.getContext("2d");
    c.fillStyle = mortarHex; c.fillRect(0, 0, size, size);
    const bw = size / cols, bh = size / rows, gap = Math.max(2, Math.round(size / 170));
    const base = parseInt(baseHex.slice(1), 16), BR = (base >> 16) & 255, BG = (base >> 8) & 255, BB = base & 255;
    function paint(bx, by, r, g, b) {
      c.fillStyle = "rgb(" + r + "," + g + "," + b + ")"; c.fillRect(bx + gap, by + gap, bw - 2 * gap, bh - 2 * gap);
      c.fillStyle = "rgba(255,255,255,0.07)"; c.fillRect(bx + gap, by + gap, bw - 2 * gap, gap);            // luz arriba
      c.fillStyle = "rgba(0,0,0,0.26)"; c.fillRect(bx + gap, by + bh - 2 * gap, bw - 2 * gap, gap);          // sombra abajo
    }
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) ? bw / 2 : 0;
      for (let col = -1; col <= cols; col++) {
        const bx = col * bw + off, by = row * bh, j = (Math.random() * 2 - 1) * jitter;
        const r = Math.max(0, Math.min(255, BR + j)) | 0, g = Math.max(0, Math.min(255, BG + j)) | 0, b = Math.max(0, Math.min(255, BB + j)) | 0;
        paint(bx, by, r, g, b);
        if (bx + bw > size) paint(bx - size, by, r, g, b);   // wrap horizontal → seamless
        if (bx < 0) paint(bx + size, by, r, g, b);
      }
    }
    const img = c.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() * 24 - 12) | 0; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    c.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function woodDoorTex(size) {
    const cv = document.createElement("canvas"); cv.width = cv.height = size; const c = cv.getContext("2d");
    c.fillStyle = "#241b13"; c.fillRect(0, 0, size, size);
    const planks = 4, pw = size / planks;
    for (let p = 0; p < planks; p++) {
      const sh = 56 + (Math.random() * 20 | 0);
      c.fillStyle = "rgb(" + sh + "," + ((sh * 0.72) | 0) + "," + ((sh * 0.44) | 0) + ")";
      c.fillRect(p * pw + 2, 0, pw - 4, size);
      c.strokeStyle = "rgba(0,0,0,0.18)"; c.lineWidth = 1;
      for (let k = 0; k < 7; k++) { const yy = Math.random() * size; c.beginPath(); c.moveTo(p * pw + 2, yy); c.bezierCurveTo(p * pw + pw * 0.3, yy + 7, p * pw + pw * 0.7, yy - 7, p * pw + pw - 2, yy + 3); c.stroke(); }
    }
    [size * 0.17, size * 0.73].forEach((by) => {
      c.fillStyle = "#15161a"; c.fillRect(0, by, size, size * 0.09);                                          // banda de hierro
      c.fillStyle = "#42454c"; for (let bx = size * 0.09; bx < size; bx += size * 0.2) { c.beginPath(); c.arc(bx, by + size * 0.045, size * 0.02, 0, 7); c.fill(); }  // bulones
    });
    const img = c.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() * 20 - 10) | 0; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    c.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(cv);
  }
  function hookTex(url, mat) { new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (mat.map && mat.map.repeat) t.repeat.copy(mat.map.repeat); mat.map = t; mat.needsUpdate = true; }, undefined, () => {}); }

  const wallTex = stoneTex(512, 4, 6, "#3c3c38", "#191a1c", 13);
  const floorTex = stoneTex(512, 4, 4, "#34342f", "#161618", 12); floorTex.repeat.set(22, 22);
  const ceilTex = stoneTex(512, 4, 4, "#2a2a2e", "#131315", 10); ceilTex.repeat.set(22, 22);
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xffffff, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: 0xffffff });
  const ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex, color: 0xffffff, side: THREE.DoubleSide });
  const lockerTex = woodDoorTex(512);
  hookTex("/maze-wall.png", wallMat); hookTex("/maze-floor.png", floorMat); hookTex("/maze-ceil.png", ceilMat);

  const wallGeoN = new THREE.PlaneGeometry(CELL, WALL_H);
  const FSIZE = 120;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FSIZE, FSIZE), floorMat); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(FSIZE, FSIZE), ceilMat); ceil.rotation.x = Math.PI / 2; ceil.position.y = WALL_H; scene.add(ceil);

  // Paredes del nivel completo en un solo InstancedMesh (1 draw call)
  let wallInst = null;
  const _dummy = new THREE.Object3D();
  function buildWalls() {
    if (wallInst) { scene.remove(wallInst); wallInst.dispose && wallInst.dispose(); wallInst = null; }
    const items = [];
    for (let z = 0; z <= MH; z++) for (let x = 0; x < MW; x++) if (wallBetween(x, z, 0)) items.push([x * CELL + CELL / 2, z * CELL, 0]);
    for (let x = 0; x <= MW; x++) for (let z = 0; z < MH; z++) if (wallBetween(x, z, 3)) items.push([x * CELL, z * CELL + CELL / 2, Math.PI / 2]);
    wallInst = new THREE.InstancedMesh(wallGeoN, wallMat, items.length);
    for (let i = 0; i < items.length; i++) { _dummy.position.set(items[i][0], WALL_H / 2, items[i][1]); _dummy.rotation.set(0, items[i][2], 0); _dummy.updateMatrix(); wallInst.setMatrixAt(i, _dummy.matrix); }
    wallInst.instanceMatrix.needsUpdate = true; wallInst.frustumCulled = false; scene.add(wallInst);
    floor.position.set(MW * CELL / 2, 0, MH * CELL / 2);
    ceil.position.set(MW * CELL / 2, WALL_H, MH * CELL / 2);
  }

  /* ---------- Lluvia 3D (cae en el mundo, alrededor del jugador) ---------- */
  const RAIN_N = 520, rainGeo = new THREE.BufferGeometry(), rainPos = new Float32Array(RAIN_N * 6);
  const rainDrops = [];
  const RR = VIEW * CELL * 0.7;
  for (let i = 0; i < RAIN_N; i++) rainDrops.push({ ox: (Math.random() * 2 - 1) * RR, oy: Math.random() * WALL_H, oz: (Math.random() * 2 - 1) * RR, len: 0.25 + Math.random() * 0.4, spd: 9 + Math.random() * 7 });
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0x9fb4d6, transparent: true, opacity: 0.34, fog: true });
  const rain3d = new THREE.LineSegments(rainGeo, rainMat); rain3d.frustumCulled = false; scene.add(rain3d);
  function updateRain(dt) {
    for (let i = 0; i < RAIN_N; i++) {
      const d = rainDrops[i]; d.oy -= d.spd * dt;
      if (d.oy < 0) { d.oy = WALL_H; d.ox = (Math.random() * 2 - 1) * RR; d.oz = (Math.random() * 2 - 1) * RR; }
      const k = i * 6, X = px + d.ox, Z = pz + d.oz;
      rainPos[k] = X; rainPos[k + 1] = d.oy; rainPos[k + 2] = Z;
      rainPos[k + 3] = X; rainPos[k + 4] = d.oy - d.len; rainPos[k + 5] = Z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- Entidades (sprites billboard, reemplazables por /enemymaze.png) ---------- */
  function entityTex() {
    const w = 128, h = 256, cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(235,235,240,.95)"); g.addColorStop(.7, "rgba(180,180,190,.55)"); g.addColorStop(1, "rgba(120,120,130,0)");
    x.fillStyle = g; x.beginPath(); x.ellipse(w / 2, h * 0.42, w * 0.32, h * 0.42, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#0a0a0e"; x.beginPath(); x.ellipse(w * 0.40, h * 0.32, 8, 14, 0, 0, 7); x.ellipse(w * 0.60, h * 0.32, 8, 14, 0, 0, 7); x.fill();
    return new THREE.CanvasTexture(cv);
  }
  const baseEntTex = entityTex();
  let enemyTex = null;
  const ents = [];
  function makeEntity(tint) {
    const m = new THREE.SpriteMaterial({ map: enemyTex || baseEntTex, transparent: true, depthWrite: false, fog: false });
    if (tint) m.color.setHex(tint);
    const s = new THREE.Sprite(m); s.scale.set(2.0, 3.0, 1); s.position.y = 1.5; s.visible = false; scene.add(s);
    return { sprite: s, x: 0, z: 0, step: null, timer: 0, spd: 0, hx: 0, hz: 0, patrol: null };
  }
  new THREE.TextureLoader().load("/enemymaze.png", (t) => { t.colorSpace = THREE.SRGBColorSpace; enemyTex = t; ents.forEach((e) => { e.sprite.material.map = t; e.sprite.material.needsUpdate = true; }); }, undefined, () => {});

  /* ---------- Llave + puerta + estallido del flash ---------- */
  const keyMat = new THREE.SpriteMaterial({ map: new THREE.TextureLoader().load("/key.png"), transparent: true, depthWrite: false, fog: false });
  const keyObj = new THREE.Sprite(keyMat); keyObj.scale.set(0.95, 0.95, 1); keyObj.position.y = 1.1; scene.add(keyObj);
  const keyLight = new THREE.PointLight(0xffd24a, 1.5, 10, 1.4); scene.add(keyLight);
  const doorMat = new THREE.MeshBasicMaterial({ color: 0xd23b47, fog: false, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const doorObj = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.82, WALL_H * 0.94), doorMat); doorObj.position.y = WALL_H * 0.47; scene.add(doorObj);
  const doorLight = new THREE.PointLight(0xd23b47, 1.8, 12, 1.3); scene.add(doorLight);
  const burst = new THREE.PointLight(0xffffff, 0, 70, 0.5); camera.add(burst);
  function setDoorLocked(locked) { const c = locked ? 0xd23b47 : 0x46d17f; doorMat.color.setHex(c); doorLight.color.setHex(c); }

  /* ---------- Lata Energizer de Tristo (procedural; reemplazable por /energizer.png) ---------- */
  function canTex() {
    const w = 128, h = 200, cv = document.createElement("canvas"); cv.width = w; cv.height = h; const c = cv.getContext("2d");
    const bx = 24, bw = w - 48, top = 24, bh = h - 48;
    const g = c.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, "#5a5f6b"); g.addColorStop(0.18, "#cfd4dc"); g.addColorStop(0.5, "#f4f6fa"); g.addColorStop(0.82, "#aeb4bf"); g.addColorStop(1, "#4a4f59");
    c.fillStyle = g; c.fillRect(bx, top, bw, bh);
    c.fillStyle = "#3a3f49"; c.fillRect(bx, top - 6, bw, 8); c.fillRect(bx, top + bh - 2, bw, 8);   // tapas
    c.fillStyle = "#0c7d3a"; c.fillRect(bx, top + bh * 0.30, bw, bh * 0.40);                         // banda verde (energía)
    c.fillStyle = "#0a6b32"; c.fillRect(bx, top + bh * 0.30, bw, 4);
    // rayo
    c.fillStyle = "#ffe23a"; c.beginPath();
    const mx = bx + bw / 2, my = top + bh * 0.5;
    c.moveTo(mx + 8, my - 22); c.lineTo(mx - 10, my + 2); c.lineTo(mx + 1, my + 2); c.lineTo(mx - 8, my + 22); c.lineTo(mx + 12, my - 6); c.lineTo(mx + 1, my - 6); c.closePath(); c.fill();
    // texto TRISTO
    c.fillStyle = "#f4f6fa"; c.font = "800 15px Montserrat, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("TRISTO", mx, top + bh * 0.16);
    c.fillStyle = "#d8ffe6"; c.font = "800 9px Montserrat, sans-serif"; c.fillText("ENERGIZER", mx, top + bh * 0.85);
    c.strokeStyle = "rgba(255,255,255,.5)"; c.lineWidth = 2; c.strokeRect(bx, top, bw, bh);
    return new THREE.CanvasTexture(cv);
  }
  const canMat = new THREE.SpriteMaterial({ map: canTex(), transparent: true, depthWrite: false, fog: false });
  const canObj = new THREE.Sprite(canMat); canObj.scale.set(0.95, 1.5, 1); canObj.position.y = 1.0; canObj.visible = false; scene.add(canObj);
  const canLight = new THREE.PointLight(0x4dff86, 0, 9, 1.4); scene.add(canLight);
  new THREE.TextureLoader().load("/energizer.png", (t) => { t.colorSpace = THREE.SRGBColorSpace; canMat.map = t; canMat.needsUpdate = true; }, undefined, () => {});
  function placeEnergizer() {
    canTaken = false;
    let cx = 1 + Math.floor(hash(70, 71, 5) * (MW - 2));
    let cz = 1 + Math.floor(hash(72, 73, 5) * (MH - 2));
    if (cx + cz < Math.floor((MW + MH) * 0.35)) { cx = Math.max(cx, Math.floor(MW * 0.55)); cz = Math.max(cz, Math.floor(MH * 0.55)); } // lejos del spawn
    cx = Math.max(1, Math.min(MW - 2, cx)); cz = Math.max(1, Math.min(MH - 2, cz));
    canCell = [cx, cz];
    canObj.position.set(cx * CELL + CELL / 2, 1.0, cz * CELL + CELL / 2);
    canLight.position.set(cx * CELL + CELL / 2, 1.2, cz * CELL + CELL / 2);
    canObj.visible = true; canLight.intensity = 1.2;
  }

  /* ---------- Zona segura: NPCs vendedores + sala 3D ---------- */
  function npcTex(kind) {
    const w = 128, h = 256, cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d");
    const accent = kind === "latas" ? "#4dff86" : kind === "bengalas" ? "#ffb866" : "#6b8cff";
    const g = x.createLinearGradient(0, h * 0.2, 0, h); g.addColorStop(0, "rgba(60,62,72,.95)"); g.addColorStop(1, "rgba(20,21,26,.92)");
    x.fillStyle = g; x.beginPath(); x.moveTo(w * 0.5, h * 0.16); x.lineTo(w * 0.84, h * 0.5); x.lineTo(w * 0.78, h); x.lineTo(w * 0.22, h); x.lineTo(w * 0.16, h * 0.5); x.closePath(); x.fill();
    x.fillStyle = "#26272e"; x.beginPath(); x.ellipse(w * 0.5, h * 0.2, w * 0.2, h * 0.13, 0, 0, 7); x.fill();
    x.fillStyle = "#0a0a0e"; x.beginPath(); x.ellipse(w * 0.5, h * 0.22, w * 0.12, h * 0.09, 0, 0, 7); x.fill();
    x.fillStyle = accent; x.beginPath(); x.ellipse(w * 0.44, h * 0.22, 4, 6, 0, 0, 7); x.ellipse(w * 0.56, h * 0.22, 4, 6, 0, 0, 7); x.fill();
    x.fillStyle = accent; x.globalAlpha = 0.85; x.fillRect(w * 0.34, h * 0.46, w * 0.32, h * 0.05); x.globalAlpha = 1;
    return new THREE.CanvasTexture(cv);
  }
  const NPC_DEF = [
    { kind: "latas", name: "EL REPOSITOR", png: "/npc_latas.png" },
    { kind: "bengalas", name: "LA FAROLERA", png: "/npc_bengalas.png" },
    { kind: "flash", name: "EL TÉCNICO", png: "/npc_flash.png" },
  ];
  NPC_DEF.forEach((d) => {
    const m = new THREE.SpriteMaterial({ map: npcTex(d.kind), transparent: true, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m); s.scale.set(1.7, 2.6, 1); s.position.y = 1.3; s.visible = false; scene.add(s);
    const npc = { sprite: s, mat: m, kind: d.kind, name: d.name, cx: 0, cz: 0 };
    new THREE.TextureLoader().load(d.png, (t) => { t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.needsUpdate = true; }, undefined, () => {});
    npcs.push(npc);
  });
  function buildSafeRoom() {
    MW = 9; MH = 6; grid = new Uint8Array(MW * MH);
    for (let z = 0; z < MH; z++) for (let xx = 0; xx < MW; xx++) for (let i = 0; i < 4; i++) { const nx = xx + DIRS[i][0], nz = z + DIRS[i][1]; if (nx >= 0 && nx < MW && nz >= 0 && nz < MH) grid[z * MW + xx] |= (1 << i); }
    buildWalls();
    ambient.intensity = 0.85; torch.intensity = 13; glow.intensity = 1.4;
    const spots = [[2, 1], [4, 1], [6, 1]];
    npcs.forEach((n, i) => { const sp = spots[i] || [4, 1]; n.cx = sp[0]; n.cz = sp[1]; n.sprite.position.set(sp[0] * CELL + CELL / 2, 1.3, sp[1] * CELL + CELL / 2); n.sprite.visible = true; });
    safeExitCell = [MW - 1, MH - 1];
    doorObj.visible = true; setDoorLocked(false);
    doorObj.position.set(safeExitCell[0] * CELL + CELL / 2, WALL_H * 0.47, safeExitCell[1] * CELL + CELL / 2);
    doorLight.position.set(safeExitCell[0] * CELL + CELL / 2, 1.6, safeExitCell[1] * CELL + CELL / 2); doorLight.visible = true;
  }
  function enterSafe() {
    if (TRAPPED && depth >= 1) { escapeWorld(); return; }
    inSafe = true; inRefuge = false; hasKey = false; hidden = false; energizerT = 0; shopOpen = false; nearNpc = null; nearExit = false;
    scrap += 10 + depth * 5;
    ents.forEach((e) => { e.sprite.visible = false; });
    keyObj.visible = false; keyLight.visible = false; canObj.visible = false; canLight.intensity = 0;
    resetConsumables();
    buildSafeRoom();
    px = 1 * CELL + CELL / 2; pz = (MH - 1) * CELL + CELL / 2; yaw = -0.6; pitch = 0;
    if (proxEl) proxEl.style.opacity = "0"; if (hideOv) hideOv.style.opacity = "0";
    if (refuge) refuge.classList.add("hidden");
    sfx(stepStop);
    if (!isTouch) canvas.requestPointerLock();
  }
  function npcAt() { for (const n of npcs) if (Math.hypot(px - (n.cx * CELL + CELL / 2), pz - (n.cz * CELL + CELL / 2)) < 1.7) return n; return null; }
  function safeFrame(dt) {
    let mv = false;
    let f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + touchF;
    let s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touchS;
    f = Math.max(-1, Math.min(1, f)); s = Math.max(-1, Math.min(1, s));
    if (f || s) {
      const sin = Math.sin(yaw), cos = Math.cos(yaw), spd = MOVE * dt;
      px += (-sin * f + cos * s) * spd; pz += (-cos * f - sin * s) * spd; collide();
      stepT -= dt; if (stepT <= 0) { sfx(stepToggle ? stepA : stepB); stepToggle = !stepToggle; stepT = 0.45; }
      mv = true;
    } else if (moving) sfx(stepStop);
    moving = mv;
    nearNpc = npcAt();
    nearExit = Math.hypot(px - (safeExitCell[0] * CELL + CELL / 2), pz - (safeExitCell[1] * CELL + CELL / 2)) < 1.7;
    if (safePrompt) { let txt = ""; if (nearNpc) txt = "E · comprar — " + nearNpc.name; else if (nearExit) txt = "E · seguir / salir"; safePrompt.textContent = txt; safePrompt.style.opacity = txt ? "1" : "0"; }
    if (scrapEl) scrapEl.textContent = "CHATARRA " + scrap;
  }
  /* ---------- Tienda ---------- */
  const SHOP = {
    latas: [{ id: "can", label: "Lata Energizer para llevar (Q)", cur: "scrap", price: 40 }],
    bengalas: [{ id: "flare2", label: "+2 bengalas", cur: "scrap", price: 15 }, { id: "flaremax", label: "+1 al máximo de bengalas", cur: "scrap", price: 35 }],
    flash: [{ id: "recharge", label: "Recargar flash ahora", cur: "scrap", price: 10 }, { id: "air", label: "Aire máximo +25%", cur: "score", price: 250 }, { id: "fastflash", label: "Flash 20% más rápido", cur: "score", price: 250 }, { id: "reveal", label: "Revelar la llave en el mapa", cur: "score", price: 400 }],
  };
  function renderShop(npc) {
    const wrap = $("shop-items"); if (!wrap) return;
    if ($("shop-name")) $("shop-name").textContent = npc.name;
    if ($("shop-scrap")) $("shop-scrap").textContent = String(scrap);
    if ($("shop-score")) $("shop-score").textContent = String(curScore());
    const items = SHOP[npc.kind] || [];
    wrap.innerHTML = items.map((it) => {
      const owned = (it.id === "reveal" && reveal) || (it.id === "can" && carryCan);
      const ok = !owned && (it.cur === "scrap" ? scrap >= it.price : curScore() >= it.price);
      const tag = it.cur === "scrap" ? (it.price + " chatarra") : (it.price + " pts");
      return '<button class="shop-it" data-id="' + it.id + '"' + (ok ? "" : " disabled") + '><span>' + it.label + '</span><b>' + (owned ? "✓ ya lo tenés" : tag) + '</b></button>';
    }).join("");
    wrap.querySelectorAll(".shop-it").forEach((b) => { b.onclick = () => buyItem(npc, b.getAttribute("data-id")); });
  }
  function buyItem(npc, id) {
    const it = (SHOP[npc.kind] || []).find((x) => x.id === id); if (!it) return;
    if ((id === "reveal" && reveal) || (id === "can" && carryCan)) return;
    if (it.cur === "scrap") { if (scrap < it.price) return; scrap -= it.price; } else { if (curScore() < it.price) return; spent += it.price; }
    if (id === "can") carryCan = true;
    else if (id === "flare2") flareCount += 2;
    else if (id === "flaremax") { flareCapBonus++; flareCount++; }
    else if (id === "recharge") flashCharge = 1;
    else if (id === "air") stamMax += 0.25;
    else if (id === "fastflash") flashCdMul *= 0.8;
    else if (id === "reveal") reveal = true;
    powerupSfx(); renderShop(npc);
  }
  function openShop(npc) { shopOpen = true; if (document.pointerLockElement) document.exitPointerLock(); renderShop(npc); if (shopEl) shopEl.classList.remove("hidden"); }
  function closeShop() { shopOpen = false; if (shopEl) shopEl.classList.add("hidden"); if (!isTouch && inSafe) canvas.requestPointerLock(); }
  function openExitPanel() {
    shopOpen = true; inRefuge = true; if (document.pointerLockElement) document.exitPointerLock();
    if (rgLvl) rgLvl.textContent = String(depth + 1);
    if (rgScore) rgScore.textContent = String(curScore());
    if (refuge) refuge.classList.remove("hidden");
    sfx(stepStop);
  }

  /* ---------- Lockers (escondites) ---------- */
  const lockerSide = new THREE.MeshLambertMaterial({ map: lockerTex, color: 0xffffff });
  const lockerDark = new THREE.MeshLambertMaterial({ color: 0x241b13 });
  const lockerMats = [lockerSide, lockerSide, lockerDark, lockerDark, lockerSide, lockerSide]; // +x -x +y(tapa) -y(base) +z -z
  const lockerGeo = new THREE.BoxGeometry(CELL * 0.5, WALL_H * 0.86, CELL * 0.5);
  hookTex("/maze-locker.png", lockerSide);
  const lockers = [];
  function clearLockers() { lockers.forEach((l) => scene.remove(l.mesh)); lockers.length = 0; }
  function placeLockers() {
    clearLockers();
    const n = 2 + Math.min(2, depth);
    for (let i = 0; i < n; i++) {
      const cx = 1 + Math.floor(hash(40 + i, 41 + i, 3) * (MW - 2));
      const cz = 1 + Math.floor(hash(42 + i, 43 + i, 3) * (MH - 2));
      const m = new THREE.Mesh(lockerGeo, lockerMats); m.position.set(cx * CELL + CELL / 2, WALL_H * 0.43, cz * CELL + CELL / 2); scene.add(m);
      lockers.push({ mesh: m, cx, cz });
    }
  }
  function nearLocker() { for (const l of lockers) if (Math.hypot(px - (l.cx * CELL + CELL / 2), pz - (l.cz * CELL + CELL / 2)) < 1.5) return l; return null; }

  /* ---------- Bengalas (luz = seguridad) ---------- */
  const flarePool = [];
  for (let i = 0; i < FLARE_MAX; i++) {
    const lt = new THREE.PointLight(0xffa64d, 0, FLARE_R * 2.4, 1.2); scene.add(lt);
    const mk = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb866, fog: false })); mk.visible = false; scene.add(mk);
    flarePool.push({ light: lt, mark: mk, x: 0, z: 0, t: 0, on: false });
  }
  function dropFlare() {
    if (flareCount <= 0) return;
    const f = flarePool.find((f) => !f.on); if (!f) return;
    f.on = true; f.t = FLARE_LIFE; f.x = px; f.z = pz;
    f.light.position.set(px, 1.0, pz); f.light.intensity = 2.4;
    f.mark.position.set(px, 0.2, pz); f.mark.visible = true;
    flareCount--; sfx(stepStop);
  }
  function nearFlare(x, z) { for (const f of flarePool) if (f.on && Math.hypot(x - f.x, z - f.z) < FLARE_R) return true; return false; }
  function updateFlares(dt) { for (const f of flarePool) { if (!f.on) continue; f.t -= dt; if (f.t <= 0) { f.on = false; f.light.intensity = 0; f.mark.visible = false; } else { f.light.intensity = Math.min(2.6, 0.6 + f.t * 0.9); } } }

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
      "  vec2 off = abs(cc.yx) / vec2(7.0, 4.0);",
      "  cc = cc + cc*off*off;",
      "  vec2 uv = cc*0.5+0.5;",
      "  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor=vec4(0.0,0.0,0.0,1.0); return; }",
      "  float ca = 0.0016;",
      "  float r = texture2D(tDiffuse, uv+vec2(ca,0.0)).r;",
      "  float g = texture2D(tDiffuse, uv).g;",
      "  float b = texture2D(tDiffuse, uv-vec2(ca,0.0)).b;",
      "  vec3 col = vec3(r,g,b);",
      "  col *= 0.90 + 0.10*sin(uv.y*res.y*1.4);",
      "  col *= 0.96 + 0.04*sin(uv.x*res.x*2.0);",
      "  float v = uv.x*(1.0-uv.x)*uv.y*(1.0-uv.y);",
      "  col *= clamp(pow(v*16.0, 0.22), 0.0, 1.0);",
      "  float n = fract(sin(dot(floor(uv*res), vec2(12.9898,78.233)) + time*60.0)*43758.5453);",
      "  col += (n-0.5)*0.05;",
      "  col *= 0.975 + 0.025*sin(time*9.0);",
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

  /* ---------- Input ---------- */
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "KeyC") crtOn = !crtOn;
    if (!alive || !running || inRefuge) return;
    if (e.code === "Space") { e.preventDefault(); if (flashCharge >= 1 && !hidden) { freezeT = FLASH_FREEZE; flashLt = 1.6; flashCharge = 0; } }
    if (e.code === "KeyF") { if (!hidden) dropFlare(); }
    if (e.code === "KeyE") { if (inSafe) { if (nearNpc) openShop(nearNpc); else if (nearExit) openExitPanel(); } else if (hidden) exitHide(false); else if (nearLocker()) enterHide(); }
    if (e.code === "KeyQ") { if (!inSafe && !hidden && carryCan && energizerT <= 0) { carryCan = false; energizerT = ENERGIZER_TIME; ents.forEach((e2) => { e2.patrol = null; e2.step = null; }); powerupSfx(); } }
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  canvas.addEventListener("click", () => { if (!isTouch && alive && !running && !inRefuge) canvas.requestPointerLock(); });
  document.addEventListener("pointerlockchange", () => { running = document.pointerLockElement === canvas; });
  document.addEventListener("mousemove", (e) => {
    if (!running) return;
    const mx = Math.max(-120, Math.min(120, e.movementX || 0)), my = Math.max(-120, Math.min(120, e.movementY || 0)); // clamp: evita giros bruscos por deltas espurios del pointer-lock
    yaw -= mx * 0.0024; pitch -= my * 0.0024;
    pitch = Math.max(-1.2, Math.min(1.2, pitch));
  });

  if (isTouch) {
    const gameEl = document.getElementById("game"); if (gameEl) gameEl.classList.add("touch");
    const stick = $("stick"), nub = $("sticknub"), look = $("lookzone");
    function stickReset() { touchF = 0; touchS = 0; if (nub) nub.style.transform = "translate(-50%,-50%)"; moveId = null; }
    if (stick) stick.addEventListener("touchstart", (e) => { e.preventDefault(); const t = e.changedTouches[0]; moveId = t.identifier; const r = stick.getBoundingClientRect(); stickCX = r.left + r.width / 2; stickCY = r.top + r.height / 2; }, { passive: false });
    if (look) look.addEventListener("touchstart", (e) => { if (lookId !== null) return; const t = e.changedTouches[0]; lookId = t.identifier; mLastX = t.clientX; mLastY = t.clientY; }, { passive: false });
    window.addEventListener("touchmove", (e) => {
      let handled = false;
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          handled = true; const R = 52, dx = t.clientX - stickCX, dy = t.clientY - stickCY;
          let nx = dx / R, ny = dy / R; const m = Math.hypot(nx, ny); if (m > 1) { nx /= m; ny /= m; }
          touchS = Math.abs(nx) < 0.16 ? 0 : nx; touchF = Math.abs(ny) < 0.16 ? 0 : -ny;
          if (nub) nub.style.transform = "translate(calc(-50% + " + (nx * 34).toFixed(1) + "px), calc(-50% + " + (ny * 34).toFixed(1) + "px))";
        } else if (t.identifier === lookId) {
          handled = true; const dx = Math.max(-90, Math.min(90, t.clientX - mLastX)), dy = Math.max(-90, Math.min(90, t.clientY - mLastY));
          yaw -= dx * 0.005; pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * 0.005));
          mLastX = t.clientX; mLastY = t.clientY;
        }
      }
      if (handled) e.preventDefault();
    }, { passive: false });
    function endTouch(e) { for (const t of e.changedTouches) { if (t.identifier === moveId) stickReset(); else if (t.identifier === lookId) lookId = null; } }
    window.addEventListener("touchend", endTouch); window.addEventListener("touchcancel", endTouch);
    function tbtn(id, fn) { const b = $(id); if (b) b.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); if (alive && running && !inRefuge) fn(); }, { passive: false }); }
    tbtn("tb-flash", () => { if (flashCharge >= 1 && !hidden) { freezeT = FLASH_FREEZE; flashLt = 1.6; flashCharge = 0; } });
    tbtn("tb-flare", () => { if (!hidden) dropFlare(); });
    tbtn("tb-hide", () => { if (inSafe) { if (nearNpc) openShop(nearNpc); else if (nearExit) openExitPanel(); } else if (hidden) exitHide(false); else if (nearLocker()) enterHide(); });
  }

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
    let lim = 900, found = false;
    while (q.length && lim-- > 0) {
      const c = q.shift();
      if (c[0] === tx && c[1] === tz) { found = true; break; }
      for (let i = 0; i < 4; i++) {
        if (wallBetween(c[0], c[1], i)) continue;
        const nx = c[0] + DIRS[i][0], nz = c[1] + DIRS[i][1], k = nx + "," + nz;
        if (seen.has(k)) continue; seen.add(k); prev.set(k, c[0] + "," + c[1]); q.push([nx, nz]);
      }
    }
    if (!found) {
      let best = null, bd = 1e9;
      for (let i = 0; i < 4; i++) { if (wallBetween(sx, sz, i)) continue; const nx = sx + DIRS[i][0], nz = sz + DIRS[i][1]; const dd = (nx - tx) ** 2 + (nz - tz) ** 2; if (dd < bd) { bd = dd; best = [nx, nz]; } }
      return best;
    }
    let cur = tx + "," + tz; const startK = sx + "," + sz;
    while (prev.get(cur) && prev.get(cur) !== startK) cur = prev.get(cur);
    if (prev.get(cur) === startK) { const p = cur.split(","); return [parseInt(p[0], 10), parseInt(p[1], 10)]; }
    return null;
  }

  /* ---------- Objetivos: llave (interior) + puerta/refugio (esquina opuesta) ---------- */
  function placeObjectives() {
    doorCell = [MW - 1, MH - 1];
    let kx = Math.floor((0.35 + hash(11, 11, 1) * 0.45) * MW);
    let kz = Math.floor((0.35 + hash(12, 12, 1) * 0.45) * MH);
    kx = Math.max(1, Math.min(MW - 2, kx)); kz = Math.max(1, Math.min(MH - 2, kz));
    keyCell = [kx, kz];
    keyObj.visible = true; keyLight.visible = true;
    keyObj.position.set(keyCell[0] * CELL + CELL / 2, 1.1, keyCell[1] * CELL + CELL / 2);
    keyLight.position.set(keyCell[0] * CELL + CELL / 2, 1.4, keyCell[1] * CELL + CELL / 2);
    doorObj.position.set(doorCell[0] * CELL + CELL / 2, WALL_H * 0.47, doorCell[1] * CELL + CELL / 2);
    doorLight.position.set(doorCell[0] * CELL + CELL / 2, 1.6, doorCell[1] * CELL + CELL / 2);
    setDoorLocked(true);
  }
  function applyLevelLights() {
    ambient.intensity = Math.max(0.40, 0.66 - depth * 0.03);
    torch.intensity = Math.max(9, 15 - depth * 0.7);
    glow.intensity = Math.max(0.7, 1.2 - depth * 0.06);
  }

  /* ---------- Esconderse ---------- */
  function enterHide() { hidden = true; hideT = 0; hideSearchT = HIDE_SEARCH; ents.forEach((e) => { e.patrol = null; e.step = null; }); lastSeen = [Math.floor(px / CELL), Math.floor(pz / CELL)]; if (hideOv) hideOv.style.opacity = "1"; sfx(stepStop); }
  function exitHide(forced) { hidden = false; hideT = 0; graceT = EXIT_GRACE; if (hideOv) hideOv.style.opacity = "0"; if (forced) alertT = 2; }
  // Celda transitable lejana (para que el caracol patrulle lejos del locker / huya en Energizer)
  function farCell(fx, fz) { let bx = fx, bz = fz, bd = -1; for (let k = 0; k < 8; k++) { const cx = Math.floor(Math.random() * MW), cz = Math.floor(Math.random() * MH); const d = (cx - fx) ** 2 + (cz - fz) ** 2; if (d > bd) { bd = d; bx = cx; bz = cz; } } return [bx, bz]; }
  function entTarget(e) {
    const ecx = Math.floor(e.x / CELL), ecz = Math.floor(e.z / CELL);
    if (energizerT > 0 && !hidden) { // Pac-Man: el caracol HUYE del jugador
      if (!e.patrol || (e.patrol[0] === ecx && e.patrol[1] === ecz)) e.patrol = farCell(Math.floor(px / CELL), Math.floor(pz / CELL));
      return e.patrol;
    }
    if (!hidden) { e.patrol = null; return [Math.floor(px / CELL), Math.floor(pz / CELL)]; }
    if (hideSearchT > 0) return lastSeen;                 // te busca un rato en tu última posición
    if (!e.patrol || (e.patrol[0] === ecx && e.patrol[1] === ecz)) e.patrol = farCell(lastSeen[0], lastSeen[1]); // se rinde y se aleja del locker
    return e.patrol;
  }

  /* ---------- Refugio + niveles ---------- */
  function spawnEntities() {
    const need = depth >= 3 ? 2 : 1;   // antes depth>=2 (nivel 3): el 2º caracol llegaba justo cuando se volvía imposible
    while (ents.length < need) ents.push(makeEntity(0xff8a8a));
    const spots = [[MW - 2, MH - 2], [MW - 2, 1]];
    ents.forEach((e, i) => { e.sprite.visible = i < need; e.step = null; e.timer = 0; e.patrol = null; const sp = spots[i] || [MW - 2, MH - 2]; e.x = sp[0] * CELL + CELL / 2; e.z = sp[1] * CELL + CELL / 2; e.hx = e.x; e.hz = e.z; });
  }
  function resetConsumables() { flashCharge = 1; stamina = stamMax; flareCount = Math.max(flareCount, FLARE_MAX + flareCapBonus); flarePool.forEach((f) => { f.on = false; f.light.intensity = 0; f.mark.visible = false; }); }
  function enterRefuge() {
    inRefuge = true; hasKey = false;
    if (document.pointerLockElement) document.exitPointerLock();
    resetConsumables();
    ents.forEach((e) => { e.sprite.visible = false; });
    if (proxEl) proxEl.style.opacity = "0";
    if (rgLvl) rgLvl.textContent = String(depth + 1);
    if (rgScore) rgScore.textContent = String(depth * 1000 + Math.floor(activeTime) + bonus);
    if (refuge) refuge.classList.remove("hidden");
    sfx(stepStop);
  }
  function nextLevel() {
    depth++; mazeSeed = runSeed + depth * 7919;
    px = CELL / 2; pz = CELL / 2; yaw = 0; pitch = 0;
    hasKey = false; hidden = false; hideT = 0; alertT = 0;
    energizerT = 0; levelTime = 0; graceT = 0; hideSearchT = 0;
    resetConsumables();
    genMaze(); buildWalls(); placeObjectives(); placeLockers(); placeEnergizer(); applyLevelLights(); spawnEntities();
    if (refuge) refuge.classList.add("hidden");
    if (hideOv) hideOv.style.opacity = "0";
    inRefuge = false; inSafe = false; shopOpen = false; nearNpc = null; nearExit = false;
    npcs.forEach((n) => { n.sprite.visible = false; });
    if (shopEl) shopEl.classList.add("hidden"); if (safePrompt) safePrompt.style.opacity = "0";
    if (!isTouch) canvas.requestPointerLock();
  }
  function finishRun() { if (refuge) refuge.classList.add("hidden"); inRefuge = false; inSafe = false; shopOpen = false; npcs.forEach((n) => { n.sprite.visible = false; }); submitScore("SALISTE CON VIDA"); }

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
    // puerta (si fue vista) en verde si tenés la llave
    if (seenCells.has(doorCell[0] + "," + doorCell[1])) { const dx = doorCell[0], dz = doorCell[1]; if (Math.abs(dx - pcx) <= range && Math.abs(dz - pcz) <= range) { mctx.fillStyle = hasKey ? "#46d17f" : "#d23b47"; const sx = W / 2 + (dx - pcx + 0.5) * cellPx, sy = H / 2 + (dz - pcz + 0.5) * cellPx; mctx.fillRect(sx - 3, sy - 3, 6, 6); } }
    // perk "revelar llave": muestra la llave en el mapa aunque no la hayas visto
    if (reveal && !hasKey) { const kx = keyCell[0], kz = keyCell[1]; if (Math.abs(kx - pcx) <= range && Math.abs(kz - pcz) <= range) { mctx.fillStyle = "#ffd24a"; const sx = W / 2 + (kx - pcx + 0.5) * cellPx, sy = H / 2 + (kz - pcz + 0.5) * cellPx; mctx.beginPath(); mctx.arc(sx, sy, 3, 0, 7); mctx.fill(); } }
    // bengalas activas (naranja)
    for (const f of flarePool) { if (!f.on) continue; const fx = Math.floor(f.x / CELL), fz = Math.floor(f.z / CELL); if (Math.abs(fx - pcx) <= range && Math.abs(fz - pcz) <= range) { mctx.fillStyle = "#ffb866"; const sx = W / 2 + (fx - pcx + 0.5) * cellPx, sy = H / 2 + (fz - pcz + 0.5) * cellPx; mctx.beginPath(); mctx.arc(sx, sy, 2.6, 0, 7); mctx.fill(); } }
    // lata Energizer (verde) si fue vista y no recogida
    if (!canTaken && canCell && seenCells.has(canCell[0] + "," + canCell[1])) { const cx2 = canCell[0], cz2 = canCell[1]; if (Math.abs(cx2 - pcx) <= range && Math.abs(cz2 - pcz) <= range) { mctx.fillStyle = "#4dff86"; const sx = W / 2 + (cx2 - pcx + 0.5) * cellPx, sy = H / 2 + (cz2 - pcz + 0.5) * cellPx; mctx.beginPath(); mctx.arc(sx, sy, 3, 0, 7); mctx.fill(); } }
    // entidades (rojo)
    for (const e of ents) { if (!e.sprite.visible) continue; const ecx = Math.floor(e.x / CELL), ecz = Math.floor(e.z / CELL); if (Math.abs(ecx - pcx) <= range && Math.abs(ecz - pcz) <= range) { mctx.fillStyle = "#d23b47"; const sx = W / 2 + (ecx - pcx + 0.5) * cellPx, sy = H / 2 + (ecz - pcz + 0.5) * cellPx; mctx.beginPath(); mctx.arc(sx, sy, 3.5, 0, 7); mctx.fill(); } }
    // jugador (flecha)
    mctx.save(); mctx.translate(W / 2 + cellPx / 2, H / 2 + cellPx / 2); mctx.rotate(-yaw);
    mctx.fillStyle = "#ededf0"; mctx.beginPath(); mctx.moveTo(0, -5); mctx.lineTo(4, 5); mctx.lineTo(-4, 5); mctx.closePath(); mctx.fill(); mctx.restore();
  }

  /* ---------- Score ---------- */
  async function submitScore(title) {
    if (!alive) return; alive = false; running = false;
    try { music.pause(); rainSnd.pause(); } catch (_) {}
    if (title !== "SALISTE CON VIDA") sfx(monster);
    if (proxEl) proxEl.style.opacity = "0";
    if (document.pointerLockElement) document.exitPointerLock();
    const sc = depth * 1000 + Math.floor(activeTime) + bonus;
    if (deadTitle) deadTitle.textContent = title;
    $("dscore").textContent = sc;
    dead.classList.remove("hidden");
    try {
      const me = await (await fetch("/api/hub/me", { headers: { accept: "application/json" } })).json();
      const alias = (me && me.nick) || "ANÓN";
      await fetch("/api/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: "laberinto", alias, score: sc }) });
      const rk = await (await fetch("/api/rank?game=laberinto&score=" + sc, { headers: { accept: "application/json" } })).json();
      const base = "Nivel " + (depth + 1) + " · " + Math.floor(activeTime) + "s";
      $("drank").textContent = (rk && rk.ok) ? base + " · Puesto #" + rk.rank + " de " + rk.total : base;
    } catch (_) {}
  }
  function die() { if (TRAPPED) { caughtWorld(); return; } submitScore("TE ALCANZÓ"); }

  /* ---------- Loop ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    updateRain(dt);
    if (alive && running && !inRefuge && !inSafe) {
      if (!hidden) { activeTime += dt; levelTime += dt; }
      // mover jugador (bloqueado si está escondido)
      let mv = false;
      if (!hidden) {
        const ez = energizerT > 0;
        let f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + touchF;
        let s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touchS;
        f = Math.max(-1, Math.min(1, f)); s = Math.max(-1, Math.min(1, s));
        const tMag = Math.hypot(touchF, touchS);
        sprinting = !!(((keys.ShiftLeft || keys.ShiftRight) || tMag > 0.92) && (ez || stamina > 0.04) && (f || s));
        if (f || s) {
          const sin = Math.sin(yaw), cos = Math.cos(yaw), spd = MOVE * (ez ? ENERGIZER_SPEED : 1) * (sprinting ? SPRINT_MULT : 1) * dt;
          px += (-sin * f + cos * s) * spd; pz += (-cos * f - sin * s) * spd; collide();
          stepT -= dt * (sprinting ? 1.5 : 1); if (stepT <= 0) { sfx(stepToggle ? stepA : stepB); stepToggle = !stepToggle; stepT = 0.42; }
          mv = true;
        } else if (moving) sfx(stepStop);
        if (sprinting && !ez) stamina = Math.max(0, stamina - STAM_DRAIN * dt); else stamina = Math.min(stamMax, stamina + STAM_REGEN * dt); // en Energizer el aire no baja
      }
      moving = mv;
      // flash: carga + congelado + estallido
      if (flashCharge < 1) flashCharge = Math.min(1, flashCharge + dt / flashCd());
      if (freezeT > 0) freezeT -= dt;
      if (alertT > 0) alertT -= dt;
      if (graceT > 0) graceT -= dt;
      if (energizerT > 0) { energizerT -= dt; if (energizerT <= 0) { energizerT = 0; energizerEndSfx(); ents.forEach((e) => { e.patrol = null; e.step = null; }); } }
      if (hidden && hideSearchT > 0) hideSearchT -= dt;
      if (flashLt > 0) { flashLt -= dt; burst.intensity = Math.max(0, flashLt) * 9; } else burst.intensity = 0;
      updateFlares(dt);
      // escondite: el medidor muestra el estado del caracol (te busca → rojo; se fue → verde). Ya NO te expulsa.
      if (hidden) {
        hideT += dt;
        if (hideBar) {
          const searching = hideSearchT > 0;
          hideBar.style.width = searching ? Math.min(100, (1 - hideSearchT / HIDE_SEARCH) * 100) + "%" : "100%";
          hideBar.style.background = searching ? "linear-gradient(90deg,#d8b14a,#d23b47)" : "linear-gradient(90deg,#46d17f,#9be36a)";
        }
      }
      // entidades
      const pcx = Math.floor(px / CELL), pcz = Math.floor(pz / CELL);
      let nearestPd = 1e9;
      for (const e of ents) {
        if (!e.sprite.visible) continue;
        let espd = ENT_BASE + depth * ENT_DEPTH_BOOST + levelTime * ENT_RAMP; // ramp por NIVEL, no acumulado en toda la run
        espd = Math.min(espd, ENT_CAP);                                        // tope: nunca más rápido que tu sprint
        if (alertT > 0) espd *= 1.25;
        if (energizerT > 0) espd *= ENERGIZER_SLOW;                            // en Energizer el caracol se arrastra
        e.spd = espd * dt;
        const ecx = Math.floor(e.x / CELL), ecz = Math.floor(e.z / CELL);
        if (freezeT <= 0) {
          const tg = entTarget(e);
          e.timer -= dt;
          if (e.timer <= 0 || !e.step) { e.step = bfsStep(ecx, ecz, tg[0], tg[1]); e.timer = 0.5; if (!e.step) { const o = openNeighbors(ecx, ecz); if (o.length) e.step = o[Math.floor(Math.random() * o.length)]; } }
          let budget = e.spd, guard = 0;
          while (e.step && budget > 0 && guard++ < 6) {
            const txx = e.step[0] * CELL + CELL / 2, tzz = e.step[1] * CELL + CELL / 2;
            const dx = txx - e.x, dz = tzz - e.z, dl = Math.hypot(dx, dz);
            if (dl <= budget || dl < 0.04) {
              if (nearFlare(txx, tzz)) { budget = 0; break; }
              e.x = txx; e.z = tzz; budget -= dl;
              const nt = entTarget(e);
              e.step = bfsStep(e.step[0], e.step[1], nt[0], nt[1]);
              if (!e.step) { const o = openNeighbors(Math.floor(e.x / CELL), Math.floor(e.z / CELL)); if (o.length) e.step = o[Math.floor(Math.random() * o.length)]; }
            } else {
              const nx2 = e.x + (dx / dl) * budget, nz2 = e.z + (dz / dl) * budget;
              if (nearFlare(nx2, nz2)) { budget = 0; break; }
              e.x = nx2; e.z = nz2; budget = 0;
            }
          }
        }
        e.sprite.position.x = e.x; e.sprite.position.z = e.z;
        const pd = Math.hypot(px - e.x, pz - e.z); if (pd < nearestPd) nearestPd = pd;
        // Pac-Man: con Energizer activo, tocar al caracol lo manda a su guarida + bonus (no te mata)
        if (energizerT > 0 && pd < 1.4) { e.x = e.hx; e.z = e.hz; e.sprite.position.x = e.x; e.sprite.position.z = e.z; e.step = null; e.patrol = null; bonus += ENERGIZER_BONUS; scrap += 20; popSfx(); continue; }
        if (!hidden && pd < 1.25 && freezeT <= 0 && graceT <= 0) { die(); } // gracia al salir del locker: no te mata pegado
      }
      keyObj.position.y = 1.1 + Math.sin(now / 380) * 0.13;
      // lata Energizer: flota, gira y se recoge al pasar cerca
      if (!canTaken && canCell) {
        canObj.position.y = 1.0 + Math.sin(now / 300) * 0.12;
        canMat.rotation = Math.sin(now / 700) * 0.5;
        canLight.intensity = 1.0 + Math.sin(now / 220) * 0.4;
        if (Math.hypot(px - (canCell[0] * CELL + CELL / 2), pz - (canCell[1] * CELL + CELL / 2)) < 1.2) {
          canTaken = true; canObj.visible = false; canLight.intensity = 0; energizerT = ENERGIZER_TIME;
          ents.forEach((e) => { e.patrol = null; e.step = null; }); powerupSfx();
        }
      }
      // llave / puerta / refugio
      if (!hasKey && Math.hypot(px - (keyCell[0] * CELL + CELL / 2), pz - (keyCell[1] * CELL + CELL / 2)) < 1.2) { hasKey = true; keyObj.visible = false; keyLight.visible = false; setDoorLocked(false); heartbeat(0.18); }
      if (hasKey && Math.hypot(px - (doorCell[0] * CELL + CELL / 2), pz - (doorCell[1] * CELL + CELL / 2)) < 1.5) enterSafe();
      // proximidad weirdman + latido (entidad más cercana)
      const pd = nearestPd;
      if (proxEl) { if (!hidden && freezeT <= 0 && pd < CELL * 4.5) { proxEl.style.opacity = String(Math.min(1, 1.25 - pd / (CELL * 4.5))); if (proxTxt) proxTxt.textContent = "EL MONSTRUO ESTÁ A " + Math.round(pd) + " M"; } else proxEl.style.opacity = "0"; }
      hbT -= dt;
      if (!hidden && freezeT <= 0 && pd < CELL * 7 && hbT <= 0) { const ff = 1 - pd / (CELL * 7); heartbeat(0.05 + ff * 0.5); hbT = 1.1 - ff * 0.8; }
      // prompt esconderse
      if (hidePrompt) hidePrompt.style.opacity = (!hidden && nearLocker()) ? "1" : "0";
      if (tbHide) tbHide.style.opacity = (hidden || nearLocker()) ? "1" : "0.4";
      // minimapa + HUD
      seenCells.add(pcx + "," + pcz);
      for (let i = 0; i < 4; i++) seenCells.add((pcx + DIRS[i][0]) + "," + (pcz + DIRS[i][1]));
      timeEl.textContent = activeTime.toFixed(1);
      if (levelEl) levelEl.textContent = String(depth + 1);
      if (flashBar) flashBar.style.width = (flashCharge * 100) + "%";
      if (stamBar) stamBar.style.width = (stamina / stamMax * 100) + "%";
      if (keyEl) keyEl.style.opacity = hasKey ? "1" : "0.3";
      if (flareEl) flareEl.textContent = "BENGALAS " + flareCount + " · F";
      if (energizerEl) { if (energizerT > 0) { energizerEl.style.opacity = "1"; if (ezBar) ezBar.style.width = (energizerT / ENERGIZER_TIME * 100) + "%"; } else energizerEl.style.opacity = "0"; }
      if (canEl) canEl.style.opacity = carryCan ? "1" : "0.25";
      if (scrapEl) scrapEl.textContent = "CHATARRA " + scrap;
    }
    if (alive && inSafe && !shopOpen && (running || isTouch)) safeFrame(dt);
    // cámara
    camera.position.set(px, EYE, pz); camera.rotation.y = yaw; camera.rotation.x = pitch;
    // render (CRT)
    crtMat.uniforms.time.value = now / 1000;
    if (crtOn) {
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.render(crtScene, crtCam);
    } else {
      renderer.setRenderTarget(null); renderer.render(scene, camera);
    }
    if (alive && running && !inRefuge && !inSafe) drawMini();
  }

  function start() {
    seenCells.clear();
    depth = 0; runSeed = (SEED + Math.floor(Math.random() * 1e9)) >>> 0; mazeSeed = runSeed; hasKey = false; flashCharge = 1; freezeT = 0; flashLt = 0; hbT = 0;
    stamina = 1; flareCount = FLARE_MAX; hidden = false; hideT = 0; alertT = 0; inRefuge = false; touchF = 0; touchS = 0; moveId = null; lookId = null;
    energizerT = 0; levelTime = 0; bonus = 0; graceT = 0; hideSearchT = 0; canTaken = false;
    scrap = 0; spent = 0; carryCan = false; stamMax = 1; flashCdMul = 1; reveal = false; flareCapBonus = 0;
    inSafe = false; shopOpen = false; nearNpc = null; nearExit = false;
    npcs.forEach((n) => { n.sprite.visible = false; }); if (shopEl) shopEl.classList.add("hidden");
    px = CELL / 2; pz = CELL / 2; yaw = 0; pitch = 0;
    resetConsumables();
    genMaze(); buildWalls(); placeObjectives(); placeLockers(); placeEnergizer(); applyLevelLights(); spawnEntities();
    alive = true; activeTime = 0; moving = false; stepT = 0;
    intro.classList.add("hidden"); dead.classList.add("hidden"); if (refuge) refuge.classList.add("hidden");
    if (hideOv) hideOv.style.opacity = "0"; if (proxEl) proxEl.style.opacity = "0";
    initAudio();
    try { music.currentTime = 0; music.play().catch(() => {}); } catch (_) {}
    try { rainSnd.currentTime = 0; rainSnd.play().catch(() => {}); } catch (_) {}
    if (isTouch) { running = true; try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); } catch (_) {} }
    else canvas.requestPointerLock();
  }
  $("play").onclick = start;
  $("retry").onclick = start;
  if ($("rg-next")) $("rg-next").onclick = nextLevel;
  if ($("rg-quit")) $("rg-quit").onclick = finishRun;
  if ($("shop-close")) $("shop-close").onclick = closeShop;

  // Top 5 del laberinto en la intro (antes de jugar)
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  async function loadIntroTops() {
    const box = $("introtops"); if (!box) return;
    try {
      const d = await (await fetch("/api/scores?game=laberinto", { headers: { accept: "application/json" } })).json();
      const sc = (d && d.scores) || [];
      box.innerHTML = '<div class="mtops-h">TOP LABERINTO</div>' + (sc.length
        ? '<ol class="mtops-l">' + sc.slice(0, 5).map((s, i) => "<li><span>" + (i + 1) + ". " + esc(s.alias) + "</span><b>" + Number(s.score | 0).toLocaleString("es-AR") + "</b></li>").join("") + "</ol>"
        : '<p class="mtops-e">Nadie llegó lejos todavía. Sé el primero.</p>');
    } catch (_) {}
  }
  if (TRAPPED) {
    if ($("rg-quit")) $("rg-quit").style.display = "none";
    try {
      const pb = $("play"); if (pb) pb.textContent = "Entrar al laberinto";
      if (intro) { const note = document.createElement("div"); note.style.cssText = "margin:10px auto;max-width:340px;padding:10px 14px;border:1px solid rgba(210,59,71,.55);border-radius:12px;background:rgba(20,8,10,.55);color:#ff9a8a;font-weight:700;font-size:13px;line-height:1.45;text-align:center"; note.innerHTML = "Una entidad te arrastró al laberinto.<br><b>Escapá 2 niveles</b> para volver al mundo.<br>Si te alcanza, perdés tu racha."; intro.insertBefore(note, intro.firstChild); }
    } catch (_) {}
  }
  loadIntroTops();

  // Lluvia ya es 3D (en escena). Arranco el loop.
  resize();
  requestAnimationFrame(frame);
})();
