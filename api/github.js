import { handleError, json, kvGet, kvSet, readBody, requireUser } from './_kv.js';

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
    friends: Array.isArray(state?.friends) ? state.friends : [],
    updatedAt: new Date().toISOString(),
    createdAt: state?.createdAt || new Date().toISOString(),
  };
}

function cleanGithubUsername(value) {
  const raw = String(value || '').trim();
  const fromUrl = raw.match(/github\.com\/([A-Za-z0-9-]+)/i)?.[1];
  const clean = (fromUrl || raw).replace(/^@/, '').trim();

  if (!clean) {
    const error = new Error('Informe um usuario do GitHub.');
    error.status = 400;
    throw error;
  }

  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(clean)) {
    const error = new Error('Usuario do GitHub invalido.');
    error.status = 400;
    throw error;
  }

  return clean;
}

function addActivity(activity, date, amount) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  activity[date] = (activity[date] || 0) + amount;
}

function eventWeight(event) {
  const type = String(event?.type || '');
  if (type === 'PushEvent') return Math.max(1, event?.payload?.commits?.length || 1);
  if (type === 'PullRequestEvent') return 2;
  if (type === 'PullRequestReviewEvent') return 2;
  if (type === 'IssuesEvent') return 1;
  if (type === 'CreateEvent') return 1;
  if (type === 'ReleaseEvent') return 3;
  return 1;
}

async function fetchPublicEvents(username) {
  const activity = {};
  let imported = 0;

  for (let page = 1; page <= 3; page += 1) {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100&page=${page}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Ritmo-Presence',
      },
    });

    if (response.status === 404) {
      const error = new Error('Usuario do GitHub nao encontrado.');
      error.status = 404;
      throw error;
    }

    if (response.status === 403 || response.status === 429) {
      const error = new Error('GitHub limitou a sincronizacao agora. Tente novamente em alguns minutos.');
      error.status = 429;
      throw error;
    }

    if (!response.ok) {
      const error = new Error(`GitHub respondeu ${response.status}.`);
      error.status = 502;
      throw error;
    }

    const events = await response.json().catch(() => []);
    if (!Array.isArray(events) || events.length === 0) break;

    imported += events.length;
    for (const event of events) {
      addActivity(activity, String(event?.created_at || '').slice(0, 10), eventWeight(event));
    }

    if (events.length < 100) break;
  }

  return { activity, imported };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Metodo nao permitido.' });

  try {
    const user = await requireUser(req);
    const body = await readBody(req);
    const username = cleanGithubUsername(body.username);
    const { activity, imported } = await fetchPublicEvents(username);

    const currentState = normalizeState((await kvGet(`state:${user.id}`)) || {});
    const nextState = normalizeState({
      ...currentState,
      github: {
        username,
        events: activity,
        syncedAt: new Date().toISOString(),
      },
    });

    await kvSet(`state:${user.id}`, nextState);

    return json(res, 200, {
      state: nextState,
      github: {
        username,
        imported,
        days: Object.keys(activity).length,
        total: Object.values(activity).reduce((sum, amount) => sum + amount, 0),
        syncedAt: nextState.github.syncedAt,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}
