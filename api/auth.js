import {
  createId,
  createToken,
  handleError,
  hashPassword,
  json,
  kvGet,
  kvSet,
  kvSetSession,
  normalizeEmail,
  publicUser,
  randomSalt,
  readBody,
  slugify,
} from './_kv.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

  try {
    const body = await readBody(req);
    const mode = body.mode === 'register' ? 'register' : 'login';
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    if (!email || password.length < 6) {
      return json(res, 400, { error: 'Informe email e senha com pelo menos 6 caracteres.' });
    }

    if (mode === 'register') {
      const name = String(body.name || '').trim();

      if (!name) return json(res, 400, { error: 'Informe seu nome.' });

      const existingEmail = await kvGet(`email:${email}`);
      if (existingEmail) return json(res, 409, { error: 'Já existe uma conta com esse email.' });

      const usernameBase = slugify(body.username || name);
      let username = usernameBase || `user-${Date.now().toString(36)}`;
      let attempt = 1;

      while (await kvGet(`username:${username}`)) {
        attempt += 1;
        username = `${usernameBase}-${attempt}`;
      }

      const id = createId('user');
      const salt = randomSalt();
      const now = new Date().toISOString();

      const user = {
        id,
        name,
        email,
        username,
        bio: '',
        avatar: name.slice(0, 1).toUpperCase(),
        salt,
        passwordHash: hashPassword(password, salt),
        createdAt: now,
        updatedAt: now,
      };

      const initialState = {
        tasks: [],
        journal: {},
        createdAt: now,
        updatedAt: now,
      };

      const token = createToken();

      await kvSet(`user:${id}`, user);
      await kvSet(`email:${email}`, id);
      await kvSet(`username:${username}`, id);
      await kvSet(`state:${id}`, initialState);
      await kvSetSession(token, id);

      return json(res, 200, {
        token,
        user: publicUser(user),
        state: initialState,
      });
    }

    const userId = await kvGet(`email:${email}`);
    if (!userId) return json(res, 401, { error: 'Conta não encontrada.' });

    const user = await kvGet(`user:${userId}`);
    if (!user) return json(res, 401, { error: 'Conta não encontrada.' });

    const passwordHash = hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) return json(res, 401, { error: 'Senha incorreta.' });

    const token = createToken();
    await kvSetSession(token, user.id);

    const state = (await kvGet(`state:${user.id}`)) || { tasks: [], journal: {} };

    return json(res, 200, {
      token,
      user: publicUser(user),
      state,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
