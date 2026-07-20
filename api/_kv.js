import crypto from 'node:crypto';

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SCRYPT_KEY_LENGTH = 64;

export function json(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

export async function readBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

async function command(args) {
  if (!REST_URL || !REST_TOKEN) {
    const error = new Error('Configure o Vercel KV/Upstash nas variáveis KV_REST_API_URL e KV_REST_API_TOKEN.');
    error.status = 500;
    throw error;
  }

  const response = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `KV respondeu ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload.result;
}

export async function kvGet(key) {
  const value = await command(['GET', key]);
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function kvSet(key, value) {
  return command(['SET', key, JSON.stringify(value)]);
}

export async function kvDel(key) {
  return command(['DEL', key]);
}

export async function kvSetSession(token, userId) {
  return command(['SET', `session:${token}`, userId, 'EX', String(SESSION_TTL_SECONDS)]);
}

export async function rateLimit(key, limit = 12, windowSeconds = 15 * 60) {
  const count = Number(await command(['INCR', `ratelimit:${key}`]));
  if (count === 1) await command(['EXPIRE', `ratelimit:${key}`, String(windowSeconds)]);
  if (count > limit) {
    const error = new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
    error.status = 429;
    throw error;
  }
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function randomSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password, salt) {
  const derived = crypto.scryptSync(String(password), String(salt), SCRYPT_KEY_LENGTH).toString('hex');
  return `scrypt$${derived}`;
}

export function verifyPassword(password, salt, storedHash) {
  const stored = String(storedHash || '');
  if (stored.startsWith('scrypt$')) {
    const candidate = hashPassword(password, salt);
    return safeEqual(candidate, stored);
  }

  // Compatibilidade com contas antigas. O hash é migrado para scrypt no próximo login.
  const legacy = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return safeEqual(legacy, stored);
}

export function isLegacyPasswordHash(storedHash) {
  return !String(storedHash || '').startsWith('scrypt$');
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    bio: user.bio || '',
    avatar: user.avatar || 'R',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function bearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

export async function requireUser(req) {
  const token = bearerToken(req);
  if (!token) {
    const error = new Error('Sessão não enviada.');
    error.status = 401;
    throw error;
  }

  const userId = await kvGet(`session:${token}`);
  if (!userId) {
    const error = new Error('Sessão expirada. Entre novamente.');
    error.status = 401;
    throw error;
  }

  const user = await kvGet(`user:${userId}`);
  if (!user) {
    const error = new Error('Usuário não encontrado.');
    error.status = 404;
    throw error;
  }
  return user;
}

export function handleError(res, error) {
  return json(res, error.status || 500, {
    error: error instanceof Error ? error.message : 'Erro inesperado no backend.',
  });
}
