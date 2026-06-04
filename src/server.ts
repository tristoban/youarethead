import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';
const GOAL = Number(process.env.WISHLIST_GOAL ?? 10000);
const IP_SALT = process.env.IP_SALT ?? 'youarethead-default-salt-cambiame';
const ONE_PER_IP = (process.env.ONE_PER_IP ?? 'true').toLowerCase() !== 'false';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS wishlist_email_norm_uidx ON wishlist (email_norm);`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS wishlist_ip_uidx ON wishlist (ip_hash) WHERE ip_hash IS NOT NULL;`);
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
  const { rows } = await db.query('SELECT count(*) AS c FROM wishlist');
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
  if (typeof xff === 'string' && xff.trim()) {
    const first = xff.split(',')[0];
    if (first && first.trim()) return first.trim();
  }
  return req.ip;
}

function hashIp(ip: string): string {
  return createHash('sha256').update(`${IP_SALT}:${ip}`).digest('hex');
}

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({ trustProxy: true, bodyLimit: 16 * 1024 });

  app.get('/healthz', async () => ({ ok: true }));

  app.get('/api/stats', async (_req, reply) => {
    const stats = await getStats(db);
    reply.header('cache-control', 'no-store');
    return { ok: true, ...stats };
  });

  app.post('/api/wishlist', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown };
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    if (!emailRaw || emailRaw.length > 254 || !EMAIL_RE.test(emailRaw)) {
      const stats = await getStats(db);
      return reply.code(400).send({ ok: false, error: 'invalid_email', message: 'Ese mail no parece válido.', ...stats });
    }
    const emailNorm = emailRaw.toLowerCase();
    const ipHash = ONE_PER_IP ? hashIp(getClientIp(req)) : null;
    const ua = (req.headers['user-agent'] ?? '').toString().slice(0, 300);
    try {
      await db.query('INSERT INTO wishlist (email, email_norm, ip_hash, user_agent) VALUES ($1, $2, $3, $4)', [emailRaw, emailNorm, ipHash, ua]);
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string; message?: string };
      const emsg = e.message ?? '';
      const isDup = e.code === '23505' || /duplicate key|unique/i.test(emsg);
      if (isDup) {
        const stats = await getStats(db);
        const ref = `${e.constraint ?? ''} ${emsg}`;
        const byIp = /ip/i.test(ref) && !/email/i.test(e.constraint ?? '');
        return reply.code(409).send({ ok: false, error: byIp ? 'ip_taken' : 'email_taken', message: byIp ? 'Ya hay alguien anotado desde esta conexión.' : 'Ese mail ya está en la lista.', ...stats });
      }
      req.log.error(err);
      const stats = await getStats(db);
      return reply.code(500).send({ ok: false, error: 'server_error', message: 'Algo se rompió. Probá de nuevo.', ...stats });
    }
    const stats = await getStats(db);
    return reply.code(201).send({ ok: true, message: 'Listo. Estás en la lista.', ...stats });
  });

  app.get('/api/scores', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return { ok: true, scores: await topScores(db) };
  });

  app.post('/api/score', async (req, reply) => {
    const body = (req.body ?? {}) as { alias?: unknown; score?: unknown; email?: unknown };
    let alias = typeof body.alias === 'string'
      ? body.alias.trim().replace(/[^\p{L}\p{N} _.\-]/gu, '').slice(0, 12).trim()
      : '';
    if (!alias) alias = 'ANON';
    const score = typeof body.score === 'number' && Number.isFinite(body.score) ? Math.floor(body.score) : NaN;
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';

    if (!Number.isInteger(score) || score < 0 || score > 10000000) {
      return reply.code(400).send({ ok: false, error: 'bad_score', message: 'Puntaje inválido.' });
    }
    if (!emailRaw || emailRaw.length > 254 || !EMAIL_RE.test(emailRaw)) {
      return reply.code(400).send({ ok: false, error: 'invalid_email', message: 'Ese mail no parece válido.' });
    }
    const emailNorm = emailRaw.toLowerCase();
    const ipHash = hashIp(getClientIp(req));
    const ua = (req.headers['user-agent'] ?? '').toString().slice(0, 300);

    await db.query('INSERT INTO scores (alias, score, email_norm, ip_hash) VALUES ($1, $2, $3, $4)', [alias, score, emailNorm, ipHash]);
    await db.query(
      'INSERT INTO wishlist (email, email_norm, ip_hash, user_agent) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [emailRaw, emailNorm, ONE_PER_IP ? ipHash : null, ua],
    );

    const rankRes = await db.query('SELECT count(*) AS c FROM scores WHERE score > $1', [score]);
    const rank = Number((rankRes.rows[0]?.c as string | number | bigint | undefined) ?? 0) + 1;
    const stats = await getStats(db);
    return reply.code(201).send({ ok: true, rank, alias, score, scores: await topScores(db), wishlist: stats });
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
  console.log(`[youarethead] :${PORT} — meta ${GOAL} — 1/IP=${ONE_PER_IP} — ssl=${useSsl}`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
