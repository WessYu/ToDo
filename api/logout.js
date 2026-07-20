import { bearerToken, handleError, json, kvDel, requireUser } from './_kv.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  try {
    await requireUser(req);
    const token = bearerToken(req);
    if (token) await kvDel(`session:${token}`);
    return json(res, 200, { ok: true });
  } catch (error) {
    return handleError(res, error);
  }
}
