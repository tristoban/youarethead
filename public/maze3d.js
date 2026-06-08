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

  /* ---------- Config ---------- */
  const CELL = 4, WALL_H = 3.0, VIEW = 8, R = 0.34, EYE = 1.5;
  const MOVE = 3.4, SPRINT_MULT = 1.8, STAM_DRAIN = 0.34, STAM_REGEN = 0.16;
  const ENT_BASE = 1.1, ENT_RAMP = 0.010, ENT_DEPTH_BOOST = 0.42;
  const FLASH_FREEZE = 5, FLASH_CD_BASE = 20;
  const FLARE_MAX = 3, FLARE_LIFE = 12, FLARE_R = 4.4;
  const HIDE_MAX = 7;
  const SEED = 90210;
  let mazeSeed = SEED;

  /* ---------- Estado ---------- */
  let px = CELL / 2, pz = CELL / 2, yaw = 0, pitch = 0;
  const keys = {};
  let running = false, alive = false, inRefuge = false, activeTime = 0, last = 0, stepT = 0, stepToggle = false, moving = false;
  let depth = 0, hasKey = false, flashCharge = 1, freezeT = 0, flashLt = 0, hbT = 0, keyCell = [5, 0], doorCell = [9, 0];
  let stamina = 1, sprinting = false;
  let hidden = false, hideT = 0, lastSeen = [0, 0], alertT = 0;
  let flareCount = FLARE_MAX;
  function flashCd() { return FLASH_CD_BASE + depth * 2; }

  /* ---------- Laberinto procedural infinito (determinístico) ---------- */
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 0 N(-z) 1 E(+x) 2 S(+z) 3 W(-x)
  function hash(x, z, s) {
    let h = (x | 0) * 374761393 + (z | 0) * 668265263 + (s | 0) * 2147483647 + mazeSeed * 69069;
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
  const wallTex = noiseTex("#56565f", true);
  const floorTex = noiseTex("#44444c", false); floorTex.repeat.set(40, 40);
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xffffff, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: 0xffffff });
  new THREE.TextureLoader().load("/maze-wall.png", (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; wallMat.map = t; wallMat.color.set(0xffffff); wallMat.needsUpdate = true; }, undefined, () => {});

  const wallGeoN = new THREE.PlaneGeometry(CELL, WALL_H);
  const wallGroup = new THREE.Group(); scene.add(wallGroup);
  const FSIZE = (VIEW * 2 + 4) * CELL;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FSIZE, FSIZE), floorMat); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(FSIZE, FSIZE), new THREE.MeshLambertMaterial({ map: floorTex, color: 0x6a6a76, side: THREE.DoubleSide })); ceil.rotation.x = Math.PI / 2; ceil.position.y = WALL_H; scene.add(ceil);

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
    return { sprite: s, x: 0, z: 0, step: null, timer: 0, spd: 0 };
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

  /* ---------- Lockers (escondites) ---------- */
  const lockerMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const lockerGeo = new THREE.BoxGeometry(CELL * 0.5, WALL_H * 0.86, CELL * 0.5);
  const lockers = [];
  function clearLockers() { lockers.forEach((l) => scene.remove(l.mesh)); lockers.length = 0; }
  function placeLockers() {
    clearLockers();
    const n = 2 + Math.min(2, depth);
    for (let i = 0; i < n; i++) {
      const a = hash(40 + i, 40 + i, 3) * 6.2832, dd = 3 + Math.floor(hash(41 + i, 41 + i, 3) * 5);
      const cx = Math.round(Math.cos(a) * dd) || (3 + i), cz = Math.round(Math.sin(a) * dd) || (-2 - i);
      const m = new THREE.Mesh(lockerGeo, lockerMat); m.position.set(cx * CELL + CELL / 2, WALL_H * 0.43, cz * CELL + CELL / 2); scene.add(m);
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
    if (e.code === "KeyE") { if (hidden) exitHide(false); else if (nearLocker()) enterHide(); }
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  canvas.addEventListener("click", () => { if (alive && !running && !inRefuge) canvas.requestPointerLock(); });
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

  /* ---------- Objetivos: llave + puerta ---------- */
  function placeObjectives() {
    const ka = hash(11, 11, 1) * 6.2832, kd = 5 + Math.floor(hash(12, 12, 1) * 4);
    keyCell = [Math.round(Math.cos(ka) * kd) || 5, Math.round(Math.sin(ka) * kd)];
    const da = hash(21, 21, 1) * 6.2832, dd = 9 + Math.floor(hash(22, 22, 1) * 5);
    doorCell = [Math.round(Math.cos(da) * dd) || 9, Math.round(Math.sin(da) * dd)];
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
  function enterHide() { hidden = true; hideT = 0; lastSeen = [Math.floor(px / CELL), Math.floor(pz / CELL)]; if (hideOv) hideOv.style.opacity = "1"; sfx(stepStop); }
  function exitHide(forced) { hidden = false; hideT = 0; if (hideOv) hideOv.style.opacity = "0"; if (forced) alertT = 3; }

  /* ---------- Refugio + niveles ---------- */
  function spawnEntities() {
    const need = depth >= 2 ? 2 : 1;
    while (ents.length < need) ents.push(makeEntity(0xff8a8a));
    ents.forEach((e, i) => { e.sprite.visible = i < need; e.step = null; e.timer = 0; e.x = (i ? -7 : 7) * CELL + CELL / 2; e.z = (i ? -6 : 6) * CELL + CELL / 2; });
  }
  function resetConsumables() { flashCharge = 1; stamina = 1; flareCount = FLARE_MAX; flarePool.forEach((f) => { f.on = false; f.light.intensity = 0; f.mark.visible = false; }); }
  function enterRefuge() {
    inRefuge = true; hasKey = false;
    if (document.pointerLockElement) document.exitPointerLock();
    resetConsumables();
    ents.forEach((e) => { e.sprite.visible = false; });
    if (proxEl) proxEl.style.opacity = "0";
    if (rgLvl) rgLvl.textContent = String(depth + 1);
    if (rgScore) rgScore.textContent = String(depth * 1000 + Math.floor(activeTime));
    if (refuge) refuge.classList.remove("hidden");
    sfx(stepStop);
  }
  function nextLevel() {
    depth++; mazeSeed = SEED + depth * 7919;
    px = CELL / 2; pz = CELL / 2; yaw = 0; pitch = 0;
    hasKey = false; hidden = false; hideT = 0; alertT = 0;
    resetConsumables();
    buildWalls(0, 0); placeObjectives(); placeLockers(); applyLevelLights(); spawnEntities();
    if (refuge) refuge.classList.add("hidden");
    if (hideOv) hideOv.style.opacity = "0";
    inRefuge = false;
    canvas.requestPointerLock();
  }
  function finishRun() { if (refuge) refuge.classList.add("hidden"); inRefuge = false; submitScore("SALISTE CON VIDA"); }

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
    // bengalas activas (naranja)
    for (const f of flarePool) { if (!f.on) continue; const fx = Math.floor(f.x / CELL), fz = Math.floor(f.z / CELL); if (Math.abs(fx - pcx) <= range && Math.abs(fz - pcz) <= range) { mctx.fillStyle = "#ffb866"; const sx = W / 2 + (fx - pcx + 0.5) * cellPx, sy = H / 2 + (fz - pcz + 0.5) * cellPx; mctx.beginPath(); mctx.arc(sx, sy, 2.6, 0, 7); mctx.fill(); } }
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
    const sc = depth * 1000 + Math.floor(activeTime);
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
  function die() { submitScore("TE ALCANZÓ"); }

  /* ---------- Loop ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    updateRain(dt);
    if (alive && running && !inRefuge) {
      if (!hidden) activeTime += dt;
      // mover jugador (bloqueado si está escondido)
      let mv = false;
      if (!hidden) {
        const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
        sprinting = !!((keys.ShiftLeft || keys.ShiftRight) && stamina > 0.04 && (f || s));
        if (f || s) {
          const sin = Math.sin(yaw), cos = Math.cos(yaw), spd = MOVE * (sprinting ? SPRINT_MULT : 1) * dt;
          px += (-sin * f + cos * s) * spd; pz += (-cos * f - sin * s) * spd; collide();
          stepT -= dt * (sprinting ? 1.5 : 1); if (stepT <= 0) { sfx(stepToggle ? stepA : stepB); stepToggle = !stepToggle; stepT = 0.42; }
          mv = true;
        } else if (moving) sfx(stepStop);
        if (sprinting) stamina = Math.max(0, stamina - STAM_DRAIN * dt); else stamina = Math.min(1, stamina + STAM_REGEN * dt);
      }
      moving = mv;
      // flash: carga + congelado + estallido
      if (flashCharge < 1) flashCharge = Math.min(1, flashCharge + dt / flashCd());
      if (freezeT > 0) freezeT -= dt;
      if (alertT > 0) alertT -= dt;
      if (flashLt > 0) { flashLt -= dt; burst.intensity = Math.max(0, flashLt) * 9; } else burst.intensity = 0;
      updateFlares(dt);
      // escondite: medidor de permanencia
      if (hidden) { hideT += dt; if (hideBar) hideBar.style.width = Math.min(100, hideT / HIDE_MAX * 100) + "%"; if (hideT >= HIDE_MAX) exitHide(true); }
      // entidades
      const pcx = Math.floor(px / CELL), pcz = Math.floor(pz / CELL);
      const tgt = hidden ? lastSeen : [pcx, pcz];
      let nearestPd = 1e9;
      for (const e of ents) {
        if (!e.sprite.visible) continue;
        e.spd = (ENT_BASE + depth * ENT_DEPTH_BOOST + activeTime * ENT_RAMP) * (alertT > 0 ? 1.5 : 1) * dt;
        const ecx = Math.floor(e.x / CELL), ecz = Math.floor(e.z / CELL);
        if (freezeT <= 0) {
          e.timer -= dt;
          if (e.timer <= 0 || !e.step) { e.step = bfsStep(ecx, ecz, tgt[0], tgt[1]); e.timer = 0.5; if (!e.step && hidden) { const o = openNeighbors(ecx, ecz); if (o.length) e.step = o[Math.floor(Math.random() * o.length)]; } }
          let budget = e.spd, guard = 0;
          while (e.step && budget > 0 && guard++ < 6) {
            const txx = e.step[0] * CELL + CELL / 2, tzz = e.step[1] * CELL + CELL / 2;
            const dx = txx - e.x, dz = tzz - e.z, dl = Math.hypot(dx, dz);
            if (dl <= budget || dl < 0.04) {
              if (nearFlare(txx, tzz)) { budget = 0; break; }
              e.x = txx; e.z = tzz; budget -= dl;
              const nt = hidden ? lastSeen : [Math.floor(px / CELL), Math.floor(pz / CELL)];
              e.step = bfsStep(e.step[0], e.step[1], nt[0], nt[1]);
              if (!e.step && hidden) { const o = openNeighbors(Math.floor(e.x / CELL), Math.floor(e.z / CELL)); if (o.length) e.step = o[Math.floor(Math.random() * o.length)]; }
            } else {
              const nx2 = e.x + (dx / dl) * budget, nz2 = e.z + (dz / dl) * budget;
              if (nearFlare(nx2, nz2)) { budget = 0; break; }
              e.x = nx2; e.z = nz2; budget = 0;
            }
          }
        }
        e.sprite.position.x = e.x; e.sprite.position.z = e.z;
        const pd = Math.hypot(px - e.x, pz - e.z); if (pd < nearestPd) nearestPd = pd;
        if (!hidden && pd < 1.25 && freezeT <= 0) { die(); }
      }
      keyObj.position.y = 1.1 + Math.sin(now / 380) * 0.13;
      // llave / puerta / refugio
      if (!hasKey && Math.hypot(px - (keyCell[0] * CELL + CELL / 2), pz - (keyCell[1] * CELL + CELL / 2)) < 1.2) { hasKey = true; keyObj.visible = false; keyLight.visible = false; setDoorLocked(false); heartbeat(0.18); }
      if (hasKey && Math.hypot(px - (doorCell[0] * CELL + CELL / 2), pz - (doorCell[1] * CELL + CELL / 2)) < 1.5) enterRefuge();
      // proximidad weirdman + latido (entidad más cercana)
      const pd = nearestPd;
      if (proxEl) { if (!hidden && freezeT <= 0 && pd < CELL * 4.5) { proxEl.style.opacity = String(Math.min(1, 1.25 - pd / (CELL * 4.5))); if (proxTxt) proxTxt.textContent = "EL MONSTRUO ESTÁ A " + Math.round(pd) + " M"; } else proxEl.style.opacity = "0"; }
      hbT -= dt;
      if (!hidden && freezeT <= 0 && pd < CELL * 7 && hbT <= 0) { const ff = 1 - pd / (CELL * 7); heartbeat(0.05 + ff * 0.5); hbT = 1.1 - ff * 0.8; }
      // prompt esconderse
      if (hidePrompt) hidePrompt.style.opacity = (!hidden && nearLocker()) ? "1" : "0";
      // minimapa + HUD
      seenCells.add(pcx + "," + pcz);
      for (let i = 0; i < 4; i++) seenCells.add((pcx + DIRS[i][0]) + "," + (pcz + DIRS[i][1]));
      timeEl.textContent = activeTime.toFixed(1);
      if (levelEl) levelEl.textContent = String(depth + 1);
      if (flashBar) flashBar.style.width = (flashCharge * 100) + "%";
      if (stamBar) stamBar.style.width = (stamina * 100) + "%";
      if (keyEl) keyEl.style.opacity = hasKey ? "1" : "0.3";
      if (flareEl) flareEl.textContent = "BENGALAS " + flareCount + " · F";
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
    if (alive && running && !inRefuge) drawMini();
  }

  function start() {
    seenCells.clear();
    depth = 0; mazeSeed = SEED; hasKey = false; flashCharge = 1; freezeT = 0; flashLt = 0; hbT = 0;
    stamina = 1; flareCount = FLARE_MAX; hidden = false; hideT = 0; alertT = 0; inRefuge = false;
    px = CELL / 2; pz = CELL / 2; yaw = 0; pitch = 0;
    resetConsumables();
    buildWalls(0, 0); placeObjectives(); placeLockers(); applyLevelLights(); spawnEntities();
    alive = true; activeTime = 0; moving = false; stepT = 0;
    intro.classList.add("hidden"); dead.classList.add("hidden"); if (refuge) refuge.classList.add("hidden");
    if (hideOv) hideOv.style.opacity = "0"; if (proxEl) proxEl.style.opacity = "0";
    initAudio();
    try { music.currentTime = 0; music.play().catch(() => {}); } catch (_) {}
    try { rainSnd.currentTime = 0; rainSnd.play().catch(() => {}); } catch (_) {}
    canvas.requestPointerLock();
  }
  $("play").onclick = start;
  $("retry").onclick = start;
  if ($("rg-next")) $("rg-next").onclick = nextLevel;
  if ($("rg-quit")) $("rg-quit").onclick = finishRun;

  resize();
  requestAnimationFrame(frame);
})();
