#!/usr/bin/env node
/*
 * Preflight — verifica que el server ARRANCA, no solo que compila.
 * Uso: npm run preflight   (correlo SIEMPRE antes de pushear)
 *
 * Por que existe: tsc compila perfecto con rutas duplicadas, queries rotas
 * o libs ESM-only, y el server muere recien al levantar -> Railway falla el
 * healthcheck y deja la version vieja. Esto lo detecta ANTES del push.
 *
 *   1. Compila (tsc)
 *   2. Escanea rutas duplicadas en src/server.ts (con numero de linea)
 *   3. Levanta el server de verdad (buildApp + listen) y pega a /healthz
 *      — usa una DB stub: no necesita Postgres ni toca datos.
 */
const { execSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
let fallas = 0;
const ok = (m) => console.log('  ✓ ' + m);
const mal = (m) => { fallas++; console.error('  ✗ ' + m); };

(async () => {
  // 1) build
  console.log('[1/3] Compilando (tsc)...');
  try {
    execSync('npx tsc -p tsconfig.json', { cwd: ROOT, stdio: 'pipe' });
    ok('compila limpio');
  } catch (e) {
    mal('tsc fallo:\n' + String((e.stdout && e.stdout.toString()) || e.message));
    process.exit(1);
  }

  // 2) rutas duplicadas (estatico)
  console.log('[2/3] Buscando rutas duplicadas...');
  const lineas = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8').split('\n');
  const vistas = new Map();
  const re = /app\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/;
  let dups = 0;
  lineas.forEach((linea, i) => {
    const m = re.exec(linea);
    if (!m) return;
    const clave = m[1].toUpperCase() + ' ' + m[2];
    if (vistas.has(clave)) { dups++; mal('ruta duplicada: ' + clave + ' (lineas ' + vistas.get(clave) + ' y ' + (i + 1) + ')'); }
    else vistas.set(clave, i + 1);
  });
  if (!dups) ok(vistas.size + ' rutas registradas, ninguna repetida');

  // 3) boot real (db stub — /healthz no toca la base)
  console.log('[3/3] Levantando el server de verdad...');
  try {
    const { buildApp } = require(join(ROOT, 'dist', 'server.js'));
    const db = { query: async () => ({ rows: [] }) };
    const app = buildApp(db);
    await app.ready();                                  // FST_ERR_DUPLICATED_ROUTE explota aca
    await app.listen({ port: 0, host: '127.0.0.1' });   // puerto efimero, no pisa nada
    const port = app.server.address().port;
    const r = await fetch('http://127.0.0.1:' + port + '/healthz');
    const body = await r.text();
    await app.close();
    if (r.status === 200) ok('/healthz respondio 200 ' + body);
    else mal('/healthz respondio ' + r.status + ' ' + body);
  } catch (e) {
    mal('el server NO arranca: [' + (e.code || '?') + '] ' + (e.message || e));
  }

  if (fallas) {
    console.error('\nNO pushees todavia: ' + fallas + ' problema(s). Railway lo rebotaria igual y se queda con la version vieja.');
    process.exit(1);
  }
  console.log('\nTodo verde. Podes pushear tranquilo.');
})();
