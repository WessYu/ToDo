import { useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'ritmo-presence-token-v1';

const emptyData = {
  tasks: [],
  fixedTasks: [],
  journal: {},
  github: { username: '', events: {}, syncedAt: '' },
  friends: [],
};

const navItems = [
  { id: 'hoje', label: 'Hoje', icon: 'home' },
  { id: 'tarefas', label: 'Tarefas', icon: 'tasks' },
  { id: 'presenca', label: 'Presenca', icon: 'presence' },
  { id: 'ia', label: 'IA', icon: 'ai' },
  { id: 'perfil', label: 'Perfil', icon: 'user' },
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

function Icon({ name }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };
  if (name === 'home') return <svg className="nav-icon" {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-6h5v6" /></svg>;
  if (name === 'tasks') return <svg className="nav-icon" {...common}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="m3 6 1 1 2-2" /><path d="m3 12 1 1 2-2" /><path d="m3 18 1 1 2-2" /></svg>;
  if (name === 'presence') return <svg className="nav-icon" {...common}><rect x="4" y="4" width="4" height="4" rx="1" /><rect x="10" y="4" width="4" height="4" rx="1" /><rect x="16" y="4" width="4" height="4" rx="1" /><rect x="4" y="10" width="4" height="4" rx="1" /><rect x="10" y="10" width="4" height="4" rx="1" /><rect x="16" y="10" width="4" height="4" rx="1" /><rect x="4" y="16" width="4" height="4" rx="1" /><rect x="10" y="16" width="4" height="4" rx="1" /><rect x="16" y="16" width="4" height="4" rx="1" /></svg>;
  if (name === 'ai') return <svg className="nav-icon" {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M19 15l.9 2.6L22 18.5l-2.1.9L19 22l-.9-2.6-2.1-.9 2.1-.9L19 15Z" /></svg>;
  return <svg className="nav-icon" {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.8-4 4.5-6 8-6s6.2 2 8 6" /></svg>;
}

function makeId(prefix) {
  if ('randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIso(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function monthKey(value) {
  return value.slice(0, 7);
}

function monthDays(anchorDate) {
  const anchor = parseIso(anchorDate);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const total = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return Array.from({ length: total }, (_, index) => isoDate(addDays(first, index)));
}

function formatDate(value, options) {
  return new Intl.DateTimeFormat('pt-BR', options).format(parseIso(value));
}

function priorityLabel(priority) {
  return { baixa: 'Baixa', media: 'Media', alta: 'Alta' }[priority] || 'Media';
}

function presenceLevel(total) {
  if (total <= 0) return 0;
  if (total >= 8) return 4;
  if (total >= 5) return 3;
  if (total >= 2) return 2;
  return 1;
}

function normalizeData(raw) {
  return {
    tasks: Array.isArray(raw?.tasks) ? raw.tasks : [],
    fixedTasks: Array.isArray(raw?.fixedTasks) ? raw.fixedTasks : [],
    journal: raw?.journal && typeof raw.journal === 'object' ? raw.journal : {},
    github: {
      username: typeof raw?.github?.username === 'string' ? raw.github.username : '',
      events: raw?.github?.events && typeof raw.github.events === 'object' ? raw.github.events : {},
      syncedAt: typeof raw?.github?.syncedAt === 'string' ? raw.github.syncedAt : '',
    },
    friends: Array.isArray(raw?.friends) ? raw.friends : [],
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
  };
}

async function apiRequest(path, options = {}, token = '') {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Erro ${response.status}`);
  return payload;
}

function fixedIsPlanned(fixedTask, date) {
  return fixedTask.active && fixedTask.weekdays.includes(parseIso(date).getDay());
}

function buildMonthPresence(data, selectedDate) {
  const today = isoDate();
  return monthDays(selectedDate).map((date) => {
    const oneOffPlanned = data.tasks.filter((task) => task.date === date && !task.fixedTaskId).length;
    const fixedPlanned = data.fixedTasks.filter((fixedTask) => fixedIsPlanned(fixedTask, date)).length;
    const completed = data.tasks.filter((task) => task.date === date && task.done).length;
    const github = data.github.events[date] || 0;
    const total = completed + github;
    return { iso: date, planned: oneOffPlanned + fixedPlanned, completed, github, total, level: presenceLevel(total), today: date === today };
  });
}

function taskCalendars(data, selectedDate) {
  const today = isoDate();
  const selectedMonth = monthKey(selectedDate);
  const days = monthDays(selectedDate);
  const fixed = data.fixedTasks.filter((fixedTask) => fixedTask.active).map((fixedTask) => {
    const calendarDays = days.map((date) => {
      const planned = fixedIsPlanned(fixedTask, date);
      const completed = data.tasks.some((task) => task.fixedTaskId === fixedTask.id && task.date === date && task.done);
      return { iso: date, planned, completed, level: completed ? 4 : planned ? 1 : 0, today: date === today };
    });
    return { id: fixedTask.id, title: fixedTask.title, meta: `Fixa - ${fixedTask.weekdays.length} dia(s) por semana`, planned: calendarDays.filter((day) => day.planned).length, completed: calendarDays.filter((day) => day.completed).length, days: calendarDays };
  });
  const oneOff = data.tasks.filter((task) => !task.fixedTaskId && monthKey(task.date) === selectedMonth).sort((a, b) => `${a.date}${a.time}${a.title}`.localeCompare(`${b.date}${b.time}${b.title}`)).map((task) => {
    const calendarDays = days.map((date) => {
      const planned = task.date === date;
      const completed = planned && task.done;
      return { iso: date, planned, completed, level: completed ? 4 : planned ? 1 : 0, today: date === today };
    });
    return { id: task.id, title: task.title, meta: `${formatDate(task.date, { day: '2-digit', month: 'short' })}${task.time ? ` - ${task.time}` : ''}`, planned: 1, completed: task.done ? 1 : 0, days: calendarDays };
  });
  return [...fixed, ...oneOff];
}

function namesFor(task, friends) {
  return (task.sharedWith || []).map((friendId) => friends.find((friend) => friend.id === friendId)?.name).filter(Boolean).join(', ');
}

function isImageAvatar(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function Avatar({ value, fallback, className }) {
  return <div className={className}>{isImageAvatar(value) ? <img src={value} alt="Foto de perfil" /> : <span>{value || fallback || 'R'}</span>}</div>;
}

function encodeInvite(user) {
  const payload = { id: user.id, name: user.name, email: user.email, username: user.username, avatar: user.avatar || '', createdAt: new Date().toISOString() };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

function decodeInvite(code) {
  const clean = code.trim().match(/ritmo:\/\/([A-Za-z0-9+/=]+)/)?.[1] || code.trim().replace(/^ritmo:\/\//, '');
  return JSON.parse(decodeURIComponent(escape(atob(clean))));
}

function imageFileToAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Nenhuma imagem selecionada.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nao consegui ler a imagem.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Arquivo de imagem invalido.'));
      image.onload = () => {
        const size = 240;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.fillStyle = '#090706';
        context.fillRect(0, 0, size, size);
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function shareText(title, text) {
  if (navigator.share) {
    await navigator.share({ title, text });
    return 'Compartilhamento aberto.';
  }
  await navigator.clipboard.writeText(text);
  return 'Copiado para a area de transferencia.';
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = await apiRequest('/api/auth', { method: 'POST', body: JSON.stringify({ mode, name, email, password }) });
      onAuth(payload.token, payload.user, payload.state);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Nao consegui entrar.');
    } finally {
      setLoading(false);
    }
  }
  return <main className="neo-auth"><section className="terminal-frame auth-frame"><div className="top-leds" aria-hidden="true"><span /><span /><span /></div><span className="kicker">RT-78 / CONTA DO SITE</span><h1>Ritmo Presence</h1><p>Entre com sua propria conta do site para salvar tarefas, amigos, foto de perfil e presenca mensal.</p><form className="neo-form" onSubmit={submit}>{mode === 'register' && <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Wess" /></label>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" autoCapitalize="none" /></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="minimo 6 caracteres" /></label>{error && <div className="alert error">{error}</div>}<button className="neo-primary" type="submit" disabled={loading}>{loading ? 'PROCESSANDO...' : mode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}</button></form><button className="link-button" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Criar conta do site' : 'Ja tenho uma conta'}</button></section></main>;
}

function MonthGrid({ days, selectedDate, onSelectDate, compact = false }) {
  const blanks = parseIso(days[0]?.iso || selectedDate).getDay();
  return <div className={compact ? 'presence-grid monthly compact' : 'presence-grid monthly'}>{Array.from({ length: blanks }, (_, index) => <span className="presence-cell blank" key={`blank-${index}`} />)}{days.map((day) => <button key={day.iso} type="button" className={`presence-cell level-${day.level} ${day.iso === selectedDate ? 'selected' : ''} ${day.today ? 'today' : ''}`} onClick={() => onSelectDate(day.iso)} title={`${formatDate(day.iso, { day: '2-digit', month: 'long' })}: ${day.completed}/${day.planned} tarefas, ${day.github} GitHub`} />)}</div>;
}

function MiniTaskGrid({ calendar, selectedDate }) {
  const blanks = parseIso(calendar.days[0]?.iso || selectedDate).getDay();
  return <div className="task-month-grid">{Array.from({ length: blanks }, (_, index) => <span className="presence-cell blank" key={`blank-${index}`} />)}{calendar.days.map((day) => <span key={day.iso} className={`presence-cell level-${day.level} ${day.today ? 'today' : ''}`} title={`${formatDate(day.iso, { day: '2-digit', month: 'short' })}: ${day.completed ? 'concluida' : day.planned ? 'planejada' : 'sem tarefa'}`} />)}</div>;
}

function TaskRow({ task, friends, onToggle, onRemove, fixed = false }) {
  const sharedNames = namesFor(task, friends);
  return <article className={task.done ? 'task-row done' : 'task-row'}><button className="task-check" type="button" onClick={() => onToggle(task.id)} aria-label="Alternar tarefa">{task.done ? 'OK' : ''}</button><button className="task-main" type="button" onClick={() => onToggle(task.id)}><strong>{task.title}{fixed ? <small> fixa</small> : null}</strong><span>{task.time || 'sem horario'} - {priorityLabel(task.priority)}{task.project ? ` - ${task.project}` : ''}{sharedNames ? ` - com ${sharedNames}` : ''}</span></button><span className={`task-presence-marker presence-cell level-${task.done ? 1 : 0}`} aria-hidden="true" /><button className="task-delete" type="button" onClick={() => onRemove(task.id)} aria-label="Excluir tarefa">X</button></article>;
}

function EmptyTerminal({ title, text }) {
  return <div className="empty-terminal"><span>~</span><strong>{title}</strong><p>{text}</p></div>;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(null);
  const [data, setData] = useState(emptyData);
  const [view, setView] = useState('hoje');
  const [selectedDate, setSelectedDate] = useState(() => isoDate());
  const [booting, setBooting] = useState(Boolean(token));
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [draftProject, setDraftProject] = useState('');
  const [draftPriority, setDraftPriority] = useState('media');
  const [draftFixed, setDraftFixed] = useState(false);
  const [draftWeekdays, setDraftWeekdays] = useState([1, 2, 3, 4, 5]);
  const [draftSharedWith, setDraftSharedWith] = useState([]);
  const [profileDraft, setProfileDraft] = useState({ name: '', username: '', bio: '', avatar: '', githubUsername: '' });
  const [friendDraft, setFriendDraft] = useState({ name: '', email: '', avatar: '' });
  const [inviteCode, setInviteCode] = useState('');
  const [githubSyncing, setGithubSyncing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const presenceDays = useMemo(() => buildMonthPresence(data, selectedDate), [data, selectedDate]);
  const calendars = useMemo(() => taskCalendars(data, selectedDate), [data, selectedDate]);
  const selectedOneOffTasks = useMemo(() => data.tasks.filter((task) => task.date === selectedDate && !task.fixedTaskId), [data.tasks, selectedDate]);
  const selectedFixedItems = useMemo(() => data.fixedTasks.filter((fixedTask) => fixedIsPlanned(fixedTask, selectedDate)).map((fixedTask) => {
    const existing = data.tasks.find((task) => task.date === selectedDate && task.fixedTaskId === fixedTask.id);
    const task = existing || { id: fixedTask.id, fixedTaskId: fixedTask.id, title: fixedTask.title, date: selectedDate, time: fixedTask.time, priority: fixedTask.priority, project: fixedTask.project, done: false, createdAt: fixedTask.createdAt, sharedWith: [] };
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
  const myInviteCode = user ? encodeInvite(user) : '';

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    let cancelled = false;
    async function boot() {
      setBooting(true);
      try {
        const me = await apiRequest('/api/me', {}, token);
        const statePayload = await apiRequest('/api/state', {}, token);
        const normalized = normalizeData(statePayload.state);
        if (cancelled) return;
        setUser(me.user);
        setData(normalized);
        setProfileDraft({ name: me.user.name || '', username: me.user.username || '', bio: me.user.bio || '', avatar: me.user.avatar || '', githubUsername: normalized.github.username || '' });
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

  function handleAuth(nextToken, nextUser, state) {
    const normalized = normalizeData(state || emptyData);
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setData(normalized);
    setProfileDraft({ name: nextUser.name || '', username: nextUser.username || '', bio: nextUser.bio || '', avatar: nextUser.avatar || '', githubUsername: normalized.github.username || '' });
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

  function toggleWeekday(day) {
    setDraftWeekdays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => a - b));
  }

  function toggleFriend(friendId) {
    setDraftSharedWith((current) => current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId]);
  }

  async function addTask(event) {
    event.preventDefault();
    if (!draftTitle.trim()) return;
    const now = new Date().toISOString();
    if (draftFixed) {
      const fixedTask = { id: makeId('fixed'), title: draftTitle.trim(), time: draftTime, priority: draftPriority, project: draftProject.trim(), weekdays: draftWeekdays.length ? draftWeekdays : [0, 1, 2, 3, 4, 5, 6], active: true, createdAt: now };
      setData((current) => ({ ...current, fixedTasks: [fixedTask, ...current.fixedTasks] }));
    } else {
      const task = { id: makeId('task'), title: draftTitle.trim(), date: selectedDate, time: draftTime, priority: draftPriority, project: draftProject.trim(), done: false, createdAt: now, sharedWith: draftSharedWith };
      setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
      if (draftSharedWith.length) {
        const names = draftSharedWith.map((id) => data.friends.find((friend) => friend.id === id)?.name).filter(Boolean).join(', ');
        const text = `Tarefa compartilhada no Ritmo\n\n${task.title}\nData: ${formatDate(task.date, { day: '2-digit', month: 'long', year: 'numeric' })}${task.time ? `\nHora: ${task.time}` : ''}\nCom: ${names}\n\nAbra seu Ritmo e adicione essa tarefa.`;
        shareText('Tarefa compartilhada', text).then((message) => setError(message)).catch(() => setError('Tarefa criada. Nao consegui abrir o compartilhamento.'));
      }
    }
    setDraftTitle('');
    setDraftTime('');
    setDraftProject('');
    setDraftSharedWith([]);
  }

  function toggleTask(id) {
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done, completedAt: !task.done ? new Date().toISOString() : undefined } : task) }));
  }

  function removeTask(id) {
    setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }));
  }

  function toggleFixedTask(fixedTaskId) {
    const fixedTask = data.fixedTasks.find((item) => item.id === fixedTaskId);
    if (!fixedTask) return;
    const existing = data.tasks.find((task) => task.date === selectedDate && task.fixedTaskId === fixedTaskId);
    if (existing) {
      toggleTask(existing.id);
      return;
    }
    const now = new Date().toISOString();
    const task = { id: makeId('task'), fixedTaskId, title: fixedTask.title, date: selectedDate, time: fixedTask.time, priority: fixedTask.priority, project: fixedTask.project, done: true, createdAt: now, completedAt: now, sharedWith: [] };
    setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
  }

  function removeFixedTask(fixedTaskId) {
    setData((current) => ({ ...current, fixedTasks: current.fixedTasks.filter((item) => item.id !== fixedTaskId), tasks: current.tasks.filter((task) => task.fixedTaskId !== fixedTaskId) }));
  }

  function addFriend(event) {
    event.preventDefault();
    const email = friendDraft.email.trim().toLowerCase();
    const name = friendDraft.name.trim() || email.split('@')[0] || '';
    if (!name) {
      setError('Informe pelo menos nome ou email do amigo.');
      return;
    }
    const exists = data.friends.some((friend) => (email && friend.email?.toLowerCase() === email) || String(friend.name || '').trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      setError('Esse amigo ja esta na sua lista.');
      return;
    }
    const friend = { id: makeId('friend'), name, email, avatar: friendDraft.avatar.trim().slice(0, 2).toUpperCase() || name.slice(0, 1).toUpperCase(), createdAt: new Date().toISOString(), status: 'accepted' };
    setData((current) => ({ ...current, friends: [friend, ...current.friends] }));
    setFriendDraft({ name: '', email: '', avatar: '' });
    setError('Amigo adicionado. Agora voce pode marcar tarefas com essa pessoa.');
  }

  function acceptInvite(event) {
    event.preventDefault();
    try {
      const invite = decodeInvite(inviteCode);
      if (!invite.email || invite.email === user.email) throw new Error('Convite invalido.');
      const exists = data.friends.some((friend) => friend.email === invite.email || friend.accountId === invite.id);
      if (exists) throw new Error('Esse amigo ja esta na sua lista.');
      const friend = { id: makeId('friend'), accountId: invite.id, name: invite.name || invite.username || invite.email, email: invite.email, avatar: invite.avatar || String(invite.name || invite.email).slice(0, 1).toUpperCase(), createdAt: new Date().toISOString(), status: 'accepted' };
      setData((current) => ({ ...current, friends: [friend, ...current.friends] }));
      setInviteCode('');
      setError('Convite aceito. Agora voce pode marcar tarefas com esse amigo.');
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Convite invalido.');
    }
  }

  function removeFriend(friendId) {
    setData((current) => ({ ...current, friends: current.friends.filter((friend) => friend.id !== friendId), tasks: current.tasks.map((task) => ({ ...task, sharedWith: (task.sharedWith || []).filter((id) => id !== friendId) })) }));
    setDraftSharedWith((current) => current.filter((id) => id !== friendId));
  }

  async function shareInvite() {
    try {
      const text = `Me adiciona no Ritmo. Cole este convite no Perfil > Amigos:\n\nritmo://${myInviteCode}`;
      const message = await shareText('Convite Ritmo', text);
      setError(message);
    } catch {
      setError('Nao consegui compartilhar o convite.');
    }
  }

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const avatar = await imageFileToAvatar(file);
      setProfileDraft((current) => ({ ...current, avatar }));
      setError('Foto carregada. Clique em Salvar perfil para confirmar.');
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'Nao consegui carregar a foto.');
    } finally {
      event.target.value = '';
    }
  }

  async function syncGithub() {
    const username = profileDraft.githubUsername.trim() || data.github.username.trim();
    setGithubSyncing(true);
    setError('');
    try {
      const payload = await apiRequest('/api/github', { method: 'POST', body: JSON.stringify({ username }) }, token);
      const normalized = normalizeData(payload.state);
      setData(normalized);
      setProfileDraft((current) => ({ ...current, githubUsername: normalized.github.username || username }));
      const total = payload.github?.total || 0;
      const days = payload.github?.days || 0;
      setError(`GitHub sincronizado: ${total} atividade(s) em ${days} dia(s).`);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Nao consegui sincronizar o GitHub.');
    } finally {
      setGithubSyncing(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    try {
      const payload = await apiRequest('/api/profile', { method: 'PUT', body: JSON.stringify({ name: profileDraft.name, username: profileDraft.username, bio: profileDraft.bio, avatar: profileDraft.avatar, githubUsername: profileDraft.githubUsername }) }, token);
      setUser(payload.user);
      setProfileDraft((current) => ({ ...current, avatar: payload.user.avatar || current.avatar, name: payload.user.name || current.name, username: payload.user.username || current.username, bio: payload.user.bio || current.bio }));
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
      const payload = await apiRequest('/api/ai', { method: 'POST', body: JSON.stringify({ prompt: aiPrompt || 'Analise minhas tarefas compartilhadas, conta do site, GitHub e presenca mensal.', date: selectedDate, tasks: selectedTasks, friends: data.friends, presence: { monthCompleted, monthPlanned, monthGithub, activeDays } }) }, token);
      setAiAnswer(payload.answer || 'A IA nao devolveu texto.');
    } catch (apiError) {
      setAiAnswer(apiError instanceof Error ? apiError.message : 'Nao consegui falar com a IA.');
    } finally {
      setAiLoading(false);
    }
  }

  if (booting) return <main className="neo-auth"><section className="terminal-frame auth-frame"><span className="kicker">LOADING</span><h1>Sincronizando...</h1></section></main>;
  if (!token || !user) return <AuthScreen onAuth={handleAuth} />;

  return <div className="neo-app"><aside className="neo-sidebar terminal-frame"><div className="top-leds" aria-hidden="true"><span /><span /><span /></div><div className="brand-lockup"><Avatar className="brand-mark" value={user.avatar} fallback="R" /><div><strong>Ritmo</strong><small>@{user.username}</small></div></div><p className="side-copy">CONTA DO SITE / FRIENDS / TASK PRESENCE / GITHUB</p><nav className="side-nav">{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} type="button" onClick={() => setView(item.id)}><span><Icon name={item.icon} /></span>{item.label}</button>)}</nav><button className="outline-button" type="button" onClick={logout}>SAIR</button></aside><main className="neo-workspace"><header className="neo-header"><div><span className="kicker">RT-78 / {formatDate(selectedDate, { weekday: 'long' })}</span><h1>{view === 'hoje' ? 'Painel' : view === 'presenca' ? 'Presenca' : view === 'tarefas' ? 'Tarefas' : view === 'perfil' ? 'Perfil' : 'OpenAI'}</h1></div><div className="date-terminal"><button type="button" onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), -1)))}>&lt;</button><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><button type="button" onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), 1)))}>&gt;</button></div></header>{error && <div className={error.includes('salvo') || error.includes('sincronizado') || error.includes('carregada') || error.includes('aceito') || error.includes('Copiado') || error.includes('Compartilhamento') ? 'alert success' : 'alert error'}>{error}</div>}{view === 'hoje' && <section className="screen-grid"><section className="terminal-frame panel-large loggd-card"><div className="panel-head"><div><span className="kicker">TODAS AS TAREFAS / {selectedMonthLabel}</span><h2>Presenca mensal</h2><p>Resumo geral da Home somando tarefas fixas, tarefas avulsas, tarefas compartilhadas e GitHub.</p></div><button className="outline-button" type="button" onClick={() => setView('presenca')}>ABRIR</button></div><MonthGrid days={presenceDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} compact /><div className="selected-report inline-report"><span className="kicker">SELECTED DATE</span><h3>{formatDate(selectedDate, { day: '2-digit', month: 'long', year: 'numeric' })}</h3><p>{selectedPresence.completed}/{selectedPresence.planned} tarefa(s) e {selectedPresence.github} GitHub.</p></div></section><div className="metric-strip"><div className="metric-card"><span>MES DONE</span><strong>{monthCompleted}</strong></div><div className="metric-card"><span>MES PLANEJADO</span><strong>{monthPlanned}</strong></div><div className="metric-card"><span>GITHUB MES</span><strong>{monthGithub}</strong></div><div className="metric-card"><span>AMIGOS</span><strong>{data.friends.length}</strong></div><div className="metric-card"><span>BEST DAY</span><strong>{bestDay.total}</strong></div></div><section className="terminal-frame panel-large"><div className="panel-head"><div><span className="kicker">TASK LOG</span><h2>{formatDate(selectedDate, { day: '2-digit', month: 'long' })}</h2></div><button className="outline-button" type="button" onClick={() => setView('tarefas')}>NOVA</button></div><div className="task-list">{selectedFixedItems.map((item) => <TaskRow key={item.fixedTask.id} task={item.task} friends={data.friends} fixed onToggle={() => toggleFixedTask(item.fixedTask.id)} onRemove={() => removeFixedTask(item.fixedTask.id)} />)}{selectedOneOffTasks.map((task) => <TaskRow key={task.id} task={task} friends={data.friends} onToggle={toggleTask} onRemove={removeTask} />)}{!selectedTasks.length && <EmptyTerminal title="Nenhuma tarefa nesse dia" text="Crie uma tarefa normal, fixa ou compartilhada." />}</div></section></section>}{view === 'tarefas' && <section className="task-layout"><form className="terminal-frame neo-form task-form" onSubmit={addTask}><span className="kicker">NOVA TAREFA</span><h2>{draftFixed ? 'Criar tarefa fixa' : 'Registrar tarefa'}</h2><label>Titulo<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Ex.: estudar React" /></label><div className="field-row"><label>Hora<input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} /></label><label>Prioridade<select value={draftPriority} onChange={(event) => setDraftPriority(event.target.value)}><option value="baixa">Baixa</option><option value="media">Media</option><option value="alta">Alta</option></select></label></div><label>Projeto<input value={draftProject} onChange={(event) => setDraftProject(event.target.value)} placeholder="Opcional" /></label><div className="friend-share-box"><span className="kicker">COMPARTILHAR COM</span>{data.friends.length ? <div className="friend-choice-row">{data.friends.map((friend) => <button key={friend.id} type="button" className={draftSharedWith.includes(friend.id) ? 'active' : ''} onClick={() => toggleFriend(friend.id)}><span>{friend.avatar || friend.name.slice(0, 1)}</span>{friend.name}</button>)}</div> : <p>Adicione amigos no Perfil para criar tarefas compartilhadas.</p>}</div><label className="fixed-toggle"><input type="checkbox" checked={draftFixed} onChange={(event) => setDraftFixed(event.target.checked)} />Tornar tarefa fixa</label>{draftFixed && <div className="weekday-row">{weekLabels.map((day) => <button key={`${day.value}-${day.label}`} type="button" className={draftWeekdays.includes(day.value) ? 'active' : ''} onClick={() => toggleWeekday(day.value)} title={day.title}>{day.label}</button>)}</div>}<button className="neo-primary" type="submit">{draftFixed ? 'ADICIONAR FIXA' : 'ADICIONAR'}</button></form><section className="terminal-frame panel-large"><div className="panel-head"><div><span className="kicker">DAY QUEUE</span><h2>{selectedCompleted}/{selectedTasks.length} completas</h2></div></div><div className="task-list">{selectedFixedItems.map((item) => <TaskRow key={item.fixedTask.id} task={item.task} friends={data.friends} fixed onToggle={() => toggleFixedTask(item.fixedTask.id)} onRemove={() => removeFixedTask(item.fixedTask.id)} />)}{selectedOneOffTasks.map((task) => <TaskRow key={task.id} task={task} friends={data.friends} onToggle={toggleTask} onRemove={removeTask} />)}{!selectedTasks.length && <EmptyTerminal title="Fila vazia" text="Adicione blocos de foco, tarefas fixas ou tarefas com amigos." />}</div></section></section>}{view === 'presenca' && <section className="presence-view terminal-frame"><div className="panel-head"><div><span className="kicker">MENSAL / TAREFAS + GITHUB</span><h2>Presenca mensal</h2><p>O primeiro calendario soma tudo. Abaixo, cada tarefa tem seu proprio calendario mensal.</p></div><div className="presence-legend"><span /><span /><span /><span /><span /></div></div><section className="monthly-overview"><div className="monthly-overview-copy"><span className="kicker">GERAL DO MES</span><strong>{selectedMonthLabel}</strong><p>{monthCompleted}/{monthPlanned} tarefa(s), {monthGithub} GitHub e {activeDays} dia(s) ativos.</p></div><MonthGrid days={presenceDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} /></section><div className="selected-report"><span className="kicker">SELECTED DATE</span><h3>{formatDate(selectedDate, { day: '2-digit', month: 'long', year: 'numeric' })}</h3><p>{selectedPresence.completed} tarefa(s) concluida(s), {selectedPresence.planned} planejada(s), {selectedPresence.github} GitHub.</p></div><section className="task-presence-section"><div className="panel-head slim"><div><span className="kicker">POR TAREFA</span><h2>Calendarios individuais</h2><p>Cada tarefa fixa ou avulsa do mes ganha seu proprio mapa.</p></div></div><div className="task-presence-board">{calendars.map((calendar) => <article className="task-presence-card" key={calendar.id}><div><span className="kicker">{calendar.meta}</span><strong>{calendar.title}</strong><p>{calendar.completed}/{calendar.planned} concluidas</p></div><MiniTaskGrid calendar={calendar} selectedDate={selectedDate} /></article>)}{!calendars.length && <EmptyTerminal title="Sem tarefas no mes" text="Crie tarefas para gerar calendarios individuais." />}</div></section><div className="github-sync-card"><div><span className="kicker">GITHUB COMO EXTRA</span><strong>{data.github.username ? `@${data.github.username}` : 'Nenhum GitHub conectado'}</strong><p>{data.github.syncedAt ? `Sincronizado em ${new Date(data.github.syncedAt).toLocaleString('pt-BR')}` : 'GitHub entra como atividade extra, nao como centro da tela.'}</p></div><div className="github-sync-actions"><input value={profileDraft.githubUsername} onChange={(event) => setProfileDraft((current) => ({ ...current, githubUsername: event.target.value }))} placeholder="WessYu" /><button className="neo-primary" type="button" onClick={syncGithub} disabled={githubSyncing}>{githubSyncing ? 'SYNC...' : 'SINCRONIZAR'}</button></div></div></section>}{view === 'perfil' && <section className="profile-layout"><div className="terminal-frame profile-card"><Avatar className="profile-avatar" value={user.avatar} fallback="R" /><span className="kicker">CONTA DO SITE</span><h2>{user.name}</h2><p>@{user.username}</p><p>{user.email}</p><p>Login, senha, foto e dados salvos nesta conta.</p><div className="metric-strip mini"><div className="metric-card"><span>TASKS</span><strong>{data.tasks.length}</strong></div><div className="metric-card"><span>FIXAS</span><strong>{data.fixedTasks.length}</strong></div><div className="metric-card"><span>DONE</span><strong>{totalCompleted}</strong></div><div className="metric-card"><span>AMIGOS</span><strong>{data.friends.length}</strong></div></div></div><form className="terminal-frame neo-form profile-form" onSubmit={saveProfile}><span className="kicker">USER PROFILE</span><h2>Editar perfil</h2><div className="photo-upload-row"><Avatar className="profile-avatar photo-preview" value={profileDraft.avatar} fallback={profileDraft.name?.slice(0, 1) || 'R'} /><label className="file-button photo-button">Carregar foto<input type="file" accept="image/*" onChange={handlePhotoUpload} /></label></div><label>Nome<input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Usuario<input value={profileDraft.username} onChange={(event) => setProfileDraft((current) => ({ ...current, username: event.target.value }))} /></label><label>GitHub username<input value={profileDraft.githubUsername} onChange={(event) => setProfileDraft((current) => ({ ...current, githubUsername: event.target.value }))} placeholder="WessYu" /></label><label>Avatar texto ou imagem<input value={isImageAvatar(profileDraft.avatar) ? 'foto carregada' : profileDraft.avatar} onChange={(event) => setProfileDraft((current) => ({ ...current, avatar: event.target.value.slice(0, 2) }))} maxLength={20} /></label><label>Bio<textarea value={profileDraft.bio} onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))} placeholder="Foco, estudo, dev, design..." /></label><button className="neo-primary" type="submit">SALVAR PERFIL</button><button className="outline-button" type="button" onClick={syncGithub} disabled={githubSyncing}>{githubSyncing ? 'SINCRONIZANDO...' : 'VINCULAR / SINCRONIZAR GITHUB'}</button></form><section className="terminal-frame profile-form friends-panel"><span className="kicker">CONVITE REAL</span><h2>Adicionar amigos</h2><p>Envie seu convite pelo botao abaixo. A outra pessoa cola o codigo aqui para virar amigo e aparecer nas tarefas compartilhadas.</p><button className="neo-primary" type="button" onClick={shareInvite}>ENVIAR CONVITE</button><form className="neo-form friend-form" onSubmit={acceptInvite}><label>Codigo recebido<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="ritmo://..." /></label><button className="outline-button" type="submit">ACEITAR CONVITE</button></form><form className="neo-form friend-form" onSubmit={addFriend}><span className="kicker">ADICIONAR MANUAL</span><label>Nome<input value={friendDraft.name} onChange={(event) => setFriendDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nome da pessoa" /></label><label>Email<input value={friendDraft.email} onChange={(event) => setFriendDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Opcional" /></label><label>Avatar<input value={friendDraft.avatar} onChange={(event) => setFriendDraft((current) => ({ ...current, avatar: event.target.value }))} maxLength={2} placeholder="A" /></label><button className="neo-primary" type="submit">ADICIONAR AMIGO</button></form><div className="friend-list">{data.friends.map((friend) => <article className="friend-card" key={friend.id}><span>{friend.avatar || friend.name.slice(0, 1)}</span><div><strong>{friend.name}</strong><small>{friend.email || 'sem email'}</small></div><button type="button" onClick={() => removeFriend(friend.id)}>X</button></article>)}{!data.friends.length && <EmptyTerminal title="Sem amigos ainda" text="Envie ou aceite um convite para compartilhar tarefas." />}</div></section></section>}{view === 'ia' && <section className="terminal-frame ai-screen"><span className="kicker">OPENAI PLANNER</span><h2>Planejamento inteligente</h2><p>A IA considera tarefas, amigos, conta do site, GitHub e presenca mensal.</p><textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Pergunte: o que devo priorizar hoje?" /><button className="neo-primary" type="button" onClick={askAi} disabled={aiLoading}>{aiLoading ? 'GERANDO...' : 'GERAR PLANO'}</button><div className="ai-answer">{aiAnswer || 'A resposta aparece aqui.'}</div></section>}</main><nav className="bottom-terminal">{navItems.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} type="button" onClick={() => setView(item.id)}><span><Icon name={item.icon} /></span>{item.label}</button>)}</nav></div>;
}

export default App;
