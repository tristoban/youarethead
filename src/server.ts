import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Pool } from 'pg';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { join } from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';
const GOAL = Number(process.env.WISHLIST_GOAL ?? 10000);
const IP_SALT = process.env.IP_SALT ?? 'youarethead-default-salt-cambiame';
const ONE_PER_IP = (process.env.ONE_PER_IP ?? 'true').toLowerCase() !== 'false';
const PUBLIC_URL = (process.env.PUBLIC_URL ?? 'https://youarethead.com.ar').replace(/\/+$/, '');
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'YOU ARE THE AD <noreply@youarethead.com.ar>';
const LAUNCHED = (process.env.LAUNCHED ?? 'false').toLowerCase() === 'true';
const ADMIN_KEY = process.env.ADMIN_KEY ?? '';
const ADMIN_TOKEN = ADMIN_KEY ? createHash('sha256').update('yath-admin:' + ADMIN_KEY + ':' + IP_SALT).digest('hex').slice(0, 32) : '';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_RUDE = new Set(['culos', 'culo', 'ass']);
const BANNED = [
  'puto', 'puta', 'ptm', 'reputo', 'trolo', 'trola', 'concha', 'conchud', 'conchetu', 'ctm',
  'pija', 'pijud', 'verga', 'vergon', 'choto', 'chota', 'forro', 'forra', 'pelotud', 'boludo',
  'sorete', 'mogolic', 'subnormal', 'imbecil', 'idiota', 'estupid', 'tarado', 'tarada',
  'maricon', 'marica', 'putazo', 'trava', 'cornud', 'violad', 'pedofil', 'zoofil',
  'nazi', 'hitler', 'genocid', 'culiao', 'culiado', 'culeao', 'mamahuevo', 'mierda', 'cabron',
  'gilipolla', 'huevon', 'fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga',
  'faggot', 'whore', 'slut', 'retard', 'rapist', 'rape', 'asshole',
];
function offensiveAlias(s: string): boolean {
  const norm = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/3/g, 'e').replace(/4/g, 'a')
    .replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a').replace(/\$/g, 's')
    .replace(/[^a-z]/g, '');
  if (!norm) return false;
  if (ALLOWED_RUDE.has(norm)) return false;
  return BANNED.some((w) => norm.includes(w));
}
function offensiveText(s: string): boolean {
  return s.split(/\s+/).some((tok) => tok.length > 0 && offensiveAlias(tok));
}

export interface Db {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

function shouldUseSsl(url: string): boolean {
  const mode = (process.env.PGSSL ?? '').toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'require') return true;
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.railway.internal')) return false;
  } catch { /* ignore */ }
  return true;
}

export async function initDb(db: Db): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id          BIGSERIAL PRIMARY KEY,
      email       TEXT        NOT NULL,
      email_norm  TEXT        NOT NULL,
      ip_hash     TEXT,
      user_agent  TEXT,
      confirmed   BOOLEAN     NOT NULL DEFAULT false,
      token       TEXT,
      code        TEXT,
      code_expires TIMESTAMPTZ,
      code_attempts INTEGER   NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false;`);
  await db.query(`ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS token TEXT;`);
  await db.query(`ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS code TEXT;`);
  await db.query(`ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS code_expires TIMESTAMPTZ;`);
  await db.query(`ALTER TABLE wishlist ADD COLUMN IF NOT EXISTS code_attempts INTEGER NOT NULL DEFAULT 0;`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS wishlist_email_norm_uidx ON wishlist (email_norm);`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS wishlist_ip_uidx ON wishlist (ip_hash) WHERE ip_hash IS NOT NULL;`);
  await db.query(`CREATE INDEX IF NOT EXISTS wishlist_token_idx ON wishlist (token);`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id          BIGSERIAL PRIMARY KEY,
      alias       TEXT        NOT NULL,
      score       INTEGER     NOT NULL,
      email_norm  TEXT,
      ip_hash     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS scores_score_idx ON scores (score DESC, created_at ASC);`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id          BIGSERIAL PRIMARY KEY,
      name        TEXT        NOT NULL DEFAULT 'ANÓN',
      body        TEXT        NOT NULL,
      ip_hash     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS chat_id_idx ON chat_messages (id);`);
  await db.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS game TEXT NOT NULL DEFAULT 'tetristo';`);
  await db.query(`CREATE INDEX IF NOT EXISTS scores_game_idx ON scores (game, score DESC, created_at ASC);`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS hub_users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      email_norm TEXT NOT NULL,
      nick TEXT,
      nick_norm TEXT,
      code TEXT,
      code_expires TIMESTAMPTZ,
      code_attempts INTEGER NOT NULL DEFAULT 0,
      session TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS hub_users_email_uidx ON hub_users (email_norm);`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS hub_users_nick_uidx ON hub_users (nick_norm) WHERE nick_norm IS NOT NULL;`);
  await db.query(`CREATE INDEX IF NOT EXISTS hub_users_session_idx ON hub_users (session);`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS boton_caidos (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE,
      nick TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS mural_px (
      x SMALLINT NOT NULL,
      y SMALLINT NOT NULL,
      v SMALLINT NOT NULL,
      nick TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (x, y)
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS pueblo_chars (
      user_id BIGINT PRIMARY KEY,
      head TEXT NOT NULL DEFAULT 'o',
      vida REAL NOT NULL DEFAULT 100,
      hambre REAL NOT NULL DEFAULT 100,
      sueno REAL NOT NULL DEFAULT 100,
      x REAL NOT NULL DEFAULT 0.5,
      y REAL NOT NULL DEFAULT 0.6,
      last_tick TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const mp = await db.query('SELECT x, y, v FROM mural_px');
  for (const r of mp.rows) {
    const x = Number(r.x), y = Number(r.y), v = Number(r.v);
    if (x >= 0 && x < MURAL_W && y >= 0 && y < MURAL_H) muralGrid[y * MURAL_W + x] = Math.max(0, Math.min(7, v));
  }
  muralDirty = true;
}

interface Stats { count: number; goal: number; remaining: number; unlocked: boolean; }
async function getStats(db: Db): Promise<Stats> {
  const { rows } = await db.query('SELECT count(*) AS c FROM wishlist WHERE confirmed = true');
  const count = Number((rows[0]?.c as string | number | bigint | undefined) ?? 0);
  const remaining = Math.max(0, GOAL - count);
  return { count, goal: GOAL, remaining, unlocked: count >= GOAL };
}
async function topScores(db: Db, game = 'tetristo'): Promise<Array<{ alias: unknown; score: number }>> {
  const { rows } = await db.query('SELECT alias, score FROM scores WHERE game = $1 ORDER BY score DESC, created_at ASC LIMIT 10', [game]);
  return rows.map((r) => ({ alias: r.alias, score: Number(r.score) }));
}
function mapMsg(r: Record<string, unknown>): { id: number; name: unknown; body: unknown; t: unknown } {
  return { id: Number(r.id), name: r.name, body: r.body, t: r.created_at };
}

const MURAL_W = 100, MURAL_H = 56;
const muralGrid = new Uint8Array(MURAL_W * MURAL_H);
let muralDirty = true, muralCache = '';
function muralString(): string {
  if (muralDirty) {
    const a: string[] = new Array(muralGrid.length);
    for (let i = 0; i < muralGrid.length; i++) a[i] = (muralGrid[i] ?? 0).toString(16);
    muralCache = a.join(''); muralDirty = false;
  }
  return muralCache;
}

async function hubUserBySession(db: Db, req: FastifyRequest): Promise<{ id: number; nick: string | null } | null> {
  const c = req.headers.cookie;
  if (typeof c !== 'string') return null;
  const m = c.split(';').map((s) => s.trim()).find((s) => s.startsWith('yath_sess='));
  if (!m) return null;
  const tok = m.slice(10);
  if (!tok || tok.length < 20) return null;
  const { rows } = await db.query('SELECT id, nick FROM hub_users WHERE session = $1', [tok]);
  const r = rows[0];
  if (!r) return null;
  return { id: Number(r.id), nick: (r.nick as string | null) ?? null };
}

const HEADS = ['o', 'O', 'ö', 'ø', '@', '°'];
const NPC_LINES = [
  'Tristo: "¿Café? Acá la noche no termina nunca."',
  'Tristo: "El primero es gratis. Todos son gratis. Nadie sale igual."',
  'Tristo: "Yo solo atiendo. No preguntes desde cuándo."',
  'Tristo: "Si escuchás un teléfono, no atiendas."',
  'Tristo: "El video sale cuando tenga que salir."',
  'Tristo: "Tomá. Te va a mantener despierto. Para siempre."',
  'Tristo: "¿Dormiste? Acá eso es un lujo."',
  'Tristo: "¿Viste el mural? Algo están dibujando entre todos."',
];
const PUEBLO_SAYS = ['hola', 'jaja', '¿y el video?', 'seguime', 'quiero salir de acá', 'tengo hambre', 'tengo sueño', '¿alguien tiene café?', 'no puedo dormir', 'estamos atrapados'];
const CAFE_X0 = 0.68, CAFE_X1 = 0.97, CASA_X0 = 0.03, CASA_X1 = 0.3;
interface PuebloP { id: number; nick: string; head: string; x: number; y: number; say: string; sayUntil: number; vida: number; hambre: number; sueno: number; lastTick: number; lastSave: number; last: number; cdComer: number; cdDormir: number; }
const pueblo = new Map<number, PuebloP>();
function decay(p: PuebloP, now: number): void {
  const h = Math.max(0, (now - p.lastTick) / 3600000);
  if (h <= 0) { p.lastTick = now; return; }
  p.hambre = Math.max(0, p.hambre - 25 * h);
  p.sueno = Math.max(0, p.sueno - 18 * h);
  let dv = 0;
  if (p.hambre <= 0) dv -= 20 * h;
  if (p.sueno <= 0) dv -= 15 * h;
  if (p.hambre > 30 && p.sueno > 30) dv += 10 * h;
  p.vida = Math.max(1, Math.min(100, p.vida + dv));
  p.lastTick = now;
}
async function puebloLoad(db: Db, u: { id: number; nick: string | null }): Promise<PuebloP | null> {
  const got = pueblo.get(u.id);
  if (got) return got;
  const { rows } = await db.query('SELECT head, vida, hambre, sueno, x, y FROM pueblo_chars WHERE user_id = $1', [u.id]);
  const r = rows[0];
  if (!r) return null;
  const p: PuebloP = { id: u.id, nick: u.nick ?? 'anón', head: String(r.head ?? 'o'), x: Number(r.x ?? 0.5), y: Number(r.y ?? 0.6), say: '', sayUntil: 0, vida: Number(r.vida ?? 100), hambre: Number(r.hambre ?? 100), sueno: Number(r.sueno ?? 100), lastTick: Date.now(), lastSave: Date.now(), last: Date.now(), cdComer: 0, cdDormir: 0 };
  pueblo.set(u.id, p);
  return p;
}
async function puebloSave(db: Db, p: PuebloP): Promise<void> {
  p.lastSave = Date.now();
  await db.query('UPDATE pueblo_chars SET vida = $2, hambre = $3, sueno = $4, x = $5, y = $6, last_tick = now() WHERE user_id = $1', [p.id, p.vida, p.hambre, p.sueno, p.x, p.y]);
}

async function sendHubCode(to: string, code: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn('[mail] RESEND_API_KEY ausente: no se envía'); return false; }
  const html =
    '<div style="background:#060606;color:#f5f5f7;font-family:Arial,Helvetica,sans-serif;padding:40px 24px;text-align:center">' +
    '<div style="max-width:480px;margin:0 auto">' +
    '<h1 style="font-size:26px;letter-spacing:-.02em;margin:0 0 6px">Tristo&#39;s</h1>' +
    '<p style="color:#9a9aa2;margin:0 0 22px">Tu código para entrar:</p>' +
    `<div style="font-size:40px;font-weight:800;letter-spacing:10px;background:#101014;border:1px solid #2a2a30;border-radius:12px;padding:18px 12px;margin:0 0 18px">${code}</div>` +
    '<p style="color:#6c6c72;font-size:12px;margin:24px 0 0">Si no fuiste vos, ignorá este mail.<br>youarethead.com.ar</p>' +
    '</div></div>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject: `Tu código: ${code} — Tristo's`, html }),
    });
    return r.ok;
  } catch { return false; }
}
function getClientIp(req: FastifyRequest): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) { const first = xff.split(',')[0]; if (first && first.trim()) return first.trim(); }
  return req.ip;
}
function hashIp(ip: string): string { return createHash('sha256').update(`${IP_SALT}:${ip}`).digest('hex'); }
function isAdmin(req: FastifyRequest): boolean {
  if (!ADMIN_TOKEN) return false;
  const c = req.headers.cookie;
  if (typeof c !== 'string') return false;
  return c.split(';').some((s) => s.trim() === 'yath_admin=' + ADMIN_TOKEN);
}
function newToken(): string { return randomBytes(24).toString('hex'); }
function newCode(): string { return String(randomInt(0, 1000000)).padStart(6, '0'); }

type PendingStatus = 'created' | 'resent' | 'confirmed' | 'ip_taken' | 'error';
async function upsertPending(db: Db, emailRaw: string, ip: string, ua: string): Promise<{ status: PendingStatus; token?: string; code?: string }> {
  const emailNorm = emailRaw.toLowerCase();
  const ipHash = ONE_PER_IP ? hashIp(ip) : null;
  const token = newToken();
  const code = newCode();
  try {
    await db.query(
      "INSERT INTO wishlist (email, email_norm, ip_hash, user_agent, token, code, code_expires, code_attempts, confirmed) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '30 minutes', 0, false)",
      [emailRaw, emailNorm, ipHash, ua, token, code],
    );
    return { status: 'created', token, code };
  } catch (err: unknown) {
    const e = err as { code?: string; constraint?: string; message?: string };
    const msg = e.message ?? '';
    const isDup = e.code === '23505' || /duplicate key|unique/i.test(msg);
    if (!isDup) return { status: 'error' };
    const ref = `${e.constraint ?? ''} ${msg}`;
    const byIp = /ip/i.test(ref) && !/email/i.test(e.constraint ?? '');
    if (byIp) return { status: 'ip_taken' };
    const { rows } = await db.query('SELECT confirmed FROM wishlist WHERE email_norm = $1', [emailNorm]);
    if (rows[0] && rows[0].confirmed) return { status: 'confirmed' };
    const t2 = newToken(); const c2 = newCode();
    await db.query("UPDATE wishlist SET token = $2, code = $3, code_expires = now() + interval '30 minutes', code_attempts = 0 WHERE email_norm = $1", [emailNorm, t2, c2]);
    return { status: 'resent', token: t2, code: c2 };
  }
}

async function sendConfirmEmail(to: string, code: string, token: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn('[mail] RESEND_API_KEY ausente: no se envía'); return false; }
  const link = `${PUBLIC_URL}/api/confirm?token=${encodeURIComponent(token)}`;
  const html =
    '<div style="background:#060606;color:#f5f5f7;font-family:Arial,Helvetica,sans-serif;padding:40px 24px;text-align:center">' +
    '<div style="max-width:480px;margin:0 auto">' +
    '<h1 style="font-size:26px;letter-spacing:-.02em;margin:0 0 6px">YOU ARE THE AD</h1>' +
    '<p style="color:#9a9aa2;margin:0 0 22px">Tu código para confirmar y sumar a la lista:</p>' +
    `<div style="font-size:40px;font-weight:800;letter-spacing:10px;background:#101014;border:1px solid #2a2a30;border-radius:12px;padding:18px 12px;margin:0 0 18px">${code}</div>` +
    '<p style="color:#9a9aa2;margin:0 0 20px">Pegalo en la página.</p>' +
    `<a href="${link}" style="display:inline-block;background:#f5f5f7;color:#060606;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px">o confirmá con este botón</a>` +
    '<p style="color:#6c6c72;font-size:12px;margin:24px 0 0">Si no fuiste vos, ignorá este mail.<br>youarethead.com.ar</p>' +
    '</div></div>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject: `Tu código: ${code} — YOU ARE THE AD`, html }),
    });
    return r.ok;
  } catch { return false; }
}

function page(title: string, body: string): string {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${title}</title>` +
    '<style>html,body{margin:0;height:100%;background:#060606;color:#f5f5f7;font-family:Montserrat,system-ui,Arial,sans-serif}' +
    '.w{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;gap:14px}' +
    'h1{font-size:clamp(2rem,7vw,3.4rem);font-weight:800;letter-spacing:-.02em;margin:0}' +
    'p{color:#9a9aa2;margin:0;max-width:34ch}a{display:inline-block;margin-top:10px;background:#f5f5f7;color:#060606;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px}</style>' +
    `</head><body><div class="w">${body}</div></body></html>`;
}

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({ trustProxy: true, bodyLimit: 16 * 1024 });

  const chatRate = new Map<string, number>();
  const chatNames = new Map<string, string>();
  const muralRate = new Map<string, number>();
  const hubMailRate = new Map<string, number>();
  const GATED = new Set(['/index.html', '/tshirt.png', '/pic1.png', '/pic2.png', '/pic3.png', '/pic3.jpg']);
  app.addHook('onRequest', async (req, reply) => {
    if (LAUNCHED || isAdmin(req)) return;
    const p = req.url.split('?')[0] ?? '';
    if (GATED.has(p)) {
      reply.code(404).header('content-type', 'text/html; charset=utf-8').send(page('404', '<h1>404</h1><p>No hay nada acá… todavía.</p>'));
      return reply;
    }
  });

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/api/stats', async (_req, reply) => { const stats = await getStats(db); reply.header('cache-control', 'no-store'); return { ok: true, ...stats }; });

  app.post('/api/wishlist', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown };
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    if (!emailRaw || emailRaw.length > 254 || !EMAIL_RE.test(emailRaw)) {
      const stats = await getStats(db);
      return reply.code(400).send({ ok: false, error: 'invalid_email', message: 'Ese mail no parece válido.', ...stats });
    }
    const ua = (req.headers['user-agent'] ?? '').toString().slice(0, 300);
    const res = await upsertPending(db, emailRaw, getClientIp(req), ua);
    const stats = await getStats(db);
    if (res.status === 'ip_taken') return reply.code(409).send({ ok: false, error: 'ip_taken', message: 'Ya hay alguien anotado desde esta conexión.', ...stats });
    if (res.status === 'confirmed') return reply.code(200).send({ ok: true, pending: false, message: 'Ese mail ya está confirmado. ¡Gracias!', ...stats });
    if (res.status === 'error') return reply.code(500).send({ ok: false, error: 'server_error', message: 'Algo se rompió. Probá de nuevo.', ...stats });
    if (res.code && res.token) await sendConfirmEmail(emailRaw, res.code, res.token);
    const message = res.status === 'resent' ? 'Te reenviamos el código.' : 'Te mandamos un código por mail.';
    return reply.code(201).send({ ok: true, pending: true, message, ...stats });
  });

  app.post('/api/confirm-otp', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown; code?: unknown };
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
    const stats0 = await getStats(db);
    if (!EMAIL_RE.test(emailRaw)) return reply.code(400).send({ ok: false, error: 'invalid_email', message: 'Mail inválido.', ...stats0 });
    if (code.length !== 6) return reply.code(400).send({ ok: false, error: 'bad_code', message: 'El código tiene 6 dígitos.', ...stats0 });
    const emailNorm = emailRaw.toLowerCase();
    const { rows } = await db.query('SELECT id, confirmed, code, code_attempts, (code_expires > now()) AS valid FROM wishlist WHERE email_norm = $1', [emailNorm]);
    const row = rows[0];
    if (!row) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No encontramos ese mail. Anotate de nuevo.', ...stats0 });
    if (row.confirmed) return reply.code(200).send({ ok: true, confirmed: true, already: true, message: 'Ya estabas confirmado.', ...stats0 });
    const attempts = Number(row.code_attempts ?? 0);
    if (!row.code || row.valid === false) return reply.code(400).send({ ok: false, error: 'expired', message: 'El código venció. Pedí uno nuevo.', ...stats0 });
    if (attempts >= 5) return reply.code(429).send({ ok: false, error: 'too_many', message: 'Demasiados intentos. Pedí un código nuevo.', ...stats0 });
    if (String(row.code) !== code) {
      const na = attempts + 1;
      if (na >= 5) await db.query('UPDATE wishlist SET code_attempts = $2, code = NULL WHERE id = $1', [row.id, na]);
      else await db.query('UPDATE wishlist SET code_attempts = $2 WHERE id = $1', [row.id, na]);
      const stats = await getStats(db);
      return reply.code(400).send({ ok: false, error: 'bad_code', message: na >= 5 ? 'Código incorrecto. Sin intentos: pedí uno nuevo.' : 'Código incorrecto.', triesLeft: Math.max(0, 5 - na), ...stats });
    }
    await db.query('UPDATE wishlist SET confirmed = true, code = NULL, token = NULL WHERE id = $1', [row.id]);
    const stats = await getStats(db);
    return reply.code(200).send({ ok: true, confirmed: true, message: '¡Confirmado! Sos parte.', ...stats });
  });

  app.get('/api/scores', async (req, reply) => { reply.header('cache-control', 'no-store'); const g = ((req.query ?? {}) as { game?: unknown }).game; return { ok: true, scores: await topScores(db, g === 'parpadeo' ? 'parpadeo' : 'tetristo') }; });

  app.post('/api/score', async (req, reply) => {
    const body = (req.body ?? {}) as { alias?: unknown; score?: unknown; game?: unknown };
    const game = body.game === 'parpadeo' ? 'parpadeo' : 'tetristo';
    let alias = typeof body.alias === 'string' ? body.alias.trim().replace(/[^\p{L}\p{N} _.\-]/gu, '').slice(0, 12).trim() : '';
    if (!alias) alias = 'ANON';
    if (offensiveAlias(alias)) return reply.code(400).send({ ok: false, error: 'bad_alias', message: 'Ese alias no se puede usar.' });
    const score = typeof body.score === 'number' && Number.isFinite(body.score) ? Math.floor(body.score) : NaN;
    if (!Number.isInteger(score) || score < 0 || score > 10000000) return reply.code(400).send({ ok: false, error: 'bad_score', message: 'Puntaje inválido.' });
    const ipHash = hashIp(getClientIp(req));
    await db.query('INSERT INTO scores (alias, score, ip_hash, game) VALUES ($1, $2, $3, $4)', [alias, score, ipHash, game]);
    const rankRes = await db.query('SELECT count(*) AS c FROM scores WHERE score > $1 AND game = $2', [score, game]);
    const rank = Number((rankRes.rows[0]?.c as string | number | bigint | undefined) ?? 0) + 1;
    return reply.code(201).send({ ok: true, rank, alias, score, scores: await topScores(db, game) });
  });

  app.get('/api/chat', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const sinceRaw = ((req.query ?? {}) as { since?: unknown }).since;
    const since = Math.floor(Number(sinceRaw));
    if (Number.isFinite(since) && since > 0) {
      const { rows } = await db.query('SELECT id, name, body, created_at FROM chat_messages WHERE id > $1 ORDER BY id ASC LIMIT 100', [since]);
      return { ok: true, messages: rows.map(mapMsg) };
    }
    const { rows } = await db.query('SELECT id, name, body, created_at FROM chat_messages ORDER BY id DESC LIMIT 60');
    return { ok: true, messages: rows.reverse().map(mapMsg) };
  });

  app.post('/api/chat', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: unknown; body?: unknown };
    let name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 20).trim() : '';
    const text = typeof body.body === 'string' ? body.body.replace(/\s+/g, ' ').trim().slice(0, 200).trim() : '';
    if (!text) return reply.code(400).send({ ok: false, error: 'empty', message: 'Escribí algo.' });
    if (!name) name = 'ANÓN';
    const ipHash = hashIp(getClientIp(req));
    const lockedName = chatNames.get(ipHash);
    if (lockedName) name = lockedName;
    if (offensiveAlias(name) || offensiveText(text)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Esa no va.' });
    const now = Date.now();
    const last = chatRate.get(ipHash) ?? 0;
    if (now - last < 1500) return reply.code(429).send({ ok: false, error: 'slow', message: 'Pará un toque.' });
    chatRate.set(ipHash, now);
    if (!lockedName && name !== 'ANÓN') chatNames.set(ipHash, name);
    const ins = await db.query('INSERT INTO chat_messages (name, body, ip_hash) VALUES ($1, $2, $3) RETURNING id, created_at', [name, text, ipHash]);
    const row = ins.rows[0];
    return reply.code(201).send({ ok: true, message: { id: Number(row?.id ?? 0), name, body: text, t: row?.created_at }, nameLocked: chatNames.has(ipHash) });
  });

  app.post('/api/hub/login', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown };
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    if (!emailRaw || emailRaw.length > 254 || !EMAIL_RE.test(emailRaw)) return reply.code(400).send({ ok: false, error: 'invalid_email', message: 'Ese mail no parece válido.' });
    const ipHash = hashIp(getClientIp(req));
    const now = Date.now();
    const last = hubMailRate.get(ipHash) ?? 0;
    if (now - last < 20000) return reply.code(429).send({ ok: false, error: 'slow', message: 'Esperá unos segundos y probá de nuevo.' });
    hubMailRate.set(ipHash, now);
    const code = newCode();
    await db.query("INSERT INTO hub_users (email, email_norm, code, code_expires, code_attempts) VALUES ($1, $2, $3, now() + interval '30 minutes', 0) ON CONFLICT (email_norm) DO UPDATE SET code = $3, code_expires = now() + interval '30 minutes', code_attempts = 0", [emailRaw, emailRaw.toLowerCase(), code]);
    await sendHubCode(emailRaw, code);
    return reply.code(201).send({ ok: true, pending: true, message: 'Te mandamos un código al mail.' });
  });

  app.post('/api/hub/verify', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown; code?: unknown };
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
    if (!EMAIL_RE.test(emailRaw) || code.length !== 6) return reply.code(400).send({ ok: false, error: 'bad_code', message: 'Datos inválidos.' });
    const { rows } = await db.query('SELECT id, nick, code, code_attempts, (code_expires > now()) AS valid FROM hub_users WHERE email_norm = $1', [emailRaw.toLowerCase()]);
    const row = rows[0];
    if (!row) return reply.code(404).send({ ok: false, error: 'not_found', message: 'Pedí un código primero.' });
    const attempts = Number(row.code_attempts ?? 0);
    if (!row.code || row.valid === false) return reply.code(400).send({ ok: false, error: 'expired', message: 'El código venció. Pedí otro.' });
    if (attempts >= 5) return reply.code(429).send({ ok: false, error: 'too_many', message: 'Demasiados intentos. Pedí otro código.' });
    if (String(row.code) !== code) { await db.query('UPDATE hub_users SET code_attempts = $2 WHERE id = $1', [row.id, attempts + 1]); return reply.code(400).send({ ok: false, error: 'bad_code', message: 'Código incorrecto.' }); }
    const sess = newToken();
    await db.query('UPDATE hub_users SET session = $2, code = NULL WHERE id = $1', [row.id, sess]);
    reply.header('set-cookie', 'yath_sess=' + sess + '; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax');
    return reply.code(200).send({ ok: true, logged: true, nick: (row.nick as string | null) ?? null });
  });

  app.post('/api/hub/nick', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login', message: 'Entrá primero.' });
    const body = (req.body ?? {}) as { nick?: unknown };
    const nick = typeof body.nick === 'string' ? body.nick.replace(/\s+/g, ' ').trim().slice(0, 14).trim() : '';
    if (nick.length < 2) return reply.code(400).send({ ok: false, error: 'bad_nick', message: 'Muy corto.' });
    if (offensiveAlias(nick) || offensiveText(nick)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Ese nick no va.' });
    try {
      await db.query('UPDATE hub_users SET nick = $2, nick_norm = $3 WHERE id = $1', [u.id, nick, nick.toLowerCase()]);
    } catch {
      return reply.code(409).send({ ok: false, error: 'taken', message: 'Ese nick ya está tomado.' });
    }
    return reply.code(200).send({ ok: true, nick });
  });

  app.get('/api/hub/me', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    return { ok: true, logged: !!u, nick: u ? u.nick : null };
  });

  app.post('/api/hub/logout', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (u) await db.query('UPDATE hub_users SET session = NULL WHERE id = $1', [u.id]);
    reply.header('set-cookie', 'yath_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    return { ok: true };
  });

  app.get('/api/boton', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const { rows } = await db.query('SELECT count(*) AS c FROM boton_caidos');
    const total = Number((rows[0]?.c as string | number | bigint | undefined) ?? 0);
    const rec = await db.query('SELECT nick FROM boton_caidos ORDER BY id DESC LIMIT 30');
    const u = await hubUserBySession(db, req);
    let vos = false;
    if (u) { const m = await db.query('SELECT 1 AS x FROM boton_caidos WHERE user_id = $1', [u.id]); vos = m.rows.length > 0; }
    return { ok: true, total, vos, ultimos: rec.rows.map((r) => r.nick) };
  });

  app.post('/api/boton', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login', message: 'Solo los logueados pueden caer.' });
    const ins = await db.query('INSERT INTO boton_caidos (user_id, nick) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING RETURNING id', [u.id, u.nick ?? 'anónimo']);
    const tot = await db.query('SELECT count(*) AS c FROM boton_caidos');
    const total = Number((tot.rows[0]?.c as string | number | bigint | undefined) ?? 0);
    const first = ins.rows[0];
    if (!first) {
      const mine = await db.query('SELECT count(*) AS n FROM boton_caidos b WHERE b.id <= (SELECT id FROM boton_caidos WHERE user_id = $1)', [u.id]);
      return reply.code(200).send({ ok: true, caido: true, ya: true, numero: Number((mine.rows[0]?.n as string | number | bigint | undefined) ?? 0), total });
    }
    const pos = await db.query('SELECT count(*) AS n FROM boton_caidos WHERE id <= $1', [first.id]);
    return reply.code(201).send({ ok: true, caido: true, ya: false, numero: Number((pos.rows[0]?.n as string | number | bigint | undefined) ?? 0), total });
  });

  app.get('/api/mural', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return { ok: true, w: MURAL_W, h: MURAL_H, cooldown: 5, d: muralString() };
  });

  app.post('/api/mural', async (req, reply) => {
    const body = (req.body ?? {}) as { x?: unknown; y?: unknown; v?: unknown };
    const x = Math.floor(Number(body.x)), y = Math.floor(Number(body.y)), v = Math.floor(Number(body.v));
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(v) || x < 0 || x >= MURAL_W || y < 0 || y >= MURAL_H || v < 0 || v > 7) return reply.code(400).send({ ok: false, error: 'bad_px', message: 'Pixel inválido.' });
    const ipHash = hashIp(getClientIp(req));
    const now = Date.now();
    const last = muralRate.get(ipHash) ?? 0;
    if (now - last < 5000) return reply.code(429).send({ ok: false, error: 'slow', wait: Math.ceil((5000 - (now - last)) / 1000), message: 'Esperá para pintar otro.' });
    muralRate.set(ipHash, now);
    const u = await hubUserBySession(db, req);
    muralGrid[y * MURAL_W + x] = v; muralDirty = true;
    await db.query('INSERT INTO mural_px (x, y, v, nick, updated_at) VALUES ($1, $2, $3, $4, now()) ON CONFLICT (x, y) DO UPDATE SET v = $3, nick = $4, updated_at = now()', [x, y, v, u ? u.nick : null]);
    return reply.code(201).send({ ok: true });
  });

  app.get('/api/confirm', async (req, reply) => {
    const token = ((req.query ?? {}) as { token?: unknown }).token;
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.header('cache-control', 'no-store');
    if (typeof token !== 'string' || !token) return page('Link inválido', '<h1>Link inválido</h1><p>El link de confirmación no es válido o ya venció.</p><a href="/">Ir al sitio</a>');
    const upd = await db.query('UPDATE wishlist SET confirmed = true, code = NULL, token = NULL WHERE token = $1 AND confirmed = false RETURNING id', [token]);
    if (upd.rows.length > 0) { const stats = await getStats(db); return page('Confirmado', `<h1>¡Confirmado!</h1><p>Listo, ya sos parte. Faltan ${stats.remaining.toLocaleString('es-AR')} para que vos seas la AD.</p><a href="/">Volver</a>`); }
    return page('Ya confirmado', '<h1>Ya estabas</h1><p>Este mail ya estaba confirmado (o el link ya se usó). No hace falta nada más.</p><a href="/">Ir al sitio</a>');
  });

  app.get('/admin', async (req, reply) => {
    const key = ((req.query ?? {}) as { key?: unknown }).key;
    reply.header('cache-control', 'no-store');
    if (!ADMIN_TOKEN) { reply.code(503).header('content-type', 'text/html; charset=utf-8'); return page('Admin', '<h1>Admin sin configurar</h1><p>Falta la variable ADMIN_KEY en el server.</p>'); }
    if (typeof key === 'string' && key === ADMIN_KEY) {
      reply.header('set-cookie', 'yath_admin=' + ADMIN_TOKEN + '; Path=/; Max-Age=28800; HttpOnly; SameSite=Lax');
      return reply.code(302).header('location', '/').send();
    }
    if (key === 'salir') {
      reply.header('set-cookie', ['yath_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax', 'yath_preview=; Path=/; Max-Age=0; SameSite=Lax']);
      return reply.code(302).header('location', '/').send();
    }
    reply.code(401).header('content-type', 'text/html; charset=utf-8');
    return page('Admin', '<h1>Clave incorrecta</h1><p>Probá de nuevo desde el sitio.</p><a href="/">Volver</a>');
  });
  app.get('/api/pueblo/me', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return { ok: true, logged: false };
    const p = await puebloLoad(db, u);
    if (!p) return { ok: true, logged: true, char: null, heads: HEADS };
    decay(p, Date.now());
    return { ok: true, logged: true, char: { nick: p.nick, head: p.head, vida: Math.round(p.vida), hambre: Math.round(p.hambre), sueno: Math.round(p.sueno), x: p.x, y: p.y } };
  });

  app.post('/api/pueblo/crear', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const body = (req.body ?? {}) as { head?: unknown };
    const head = typeof body.head === 'string' && HEADS.indexOf(body.head) >= 0 ? body.head : 'o';
    await db.query('INSERT INTO pueblo_chars (user_id, head) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [u.id, head]);
    pueblo.delete(u.id);
    const p = await puebloLoad(db, u);
    return reply.code(201).send({ ok: true, char: p ? { nick: p.nick, head: p.head, vida: Math.round(p.vida), hambre: Math.round(p.hambre), sueno: Math.round(p.sueno) } : null });
  });

  app.post('/api/pueblo/tick', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const p = await puebloLoad(db, u);
    if (!p) return reply.code(404).send({ ok: false, error: 'sin_personaje' });
    const body = (req.body ?? {}) as { x?: unknown; y?: unknown; say?: unknown };
    const now = Date.now();
    decay(p, now);
    const x = Number(body.x), y = Number(body.y);
    if (Number.isFinite(x)) p.x = Math.max(0, Math.min(1, x));
    if (Number.isFinite(y)) p.y = Math.max(0, Math.min(1, y));
    const si = Math.floor(Number(body.say));
    if (Number.isInteger(si) && si >= 0 && si < PUEBLO_SAYS.length) { p.say = PUEBLO_SAYS[si] ?? ''; p.sayUntil = now + 4000; }
    p.nick = u.nick ?? p.nick;
    p.last = now;
    if (now - p.lastSave > 30000) await puebloSave(db, p);
    for (const [k, v] of pueblo) if (now - v.last > 15000) { await puebloSave(db, v); pueblo.delete(k); }
    const players: Array<{ nick: string; head: string; x: number; y: number; say: string }> = [];
    for (const v of pueblo.values()) players.push({ nick: v.nick, head: v.head, x: v.x, y: v.y, say: now < v.sayUntil ? v.say : '' });
    return { ok: true, you: { vida: Math.round(p.vida), hambre: Math.round(p.hambre), sueno: Math.round(p.sueno) }, players, n: players.length, says: PUEBLO_SAYS };
  });

  app.post('/api/pueblo/accion', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const p = await puebloLoad(db, u);
    if (!p) return reply.code(404).send({ ok: false, error: 'sin_personaje' });
    const tipo = ((req.body ?? {}) as { tipo?: unknown }).tipo;
    const now = Date.now();
    decay(p, now);
    if (tipo === 'comer') {
      if (p.x < CAFE_X0 || p.x > CAFE_X1) return reply.code(400).send({ ok: false, error: 'lejos', message: 'Acercate a la cafetería.' });
      if (now < p.cdComer) return reply.code(429).send({ ok: false, error: 'cd', message: 'Tristo: "Recién comiste. Esperá un toque."' });
      p.hambre = Math.min(100, p.hambre + 45); p.cdComer = now + 60000;
      await puebloSave(db, p);
      return { ok: true, hambre: Math.round(p.hambre), npc: NPC_LINES[Math.floor(Math.random() * NPC_LINES.length)] ?? '' };
    }
    if (tipo === 'dormir') {
      if (p.x < CASA_X0 || p.x > CASA_X1) return reply.code(400).send({ ok: false, error: 'lejos', message: 'Andá hasta la casa para dormir.' });
      if (now < p.cdDormir) return reply.code(429).send({ ok: false, error: 'cd', message: 'Ya dormiste hace nada.' });
      p.sueno = Math.min(100, p.sueno + 45); p.cdDormir = now + 60000;
      await puebloSave(db, p);
      return { ok: true, sueno: Math.round(p.sueno) };
    }
    if (tipo === 'hablar') {
      if (p.x < CAFE_X0 || p.x > CAFE_X1) return reply.code(400).send({ ok: false, error: 'lejos', message: 'Tristo está en la cafetería.' });
      return { ok: true, npc: NPC_LINES[Math.floor(Math.random() * NPC_LINES.length)] ?? '' };
    }
    return reply.code(400).send({ ok: false, error: 'accion' });
  });

  app.get('/pueblo', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('pueblo.html');
  });

  app.get('/tristos', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('tristos.html');
  });
  app.get('/', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const admin = isAdmin(req);
    if (admin && !LAUNCHED) reply.header('set-cookie', 'yath_preview=1; Path=/; Max-Age=28800; SameSite=Lax');
    return reply.sendFile((LAUNCHED || admin) ? 'index.html' : 'holding.html');
  });
  app.register(fastifyStatic, { root: join(__dirname, '..', 'public'), index: false });
  return app;
}

async function main(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) { console.error('[fatal] Falta DATABASE_URL'); process.exit(1); }
  const useSsl = shouldUseSsl(DATABASE_URL);
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: useSsl ? { rejectUnauthorized: false } : false, max: 5 });
  const db: Db = { query: (text, params) => pool.query(text, params as unknown[]) };
  await initDb(db);
  const app = buildApp(db);
  await app.listen({ port: PORT, host: HOST });
  console.log(`[youarethead] :${PORT} — OTP doble opt-in — mail=${process.env.RESEND_API_KEY ? 'on' : 'OFF'}`);
}
if (require.main === module) { main().catch((err) => { console.error(err); process.exit(1); }); }
