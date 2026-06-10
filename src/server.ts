import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Pool } from 'pg';
import { createHash, createHmac, randomBytes, randomInt, pbkdf2Sync } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

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

// Temas fijos de los posteos (Tanda 2)
const TOPICS: readonly string[] = ['canal', 'juegos', 'arte', 'random', 'debate'];

// Cloudflare R2 (Tanda 3) — si faltan las variables, las fotos quedan apagadas sin romper nada
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY ?? '';
const R2_SECRET = process.env.R2_SECRET ?? '';
const R2_BUCKET = process.env.R2_BUCKET ?? '';
const R2_PUBLIC_BASE_RAW = (process.env.R2_PUBLIC_BASE ?? '').replace(/\/+$/, '');
const R2_PUBLIC_BASE = R2_PUBLIC_BASE_RAW && !/^https?:\/\//.test(R2_PUBLIC_BASE_RAW) ? 'https://' + R2_PUBLIC_BASE_RAW : R2_PUBLIC_BASE_RAW; // normaliza: si falta el esquema, lo agrega
const R2_ENABLED = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET && R2_BUCKET && R2_PUBLIC_BASE);

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
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS admin BOOLEAN NOT NULL DEFAULT false;`);
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
  await db.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS title TEXT;`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL,
      parent_id BIGINT,
      user_id BIGINT NOT NULL,
      nick TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, id);`);
  await db.query(`CREATE TABLE IF NOT EXISTS post_likes (post_id BIGINT NOT NULL, user_id BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (post_id, user_id));`);
  await db.query(`CREATE TABLE IF NOT EXISTS comment_likes (comment_id BIGINT NOT NULL, user_id BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (comment_id, user_id));`);
  await db.query(`CREATE TABLE IF NOT EXISTS notifs (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, type TEXT NOT NULL, actor TEXT NOT NULL, post_id BIGINT, body TEXT, read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
  await db.query(`CREATE INDEX IF NOT EXISTS notifs_user_idx ON notifs (user_id, id DESC);`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS badges jsonb;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS streak INT NOT NULL DEFAULT 0;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS streak_day DATE;`);
  await db.query(`ALTER TABLE hub_users ADD COLUMN IF NOT EXISTS nick_changed TIMESTAMPTZ;`);
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
  // Tandas 2/3/4: temas, fotos y encuestas en los posteos
  await db.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS topic TEXT;`);
  await db.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS images JSONB;`);
  await db.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll JSONB;`);
  await db.query(`CREATE INDEX IF NOT EXISTS posts_topic_idx ON posts (topic) WHERE topic IS NOT NULL;`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS poll_votes (
      post_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      opcion SMALLINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, user_id)
    );
  `);
  // El Escritorio (S.O. de perfil)
  await db.query(`
    CREATE TABLE IF NOT EXISTS desktop_items (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      type TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      x INT NOT NULL DEFAULT 0,
      y INT NOT NULL DEFAULT 0,
      parent_id BIGINT,
      hidden BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS desktop_user_idx ON desktop_items (user_id, parent_id);`);
  await db.query(`CREATE TABLE IF NOT EXISTS desktop_stats (user_id BIGINT PRIMARY KEY, visitas BIGINT NOT NULL DEFAULT 0);`);
  await db.query(`ALTER TABLE desktop_stats ADD COLUMN IF NOT EXISTS config JSONB;`);
  await db.query(`ALTER TABLE desktop_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS desk_firmas (
      id BIGSERIAL PRIMARY KEY,
      desk_uid BIGINT NOT NULL,
      nick TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS desk_firmas_idx ON desk_firmas (desk_uid, id DESC);`);
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
  const e = await db.query('SELECT email, admin FROM hub_users WHERE id = $1', [u.id]);
  const row = e.rows[0];
  if ((row && row.admin === true) || isAdminEmail(row?.email)) return { id: u.id, nick: u.nick || '' };
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
function safeReturn(p: unknown): string { return typeof p === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(p) && !p.startsWith('//') ? p : '/yata'; }
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

// ---- R2: firma SigV4 a mano (cero dependencias) — URL prefirmada para PUT directo desde el navegador ----
function hmac(key: Buffer | string, data: string): Buffer { return createHmac('sha256', key).update(data).digest(); }
function sha256hex(s: string): string { return createHash('sha256').update(s).digest('hex'); }
function r2PresignPut(key: string, expires = 300): string {
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const iso = new Date().toISOString();
  const ymd = iso.slice(0, 10).replace(/-/g, '');
  const amzDate = ymd + 'T' + iso.slice(11, 19).replace(/:/g, '') + 'Z';
  const scope = `${ymd}/auto/s3/aws4_request`;
  const path = `/${R2_BUCKET}/${key}`;
  const qs = 'X-Amz-Algorithm=AWS4-HMAC-SHA256' +
    '&X-Amz-Credential=' + encodeURIComponent(`${R2_ACCESS_KEY}/${scope}`) +
    '&X-Amz-Date=' + amzDate + '&X-Amz-Expires=' + expires + '&X-Amz-SignedHeaders=host';
  const canonical = `PUT\n${path}\n${qs}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256hex(canonical)}`;
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + R2_SECRET, ymd), 'auto'), 's3'), 'aws4_request');
  const sig = createHmac('sha256', kSigning).update(toSign).digest('hex');
  return `https://${host}${path}?${qs}&X-Amz-Signature=${sig}`;
}

// ---- OG cards (Tanda 1): inyección de meta tags en el HTML de YATA ----
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
let perfilHtmlCache = '';
function perfilHtmlRaw(): string {
  if (!perfilHtmlCache) {
    try { perfilHtmlCache = readFileSync(join(__dirname, '..', 'public', 'perfil.html'), 'utf8'); } catch { perfilHtmlCache = ''; }
  }
  return perfilHtmlCache;
}
function withOg(og: { title: string; desc: string; url: string; image: string }): string {
  const base = perfilHtmlRaw();
  if (!base) return '';
  const block =
    '<meta property="og:type" content="article" /><meta property="og:site_name" content="YATA" />' +
    `<meta property="og:title" content="${escHtml(og.title)}" />` +
    `<meta property="og:description" content="${escHtml(og.desc)}" />` +
    `<meta property="og:url" content="${escHtml(og.url)}" />` +
    `<meta property="og:image" content="${escHtml(og.image)}" />` +
    '<meta name="twitter:card" content="summary" />' +
    `<meta name="twitter:title" content="${escHtml(og.title)}" />` +
    `<meta name="twitter:description" content="${escHtml(og.desc)}" />` +
    `<meta name="twitter:image" content="${escHtml(og.image)}" />`;
  return base.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(og.title)}</title>`).replace('</head>', block + '</head>');
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

  // ---- Posteos: SELECT compartido ($1 = id del que mira) + mapeo con temas/fotos/encuestas ----
  const SEL_POST = "SELECT p.id, p.nick, p.title, p.body, p.topic, p.images, p.poll, p.created_at, u.avatar, (SELECT count(*) FROM comments c WHERE c.post_id = p.id) AS ncom, (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id) AS nlik, EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = $1) AS liked FROM posts p LEFT JOIN hub_users u ON u.id = p.user_id";
  interface PollAgg { votos: number[]; total: number; mi: number | null }
  async function attachPolls(rows: Array<Record<string, unknown>>, meId: number): Promise<Map<number, PollAgg>> {
    const out = new Map<number, PollAgg>();
    const ids: number[] = [];
    for (const r of rows) if (Array.isArray(r.poll) && (r.poll as unknown[]).length) ids.push(Number(r.id));
    if (!ids.length) return out;
    for (const id of ids) out.set(id, { votos: [], total: 0, mi: null });
    const cr = await db.query('SELECT post_id, opcion, count(*) AS c FROM poll_votes WHERE post_id = ANY($1::bigint[]) GROUP BY post_id, opcion', [ids]);
    for (const r of cr.rows) {
      const e = out.get(Number(r.post_id));
      if (!e) continue;
      const i = Number(r.opcion), c = Number(r.c ?? 0);
      if (i >= 0 && i < 8) { while (e.votos.length <= i) e.votos.push(0); e.votos[i] = c; e.total += c; }
    }
    if (meId) {
      const mr = await db.query('SELECT post_id, opcion FROM poll_votes WHERE user_id = $2 AND post_id = ANY($1::bigint[])', [ids, meId]);
      for (const r of mr.rows) { const e = out.get(Number(r.post_id)); if (e) e.mi = Number(r.opcion); }
    }
    return out;
  }
  function pollOut(r: Record<string, unknown>, pm: Map<number, PollAgg>): { opts: string[]; votos: number[]; total: number; mi: number | null } | null {
    if (!Array.isArray(r.poll)) return null;
    const opts = (r.poll as unknown[]).map((x) => String(x)).slice(0, 4);
    if (opts.length < 2) return null;
    const agg = pm.get(Number(r.id));
    const votos = opts.map((_, i) => (agg ? (agg.votos[i] ?? 0) : 0));
    return { opts, votos, total: agg ? agg.total : 0, mi: agg ? agg.mi : null };
  }
  function mapPost(r: Record<string, unknown>, pm: Map<number, PollAgg>): Record<string, unknown> {
    return {
      id: Number(r.id), nick: r.nick, title: (r.title as string | null) ?? '', body: r.body, t: r.created_at,
      avatar: (r.avatar as string | null) ?? null, ncom: Number(r.ncom ?? 0), nlik: Number(r.nlik ?? 0), liked: r.liked === true,
      topic: (r.topic as string | null) ?? null,
      imgs: Array.isArray(r.images) ? (r.images as unknown[]).map((x) => String(x)).slice(0, 4) : [],
      poll: pollOut(r, pm),
    };
  }
  const imgRate = new Map<number, number[]>();

  // ---- El Escritorio: catálogo, stats vivas, presencia, trofeos y helpers ----
  const DESK_APPS: readonly string[] = ['tetristo', 'parpadeo', 'laberinto', 'chat', 'boton', 'mural', 'pueblo', 'feed', 'msn', 'consola'];
  const DESK_TYPES: readonly string[] = ['folder', 'note', 'shortcut', 'trophy', 'photo', 'widget', 'tv', 'deco', 'marquee'];
  const DESK_WIDGETS: readonly string[] = ['reloj', 'karma', 'racha', 'top', 'visitas', 'count', 'post'];
  const DESK_SKINS: readonly string[] = ['crt', 'win95', 'fosforo', 'vapor'];
  const DESK_EMOJIS: readonly string[] = ['💀', '🔥', '👻', '❤️', '😂', '👍'];
  const deskRecent = new Map<number, Array<{ nick: string; t: number }>>();
  const deskTime = new Map<number, Map<string, number>>();
  const deskReacts = new Map<number, { seq: number; items: Array<{ id: number; e: string; nick: string; t: number }> }>();
  const deskReactRate = new Map<number, number>();
  const firmaRate = new Map<number, number>();
  const DESK_GAMES: readonly string[] = ['tetristo', 'parpadeo', 'laberinto'];
  const GAME_LABEL: Record<string, string> = { tetristo: 'TeTristo', parpadeo: 'No Parpadees', laberinto: 'El Laberinto' };
  const deskRate = new Map<number, number>();
  const deskPresence = new Map<number, Map<string, number>>();
  const deskNames = new Map<number, Map<string, string>>();
  function deskMirando(uid: number, key: string, nick: string | null): { n: number; nicks: string[]; fantasmas: number } {
    const now = Date.now();
    let m = deskPresence.get(uid);
    if (!m) { m = new Map(); deskPresence.set(uid, m); }
    let nm = deskNames.get(uid);
    if (!nm) { nm = new Map(); deskNames.set(uid, nm); }
    m.set(key, now);
    if (nick) {
      nm.set(key, nick);
      let tm = deskTime.get(uid);
      if (!tm) { tm = new Map(); deskTime.set(uid, tm); }
      tm.set(nick, (tm.get(nick) ?? 0) + 5);
    }
    let n = 0, fantasmas = 0;
    const nicks: string[] = [];
    for (const [k, t] of m) {
      if (now - t > 15000) { m.delete(k); nm.delete(k); continue; }
      n++;
      const nk = nm.get(k);
      if (nk) nicks.push(nk); else fantasmas++;
    }
    return { n, nicks, fantasmas };
  }
  function ytId(url: string): string {
    const m = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(url);
    return m ? (m[1] ?? '') : '';
  }
  interface Trofeo { kind: string; label: string }
  interface DeskStats { karma: number; racha: number; visitas: number; caido: number; nposts: number; tops: Record<string, { rank: number; best: number }> }
  async function deskStats(uid: number, nick: string): Promise<DeskStats> {
    const nl = nick.toLowerCase();
    const tops: Record<string, { rank: number; best: number }> = {};
    for (const g of DESK_GAMES) {
      const best = Number((await db.query('SELECT max(score) AS s FROM scores WHERE game = $1 AND lower(alias) = $2', [g, nl])).rows[0]?.s ?? 0);
      if (!best) continue;
      const up = Number((await db.query('SELECT count(*) AS c FROM (SELECT lower(alias) AS a, max(score) AS s FROM scores WHERE game = $1 GROUP BY 1) t WHERE t.s > $2', [g, best])).rows[0]?.c ?? 0);
      tops[g] = { rank: up + 1, best };
    }
    const racha = Number((await db.query('SELECT streak FROM hub_users WHERE id = $1', [uid])).rows[0]?.streak ?? 0);
    const kp = Number((await db.query('SELECT count(*) AS c FROM post_likes pl JOIN posts p ON p.id = pl.post_id WHERE p.user_id = $1', [uid])).rows[0]?.c ?? 0);
    const kc = Number((await db.query('SELECT count(*) AS c FROM comment_likes cl JOIN comments c ON c.id = cl.comment_id WHERE c.user_id = $1', [uid])).rows[0]?.c ?? 0);
    const ca = (await db.query('SELECT (SELECT count(*) FROM boton_caidos b2 WHERE b2.id <= b.id) AS n FROM boton_caidos b WHERE b.user_id = $1', [uid])).rows[0];
    const nposts = Number((await db.query('SELECT count(*) AS c FROM posts WHERE user_id = $1', [uid])).rows[0]?.c ?? 0);
    const visitas = Number((await db.query('SELECT visitas FROM desktop_stats WHERE user_id = $1', [uid])).rows[0]?.visitas ?? 0);
    return { karma: kp + kc, racha, visitas, caido: ca ? Number(ca.n ?? 0) : 0, nposts, tops };
  }
  function trofeosDe(st: DeskStats, nick: string): Trofeo[] {
    const out: Trofeo[] = [];
    if (nick.toLowerCase() === 'tristoban') out.push({ kind: 'fundador', label: 'Fundador' });
    for (const g of DESK_GAMES) {
      const t = st.tops[g];
      if (t && t.rank <= 3) out.push({ kind: 'top_' + g, label: '#' + t.rank + ' en ' + (GAME_LABEL[g] ?? g) });
    }
    if (st.racha >= 30) out.push({ kind: 'racha30', label: 'Racha 30 días' });
    else if (st.racha >= 7) out.push({ kind: 'racha7', label: 'Racha 7 días' });
    if (st.karma >= 500) out.push({ kind: 'karma500', label: 'Karma 500' });
    else if (st.karma >= 50) out.push({ kind: 'karma50', label: 'Karma 50' });
    if (st.caido > 0 && st.caido <= 100) out.push({ kind: 'caido', label: 'Caído N° ' + st.caido });
    if (st.nposts >= 50) out.push({ kind: 'posts50', label: '50 posteos' });
    else if (st.nposts >= 1) out.push({ kind: 'post1', label: 'Primer posteo' });
    return out;
  }
  function deskIcon(o: Record<string, unknown>): string | null {
    const ic = typeof o.icon === 'string' ? o.icon : '';
    if (!ic || !R2_ENABLED || !ic.startsWith(R2_PUBLIC_BASE + '/perfil/') || ic.length > 500 || !/^[\w\-./:%]+$/.test(ic)) return null;
    return ic;
  }
  function deskData(type: string, raw: unknown, muted: boolean): { ok: true; data: Record<string, unknown> } | { ok: false; code: number; error: string; message: string } {
    const o = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
    const icon = deskIcon(o);
    if (type === 'folder') {
      const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, 24) : '';
      if (!name) return { ok: false, code: 400, error: 'bad_name', message: 'Ponele un nombre a la carpeta.' };
      if (muted) return { ok: false, code: 403, error: 'muted', message: 'Estás silenciado.' };
      if (offensiveText(name)) return { ok: false, code: 400, error: 'bad_words', message: 'Ese nombre no va.' };
      const pin = typeof o.pin === 'string' && /^\d{4}$/.test(o.pin) ? o.pin : null;
      const d2: Record<string, unknown> = { name };
      if (icon) d2.icon = icon;
      if (pin) d2.pin = pin;
      return { ok: true, data: d2 };
    }
    if (type === 'note') {
      const text = typeof o.text === 'string' ? o.text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 400) : '';
      if (muted) return { ok: false, code: 403, error: 'muted', message: 'Estás silenciado.' };
      if (offensiveText(text)) return { ok: false, code: 400, error: 'bad_words', message: 'Eso no va.' };
      const c = typeof o.c === 'string' && ['#facc15', '#ec4899', '#38bdf8', '#22c55e'].indexOf(o.c) >= 0 ? o.c : null;
      const d2: Record<string, unknown> = { text };
      if (icon) d2.icon = icon;
      if (c) d2.c = c;
      return { ok: true, data: d2 };
    }
    if (type === 'shortcut') {
      const app2 = typeof o.app === 'string' && DESK_APPS.indexOf(o.app) >= 0 ? o.app : '';
      if (!app2) return { ok: false, code: 400, error: 'bad_app', message: 'Ese acceso no existe.' };
      return { ok: true, data: icon ? { app: app2, icon } : { app: app2 } };
    }
    if (type === 'photo') {
      const url = typeof o.url === 'string' ? o.url.slice(0, 500) : '';
      if (!url) return { ok: false, code: 400, error: 'bad_url', message: 'Falta la foto.' };
      return { ok: true, data: { url } };
    }
    if (type === 'widget') {
      const kind = typeof o.kind === 'string' && DESK_WIDGETS.indexOf(o.kind) >= 0 ? o.kind : '';
      if (!kind) return { ok: false, code: 400, error: 'bad_widget', message: 'Ese widget no existe.' };
      if (kind === 'top') {
        const game = typeof o.game === 'string' && DESK_GAMES.indexOf(o.game) >= 0 ? o.game : 'tetristo';
        return { ok: true, data: { kind, game } };
      }
      if (kind === 'count') {
        const label = typeof o.label === 'string' ? o.label.replace(/\s+/g, ' ').trim().slice(0, 30) : '';
        const hasta = typeof o.hasta === 'string' ? Date.parse(o.hasta) : NaN;
        if (!label || !Number.isFinite(hasta) || hasta < Date.now()) return { ok: false, code: 400, error: 'bad_count', message: 'Poné un nombre y una fecha futura.' };
        if (offensiveText(label)) return { ok: false, code: 400, error: 'bad_words', message: 'Ese nombre no va.' };
        return { ok: true, data: { kind, label, hasta } };
      }
      return { ok: true, data: { kind } };
    }
    if (type === 'deco') {
      const url = typeof o.url === 'string' ? o.url.slice(0, 500) : '';
      if (!url || !R2_ENABLED || !url.startsWith(R2_PUBLIC_BASE + '/') || !/^[\w\-./:%]+$/.test(url)) return { ok: false, code: 400, error: 'bad_img', message: 'Ese sticker no va.' };
      const w = Math.max(40, Math.min(480, Math.floor(Number(o.w)) || 160));
      const r = Math.max(-45, Math.min(45, Math.floor(Number(o.r)) || 0));
      return { ok: true, data: { url, w, r } };
    }
    if (type === 'marquee') {
      const text = typeof o.text === 'string' ? o.text.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      if (!text) return { ok: false, code: 400, error: 'empty', message: 'Escribí algo para la marquesina.' };
      if (muted) return { ok: false, code: 403, error: 'muted', message: 'Estás silenciado.' };
      if (offensiveText(text)) return { ok: false, code: 400, error: 'bad_words', message: 'Eso no va.' };
      return { ok: true, data: { text } };
    }
    if (type === 'tv') {
      const url = typeof o.url === 'string' ? o.url.trim().slice(0, 300) : '';
      if (!url) return { ok: true, data: { video: '', t0: 0 } };
      const vid = ytId(url);
      if (vid) return { ok: true, data: { video: vid, t0: Date.now() } };
      if (/^https:\/\/[\w\-.]+(?::\d+)?(?:\/[^\s"'<>]*)?$/.test(url)) return { ok: true, data: { web: url, t0: Date.now() } };
      return { ok: false, code: 400, error: 'bad_url', message: 'Pasame un link de YouTube o una URL https válida.' };
    }
    return { ok: true, data: {} }; // trophy: data.kind se valida aparte
  }

  app.get('/api/desktop', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const qy = (req.query ?? {}) as { nick?: unknown; poll?: unknown };
    const nick = String(qy.nick ?? '').trim();
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad' });
    const isPoll = qy.poll === '1';
    const ur = (await db.query('SELECT id, nick, accent, banner FROM hub_users WHERE nick_norm = $1', [nick.toLowerCase()])).rows[0];
    if (!ur) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese perfil.' });
    const uid = Number(ur.id);
    const meU = await hubUserBySession(db, req);
    const own = !!meU && meU.id === uid;
    const viewerKey = meU ? 'u' + meU.id : 'ip' + hashIp(getClientIp(req)).slice(0, 16);
    const pres = deskMirando(uid, viewerKey, meU ? (meU.nick ?? null) : null);
    const esAdmin = meU ? !!(await adminUser(db, req)) : false;
    if (!own && !isPoll) {
      await db.query('INSERT INTO desktop_stats (user_id, visitas) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET visitas = desktop_stats.visitas + 1', [uid]);
      if (meU && meU.nick) {
        const rec = deskRecent.get(uid) ?? [];
        if (!rec.length || rec[rec.length - 1]?.nick !== meU.nick) { rec.push({ nick: meU.nick, t: Date.now() }); if (rec.length > 12) rec.shift(); deskRecent.set(uid, rec); }
        await notify(uid, 'desk_visit', meU.nick, null, '', true);
      }
    }
    if (own && !isPoll) await db.query("DELETE FROM desktop_items WHERE user_id = $1 AND deleted_at IS NOT NULL AND deleted_at < now() - interval '7 days'", [uid]);
    const rows = (await db.query('SELECT id, type, data, x, y, parent_id, hidden, created_at, deleted_at FROM desktop_items WHERE user_id = $1 ORDER BY id ASC LIMIT 250', [uid])).rows;
    const mapIt = (r: Record<string, unknown>) => ({ id: Number(r.id), type: String(r.type), data: (r.data as Record<string, unknown>) ?? {}, x: Number(r.x ?? 0), y: Number(r.y ?? 0), parent: r.parent_id ? Number(r.parent_id) : null, hidden: r.hidden === true, t: r.created_at });
    const vivos = rows.filter((r) => r.deleted_at == null);
    const papelera = own ? rows.filter((r) => r.deleted_at != null).map(mapIt) : [];
    let items = vivos.filter((r) => own || r.hidden !== true).map(mapIt);
    if (!own) {
      const lockedIds = new Set(items.filter((i) => i.type === 'folder' && typeof (i.data as { pin?: unknown }).pin === 'string').map((i) => i.id));
      items = items
        .filter((i) => !(i.parent && lockedIds.has(i.parent)))
        .map((i) => (lockedIds.has(i.id) ? Object.assign({}, i, { data: { name: (i.data as { name?: unknown }).name, icon: (i.data as { icon?: unknown }).icon, locked: true } }) : i));
    }
    const fr = (await db.query('SELECT id, images FROM posts WHERE user_id = $1 AND images IS NOT NULL ORDER BY id DESC LIMIT 100', [uid])).rows;
    const enRows = new Set(items.filter((i) => i.type === 'photo').map((i) => String((i.data as { url?: unknown }).url ?? '')));
    const fotos: Array<{ url: string; post: number }> = [];
    for (const r of fr) if (Array.isArray(r.images)) for (const u of (r.images as unknown[])) { const s = String(u); if (!enRows.has(s)) fotos.push({ url: s, post: Number(r.id) }); }
    const st = await deskStats(uid, String(ur.nick ?? ''));
    const trofeos = trofeosDe(st, String(ur.nick ?? ''));
    const firmas = (await db.query('SELECT id, nick, body, created_at FROM desk_firmas WHERE desk_uid = $1 ORDER BY id DESC LIMIT 30', [uid])).rows
      .map((f) => ({ id: Number(f.id), nick: f.nick, body: f.body, t: f.created_at }));
    const reroom = deskReacts.get(uid);
    const ahora = Date.now();
    const reacts = reroom ? reroom.items.filter((x) => ahora - x.t < 9000) : [];
    const cfgRow = (await db.query('SELECT config FROM desktop_stats WHERE user_id = $1', [uid])).rows[0];
    const config = (cfgRow?.config as Record<string, unknown> | null) ?? null;
    const chRow = (await db.query('SELECT head, vida, hambre, sueno FROM pueblo_chars WHERE user_id = $1', [uid])).rows[0];
    const mascota = chRow ? { head: String(chRow.head ?? 'o'), vida: Math.round(Number(chRow.vida ?? 0)), hambre: Math.round(Number(chRow.hambre ?? 0)), sueno: Math.round(Number(chRow.sueno ?? 0)) } : null;
    let post: { id: number; title: string } | null = null;
    const pid = Number((await db.query('SELECT pinned FROM hub_users WHERE id = $1', [uid])).rows[0]?.pinned ?? 0);
    if (pid > 0) { const pr = (await db.query('SELECT title FROM posts WHERE id = $1', [pid])).rows[0]; if (pr) post = { id: pid, title: String((pr.title as string | null) ?? '') }; }
    let mirones: { nicks: string[]; fantasmas: number; recientes: Array<{ nick: string; t: number }>; rey: Array<{ nick: string; min: number }> } | null = null;
    if (own || esAdmin) {
      const tm = deskTime.get(uid);
      const rey = tm ? Array.from(tm.entries()).map(([nick2, s2]) => ({ nick: nick2, min: Math.round(s2 / 60) })).sort((a2, b2) => b2.min - a2.min).slice(0, 3) : [];
      mirones = { nicks: pres.nicks, fantasmas: pres.fantasmas, recientes: (deskRecent.get(uid) ?? []).slice().reverse(), rey };
    }
    return { ok: true, own, items, fotos, trofeos, stats: st, mirando: pres.n, mirones, papelera, firmas, reacts, config, mascota, post, perfil: { nick: ur.nick, accent: (ur.accent as string | null) ?? null, banner: (ur.banner as string | null) ?? null } };
  });

  app.post('/api/desktop/crear', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const now = Date.now();
    if (now - (deskRate.get(u.id) ?? 0) < 700) return reply.code(429).send({ ok: false, error: 'slow', message: 'Pará un toque.' });
    deskRate.set(u.id, now);
    const b = (req.body ?? {}) as { type?: unknown; data?: unknown; x?: unknown; y?: unknown; parentId?: unknown };
    const type = typeof b.type === 'string' && DESK_TYPES.indexOf(b.type) >= 0 ? b.type : '';
    if (!type) return reply.code(400).send({ ok: false, error: 'bad_type' });
    const cnt = Number((await db.query('SELECT count(*) AS c FROM desktop_items WHERE user_id = $1', [u.id])).rows[0]?.c ?? 0);
    if (cnt >= 80) return reply.code(400).send({ ok: false, error: 'lleno', message: 'El escritorio está repleto (80 max). Tirá algo a la basura primero.' });
    const dv = deskData(type, b.data, u.muted);
    if (!dv.ok) return reply.code(dv.code).send({ ok: false, error: dv.error, message: dv.message });
    const data = dv.data;
    if (type === 'trophy') {
      const kind = typeof (b.data as { kind?: unknown } | undefined)?.kind === 'string' ? String((b.data as { kind: string }).kind) : '';
      const st = await deskStats(u.id, u.nick ?? '');
      const earned = trofeosDe(st, u.nick ?? '');
      const tro = earned.find((t) => t.kind === kind);
      if (!tro) return reply.code(400).send({ ok: false, error: 'no_ganado', message: 'Ese trofeo todavía no es tuyo.' });
      data.kind = tro.kind; data.label = tro.label;
    }
    if (type === 'tv') {
      const ya = (await db.query("SELECT 1 FROM desktop_items WHERE user_id = $1 AND type = 'tv' AND deleted_at IS NULL LIMIT 1", [u.id])).rows.length > 0;
      if (ya) return reply.code(409).send({ ok: false, error: 'ya_tele', message: 'Ya tenés una tele. ¿Para qué querés dos?' });
    }
    if (type === 'photo') {
      const url = String(data.url ?? '');
      const owns = (await db.query('SELECT 1 FROM posts WHERE user_id = $1 AND images ? $2 LIMIT 1', [u.id, url])).rows.length > 0;
      const yaRow = (await db.query("SELECT 1 FROM desktop_items WHERE user_id = $1 AND type = 'photo' AND data->>'url' = $2 LIMIT 1", [u.id, url])).rows.length > 0;
      if (!owns && !yaRow) return reply.code(400).send({ ok: false, error: 'no_tuya', message: 'Esa foto no es de tus posteos.' });
      if (yaRow) return reply.code(409).send({ ok: false, error: 'ya_esta', message: 'Esa foto ya está en el escritorio.' });
    }
    let parent: number | null = null;
    if (b.parentId != null && b.parentId !== '') {
      const pid = Math.floor(Number(b.parentId));
      if (Number.isInteger(pid) && pid > 0) {
        const pf = (await db.query("SELECT 1 FROM desktop_items WHERE id = $1 AND user_id = $2 AND type = 'folder'", [pid, u.id])).rows;
        if (pf.length) parent = pid;
      }
    }
    const x = Math.max(0, Math.min(1000, Math.floor(Number(b.x)) || 0));
    const y = Math.max(0, Math.min(1000, Math.floor(Number(b.y)) || 0));
    const ins = await db.query('INSERT INTO desktop_items (user_id, type, data, x, y, parent_id) VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING id, created_at', [u.id, type, JSON.stringify(data), x, y, parent]);
    const row = ins.rows[0];
    return reply.code(201).send({ ok: true, item: { id: Number(row?.id ?? 0), type, data, x, y, parent, hidden: false, t: row?.created_at } });
  });

  app.post('/api/desktop/mover', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const b = (req.body ?? {}) as { id?: unknown; x?: unknown; y?: unknown; parentId?: unknown };
    const id = Math.floor(Number(b.id));
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const own = (await db.query('SELECT type FROM desktop_items WHERE id = $1 AND user_id = $2', [id, u.id])).rows[0];
    if (!own) return reply.code(404).send({ ok: false, error: 'not_found' });
    let parent: number | null = null;
    if (b.parentId != null && b.parentId !== '') {
      const pid = Math.floor(Number(b.parentId));
      if (Number.isInteger(pid) && pid > 0 && pid !== id) {
        const pf = (await db.query("SELECT 1 FROM desktop_items WHERE id = $1 AND user_id = $2 AND type = 'folder'", [pid, u.id])).rows;
        if (!pf.length) return reply.code(400).send({ ok: false, error: 'bad_carpeta' });
        if (String(own.type) === 'folder') return reply.code(400).send({ ok: false, error: 'carpetaception', message: 'Carpetas dentro de carpetas no, que esto no es Inception.' });
        parent = pid;
      }
    }
    const x = Math.max(0, Math.min(1000, Math.floor(Number(b.x)) || 0));
    const y = Math.max(0, Math.min(1000, Math.floor(Number(b.y)) || 0));
    await db.query('UPDATE desktop_items SET x = $3, y = $4, parent_id = $5 WHERE id = $1 AND user_id = $2', [id, u.id, x, y, parent]);
    return { ok: true };
  });

  app.post('/api/desktop/editar', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const b = (req.body ?? {}) as { id?: unknown; data?: unknown; hidden?: unknown };
    const id = Math.floor(Number(b.id));
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const row = (await db.query('SELECT type, data FROM desktop_items WHERE id = $1 AND user_id = $2', [id, u.id])).rows[0];
    if (!row) return reply.code(404).send({ ok: false, error: 'not_found' });
    let dataOut: Record<string, unknown> | null = null;
    if (b.data !== undefined) {
      const type = String(row.type);
      if (type === 'trophy' || type === 'photo' || type === 'widget') return reply.code(400).send({ ok: false, error: 'no_editable' });
      const dv = deskData(type, b.data, u.muted);
      if (!dv.ok) return reply.code(dv.code).send({ ok: false, error: dv.error, message: dv.message });
      await db.query('UPDATE desktop_items SET data = $3::jsonb WHERE id = $1 AND user_id = $2', [id, u.id, JSON.stringify(dv.data)]);
      dataOut = dv.data;
    }
    if (typeof b.hidden === 'boolean') await db.query('UPDATE desktop_items SET hidden = $3 WHERE id = $1 AND user_id = $2', [id, u.id, b.hidden]);
    return { ok: true, data: dataOut };
  });

  app.post('/api/desktop/borrar', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const id = Math.floor(Number(((req.body ?? {}) as { id?: unknown }).id));
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const row = (await db.query('SELECT type FROM desktop_items WHERE id = $1 AND user_id = $2', [id, u.id])).rows[0];
    if (!row) return reply.code(404).send({ ok: false, error: 'not_found' });
    if (String(row.type) === 'folder') await db.query('UPDATE desktop_items SET parent_id = NULL WHERE parent_id = $1 AND user_id = $2', [id, u.id]);
    const definitivo = ((req.body ?? {}) as { definitivo?: unknown }).definitivo === true;
    if (definitivo) await db.query('DELETE FROM desktop_items WHERE id = $1 AND user_id = $2', [id, u.id]);
    else await db.query('UPDATE desktop_items SET deleted_at = now(), parent_id = NULL WHERE id = $1 AND user_id = $2', [id, u.id]);
    return { ok: true, definitivo };
  });

  app.post('/api/desktop/restaurar', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const id = Math.floor(Number(((req.body ?? {}) as { id?: unknown }).id));
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const fila = (await db.query('SELECT type FROM desktop_items WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL', [id, u.id])).rows[0];
    if (!fila) return reply.code(404).send({ ok: false, error: 'not_found', message: 'Eso no está en la papelera.' });
    if (String(fila.type) === 'tv') {
      const viva = (await db.query("SELECT 1 FROM desktop_items WHERE user_id = $1 AND type = 'tv' AND deleted_at IS NULL LIMIT 1", [u.id])).rows.length > 0;
      if (viva) return reply.code(409).send({ ok: false, error: 'ya_tele', message: 'Una tele a la vez: tirá la otra primero.' });
    }
    await db.query('UPDATE desktop_items SET deleted_at = NULL WHERE id = $1 AND user_id = $2', [id, u.id]);
    return { ok: true };
  });

  app.post('/api/desktop/config', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const b = (req.body ?? {}) as { wallpaper?: unknown; cursor?: unknown; scan?: unknown; skin?: unknown };
    const cfg: Record<string, unknown> = {};
    const okUrl = (v: unknown) => typeof v === 'string' && (v === '' || (R2_ENABLED && v.startsWith(R2_PUBLIC_BASE + '/') && v.length < 500 && /^[\w\-./:%]+$/.test(v)));
    if (b.wallpaper !== undefined) { if (!okUrl(b.wallpaper)) return reply.code(400).send({ ok: false, error: 'bad_img', message: 'Ese fondo no va.' }); cfg.wallpaper = b.wallpaper; }
    if (b.cursor !== undefined) { if (!okUrl(b.cursor)) return reply.code(400).send({ ok: false, error: 'bad_img', message: 'Ese cursor no va.' }); cfg.cursor = b.cursor; }
    if (b.scan !== undefined) cfg.scan = b.scan === true;
    if (b.skin !== undefined) { if (typeof b.skin !== 'string' || DESK_SKINS.indexOf(b.skin) < 0) return reply.code(400).send({ ok: false, error: 'bad_skin' }); cfg.skin = b.skin; }
    const prev = (await db.query('SELECT config FROM desktop_stats WHERE user_id = $1', [u.id])).rows[0];
    const merged = Object.assign({}, (prev?.config as Record<string, unknown> | null) ?? {}, cfg);
    await db.query('INSERT INTO desktop_stats (user_id, visitas, config) VALUES ($1, 0, $2::jsonb) ON CONFLICT (user_id) DO UPDATE SET config = $2::jsonb', [u.id, JSON.stringify(merged)]);
    return { ok: true, config: merged };
  });

  app.post('/api/desktop/firmar', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login', message: 'Entrá para firmar.' });
    if (u.muted) return reply.code(403).send({ ok: false, error: 'muted', message: 'Estás silenciado.' });
    const b = (req.body ?? {}) as { nick?: unknown; body?: unknown };
    const nick = String(b.nick ?? '').trim();
    const text = typeof b.body === 'string' ? b.body.replace(/\s+/g, ' ').trim().slice(0, 120).trim() : '';
    if (!nick || !text) return reply.code(400).send({ ok: false, error: 'empty', message: 'Escribí tu firma.' });
    if (offensiveText(text)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Esa firma no va.' });
    const ur = (await db.query('SELECT id FROM hub_users WHERE nick_norm = $1', [nick.toLowerCase()])).rows[0];
    if (!ur) return reply.code(404).send({ ok: false, error: 'not_found' });
    const now = Date.now();
    if (now - (firmaRate.get(u.id) ?? 0) < 60000) return reply.code(429).send({ ok: false, error: 'slow', message: 'Una firma por minuto. Que valga.' });
    firmaRate.set(u.id, now);
    const uid = Number(ur.id);
    const ins = await db.query('INSERT INTO desk_firmas (desk_uid, nick, body) VALUES ($1, $2, $3) RETURNING id, created_at', [uid, u.nick ?? 'anón', text]);
    await db.query('DELETE FROM desk_firmas WHERE desk_uid = $1 AND id NOT IN (SELECT id FROM desk_firmas WHERE desk_uid = $1 ORDER BY id DESC LIMIT 100)', [uid]);
    const row = ins.rows[0];
    return reply.code(201).send({ ok: true, firma: { id: Number(row?.id ?? 0), nick: u.nick ?? 'anón', body: text, t: row?.created_at } });
  });

  app.post('/api/desktop/reaccion', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const b = (req.body ?? {}) as { nick?: unknown; e?: unknown };
    const nick = String(b.nick ?? '').trim();
    const e = typeof b.e === 'string' && DESK_EMOJIS.indexOf(b.e) >= 0 ? b.e : '';
    if (!nick || !e) return reply.code(400).send({ ok: false, error: 'bad' });
    const ur = (await db.query('SELECT id FROM hub_users WHERE nick_norm = $1', [nick.toLowerCase()])).rows[0];
    if (!ur) return reply.code(404).send({ ok: false, error: 'not_found' });
    const now = Date.now();
    if (now - (deskReactRate.get(u.id) ?? 0) < 2000) return reply.code(429).send({ ok: false, error: 'slow' });
    deskReactRate.set(u.id, now);
    const uid = Number(ur.id);
    let room = deskReacts.get(uid);
    if (!room) { room = { seq: 0, items: [] }; deskReacts.set(uid, room); }
    room.items.push({ id: ++room.seq, e, nick: u.nick ?? 'anón', t: now });
    if (room.items.length > 40) room.items.shift();
    return reply.code(201).send({ ok: true });
  });

  app.post('/api/desktop/abrir', async (req, reply) => {
    const b = (req.body ?? {}) as { nick?: unknown; id?: unknown; pin?: unknown };
    const nick = String(b.nick ?? '').trim();
    const id = Math.floor(Number(b.id));
    const pin = typeof b.pin === 'string' ? b.pin.replace(/\D/g, '').slice(0, 4) : '';
    if (!nick || !Number.isInteger(id) || id <= 0 || pin.length !== 4) return reply.code(400).send({ ok: false, error: 'bad' });
    const ur = (await db.query('SELECT id FROM hub_users WHERE nick_norm = $1', [nick.toLowerCase()])).rows[0];
    if (!ur) return reply.code(404).send({ ok: false, error: 'not_found' });
    const uid = Number(ur.id);
    const fr = (await db.query("SELECT data FROM desktop_items WHERE id = $1 AND user_id = $2 AND type = 'folder' AND deleted_at IS NULL", [id, uid])).rows[0];
    if (!fr) return reply.code(404).send({ ok: false, error: 'not_found' });
    const fpin = (fr.data as { pin?: unknown } | null)?.pin;
    if (typeof fpin !== 'string' || fpin !== pin) return reply.code(403).send({ ok: false, error: 'bad_pin', message: 'Ese no es el PIN. El candado sigue cerrado.' });
    const kids = (await db.query('SELECT id, type, data, x, y, parent_id, hidden, created_at FROM desktop_items WHERE user_id = $1 AND parent_id = $2 AND deleted_at IS NULL ORDER BY id ASC LIMIT 100', [uid, id])).rows
      .map((r) => ({ id: Number(r.id), type: String(r.type), data: (r.data as Record<string, unknown>) ?? {}, x: Number(r.x ?? 0), y: Number(r.y ?? 0), parent: id, hidden: r.hidden === true, t: r.created_at }));
    return { ok: true, items: kids };
  });

  app.post('/api/admin/sello', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const nick = String(((req.body ?? {}) as { nick?: unknown }).nick ?? '').trim();
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad', message: 'Falta el nick.' });
    const ur = (await db.query('SELECT id FROM hub_users WHERE nick_norm = $1', [nick.toLowerCase()])).rows[0];
    if (!ur) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese nick.' });
    const uid = Number(ur.id);
    const ya = (await db.query("SELECT 1 FROM desktop_items WHERE user_id = $1 AND type = 'trophy' AND data->>'kind' = 'sello' AND deleted_at IS NULL LIMIT 1", [uid])).rows.length > 0;
    if (ya) return reply.code(409).send({ ok: false, error: 'ya_tiene', message: 'Ya tiene tu sello.' });
    await db.query("INSERT INTO desktop_items (user_id, type, data, x, y, hidden) VALUES ($1, 'trophy', $2::jsonb, 0, 0, true)", [uid, JSON.stringify({ kind: 'sello', label: 'Sello de Tristo' })]);
    await notify(uid, 'sello', a.nick || 'Tristoban', null, '');
    return reply.code(201).send({ ok: true, nick });
  });

  // Chat efímero del escritorio (en memoria: lo que pasa en el escritorio, se evapora con el deploy)
  const deskChats = new Map<number, { seq: number; msgs: Array<{ id: number; nick: string; body: string; t: number }> }>();
  const deskChatRate = new Map<number, number>();
  app.get('/api/desktop/chat', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const qy = (req.query ?? {}) as { nick?: unknown; since?: unknown };
    const nick = String(qy.nick ?? '').trim();
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad' });
    let uid = 0;
    if (nick !== '__mural') {
      const ur = (await db.query('SELECT id FROM hub_users WHERE nick_norm = $1', [nick.toLowerCase()])).rows[0];
      if (!ur) return reply.code(404).send({ ok: false, error: 'not_found' });
      uid = Number(ur.id);
    }
    const room = deskChats.get(uid);
    const since = Math.floor(Number(qy.since)) || 0;
    return { ok: true, mensajes: room ? room.msgs.filter((m) => m.id > since) : [] };
  });
  app.post('/api/desktop/chat', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login', message: 'Entrá para chatear.' });
    if (u.muted) return reply.code(403).send({ ok: false, error: 'muted', message: 'Estás silenciado.' });
    const b = (req.body ?? {}) as { nick?: unknown; body?: unknown };
    const nick = String(b.nick ?? '').trim();
    const text = typeof b.body === 'string' ? b.body.replace(/\s+/g, ' ').trim().slice(0, 200).trim() : '';
    if (!nick || !text) return reply.code(400).send({ ok: false, error: 'empty', message: 'Escribí algo.' });
    if (offensiveText(text)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Eso no va.' });
    let uid = 0;
    if (nick !== '__mural') {
      const ur = (await db.query('SELECT id FROM hub_users WHERE nick_norm = $1', [nick.toLowerCase()])).rows[0];
      if (!ur) return reply.code(404).send({ ok: false, error: 'not_found' });
      uid = Number(ur.id);
    }
    const now = Date.now();
    if (now - (deskChatRate.get(u.id) ?? 0) < 1500) return reply.code(429).send({ ok: false, error: 'slow', message: 'Pará un toque.' });
    deskChatRate.set(u.id, now);
    let room = deskChats.get(uid);
    if (!room) { room = { seq: 0, msgs: [] }; deskChats.set(uid, room); }
    const msg = { id: ++room.seq, nick: u.nick ?? 'anón', body: text, t: now };
    room.msgs.push(msg);
    if (room.msgs.length > 100) room.msgs.shift();
    return reply.code(201).send({ ok: true, mensaje: msg });
  });
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

  app.get('/api/scores', async (req, reply) => { reply.header('cache-control', 'no-store'); const g = ((req.query ?? {}) as { game?: unknown }).game; return { ok: true, scores: await topScores(db, (g === 'parpadeo' || g === 'laberinto') ? g : 'tetristo') }; });

  app.get('/api/rank', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const q = (req.query ?? {}) as { game?: unknown; score?: unknown };
    const game = (q.game === 'parpadeo' || q.game === 'laberinto') ? q.game : 'tetristo';
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
    const game = (body.game === 'parpadeo' || body.game === 'laberinto') ? body.game : 'tetristo';
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
    if (!GOOGLE_ENABLED) return redir(reply, '/yata?oauth=off');
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
    if (!GOOGLE_ENABLED) return redir(reply, '/yata?oauth=off');
    cleanupOauth();
    const q = (req.query ?? {}) as { code?: unknown; state?: unknown; error?: unknown };
    const code = typeof q.code === 'string' ? q.code : '';
    const state = typeof q.state === 'string' ? q.state : '';
    const st = state ? oauthState.get(state) : undefined;
    if (q.error || !code || !st) return redir(reply, '/yata?oauth=error');
    oauthState.delete(state);
    const ret = st.ret;
    let profile: { sub: string; email: string; verified: boolean; name: string; picture: string } | null = null;
    try {
      const tok = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT, grant_type: 'authorization_code' }).toString(),
      });
      if (!tok.ok) return redir(reply, '/yata?oauth=error');
      const tj = (await tok.json()) as { access_token?: string };
      if (!tj.access_token) return redir(reply, '/yata?oauth=error');
      const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tj.access_token}` } });
      if (!ui.ok) return redir(reply, '/yata?oauth=error');
      const uj = (await ui.json()) as Record<string, unknown>;
      profile = { sub: String(uj.sub ?? ''), email: String(uj.email ?? ''), verified: uj.email_verified === true || uj.email_verified === 'true', name: String(uj.name ?? ''), picture: String(uj.picture ?? '') };
    } catch { return redir(reply, '/yata?oauth=error'); }
    if (!profile.sub) return redir(reply, '/yata?oauth=error');
    const sub = profile.sub;
    const bySub = await db.query('SELECT id, nick, banned FROM hub_users WHERE google_sub = $1', [sub]);
    const subRow = bySub.rows[0];
    if (subRow) {
      if (subRow.banned === true) return redir(reply, '/yata?oauth=banned');
      const sess = newToken();
      await db.query('UPDATE hub_users SET session = $2, avatar = COALESCE(avatar, $3) WHERE id = $1', [subRow.id, sess, profile.picture || null]);
      reply.header('set-cookie', SESS_COOKIE(sess));
      return redir(reply, ret);
    }
    if (profile.verified && profile.email) {
      const byMail = await db.query('SELECT id, nick, banned, google_sub FROM hub_users WHERE email_norm = $1', [profile.email.toLowerCase()]);
      const mr = byMail.rows[0];
      if (mr && !mr.google_sub) {
        if (mr.banned === true) return redir(reply, '/yata?oauth=banned');
        const sess = newToken();
        await db.query('UPDATE hub_users SET google_sub = $2, session = $3, avatar = COALESCE(avatar, $4) WHERE id = $1', [mr.id, sub, sess, profile.picture || null]);
        reply.header('set-cookie', SESS_COOKIE(sess));
        return redir(reply, ret + (ret.includes('?') ? '&' : '?') + 'oauth=migrated');
      }
    }
    const pid = randomBytes(16).toString('hex');
    oauthPending.set(pid, { sub, email: profile.email, name: profile.name, avatar: profile.picture, ts: Date.now() });
    reply.header('set-cookie', `yath_oauth=${pid}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`);
    return redir(reply, '/yata?oauth=setup');
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

  app.get('/api/hub/me', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return { ok: true, logged: false, nick: null };
    const det = await db.query('SELECT email, bio, created_at, pin_hash, avatar, banner, accent, estado, location, links, pinned, admin, badges, nick_changed FROM hub_users WHERE id = $1', [u.id]);
    const r = det.rows[0] ?? {};
    const sres = await db.query("UPDATE hub_users SET streak = CASE WHEN streak_day = CURRENT_DATE THEN streak WHEN streak_day = CURRENT_DATE - 1 THEN streak + 1 ELSE 1 END, streak_day = CURRENT_DATE WHERE id = $1 RETURNING streak", [u.id]);
    const streak = Number(sres.rows[0]?.streak ?? 1) || 1;
    const kp = await db.query('SELECT count(*) AS c FROM post_likes pl JOIN posts p ON p.id = pl.post_id WHERE p.user_id = $1', [u.id]);
    const kc = await db.query('SELECT count(*) AS c FROM comment_likes cl JOIN comments c ON c.id = cl.comment_id WHERE c.user_id = $1', [u.id]);
    const karma = Number(kp.rows[0]?.c ?? 0) + Number(kc.rows[0]?.c ?? 0);
    const nickDays = r.nick_changed ? Math.max(0, 14 - Math.floor((Date.now() - new Date(r.nick_changed as string).getTime()) / 86400000)) : 0;
    let caido = 0;
    const c = await db.query('SELECT (SELECT count(*) FROM boton_caidos b2 WHERE b2.id <= b.id) AS n FROM boton_caidos b WHERE b.user_id = $1', [u.id]);
    if (c.rows[0]) caido = Number(c.rows[0].n ?? 0);
    const nl = (u.nick ?? '').toLowerCase();
    const bt = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'tetristo' AND lower(alias) = $1", [nl]);
    const bp = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'parpadeo' AND lower(alias) = $1", [nl]);
    const bl = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'laberinto' AND lower(alias) = $1", [nl]);
    const ch = await db.query('SELECT head, vida, hambre, sueno FROM pueblo_chars WHERE user_id = $1', [u.id]);
    const cr = ch.rows[0];
    return {
      ok: true, logged: true, nick: u.nick, admin: isAdminNick(u.nick) || isAdminEmail(r.email) || r.admin === true,
      email: String(r.email ?? ''), pin: !!r.pin_hash, avatar: (r.avatar as string | null) ?? null,
      banner: (r.banner as string | null) ?? null, accent: (r.accent as string | null) ?? null, estado: (r.estado as string | null) ?? '', location: (r.location as string | null) ?? '', links: (r.links as unknown) ?? [], pinned: r.pinned ? Number(r.pinned) : null, founder: (u.nick || '').toLowerCase() === 'tristoban',
      bio: (r.bio as string | null) ?? '', desde: r.created_at ?? null, caido,
      best: { tetristo: Number(bt.rows[0]?.s ?? 0) || 0, parpadeo: Number(bp.rows[0]?.s ?? 0) || 0, laberinto: Number(bl.rows[0]?.s ?? 0) || 0 },
      badges: (r.badges as unknown) ?? null, streak, karma, nickDays,
      char: cr ? { head: String(cr.head ?? 'o'), vida: Math.round(Number(cr.vida ?? 0)), hambre: Math.round(Number(cr.hambre ?? 0)), sueno: Math.round(Number(cr.sueno ?? 0)) } : null,
    };
  });

  app.post('/api/hub/nick', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const nick = typeof ((req.body ?? {}) as { nick?: unknown }).nick === 'string' ? ((req.body) as { nick: string }).nick.replace(/\s+/g, ' ').trim().slice(0, 14).trim() : '';
    if (nick.length < 2) return reply.code(400).send({ ok: false, error: 'bad_nick', message: 'Nick muy corto (2-14).' });
    if (offensiveAlias(nick) || offensiveText(nick)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Ese nick no va.' });
    const nickNorm = nick.toLowerCase();
    if (nickNorm === (u.nick || '').toLowerCase()) return reply.code(400).send({ ok: false, error: 'same', message: 'Ese ya es tu nick.' });
    const cd = await db.query("SELECT (nick_changed IS NOT NULL AND nick_changed > now() - interval '14 days') AS locked, GREATEST(0, 14 - floor(EXTRACT(EPOCH FROM (now() - nick_changed)) / 86400)::int) AS dias FROM hub_users WHERE id = $1", [u.id]);
    if (cd.rows[0]?.locked) return reply.code(429).send({ ok: false, error: 'cooldown', message: 'Podés cambiar el nick de nuevo en ' + Number(cd.rows[0]?.dias ?? 14) + ' días.' });
    const ex = await db.query('SELECT 1 AS k FROM hub_users WHERE nick_norm = $1 AND id <> $2', [nickNorm, u.id]);
    if (ex.rows.length) return reply.code(409).send({ ok: false, error: 'taken', message: 'Ese nick ya está tomado.' });
    await db.query('UPDATE hub_users SET nick = $2, nick_norm = $3, nick_changed = now() WHERE id = $1', [u.id, nick, nickNorm]);
    await db.query('UPDATE posts SET nick = $2 WHERE user_id = $1', [u.id, nick]);
    await db.query('UPDATE comments SET nick = $2 WHERE user_id = $1', [u.id, nick]);
    return { ok: true, nick };
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
    const burl = ((req.body ?? {}) as { url?: unknown }).url;
    if (typeof burl === 'string' && burl) {
      if (!R2_ENABLED || !burl.startsWith(R2_PUBLIC_BASE + '/perfil/') || burl.length > 500 || !/^[\w\-./:%]+$/.test(burl)) return reply.code(400).send({ ok: false, error: 'bad_img', message: 'Esa imagen no va.' });
      await db.query('UPDATE hub_users SET avatar = $2 WHERE id = $1', [u.id, burl]);
      return { ok: true, avatar: burl };
    }
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
      ? (await db.query("SELECT nick, banned, banned_reason, muted, admin, created_at FROM hub_users WHERE nick IS NOT NULL AND nick_norm LIKE $1 ORDER BY banned DESC, muted DESC, created_at DESC LIMIT 60", ['%' + q + '%'])).rows
      : (await db.query("SELECT nick, banned, banned_reason, muted, admin, created_at FROM hub_users WHERE nick IS NOT NULL ORDER BY created_at DESC LIMIT 60")).rows;
    const users = rows.map((r) => ({ nick: r.nick, banned: r.banned === true, muted: r.muted === true, admin: r.admin === true || isAdminNick(r.nick as string), reason: (r.banned_reason as string | null) ?? '', desde: r.created_at ?? null }));
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

  app.post('/api/admin/grant', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const nick = typeof ((req.body ?? {}) as { nick?: unknown }).nick === 'string' ? ((req.body) as { nick: string }).nick.trim() : '';
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad', message: 'Falta el nick.' });
    const { rows } = await db.query('UPDATE hub_users SET admin = true WHERE nick_norm = $1 RETURNING nick', [nick.toLowerCase()]);
    if (!rows.length) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese nick.' });
    return { ok: true, nick: rows[0]?.nick ?? nick, admin: true };
  });

  app.post('/api/admin/revoke', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const nick = typeof ((req.body ?? {}) as { nick?: unknown }).nick === 'string' ? ((req.body) as { nick: string }).nick.trim() : '';
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad', message: 'Falta el nick.' });
    const { rows } = await db.query('UPDATE hub_users SET admin = false WHERE nick_norm = $1 RETURNING nick', [nick.toLowerCase()]);
    if (!rows.length) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese nick.' });
    return { ok: true, nick: rows[0]?.nick ?? nick, admin: false };
  });

  app.post('/api/admin/badges', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const body = (req.body ?? {}) as { nick?: unknown; badges?: unknown };
    const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad', message: 'Falta el nick.' });
    const raw = Array.isArray(body.badges) ? body.badges : [];
    const clean = raw.slice(0, 6).map((b) => {
      const o = (b && typeof b === 'object') ? (b as { t?: unknown; c?: unknown }) : {};
      const t = String(o.t ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
      const c = (typeof o.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.c)) ? o.c : '#6b8cff';
      return t ? { t, c } : null;
    }).filter((x): x is { t: string; c: string } => !!x);
    const { rows } = await db.query('UPDATE hub_users SET badges = $2 WHERE nick_norm = $1 RETURNING nick', [nick.toLowerCase(), JSON.stringify(clean)]);
    if (!rows.length) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese nick.' });
    return { ok: true, nick: rows[0]?.nick ?? nick, badges: clean };
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

  app.post('/api/admin/pdd', async (req, reply) => {
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const raw = ((req.body ?? {}) as { id?: unknown }).id;
    if (raw === null || raw === 0 || raw === '') {
      await db.query("INSERT INTO site_config (key, value) VALUES ('pdd', NULL) ON CONFLICT (key) DO UPDATE SET value = NULL");
      return { ok: true, pdd: null };
    }
    const id = Math.floor(Number(raw));
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ ok: false, error: 'bad', message: 'ID inválido.' });
    const ex = await db.query('SELECT 1 FROM posts WHERE id = $1', [id]);
    if (!ex.rows.length) return reply.code(404).send({ ok: false, error: 'no_post', message: 'No existe ese posteo.' });
    await db.query("INSERT INTO site_config (key, value) VALUES ('pdd', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [String(id)]);
    return { ok: true, pdd: id };
  });

  app.get('/api/admin/pdd', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const a = await adminUser(db, req);
    if (!a) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const { rows } = await db.query("SELECT value FROM site_config WHERE key = 'pdd'");
    const id = Math.floor(Number(rows[0]?.value ?? 0));
    return { ok: true, pdd: Number.isInteger(id) && id > 0 ? id : null };
  });

  app.get('/api/social/perfil', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const nick = String(((req.query ?? {}) as { nick?: unknown }).nick ?? '').trim();
    if (!nick) return reply.code(400).send({ ok: false, error: 'bad' });
    const { rows } = await db.query('SELECT id, nick, avatar, banner, accent, bio, estado, location, links, pinned, created_at, badges, streak FROM hub_users WHERE nick_norm = $1', [nick.toLowerCase()]);
    const r = rows[0];
    if (!r) return reply.code(404).send({ ok: false, error: 'not_found', message: 'No existe ese perfil.' });
    const uid = Number(r.id);
    const meU = await hubUserBySession(db, req);
    const nl = String(r.nick ?? '').toLowerCase();
    const bt = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'tetristo' AND lower(alias) = $1", [nl]);
    const bp = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'parpadeo' AND lower(alias) = $1", [nl]);
    const bl = await db.query("SELECT max(score) AS s FROM scores WHERE game = 'laberinto' AND lower(alias) = $1", [nl]);
    const np = await db.query('SELECT count(*) AS c FROM posts WHERE user_id = $1', [uid]);
    const kp = await db.query('SELECT count(*) AS c FROM post_likes pl JOIN posts p ON p.id = pl.post_id WHERE p.user_id = $1', [uid]);
    const kc = await db.query('SELECT count(*) AS c FROM comment_likes cl JOIN comments c ON c.id = cl.comment_id WHERE c.user_id = $1', [uid]);
    const karma = Number(kp.rows[0]?.c ?? 0) + Number(kc.rows[0]?.c ?? 0);
    const fc = await db.query("SELECT count(*) AS c FROM amigos WHERE (a = $1 OR b = $1) AND estado = 'aceptado'", [uid]);
    const ca = await db.query('SELECT (SELECT count(*) FROM boton_caidos b2 WHERE b2.id <= b.id) AS n FROM boton_caidos b WHERE b.user_id = $1', [uid]);
    const meId = meU ? meU.id : 0;
    const prows = (await db.query(SEL_POST + ' WHERE p.user_id = $2 ORDER BY p.id DESC LIMIT 20', [meId, uid])).rows;
    const ppm = await attachPolls(prows, meId);
    const posts = prows.map((p) => mapPost(p, ppm));
    let pinned: Record<string, unknown> | null = null;
    if (r.pinned) {
      const pp = (await db.query(SEL_POST + ' WHERE p.id = $2 AND p.user_id = $3', [meId, Number(r.pinned), uid])).rows[0];
      if (pp) { const ppm2 = await attachPolls([pp], meId); pinned = mapPost(pp, ppm2); }
    }
    let rel = 'none';
    if (meU) { if (meU.id === uid) rel = 'me'; else { const am = await db.query('SELECT estado FROM amigos WHERE (a = $1 AND b = $2) OR (a = $2 AND b = $1)', [meU.id, uid]); const ar = am.rows[0]; if (ar) rel = ar.estado === 'aceptado' ? 'amigos' : 'pendiente'; } }
    return { ok: true, perfil: {
      nick: r.nick, avatar: (r.avatar as string | null) ?? null, banner: (r.banner as string | null) ?? null, accent: (r.accent as string | null) ?? null,
      bio: (r.bio as string | null) ?? '', estado: (r.estado as string | null) ?? '', location: (r.location as string | null) ?? '', links: (r.links as unknown) ?? [],
      desde: r.created_at ?? null, founder: nl === 'tristoban', admin: isAdminNick(r.nick as string),
      best: { tetristo: Number(bt.rows[0]?.s ?? 0) || 0, parpadeo: Number(bp.rows[0]?.s ?? 0) || 0, laberinto: Number(bl.rows[0]?.s ?? 0) || 0 },
      amigos: Number(fc.rows[0]?.c ?? 0) || 0, caido: ca.rows[0] ? Number(ca.rows[0].n ?? 0) : 0, nposts: Number(np.rows[0]?.c ?? 0) || 0,
      badges: (r.badges as unknown) ?? null, streak: Number(r.streak ?? 0) || 0, karma,
      posts, pinned, rel,
    } };
  });

  app.get('/api/social/top-users', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    const { rows } = await db.query(`
      SELECT u.nick, sum(k)::int AS karma FROM (
        SELECT p.user_id AS uid, count(*) AS k FROM post_likes pl JOIN posts p ON p.id = pl.post_id GROUP BY p.user_id
        UNION ALL
        SELECT c.user_id AS uid, count(*) AS k FROM comment_likes cl JOIN comments c ON c.id = cl.comment_id GROUP BY c.user_id
      ) t JOIN hub_users u ON u.id = t.uid WHERE u.nick IS NOT NULL GROUP BY u.id, u.nick ORDER BY karma DESC LIMIT 10`);
    return { ok: true, users: rows.map((r) => ({ nick: r.nick, karma: Number(r.karma ?? 0) })) };
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
    const burl = ((req.body ?? {}) as { url?: unknown }).url;
    if (typeof burl === 'string' && burl) {
      if (!R2_ENABLED || !burl.startsWith(R2_PUBLIC_BASE + '/perfil/') || burl.length > 500 || !/^[\w\-./:%]+$/.test(burl)) return reply.code(400).send({ ok: false, error: 'bad_img', message: 'Esa imagen no va.' });
      await db.query('UPDATE hub_users SET banner = $2 WHERE id = $1', [u.id, burl]);
      return { ok: true, banner: burl };
    }
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

  async function notify(userId: number, type: string, actor: string, postId: number | null, body: string, dedupe = false) {
    if (!userId || !Number.isInteger(userId)) return;
    if (dedupe) {
      const ex = await db.query("SELECT 1 FROM notifs WHERE user_id = $1 AND type = $2 AND actor = $3 AND coalesce(post_id, 0) = coalesce($4, 0) AND read = false AND created_at > now() - interval '1 day' LIMIT 1", [userId, type, actor, postId]);
      if (ex.rows.length) return;
    }
    await db.query('INSERT INTO notifs (user_id, type, actor, post_id, body) VALUES ($1, $2, $3, $4, $5)', [userId, type, actor || 'alguien', postId, String(body || '').slice(0, 140)]);
  }
  async function notifyMentions(text: string, actorId: number, actorNick: string, postId: number) {
    const seen = new Set<number>([actorId]);
    const mm = (String(text || '').match(/@([a-zA-Z0-9_]{2,14})/g) || []).slice(0, 8);
    for (const m of mm) { const other = await userByNick(m.slice(1)); if (other && !seen.has(other.id)) { seen.add(other.id); await notify(other.id, 'mention', actorNick, postId, text); } }
    const cc = (String(text || '').match(/\$([0-9]{1,9})/g) || []).slice(0, 8);
    for (const c of cc) { const pid = Math.floor(Number(c.slice(1))); if (!pid) continue; const pr = (await db.query('SELECT user_id FROM posts WHERE id = $1', [pid])).rows[0]; if (pr && !seen.has(Number(pr.user_id))) { seen.add(Number(pr.user_id)); await notify(Number(pr.user_id), 'cite', actorNick, pid, text); } }
  }

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
      if (Number(row.a) === otro.id) { await db.query("UPDATE amigos SET estado = 'aceptado' WHERE id = $1", [row.id]); await notify(otro.id, 'friend_acc', u.nick || 'alguien', null, ''); return { ok: true, estado: 'amigos', message: 'Te había pedido: ahora son amigos.' }; }
      return { ok: true, estado: 'pendiente', message: 'Ya estaba pedido.' };
    }
    await db.query("INSERT INTO amigos (a, b, estado) VALUES ($1, $2, 'pendiente')", [u.id, otro.id]);
    await notify(otro.id, 'friend_req', u.nick || 'alguien', null, '');
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
    if (body.aceptar === true) { await db.query("UPDATE amigos SET estado = 'aceptado' WHERE id = $1", [row.id]); await notify(otro.id, 'friend_acc', u.nick || 'alguien', null, ''); return { ok: true, estado: 'amigos' }; }
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
    const qy = (req.query ?? {}) as { scope?: unknown; tag?: unknown; topic?: unknown; sort?: unknown };
    const tag = typeof qy.tag === 'string' ? qy.tag.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40) : '';
    const topic = typeof qy.topic === 'string' && TOPICS.indexOf(qy.topic) >= 0 ? qy.topic : '';
    const sort = qy.sort === 'top7' ? 'top7' : 'nuevo';
    const conds: string[] = [];
    const params: unknown[] = [u.id];
    if (tag) { params.push('%#' + tag + '%'); conds.push("lower(coalesce(p.title,'') || ' ' || p.body) LIKE $" + params.length); }
    if (topic) { params.push(topic); conds.push('p.topic = $' + params.length); }
    if (qy.scope === 'amigos') conds.push("(p.user_id = $1 OR p.user_id IN (SELECT CASE WHEN a = $1 THEN b ELSE a END FROM amigos WHERE (a = $1 OR b = $1) AND estado = 'aceptado'))");
    const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
    let order = ' ORDER BY p.id DESC';
    if (qy.scope === 'hot') order = ' ORDER BY ((SELECT count(*) FROM post_likes pl3 WHERE pl3.post_id = p.id) + (SELECT count(*) FROM comments c3 WHERE c3.post_id = p.id) * 2 + 1) / power(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0 + 2, 1.3) DESC';
    else if (sort === 'top7') order = " ORDER BY (SELECT count(*) FROM post_likes pl4 WHERE pl4.post_id = p.id AND pl4.created_at > now() - interval '7 days') DESC, p.id DESC";
    const rows = (await db.query(SEL_POST + where + order + ' LIMIT 40', params)).rows;
    const pm = await attachPolls(rows, u.id);
    // Pregunta del día: fijada arriba del feed principal (no en filtros ni en Amigos)
    let pdd: Record<string, unknown> | null = null;
    if (!tag && !topic && qy.scope !== 'amigos') {
      const pc = await db.query("SELECT value FROM site_config WHERE key = 'pdd'");
      const pid = Math.floor(Number(pc.rows[0]?.value ?? 0));
      if (Number.isInteger(pid) && pid > 0) {
        const pr = (await db.query(SEL_POST + ' WHERE p.id = $2', [u.id, pid])).rows[0];
        if (pr) { const pm2 = await attachPolls([pr], u.id); pdd = mapPost(pr, pm2); }
      }
    }
    return { ok: true, posts: rows.map((r) => mapPost(r, pm)), pdd };
  });

  app.get('/api/social/buscar', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const q = String(((req.query ?? {}) as { q?: unknown }).q ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
    if (q.length < 2) return { ok: true, usuarios: [], posts: [] };
    const like = '%' + q.replace(/[%_\\]/g, '') + '%';
    const us = await db.query('SELECT nick FROM hub_users WHERE nick IS NOT NULL AND nick_norm LIKE $1 ORDER BY nick_norm LIMIT 8', [like]);
    const rows = (await db.query(SEL_POST + " WHERE lower(coalesce(p.title,'') || ' ' || p.body) LIKE $2 ORDER BY p.id DESC LIMIT 30", [u.id, like])).rows;
    const pm = await attachPolls(rows, u.id);
    return { ok: true, usuarios: us.rows.map((r) => r.nick), posts: rows.map((r) => mapPost(r, pm)) };
  });

  app.get('/api/social/trending', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    const { rows } = await db.query("SELECT lower(t.tag) AS tag, count(*) AS c FROM (SELECT (regexp_matches(coalesce(title,'') || ' ' || body, '#([a-zA-Z0-9_]{2,40})', 'g'))[1] AS tag FROM posts WHERE created_at > now() - interval '48 hours') t GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 8");
    return { ok: true, tags: rows.map((r) => ({ tag: String(r.tag ?? ''), n: Number(r.c ?? 0) })) };
  });

  app.post('/api/social/poll/votar', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const b = (req.body ?? {}) as { postId?: unknown; opcion?: unknown };
    const pid = Math.floor(Number(b.postId));
    const op = Math.floor(Number(b.opcion));
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(op) || op < 0 || op > 3) return reply.code(400).send({ ok: false, error: 'bad' });
    const pr = (await db.query('SELECT poll FROM posts WHERE id = $1', [pid])).rows[0];
    if (!pr || !Array.isArray(pr.poll)) return reply.code(404).send({ ok: false, error: 'no_poll', message: 'Ese posteo no tiene encuesta.' });
    if (op >= (pr.poll as unknown[]).length) return reply.code(400).send({ ok: false, error: 'bad' });
    await db.query('INSERT INTO poll_votes (post_id, user_id, opcion) VALUES ($1, $2, $3) ON CONFLICT (post_id, user_id) DO UPDATE SET opcion = $3, created_at = now()', [pid, u.id, op]);
    const cr = await db.query('SELECT opcion, count(*) AS c FROM poll_votes WHERE post_id = $1 GROUP BY opcion', [pid]);
    const votos = (pr.poll as unknown[]).map(() => 0);
    let total = 0;
    for (const r of cr.rows) { const i = Number(r.opcion), c = Number(r.c ?? 0); if (i >= 0 && i < votos.length) { votos[i] = c; total += c; } }
    return { ok: true, votos, total, mi: op };
  });

  app.get('/api/img/cfg', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return { ok: true, on: R2_ENABLED, max: 4 };
  });

  app.post('/api/img/sign', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    if (!R2_ENABLED) return reply.code(503).send({ ok: false, error: 'img_off', message: 'Las fotos todavía no están activas. Ya casi.' });
    if (u.muted) return reply.code(403).send({ ok: false, error: 'muted', message: 'Estás silenciado.' });
    const b = (req.body ?? {}) as { type?: unknown; size?: unknown };
    const type = b.type === 'image/jpeg' || b.type === 'image/png' || b.type === 'image/webp' ? b.type : '';
    if (!type) return reply.code(400).send({ ok: false, error: 'bad_type', message: 'Formato no soportado. JPG, PNG o WebP.' });
    const size = Math.floor(Number(b.size));
    if (!Number.isInteger(size) || size <= 0 || size > 4 * 1024 * 1024) return reply.code(413).send({ ok: false, error: 'too_big', message: 'Máximo 4MB por foto.' });
    const now = Date.now();
    const hist = (imgRate.get(u.id) ?? []).filter((t) => now - t < 3600000);
    if (hist.length >= 30) return reply.code(429).send({ ok: false, error: 'slow', message: 'Demasiadas fotos por hora. Tomate un mate.' });
    hist.push(now); imgRate.set(u.id, hist);
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const carpeta = (b as { scope?: unknown }).scope === 'perfil' ? 'perfil' : 'posts';
    const key = carpeta + '/' + u.id + '/' + Date.now().toString(36) + randomBytes(6).toString('hex') + '.' + ext;
    return { ok: true, put: r2PresignPut(key), url: R2_PUBLIC_BASE + '/' + key, type };
  });

  app.get('/api/social/post', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const id = Math.floor(Number(((req.query ?? {}) as { id?: unknown }).id));
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const meU = await hubUserBySession(db, req);
    const meId = meU ? meU.id : 0;
    const pr = (await db.query(SEL_POST + ' WHERE p.id = $2', [meId, id])).rows[0];
    if (!pr) return reply.code(404).send({ ok: false, error: 'not_found', message: 'Ese posteo no existe.' });
    const pm = await attachPolls([pr], meId);
    const cs = (await db.query('SELECT c.id, c.parent_id, c.nick, c.body, c.created_at, u.avatar, (SELECT count(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS nlik, EXISTS(SELECT 1 FROM comment_likes cl2 WHERE cl2.comment_id = c.id AND cl2.user_id = $2) AS liked FROM comments c LEFT JOIN hub_users u ON u.id = c.user_id WHERE c.post_id = $1 ORDER BY c.id ASC LIMIT 300', [id, meId])).rows;
    return { ok: true,
      post: mapPost(pr, pm),
      comments: cs.map((c) => ({ id: Number(c.id), parent: c.parent_id ? Number(c.parent_id) : null, nick: c.nick, body: c.body, t: c.created_at, avatar: (c.avatar as string | null) ?? null, nlik: Number(c.nlik ?? 0), liked: c.liked === true })) };
  });

  app.post('/api/social/post', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    if (!u.nick) return reply.code(400).send({ ok: false, error: 'sin_nick', message: 'Primero reservá tu nick.' });
    if (u.muted) return reply.code(403).send({ ok: false, error: 'muted', message: 'Estás silenciado. No podés postear.' });
    const b = (req.body ?? {}) as { title?: unknown; body?: unknown; topic?: unknown; images?: unknown; poll?: unknown };
    const title = typeof b.title === 'string' ? b.title.replace(/\s+/g, ' ').trim().slice(0, 120).trim() : '';
    const text = typeof b.body === 'string' ? b.body.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000).trim() : '';
    if (!title) return reply.code(400).send({ ok: false, error: 'empty', message: 'Ponele un título.' });
    if (offensiveText(title) || offensiveText(text)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Eso no va.' });
    const topic = typeof b.topic === 'string' && TOPICS.indexOf(b.topic) >= 0 ? b.topic : null;
    let images: string[] | null = null;
    if (R2_ENABLED && Array.isArray(b.images)) {
      const clean = b.images
        .filter((x): x is string => typeof x === 'string' && x.length < 500 && x.startsWith(R2_PUBLIC_BASE + '/posts/') && /^[\w\-./:%]+$/.test(x))
        .slice(0, 4);
      if (clean.length) images = clean;
    }
    let poll: string[] | null = null;
    if (Array.isArray(b.poll)) {
      const opts = b.poll
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 4);
      if (opts.length >= 2) {
        if (opts.some((o) => offensiveText(o))) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Una opción de la encuesta no va.' });
        poll = opts;
      }
    }
    const now = Date.now();
    if (now - (postRate.get(u.id) ?? 0) < 15000) return reply.code(429).send({ ok: false, error: 'slow', message: 'Esperá un poco entre publicaciones.' });
    postRate.set(u.id, now);
    const ins = await db.query(
      'INSERT INTO posts (user_id, nick, title, body, topic, images, poll) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) RETURNING id, created_at',
      [u.id, u.nick, title, text, topic, images ? JSON.stringify(images) : null, poll ? JSON.stringify(poll) : null],
    );
    const row = ins.rows[0];
    const pid = Number(row?.id ?? 0);
    await notifyMentions(title + ' ' + text, u.id, u.nick, pid);
    return reply.code(201).send({ ok: true, post: { id: pid, nick: u.nick, title, body: text, t: row?.created_at, avatar: null, ncom: 0, nlik: 0, liked: false, topic, imgs: images ?? [], poll: poll ? { opts: poll, votos: poll.map(() => 0), total: 0, mi: null } : null } });
  });

  app.post('/api/social/comment', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    if (!u.nick) return reply.code(400).send({ ok: false, error: 'sin_nick', message: 'Primero reservá tu nick.' });
    if (u.muted) return reply.code(403).send({ ok: false, error: 'muted', message: 'Estás silenciado.' });
    const b = (req.body ?? {}) as { postId?: unknown; parentId?: unknown; body?: unknown };
    const postId = Math.floor(Number(b.postId));
    if (!Number.isInteger(postId) || postId <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const text = typeof b.body === 'string' ? b.body.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1000).trim() : '';
    if (!text) return reply.code(400).send({ ok: false, error: 'empty', message: 'Escribí algo.' });
    if (offensiveText(text)) return reply.code(400).send({ ok: false, error: 'bad_words', message: 'Eso no va.' });
    const exists = await db.query('SELECT 1 FROM posts WHERE id = $1', [postId]);
    if (!exists.rows.length) return reply.code(404).send({ ok: false, error: 'no_post' });
    let parent: number | null = null;
    if (b.parentId != null && b.parentId !== '') { const pp = Math.floor(Number(b.parentId)); if (Number.isInteger(pp) && pp > 0) { const pc = await db.query('SELECT 1 FROM comments WHERE id = $1 AND post_id = $2', [pp, postId]); if (pc.rows.length) parent = pp; } }
    const now = Date.now();
    if (now - (postRate.get(-u.id) ?? 0) < 4000) return reply.code(429).send({ ok: false, error: 'slow', message: 'Esperá un toque.' });
    postRate.set(-u.id, now);
    const ins = await db.query('INSERT INTO comments (post_id, parent_id, user_id, nick, body) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at', [postId, parent, u.id, u.nick, text]);
    const row = ins.rows[0];
    const pAuthor = (await db.query('SELECT user_id FROM posts WHERE id = $1', [postId])).rows[0];
    const pAid = pAuthor ? Number(pAuthor.user_id) : 0;
    if (pAid && pAid !== u.id) await notify(pAid, 'comment', u.nick, postId, text);
    if (parent) { const cA = (await db.query('SELECT user_id FROM comments WHERE id = $1', [parent])).rows[0]; const cAid = cA ? Number(cA.user_id) : 0; if (cAid && cAid !== u.id && cAid !== pAid) await notify(cAid, 'reply', u.nick, postId, text); }
    await notifyMentions(text, u.id, u.nick, postId);
    return reply.code(201).send({ ok: true, comment: { id: Number(row?.id ?? 0), parent, nick: u.nick, body: text, t: row?.created_at, avatar: null } });
  });

  app.post('/api/social/like', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const postId = Math.floor(Number(((req.body ?? {}) as { postId?: unknown }).postId));
    if (!Number.isInteger(postId) || postId <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const exists = await db.query('SELECT 1 FROM posts WHERE id = $1', [postId]);
    if (!exists.rows.length) return reply.code(404).send({ ok: false, error: 'no_post' });
    const had = await db.query('SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, u.id]);
    let liked: boolean;
    if (had.rows.length) { await db.query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, u.id]); liked = false; }
    else { await db.query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, u.id]); liked = true; }
    if (liked) { const pa = (await db.query('SELECT user_id, title FROM posts WHERE id = $1', [postId])).rows[0]; if (pa && Number(pa.user_id) !== u.id) await notify(Number(pa.user_id), 'like_post', u.nick || 'alguien', postId, (pa.title as string) || '', true); }
    const cnt = await db.query('SELECT count(*) AS c FROM post_likes WHERE post_id = $1', [postId]);
    return { ok: true, liked, count: Number(cnt.rows[0]?.c ?? 0) };
  });

  app.post('/api/social/clike', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const cid = Math.floor(Number(((req.body ?? {}) as { commentId?: unknown }).commentId));
    if (!Number.isInteger(cid) || cid <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const ex = await db.query('SELECT 1 FROM comments WHERE id = $1', [cid]);
    if (!ex.rows.length) return reply.code(404).send({ ok: false, error: 'no_comment' });
    const had = await db.query('SELECT 1 FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [cid, u.id]);
    let liked: boolean;
    if (had.rows.length) { await db.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [cid, u.id]); liked = false; }
    else { await db.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cid, u.id]); liked = true; }
    if (liked) { const ca = (await db.query('SELECT user_id, post_id, body FROM comments WHERE id = $1', [cid])).rows[0]; if (ca && Number(ca.user_id) !== u.id) await notify(Number(ca.user_id), 'like_comment', u.nick || 'alguien', Number(ca.post_id), (ca.body as string) || '', true); }
    const cnt = await db.query('SELECT count(*) AS c FROM comment_likes WHERE comment_id = $1', [cid]);
    return { ok: true, liked, count: Number(cnt.rows[0]?.c ?? 0) };
  });

  app.get('/api/notifs', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const rows = (await db.query('SELECT id, type, actor, post_id, body, read, created_at FROM notifs WHERE user_id = $1 ORDER BY id DESC LIMIT 30', [u.id])).rows;
    const unread = Number((await db.query('SELECT count(*) AS c FROM notifs WHERE user_id = $1 AND read = false', [u.id])).rows[0]?.c ?? 0);
    return { ok: true, unread, items: rows.map((r) => ({ id: Number(r.id), type: r.type, actor: r.actor, postId: r.post_id ? Number(r.post_id) : null, body: (r.body as string | null) ?? '', read: r.read === true, t: r.created_at })) };
  });

  const onlineMap = new Map<number, { t: number; nick: string }>();
  function onlineAhora(): { n: number; nicks: string[] } {
    const now = Date.now();
    const nicks: string[] = [];
    for (const [k, v] of onlineMap) { if (now - v.t > 70000) onlineMap.delete(k); else nicks.push(v.nick); }
    return { n: nicks.length, nicks: nicks.slice(0, 12) };
  }
  app.get('/api/notifs/count', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const u = await hubUserBySession(db, req);
    if (!u) return { ok: true, unread: 0, online: onlineAhora().n };
    if (u.nick) onlineMap.set(u.id, { t: Date.now(), nick: u.nick });
    const unread = Number((await db.query('SELECT count(*) AS c FROM notifs WHERE user_id = $1 AND read = false', [u.id])).rows[0]?.c ?? 0);
    const on = onlineAhora();
    return { ok: true, unread, online: on.n, despiertos: on.nicks };
  });

  app.get('/api/escritorios', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    const rows = (await db.query("SELECT u.id, u.nick, u.avatar, u.accent, u.banner, u.admin, u.badges, COALESCE(ds.visitas, 0) AS visitas FROM hub_users u LEFT JOIN desktop_stats ds ON ds.user_id = u.id WHERE u.nick IS NOT NULL AND u.banned = false ORDER BY COALESCE(ds.visitas, 0) DESC, u.id ASC LIMIT 60")).rows;
    const lista = rows.map((r) => {
      const uid = Number(r.id);
      const m = deskPresence.get(uid);
      let adentro = 0;
      if (m) { const now = Date.now(); for (const [, t] of m) if (now - t <= 15000) adentro++; }
      return { nick: r.nick, avatar: (r.avatar as string | null) ?? null, accent: (r.accent as string | null) ?? null, banner: (r.banner as string | null) ?? null, admin: r.admin === true || isAdminNick(r.nick as string), founder: String(r.nick ?? '').toLowerCase() === 'tristoban', badges: (r.badges as unknown) ?? null, visitas: Number(r.visitas ?? 0), adentro };
    });
    return { ok: true, escritorios: lista };
  });

  app.post('/api/notifs/read', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    await db.query('UPDATE notifs SET read = true WHERE user_id = $1 AND read = false', [u.id]);
    return { ok: true };
  });

  app.post('/api/social/post/delete', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const id = Math.floor(Number(((req.body ?? {}) as { id?: unknown }).id));
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const p = (await db.query('SELECT user_id FROM posts WHERE id = $1', [id])).rows[0];
    if (!p) return reply.code(404).send({ ok: false, error: 'no_post' });
    const a = await adminUser(db, req);
    if (Number(p.user_id) !== u.id && !a) return reply.code(403).send({ ok: false, error: 'forbidden', message: 'No es tuyo.' });
    await db.query('DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE post_id = $1)', [id]);
    await db.query('DELETE FROM comments WHERE post_id = $1', [id]);
    await db.query('DELETE FROM post_likes WHERE post_id = $1', [id]);
    await db.query('DELETE FROM notifs WHERE post_id = $1', [id]);
    await db.query('DELETE FROM posts WHERE id = $1', [id]);
    return { ok: true };
  });

  app.post('/api/social/comment/delete', async (req, reply) => {
    const u = await hubUserBySession(db, req);
    if (!u) return reply.code(401).send({ ok: false, error: 'login' });
    const id = Math.floor(Number(((req.body ?? {}) as { id?: unknown }).id));
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ ok: false, error: 'bad' });
    const c = (await db.query('SELECT user_id FROM comments WHERE id = $1', [id])).rows[0];
    if (!c) return reply.code(404).send({ ok: false, error: 'no_comment' });
    const a = await adminUser(db, req);
    if (Number(c.user_id) !== u.id && !a) return reply.code(403).send({ ok: false, error: 'forbidden', message: 'No es tuyo.' });
    await db.query('DELETE FROM comment_likes WHERE comment_id = $1 OR comment_id IN (SELECT id FROM comments WHERE parent_id = $1)', [id]);
    await db.query('DELETE FROM comments WHERE id = $1 OR parent_id = $1', [id]);
    return { ok: true };
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

  app.get('/yata', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('perfil.html');
  });
  app.get('/perfil', async (req, reply) => { const u = (req.raw && req.raw.url) || ''; const q = u.indexOf('?'); return redir(reply, '/yata' + (q >= 0 ? u.slice(q) : '')); });
  app.get('/demon/:nick', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const nickRaw = String(((req.params ?? {}) as { nick?: unknown }).nick ?? '');
    let nick = nickRaw;
    try { nick = decodeURIComponent(nickRaw); } catch { /* queda como vino */ }
    const { rows } = await db.query('SELECT nick, bio, estado, (avatar IS NOT NULL) AS hasava FROM hub_users WHERE nick_norm = $1', [nick.trim().toLowerCase()]);
    const r = rows[0];
    if (!r) return reply.sendFile('perfil.html');
    const n = String(r.nick ?? '');
    const desc = String((r.estado as string | null) ?? '').trim() || String((r.bio as string | null) ?? '').trim() || 'El demonio ' + n + ' vive en YATA, la red social de Tristo.';
    const html = withOg({
      title: n + ' — YATA',
      desc: desc.slice(0, 160),
      url: PUBLIC_URL + '/demon/' + encodeURIComponent(n),
      image: r.hasava === true ? PUBLIC_URL + '/og/u/' + encodeURIComponent(n) : PUBLIC_URL + '/logoyatasocial.png',
    });
    if (!html) return reply.sendFile('perfil.html');
    reply.header('content-type', 'text/html; charset=utf-8');
    return reply.send(html);
  });
  app.get('/u/:nick', async (req, reply) => {
    const nickRaw = String(((req.params ?? {}) as { nick?: unknown }).nick ?? '');
    return redir(reply, '/demon/' + nickRaw);
  });
  app.get('/p/:id', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const id = Math.floor(Number(((req.params ?? {}) as { id?: unknown }).id));
    if (!Number.isInteger(id) || id <= 0) return reply.sendFile('perfil.html');
    const pr = (await db.query("SELECT p.id, p.nick, p.title, p.body, (u.avatar IS NOT NULL) AS hasava FROM posts p LEFT JOIN hub_users u ON u.id = p.user_id WHERE p.id = $1", [id])).rows[0];
    if (!pr) return reply.sendFile('perfil.html');
    const nick = String(pr.nick ?? '');
    const t = String((pr.title as string | null) ?? '').trim();
    const cuerpo = String((pr.body as string | null) ?? '').replace(/\s+/g, ' ').trim();
    const html = withOg({
      title: (t || 'Posteo de ' + nick) + ' — YATA',
      desc: (cuerpo || 'Por @' + nick + ' en YATA, la red social de Tristo.').slice(0, 160),
      url: PUBLIC_URL + '/p/' + id,
      image: pr.hasava === true ? PUBLIC_URL + '/og/u/' + encodeURIComponent(nick) : PUBLIC_URL + '/logoyatasocial.png',
    });
    if (!html) return reply.sendFile('perfil.html');
    reply.header('content-type', 'text/html; charset=utf-8');
    return reply.send(html);
  });
  app.get('/demon/:nick/escritorio', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const nickRaw = String(((req.params ?? {}) as { nick?: unknown }).nick ?? '');
    let nick = nickRaw;
    try { nick = decodeURIComponent(nickRaw); } catch { /* queda como vino */ }
    const { rows } = await db.query('SELECT nick, (avatar IS NOT NULL) AS hasava FROM hub_users WHERE nick_norm = $1', [nick.trim().toLowerCase()]);
    const r = rows[0];
    if (!r) return reply.sendFile('perfil.html');
    const n = String(r.nick ?? '');
    const html = withOg({
      title: 'Escritorio de ' + n + ' — YATA',
      desc: 'Entrá al escritorio del demonio ' + n + ': sus trofeos, sus fotos, su tele y los que están mirando ahora.',
      url: PUBLIC_URL + '/demon/' + encodeURIComponent(n) + '/escritorio',
      image: r.hasava === true ? PUBLIC_URL + '/og/u/' + encodeURIComponent(n) : PUBLIC_URL + '/logoyatasocial.png',
    });
    if (!html) return reply.sendFile('perfil.html');
    reply.header('content-type', 'text/html; charset=utf-8');
    return reply.send(html);
  });
  app.get('/u/:nick/escritorio', async (req, reply) => {
    const nickRaw = String(((req.params ?? {}) as { nick?: unknown }).nick ?? '');
    return redir(reply, '/demon/' + nickRaw + '/escritorio');
  });
  app.get('/og/u/:nick', async (req, reply) => {
    const nickRaw = String(((req.params ?? {}) as { nick?: unknown }).nick ?? '').replace(/\.(png|jpe?g|webp)$/i, '');
    let nick = nickRaw;
    try { nick = decodeURIComponent(nickRaw); } catch { /* queda como vino */ }
    const { rows } = await db.query('SELECT avatar FROM hub_users WHERE nick_norm = $1', [nick.trim().toLowerCase()]);
    const av = (rows[0]?.avatar as string | null) ?? null;
    if (av && /^https?:\/\//.test(av)) return redir(reply, av);
    const m = av ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(av) : null;
    if (!m) return redir(reply, '/logoyatasocial.png');
    reply.header('content-type', 'image/' + (m[1] ?? 'jpeg'));
    reply.header('cache-control', 'public, max-age=3600');
    return reply.send(Buffer.from(m[2] ?? '', 'base64'));
  });
  app.get('/pueblo', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('pueblo.html');
  });
  app.get('/consola', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('consola.html');
  });
  app.get('/tetristo', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('tetristo.html');
  });

  app.get('/tristos', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('tristos.html');
  });
  app.get('/tristo', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('tristo.html');
  });
  app.get('/laberinto', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return reply.sendFile('laberinto.html');
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
// tandas 1-4: compartir/OG · orden/busqueda · imagenes R2 · encuestas/pregunta del dia
