import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const scrypt = promisify(crypto.scrypt);
const port = Number(process.env.PORT || 3100);
const host = process.env.HOST || '127.0.0.1';
const secureCookie = process.env.COOKIE_SECURE !== 'false';
const sessionDays = Math.max(1, Number(process.env.SESSION_DAYS || 30));
const allowedTables = new Set(['events', 'todos', 'lists', 'notes', 'sessions', 'daily_tasks', 'goals']);
const pool = new Pool();
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

const cookieName = 'wa_session';
const cookie = (token, maxAge) => [
  `${cookieName}=${token}`,
  'Path=/',
  'HttpOnly',
  'SameSite=Strict',
  secureCookie ? 'Secure' : '',
  `Max-Age=${maxAge}`,
].filter(Boolean).join('; ');
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const parseCookie = (header = '') => Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2));

async function passwordHash(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(key).toString('hex')}`;
}
async function passwordMatches(password, stored) {
  const [, saltHex, keyHex] = String(stored).split('$');
  if (!saltHex || !keyHex) return false;
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltHex, 'hex'), 64));
  const expected = Buffer.from(keyHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const maxAge = sessionDays * 86400;
  await pool.query('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+($3 * interval \'1 second\'))', [tokenHash(token), userId, maxAge]);
  res.setHeader('Set-Cookie', cookie(token, maxAge));
}
async function currentUser(req) {
  const token = parseCookie(req.headers.cookie)[cookieName];
  if (!token) return null;
  const { rows } = await pool.query(`
    SELECT u.id, u.email FROM app_sessions s
    JOIN app_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now()
  `, [tokenHash(token)]);
  return rows[0] ?? null;
}
async function requireUser(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: '登录已失效，请重新登录' });
    req.user = user;
    next();
  } catch (error) { next(error); }
}

const attempts = new Map();
function authLimit(req, res, next) {
  const now = Date.now();
  const entry = attempts.get(req.ip) ?? { start: now, count: 0 };
  if (now - entry.start > 15 * 60_000) { entry.start = now; entry.count = 0; }
  entry.count += 1; attempts.set(req.ip, entry);
  if (entry.count > 30) return res.status(429).json({ error: '登录尝试过于频繁，请稍后再试' });
  next();
}
function credentials(body) {
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('邮箱格式不正确'), { status: 400 });
  if (password.length < 6 || password.length > 128) throw Object.assign(new Error('密码长度必须为 6–128 位'), { status: 400 });
  return { email, password };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/auth/session', async (req, res, next) => {
  try { res.json({ user: await currentUser(req) }); } catch (error) { next(error); }
});
app.post('/api/auth/signup', authLimit, async (req, res, next) => {
  try {
    const { email, password } = credentials(req.body);
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO app_users(id,email,password_hash) VALUES($1,$2,$3)', [id, email, await passwordHash(password)]);
    await createSession(id, res);
    res.status(201).json({ user: { id, email } });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: '该邮箱已注册，请直接登录' });
    next(error);
  }
});
app.post('/api/auth/signin', authLimit, async (req, res, next) => {
  try {
    const { email, password } = credentials(req.body);
    const { rows } = await pool.query('SELECT id,email,password_hash FROM app_users WHERE email=$1', [email]);
    const user = rows[0];
    if (!user || !(await passwordMatches(password, user.password_hash))) return res.status(401).json({ error: '邮箱或密码不正确' });
    await createSession(user.id, res);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (error) { next(error); }
});
app.post('/api/auth/signout', async (req, res, next) => {
  try {
    const token = parseCookie(req.headers.cookie)[cookieName];
    if (token) await pool.query('DELETE FROM app_sessions WHERE token_hash=$1', [tokenHash(token)]);
    res.setHeader('Set-Cookie', cookie('', 0));
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/sync', requireUser, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const since = Math.max(0, Number(req.body?.since) || 0);
    const changes = Array.isArray(req.body?.changes) ? req.body.changes.slice(0, 10_000) : [];
    await client.query('BEGIN');
    for (const change of changes) {
      const table = String(change?.table ?? '');
      const id = String(change?.id ?? '').slice(0, 200);
      const updatedAt = Number(change?.updatedAt);
      if (!allowedTables.has(table) || !id || !Number.isFinite(updatedAt) || updatedAt <= 0) continue;
      const data = change?.data && typeof change.data === 'object' ? change.data : {};
      await client.query(`
        INSERT INTO app_records(user_id,table_name,record_id,data,updated_at,deleted)
        VALUES($1,$2,$3,$4::jsonb,$5,$6)
        ON CONFLICT(user_id,table_name,record_id) DO UPDATE SET
          data=excluded.data, updated_at=excluded.updated_at, deleted=excluded.deleted,
          revision=nextval(pg_get_serial_sequence('app_records','revision'))
        WHERE app_records.updated_at <= excluded.updated_at
      `, [req.user.id, table, id, JSON.stringify(data), updatedAt, Boolean(change.deleted)]);
    }
    const { rows } = await client.query(`
      SELECT table_name AS "table", record_id AS id, data, updated_at AS "updatedAt", deleted, revision
      FROM app_records WHERE user_id=$1 AND revision>$2 ORDER BY revision ASC
    `, [req.user.id, since]);
    const cursor = rows.reduce((max, row) => Math.max(max, Number(row.revision)), since);
    await client.query('COMMIT');
    res.json({ cursor, changes: rows.map(({ revision: _revision, ...row }) => ({ ...row, updatedAt: Number(row.updatedAt) })) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { client.release(); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error?.status || 500).json({ error: error?.status ? error.message : '服务器内部错误' });
});

await pool.query(await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
await pool.query('DELETE FROM app_sessions WHERE expires_at <= now()');
const server = app.listen(port, host, () => console.log(`WorkAssistant API listening on ${host}:${port}`));
const shutdown = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
