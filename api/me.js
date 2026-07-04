import { handleError, json, publicUser, requireUser } from './_kv.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });

  try {
    const user = await requireUser(req);
    return json(res, 200, { user: publicUser(user) });
  } catch (error) {
    return handleError(res, error);
  }
}
