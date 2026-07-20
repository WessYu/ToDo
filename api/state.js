import { handleError, json, kvGet, kvSet, readBody, requireUser } from './_kv.js';

const MAX_STATE_BYTES = 1_500_000;
const MAX_TASKS = 5000;
const MAX_FRIENDS = 500;

function text(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

function normalizePriority(value) {
  return ['baixa', 'media', 'alta'].includes(value) ? value : 'media';
}

function normalizeTask(task) {
  return {
    id: text(task?.id, 100),
    title: text(task?.title, 180),
    date: /^\d{4}-\d{2}-\d{2}$/.test(task?.date) ? task.date : '',
    time: /^\d{2}:\d{2}$/.test(task?.time) ? task.time : '',
    priority: normalizePriority(task?.priority),
    project: text(task?.project, 100),
    done: Boolean(task?.done),
    fixedTaskId: text(task?.fixedTaskId, 100) || undefined,
    sharedWith: Array.isArray(task?.sharedWith) ? task.sharedWith.map((id) => text(id, 100)).filter(Boolean).slice(0, 50) : [],
    createdAt: text(task?.createdAt, 40),
    completedAt: text(task?.completedAt, 40) || undefined,
  };
}

function normalizeFixedTask(task) {
  return {
    id: text(task?.id, 100),
    title: text(task?.title, 180),
    time: /^\d{2}:\d{2}$/.test(task?.time) ? task.time : '',
    priority: normalizePriority(task?.priority),
    project: text(task?.project, 100),
    weekdays: Array.isArray(task?.weekdays) ? [...new Set(task.weekdays.map(Number).filter((day) => day >= 0 && day <= 6))] : [],
    active: task?.active !== false,
    sharedWith: Array.isArray(task?.sharedWith) ? task.sharedWith.map((id) => text(id, 100)).filter(Boolean).slice(0, 50) : [],
    createdAt: text(task?.createdAt, 40),
  };
}

function normalizeFriend(friend) {
  return {
    id: text(friend?.id, 100),
    accountId: text(friend?.accountId, 100) || undefined,
    name: text(friend?.name, 100),
    email: text(friend?.email, 180).toLowerCase(),
    avatar: text(friend?.avatar, 220000),
    status: friend?.status === 'accepted' ? 'accepted' : 'manual',
    createdAt: text(friend?.createdAt, 40),
  };
}

function normalizeState(state) {
  const tasks = Array.isArray(state?.tasks) ? state.tasks.map(normalizeTask).filter((task) => task.id && task.title && task.date).slice(0, MAX_TASKS) : [];
  const fixedTasks = Array.isArray(state?.fixedTasks) ? state.fixedTasks.map(normalizeFixedTask).filter((task) => task.id && task.title).slice(0, 1000) : [];
  const friends = Array.isArray(state?.friends) ? state.friends.map(normalizeFriend).filter((friend) => friend.id && friend.name).slice(0, MAX_FRIENDS) : [];
  const githubEvents = state?.github?.events && typeof state.github.events === 'object'
    ? Object.fromEntries(Object.entries(state.github.events).filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date)).slice(0, 730).map(([date, amount]) => [date, Math.max(0, Math.min(999, Number(amount) || 0))]))
    : {};

  return {
    tasks,
    fixedTasks,
    journal: state?.journal && typeof state.journal === 'object' ? state.journal : {},
    github: {
      username: text(state?.github?.username, 39),
      events: githubEvents,
      syncedAt: text(state?.github?.syncedAt, 40),
    },
    friends,
    updatedAt: new Date().toISOString(),
    createdAt: text(state?.createdAt, 40) || new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);
    if (req.method === 'GET') {
      const state = (await kvGet(`state:${user.id}`)) || {};
      return json(res, 200, { state: normalizeState(state) });
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const incoming = body.state || body;
      if (Buffer.byteLength(JSON.stringify(incoming), 'utf8') > MAX_STATE_BYTES) {
        return json(res, 413, { error: 'Seus dados ultrapassaram o limite permitido.' });
      }
      const nextState = normalizeState(incoming);
      await kvSet(`state:${user.id}`, nextState);
      return json(res, 200, { state: nextState });
    }

    return json(res, 405, { error: 'Método não permitido.' });
  } catch (error) {
    return handleError(res, error);
  }
}
