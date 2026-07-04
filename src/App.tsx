import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Download,
  Flame,
  Github,
  Home,
  Import,
  ListTodo,
  LogOut,
  MoreHorizontal,
  NotebookPen,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';

type View = 'dashboard' | 'habits' | 'planner' | 'review' | 'journal' | 'settings';
type Frequency = 'daily' | 'weekdays' | 'custom';
type Priority = 'baixa' | 'media' | 'alta';
type Energy = 'leve' | 'foco' | 'profunda';
type Mood = 'otimo' | 'bom' | 'neutro' | 'baixo';
type HabitDisplayMode = 'single' | 'weekly' | 'yearly';
type GithubSyncStatus = {
  state: 'idle' | 'syncing' | 'success' | 'error';
  message: string;
};
type AiStatus = 'idle' | 'thinking' | 'success' | 'error';
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type Habit = {
  id: string;
  title: string;
  area: string;
  frequency: Frequency;
  target: number;
  unit: string;
  color: string;
  notes: string;
  createdAt: string;
  completions: Record<string, number>;
};

type Task = {
  id: string;
  title: string;
  date: string;
  time: string;
  habitId?: string;
  priority: Priority;
  energy: Energy;
  project: string;
  done: boolean;
  createdAt: string;
};

type JournalEntry = {
  date: string;
  mood: Mood;
  intention: string;
  win: string;
  notes: string;
};

type Preferences = {
  name: string;
  dailyTarget: number;
  compactMode: boolean;
  githubUsername: string;
  openaiModel: string;
};

type Account = {
  id: string;
  name: string;
  email: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
};

type AppState = {
  habits: Habit[];
  tasks: Task[];
  journal: Record<string, JournalEntry>;
  preferences: Preferences;
};

type HabitDraft = {
  title: string;
  area: string;
  target: number;
  unit: string;
  color: string;
  notes: string;
};

const STORAGE_KEY = 'ritmo-habit-planner-state-v1';
const GITHUB_TOKEN_KEY = 'ritmo-github-token-v1';
const ACCOUNTS_KEY = 'ritmo-accounts-v1';
const SESSION_KEY = 'ritmo-session-v1';

const habitColors = ['#4968f2', '#d94cf5', '#00c877', '#ff6b2d', '#8b5cf6', '#2dd4bf'];
const areas = ['Social', 'Trabalho', 'Codigo', 'Comunidade', 'Saude', 'Escrita'];

function buildCompletions(daysBack: number, cadence: number, target = 1) {
  const completions: Record<string, number> = {};
  const today = new Date();

  for (let index = daysBack; index >= 0; index -= 1) {
    const date = isoDate(addDays(today, -index));
    const score = index % cadence !== 0 && index % 7 !== 2 ? target : 0;
    if (score > 0) completions[date] = score;
  }

  return completions;
}

const initialState: AppState = {
  habits: [
    {
      id: 'habit-threads',
      title: 'Post no Threads',
      area: 'Social',
      frequency: 'daily',
      target: 1,
      unit: 'post',
      color: '#4968f2',
      notes: 'Manter presenca e registrar ideias curtas.',
      createdAt: new Date().toISOString(),
      completions: buildCompletions(180, 5),
    },
    {
      id: 'habit-saas',
      title: 'SaaS Work',
      area: 'Trabalho',
      frequency: 'weekdays',
      target: 2,
      unit: 'blocos',
      color: '#d94cf5',
      notes: 'Produto, vendas, melhoria do funil e entregas.',
      createdAt: new Date().toISOString(),
      completions: buildCompletions(180, 4, 2),
    },
    {
      id: 'habit-github',
      title: 'GitHub Activity',
      area: 'Codigo',
      frequency: 'daily',
      target: 1,
      unit: 'commit',
      color: '#00c877',
      notes: 'Commit, review ou melhoria de projeto.',
      createdAt: new Date().toISOString(),
      completions: buildCompletions(180, 6),
    },
    {
      id: 'habit-reddit',
      title: 'Post no Reddit',
      area: 'Comunidade',
      frequency: 'custom',
      target: 1,
      unit: 'post',
      color: '#ff6b2d',
      notes: 'Compartilhar progresso, pergunta ou aprendizado.',
      createdAt: new Date().toISOString(),
      completions: buildCompletions(95, 3),
    },
  ],
  tasks: [
    {
      id: 'task-review',
      title: 'Revisar prioridades da semana',
      date: isoDate(),
      time: '09:30',
      habitId: 'habit-saas',
      priority: 'alta',
      energy: 'foco',
      project: 'Ritmo',
      done: false,
      createdAt: new Date().toISOString(),
    },
  ],
  journal: {
    [isoDate()]: {
      date: isoDate(),
      mood: 'bom',
      intention: 'Escolher poucas coisas importantes e fechar o ciclo.',
      win: '',
      notes: '',
    },
  },
  preferences: {
    name: 'Wesley',
    dailyTarget: 4,
    compactMode: false,
    githubUsername: '',
    openaiModel: 'gpt-5.5',
  },
};

const navigation = [
  { id: 'dashboard', label: 'Hoje', icon: Home },
  { id: 'habits', label: 'Habitos', icon: Activity },
  { id: 'planner', label: 'Plano', icon: ListTodo },
  { id: 'review', label: 'Revisao', icon: BarChart3 },
  { id: 'journal', label: 'Diario', icon: NotebookPen },
  { id: 'settings', label: 'Ajustes', icon: Settings },
] satisfies Array<{ id: View; label: string; icon: typeof Home }>;

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isoDate(date = new Date()) {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return normalized.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function parseIso(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDay(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('pt-BR', options).format(parseIso(value));
}

function weekDays(centerDate: string) {
  const center = parseIso(centerDate);
  const day = center.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return Array.from({ length: 7 }, (_, index) => isoDate(addDays(center, mondayOffset + index)));
}

function rangeDays(amount: number, endDate: string) {
  const end = parseIso(endDate);
  return Array.from({ length: amount }, (_, index) => isoDate(addDays(end, index - amount + 1)));
}

function isGithubHabit(habit: Habit) {
  return habit.id === 'habit-github' || habit.title.toLowerCase().includes('github');
}

function linkedTasksForHabit(tasks: Task[] | undefined, habitId: string, date: string) {
  return (tasks ?? []).filter((task) => task.habitId === habitId && task.date === date);
}

function habitIsDue(habit: Habit, date: string, tasks?: Task[]) {
  if (tasks) {
    if (isGithubHabit(habit)) return true;
    return linkedTasksForHabit(tasks, habit.id, date).length > 0 || (habit.completions[date] ?? 0) > 0;
  }

  const day = parseIso(date).getDay();
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekdays') return day >= 1 && day <= 5;
  return day === 1 || day === 3 || day === 5;
}

function habitTargetForDate(habit: Habit, date: string, tasks?: Task[]) {
  if (!tasks || isGithubHabit(habit)) return Math.max(habit.target, 1);
  const planned = linkedTasksForHabit(tasks, habit.id, date).length;
  return Math.max(planned || habit.target, 1);
}

function completionRatio(habit: Habit, date: string, tasks?: Task[]) {
  if (!habitIsDue(habit, date, tasks)) return 0;
  const progress = habit.completions[date] ?? 0;
  return Math.min(progress / habitTargetForDate(habit, date, tasks), 1);
}

function streakForHabit(habit: Habit, today: string, tasks?: Task[]) {
  let streak = 0;
  let cursor = parseIso(today);

  for (let index = 0; index < 365; index += 1) {
    const date = isoDate(cursor);
    if (!habitIsDue(habit, date, tasks)) {
      cursor = addDays(cursor, -1);
      continue;
    }

    if (completionRatio(habit, date, tasks) >= 1) {
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }

    break;
  }

  return streak;
}

function accountStateKey(accountId?: string) {
  return accountId ? `${STORAGE_KEY}-${accountId}` : STORAGE_KEY;
}

function loadAccounts(): Account[] {
  try {
    const saved = localStorage.getItem(ACCOUNTS_KEY);
    if (!saved) return [];
    const accounts = JSON.parse(saved) as Account[];
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function loadState(accountId?: string): AppState {
  try {
    const saved = localStorage.getItem(accountStateKey(accountId));
    if (!saved) return initialState;
    const parsed = JSON.parse(saved) as AppState;
    const hasContent = (parsed.habits?.length ?? 0) > 0 || (parsed.tasks?.length ?? 0) > 0;
    if (!hasContent) return initialState;

    return {
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      journal: parsed.journal && typeof parsed.journal === 'object' ? parsed.journal : {},
      preferences: { ...initialState.preferences, ...parsed.preferences },
    };
  } catch {
    return initialState;
  }
}

function saveBlob(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function fetchGithubContributions(username: string, token: string): Promise<Record<string, number>> {
  const to = new Date();
  const from = addDays(to, -365);
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: `
        query Contributions($login: String!, $from: DateTime!, $to: DateTime!) {
          user(login: $login) {
            contributionsCollection(from: $from, to: $to) {
              contributionCalendar {
                weeks {
                  contributionDays {
                    date
                    contributionCount
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        login: username,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub respondeu ${response.status}`);
  }

  const payload = (await response.json()) as {
    errors?: Array<{ message?: string }>;
    data?: {
      user?: {
        contributionsCollection?: {
          contributionCalendar?: {
            weeks?: Array<{ contributionDays: Array<{ date: string; contributionCount: number }> }>;
          };
        };
      };
    };
  };
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'Erro na GraphQL API do GitHub');
  }

  const weeks = payload.data?.user?.contributionsCollection?.contributionCalendar?.weeks ?? [];
  const days = weeks.flatMap((week) => week.contributionDays);

  return days.reduce<Record<string, number>>((acc, day) => {
    if (day.contributionCount > 0) acc[day.date] = day.contributionCount;
    return acc;
  }, {});
}

async function fetchGithubPublicEvents(username: string): Promise<Record<string, number>> {
  const allEvents: Array<{ type: string; created_at: string }> = [];

  for (let page = 1; page <= 3; page += 1) {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100&page=${page}`,
    );

    if (!response.ok) {
      throw new Error(`GitHub respondeu ${response.status}`);
    }

    const events = (await response.json()) as Array<{ type: string; created_at: string }>;
    allEvents.push(...events);
    if (events.length < 100) break;
  }

  const usefulEvents = new Set([
    'CommitCommentEvent',
    'CreateEvent',
    'IssuesEvent',
    'PullRequestEvent',
    'PullRequestReviewEvent',
    'PushEvent',
    'ReleaseEvent',
  ]);

  return allEvents.reduce<Record<string, number>>((acc, event) => {
    if (!usefulEvents.has(event.type)) return acc;
    const date = event.created_at.slice(0, 10);
    acc[date] = (acc[date] ?? 0) + 1;
    return acc;
  }, {});
}

function applyGithubCompletions(current: AppState, completions: Record<string, number>) {
  const syncWindow = new Set(rangeDays(365, isoDate()));
  const existing = current.habits.find(
    (habit) => habit.id === 'habit-github' || habit.title.toLowerCase().includes('github'),
  );
  const cleanedCompletions: Record<string, number> = existing
    ? Object.entries(existing.completions).reduce<Record<string, number>>((acc, [date, value]) => {
        if (!syncWindow.has(date)) acc[date] = value;
        return acc;
      }, {})
    : {};
  const githubHabit: Habit = {
    id: existing?.id ?? 'habit-github',
    title: existing?.title ?? 'GitHub Activity',
    area: existing?.area ?? 'Codigo',
    frequency: existing?.frequency ?? 'daily',
    target: existing?.target ?? 1,
    unit: existing?.unit ?? 'contrib',
    color: existing?.color ?? '#00c877',
    notes: existing?.notes ?? 'Sincronizado com GitHub.',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    completions: {
      ...cleanedCompletions,
      ...completions,
    },
  };

  return {
    ...current,
    habits: existing
      ? current.habits.map((habit) => (habit.id === existing.id ? githubHabit : habit))
      : [...current.habits, githubHabit],
  };
}

function App() {
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [sessionAccountId, setSessionAccountId] = useState(() => localStorage.getItem(SESSION_KEY) ?? '');
  const activeAccount = accounts.find((account) => account.id === sessionAccountId) ?? null;
  const [authError, setAuthError] = useState('');
  const [state, setState] = useState<AppState>(() => loadState(localStorage.getItem(SESSION_KEY) ?? undefined));
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [selectedDate, setSelectedDate] = useState(() => isoDate());
  const [habitDisplayMode, setHabitDisplayMode] = useState<HabitDisplayMode>('yearly');
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem(GITHUB_TOKEN_KEY) ?? '');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiMessage, setAiMessage] = useState('Peça uma sugestão para organizar seus hábitos de hoje.');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installMessage, setInstallMessage] = useState('');
  const [githubSyncStatus, setGithubSyncStatus] = useState<GithubSyncStatus>({
    state: 'idle',
    message: 'Conecte seu usuario do GitHub para preencher o heatmap automaticamente.',
  });
  const [habitDraft, setHabitDraft] = useState<HabitDraft>({
    title: '',
    area: 'Saude',
    target: 1,
    unit: 'vez',
    color: habitColors[0],
    notes: '',
  });
  const [taskDraft, setTaskDraft] = useState<Omit<Task, 'id' | 'done' | 'createdAt'>>({
    title: '',
    date: isoDate(),
    time: '',
    habitId: '',
    priority: 'media',
    energy: 'foco',
    project: '',
  });

  useEffect(() => {
    saveAccounts(accounts);
  }, [accounts]);

  useEffect(() => {
    if (activeAccount) {
      localStorage.setItem(SESSION_KEY, activeAccount.id);
      localStorage.setItem(accountStateKey(activeAccount.id), JSON.stringify(state));
      return;
    }

    localStorage.removeItem(SESSION_KEY);
  }, [activeAccount, state]);

  useEffect(() => {
    if (githubToken.trim()) {
      localStorage.setItem(GITHUB_TOKEN_KEY, githubToken.trim());
      return;
    }

    localStorage.removeItem(GITHUB_TOKEN_KEY);
  }, [githubToken]);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setInstallMessage('');
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);

  const today = isoDate();
  const selectedWeek = weekDays(selectedDate);
  const dueHabits = useMemo(
    () => state.habits.filter((habit) => habitIsDue(habit, selectedDate, state.tasks)),
    [state.habits, selectedDate, state.tasks],
  );
  const selectedTasks = useMemo(
    () =>
      state.tasks
        .filter((task) => task.date === selectedDate)
        .sort((a, b) => `${a.done}${a.time}`.localeCompare(`${b.done}${b.time}`)),
    [state.tasks, selectedDate],
  );
  const todayJournal = state.journal[selectedDate] ?? {
    date: selectedDate,
    mood: 'bom',
    intention: '',
    win: '',
    notes: '',
  };

  const selectedCompletion = dueHabits.length
    ? Math.round(
        (dueHabits.reduce((sum, habit) => sum + completionRatio(habit, selectedDate, state.tasks), 0) /
          dueHabits.length) *
          100,
      )
    : 0;

  const completedTasks = selectedTasks.filter((task) => task.done).length;
  const bestStreak = state.habits.reduce(
    (max, habit) => Math.max(max, streakForHabit(habit, today, state.tasks)),
    0,
  );
  const weeklyData = rangeDays(7, selectedDate).map((date) => {
    const due = state.habits.filter((habit) => habitIsDue(habit, date, state.tasks));
    const score = due.length
      ? Math.round(
          (due.reduce((sum, habit) => sum + completionRatio(habit, date, state.tasks), 0) / due.length) *
            100,
        )
      : 0;
    return { date, score };
  });

  function updateHabitProgress(habitId: string, date: string, delta: number) {
    setState((current) => ({
      ...current,
      habits: current.habits.map((habit) => {
        if (habit.id !== habitId) return habit;
        const nextValue = Math.max(0, (habit.completions[date] ?? 0) + delta);
        return {
          ...habit,
          completions: {
            ...habit.completions,
            [date]: nextValue,
          },
        };
      }),
    }));
  }

  function completeHabit(habitId: string, date: string) {
    setState((current) => ({
      ...current,
      habits: current.habits.map((habit) => {
        if (habit.id !== habitId) return habit;
        return {
          ...habit,
          completions: {
            ...habit.completions,
            [date]: habit.target,
          },
        };
      }),
    }));
  }

  function recalculateHabitFromTasks(habits: Habit[], tasks: Task[], habitId: string, date: string) {
    const doneCount = tasks.filter((task) => task.habitId === habitId && task.date === date && task.done).length;

    return habits.map((habit) => {
      if (habit.id !== habitId || isGithubHabit(habit)) return habit;
      const nextCompletions = { ...habit.completions };

      if (doneCount > 0) {
        nextCompletions[date] = doneCount;
      } else {
        delete nextCompletions[date];
      }

      return {
        ...habit,
        completions: nextCompletions,
      };
    });
  }

  function addHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!habitDraft.title.trim()) return;

    setState((current) => ({
      ...current,
      habits: [
        ...current.habits,
        {
          id: makeId('habit'),
          title: habitDraft.title.trim(),
          area: habitDraft.area,
          frequency: 'daily',
          target: Math.max(Number(habitDraft.target), 1),
          unit: habitDraft.unit.trim() || 'vez',
          color: habitDraft.color,
          notes: habitDraft.notes.trim(),
          createdAt: new Date().toISOString(),
          completions: {},
        },
      ],
    }));

    setHabitDraft((current) => ({ ...current, title: '', notes: '' }));
  }

  function removeHabit(id: string) {
    setState((current) => ({
      ...current,
      habits: current.habits.filter((habit) => habit.id !== id),
    }));
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskDraft.title.trim()) return;

    setState((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          ...taskDraft,
          habitId: taskDraft.habitId || undefined,
          id: makeId('task'),
          title: taskDraft.title.trim(),
          project: taskDraft.project.trim(),
          done: false,
          createdAt: new Date().toISOString(),
        },
      ],
    }));

    setTaskDraft((current) => ({ ...current, title: '', project: '', time: '', date: selectedDate }));
  }

  function toggleTask(id: string) {
    setState((current) => ({
      ...current,
      ...(() => {
        const taskToToggle = current.tasks.find((task) => task.id === id);
        const nextTasks = current.tasks.map((task) =>
          task.id === id ? { ...task, done: !task.done } : task,
        );

        return {
          tasks: nextTasks,
          habits: taskToToggle?.habitId
            ? recalculateHabitFromTasks(current.habits, nextTasks, taskToToggle.habitId, taskToToggle.date)
            : current.habits,
        };
      })(),
    }));
  }

  function removeTask(id: string) {
    setState((current) => ({
      ...current,
      ...(() => {
        const taskToRemove = current.tasks.find((task) => task.id === id);
        const nextTasks = current.tasks.filter((task) => task.id !== id);

        return {
          tasks: nextTasks,
          habits: taskToRemove?.habitId
            ? recalculateHabitFromTasks(current.habits, nextTasks, taskToRemove.habitId, taskToRemove.date)
            : current.habits,
        };
      })(),
    }));
  }

  function updateJournal(patch: Partial<JournalEntry>) {
    setState((current) => ({
      ...current,
      journal: {
        ...current.journal,
        [selectedDate]: {
          ...todayJournal,
          ...patch,
          date: selectedDate,
        },
      },
    }));
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppState;
        setState({
          habits: Array.isArray(parsed.habits) ? parsed.habits : [],
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
          journal: parsed.journal ?? {},
          preferences: { ...initialState.preferences, ...parsed.preferences },
        });
      } catch {
        window.alert('Nao consegui ler esse arquivo de backup.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  async function registerAccount(name: string, email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || password.length < 6) {
      setAuthError('Preencha nome, email e uma senha com pelo menos 6 caracteres.');
      return;
    }

    if (accounts.some((account) => account.email === normalizedEmail)) {
      setAuthError('Ja existe uma conta com esse email.');
      return;
    }

    const salt = randomSalt();
    const passwordHash = await hashPassword(password, salt);
    const account: Account = {
      id: makeId('account'),
      name: name.trim(),
      email: normalizedEmail,
      salt,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    const nextState = {
      ...initialState,
      preferences: {
        ...initialState.preferences,
        name: account.name,
      },
    };

    setAccounts((current) => [...current, account]);
    setState(nextState);
    setSessionAccountId(account.id);
    setAuthError('');
  }

  async function loginAccount(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const account = accounts.find((item) => item.email === normalizedEmail);

    if (!account) {
      setAuthError('Conta nao encontrada.');
      return;
    }

    const passwordHash = await hashPassword(password, account.salt);
    if (passwordHash !== account.passwordHash) {
      setAuthError('Senha incorreta.');
      return;
    }

    setState(loadState(account.id));
    setSessionAccountId(account.id);
    setAuthError('');
  }

  function logoutAccount() {
    setSessionAccountId('');
    setGithubToken('');
    setAiAnswer('');
    setAiPrompt('');
    setState(initialState);
  }

  async function installApp() {
    if (!installPrompt) {
      setInstallMessage('Se o navegador ja permitiu instalar, procure a opcao na barra de endereco.');
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallMessage(choice.outcome === 'accepted' ? 'App instalado.' : 'Instalacao cancelada.');
    setInstallPrompt(null);
  }

  async function askOpenAi() {
    const prompt = aiPrompt.trim() || 'Analise meu dia e sugira o proximo passo mais importante.';

    setAiStatus('thinking');
    setAiMessage('A IA esta lendo seus habitos, tarefas e revisao do dia.');

    const habitSummary = state.habits.map((habit) => ({
      title: habit.title,
      area: habit.area,
      today: habit.completions[selectedDate] ?? 0,
      target: habitTargetForDate(habit, selectedDate, state.tasks),
      streak: streakForHabit(habit, selectedDate, state.tasks),
      github: isGithubHabit(habit),
    }));
    const taskSummary = selectedTasks.map((task) => ({
      title: task.title,
      done: task.done,
      priority: task.priority,
      time: task.time,
      habit: state.habits.find((habit) => habit.id === task.habitId)?.title ?? null,
    }));

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          date: selectedDate,
          habits: habitSummary,
          tasks: taskSummary,
          journal: todayJournal,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? `Backend respondeu ${response.status}`);
      }

      setAiAnswer(payload.answer || 'Nao recebi uma resposta em texto da OpenAI.');
      setAiStatus('success');
      setAiMessage('Sugestao gerada com OpenAI.');
    } catch (error) {
      setAiStatus('error');
      setAiMessage(error instanceof Error ? error.message : 'Nao consegui falar com a OpenAI.');
    }
  }

  async function syncGithubActivity() {
    const username = state.preferences.githubUsername.trim();
    const token = githubToken.trim();

    if (!username) {
      setGithubSyncStatus({
        state: 'error',
        message: 'Informe seu usuario do GitHub antes de sincronizar.',
      });
      return;
    }

    setGithubSyncStatus({
      state: 'syncing',
      message: token
        ? 'Sincronizando calendario de contribuicoes pelo GitHub...'
        : 'Sincronizando eventos publicos recentes do GitHub...',
    });

    try {
      const completions = token
        ? await fetchGithubContributions(username, token)
        : await fetchGithubPublicEvents(username);
      const completedDays = Object.keys(completions).length;
      const totalContributions = Object.values(completions).reduce((sum, value) => sum + value, 0);

      setState((current) => applyGithubCompletions(current, completions));
      setGithubSyncStatus({
        state: 'success',
        message: `${completedDays} dias e ${totalContributions} atividades sincronizadas.`,
      });
    } catch (error) {
      setGithubSyncStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Nao consegui sincronizar com o GitHub.',
      });
    }
  }

  if (!activeAccount) {
    return (
      <AuthScreen
        error={authError}
        hasAccounts={accounts.length > 0}
        loginAccount={loginAccount}
        registerAccount={registerAccount}
      />
    );
  }

  return (
    <div className={state.preferences.compactMode ? 'app compact' : 'app'}>
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img src="/icone.jpeg" alt="" />
          </div>
          <div>
            <strong>Ritmo</strong>
            <small>Habit Planner</small>
          </div>
        </div>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeView === item.id ? 'nav-item active' : 'nav-item'}
                type="button"
                onClick={() => setActiveView(item.id)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="ai-card">
          <div className="ai-card-head">
            <Sparkles size={18} />
            <strong>OpenAI</strong>
          </div>
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Pergunte sobre seu dia"
          />
          <button className="primary-button" type="button" onClick={askOpenAi} disabled={aiStatus === 'thinking'}>
            {aiStatus === 'thinking' ? 'Pensando' : 'Gerar plano'}
          </button>
          <p className={aiStatus === 'error' ? 'ai-message error' : 'ai-message'}>{aiAnswer || aiMessage}</p>
          <div className="side-actions">
            <button className="ghost-button" type="button" onClick={installApp}>
              <Download size={16} />
              Baixar app
            </button>
            <button className="ghost-button" type="button" onClick={logoutAccount}>
              <LogOut size={16} />
              Sair
            </button>
          </div>
          {installMessage && <span className="install-note">{installMessage}</span>}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{formatDay(selectedDate, { weekday: 'long' })}</span>
            <h1>{viewTitle(activeView)}</h1>
          </div>

          <div className="date-control">
            <button
              className="icon-button"
              type="button"
              onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), -1)))}
              title="Dia anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setTaskDraft((current) => ({ ...current, date: event.target.value }));
              }}
              aria-label="Data selecionada"
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => setSelectedDate(isoDate(addDays(parseIso(selectedDate), 1)))}
              title="Proximo dia"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </header>

        <section className="week-strip" aria-label="Semana">
          {selectedWeek.map((day) => {
            const dayHabits = state.habits.filter((habit) => habitIsDue(habit, day, state.tasks));
            const score = dayHabits.length
              ? Math.round(
                  (dayHabits.reduce((sum, habit) => sum + completionRatio(habit, day, state.tasks), 0) /
                    dayHabits.length) *
                    100,
                )
              : 0;
            return (
              <button
                type="button"
                key={day}
                className={day === selectedDate ? 'day-pill active' : 'day-pill'}
                onClick={() => {
                  setSelectedDate(day);
                  setTaskDraft((current) => ({ ...current, date: day }));
                }}
              >
                <span>{formatDay(day, { weekday: 'short' }).replace('.', '')}</span>
                <strong>{formatDay(day, { day: '2-digit' })}</strong>
                <i style={{ height: `${Math.max(score, 8)}%` }} />
              </button>
            );
          })}
        </section>

        {activeView === 'dashboard' && (
          <DashboardView
            completion={selectedCompletion}
            completedTasks={completedTasks}
            selectedTasks={selectedTasks}
            dueHabits={dueHabits}
            habits={state.habits}
            selectedDate={selectedDate}
            journal={todayJournal}
            bestStreak={bestStreak}
            updateHabitProgress={updateHabitProgress}
            completeHabit={completeHabit}
            toggleTask={toggleTask}
            removeTask={removeTask}
            updateJournal={updateJournal}
            openHabits={() => setActiveView('habits')}
            openPlanner={() => setActiveView('planner')}
          />
        )}

        {activeView === 'habits' && (
          <HabitsView
            habits={state.habits}
            tasks={state.tasks}
            selectedDate={selectedDate}
            displayMode={habitDisplayMode}
            setDisplayMode={setHabitDisplayMode}
            draft={habitDraft}
            setDraft={setHabitDraft}
            addHabit={addHabit}
            removeHabit={removeHabit}
            updateHabitProgress={updateHabitProgress}
            completeHabit={completeHabit}
          />
        )}

        {activeView === 'planner' && (
          <PlannerView
            tasks={selectedTasks}
            allTasks={state.tasks}
            habits={state.habits}
            selectedDate={selectedDate}
            draft={taskDraft}
            setDraft={setTaskDraft}
            addTask={addTask}
            toggleTask={toggleTask}
            removeTask={removeTask}
          />
        )}

        {activeView === 'review' && (
          <ReviewView
            habits={state.habits}
            tasks={state.tasks}
            weeklyData={weeklyData}
            selectedDate={selectedDate}
            bestStreak={bestStreak}
          />
        )}

        {activeView === 'journal' && (
          <JournalView entry={todayJournal} selectedDate={selectedDate} updateJournal={updateJournal} />
        )}

        {activeView === 'settings' && (
          <SettingsView
            state={state}
            setState={setState}
            importBackup={importBackup}
            exportBackup={() => saveBlob(`ritmo-backup-${today}.json`, state)}
            githubToken={githubToken}
            setGithubToken={setGithubToken}
            githubSyncStatus={githubSyncStatus}
            syncGithubActivity={syncGithubActivity}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navegacao mobile">
        {navigation.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? 'active' : ''}
              onClick={() => setActiveView(item.id)}
              title={item.label}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function viewTitle(view: View) {
  const titles: Record<View, string> = {
    dashboard: 'Painel de hoje',
    habits: 'Habitos',
    planner: 'Planejamento',
    review: 'Revisao',
    journal: 'Diario',
    settings: 'Ajustes',
  };
  return titles[view];
}

function AuthScreen({
  error,
  hasAccounts,
  loginAccount,
  registerAccount,
}: {
  error: string;
  hasAccounts: boolean;
  loginAccount: (email: string, password: string) => Promise<void>;
  registerAccount: (name: string, email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>(hasAccounts ? 'login' : 'register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'login') {
      await loginAccount(email, password);
      return;
    }

    await registerAccount(name, email, password);
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-brand">
          <img src="/icone.jpeg" alt="" />
          <div>
            <strong>Ritmo</strong>
            <span>Habit Planner</span>
          </div>
        </div>
        <h1>{mode === 'login' ? 'Entrar na conta' : 'Criar conta'}</h1>
        <form className="form-grid" onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Nome
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@email.com"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="minimo 6 caracteres"
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="primary-button" type="submit">
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
        <button
          className="ghost-button"
          type="button"
          onClick={() => setMode((current) => (current === 'login' ? 'register' : 'login'))}
        >
          {mode === 'login' ? 'Criar nova conta' : 'Ja tenho conta'}
        </button>
      </section>
    </main>
  );
}

function DashboardView({
  completion,
  completedTasks,
  selectedTasks,
  dueHabits,
  habits,
  selectedDate,
  journal,
  bestStreak,
  updateHabitProgress,
  completeHabit,
  toggleTask,
  removeTask,
  updateJournal,
  openHabits,
  openPlanner,
}: {
  completion: number;
  completedTasks: number;
  selectedTasks: Task[];
  dueHabits: Habit[];
  habits: Habit[];
  selectedDate: string;
  journal: JournalEntry;
  bestStreak: number;
  updateHabitProgress: (habitId: string, date: string, delta: number) => void;
  completeHabit: (habitId: string, date: string) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  updateJournal: (patch: Partial<JournalEntry>) => void;
  openHabits: () => void;
  openPlanner: () => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">Progresso do dia</span>
          <h2>{completion}% concluido</h2>
          <p>
            {dueHabits.length
              ? `${dueHabits.length} habito${dueHabits.length > 1 ? 's' : ''} programado${
                  dueHabits.length > 1 ? 's' : ''
                } para ${formatDay(selectedDate, { day: '2-digit', month: 'long' })}.`
              : 'Nenhum habito programado para esta data.'}
          </p>
        </div>
        <div className="radial" style={{ '--progress': `${completion * 3.6}deg` } as React.CSSProperties}>
          <span>{completion}%</span>
        </div>
      </section>

      <section className="metric-row">
        <Metric icon={Flame} label="Melhor sequencia" value={`${bestStreak} dias`} />
        <Metric icon={Check} label="Tarefas feitas" value={`${completedTasks}/${selectedTasks.length}`} />
        <Metric icon={Trophy} label="Habitos de hoje" value={`${dueHabits.length}`} />
      </section>

      <section className="panel">
        <PanelHeader
          icon={Activity}
          title="Habitos de hoje"
          actionLabel="Novo"
          onAction={openHabits}
          actionIcon={Plus}
        />
        <div className="stack-list">
          {dueHabits.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Monte sua rotina"
              text="Crie habitos com metas diarias, semanais ou alternadas."
              actionLabel="Adicionar habito"
              onAction={openHabits}
            />
          ) : (
            dueHabits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                date={selectedDate}
                onIncrement={() => updateHabitProgress(habit.id, selectedDate, 1)}
                onDecrement={() => updateHabitProgress(habit.id, selectedDate, -1)}
                onComplete={() => completeHabit(habit.id, selectedDate)}
              />
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <PanelHeader
          icon={ListTodo}
          title="Agenda"
          actionLabel="Nova"
          onAction={openPlanner}
          actionIcon={Plus}
        />
        <div className="stack-list">
          {selectedTasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="Dia limpo"
              text="Adicione compromissos, blocos de foco ou tarefas soltas."
              actionLabel="Planejar"
              onAction={openPlanner}
            />
          ) : (
            selectedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                habits={habits}
                toggleTask={toggleTask}
                removeTask={removeTask}
              />
            ))
          )}
        </div>
      </section>

      <section className="panel reflection-panel">
        <PanelHeader icon={NotebookPen} title="Intencao" />
        <textarea
          value={journal.intention}
          onChange={(event) => updateJournal({ intention: event.target.value })}
          placeholder="O que precisa guiar seu dia?"
        />
      </section>
    </div>
  );
}

function HabitsView({
  habits,
  tasks,
  selectedDate,
  displayMode,
  setDisplayMode,
  draft,
  setDraft,
  addHabit,
  removeHabit,
  updateHabitProgress,
  completeHabit,
}: {
  habits: Habit[];
  tasks: Task[];
  selectedDate: string;
  displayMode: HabitDisplayMode;
  setDisplayMode: (mode: HabitDisplayMode) => void;
  draft: HabitDraft;
  setDraft: (draft: HabitDraft | ((current: HabitDraft) => HabitDraft)) => void;
  addHabit: (event: FormEvent<HTMLFormElement>) => void;
  removeHabit: (id: string) => void;
  updateHabitProgress: (habitId: string, date: string, delta: number) => void;
  completeHabit: (habitId: string, date: string) => void;
}) {
  return (
    <div className="loggd-layout">
      <section className="panel form-panel">
        <PanelHeader icon={CirclePlus} title="Novo habito" />
        <form className="form-grid" onSubmit={addHabit}>
          <label>
            Nome
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Ex.: caminhar, estudar ingles"
            />
          </label>
          <label>
            Area
            <select
              value={draft.area}
              onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))}
            >
              {areas.map((area) => (
                <option key={area}>{area}</option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label>
              Meta base
              <input
                type="number"
                min="1"
                value={draft.target}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, target: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              Unidade
              <input
                value={draft.unit}
                onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))}
              />
            </label>
          </div>
          <fieldset className="swatches">
            <legend>Cor</legend>
            {habitColors.map((color) => (
              <button
                type="button"
                key={color}
                className={draft.color === color ? 'swatch active' : 'swatch'}
                style={{ background: color }}
                onClick={() => setDraft((current) => ({ ...current, color }))}
                title={`Cor ${color}`}
              />
            ))}
          </fieldset>
          <label>
            Notas
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="As tarefas vinculadas definem a frequencia real do habito"
            />
          </label>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            Criar habito
          </button>
        </form>
      </section>

      <section className="tracker-panel">
        <div className="tracker-header">
          <div className="profile-chip">
            <div className="avatar-ring">
              <span>R</span>
            </div>
            <div>
              <strong>beusebiu</strong>
              <small>{habits.length} habitos ativos</small>
            </div>
          </div>
          <div className="tracker-actions">
            <button className="icon-button" type="button" title="Lembretes">
              <Flame size={17} />
            </button>
            <button className="icon-button" type="button" title="Ajustes">
              <Settings size={17} />
            </button>
          </div>
        </div>

        <div className="tracker-title-row">
          <h2>Habits</h2>
          <div className="mode-tabs" aria-label="Modo de visualizacao">
            {(['single', 'weekly', 'yearly'] as HabitDisplayMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={displayMode === mode ? 'active' : ''}
                onClick={() => setDisplayMode(mode)}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>

        <div className="date-range-line">
          <button className="icon-button" type="button" title="Periodo anterior">
            <ChevronLeft size={17} />
          </button>
          <strong>
            {displayMode === 'weekly'
              ? `${formatDay(weekDays(selectedDate)[0], { day: '2-digit', month: 'short' })} - ${formatDay(
                  weekDays(selectedDate)[6],
                  { day: '2-digit', month: 'short', year: 'numeric' },
                )}`
              : formatDay(selectedDate, { day: '2-digit', month: 'long', year: 'numeric' })}
          </strong>
          <button className="icon-button" type="button" title="Proximo periodo">
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="habit-feed">
          {habits.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Sem habitos ainda"
              text="Tudo que voce criar aqui fica liberado, editavel e salvo localmente."
            />
          ) : (
            habits.map((habit) => (
              <HabitTrackerCard
                key={habit.id}
                habit={habit}
                tasks={tasks}
                selectedDate={selectedDate}
                mode={displayMode}
                onIncrement={(date) => updateHabitProgress(habit.id, date, 1)}
                onDecrement={(date) => updateHabitProgress(habit.id, date, -1)}
                onComplete={(date) => completeHabit(habit.id, date)}
                onRemove={() => removeHabit(habit.id)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function HabitTrackerCard({
  habit,
  tasks,
  selectedDate,
  mode,
  onIncrement,
  onDecrement,
  onComplete,
  onRemove,
}: {
  habit: Habit;
  tasks: Task[];
  selectedDate: string;
  mode: HabitDisplayMode;
  onIncrement: (date: string) => void;
  onDecrement: (date: string) => void;
  onComplete: (date: string) => void;
  onRemove: () => void;
}) {
  const current = habit.completions[selectedDate] ?? 0;
  const target = habitTargetForDate(habit, selectedDate, tasks);
  const plannedTasks = linkedTasksForHabit(tasks, habit.id, selectedDate);
  const streak = streakForHabit(habit, selectedDate, tasks);
  const total = habitCompletionCount(habit);
  const yearlyDays = rangeDays(182, selectedDate);
  const week = weekDays(selectedDate);

  return (
    <article className="tracker-card" style={{ '--habit-color': habit.color } as React.CSSProperties}>
      <div className="tracker-card-head">
        <div className="habit-identity">
          <span className="habit-glyph">
            <Activity size={15} />
          </span>
          <div>
            <h3>{habit.title}</h3>
            <small>
              {habit.area} / {isGithubHabit(habit) ? 'GitHub sync' : `${plannedTasks.length} tarefas no dia`}
            </small>
          </div>
        </div>
        <div className="habit-stats">
          <span title="Sequencia">
            <Flame size={13} />
            {streak}
          </span>
          <span>{total}</span>
          <button className="tiny-icon danger" type="button" onClick={onRemove} title="Excluir habito">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {mode === 'yearly' && (
        <>
          <div className="month-labels">
            {['Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai'].map((month) => (
              <span key={month}>{month}</span>
            ))}
          </div>
          <div className="year-grid" aria-label={`Historico anual de ${habit.title}`}>
            {yearlyDays.map((date) => {
              const ratio = completionRatio(habit, date, tasks);
              return (
                <button
                  type="button"
                  key={date}
                  className={ratio >= 1 ? 'done' : ratio > 0 ? 'partial' : ''}
                  style={{ '--cell-alpha': ratio } as React.CSSProperties}
                  onClick={() => onComplete(date)}
                  title={`${formatDay(date, { day: '2-digit', month: 'short' })}: ${Math.round(ratio * 100)}%`}
                />
              );
            })}
          </div>
        </>
      )}

      {mode === 'weekly' && (
        <div className="week-grid">
          {week.map((date) => {
            const ratio = completionRatio(habit, date, tasks);
            const planned = linkedTasksForHabit(tasks, habit.id, date).length;
            return (
              <button
                key={date}
                type="button"
                className={ratio >= 1 ? 'week-cell done' : 'week-cell'}
                onClick={() => onComplete(date)}
              >
                <span>{formatDay(date, { weekday: 'short' }).slice(0, 2)}</span>
                <strong>{isGithubHabit(habit) ? habit.completions[date] ?? '' : `${habit.completions[date] ?? 0}/${planned}`}</strong>
              </button>
            );
          })}
        </div>
      )}

      {mode === 'single' && (
        <div className="single-habit-control">
          <button className="icon-button" type="button" onClick={() => onDecrement(selectedDate)} title="Diminuir">
            <X size={16} />
          </button>
          <div>
            <strong>
              {current}/{target}
            </strong>
            <span>{habit.unit}</span>
          </div>
          <button className="icon-button" type="button" onClick={() => onIncrement(selectedDate)} title="Adicionar">
            <Plus size={16} />
          </button>
          <button className="primary-button" type="button" onClick={() => onComplete(selectedDate)}>
            <Check size={16} />
            Feito
          </button>
        </div>
      )}
    </article>
  );
}

function PlannerView({
  tasks,
  allTasks,
  habits,
  selectedDate,
  draft,
  setDraft,
  addTask,
  toggleTask,
  removeTask,
}: {
  tasks: Task[];
  allTasks: Task[];
  habits: Habit[];
  selectedDate: string;
  draft: Omit<Task, 'id' | 'done' | 'createdAt'>;
  setDraft: (draft: Omit<Task, 'id' | 'done' | 'createdAt'> | ((current: Omit<Task, 'id' | 'done' | 'createdAt'>) => Omit<Task, 'id' | 'done' | 'createdAt'>)) => void;
  addTask: (event: FormEvent<HTMLFormElement>) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
}) {
  const upcoming = allTasks
    .filter((task) => task.date >= selectedDate && !task.done)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    .slice(0, 5);

  return (
    <div className="planner-layout">
      <section className="panel form-panel">
        <PanelHeader icon={CirclePlus} title="Nova tarefa" />
        <form className="form-grid" onSubmit={addTask}>
          <label>
            Titulo
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Ex.: revisar proposta"
            />
          </label>
          <div className="field-row">
            <label>
              Data
              <input
                type="date"
                value={draft.date}
                onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
              />
            </label>
            <label>
              Hora
              <input
                type="time"
                value={draft.time}
                onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))}
              />
            </label>
          </div>
          <div className="field-row">
            <label>
              Prioridade
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, priority: event.target.value as Priority }))
                }
              >
                <option value="baixa">Baixa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </label>
            <label>
              Energia
              <select
                value={draft.energy}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, energy: event.target.value as Energy }))
                }
              >
                <option value="leve">Leve</option>
                <option value="foco">Foco</option>
                <option value="profunda">Profunda</option>
              </select>
            </label>
          </div>
          <label>
            Habito
            <select
              value={draft.habitId ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, habitId: event.target.value }))}
            >
              <option value="">Nao contar em habito</option>
              {habits
                .filter((habit) => !isGithubHabit(habit))
                .map((habit) => (
                  <option key={habit.id} value={habit.id}>
                    {habit.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Projeto
            <input
              value={draft.project}
              onChange={(event) => setDraft((current) => ({ ...current, project: event.target.value }))}
              placeholder="Opcional"
            />
          </label>
          <button className="primary-button" type="submit">
            <Plus size={18} />
            Adicionar
          </button>
        </form>
      </section>

      <section className="panel">
        <PanelHeader icon={CalendarDays} title={formatDay(selectedDate, { day: '2-digit', month: 'long' })} />
        <div className="timeline">
          {tasks.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nada marcado" text="Crie blocos de foco ou tarefas soltas para este dia." />
          ) : (
            tasks.map((task) => (
              <TaskRow key={task.id} task={task} habits={habits} toggleTask={toggleTask} removeTask={removeTask} />
            ))
          )}
        </div>
      </section>

      <section className="panel upcoming-panel">
        <PanelHeader icon={MoreHorizontal} title="Proximos" />
        <div className="stack-list">
          {upcoming.length === 0 ? (
            <EmptyState icon={Check} title="Fila vazia" text="As proximas tarefas aparecem aqui." />
          ) : (
            upcoming.map((task) => (
              <div className="upcoming-item" key={task.id}>
                <strong>{task.title}</strong>
                <span>
                  {formatDay(task.date, { day: '2-digit', month: 'short' })}
                  {task.time ? `, ${task.time}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ReviewView({
  habits,
  tasks,
  weeklyData,
  selectedDate,
  bestStreak,
}: {
  habits: Habit[];
  tasks: Task[];
  weeklyData: Array<{ date: string; score: number }>;
  selectedDate: string;
  bestStreak: number;
}) {
  const lastThirty = rangeDays(30, selectedDate);
  const completedTasks = tasks.filter((task) => task.done).length;
  const highPriorityOpen = tasks.filter((task) => task.priority === 'alta' && !task.done).length;
  const habitCompletions = habits.reduce(
    (sum, habit) =>
      sum +
      lastThirty.filter((date) => habitIsDue(habit, date, tasks) && completionRatio(habit, date, tasks) >= 1)
        .length,
    0,
  );

  return (
    <div className="review-layout">
      <section className="metric-row wide">
        <Metric icon={Activity} label="Habitos ativos" value={`${habits.length}`} />
        <Metric icon={Check} label="Tarefas concluidas" value={`${completedTasks}`} />
        <Metric icon={Flame} label="Maior sequencia" value={`${bestStreak} dias`} />
        <Metric icon={Trophy} label="Concluidos em 30 dias" value={`${habitCompletions}`} />
      </section>

      <section className="panel chart-panel">
        <PanelHeader icon={BarChart3} title="Ultimos 7 dias" />
        <div className="bar-chart">
          {weeklyData.map((item) => (
            <div className="bar-column" key={item.date}>
              <div className="bar-track">
                <span style={{ height: `${Math.max(item.score, 3)}%` }} />
              </div>
              <strong>{item.score}%</strong>
              <small>{formatDay(item.date, { weekday: 'short' }).replace('.', '')}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel insights-panel">
        <PanelHeader icon={Sparkles} title="Leitura rapida" />
        <div className="insight-list">
          <p>
            Sua rotina tem <strong>{habits.length}</strong> habito{habits.length === 1 ? '' : 's'} ativo
            {habits.length === 1 ? '' : 's'} e <strong>{highPriorityOpen}</strong> tarefa
            {highPriorityOpen === 1 ? '' : 's'} de alta prioridade em aberto.
          </p>
          <p>
            A semana fechou com media de{' '}
            <strong>
              {weeklyData.length
                ? Math.round(weeklyData.reduce((sum, item) => sum + item.score, 0) / weeklyData.length)
                : 0}
              %
            </strong>{' '}
            nos habitos programados.
          </p>
        </div>
      </section>
    </div>
  );
}

function JournalView({
  entry,
  selectedDate,
  updateJournal,
}: {
  entry: JournalEntry;
  selectedDate: string;
  updateJournal: (patch: Partial<JournalEntry>) => void;
}) {
  return (
    <div className="journal-layout">
      <section className="panel journal-editor">
        <PanelHeader icon={NotebookPen} title={formatDay(selectedDate, { day: '2-digit', month: 'long' })} />
        <fieldset className="segmented">
          <legend>Humor</legend>
          {(['otimo', 'bom', 'neutro', 'baixo'] as Mood[]).map((mood) => (
            <button
              type="button"
              key={mood}
              className={entry.mood === mood ? 'active' : ''}
              onClick={() => updateJournal({ mood })}
            >
              {moodLabel(mood)}
            </button>
          ))}
        </fieldset>
        <label>
          Intencao
          <textarea
            value={entry.intention}
            onChange={(event) => updateJournal({ intention: event.target.value })}
            placeholder="Qual e a direcao de hoje?"
          />
        </label>
        <label>
          Vitoria
          <textarea
            value={entry.win}
            onChange={(event) => updateJournal({ win: event.target.value })}
            placeholder="O que vale registrar?"
          />
        </label>
        <label>
          Notas
          <textarea
            value={entry.notes}
            onChange={(event) => updateJournal({ notes: event.target.value })}
            placeholder="Pensamentos, ajustes e aprendizados"
          />
        </label>
      </section>
    </div>
  );
}

function SettingsView({
  state,
  setState,
  importBackup,
  exportBackup,
  githubToken,
  setGithubToken,
  githubSyncStatus,
  syncGithubActivity,
}: {
  state: AppState;
  setState: (state: AppState | ((current: AppState) => AppState)) => void;
  importBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  exportBackup: () => void;
  githubToken: string;
  setGithubToken: (token: string) => void;
  githubSyncStatus: GithubSyncStatus;
  syncGithubActivity: () => void;
}) {
  return (
    <div className="settings-layout">
      <section className="panel form-panel">
        <PanelHeader icon={Settings} title="Perfil" />
        <div className="form-grid">
          <label>
            Nome
            <input
              value={state.preferences.name}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  preferences: { ...current.preferences, name: event.target.value },
                }))
              }
            />
          </label>
          <label>
            Meta diaria de habitos
            <input
              type="number"
              min="1"
              value={state.preferences.dailyTarget}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  preferences: { ...current.preferences, dailyTarget: Number(event.target.value) },
                }))
              }
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={state.preferences.compactMode}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  preferences: { ...current.preferences, compactMode: event.target.checked },
                }))
              }
            />
            Modo compacto
          </label>
        </div>
      </section>

      <section className="panel form-panel">
        <PanelHeader icon={Sparkles} title="OpenAI" />
        <div className="form-grid">
          <p className="helper-copy">
            A IA agora roda pelo backend em `/api/ai`. No Vercel, configure `OPENAI_API_KEY` como
            variavel de ambiente e, se quiser trocar o modelo, configure `OPENAI_MODEL`.
          </p>
        </div>
      </section>

      <section className="panel form-panel">
        <PanelHeader icon={Github} title="GitHub" />
        <div className="form-grid">
          <label>
            Usuario
            <input
              value={state.preferences.githubUsername}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  preferences: { ...current.preferences, githubUsername: event.target.value },
                }))
              }
              placeholder="Ex.: WessYu"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <label>
            Token opcional
            <input
              type="password"
              value={githubToken}
              onChange={(event) => setGithubToken(event.target.value)}
              placeholder="github_pat_..."
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={syncGithubActivity}
            disabled={githubSyncStatus.state === 'syncing'}
          >
            <RefreshCw size={18} />
            {githubSyncStatus.state === 'syncing' ? 'Sincronizando' : 'Sincronizar GitHub'}
          </button>
          <div className={`sync-status ${githubSyncStatus.state}`}>
            <Github size={17} />
            <span>{githubSyncStatus.message}</span>
          </div>
          <p className="helper-copy">
            Sem token, o app usa eventos publicos recentes. Com token, ele busca o calendario anual de
            contribuicoes. O token fica apenas neste navegador e nao entra no backup.
          </p>
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={Download} title="Dados" />
        <div className="settings-actions">
          <button className="primary-button" type="button" onClick={exportBackup}>
            <Download size={18} />
            Exportar backup
          </button>
          <label className="file-button">
            <Import size={18} />
            Importar backup
            <input type="file" accept="application/json" onChange={importBackup} />
          </label>
          <button
            className="ghost-button danger-text"
            type="button"
            onClick={() => {
              if (window.confirm('Apagar todos os dados locais?')) {
                setState(initialState);
              }
            }}
          >
            <RefreshCw size={18} />
            Reiniciar app
          </button>
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={Sparkles} title="Recursos liberados" />
        <div className="feature-grid">
          {['Habitos ilimitados', 'Tarefas ilimitadas', 'Revisao completa', 'Diario livre', 'Backup JSON', 'Contas locais'].map(
            (feature) => (
              <div className="feature-item" key={feature}>
                <Check size={17} />
                <span>{feature}</span>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}

function HabitRow({
  habit,
  date,
  onIncrement,
  onDecrement,
  onComplete,
}: {
  habit: Habit;
  date: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onComplete: () => void;
}) {
  const current = habit.completions[date] ?? 0;
  const ratio = completionRatio(habit, date);
  const done = ratio >= 1;

  return (
    <div className={done ? 'habit-row done' : 'habit-row'}>
      <div className="habit-main">
        <span className="color-dot" style={{ background: habit.color }} />
        <div>
          <strong>{habit.title}</strong>
          <small>
            {current}/{habit.target} {habit.unit}
          </small>
        </div>
      </div>
      <div className="mini-progress" aria-hidden="true">
        <span style={{ width: `${ratio * 100}%`, background: habit.color }} />
      </div>
      <div className="row-actions">
        <button className="icon-button" type="button" onClick={onDecrement} title="Diminuir">
          <X size={16} />
        </button>
        <button className="icon-button" type="button" onClick={onIncrement} title="Adicionar progresso">
          <Plus size={16} />
        </button>
        <button className="icon-button success" type="button" onClick={onComplete} title="Concluir">
          <Check size={16} />
        </button>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  habits,
  toggleTask,
  removeTask,
}: {
  task: Task;
  habits: Habit[];
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
}) {
  const linkedHabit = habits.find((habit) => habit.id === task.habitId);

  return (
    <article className={task.done ? 'task-row done' : 'task-row'}>
      <button className="check-button" type="button" onClick={() => toggleTask(task.id)} title="Alternar tarefa">
        {task.done && <Check size={15} />}
      </button>
      <div>
        <strong>{task.title}</strong>
        <small>
          {task.time || 'Sem hora'} / {priorityLabel(task.priority)} / {energyLabel(task.energy)}
          {task.project ? ` / ${task.project}` : ''}
          {linkedHabit ? ` / ${linkedHabit.title}` : ''}
        </small>
      </div>
      <button className="icon-button danger" type="button" onClick={() => removeTask(task.id)} title="Excluir tarefa">
        <Trash2 size={16} />
      </button>
    </article>
  );
}

function Heatmap({ habit, endDate }: { habit: Habit; endDate: string }) {
  return (
    <div className="heatmap" aria-label={`Historico de ${habit.title}`}>
      {rangeDays(28, endDate).map((date) => {
        const ratio = completionRatio(habit, date);
        return (
          <span
            key={date}
            title={`${formatDay(date, { day: '2-digit', month: 'short' })}: ${Math.round(ratio * 100)}%`}
            style={{
              background:
                ratio >= 1
                  ? habit.color
                  : ratio > 0
                    ? `color-mix(in srgb, ${habit.color} ${Math.max(ratio * 70, 20)}%, #2b3432)`
                    : '#26302e',
            }}
          />
        );
      })}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Home; label: string; value: string }) {
  return (
    <article className="metric-card">
      <Icon size={19} />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
}: {
  icon: typeof Home;
  title: string;
  actionLabel?: string;
  actionIcon?: typeof Home;
  onAction?: () => void;
}) {
  return (
    <div className="panel-header">
      <div>
        <Icon size={18} />
        <h2>{title}</h2>
      </div>
      {onAction && actionLabel && (
        <button className="ghost-button" type="button" onClick={onAction}>
          {ActionIcon && <ActionIcon size={17} />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon: typeof Home;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <Icon size={26} />
      <strong>{title}</strong>
      <span>{text}</span>
      {onAction && actionLabel && (
        <button className="ghost-button" type="button" onClick={onAction}>
          <Plus size={17} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function frequencyLabel(frequency: Frequency) {
  const labels: Record<Frequency, string> = {
    daily: 'todos os dias',
    weekdays: 'dias uteis',
    custom: 'seg, qua e sex',
  };
  return labels[frequency];
}

function modeLabel(mode: HabitDisplayMode) {
  const labels: Record<HabitDisplayMode, string> = {
    single: 'Single',
    weekly: 'Weekly',
    yearly: 'Yearly',
  };
  return labels[mode];
}

function habitCompletionCount(habit: Habit) {
  return Object.values(habit.completions).filter((value) => value >= habit.target).length;
}

function priorityLabel(priority: Priority) {
  const labels: Record<Priority, string> = {
    baixa: 'Baixa',
    media: 'Media',
    alta: 'Alta',
  };
  return labels[priority];
}

function energyLabel(energy: Energy) {
  const labels: Record<Energy, string> = {
    leve: 'Leve',
    foco: 'Foco',
    profunda: 'Profunda',
  };
  return labels[energy];
}

function moodLabel(mood: Mood) {
  const labels: Record<Mood, string> = {
    otimo: 'Otimo',
    bom: 'Bom',
    neutro: 'Neutro',
    baixo: 'Baixo',
  };
  return labels[mood];
}

export default App;
