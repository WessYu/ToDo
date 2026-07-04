import { handleError, json, kvDel, kvGet, kvSet, publicUser, requireUser, slugify } from './_kv.js';

export default async function handler(req, res) {
  if (req.method !== 'PUT') return json(res, 405, { error: 'Método não permitido.' });

  try {
    const user = await requireUser(req);
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

    const name = String(body.name || user.name).trim();
    const bio = String(body.bio || '').trim().slice(0, 180);
    const avatar = String(body.avatar || name.slice(0, 1) || 'R').trim().slice(0, 2).toUpperCase();
    const nextUsername = slugify(body.username || user.username);

    if (!name) return json(res, 400, { error: 'Nome obrigatório.' });
    if (!nextUsername) return json(res, 400, { error: 'Usuário inválido.' });

    const usernameOwner = await kvGet(`username:${nextUsername}`);
    if (usernameOwner && usernameOwner !== user.id) {
      return json(res, 409, { error: 'Esse usuário já está em uso.' });
    }

    if (nextUsername !== user.username) {
      await kvDel(`username:${user.username}`);
      await kvSet(`username:${nextUsername}`, user.id);
    }

    const updated = {
      ...user,
      name,
      bio,
      avatar,
      username: nextUsername,
      updatedAt: new Date().toISOString(),
    };

    await kvSet(`user:${user.id}`, updated);

    return json(res, 200, { user: publicUser(updated) });
  } catch (error) {
    return handleError(res, error);
  }
}
