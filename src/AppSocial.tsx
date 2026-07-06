import { FormEvent, useEffect, useMemo, useState } from 'react';

type View = 'hoje' | 'tarefas' | 'presenca' | 'perfil' | 'ia';
type Priority = 'baixa' | 'media' | 'alta';

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

type Friend = {
  id: string;
  name: string;
  email: string;
  avatar: string;
  createdAt: string;
};

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
  sharedWith?: string[];
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

type AppData = {
  tasks: Task[];
  fixedTasks: FixedTask[];
  journal: Record<string, { intention?: string; notes?: string }>;
  github: { username: string; events: Record<string, number>; syncedAt: string };
  apple: { email: string; connectedAt: string };
  friends: Friend[];
  createdAt?: string;
  updatedAt?: string;
};

type PresenceDay = {
  iso: string;
  planned: number;
  completed: number;
  github: number;
  total: number;
  level: number;
  today: boolean;
};

type TaskCalendar = {
  id: string;
  title: string;
  meta: string;
  planned: number;
  completed: number;
  days: Array<{ iso: string; planned: boolean; completed: boolean; level: number; today: boolean }>;
};

const TOKEN_KEY = 'ritmo-presence-token-v1';

const emptyData: AppData = {
  tasks: [],
  fixedTasks: [],
  journal: {},
  github: { username: '', events: {}, syncedAt: '' },
  apple: { email: '', connectedAt: '' },
  friends: [],
};

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: 'hoje', label: 'Hoje', icon: 'H' },
  { id: 'tarefas', label: 'Tarefas', icon: 'T' },
  { id: 'presenca', label: 'Presenca', icon: 'P' },
  { id: 'ia', label: 'IA', icon: 'AI' },
  { id: 'perfil', label: 'Perfil', icon: 'U' },
];

const weekLabels = [
  { value: 0, label: 'D', title: 'Domingo' },
  { value: 1, label: 'S', title: 'Segunda' },
  { value: 2, label: 'T', title: 'Terca' },
  { value: 3, label: 'Q', title: 'Quarta' },
  { value: 4, label: 'Q', title: 'Quinta' },
  { value: 5, label: 'S', title: 'Sexta' },
  { value: 6, label: 'S', title: 'Sabado' },
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

function monthKey(value: string) {
  return value.slice(0, 7);
}

function monthDays(anchorDate: string) {
  const anchor = parseIso(anchorDate);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const total = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return Array.from({ length: total }, (_, index) => isoDate(addDays(first, index)));
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', options).format(parseIso(value));
}

function priorityLabel(priority: Priority) {
  return { baixa: 'Baixa', media: 'Media', alta: 'Alta' }[priority];
}

function level(total: number) {
  if (total <= 0) return 0;
  if (total >= 8) return 4;
  if (total >= 5) return 3;
  if (total >= 2) return 2;
  return 1;
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
    apple: {
      email: typeof raw?.apple?.email === 'string' ? raw.apple.email : '',
      connectedAt: typeof raw?.apple?.connectedAt === 'string' ? raw.apple.connectedAt : '',
    },
    friends: Array.isArray(raw?.friends) ? raw.friends : [],
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
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
  if (!cleanUsername) throw new Error('Informe um usuario do GitHub.');
  const activity: Record<string, number> = {};

  for (let page = 1; page <= 3; page += 1) {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanUsername)}/events/public?per_page=100&page=${page}`);
    if (response.status === 404) throw new Error('Usuario do GitHub nao encontrado.');
    if (!response.ok) throw new Error('Nao consegui buscar eventos publicos do GitHub.');
    const events = await response.json();
    if (!Array.isArray(events) || events.length === 0) break;

    for (const event of events) {
      if (!event?.created_at) continue;
      const date = String(event.created_at).slice(0, 10);
      const type = String(event.type || '');
      const weight = type === 'PushEvent' ? Math.max(1, event.payload?.commits?.length || 1) : type === 'PullRequestEvent' ? 2 : 1;
      activity[date] = (activity[date] || 0) + weight;
    }
  }

  return activity;
}

function fixedIsPlanned(fixedTask: FixedTask, date: string) {
  return fixedTask.active && fixedTask.weekdays.includes(parseIso(date).getDay());
}

function buildMonthPresence(data: AppData, selectedDate: string): PresenceDay[] {
  const today = isoDate();
  return monthDays(selectedDate).map((date) => {
    const oneOffPlanned = data.tasks.filter((task) => task.date === date && !task.fixedTaskId).length;
    const fixedPlanned = data.fixedTasks.filter((fixedTask) => fixedIsPlanned(fixedTask, date)).length;
    const completed = data.tasks.filter((task) => task.date === date && task.done).length;
    const github = data.github.events[date] || 0;
    const total = completed + github;
    return { iso: date, planned: oneOffPlanned + fixedPlanned, completed, github, total, level: level(total), today: date === today };
  });
}

function taskCalendars(data: AppData, selectedDate: string): TaskCalendar[] {
  const today = isoDate();
  const selectedMonth = monthKey(selectedDate);
  const days = monthDays(selectedDate);

  const fixed = data.fixedTasks
    .filter((fixedTask) => fixedTask.active)
    .map((fixedTask) => {
      const calendarDays = days.map((date) => {
        const planned = fixedIsPlanned(fixedTask, date);
        const completed = data.tasks.some((task) => task.fixedTaskId === fixedTask.id && task.date === date && task.done);
        return { iso: date, planned, completed, level: completed ? 4 : planned ? 1 : 0, today: date === today };
      });
      return {
        id: fixedTask.id,
        title: fixedTask.title,
        meta: `Fixa - ${fixedTask.weekdays.length} dia(s) por semana`,
        planned: calendarDays.filter((day) => day.planned).length,
        completed: calendarDays.filter((day) => day.completed).length,
        days: calendarDays,
      };
    });

  const oneOff = data.tasks
    .filter((task) => !task.fixedTaskId && monthKey(task.date) === selectedMonth)
    .sort((a, b) => `${a.date}${a.time}${a.title}`.localeCompare(`${b.date}${b.time}${b.title}`))
    .map((task) => {
      const calendarDays = days.map((date) => {
        const planned = task.date === date;
        const completed = planned && task.done;
        return { iso: date, planned, completed, level: completed ? 4 : planned ? 1 : 0, today: date === today };
      });
      return {
        id: task.id,
        title: task.title,
        meta: `${formatDate(task.date, { day: '2-digit', month: 'short' })}${task.time ? ` - ${task.time}` : ''}`,
        planned: 1,
        completed: task.done ? 1 : 0,
        days: calendarDays,
      };
    });

  return [...fixed, ...oneOff];
}

function namesFor(task: Task, friends: Friend[]) {
  return (task.sharedWith || [])
    .map((friendId) => friends.find((friend) => friend.id === friendId)?.name)
    .filter(Boolean)
    .join(', ');
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
      setError(apiError instanceof Error ? apiError.message : 'Nao consegui entrar.');
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
        <p>Tarefas, presenca mensal, GitHub, Apple e tarefas compartilhadas em um so painel.</p>
        <form className="neo-form" onSubmit={submit}>
          {mode === 'register' && <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Wess" /></label>}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" autoCapitalize="none" /></label>
          <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="minimo 6 caracteres" /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="neo-primary" type="submit" disabled={loading}>{loading ? 'PROCESSANDO...' : mode === 'login' ? 'ENTRAR' : 'CRIAR USUARIO'}</button>
        </form>
        <button className="link-button" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Criar novo usuario' : 'Ja tenho uma conta'}</button>
      </section>
    </main>
  );
}

function MonthGrid({ days, selectedDate, onSelectDate, compact = false }: { days: PresenceDay[]; selectedDate: string; onSelectDate: (date: string) => void; compact?: boolean }) {
  const blanks = parseIso(days[0]?.iso || selectedDate).getDay();
  const cells = [...Array.from({ length: blanks }, (_, index) => ({ blank: true, id: `blank-${index}` })), ...days.map((day) => ({ blank: false, id: day.iso, day }))];
  return (
    <div className={compact ? 'presence-grid monthly compact' : 'presence-grid monthly'}>
      {cells.map((cell) => cell.blank ? <span className="presence-cell blank" key={cell.id} /> : (
        <button
          key={cell.id}
          type="button"
          className={`presence-cell level-${cell.day.level} ${cell.day.iso === selectedDate ? 'selected' : ''} ${cell.day.today ? 'today' : ''}`}
          onClick={() => onSelectDate(cell.day.iso)}
          title={`${formatDate(cell.day.iso, { day: '2-digit', month: 'long' })}: ${cell.day.completed}/${cell.day.planned} tarefas, ${cell.day.github} GitHub`}
        />
      ))}
    </div>
  );
}

function MiniTaskGrid({ calendar, selectedDate }: { calendar: TaskCalendar; selectedDate: string }) {
  const blanks = parseIso(calendar.days[0]?.iso || selectedDate).getDay();
  const cells = [...Array.from({ length: blanks }, (_, index) => ({ blank: true, id: `blank-${index}` })), ...calendar.days.map((day) => ({ blank: false, id: day.iso, day }))];
  return (
    <div className="task-month-grid">
      {cells.map((cell) => cell.blank ? <span className="presence-cell blank" key={cell.id} /> : (
        <span key={cell.id} className={`presence-cell level-${cell.day.level} ${cell.day.today ? 'today' : ''}`} title={`${formatDate(cell.day.iso, { day: '2-digit', month: 'short' })}: ${cell.day.completed ? 'concluida' : cell.day.planned ? 'planejada' : 'sem tarefa'}`} />
      ))}
    </div>
  );
}

function TaskRow({ task, friends, onToggle, onRemove, fixed = false }: { task: Task; friends: Friend[]; onToggle: (id: string) => void; onRemove: (id: string) => void; fixed?: boolean }) {
  const sharedNames = namesFor(task, friends);
  return (
    <article className={task.done ? 'task-row done' : 'task-row'}>
      <button className="task-check" type="button" onClick={() => onToggle(task.id)} aria-label="Alternar tarefa">{task.done ? 'OK' : ''}</button>
      <button className="task-main" type="button" onClick={() => onToggle(task.id)}>
        <strong>{task.title}{fixed ? <small> fixa</small> : null}</strong>
        <span>{task.time || 'sem horario'} - {priorityLabel(task.priority)}{task.project ? ` - ${task.project}` : ''}{sharedNames ? ` - com ${sharedNames}` : ''}</span>
      </button>
      <span className={`task-presence-marker presence-cell level-${task.done ? 1 : 0}`} aria-hidden="true" />
      <button className="task-delete" type="button" onClick={() => onRemove(task.id)} aria-label="Excluir tarefa">X</button>
    </article>
  );
}

function EmptyTerminal({ title, text }: { title: string; text: string }) {
  return <div className="empty-terminal"><span>~</span><strong>{title}</strong><p>{text}</p></div>;
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
  const [draftSharedWith, setDraftSharedWith] = useState<string[]>([]);
  const [profileDraft, setProfileDraft] = useState({ name: '', username: '', bio: '', avatar: '', githubUsername: '', appleEmail: '' });
  const [friendDraft, setFriendDraft] = useState({ name: '', email: '', avatar: '' });
  const [githubSyncing, setGithubSyncing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const presenceDays = useMemo(() => buildMonthPresence(data, selectedDate), [data, selectedDate]);
  const calendars = useMemo(() => taskCalendars(data, selectedDate), [data, selectedDate]);
  const selectedOneOffTasks = useMemo(() => data.tasks.filter((task) => task.date === selectedDate && !task.fixedTaskId), [data.tasks, selectedDate]);
  const selectedFixedItems = useMemo(() => data.fixedTasks.filter((fixedTask) => fixedIsPlanned(fixedTask, selectedDate)).map((fixedTask) => {
    const existing = data.tasks.find((task) => task.date === selectedDate && task.fixedTaskId === fixedTask.id);
    const task: Task = existing || { id: fixedTask.id, fixedTaskId: fixedTask.id, title: fixedTask.title, date: selectedDate, time: fixedTask.time, priority: fixedTask.priority, project: fixedTask.project, done: false, createdAt: fixedTask.createdAt, sharedWith: [] };
    return { fixedTask, task };
  }), [data.fixedTasks, data.tasks, selectedDate]);

  const selectedPresence = presenceDays.find((day) => day.iso === selectedDate) || { iso: selectedDate, planned: 0, completed: 0, github: 0, total: 0, level: 0, today: false };
  const selectedTasks = [...selectedFixedItems.map((item) => item.task), ...selectedOneOffTasks];
  const selectedCompleted = selectedTasks.filter((task) => task.done).length;
  const monthCompleted = presenceDays.reduce((sum, day) => sum + day.completed, 0);
  const monthPlanned = presenceDays.reduce((sum, day) => sum + day.planned, 0);
  const monthGithub = presenceDays.reduce((sum, day) => sum + day.github, 0);
  const activeDays = presenceDays.filter((day) => day.total > 0).length;
  const totalCompleted = data.tasks.filter((task) => task.done).length;
  const selectedMonthLabel = formatDate(`${monthKey(selectedDate)}-01`, { month: 'long', year: 'numeric' });
  const bestDay = presenceDays.reduce((best, day) => day.total > best.total ? day : best, selectedPresence);

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    let cancelled = false;
    async function boot() {
      setBooting(true);
      try {
        const me = await apiRequest<{ user: User }>('/api/me', {}, token);
        const statePayload = await apiRequest<{ state: AppData }>('/api/state', {}, token);
        const normalized = normalizeData(statePayload.state);
        if (cancelled) return;
        setUser(me.user);
        setData(normalized);
        setProfileDraft({ name: me.user.name || '', username: me.user.username || '', bio: me.user.bio || '', avatar: me.user.avatar || '', githubUsername: normalized.github.username || '', appleEmail: normalized.apple.email || '' });
        setHydrated(true);
      } catch (apiError) {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setUser(null);
        setHydrated(false);
        setError(apiError instanceof Error ? apiError.message : 'Sessao invalida.');
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    boot();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token || !hydrated || !user) return undefined;
    const timer = window.setTimeout(() => {
      apiRequest('/api/state', { method: 'PUT', body: JSON.stringify({ state: data }) }, token).catch((apiError) => setError(apiError instanceof Error ? apiError.message : 'Nao salvei no backend.'));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [data, hydrated, token, user]);

  function handleAuth(nextToken: string, nextUser: User, state?: AppData) {
    const normalized = normalizeData(state || emptyData);
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setData(normalized);
    setProfileDraft({ name: nextUser.name || '', username: nextUser.username || '', bio: nextUser.bio || '', avatar: nextUser.avatar || '', githubUsername: normalized.github.username || '', appleEmail: normalized.apple.email || '' });
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
    setDraftWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b));
  }

  function toggleFriend(friendId: string) {
    setDraftSharedWith((current) => current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId]);
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftTitle.trim()) return;
    const now = new Date().toISOString();
    if (draftFixed) {
      const fixedTask: FixedTask = { id: makeId('fixed'), title: draftTitle.trim(), time: draftTime, priority: draftPriority, project: draftProject.trim(), weekdays: draftWeekdays.length ? draftWeekdays : [0, 1, 2, 3, 4, 5, 6], active: true, createdAt: now };
      setData((current) => ({ ...current, fixedTasks: [fixedTask, ...current.fixedTasks] }));
    } else {
      const task: Task = { id: makeId('task'), title: draftTitle.trim(), date: selectedDate, time: draftTime, priority: draftPriority, project: draftProject.trim(), done: false, createdAt: now, sharedWith: draftSharedWith };
      setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    }
    setDraftTitle('');
    setDraftTime('');
    setDraftProject('');
    setDraftSharedWith([]);
  }

  function toggleTask(id: string) {
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done, completedAt: !task.done ? new Date().toISOString() : undefined } : task) }));
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
    const task: Task = { id: makeId('task'), fixedTaskId, title: fixedTask.title, date: selectedDate, time: fixedTask.time, priority: fixedTask.priority, project: fixedTask.project, done: true, createdAt: now, completedAt: now, sharedWith: [] };
    setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
  }

  function removeFixedTask(fixedTaskId: string) {
    setData((current) => ({ ...current, fixedTasks: current.fixedTasks.filter((item) => item.id !== fixedTaskId), tasks: current.tasks.filter((task) => task.fixedTaskId !== fixedTaskId) }));
  }

  function addFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!friendDraft.name.trim()) return;
    const friend: Friend = { id: makeId('friend'), name: friendDraft.name.trim(), email: friendDraft.email.trim(), avatar: friendDraft.avatar.trim().slice(0, 2) || friendDraft.name.trim().slice(0, 1).toUpperCase(), createdAt: new Date().toISOString() };
    setData((current) => ({ ...current, friends: [friend, ...current.friends] }));
    setFriendDraft({ name: '', email: '', avatar: '' });
  }

  function removeFriend(friendId: string) {
    setData((current) => ({ ...current, friends: current.friends.filter((friend) => friend.id !== friendId), tasks: current.tasks.map((task) => ({ ...task, sharedWith: (task.sharedWith || []).filter((id) => id !== friendId) })) }));
    setDraftSharedWith((current) => current.filter((id) => id !== friendId));
  }

  function connectApple() {
    const email = profileDraft.appleEmail.trim();
    if (!email) {
      setError('Informe o email da sua conta Apple.');
      return;
    }
    setData((current) => ({ ...current, apple: { email, connectedAt: new Date().toISOString() } }));
    setError('Conta Apple salva. Sync real com iCloud precisa de configuracao no backend.');
  }

  async function syncGithub() {
    const username = profileDraft.githubUsername.trim() || data.github.username.trim();
    setGithubSyncing(true);
    setError('');
    try {
      const events = await fetchGithubPublicEvents(username);
      setData((current) => ({ ...current, github: { username, events, syncedAt: new Date().toISOString() } }));
      setProfileDraft((current) => ({ ...current, githubUsername: username }));
      setError('GitHub sincronizado.');
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Nao consegui sincronizar o GitHub.');
    } finally {
      setGithubSyncing(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const payload = await apiRequest<{ user: User }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: profileDraft.name, username: profileDraft.username, bio: profileDraft.bio, avatar: profileDraft.avatar, githubUsername: profileDraft.githubUsername }),
      }, token);
      setUser(payload.user);
      setData((current) => ({ ...current, github: { ...current.github, username: profileDraft.githubUsername.trim() } }));
      setError('Perfil salvo no backend.');
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Nao consegui salvar o perfil.');
    }
  }

  async function askAi() {
    setAiLoading(true);
    setAiAnswer('');
    try {
      const payload = await apiRequest<{ answer: string }>('/api/ai', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt || 'Analise minhas tarefas compartilhadas, GitHub, Apple e presenca mensal.', date: selectedDate, tasks: selectedTasks, friends: data.friends, presence: { monthCompleted, monthPlanned, monthGithub, activeDays } }),
      }, token);
      setAiAnswer(payload.answer || 'A IA nao devolveu texto.');
    } catch (apiError) {
      setAiAnswer(apiError instanceof Error ? apiError.message : 'Nao consegui falar com a IA.');
    } finally {
      setAiLoading(false);
    }
  }

  if (booting) return <main className="neo-auth"><section className="terminal-frame auth-frame"><span className="kicker">LOADING</span><h1>Sincronizando...</h1></section></main>;
  if (!token || !user) return <AuthScreen onAuth={handleAuth} />;

  return (
    <div className="neo-app">
      <aside className="neo-sidebar terminal-frame">
        <div className="top-leds" aria-hidden="true"><span /><span /><span /></div>
        <div className="brand-lockup"><div className="brand-mark">{user.avatar || 'R'}</div><div><strong>Ritmo</strong><small>@{user.username}</small></div></div>
        <p className="side-copy">MONTHLY TASK PRESENCE / FRIENDS / APPLE / GITHUB</p>
        <nav className="side-nav">{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} type="button" onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
        <button className="outline-button" type="button" onClick={logout}>SAIR</button>
      </aside>

      <main className="neo-workspace">
        <header className="neo-header">
          <div><span className="kicker">RT-78 / {formatDate(selectedDate, { weekday: 'long' })}</span><h1>{view === 'hoje' ? 'Painel' : view === 'presenca' ? 'Presenca' : view === 'tarefas' ? 'Tarefas' : view === 'perfil' ? 'Perfil' : 'OpenAI'}</h1></div>
          <div className="date-terminal"><button type="button" onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), -1)))}>&lt;</button><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button type="button" onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), 1)))}>&gt;</button></div>
        </header>

        {error && <div className={error.includes('salvo') || error.includes('sincronizado') || error.includes('Apple') ? 'alert success' : 'alert error'}>{error}</div>}

        {view === 'hoje' && (
          <section className="screen-grid">
            <section className="terminal-frame panel-large loggd-card">
              <div className="panel-head"><div><span className="kicker">TODAS AS TAREFAS / {selectedMonthLabel}</span><h2>Presenca mensal</h2><p>Resumo geral da Home somando tarefas fixas, tarefas avulsas, tarefas compartilhadas e GitHub.</p></div><button className="outline-button" type="button" onClick={() => setView('presenca')}>ABRIR</button></div>
              <MonthGrid days={presenceDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} compact />
              <div className="selected-report inline-report"><span className="kicker">SELECTED DATE</span><h3>{formatDate(selectedDate, { day: '2-digit', month: 'long', year: 'numeric' })}</h3><p>{selectedPresence.completed}/{selectedPresence.planned} tarefa(s) e {selectedPresence.github} GitHub.</p></div>
            </section>
            <div className="metric-strip"><div className="metric-card"><span>MES DONE</span><strong>{monthCompleted}</strong></div><div className="metric-card"><span>MES PLANEJADO</span><strong>{monthPlanned}</strong></div><div className="metric-card"><span>GITHUB MES</span><strong>{monthGithub}</strong></div><div className="metric-card"><span>AMIGOS</span><strong>{data.friends.length}</strong></div><div className="metric-card"><span>BEST DAY</span><strong>{bestDay.total}</strong></div></div>
            <section className="terminal-frame panel-large"><div className="panel-head"><div><span className="kicker">TASK LOG</span><h2>{formatDate(selectedDate, { day: '2-digit', month: 'long' })}</h2></div><button className="outline-button" type="button" onClick={() => setView('tarefas')}>NOVA</button></div><div className="task-list">{selectedFixedItems.map((item) => <TaskRow key={item.fixedTask.id} task={item.task} friends={data.friends} fixed onToggle={() => toggleFixedTask(item.fixedTask.id)} onRemove={() => removeFixedTask(item.fixedTask.id)} />)}{selectedOneOffTasks.map((task) => <TaskRow key={task.id} task={task} friends={data.friends} onToggle={toggleTask} onRemove={removeTask} />)}{!selectedTasks.length && <EmptyTerminal title="Nenhuma tarefa nesse dia" text="Crie uma tarefa normal, fixa ou compartilhada." />}</div></section>
          </section>
        )}

        {view === 'tarefas' && (
          <section className="task-layout">
            <form className="terminal-frame neo-form task-form" onSubmit={addTask}>
              <span className="kicker">NOVA TAREFA</span><h2>{draftFixed ? 'Criar tarefa fixa' : 'Registrar tarefa'}</h2>
              <label>Titulo<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Ex.: estudar React" /></label>
              <div className="field-row"><label>Hora<input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} /></label><label>Prioridade<select value={draftPriority} onChange={(event) => setDraftPriority(event.target.value as Priority)}><option value="baixa">Baixa</option><option value="media">Media</option><option value="alta">Alta</option></select></label></div>
              <label>Projeto<input value={draftProject} onChange={(event) => setDraftProject(event.target.value)} placeholder="Opcional" /></label>
              <div className="friend-share-box"><span className="kicker">COMPARTILHAR COM</span>{data.friends.length ? <div className="friend-choice-row">{data.friends.map((friend) => <button key={friend.id} type="button" className={draftSharedWith.includes(friend.id) ? 'active' : ''} onClick={() => toggleFriend(friend.id)}><span>{friend.avatar || friend.name.slice(0, 1)}</span>{friend.name}</button>)}</div> : <p>Adicione amigos no Perfil para criar tarefas compartilhadas.</p>}</div>
              <label className="fixed-toggle"><input type="checkbox" checked={draftFixed} onChange={(event) => setDraftFixed(event.target.checked)} />Tornar tarefa fixa</label>
              {draftFixed && <div className="weekday-row">{weekLabels.map((day) => <button key={`${day.value}-${day.label}`} type="button" className={draftWeekdays.includes(day.value) ? 'active' : ''} onClick={() => toggleWeekday(day.value)} title={day.title}>{day.label}</button>)}</div>}
              <button className="neo-primary" type="submit">{draftFixed ? 'ADICIONAR FIXA' : 'ADICIONAR'}</button>
            </form>
            <section className="terminal-frame panel-large"><div className="panel-head"><div><span className="kicker">DAY QUEUE</span><h2>{selectedCompleted}/{selectedTasks.length} completas</h2></div></div><div className="task-list">{selectedFixedItems.map((item) => <TaskRow key={item.fixedTask.id} task={item.task} friends={data.friends} fixed onToggle={() => toggleFixedTask(item.fixedTask.id)} onRemove={() => removeFixedTask(item.fixedTask.id)} />)}{selectedOneOffTasks.map((task) => <TaskRow key={task.id} task={task} friends={data.friends} onToggle={toggleTask} onRemove={removeTask} />)}{!selectedTasks.length && <EmptyTerminal title="Fila vazia" text="Adicione blocos de foco, tarefas fixas ou tarefas com amigos." />}</div></section>
          </section>
        )}

        {view === 'presenca' && (
          <section className="presence-view terminal-frame">
            <div className="panel-head"><div><span className="kicker">MENSAL / TAREFAS + GITHUB</span><h2>Presenca mensal</h2><p>O primeiro calendario soma tudo. Abaixo, cada tarefa tem seu proprio calendario mensal.</p></div><div className="presence-legend"><span /><span /><span /><span /><span /></div></div>
            <section className="monthly-overview"><div className="monthly-overview-copy"><span className="kicker">GERAL DO MES</span><strong>{selectedMonthLabel}</strong><p>{monthCompleted}/{monthPlanned} tarefa(s), {monthGithub} GitHub e {activeDays} dia(s) ativos.</p></div><MonthGrid days={presenceDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} /></section>
            <div className="selected-report"><span className="kicker">SELECTED DATE</span><h3>{formatDate(selectedDate, { day: '2-digit', month: 'long', year: 'numeric' })}</h3><p>{selectedPresence.completed} tarefa(s) concluida(s), {selectedPresence.planned} planejada(s), {selectedPresence.github} GitHub.</p></div>
            <section className="task-presence-section"><div className="panel-head slim"><div><span className="kicker">POR TAREFA</span><h2>Calendarios individuais</h2><p>Cada tarefa fixa ou avulsa do mes ganha seu proprio mapa.</p></div></div><div className="task-presence-board">{calendars.map((calendar) => <article className="task-presence-card" key={calendar.id}><div><span className="kicker">{calendar.meta}</span><strong>{calendar.title}</strong><p>{calendar.completed}/{calendar.planned} concluidas</p></div><MiniTaskGrid calendar={calendar} selectedDate={selectedDate} /></article>)}{!calendars.length && <EmptyTerminal title="Sem tarefas no mes" text="Crie tarefas para gerar calendarios individuais." />}</div></section>
            <div className="github-sync-card"><div><span className="kicker">GITHUB COMO EXTRA</span><strong>{data.github.username ? `@${data.github.username}` : 'Nenhum GitHub conectado'}</strong><p>{data.github.syncedAt ? `Sincronizado em ${new Date(data.github.syncedAt).toLocaleString('pt-BR')}` : 'GitHub entra como atividade extra, nao como centro da tela.'}</p></div><div className="github-sync-actions"><input value={profileDraft.githubUsername} onChange={(event) => setProfileDraft((current) => ({ ...current, githubUsername: event.target.value }))} placeholder="WessYu" /><button className="neo-primary" type="button" onClick={syncGithub} disabled={githubSyncing}>{githubSyncing ? 'SYNC...' : 'SINCRONIZAR'}</button></div></div>
          </section>
        )}

        {view === 'perfil' && (
          <section className="profile-layout">
            <div className="terminal-frame profile-card"><div className="profile-avatar">{user.avatar || 'R'}</div><span className="kicker">ACTIVE USER</span><h2>{user.name}</h2><p>@{user.username}</p><p>{user.email}</p><p>{data.apple.email ? `Apple: ${data.apple.email}` : 'Apple ainda nao conectado'}</p><div className="metric-strip mini"><div className="metric-card"><span>TASKS</span><strong>{data.tasks.length}</strong></div><div className="metric-card"><span>FIXAS</span><strong>{data.fixedTasks.length}</strong></div><div className="metric-card"><span>DONE</span><strong>{totalCompleted}</strong></div><div className="metric-card"><span>AMIGOS</span><strong>{data.friends.length}</strong></div></div></div>
            <form className="terminal-frame neo-form profile-form" onSubmit={saveProfile}><span className="kicker">USER PROFILE</span><h2>Editar perfil</h2><label>Nome<input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Usuario<input value={profileDraft.username} onChange={(event) => setProfileDraft((current) => ({ ...current, username: event.target.value }))} /></label><label>GitHub username<input value={profileDraft.githubUsername} onChange={(event) => setProfileDraft((current) => ({ ...current, githubUsername: event.target.value }))} placeholder="WessYu" /></label><label>Avatar<input value={profileDraft.avatar} onChange={(event) => setProfileDraft((current) => ({ ...current, avatar: event.target.value }))} maxLength={2} /></label><label>Bio<textarea value={profileDraft.bio} onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))} placeholder="Foco, estudo, dev, design..." /></label><button className="neo-primary" type="submit">SALVAR PERFIL</button><button className="outline-button" type="button" onClick={syncGithub} disabled={githubSyncing}>{githubSyncing ? 'SINCRONIZANDO...' : 'VINCULAR / SINCRONIZAR GITHUB'}</button></form>
            <section className="terminal-frame neo-form profile-form"><span className="kicker">APPLE ACCOUNT</span><h2>Sincronizar Apple</h2><p>Salva sua conta Apple aqui. Sync real com iCloud/Calendario precisa de Sign in with Apple e configuracao no backend.</p><label>Email Apple<input value={profileDraft.appleEmail} onChange={(event) => setProfileDraft((current) => ({ ...current, appleEmail: event.target.value }))} placeholder="seuemail@icloud.com" /></label><button className="neo-primary" type="button" onClick={connectApple}>CONECTAR APPLE</button><div className="sync-status-card"><span>{data.apple.email ? 'Conectado' : 'Nao conectado'}</span><strong>{data.apple.email || 'Sem conta Apple'}</strong>{data.apple.connectedAt && <p>Salvo em {new Date(data.apple.connectedAt).toLocaleString('pt-BR')}</p>}</div></section>
            <section className="terminal-frame profile-form friends-panel"><span className="kicker">SOCIAL TASKS</span><h2>Amigos</h2><p>Adicione sua namorada ou amigos para criar tarefas compartilhadas.</p><form className="neo-form friend-form" onSubmit={addFriend}><label>Nome<input value={friendDraft.name} onChange={(event) => setFriendDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nome da pessoa" /></label><label>Email<input value={friendDraft.email} onChange={(event) => setFriendDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Opcional" /></label><label>Avatar<input value={friendDraft.avatar} onChange={(event) => setFriendDraft((current) => ({ ...current, avatar: event.target.value }))} maxLength={2} placeholder="A" /></label><button className="neo-primary" type="submit">ADICIONAR AMIGO</button></form><div className="friend-list">{data.friends.map((friend) => <article className="friend-card" key={friend.id}><span>{friend.avatar || friend.name.slice(0, 1)}</span><div><strong>{friend.name}</strong><small>{friend.email || 'sem email'}</small></div><button type="button" onClick={() => removeFriend(friend.id)}>X</button></article>)}{!data.friends.length && <EmptyTerminal title="Sem amigos ainda" text="Adicione uma pessoa para criar tarefas compartilhadas." />}</div></section>
          </section>
        )}

        {view === 'ia' && <section className="terminal-frame ai-screen"><span className="kicker">OPENAI PLANNER</span><h2>Planejamento inteligente</h2><p>A IA considera tarefas, amigos, Apple, GitHub e presenca mensal.</p><textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Pergunte: o que devo priorizar hoje?" /><button className="neo-primary" type="button" onClick={askAi} disabled={aiLoading}>{aiLoading ? 'GERANDO...' : 'GERAR PLANO'}</button><div className="ai-answer">{aiAnswer || 'A resposta aparece aqui.'}</div></section>}
      </main>

      <nav className="bottom-terminal">{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} type="button" onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
    </div>
  );
}

export default App;
