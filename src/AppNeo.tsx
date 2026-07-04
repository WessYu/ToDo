import { FormEvent, useEffect, useMemo, useState } from 'react';

type View = 'hoje' | 'tarefas' | 'presenca' | 'ia' | 'perfil';
type Priority = 'baixa' | 'media' | 'alta';

type Task = {
  id: string;
  title: string;
  date: string;
  time: string;
  priority: Priority;
  project: string;
  done: boolean;
  createdAt: string;
  completedAt?: string;
  fixedTaskId?: string;
};

type FixedTask = {
  id: string;
  title: string;
  time: string;
  priority: Priority;
  project: string;
  weekdays: number[];
  active: boolean;
  createdAt: string;
};

type GithubState = {
  username: string;
  events: Record<string, number>;
  syncedAt: string;
};

type AppData = {
  tasks: Task[];
  fixedTasks: FixedTask[];
  journal: Record<string, { intention?: string; notes?: string }>;
  github: GithubState;
  createdAt?: string;
  updatedAt?: string;
};

type User = {
  id: string;
  name: string;
  email: string;
  username: string;
  bio: string;
  avatar: string;
  createdAt: string;
  updatedAt?: string;
};

type PresenceDay = {
  iso: string;
  taskCompleted: number;
  githubActivity: number;
  total: number;
  level: number;
  today: boolean;
};

const TOKEN_KEY = 'ritmo-presence-token-v1';

const emptyData: AppData = {
  tasks: [],
  fixedTasks: [],
  journal: {},
  github: {
    username: '',
    events: {},
    syncedAt: '',
  },
};

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: 'hoje', label: 'Hoje', icon: 'â' },
  { id: 'tarefas', label: 'Tarefas', icon: 'â·' },
  { id: 'presenca', label: 'PresenÃ§a', icon: 'â¦' },
  { id: 'ia', label: 'IA', icon: 'â¦' },
  { id: 'perfil', label: 'Perfil', icon: 'â' },
];

const weekLabels = [
  { value: 0, label: 'D' },
  { value: 1, label: 'S' },
  { value: 2, label: 'T' },
  { value: 3, label: 'Q' },
  { value: 4, label: 'Q' },
  { value: 5, label: 'S' },
  { value: 6, label: 'S' },
];

function makeId(prefix: string) {
  if ('randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIso(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', options).format(parseIso(value));
}

function weekdayForDate(value: string) {
  return parseIso(value).getDay();
}

function normalizeData(raw?: Partial<AppData> | null): AppData {
  return {
    tasks: Array.isArray(raw?.tasks) ? raw.tasks : [],
    fixedTasks: Array.isArray(raw?.fixedTasks) ? raw.fixedTasks : [],
    journal: raw?.journal && typeof raw.journal === 'object' ? raw.journal : {},
    github: {
      username: typeof raw?.github?.username === 'string' ? raw.github.username : '',
      events: raw?.github?.events && typeof raw.github.events === 'object' ? raw.github.events : {},
      syncedAt: typeof raw?.github?.syncedAt === 'string' ? raw.github.syncedAt : '',
    },
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

function priorityLabel(priority: Priority) {
  return { baixa: 'Baixa', media: 'MÃ©dia', alta: 'Alta' }[priority];
}

function presenceLevel(total: number) {
  if (total <= 0) return 0;
  if (total >= 8) return 4;
  if (total >= 5) return 3;
  if (total >= 2) return 2;
  return 1;
}

function buildPresenceDays(tasks: Task[], githubEvents: Record<string, number>) {
  const today = isoDate();
  const todayDate = parseIso(today);

  const taskTotals = tasks.reduce<Record<string, number>>((acc, task) => {
    if (!task.done) return acc;
    acc[task.date] = (acc[task.date] || 0) + 1;
    return acc;
  }, {});

  return Array.from({ length: 365 }, (_, index): PresenceDay => {
    const iso = isoDate(addDays(todayDate, index - 364));
    const taskCompleted = taskTotals[iso] || 0;
    const githubActivity = githubEvents[iso] || 0;
    const total = taskCompleted + githubActivity;

    return {
      iso,
      taskCompleted,
      githubActivity,
      total,
      level: presenceLevel(total),
      today: iso === today,
    };
  });
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token = ''): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error(payload.error || `Erro ${response.status}`);
  return payload as T;
}

async function fetchGithubPublicEvents(username: string) {
  const cleanUsername = username.trim();
  if (!cleanUsername) throw new Error('Informe um usuÃ¡rio do GitHub no perfil.');

  const activity: Record<string, number> = {};

  for (let page = 1; page <= 3; page += 1) {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanUsername)}/events/public?per_page=100&page=${page}`);

    if (response.status === 404) throw new Error('UsuÃ¡rio do GitHub nÃ£o encontrado.');
    if (!response.ok) throw new Error('NÃ£o consegui buscar os eventos pÃºblicos do GitHub.');

    const events = await response.json();

    if (!Array.isArray(events) || events.length === 0) break;

    for (const event of events) {
      if (!event?.created_at) continue;

      const date = String(event.created_at).slice(0, 10);
      const type = String(event.type || '');

      const weight =
        type === 'PushEvent' ? Math.max(1, event.payload?.commits?.length || 1) :
        type === 'PullRequestEvent' ? 2 :
        type === 'IssuesEvent' ? 1 :
        type === 'CreateEvent' ? 1 :
        type === 'PullRequestReviewEvent' ? 1 :
        1;

      activity[date] = (activity[date] || 0) + weight;
    }
  }

  return activity;
}

function AuthScreen({ onAuth }: { onAuth: (token: string, user: User, state?: AppData) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = await apiRequest<{ token: string; user: User; state?: AppData }>('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ mode, name, email, password }),
      });

      onAuth(payload.token, payload.user, payload.state);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'NÃ£o consegui entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="neo-auth">
      <section className="terminal-frame auth-frame">
        <div className="top-leds" aria-hidden="true"><span /><span /><span /></div>
        <span className="kicker">RT-78 / SECURE ACCESS</span>
        <h1>Ritmo Presence</h1>
        <p>Conta real pelo backend do Vercel, tarefas salvas por usuÃ¡rio, presenÃ§a estilo Loggd e integraÃ§Ã£o pÃºblica com GitHub.</p>

        <form className="neo-form" onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Nome
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Wess" />
            </label>
          )}

          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" autoCapitalize="none" autoCorrect="off" />
          </label>

          <label>
            Senha
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mÃ­nimo 6 caracteres" />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="neo-primary" type="submit" disabled={loading}>
            {loading ? 'PROCESSANDO...' : mode === 'login' ? 'ENTRAR' : 'CRIAR USUÃRIO'}
          </button>
        </form>

        <button className="link-button" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Criar novo usuÃ¡rio' : 'JÃ¡ tenho uma conta'}
        </button>
      </section>
    </main>
  );
}

function PresenceGrid({ days, selectedDate, onSelectDate, compact = false }: { days: PresenceDay[]; selectedDate: string; onSelectDate: (date: string) => void; compact?: boolean }) {
  const blanks = parseIso(days[0]?.iso || isoDate()).getDay();
  const cells = [
    ...Array.from({ length: blanks }, (_, index) => ({ type: 'blank' as const, id: `blank-${index}` })),
    ...days.map((day) => ({ type: 'day' as const, id: day.iso, day })),
  ];

  return (
    <div className={compact ? 'presence-grid compact' : 'presence-grid'} role="grid" aria-label="PresenÃ§a anual por tarefas concluÃ­das e GitHub">
      {cells.map((cell) => {
        if (cell.type === 'blank') return <span className="presence-cell blank" key={cell.id} />;

        return (
          <button
            key={cell.day.iso}
            type="button"
            className={`presence-cell level-${cell.day.level} ${cell.day.iso === selectedDate ? 'selected' : ''} ${cell.day.today ? 'today' : ''}`}
            title={`${formatDate(cell.day.iso, { day: '2-digit', month: 'long', year: 'numeric' })}: ${cell.day.taskCompleted} tarefa(s), ${cell.day.githubActivity} GitHub`}
            aria-label={`${cell.day.total} atividades em ${cell.day.iso}`}
            onClick={() => onSelectDate(cell.day.iso)}
          />
        );
      })}
    </div>
  );
}

function TaskRow({ task, onToggle, onRemove, fixed = false }: { task: Task; onToggle: (id: string) => void; onRemove: (id: string) => void; fixed?: boolean }) {
  return (
    <article className={task.done ? 'task-row done' : 'task-row'}>
      <button className="task-check" type="button" onClick={() => onToggle(task.id)} aria-label="Alternar conclusÃ£o">{task.done ? 'â' : ''}</button>

      <button className="task-main" type="button" onClick={() => onToggle(task.id)}>
        <strong>{task.title}{fixed ? ' Â· fixa' : ''}</strong>
        <span>{task.time || 'sem horÃ¡rio'} Â· {priorityLabel(task.priority)}{task.project ? ` Â· ${task.project}` : ''}</span>
      </button>

      <button className="task-delete" type="button" onClick={() => onRemove(task.id)} aria-label="Excluir tarefa">Ã</button>
    </article>
  );
}

function EmptyTerminal({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-terminal">
      <span>â</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppData>(emptyData);
  const [view, setView] = useState<View>('hoje');
  const [selectedDate, setSelectedDate] = useState(() => isoDate());
  const [booting, setBooting] = useState(Boolean(token));
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');

  const [draftTitle, setDraftTitle] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [draftProject, setDraftProject] = useState('');
  const [draftPriority, setDraftPriority] = useState<Priority>('media');
  const [draftFixed, setDraftFixed] = useState(false);
  const [draftWeekdays, setDraftWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const [profileDraft, setProfileDraft] = useState({ name: '', username: '', bio: '', avatar: '', githubUsername: '' });
  const [githubSyncing, setGithubSyncing] = useState(false);

  const presenceDays = useMemo(() => buildPresenceDays(data.tasks, data.github.events), [data.tasks, data.github.events]);
  const selectedOneOffTasks = useMemo(() => data.tasks.filter((task) => task.date === selectedDate && !task.fixedTaskId).sort((a, b) => `${a.done}${a.time}`.localeCompare(`${b.done}${b.time}`)), [data.tasks, selectedDate]);

  const selectedFixedItems = useMemo(() => {
    const day = weekdayForDate(selectedDate);

    return data.fixedTasks
      .filter((fixedTask) => fixedTask.active && fixedTask.weekdays.includes(day))
      .map((fixedTask) => {
        const existing = data.tasks.find((task) => task.date === selectedDate && task.fixedTaskId === fixedTask.id);
        const task: Task = existing || {
          id: fixedTask.id,
          fixedTaskId: fixedTask.id,
          title: fixedTask.title,
          date: selectedDate,
          time: fixedTask.time,
          priority: fixedTask.priority,
          project: fixedTask.project,
          done: false,
          createdAt: fixedTask.createdAt,
        };

        return { fixedTask, task, existing };
      });
  }, [data.fixedTasks, data.tasks, selectedDate]);

  const todayTasks = useMemo(() => data.tasks.filter((task) => task.date === isoDate()), [data.tasks]);

  const selectedPresence = presenceDays.find((day) => day.iso === selectedDate) || { iso: selectedDate, taskCompleted: 0, githubActivity: 0, total: 0, level: 0, today: false };
  const completedToday = todayTasks.filter((task) => task.done).length;
  const selectedCompleted = selectedOneOffTasks.filter((task) => task.done).length + selectedFixedItems.filter((item) => item.task.done).length;
  const selectedTotal = selectedOneOffTasks.length + selectedFixedItems.length;
  const totalCompleted = data.tasks.filter((task) => task.done).length;
  const totalGithub = Object.values(data.github.events).reduce((sum, amount) => sum + amount, 0);
  const bestDay = presenceDays.reduce((best, day) => (day.total > best.total ? day : best), presenceDays[0] || selectedPresence);
  const activeDays = presenceDays.filter((day) => day.total > 0).length;

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }

    let cancelled = false;

    async function boot() {
      setBooting(true);
      setError('');

      try {
        const me = await apiRequest<{ user: User }>('/api/me', {}, token);
        const statePayload = await apiRequest<{ state: AppData }>('/api/state', {}, token);
        const normalized = normalizeData(statePayload.state);

        if (cancelled) return;

        setUser(me.user);
        setProfileDraft({
          name: me.user.name || '',
          username: me.user.username || '',
          bio: me.user.bio || '',
          avatar: me.user.avatar || '',
          githubUsername: normalized.github.username || '',
        });
        setData(normalized);
        setHydrated(true);
      } catch (apiError) {
        if (cancelled) return;

        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setUser(null);
        setHydrated(false);
        setError(apiError instanceof Error ? apiError.message : 'SessÃ£o invÃ¡lida.');
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !hydrated || !user) return undefined;

    const timer = window.setTimeout(() => {
      apiRequest('/api/state', { method: 'PUT', body: JSON.stringify({ state: data }) }, token).catch((apiError) => {
        setError(apiError instanceof Error ? apiError.message : 'NÃ£o salvei no backend.');
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [data, hydrated, token, user]);

  function handleAuth(nextToken: string, nextUser: User, state?: AppData) {
    const normalized = normalizeData(state || emptyData);

    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setProfileDraft({
      name: nextUser.name || '',
      username: nextUser.username || '',
      bio: nextUser.bio || '',
      avatar: nextUser.avatar || '',
      githubUsername: normalized.github.username || '',
    });
    setData(normalized);
    setHydrated(true);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
    setHydrated(false);
    setData(emptyData);
    setView('hoje');
  }

  function toggleWeekday(day: number) {
    setDraftWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort());
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftTitle.trim()) return;

    const now = new Date().toISOString();

    if (draftFixed) {
      const fixedTask: FixedTask = {
        id: makeId('fixed'),
        title: draftTitle.trim(),
        time: draftTime,
        priority: draftPriority,
        project: draftProject.trim(),
        weekdays: draftWeekdays.length ? draftWeekdays : [0, 1, 2, 3, 4, 5, 6],
        active: true,
        createdAt: now,
      };

      setData((current) => ({ ...current, fixedTasks: [fixedTask, ...current.fixedTasks] }));
    } else {
      const task: Task = {
        id: makeId('task'),
        title: draftTitle.trim(),
        date: selectedDate,
        time: draftTime,
        priority: draftPriority,
        project: draftProject.trim(),
        done: false,
        createdAt: now,
      };

      setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    }

    setDraftTitle('');
    setDraftTime('');
    setDraftProject('');
  }

  function toggleTask(id: string) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done, completedAt: !task.done ? new Date().toISOString() : undefined } : task),
    }));
  }

  function removeTask(id: string) {
    setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }));
  }

  function toggleFixedTask(fixedTaskId: string) {
    const fixedTask = data.fixedTasks.find((item) => item.id === fixedTaskId);
    if (!fixedTask) return;

    const existing = data.tasks.find((task) => task.date === selectedDate && task.fixedTaskId === fixedTaskId);

    if (existing) {
      toggleTask(existing.id);
      return;
    }

    const now = new Date().toISOString();
    const completedTask: Task = {
      id: makeId('task'),
      fixedTaskId,
      title: fixedTask.title,
      date: selectedDate,
      time: fixedTask.time,
      priority: fixedTask.priority,
      project: fixedTask.project,
      done: true,
      createdAt: now,
      completedAt: now,
    };

    setData((current) => ({ ...current, tasks: [completedTask, ...current.tasks] }));
  }

  function removeFixedTask(fixedTaskId: string) {
    setData((current) => ({
      ...current,
      fixedTasks: current.fixedTasks.filter((item) => item.id !== fixedTaskId),
    }));
  }

  async function syncGithubActivity() {
    const username = profileDraft.githubUsername.trim() || data.github.username.trim();

    setGithubSyncing(true);
    setError('');

    try {
      const events = await fetchGithubPublicEvents(username);
      setData((current) => ({
        ...current,
        github: {
          username,
          events,
          syncedAt: new Date().toISOString(),
        },
      }));
      setProfileDraft((current) => ({ ...current, githubUsername: username }));
      setError('GitHub sincronizado.');
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'NÃ£o consegui sincronizar o GitHub.');
    } finally {
      setGithubSyncing(false);
    }
  }

  async function askAi() {
    setAiLoading(true);
    setAiAnswer('');
    setError('');

    try {
      const payload = await apiRequest<{ answer: string }>('/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          prompt: aiPrompt.trim() || 'Analise minhas tarefas, GitHub e presenÃ§a e me diga o prÃ³ximo passo mais importante.',
          date: selectedDate,
          tasks: [...selectedOneOffTasks, ...selectedFixedItems.map((item) => item.task)],
          fixedTasks: data.fixedTasks,
          presence: {
            selectedDate,
            completedToday,
            totalToday: todayTasks.length,
            totalCompleted,
            githubActivitySelected: selectedPresence.githubActivity,
            totalGithub,
            activeDays,
          },
        }),
      }, token);

      setAiAnswer(payload.answer || 'A IA nÃ£o devolveu texto.');
    } catch (apiError) {
      setAiAnswer(apiError instanceof Error ? apiError.message : 'NÃ£o consegui falar com a IA.');
    } finally {
      setAiLoading(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = await apiRequest<{ user: User }>('/api/profile', { method: 'PUT', body: JSON.stringify(profileDraft) }, token);
      setUser(payload.user);
      setData((current) => ({
        ...current,
        github: {
          ...current.github,
          username: profileDraft.githubUsername.trim(),
        },
      }));
      setProfileDraft((current) => ({
        ...current,
        name: payload.user.name || '',
        username: payload.user.username || '',
        bio: payload.user.bio || '',
        avatar: payload.user.avatar || '',
      }));
      setError('Perfil salvo no backend.');
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'NÃ£o consegui salvar o perfil.');
    }
  }

  if (booting) {
    return (
      <main className="neo-auth">
        <section className="terminal-frame auth-frame">
          <span className="kicker">LOADING SESSION</span>
          <h1>Sincronizando...</h1>
        </section>
      </main>
    );
  }

  if (!token || !user) return <AuthScreen onAuth={handleAuth} />;

  return (
    <div className="neo-app">
      <aside className="neo-sidebar terminal-frame">
        <div className="top-leds" aria-hidden="true"><span /><span /><span /></div>

        <div className="brand-lockup">
          <div className="brand-mark">{user.avatar || 'R'}</div>
          <div>
            <strong>Ritmo</strong>
            <small>@{user.username}</small>
          </div>
        </div>

        <p className="side-copy">TASK + GITHUB PRESENCE / BUILT FOR FOCUS / DESIGNED FOR TRUST</p>

        <nav className="side-nav">
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? 'active' : ''} type="button" onClick={() => setView(item.id)}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <button className="outline-button" type="button" onClick={logout}>SAIR</button>
      </aside>

      <main className="neo-workspace">
        <header className="neo-header">
          <div>
            <span className="kicker">RT-78 / {formatDate(selectedDate, { weekday: 'long' })}</span>
            <h1>{view === 'presenca' ? 'PresenÃ§a' : view === 'tarefas' ? 'Tarefas' : view === 'perfil' ? 'Perfil' : view === 'ia' ? 'OpenAI' : 'Painel'}</h1>
          </div>

          <div className="date-terminal">
            <button type="button" onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), -1)))}>â¹</button>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            <button type="button" onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), 1)))}>âº</button>
          </div>
        </header>

        {error && <div className={error.includes('salvo') || error.includes('sincronizado') ? 'alert success' : 'alert error'}>{error}</div>}

        {view === 'hoje' && (
          <section className="screen-grid">
            <section className="terminal-frame panel-large loggd-card">
              <div className="panel-head">
                <div>
                  <span className="kicker">TRACK YOUR LIFE / SEE YOUR YEAR</span>
                  <h2>PresenÃ§a anual</h2>
                  <p>Tarefas concluÃ­das + atividade pÃºblica do GitHub. Clique em qualquer dia para ver detalhes.</p>
                </div>
                <button className="outline-button" type="button" onClick={() => setView('presenca')}>ABRIR</button>
              </div>

              <PresenceGrid days={presenceDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} compact />

              <div className="selected-report inline-report">
                <span className="kicker">SELECTED DATE</span>
                <h3>{formatDate(selectedDate, { day: '2-digit', month: 'long', year: 'numeric' })}</h3>
                <p>{selectedPresence.taskCompleted} tarefa(s) + {selectedPresence.githubActivity} atividade(s) GitHub.</p>
              </div>
            </section>

            <div className="metric-strip">
              <div className="metric-card"><span>TOTAL DONE</span><strong>{totalCompleted}</strong></div>
              <div className="metric-card"><span>FIXAS</span><strong>{data.fixedTasks.length}</strong></div>
              <div className="metric-card"><span>GITHUB</span><strong>{totalGithub}</strong></div>
              <div className="metric-card"><span>ACTIVE DAYS</span><strong>{activeDays}</strong></div>
              <div className="metric-card"><span>BEST DAY</span><strong>{bestDay.total}</strong></div>
            </div>

            <section className="terminal-frame panel-large">
              <div className="panel-head">
                <div>
                  <span className="kicker">TASK LOG</span>
                  <h2>{formatDate(selectedDate, { day: '2-digit', month: 'long', year: 'numeric' })}</h2>
                </div>
                <button className="outline-button" type="button" onClick={() => setView('tarefas')}>NOVA</button>
              </div>

              <div className="task-list">
                {selectedFixedItems.map((item) => (
                  <TaskRow key={item.fixedTask.id} task={item.task} fixed onToggle={() => toggleFixedTask(item.fixedTask.id)} onRemove={() => removeFixedTask(item.fixedTask.id)} />
                ))}
                {selectedOneOffTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onRemove={removeTask} />)}
                {!selectedFixedItems.length && !selectedOneOffTasks.length && <EmptyTerminal title="Nenhuma tarefa nesse dia" text="Crie uma tarefa normal ou fixa para acender a presenÃ§a." />}
              </div>
            </section>
          </section>
        )}

        {view === 'tarefas' && (
          <section className="task-layout">
            <form className="terminal-frame neo-form task-form" onSubmit={addTask}>
              <span className="kicker">NEW TASK</span>
              <h2>Registrar tarefa</h2>

              <label>
                TÃ­tulo
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Ex.: estudar React" />
              </label>

              <div className="field-row">
                <label>
                  Hora
                  <input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} />
                </label>

                <label>
                  Prioridade
                  <select value={draftPriority} onChange={(event) => setDraftPriority(event.target.value as Priority)}>
                    <option value="baixa">Baixa</option>
                    <option value="media">MÃ©dia</option>
                    <option value="alta">Alta</option>
                  </select>
                </label>
              </div>

              <label>
                Projeto
                <input value={draftProject} onChange={(event) => setDraftProject(event.target.value)} placeholder="Opcional" />
              </label>

              <label className="fixed-toggle">
                <input type="checkbox" checked={draftFixed} onChange={(event) => setDraftFixed(event.target.checked)} />
                Tornar tarefa fixa
              </label>

              {draftFixed && (
                <div className="weekday-row">
                  {weekLabels.map((day) => (
                    <button key={`${day.value}-${day.label}`} type="button" className={draftWeekdays.includes(day.value) ? 'active' : ''} onClick={() => toggleWeekday(day.value)}>
                      {day.label}
                    </button>
                  ))}
                </div>
              )}

              <button className="neo-primary" type="submit">{draftFixed ? 'ADICIONAR FIXA' : 'ADICIONAR'}</button>
            </form>

            <section className="terminal-frame panel-large">
              <div className="panel-head">
                <div>
                  <span className="kicker">DAY QUEUE</span>
                  <h2>{selectedCompleted}/{selectedTotal} completas</h2>
                </div>
              </div>

              <div className="task-list">
                {selectedFixedItems.map((item) => (
                  <TaskRow key={item.fixedTask.id} task={item.task} fixed onToggle={() => toggleFixedTask(item.fixedTask.id)} onRemove={() => removeFixedTask(item.fixedTask.id)} />
                ))}
                {selectedOneOffTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onRemove={removeTask} />)}
                {!selectedFixedItems.length && !selectedOneOffTasks.length && <EmptyTerminal title="Fila vazia" text="Adicione blocos de foco, tarefas fixas ou compromissos." />}
              </div>
            </section>
          </section>
        )}

        {view === 'presenca' && (
          <section className="presence-view terminal-frame">
            <div className="panel-head">
              <div>
                <span className="kicker">365 DAYS / TASK + GITHUB COMPLETION</span>
                <h2>Sistema de presenÃ§a</h2>
                <p>Fiel ao conceito do Loggd: um ano inteiro de atividade, tudo clicÃ¡vel e salvo no seu perfil.</p>
              </div>
              <div className="presence-legend"><span /><span /><span /><span /><span /></div>
            </div>

            <div className="github-sync-card">
              <div>
                <span className="kicker">VINCULAR GITHUB</span>
                <strong>{data.github.username ? `@${data.github.username}` : 'Nenhum GitHub conectado'}</strong>
                <p>{data.github.syncedAt ? `Sincronizado em ${new Date(data.github.syncedAt).toLocaleString('pt-BR')}` : 'Digite seu usuÃ¡rio pÃºblico do GitHub e sincronize.'}</p>
              </div>
              <div className="github-sync-actions">
                <input value={profileDraft.githubUsername} onChange={(event) => setProfileDraft((current) => ({ ...current, githubUsername: event.target.value }))} placeholder="WessYu" />
                <button className="neo-primary" type="button" onClick={syncGithubActivity} disabled={githubSyncing}>{githubSyncing ? 'SYNC...' : 'SINCRONIZAR'}</button>
              </div>
            </div>

            <PresenceGrid days={presenceDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

            <div className="selected-report">
              <span className="kicker">SELECTED DATE</span>
              <h3>{formatDate(selectedDate, { day: '2-digit', month: 'long', year: 'numeric' })}</h3>
              <p>{selectedPresence.taskCompleted} tarefa(s) concluÃ­da(s), {selectedPresence.githubActivity} atividade(s) GitHub e {selectedPresence.total} atividade(s) no total.</p>
            </div>

            <div className="task-list compact-list">
              {selectedFixedItems.map((item) => (
                <TaskRow key={item.fixedTask.id} task={item.task} fixed onToggle={() => toggleFixedTask(item.fixedTask.id)} onRemove={() => removeFixedTask(item.fixedTask.id)} />
              ))}
              {selectedOneOffTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onRemove={removeTask} />)}
              {!selectedFixedItems.length && !selectedOneOffTasks.length && <EmptyTerminal title="Sem tarefas nesse dia" text="O quadrado tambÃ©m pode acender sÃ³ com atividade pÃºblica do GitHub." />}
            </div>
          </section>
        )}

        {view === 'ia' && (
          <section className="terminal-frame ai-screen">
            <span className="kicker">OPENAI PLANNER</span>
            <h2>Planejamento inteligente</h2>
            <p>A IA usa as tarefas do dia selecionado, tarefas fixas, presenÃ§a anual e GitHub para sugerir o prÃ³ximo passo.</p>

            <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Pergunte: o que devo priorizar hoje?" />

            <button className="neo-primary" type="button" onClick={askAi} disabled={aiLoading}>
              {aiLoading ? 'GERANDO...' : 'GERAR PLANO'}
            </button>

            <div className="ai-answer">{aiAnswer || 'A resposta aparece aqui.'}</div>
          </section>
        )}

        {view === 'perfil' && (
          <section className="profile-layout">
            <div className="terminal-frame profile-card">
              <div className="profile-avatar">{user.avatar || 'R'}</div>
              <span className="kicker">ACTIVE USER</span>
              <h2>{user.name}</h2>
              <p>@{user.username}</p>
              <p>{user.email}</p>
              <p>{data.github.username ? `GitHub: @${data.github.username}` : 'GitHub ainda nÃ£o conectado'}</p>

              <div className="metric-strip mini">
                <div className="metric-card"><span>TASKS</span><strong>{data.tasks.length}</strong></div>
                <div className="metric-card"><span>FIXAS</span><strong>{data.fixedTasks.length}</strong></div>
                <div className="metric-card"><span>DONE</span><strong>{totalCompleted}</strong></div>
                <div className="metric-card"><span>GITHUB</span><strong>{totalGithub}</strong></div>
              </div>
            </div>

            <form className="terminal-frame neo-form profile-form" onSubmit={saveProfile}>
              <span className="kicker">USER PROFILE</span>
              <h2>Editar perfil</h2>

              <label>
                Nome
                <input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>

              <label>
                UsuÃ¡rio
                <input value={profileDraft.username} onChange={(event) => setProfileDraft((current) => ({ ...current, username: event.target.value }))} />
              </label>

              <label>
                GitHub username
                <input value={profileDraft.githubUsername} onChange={(event) => setProfileDraft((current) => ({ ...current, githubUsername: event.target.value }))} placeholder="WessYu" />
              </label>

              <label>
                Avatar
                <input value={profileDraft.avatar} onChange={(event) => setProfileDraft((current) => ({ ...current, avatar: event.target.value }))} maxLength={2} />
              </label>

              <label>
                Bio
                <textarea value={profileDraft.bio} onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))} placeholder="Foco, estudo, dev, design..." />
              </label>

              <button className="neo-primary" type="submit">SALVAR PERFIL</button>
              <button className="outline-button" type="button" onClick={syncGithubActivity} disabled={githubSyncing}>{githubSyncing ? 'SINCRONIZANDO...' : 'VINCULAR / SINCRONIZAR GITHUB'}</button>
            </form>
          </section>
        )}
      </main>

      <nav className="bottom-terminal">
        {navItems.map((item) => (
          <button key={item.id} className={view === item.id ? 'active' : ''} type="button" onClick={() => setView(item.id)}>
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
            
