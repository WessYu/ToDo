import { handleError, json, kvGet, kvSet, requireUser } from './_kv.js';

function normalizeState(state) {
  return {
    tasks: Array.isArray(state?.tasks) ? state.tasks : [],
    fixedTasks: Array.isArray(state?.fixedTasks) ? state.fixedTasks : [],
    journal: state?.journal && typeof state.journal === 'object' ? state.journal : {},
    github: {
      username: typeof state?.github?.username === 'string' ? state.github.username : '',
      events: state?.github?.events && typeof state.github.events === 'object' ? state.github.events : {},
      syncedAt: typeof state?.github?.syncedAt === 'string' ? state.github.syncedAt : '',
    },
    updatedAt: new Date().toISOString(),
    createdAt: state?.createdAt || new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);

    if (req.method === 'GET') {
      const state = (await kvGet(`state:${user.id}`)) || {
        tasks: [],
        fixedTasks: [],
        journal: {},
        github: {
          username: '',
          events: {},
          syncedAt: '',
        },
      };

      return json(res, 200, { state: normalizeState(state) });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const nextState = normalizeState(body.state || body);

      await kvSet(`state:${user.id}`, nextState);

      return json(res, 200, { state: nextState });
    }

    return json(res, 405, { error: 'Método não permitido.' });
  } catch (error) {
    return handleError(res, error);
  }
}
