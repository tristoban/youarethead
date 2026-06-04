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
}

interface Stats { count: number; goal: number; remaining: number; unlocked: boolean; }
async function getStats(db: Db): Promise<Stats> {
  const { rows } = await db.query('SELECT count(*) AS c FROM wishlist WHERE confirmed = true');
  const count = Number((rows[0]?.c as string | number | bigint | undefined) ?? 0);
  const remaining = Math.max(0, GOAL - count);
  return { count, goal: GOAL, remaining, unlocked: count >= GOAL };
}
async function topScores(db: Db): Promise<Array<{ alias: unknown; score: number }>> {
  const { rows } = await db.query('SELECT alias, score FROM scores ORDER BY score DESC, created_at ASC LIMIT 10');
  return rows.map((r) => ({ alias: r.alias, score: Number(r.score) }));
}
function getClientIp(req: FastifyRequest): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) { const first = xff.split(',')[0]; if (first && first.trim()) return first.trim(); }
  return req.ip;
}
function hashIp(ip: string): string { return createHash('sha256').update(`${IP_SALT}:${ip}`).digest('hex'); }
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

  app.get('/api/scores', async (_req, reply) => { reply.header('cache-control', 'no-store'); return { ok: true, scores: await topScores(db) }; });

  app.post('/api/score', async (req, reply) => {
    const body = (req.body ?? {}) as { alias?: unknown; score?: unknown; email?: unknown };
    let alias = typeof body.alias === 'string' ? body.alias.trim().replace(/[^\p{L}\p{N} _.\-]/gu, '').slice(0, 12).trim() : '';
    if (!alias) alias = 'ANON';
    if (offensiveAlias(alias)) return reply.code(400).send({ ok: false, error: 'bad_alias', message: 'Ese alias no se puede usar.' });
    const score = typeof body.score === 'number' && Number.isFinite(body.score) ? Math.floor(body.score) : NaN;
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    if (!Number.isInteger(score) || score < 0 || score > 10000000) return reply.code(400).send({ ok: false, error: 'bad_score', message: 'Puntaje inválido.' });
    if (!emailRaw || emailRaw.length > 254 || !EMAIL_RE.test(emailRaw)) return reply.code(400).send({ ok: false, error: 'invalid_email', message: 'Ese mail no parece válido.' });
    const ipHash = hashIp(getClientIp(req));
    const ua = (req.headers['user-agent'] ?? '').toString().slice(0, 300);
    await db.query('INSERT INTO scores (alias, score, email_norm, ip_hash) VALUES ($1, $2, $3, $4)', [alias, score, emailRaw.toLowerCase(), ipHash]);
    const wl = await upsertPending(db, emailRaw, getClientIp(req), ua);
    if (wl.code && wl.token) await sendConfirmEmail(emailRaw, wl.code, wl.token);
    const rankRes = await db.query('SELECT count(*) AS c FROM scores WHERE score > $1', [score]);
    const rank = Number((rankRes.rows[0]?.c as string | number | bigint | undefined) ?? 0) + 1;
    const stats = await getStats(db);
    return reply.code(201).send({ ok: true, rank, alias, score, scores: await topScores(db), wishlist: stats, wishlistPending: wl.status === 'created' || wl.status === 'resent', wishlistConfirmed: wl.status === 'confirmed' });
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

  app.register(fastifyStatic, { root: join(__dirname, '..', 'public'), index: ['index.html'] });
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
