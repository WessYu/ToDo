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
};

type AppData = {
  tasks: Task[];
  journal: Record<string, { intention?: string; notes?: string }>;
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
  completed: number;
  total: number;
  level: number;
  today: boolean;
};

const TOKEN_KEY = 'ritmo-presence-token-v1';
const emptyData: AppData = { tasks: [], journal: {} };

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: 'hoje', label: 'Hoje', icon: '⌂' },
  { id: 'tarefas', label: 'Tarefas', icon: '☷' },
  { id: 'presenca', label: 'Presença', icon: '▦' },
  { id: 'ia', label: 'IA', icon: '✦' },
  { id: 'perfil', label: 'Perfil', icon: '◉' },
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

function normalizeData(raw?: Partial<AppData> | null): AppData {
  return {
    tasks: Array.isArray(raw?.tasks) ? raw.tasks : [],
    journal: raw?.journal && typeof raw.journal === 'object' ? raw.journal : {},
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

function priorityLabel(priority: Priority) {
  return { baixa: 'Baixa', media: 'Média', alta: 'Alta' }[priority];
}

function presenceLevel(completed: number) {
  if (completed <= 0) return 0;
  if (completed >= 6) return 4;
  if (completed >= 4) return 3;
  if (completed >= 2) return 2;
  return 1;
}

function buildPresenceDays(tasks: Task[]) {
  const today = isoDate();
  const todayDate = parseIso(today);

  const totals = tasks.reduce<Record<string, { completed: number; total: number }>>((acc, task) => {
    acc[task.date] = acc[task.date] || { completed: 0, total: 0 };
    acc[task.date].total += 1;
    if (task.done) acc[task.date].completed += 1;
    return acc;
  }, {});

  return Array.from({ length: 365 }, (_, index): PresenceDay => {
    const iso = isoDate(addDays(todayDate, index - 364));
    const entry = totals[iso] || { completed: 0, total: 0 };

    return {
      iso,
      completed: entry.completed,
      total: entry.total,
      level: presenceLevel(entry.completed),
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
      setError(apiError instanceof Error ? apiError.message : 'Não consegui entrar.');
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
        <p>Conta real pelo backend do Vercel, tarefas salvas por usuário e presença estilo GitHub.</p>

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
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mínimo 6 caracteres" />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="neo-primary" type="submit" disabled={loading}>
            {loading ? 'PROCESSANDO...' : mode === 'login' ? 'ENTRAR' : 'CRIAR USUÁRIO'}
          </button>
        </form>

        <button className="link-button" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Criar novo usuário' : 'Já tenho uma conta'}
        </button>
      </section>
    </main>
  );
}

function PresenceGrid({ days, selectedDate, onSelectDate }: { days: PresenceDay[]; selectedDate: string; onSelectDate: (date: string) => void }) {
  const blanks = parseIso(days[0]?.iso || isoDate()).getDay();
  const cells = [
    ...Array.from({ length: blanks }, (_, index) => ({ type: 'blank' as const, id: `blank-${index}` })),
    ...days.map((day) => ({ type: 'day' as const, id: day.iso, day })),
  ];

  return (
    <div className="presence-grid" role="grid" aria-label="Presença anual por tarefas concluídas">
      {cells.map((cell) => {
        if (cell.type === 'blank') return <span className="presence-cell blank" key={cell.id} />;

        return (
          <button
            key={cell.day.iso}
            type="button"
            className={`presence-cell level-${cell.day.level} ${cell.day.iso === selectedDate ? 'selected' : ''} ${cell.day.today ? 'today' : ''}`}
            title={`${formatDate(cell.day.iso, { day: '2-digit', month: 'long', year: 'numeric' })}: ${cell.day.completed} concluída(s) de ${cell.day.total}`}
            aria-label={`${cell.day.completed} tarefas concluídas em ${cell.day.iso}`}
            onClick={() => onSelectDate(cell.day.iso)}
          />
        );
      })}
    </div>
  );
}

function TaskRow({ task, onToggle, onRemove }: { task: Task; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <article className={task.done ? 'task-row done' : 'task-row'}>
      <button className="task-check" type="button" onClick={() => onToggle(task.id)} aria-label="Alternar conclusão">{task.done ? '✓' : ''}</button>

      <button className="task-main" type="button" onClick={() => onToggle(task.id)}>
        <strong>{task.title}</strong>
        <span>{task.time || 'sem horário'} · {priorityLabel(task.priority)}{task.project ? ` · ${task.project}` : ''}</span>
      </button>

      <button className="task-delete" type="button" onClick={() => onRemove(task.id)} aria-label="Excluir tarefa">×</button>
    </article>
  );
}

function EmptyTerminal({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-terminal">
      <span>⌁</span>
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

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const [profileDraft, setProfileDraft] = useState({ name: '', username: '', bio: '', avatar: '' });

  const presenceDays = useMemo(() => buildPresenceDays(data.tasks), [data.tasks]);
  const selectedTasks = useMemo(() => data.tasks.filter((task) => task.date === selectedDate).sort((a, b) => `${a.done}${a.time}`.localeCompare(`${b.done}${b.time}`)), [data.tasks, selectedDate]);
  const todayTasks = useMemo(() => data.tasks.filter((task) => task.date === isoDate()), [data.tasks]);

  const completedToday = todayTasks.filter((task) => task.done).length;
  const selectedCompleted = selectedTasks.filter((task) => task.done).length;
  const totalCompleted = data.tasks.filter((task) => task.done).length;
  const bestDay = presenceDays.reduce((best, day) => (day.completed > best.completed ? day : best), presenceDays[0] || { completed: 0, total: 0, iso: isoDate(), level: 0, today: true });

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

        if (cancelled) return;

        setUser(me.user);
        setProfileDraft({ name: me.user.name || '', username: me.user.username || '', bio: me.user.bio || '', avatar: me.user.avatar || '' });
        setData(normalizeData(statePayload.state));
        setHydrated(true);
      } catch (apiError) {
        if (cancelled) return;

        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setUser(null);
        setHydrated(false);
        setError(apiError instanceof Error ? apiError.message : 'Sessão inválida.');
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
        setError(apiError instanceof Error ? apiError.message : 'Não salvei no backend.');
      });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [data, hydrated, token, user]);

  function handleAuth(nextToken: string, nextUser: User, state?: AppData) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setProfileDraft({ name: nextUser.name || '', username: nextUser.username || '', bio: nextUser.bio || '', avatar: nextUser.avatar || '' });
    setData(normalizeData(state || emptyData));
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

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftTitle.trim()) return;

    const now = new Date().toISOString();

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

  async function askAi() {
    setAiLoading(true);
    setAiAnswer('');
    setError('');

    try {
      const payload = await apiRequest<{ answer: string }>('/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          prompt: aiPrompt.trim() || 'Analise minhas tarefas e me diga o próximo passo mais importante.',
          date: selectedDate,
          tasks: selectedTasks,
          presence: { completedToday, totalToday: todayTasks.length, totalCompleted },
        }),
      }, token);

      setAiAnswer(payload.answer || 'A IA não devolveu texto.');
    } catch (apiError) {
      setAiAnswer(apiError instanceof Error ? apiError.message : 'Não consegui falar com a IA.');
    } finally {
      setAiLoading(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const payload = await apiRequest<{ user: User }>('/api/profile', { method: 'PUT', body: JSON.stringify(profileDraft) }, token);
      setUser(payload.user);
      setProfileDraft({ name: payload.user.name || '', username: payload.user.username || '', bio: payload.user.bio || '', avatar: payload.user.avatar || '' });
      setError('Perfil salvo no backend.');
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Não consegui salvar o perfil.');
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

        <p className="side-copy">TASK PRESENCE SYSTEM / BUILT FOR FOCUS / DESIGNED FOR TRUST</p>

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
            <h1>{view === 'presenca' ? 'Presença' : view === 'tarefas' ? 'Tarefas' : view === 'perfil' ? 'Perfil' : view === 'ia' ? 'OpenAI' : 'Painel'}</h1>
          </div>

          <div className="date-terminal">
            <button type="button" onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), -1)))}>‹</button>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            <button type="button" onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), 1)))}>›</button>
          </div>
        </header>

        {error && <div className={error.includes('salvo') ? 'alert success' : 'alert error'}>{error}</div>}

        {view === 'hoje' && (
          <section className="screen-grid">
            <div className="hero-terminal terminal-frame">
              <span className="kicker">POSITION INFORMATION</span>
              <h2>{completedToday}/{todayTasks.length} tarefas concluídas hoje</h2>
              <p>O mapa de presença acende conforme você conclui tarefas. Cada quadrado representa um dia.</p>
              <div className="progress-line"><span style={{ width: `${todayTasks.length ? Math.round((completedToday / todayTasks.length) * 100) : 0}%` }} /></div>
            </div>

            <div className="metric-strip">
              <div className="metric-card"><span>TOTAL DONE</span><strong>{totalCompleted}</strong></div>
              <div className="metric-card"><span>BEST DAY</span><strong>{bestDay.completed}</strong></div>
              <div className="metric-card"><span>SELECTED</span><strong>{selectedCompleted}/{selectedTasks.length}</strong></div>
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
                {selectedTasks.length ? selectedTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onRemove={removeTask} />) : <EmptyTerminal title="Nenhuma tarefa nesse dia" text="Crie uma tarefa e conclua para acender a presença." />}
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
                Título
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
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </label>
              </div>

              <label>
                Projeto
                <input value={draftProject} onChange={(event) => setDraftProject(event.target.value)} placeholder="Opcional" />
              </label>

              <button className="neo-primary" type="submit">ADICIONAR</button>
            </form>

            <section className="terminal-frame panel-large">
              <div className="panel-head">
                <div>
                  <span className="kicker">DAY QUEUE</span>
                  <h2>{selectedCompleted}/{selectedTasks.length} completas</h2>
                </div>
              </div>

              <div className="task-list">
                {selectedTasks.length ? selectedTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onRemove={removeTask} />) : <EmptyTerminal title="Fila vazia" text="Adicione blocos de foco, tarefas ou compromissos." />}
              </div>
            </section>
          </section>
        )}

        {view === 'presenca' && (
          <section className="presence-view terminal-frame">
            <div className="panel-head">
              <div>
                <span className="kicker">365 DAYS / TASK COMPLETION</span>
                <h2>Sistema de presença</h2>
              </div>
              <div className="presence-legend"><span /><span /><span /><span /><span /></div>
            </div>

            <PresenceGrid days={presenceDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

            <div className="selected-report">
              <span className="kicker">SELECTED DATE</span>
              <h3>{formatDate(selectedDate, { day: '2-digit', month: 'long', year: 'numeric' })}</h3>
              <p>{selectedCompleted} tarefa(s) concluída(s) de {selectedTasks.length} registrada(s).</p>
            </div>

            <div className="task-list compact-list">
              {selectedTasks.length ? selectedTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onRemove={removeTask} />) : <EmptyTerminal title="Sem atividade" text="Clique em outro quadrado ou crie uma tarefa para essa data." />}
            </div>
          </section>
        )}

        {view === 'ia' && (
          <section className="terminal-frame ai-screen">
            <span className="kicker">OPENAI PLANNER</span>
            <h2>Planejamento inteligente</h2>
            <p>A IA usa as tarefas do dia selecionado e seu histórico de presença para sugerir o próximo passo.</p>

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

              <div className="metric-strip mini">
                <div className="metric-card"><span>TASKS</span><strong>{data.tasks.length}</strong></div>
                <div className="metric-card"><span>DONE</span><strong>{totalCompleted}</strong></div>
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
                Usuário
                <input value={profileDraft.username} onChange={(event) => setProfileDraft((current) => ({ ...current, username: event.target.value }))} />
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
