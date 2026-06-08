import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Pool } from 'pg';
import { createHash, randomBytes, randomInt, pbkdf2Sync } from 'node:crypto';
import { join } from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';
const GOAL = Number(process.env.WISHLIST_GOAL ?? 10000);
const IP_SALT = process.env.IP_SALT ?? 'youarethead-default-salt-cambiame';
const ONE_PER_IP = (process.env.ONE_PER_IP ?? 'true').toLowerCase() !== 'false';
const PUBLIC_URL = (process.env.PUBLIC_URL ?? 'https://youarethead.com.ar').replace(/\/+$/, '');
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'YOU ARE THE AD <noreply@youarethead.com.ar>';
const LAUNCHED = (process.env.LAUNCHED ?? 'true').toLowerCase() === 'true';
const ADMIN_KEY = process.env.ADMIN_KEY ?? '';
const ADMIN_TOKEN = ADMIN_KEY ? createHash('sha256').update('yath-admin:' + ADMIN_KEY + ':' + IP_SALT).digest('hex').slice(0, 32) : '';
const ADMIN_NICKS = new Set((process.env.ADMIN_NICKS ?? 'tristoban').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_REDIRECT = process.env.GOOGLE_REDIRECT ?? `${PUBLIC_URL}/api/auth/google/callback`;
const GOOGLE_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS ?? 'matiasivanponcedeleon@gmail.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const FOUNDER_MAX = Number(process.env.FOUNDER_MAX ?? 100);

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
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS bio TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS pin_hash TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS recovery_hash TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS banned_reason TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS google_sub TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS avatar TEXT;`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS hub_users_google_uidx ON hub_users (google_sub) WHERE google_sub IS NOT NULL;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS muted_reason TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS banner TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS accent TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS estado TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS location TEXT;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS pinned BIGINT;`);
  await db.query(`CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT);`);
  await db.query(`ALTER TABLE hub_users ALTER COLUMN email DROP NOT NULL;`);
  await db.query(`ALTER TABLE hub_users ALTER COLUMN email_norm DROP NOT NULL;`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS amigos (
      id BIGSERIAL PRIMARY KEY,
      a BIGINT NOT NULL,
      b BIGINT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS amigos_ab_uidx ON amigos (a, b);`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS dms (
      id BIGSERIAL PRIMARY KEY,
      de BIGINT NOT NULL,
      para BIGINT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS dms_pair_idx ON dms (de, para, id);`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      nick TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS grupos (
      id BIGSERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      creador BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS grupo_miembros (
      grupo_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (grupo_id, user_id)
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS grupo_msgs (
      id BIGSERIAL PRIMARY KEY,
      grupo_id BIGINT NOT NULL,
      de BIGINT NOT NULL,
      nick TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS grupo_msgs_idx ON grupo_msgs (grupo_id, id);`);
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
  const { rows } = await db.query('SELECT count(*) AS c FROM hub_users WHERE nick IS NOT NULL');
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

async function hubUserBySession(db: Db, req: FastifyRequest): Promise<{ id: number; nick: string | null; muted: boolean } | null> {
  const c = req.headers.cookie;
  if (typeof c !== 'string') return null;
  const m = c.split(';').map((s) => s.trim()).find((s) => s.startsWith('yath_sess='));
  if (!m) return null;
  const tok = m.slice(10);
  if (!tok || tok.length < 20) return null;
  const { rows } = await db.query('SELECT id, nick, banned, muted FROM hub_users WHERE session = $1', [tok]);
  const r = rows[0];
  if (!r || r.banned === true) return null;
  return { id: Number(r.id), nick: (r.nick as string | null) ?? null, muted: r.muted === true };
}

function isAdminNick(nick: string | null | undefined): boolean { return !!nick && ADMIN_NICKS.has(nick.toLowerCase()); }
function isAdminEmail(email: unknown): boolean { return typeof email === 'string' && ADMIN_EMAILS.has(email.toLowerCase()); }
async function adminUser(db: Db, req: FastifyRequest): Promise<{ id: number; nick: string } | null> {
  const u = await hubUserBySession(db, req);
  if (!u) return null;
  if (isAdminNick(u.nick)) return { id: u.id, nick: u.nick || '' };
  const e = await db.query('SELECT email FROM hub_users WHERE id = $1', [u.id]);
  if (isAdminEmail(e.rows[0]?.email)) return { id: u.id, nick: u.nick || '' };
  return null;
}

// ---- Google OAuth (login único) ----
const SESS_COOKIE = (sess: string) => 'yath_sess=' + sess + '; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax';
function redir(reply: FastifyReply, url: string): FastifyReply { return reply.code(302).header('location', url).send(); }
const oauthState = new Map<string, { ret: string; ts: number }>();
const oauthPending = new Map<string, { sub: string; email: string; name: string; avatar: string; ts: number }>();
function cleanupOauth(): void {
  const now = Date.now();
  for (const [k, v] of oauthState) if (now - v.ts > 600000) oauthState.delete(k);
  for (const [k, v] of oauthPending) if (now - v.ts > 600000) oauthPending.delete(k);
}
function safeReturn(p: unknown): string { return typeof p === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(p) && !p.startsWith('//') ? p : '/perfil'; }
function readCookie(req: FastifyRequest, name: string): string {
  const c = req.headers.cookie;
  if (typeof c !== 'string') return '';
  const m = c.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return m ? m.slice(name.length + 1) : '';
}
function suggestNick(name: string, email: string): string {
  const base = (name || email.split('@')[0] || 'user').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 12);
  return base.length >= 2 ? base : 'user';
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

async function sendHubCode(_to: string, _code: string): Promise<boolean> {
  // Login por mail DISCONTINUADO. Nunca se envía mail (sin cuota Resend). Se mantiene la firma por compat.
  return false;
}
function getClientIp(req: FastifyRequest): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) { const first = xff.split(',')[0]; if (first && first.trim()) return first.trim(); }
  return req.ip;
}
function hashIp(ip: string): string { return createHash('sha256').update(`${IP_SALT}:${ip}`).digest('hex'); }
function pinHash(pin: string, nickNorm: string): string { return pbkdf2Sync(pin, `${IP_SALT}:${nickNorm}`, 60000, 32, 'sha256').toString('hex'); }
function recoveryHash(code: string): string { return createHash('sha256').update(`${IP_SALT}:rec:${code}`).digest('hex'); }
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

async function sendConfirmEmail(_to: string, _code: string, _token: string): Promise<boolean> {
  // Wishlist por mail DISCONTINUADA. Anotarse = crear cuenta. Nunca se envía mail (sin cuota Resend).
  return false;
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
  const dmRate = new Map<number, number>();
  const postRate = new Map<number, number>();
  const pinRate = new Map<string, number>();
  const pinFails = new Map<string, { n: number; until: number }>();
  async function userByNick(nickRaw: string): Promise<{ id: number; nick: string } | null> {
    const n = nickRaw.trim().toLowerCase();
    if (!n) return null;
    const { rows } = await db.query('SELECT id, nick FROM hub_users WHERE nick_norm = $1', [n]);
    const r = rows[0];
    return r ? { id: Number(r.id), nick: String(r.nick) } : null;
  }
  async function sonAmigos(x: number, y: number): Promise<boolean> {
    const { rows } = await db.query("SELECT 1 AS k FROM amigos WHERE ((a = $1 AND b = $2) OR (a = $2 AND b = $1)) AND estado = 'aceptado'", [x, y]);
    return rows.length > 0;
  }
  async function esMiembro(gid: number, uid: number): Promise<boolean> {
    const { rows } = await db.query('SELECT 1 AS k FROM grupo_miembros WHERE grupo_id = $1 AND user_id = $2', [gid, uid]);
    return rows.length > 0;
  }
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

  app.get('/api/rank', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const q = (req.query ?? {}) as { game?: unknown; score?: unknown };
    const game = q.game === 'parpadeo' ? 'parpadeo' : 'tetristo';
    const sc = Math.floor(Number(q.score));
    const score = Number.isInteger(sc) && sc >= 0 ? sc : 0;
    const gt = await db.query('SELECT count(*) AS c FROM scores WHERE game = $1 AND score > $2', [game, score]);
    const tot = await db.query('SELECT count(*) AS c FROM scores WHERE game = $1', [game]);
    const rank = Number((gt.rows[0]?.c as string | number | bigint | undefined) ?? 0) + 1;
    const total = Number((tot.rows[0]?.c as string | number | bigint | undefined) ?? 0);
    return { ok: true, rank, total };
  });

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
    const hubU = await hubUserBySession(db, req);
    if (hubU && hubU.muted) return reply.code(403).send({ ok: false, error: 'muted', message: 'Estás silenciado.' });
    let lockedName = chatNames.get(ipHash);
    if (hubU && hubU.nick) { name = hubU.nick; lockedName = name; }
    else if (lockedName) name = lockedName;
    if (offensiveAlias(name) || offensiveText(text)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Esa no va.' });
    if (!hubU && name !== 'ANÓN' && lockedName !== name) {
      const resv = await db.query('SELECT 1 AS x FROM hub_users WHERE nick_norm = $1', [name.toLowerCase()]);
      if (resv.rows.length > 0) return reply.code(409).send({ ok: false, error: 'reservado', message: 'Ese nick está reservado. Entrá con tu mail para usarlo.' });
    }
    const now = Date.now();
    const last = chatRate.get(ipHash) ?? 0;
    if (now - last < 1500) return reply.code(429).send({ ok: false, error: 'slow', message: 'Pará un toque.' });
    chatRate.set(ipHash, now);
    if (!hubU && !lockedName && name !== 'ANÓN') chatNames.set(ipHash, name);
    const ins = await db.query('INSERT INTO chat_messages (name, body, ip_hash) VALUES ($1, $2, $3) RETURNING id, created_at', [name, text, ipHash]);
    const row = ins.rows[0];
    return reply.code(201).send({ ok: true, message: { id: Number(row?.id ?? 0), name, body: text, t: row?.created_at }, nameLocked: !!(hubU && hubU.nick) || chatNames.has(ipHash) });
  });

  app.post('/api/hub/login', async (_req, reply) => {
    // Login por mail discontinuado. Entrá con nick + PIN, o migrá tu cuenta vieja en /api/hub/claim.
    return reply.code(410).send({ ok: false, error: 'mail_discontinued', message: 'El login por mail se discontinuó. Entrá con tu nick + PIN. Si tu cuenta es vieja y no tiene PIN, reclamala con tu nick.' });
  });

  app.post('/api/hub/registrar', async (_req, reply) => reply.code(410).send({ ok: false, error: 'pin_off', message: 'Ahora se entra solo con Google.' }));

  app.post('/api/hub/claim', async (_req, reply) => reply.code(410).send({ ok: false, error: 'pin_off', message: 'Ahora se entra solo con Google. Si tenías cuenta, vinculala al entrar.' }));

  app.get('/api/auth/google', async (req, reply) => {
    if (!GOOGLE_ENABLED) return redir(reply, '/perfil?oauth=off');
    cleanupOauth();
    const ret = safeReturn((req.query as { return?: unknown })?.return);
    const state = randomBytes(16).toString('hex');
    oauthState.set(state, { ret, ts: Date.now() });
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    u.searchParams.set('redirect_uri', GOOGLE_REDIRECT);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'openid email profile');
    u.searchParams.set('state', state);
    u.searchParams.set('prompt', 'select_account');
    return redir(reply, u.toString());
  });

  app.get('/api/auth/google/callback', async (req, reply) => {
    if (!GOOGLE_ENABLED) return redir(reply, '/perfil?oauth=off');
    cleanupOauth();
    const q = (req.query ?? {}) as { code?: unknown; state?: unknown; error?: unknown };
    const code = typeof q.code === 'string' ? q.code : '';
    const state = typeof q.state === 'string' ? q.state : '';
    const st = state ? oauthState.get(state) : undefined;
    if (q.error || !code || !st) return redir(reply, '/perfil?oauth=error');
    oauthState.delete(state);
    const ret = st.ret;
    let profile: { sub: string; email: string; verified: boolean; name: string; picture: string } | null = null;
    try {
      const tok = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT, grant_type: 'authorization_code' }).toString(),
      });
      if (!tok.ok) return redir(reply, '/perfil?oauth=error');
      const tj = (await tok.json()) as { access_token?: string };
      if (!tj.access_token) return redir(reply, '/perfil?oauth=error');
      const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tj.access_token}` } });
      if (!ui.ok) return redir(reply, '/perfil?oauth=error');
      const uj = (await ui.json()) as Record<string, unknown>;
      profile = { sub: String(uj.sub ?? ''), email: String(uj.email ?? ''), verified: uj.email_verified === true || uj.email_verified === 'true', name: String(uj.name ?? ''), picture: String(uj.picture ?? '') };
    } catch { return redir(reply, '/perfil?oauth=error'); }
    if (!profile.sub) return redir(reply, '/perfil?oauth=error');
    const sub = profile.sub;
    const bySub = await db.query('SELECT id, nick, banned FROM hub_users WHERE google_sub = $1', [sub]);
    const subRow = bySub.rows[0];
    if (subRow) {
      if (subRow.banned === true) return redir(reply, '/perfil?oauth=banned');
      const sess = newToken();
      await db.query('UPDATE hub_users SET session = $2, avatar = COALESCE(avatar, $3) WHERE id = $1', [subRow.id, sess, profile.picture || null]);
      reply.header('set-cookie', SESS_COOKIE(sess));
      return redir(reply, ret);
    }
    if (profile.verified && profile.email) {
      const byMail = await db.query('SELECT id, nick, banned, google_sub FROM hub_users WHERE email_norm = $1', [profile.email.toLowerCase()]);
      const mr = byMail.rows[0];
      if (mr && !mr.google_sub) {
        if (mr.banned === true) return redir(reply, '/perfil?oauth=banned');
        const sess = newToken();
        await db.query('UPDATE hub_users SET google_sub = $2, session = $3, avatar = COALESCE(avatar, $4) WHERE id = $1', [mr.id, sub, sess, profile.picture || null]);
        reply.header('set-cookie', SESS_COOKIE(sess));
        return redir(reply, ret + (ret.includes('?') ? '&' : '?') + 'oauth=migrated');
      }
    }
    const pid = randomBytes(16).toString('hex');
    oauthPending.set(pid, { sub, email: profile.email, name: profile.name, avatar: profile.picture, ts: Date.now() });
    reply.header('set-cookie', `yath_oauth=${pid}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`);
    return redir(reply, '/perfil?oauth=setup');
  });

  app.get('/api/auth/google/pending', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const pid = readCookie(req, 'yath_oauth');
    const p = pid ? oauthPending.get(pid) : undefined;
    if (!p) return { ok: false };
    return { ok: true, email: p.email, suggest: suggestNick(p.name, p.email) };
  });

  app.post('/api/auth/google/new', async (req, reply) => {
    const pid = readCookie(req, 'yath_oauth');
    const p = pid ? oauthPending.get(pid) : undefined;
    if (!p) return reply.code(440).send({ ok: false, error: 'expired', message: 'Se venció el ingreso con Google. Entrá de nuevo.' });
    const nick = typeof ((req.body ?? {}) as { nick?: unknown }).nick === 'string' ? ((req.body) as { nick: string }).nick.replace(/\s+/g, ' ').trim().slice(0, 14).trim() : '';
    if (nick.length < 2) return reply.code(400).send({ ok: false, error: 'bad_nick', message: 'Nick muy corto (2-14).' });
    if (offensiveAlias(nick) || offensiveText(nick)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Ese nick no va.' });
    const nickNorm = nick.toLowerCase();
    const ex = await db.query('SELECT 1 AS k FROM hub_users WHERE nick_norm = $1', [nickNorm]);
    if (ex.rows.length) return reply.code(409).send({ ok: false, error: 'taken', message: 'Ese nick ya está tomado.' });
    let email: string | null = p.email || null;
    let emailNorm: string | null = email ? email.toLowerCase() : null;
    if (emailNorm) { const e2 = await db.query('SELECT 1 AS k FROM hub_users WHERE email_norm = $1', [emailNorm]); if (e2.rows.length) { email = null; emailNorm = null; } }
    const sess = newToken();
    await db.query('INSERT INTO hub_users (nick, nick_norm, google_sub, email, email_norm, session, avatar) VALUES ($1, $2, $3, $4, $5, $6, $7)', [nick, nickNorm, p.sub, email, emailNorm, sess, p.avatar || null]);
    oauthPending.delete(pid);
    reply.header('set-cookie', [SESS_COOKIE(sess), 'yath_oauth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);
    return reply.code(201).send({ ok: true, logged: true, nick });
  });

  app.post('/api/auth/google/link', async (req, reply) => {
    const pid = readCookie(req, 'yath_oauth');
    const p = pid ? oauthPending.get(pid) : undefined;
    if (!p) return reply.code(440).send({ ok: false, error: 'expired', message: 'Se venció el ingreso con Google. Entrá de nuevo.' });
    const body = (req.body ?? {}) as { nick?: unknown; pin?: unknown };
    const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!nick || !/^[0-9]{4,6}$/.test(pin)) return reply.code(400).send({ ok: false, error: 'bad', message: 'Poné tu nick viejo y tu PIN.' });
    const nickNorm = nick.toLowerCase();
    const { rows } = await db.query('SELECT id, nick, pin_hash, google_sub, banned FROM hub_users WHERE nick_norm = $1', [nickNorm]);
    const row = rows[0];
    if (!row) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese nick.' });
    if (row.banned === true) return reply.code(403).send({ ok: false, error: 'banned', message: 'Esa cuenta está suspendida.' });
    if (row.google_sub) return reply.code(409).send({ ok: false, error: 'linked', message: 'Esa cuenta ya está vinculada a otro Google.' });
    if (!row.pin_hash || String(row.pin_hash) !== pinHash(pin, nickNorm)) return reply.code(401).send({ ok: false, error: 'bad_login', message: 'Nick o PIN incorrecto. Si nunca tuviste PIN, entrá como cuenta nueva.' });
    const sess = newToken();
    await db.query('UPDATE hub_users SET google_sub = $2, session = $3, avatar = COALESCE(avatar, $4) WHERE id = $1', [row.id, p.sub, sess, p.avatar || null]);
    oauthPending.delete(pid);
    reply.header('set-cookie', [SESS_COOKIE(sess), 'yath_oauth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);
    return reply.code(200).send({ ok: true, logged: true, nick: row.nick });
  });

  app.post('/api/hub/pin-login', async (_req, reply) => reply.code(410).send({ ok: false, error: 'pin_off', message: 'Ahora se entra solo con Google.' }));

  app.post('/api/hub/pin', async (_req, reply) => reply.code(410).send({ ok: false, error: 'pin_off', message: 'Ahora se entra solo con Google.' }));

  app.post('/api/hub/recuperar', async (_req, reply) => reply.code(410).send({ ok: false, error: 'pin_off', message: 'Ahora se entra solo con Google.' }));

  app.post('/api/hub/verify', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown; code?: unknown };
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
    if (!EMAIL_RE.test(emailRaw) || code.length !== 6) return reply.code(400).send({ ok: false, error: 'bad_code', message: 'Datos inválidos.' });
    const { rows } = await db.query('SELECT id, nick, code, code_attempts, banned, (code_expires > now()) AS valid FROM hub_users WHERE email_norm = $1', [emailRaw.toLowerCase()]);
    const row = rows[0];
    if (!row) return reply.code(404).send({ ok: false, error: 'not_found', message: 'Pedí un código primero.' });
    if (row.banned === true) return reply.code(403).send({ ok: false, error: 'banned', message: 'Tu cuenta está suspendida.' });
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
    if (!u) return { ok: true, logged: false, nick: null };
    const det = await db.query('SELECT email, bio, created_at, pin_hash, avatar, banner, accent, estado, location, links, pinned FROM hub_users WHERE id = $1', [u.id]);
    const r = det.rows[0] ?? {};
    let caido = 0;
    const c = await db.query('SELECT (SELECT count(*) FROM boton_caidos b2 WHERE b2.id <= b.id) AS n FROM boton_caidos b WHERE b.user_id = $1', [u.id]);
    if (c.rows[0]) caido = Number(c.rows[0].n ?? 0);
    const nl = (u.nick ?? '').toLowerCase();
    const bt = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'tetristo' AND lower(alias) = $1", [nl]);
    const bp = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'parpadeo' AND lower(alias) = $1", [nl]);
    const ch = await db.query('SELECT head, vida, hambre, sueno FROM pueblo_chars WHERE user_id = $1', [u.id]);
    const cr = ch.rows[0];
    return {
      ok: true, logged: true, nick: u.nick, admin: isAdminNick(u.nick) || isAdminEmail(r.email),
      email: String(r.email ?? ''), pin: !!r.pin_hash, avatar: (r.avatar as string | null) ?? null,
      banner: (r.banner as string | null) ?? null, accent: (r.accent as string | null) ?? null, estado: (r.estado as string | null) ?? '', location: (r.location as string | null) ?? '', links: (r.links as unknown) ?? [], pinned: r.pinned ? Number(r.pinned) : null, founder: u.id <= FOUNDER_MAX,
      bio: (r.bio as string | null) ?? '', desde: r.created_at ?? null, caido,
      best: { tetristo: Number(bt.rows[0]?.s ?? 0) || 0, parpadeo: Number(bp.rows[0]?.s ?? 0) || 0 },
      char: cr ? { head: String(cr.head ?? 'o'), vida: Math.round(Number(cr.vida ?? 0)), hambre: Math.round(Number(cr.hambre ?? 0)), sueno: Math.round(Number(cr.sueno ?? 0)) } : null,
    };
  });

  app.post('/api/hub/bio', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const body = (req.body ?? {}) as { bio?: unknown };
    const bio = typeof body.bio === 'string' ? body.bio.replace(/\s+/g, ' ').trim().slice(0, 140).trim() : '';
    if (offensiveText(bio)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Esa bio no va.' });
    await db.query('UPDATE hub_users SET bio = $2 WHERE id = $1', [u.id, bio]);
    return { ok: true, bio };
  });

  app.post('/api/hub/avatar', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const raw = ((req.body ?? {}) as { dataUrl?: unknown }).dataUrl;
    if (raw === null || raw === '') { await db.query('UPDATE hub_users SET avatar = NULL WHERE id = $1', [u.id]); return { ok: true, avatar: null }; }
    const dataUrl = typeof raw === 'string' ? raw : '';
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return reply.code(400).send({ ok: false, error: 'bad_img', message: 'Imagen inválida.' });
    if (dataUrl.length > 300000) return reply.code(413).send({ ok: false, error: 'too_big', message: 'La foto es muy pesada. Probá una más chica.' });
    await db.query('UPDATE hub_users SET avatar = $2 WHERE id = $1', [u.id, dataUrl]);
    return { ok: true, avatar: dataUrl };
  });

  app.get('/api/admin/users', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const qr = (req.query ?? {}) as { q?: unknown };
    const q = typeof qr.q === 'string' ? qr.q.trim().toLowerCase() : '';
    const rows = q
      ? (await db.query("SELECT nick, banned, banned_reason, muted, created_at FROM hub_users WHERE nick IS NOT NULL AND nick_norm LIKE $1 ORDER BY banned DESC, muted DESC, created_at DESC LIMIT 60", ['%' + q + '%'])).rows
      : (await db.query("SELECT nick, banned, banned_reason, muted, created_at FROM hub_users WHERE nick IS NOT NULL ORDER BY created_at DESC LIMIT 60")).rows;
    const users = rows.map((r) => ({ nick: r.nick, banned: r.banned === true, muted: r.muted === true, reason: (r.banned_reason as string | null) ?? '', desde: r.created_at ?? null, admin: isAdminNick(r.nick as string) }));
    return { ok: true, users };
  });

  app.post('/api/admin/ban', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const body = (req.body ?? {}) as { nick?: unknown; reason?: unknown };
    const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad', message: 'Falta el nick.' });
    const nickNorm = nick.toLowerCase();
    if (isAdminNick(nickNorm)) return reply.code(400).send({ ok: false, error: 'is_admin', message: 'No podés banear a un admin.' });
    const { rows } = await db.query('UPDATE hub_users SET banned = true, banned_reason = $2, banned_at = now(), session = NULL WHERE nick_norm = $1 RETURNING nick', [nickNorm, reason || null]);
    if (!rows.length) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese nick.' });
    return { ok: true, nick: rows[0]?.nick ?? nick, banned: true };
  });

  app.post('/api/admin/unban', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const body = (req.body ?? {}) as { nick?: unknown };
    const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad', message: 'Falta el nick.' });
    const { rows } = await db.query('UPDATE hub_users SET banned = false, banned_reason = NULL, banned_at = NULL WHERE nick_norm = $1 RETURNING nick', [nick.toLowerCase()]);
    if (!rows.length) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese nick.' });
    return { ok: true, nick: rows[0]?.nick ?? nick, banned: false };
  });

  app.post('/api/admin/mute', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const nick = typeof ((req.body ?? {}) as { nick?: unknown }).nick === 'string' ? ((req.body) as { nick: string }).nick.trim() : '';
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad', message: 'Falta el nick.' });
    if (isAdminNick(nick.toLowerCase())) return reply.code(400).send({ ok: false, error: 'is_admin', message: 'No podés silenciar a un admin.' });
    const { rows } = await db.query('UPDATE hub_users SET muted = true WHERE nick_norm = $1 RETURNING nick', [nick.toLowerCase()]);
    if (!rows.length) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese nick.' });
    return { ok: true, nick: rows[0]?.nick ?? nick, muted: true };
  });

  app.post('/api/admin/unmute', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const nick = typeof ((req.body ?? {}) as { nick?: unknown }).nick === 'string' ? ((req.body) as { nick: string }).nick.trim() : '';
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad', message: 'Falta el nick.' });
    const { rows } = await db.query('UPDATE hub_users SET muted = false WHERE nick_norm = $1 RETURNING nick', [nick.toLowerCase()]);
    if (!rows.length) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese nick.' });
    return { ok: true, nick: rows[0]?.nick ?? nick, muted: false };
  });

  app.post('/api/admin/config', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const body = (req.body ?? {}) as { video?: unknown };
    const video = typeof body.video === 'string' ? body.video.trim().slice(0, 400) : '';
    if (video && !/^https?:\/\//.test(video)) return reply.code(400).send({ ok: false, error: 'bad_url', message: 'La URL tiene que empezar con http(s).' });
    await db.query("INSERT INTO site_config (key, value) VALUES ('latest_video', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [video || null]);
    return { ok: true, video };
  });

  app.get('/api/config', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    const { rows } = await db.query("SELECT value FROM site_config WHERE key = 'latest_video'");
    return { ok: true, video: (rows[0]?.value as string | null) ?? '' };
  });

  app.get('/api/social/perfil', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const nick = String(((req.query ?? {}) as { nick?: unknown }).nick ?? '').trim();
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad' });
    const { rows } = await db.query('SELECT id, nick, avatar, banner, accent, bio, estado, location, links, pinned, created_at FROM hub_users WHERE nick_norm = $1', [nick.toLowerCase()]);
    const r = rows[0];
    if (!r) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese perfil.' });
    const uid = Number(r.id);
    const meU = await hubUserBySession(db, req);
    const nl = String(r.nick ?? '').toLowerCase();
    const bt = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'tetristo' AND lower(alias) = $1", [nl]);
    const bp = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'parpadeo' AND lower(alias) = $1", [nl]);
    const fc = await db.query("SELECT count(*) AS c FROM amigos WHERE (a = $1 OR b = $1) AND estado = 'aceptado'", [uid]);
    const ca = await db.query('SELECT (SELECT count(*) FROM boton_caidos b2 WHERE b2.id <= b.id) AS n FROM boton_caidos b WHERE b.user_id = $1', [uid]);
    const posts = (await db.query('SELECT id, nick, body, created_at FROM posts WHERE user_id = $1 ORDER BY id DESC LIMIT 20', [uid])).rows.map((p) => ({ id: Number(p.id), nick: p.nick, body: p.body, t: p.created_at, avatar: (r.avatar as string | null) ?? null }));
    let pinned: Record<string, unknown> | null = null;
    if (r.pinned) { const pp = (await db.query('SELECT id, nick, body, created_at FROM posts WHERE id = $1 AND user_id = $2', [Number(r.pinned), uid])).rows[0]; if (pp) pinned = { id: Number(pp.id), nick: pp.nick, body: pp.body, t: pp.created_at, avatar: (r.avatar as string | null) ?? null }; }
    let rel = 'none';
    if (meU) { if (meU.id === uid) rel = 'me'; else { const am = await db.query('SELECT estado FROM amigos WHERE (a = $1 AND b = $2) OR (a = $2 AND b = $1)', [meU.id, uid]); const ar = am.rows[0]; if (ar) rel = ar.estado === 'aceptado' ? 'amigos' : 'pendiente'; } }
    return { ok: true, perfil: {
      nick: r.nick, avatar: (r.avatar as string | null) ?? null, banner: (r.banner as string | null) ?? null, accent: (r.accent as string | null) ?? null,
      bio: (r.bio as string | null) ?? '', estado: (r.estado as string | null) ?? '', location: (r.location as string | null) ?? '', links: (r.links as unknown) ?? [],
      desde: r.created_at ?? null, founder: uid <= FOUNDER_MAX, admin: isAdminNick(r.nick as string),
      best: { tetristo: Number(bt.rows[0]?.s ?? 0) || 0, parpadeo: Number(bp.rows[0]?.s ?? 0) || 0 },
      amigos: Number(fc.rows[0]?.c ?? 0) || 0, caido: ca.rows[0] ? Number(ca.rows[0].n ?? 0) : 0,
      posts, pinned, rel,
    } };
  });

  app.post('/api/hub/profile', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const b = (req.body ?? {}) as { bio?: unknown; estado?: unknown; location?: unknown; accent?: unknown; links?: unknown };
    const bio = typeof b.bio === 'string' ? b.bio.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    const estado = typeof b.estado === 'string' ? b.estado.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const location = typeof b.location === 'string' ? b.location.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    const accent = typeof b.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.accent.trim()) ? b.accent.trim() : null;
    if (offensiveText(bio) || offensiveText(estado) || offensiveText(location)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Eso no va.' });
    const links: { title: string; url: string }[] = [];
    if (Array.isArray(b.links)) {
      for (const it of b.links.slice(0, 12)) {
        const o = (it ?? {}) as { title?: unknown; url?: unknown };
        const t = typeof o.title === 'string' ? o.title.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
        const url = typeof o.url === 'string' ? o.url.trim().slice(0, 300) : '';
        if (t && /^https?:\/\//.test(url)) links.push({ title: t, url });
      }
    }
    if (links.some((l) => offensiveText(l.title))) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Un link no va.' });
    await db.query('UPDATE hub_users SET bio = $2, estado = $3, location = $4, accent = $5, links = $6::jsonb WHERE id = $1', [u.id, bio, estado, location, accent, JSON.stringify(links)]);
    return { ok: true, bio, estado, location, accent, links };
  });

  app.post('/api/hub/banner', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const raw = ((req.body ?? {}) as { dataUrl?: unknown }).dataUrl;
    if (raw === null || raw === '') { await db.query('UPDATE hub_users SET banner = NULL WHERE id = $1', [u.id]); return { ok: true, banner: null }; }
    const dataUrl = typeof raw === 'string' ? raw : '';
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return reply.code(400).send({ ok: false, error: 'bad_img', message: 'Imagen inválida.' });
    if (dataUrl.length > 500000) return reply.code(413).send({ ok: false, error: 'too_big', message: 'El banner es muy pesado. Probá una más chica.' });
    await db.query('UPDATE hub_users SET banner = $2 WHERE id = $1', [u.id, dataUrl]);
    return { ok: true, banner: dataUrl };
  });

  app.post('/api/hub/pin-post', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const raw = ((req.body ?? {}) as { id?: unknown }).id;
    if (raw === null) { await db.query('UPDATE hub_users SET pinned = NULL WHERE id = $1', [u.id]); return { ok: true, pinned: null }; }
    const pid = Math.floor(Number(raw));
    if (!Number.isInteger(pid) || pid <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const own = await db.query('SELECT 1 FROM posts WHERE id = $1 AND user_id = $2', [pid, u.id]);
    if (!own.rows.length) return reply.code(404).send({ ok: false, error: 'not_found', message: 'Ese post no es tuyo.' });
    await db.query('UPDATE hub_users SET pinned = $2 WHERE id = $1', [u.id, pid]);
    return { ok: true, pinned: pid };
  });

  app.get('/api/social/usuarios', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const q = String(((req.query ?? {}) as { q?: unknown }).q ?? '').trim().toLowerCase().slice(0, 14);
    if (q.length < 2) return { ok: true, usuarios: [] };
    const { rows } = await db.query("SELECT nick FROM hub_users WHERE nick_norm LIKE $1 || '%' AND nick IS NOT NULL AND id <> $2 LIMIT 8", [q, u.id]);
    return { ok: true, usuarios: rows.map((r) => r.nick) };
  });

  app.post('/api/social/amigos/pedir', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const otro = await userByNick(String(((req.body ?? {}) as { nick?: unknown }).nick ?? ''));
    if (!otro) return reply.code(404).send({ ok: false, error: 'no_existe', message: 'No existe ese nick.' });
    if (otro.id === u.id) return reply.code(400).send({ ok: false, error: 'vos', message: 'Sos vos.' });
    const ex = await db.query('SELECT id, estado, a FROM amigos WHERE (a = $1 AND b = $2) OR (a = $2 AND b = $1)', [u.id, otro.id]);
    const row = ex.rows[0];
    if (row) {
      if (row.estado === 'aceptado') return { ok: true, estado: 'amigos', message: 'Ya son amigos.' };
      if (Number(row.a) === otro.id) { await db.query("UPDATE amigos SET estado = 'aceptado' WHERE id = $1", [row.id]); return { ok: true, estado: 'amigos', message: 'Te había pedido: ahora son amigos.' }; }
      return { ok: true, estado: 'pendiente', message: 'Ya estaba pedido.' };
    }
    await db.query("INSERT INTO amigos (a, b, estado) VALUES ($1, $2, 'pendiente')", [u.id, otro.id]);
    return reply.code(201).send({ ok: true, estado: 'pendiente', message: 'Solicitud enviada.' });
  });

  app.post('/api/social/amigos/responder', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const body = (req.body ?? {}) as { nick?: unknown; aceptar?: unknown };
    const otro = await userByNick(String(body.nick ?? ''));
    if (!otro) return reply.code(404).send({ ok: false, error: 'no_existe' });
    const ex = await db.query("SELECT id FROM amigos WHERE a = $1 AND b = $2 AND estado = 'pendiente'", [otro.id, u.id]);
    const row = ex.rows[0];
    if (!row) return reply.code(404).send({ ok: false, error: 'sin_pedido' });
    if (body.aceptar === true) { await db.query("UPDATE amigos SET estado = 'aceptado' WHERE id = $1", [row.id]); return { ok: true, estado: 'amigos' }; }
    await db.query('DELETE FROM amigos WHERE id = $1', [row.id]);
    return { ok: true, estado: 'rechazado' };
  });

  app.get('/api/social/amigos', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const am = await db.query("SELECT CASE WHEN m.a = $1 THEN ub.nick ELSE ua.nick END AS nick FROM amigos m JOIN hub_users ua ON ua.id = m.a JOIN hub_users ub ON ub.id = m.b WHERE (m.a = $1 OR m.b = $1) AND m.estado = 'aceptado' ORDER BY m.created_at DESC", [u.id]);
    const rec = await db.query("SELECT ua.nick FROM amigos m JOIN hub_users ua ON ua.id = m.a WHERE m.b = $1 AND m.estado = 'pendiente'", [u.id]);
    const env = await db.query("SELECT ub.nick FROM amigos m JOIN hub_users ub ON ub.id = m.b WHERE m.a = $1 AND m.estado = 'pendiente'", [u.id]);
    return { ok: true, amigos: am.rows.map((r) => r.nick), recibidas: rec.rows.map((r) => r.nick), enviadas: env.rows.map((r) => r.nick) };
  });

  app.get('/api/social/dm', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const q = (req.query ?? {}) as { con?: unknown; since?: unknown };
    const otro = await userByNick(String(q.con ?? ''));
    if (!otro) return reply.code(404).send({ ok: false, error: 'no_existe' });
    if (!(await sonAmigos(u.id, otro.id))) return reply.code(403).send({ ok: false, error: 'no_amigos', message: 'Tienen que ser amigos.' });
    const since = Math.floor(Number(q.since));
    if (Number.isFinite(since) && since > 0) {
      const { rows } = await db.query('SELECT id, de, body, created_at FROM dms WHERE ((de = $1 AND para = $2) OR (de = $2 AND para = $1)) AND id > $3 ORDER BY id ASC LIMIT 100', [u.id, otro.id, since]);
      return { ok: true, mensajes: rows.map((r) => ({ id: Number(r.id), mio: Number(r.de) === u.id, body: r.body, t: r.created_at })) };
    }
    const { rows } = await db.query('SELECT id, de, body, created_at FROM dms WHERE (de = $1 AND para = $2) OR (de = $2 AND para = $1) ORDER BY id DESC LIMIT 50', [u.id, otro.id]);
    return { ok: true, mensajes: rows.reverse().map((r) => ({ id: Number(r.id), mio: Number(r.de) === u.id, body: r.body, t: r.created_at })) };
  });

  app.post('/api/social/dm', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const body = (req.body ?? {}) as { nick?: unknown; body?: unknown };
    if (u.muted) return reply.code(403).send({ ok: false, error: 'muted', message: 'Estás silenciado.' });
    const otro = await userByNick(String(body.nick ?? ''));
    if (!otro) return reply.code(404).send({ ok: false, error: 'no_existe' });
    if (!(await sonAmigos(u.id, otro.id))) return reply.code(403).send({ ok: false, error: 'no_amigos', message: 'Tienen que ser amigos.' });
    const text = typeof body.body === 'string' ? body.body.replace(/\s+/g, ' ').trim().slice(0, 300).trim() : '';
    if (!text) return reply.code(400).send({ ok: false, error: 'empty' });
    if (offensiveText(text)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Eso no va.' });
    const now = Date.now();
    const last = dmRate.get(u.id) ?? 0;
    if (now - last < 1200) return reply.code(429).send({ ok: false, error: 'slow' });
    dmRate.set(u.id, now);
    const ins = await db.query('INSERT INTO dms (de, para, body) VALUES ($1, $2, $3) RETURNING id, created_at', [u.id, otro.id, text]);
    const row = ins.rows[0];
    return reply.code(201).send({ ok: true, mensaje: { id: Number(row?.id ?? 0), mio: true, body: text, t: row?.created_at } });
  });

  app.get('/api/social/feed', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const scope = ((req.query ?? {}) as { scope?: unknown }).scope;
    let rows;
    if (scope === 'amigos') {
      rows = (await db.query("SELECT p.id, p.nick, p.body, p.created_at, u.avatar FROM posts p LEFT JOIN hub_users u ON u.id = p.user_id WHERE p.user_id = $1 OR p.user_id IN (SELECT CASE WHEN a = $1 THEN b ELSE a END FROM amigos WHERE (a = $1 OR b = $1) AND estado = 'aceptado') ORDER BY p.id DESC LIMIT 30", [u.id])).rows;
    } else {
      rows = (await db.query('SELECT p.id, p.nick, p.body, p.created_at, u.avatar FROM posts p LEFT JOIN hub_users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 30')).rows;
    }
    return { ok: true, posts: rows.map((r) => ({ id: Number(r.id), nick: r.nick, body: r.body, t: r.created_at, avatar: (r.avatar as string | null) ?? null })) };
  });

  app.post('/api/social/post', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    if (!u.nick) return reply.code(400).send({ ok: false, error: 'sin_nick', message: 'Primero reservá tu nick.' });
    if (u.muted) return reply.code(403).send({ ok: false, error: 'muted', message: 'Estás silenciado. No podés postear.' });
    const raw = ((req.body ?? {}) as { body?: unknown }).body;
    const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 280).trim() : '';
    if (!text) return reply.code(400).send({ ok: false, error: 'empty', message: 'Escribí algo.' });
    if (offensiveText(text)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Eso no va.' });
    const now = Date.now();
    const last = postRate.get(u.id) ?? 0;
    if (now - last < 20000) return reply.code(429).send({ ok: false, error: 'slow', message: 'Esperá un poco entre publicaciones.' });
    postRate.set(u.id, now);
    const ins = await db.query('INSERT INTO posts (user_id, nick, body) VALUES ($1, $2, $3) RETURNING id, created_at', [u.id, u.nick, text]);
    const row = ins.rows[0];
    return reply.code(201).send({ ok: true, post: { id: Number(row?.id ?? 0), nick: u.nick, body: text, t: row?.created_at } });
  });

  app.post('/api/social/grupos/crear', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    if (!u.nick) return reply.code(400).send({ ok: false, error: 'sin_nick', message: 'Primero reservá tu nick.' });
    const raw = ((req.body ?? {}) as { nombre?: unknown }).nombre;
    const nombre = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 24).trim() : '';
    if (nombre.length < 2) return reply.code(400).send({ ok: false, error: 'nombre', message: 'Nombre muy corto.' });
    if (offensiveText(nombre)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Ese nombre no va.' });
    const ins = await db.query('INSERT INTO grupos (nombre, creador) VALUES ($1, $2) RETURNING id', [nombre, u.id]);
    const gid = Number(ins.rows[0]?.id ?? 0);
    if (gid) await db.query('INSERT INTO grupo_miembros (grupo_id, user_id) VALUES ($1, $2)', [gid, u.id]);
    return reply.code(201).send({ ok: true, grupo: { id: gid, nombre } });
  });

  app.post('/api/social/grupos/agregar', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const body = (req.body ?? {}) as { id?: unknown; nick?: unknown };
    const gid = Math.floor(Number(body.id));
    if (!Number.isInteger(gid) || gid <= 0) return reply.code(400).send({ ok: false, error: 'grupo' });
    if (!(await esMiembro(gid, u.id))) return reply.code(403).send({ ok: false, error: 'no_miembro' });
    const otro = await userByNick(String(body.nick ?? ''));
    if (!otro) return reply.code(404).send({ ok: false, error: 'no_existe', message: 'No existe ese nick.' });
    if (otro.id === u.id) return reply.code(400).send({ ok: false, error: 'vos', message: 'Ya estás adentro.' });
    if (!(await sonAmigos(u.id, otro.id))) return reply.code(403).send({ ok: false, error: 'no_amigos', message: 'Solo podés sumar a tus amigos.' });
    const cnt = await db.query('SELECT count(*) AS c FROM grupo_miembros WHERE grupo_id = $1', [gid]);
    if (Number((cnt.rows[0]?.c as string | number | bigint | undefined) ?? 0) >= 20) return reply.code(400).send({ ok: false, error: 'lleno', message: 'El grupo está lleno (20 máx).' });
    await db.query('INSERT INTO grupo_miembros (grupo_id, user_id) VALUES ($1, $2) ON CONFLICT (grupo_id, user_id) DO NOTHING', [gid, otro.id]);
    return reply.code(201).send({ ok: true, message: otro.nick + ' agregado al grupo.' });
  });

  app.post('/api/social/grupos/salir', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const gid = Math.floor(Number(((req.body ?? {}) as { id?: unknown }).id));
    if (!Number.isInteger(gid) || gid <= 0) return reply.code(400).send({ ok: false, error: 'grupo' });
    await db.query('DELETE FROM grupo_miembros WHERE grupo_id = $1 AND user_id = $2', [gid, u.id]);
    return { ok: true };
  });

  app.get('/api/social/grupos', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const { rows } = await db.query('SELECT g.id, g.nombre, (SELECT count(*) FROM grupo_miembros m2 WHERE m2.grupo_id = g.id) AS n FROM grupos g JOIN grupo_miembros m ON m.grupo_id = g.id WHERE m.user_id = $1 ORDER BY g.id DESC', [u.id]);
    return { ok: true, grupos: rows.map((r) => ({ id: Number(r.id), nombre: r.nombre, miembros: Number(r.n ?? 0) })) };
  });

  app.get('/api/social/grupos/msgs', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const q = (req.query ?? {}) as { id?: unknown; since?: unknown };
    const gid = Math.floor(Number(q.id));
    if (!Number.isInteger(gid) || gid <= 0) return reply.code(400).send({ ok: false, error: 'grupo' });
    if (!(await esMiembro(gid, u.id))) return reply.code(403).send({ ok: false, error: 'no_miembro' });
    const since = Math.floor(Number(q.since));
    let rows;
    if (Number.isFinite(since) && since > 0) rows = (await db.query('SELECT id, de, nick, body, created_at FROM grupo_msgs WHERE grupo_id = $1 AND id > $2 ORDER BY id ASC LIMIT 100', [gid, since])).rows;
    else rows = (await db.query('SELECT id, de, nick, body, created_at FROM grupo_msgs WHERE grupo_id = $1 ORDER BY id DESC LIMIT 50', [gid])).rows.reverse();
    const mem = await db.query('SELECT u2.nick FROM grupo_miembros m JOIN hub_users u2 ON u2.id = m.user_id WHERE m.grupo_id = $1', [gid]);
    return { ok: true, mensajes: rows.map((r) => ({ id: Number(r.id), mio: Number(r.de) === u.id, nick: r.nick, body: r.body, t: r.created_at })), miembros: mem.rows.map((r) => r.nick) };
  });

  app.post('/api/social/grupos/msg', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const body = (req.body ?? {}) as { id?: unknown; body?: unknown };
    if (u.muted) return reply.code(403).send({ ok: false, error: 'muted', message: 'Estás silenciado.' });
    const gid = Math.floor(Number(body.id));
    if (!Number.isInteger(gid) || gid <= 0) return reply.code(400).send({ ok: false, error: 'grupo' });
    if (!(await esMiembro(gid, u.id))) return reply.code(403).send({ ok: false, error: 'no_miembro' });
    const text = typeof body.body === 'string' ? body.body.replace(/\s+/g, ' ').trim().slice(0, 300).trim() : '';
    if (!text) return reply.code(400).send({ ok: false, error: 'empty' });
    if (offensiveText(text)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Eso no va.' });
    const now = Date.now();
    const last = dmRate.get(u.id) ?? 0;
    if (now - last < 1200) return reply.code(429).send({ ok: false, error: 'slow' });
    dmRate.set(u.id, now);
    const ins = await db.query('INSERT INTO grupo_msgs (grupo_id, de, nick, body) VALUES ($1, $2, $3, $4) RETURNING id, created_at', [gid, u.id, u.nick ?? 'anón', text]);
    const row = ins.rows[0];
    return reply.code(201).send({ ok: true, mensaje: { id: Number(row?.id ?? 0), mio: true, nick: u.nick ?? '', body: text, t: row?.created_at } });
  });

  app.get('/api/social/nuevos', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const dm = await db.query('SELECT d.id, u2.nick FROM dms d JOIN hub_users u2 ON u2.id = d.de WHERE d.para = $1 ORDER BY d.id DESC LIMIT 1', [u.id]);
    const gr = await db.query('SELECT m.id, m.nick, m.grupo_id, g.nombre FROM grupo_msgs m JOIN grupos g ON g.id = m.grupo_id WHERE m.de <> $1 AND m.grupo_id IN (SELECT grupo_id FROM grupo_miembros WHERE user_id = $1) ORDER BY m.id DESC LIMIT 1', [u.id]);
    const dr = dm.rows[0], gg = gr.rows[0];
    return {
      ok: true,
      dm: dr ? { id: Number(dr.id), de: dr.nick } : null,
      grupo: gg ? { id: Number(gg.id), gid: Number(gg.grupo_id), de: gg.nick, nombre: gg.nombre } : null,
    };
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

  app.get('/perfil', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('perfil.html');
  });
  app.get('/pueblo', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('pueblo.html');
  });

  app.get('/tristos', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('tristos.html');
  });
  app.get('/tristo', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('tristo.html');
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
