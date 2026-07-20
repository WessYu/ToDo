import { ChevronLeft, ChevronRight, CircleUserRound, Home, LayoutList, LoaderCircle, LogOut, TrendingUp, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, type AuthPayload, type StatePayload, type UserPayload } from './premium-api';
import type { AppData, FixedTask, Friend, SaveStatus, Task, TaskDraft, User, ViewId } from './premium-types';
import {
  EMPTY_DATA, TOKEN_KEY, addDays, buildMonthPresence, createId, fixedIsPlanned, formatDate,
  initials, isoDate, normalizeData, parseInvite, sortTasks,
} from './premium-utils';
import { AuthScreen, Avatar, SaveIndicator, Toast, type TaskListItem, type ToastState, type ToastTone } from './premium-ui';
import { PeopleView, ProfileView, ProgressView, TasksView, TodayView } from './premium-views';

interface NavItem { id: ViewId; label: string; icon: typeof Home; }
const NAV_ITEMS: NavItem[] = [
  { id: 'today', label: 'Hoje', icon: Home },
  { id: 'tasks', label: 'Tarefas', icon: LayoutList },
  { id: 'progress', label: 'Progresso', icon: TrendingUp },
  { id: 'people', label: 'Amigos', icon: Users },
  { id: 'profile', label: 'Perfil', icon: CircleUserRound },
];

export default function AppPremium() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [view, setView] = useState<ViewId>('today');
  const [selectedDate, setSelectedDate] = useState(isoDate());
  const [booting, setBooting] = useState(Boolean(token));
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editing, setEditing] = useState<TaskListItem | null>(null);
  const [presetFriendId, setPresetFriendId] = useState<string>();
  const lastSavedRef = useRef('');

  function notify(message: string, tone: ToastTone = 'info') {
    setToast({ message, tone });
  }

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return undefined;
    }
    let cancelled = false;
    async function boot() {
      setBooting(true);
      try {
        const [me, state] = await Promise.all([
          apiRequest<UserPayload>('/api/me', { token }),
          apiRequest<StatePayload>('/api/state', { token }),
        ]);
        if (cancelled) return;
        const normalized = normalizeData(state.state);
        setUser(me.user);
        setData(normalized);
        lastSavedRef.current = JSON.stringify(normalized);
        setHydrated(true);
        setSaveStatus('saved');
      } catch (error) {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setUser(null);
        notify(error instanceof Error ? error.message : 'Sua sessão expirou.', 'error');
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token || !hydrated || !user) return undefined;
    const serialized = JSON.stringify(data);
    if (serialized === lastSavedRef.current) return undefined;
    setSaveStatus('saving');
    const timer = window.setTimeout(async () => {
      try {
        const payload = await apiRequest<StatePayload>('/api/state', {
          method: 'PUT',
          token,
          body: JSON.stringify({ state: data }),
        });
        const normalized = normalizeData(payload.state);
        lastSavedRef.current = JSON.stringify(normalized);
        setSaveStatus('saved');
      } catch (error) {
        setSaveStatus('error');
        notify(error instanceof Error ? error.message : 'Não foi possível salvar seus dados.', 'error');
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [data, hydrated, token, user]);

  const monthDays = useMemo(() => buildMonthPresence(data, selectedDate), [data, selectedDate]);
  const selectedSummary = monthDays.find((day) => day.iso === selectedDate) || {
    iso: selectedDate, planned: 0, completed: 0, github: 0, total: 0, level: 0, today: false,
  };

  const taskItems = useMemo<TaskListItem[]>(() => {
    const recurring = data.fixedTasks
      .filter((task) => fixedIsPlanned(task, selectedDate))
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
          sharedWith: fixedTask.sharedWith || [],
        };
        return { key: `fixed-${fixedTask.id}`, task, fixedTask, recurring: true, synthetic: !existing };
      });
    const oneOff = data.tasks
      .filter((task) => task.date === selectedDate && !task.fixedTaskId)
      .map((task) => ({ key: `task-${task.id}`, task, recurring: false }));
    const all = [...recurring, ...oneOff];
    return sortTasks(all.map((item) => item.task)).map((task) =>
      all.find((item) => item.task.id === task.id && item.task.fixedTaskId === task.fixedTaskId) as TaskListItem,
    );
  }, [data.fixedTasks, data.tasks, selectedDate]);

  function handleAuthenticated(payload: AuthPayload) {
    const normalized = normalizeData(payload.state);
    localStorage.setItem(TOKEN_KEY, payload.token);
    setToken(payload.token);
    setUser(payload.user);
    setData(normalized);
    lastSavedRef.current = JSON.stringify(normalized);
    setHydrated(true);
    setSaveStatus('saved');
  }

  async function logout() {
    try {
      await apiRequest('/api/logout', { method: 'POST', token });
    } catch {
      // O logout local continua válido mesmo se o backend estiver indisponível.
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
    setData(EMPTY_DATA);
    setHydrated(false);
    setView('today');
  }

  function createOrUpdateTask(draft: TaskDraft, item?: TaskListItem | null) {
    const now = new Date().toISOString();
    if (item) {
      if (item.recurring && item.fixedTask) {
        setData((current) => ({
          ...current,
          fixedTasks: current.fixedTasks.map((task) => task.id === item.fixedTask?.id ? {
            ...task,
            title: draft.title,
            time: draft.time,
            priority: draft.priority,
            project: draft.project,
            weekdays: draft.weekdays.length ? draft.weekdays : task.weekdays,
            sharedWith: draft.sharedWith,
          } : task),
          tasks: current.tasks.map((task) => task.fixedTaskId === item.fixedTask?.id ? {
            ...task,
            title: draft.title,
            time: draft.time,
            priority: draft.priority,
            project: draft.project,
            sharedWith: draft.sharedWith,
          } : task),
        }));
      } else {
        setData((current) => ({
          ...current,
          tasks: current.tasks.map((task) => task.id === item.task.id ? {
            ...task,
            title: draft.title,
            date: selectedDate,
            time: draft.time,
            priority: draft.priority,
            project: draft.project,
            sharedWith: draft.sharedWith,
          } : task),
        }));
      }
      setEditing(null);
      notify('Tarefa atualizada.', 'success');
      return;
    }

    if (draft.recurring) {
      const fixedTask: FixedTask = {
        id: createId('fixed'), title: draft.title, time: draft.time, priority: draft.priority,
        project: draft.project, weekdays: draft.weekdays.length ? draft.weekdays : [0, 1, 2, 3, 4, 5, 6],
        sharedWith: draft.sharedWith, active: true, createdAt: now,
      };
      setData((current) => ({ ...current, fixedTasks: [fixedTask, ...current.fixedTasks] }));
    } else {
      const task: Task = {
        id: createId('task'), title: draft.title, date: selectedDate, time: draft.time,
        priority: draft.priority, project: draft.project, done: false,
        sharedWith: draft.sharedWith, createdAt: now,
      };
      setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    }
    setPresetFriendId(undefined);
    notify('Tarefa adicionada.', 'success');
  }

  function toggleTask(item: TaskListItem) {
    if (!item.recurring) {
      setData((current) => ({
        ...current,
        tasks: current.tasks.map((task) => task.id === item.task.id ? {
          ...task, done: !task.done, completedAt: !task.done ? new Date().toISOString() : undefined,
        } : task),
      }));
      return;
    }

    const existing = data.tasks.find((task) => task.date === selectedDate && task.fixedTaskId === item.fixedTask?.id);
    if (existing) {
      setData((current) => ({
        ...current,
        tasks: current.tasks.map((task) => task.id === existing.id ? {
          ...task, done: !task.done, completedAt: !task.done ? new Date().toISOString() : undefined,
        } : task),
      }));
      return;
    }

    const instance: Task = {
      ...item.task,
      id: createId('task'),
      fixedTaskId: item.fixedTask?.id,
      date: selectedDate,
      done: true,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, tasks: [instance, ...current.tasks] }));
  }

  function removeTask(item: TaskListItem) {
    const message = item.recurring
      ? `Excluir a rotina “${item.task.title}” e todo o histórico dela?`
      : `Excluir a tarefa “${item.task.title}”?`;
    if (!window.confirm(message)) return;

    if (item.recurring && item.fixedTask) {
      setData((current) => ({
        ...current,
        fixedTasks: current.fixedTasks.filter((task) => task.id !== item.fixedTask?.id),
        tasks: current.tasks.filter((task) => task.fixedTaskId !== item.fixedTask?.id),
      }));
    } else {
      setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== item.task.id) }));
    }
    if (editing?.key === item.key) setEditing(null);
    notify('Tarefa removida.', 'info');
  }

  function removeRoutine(task: FixedTask) {
    removeTask({
      key: `fixed-${task.id}`,
      recurring: true,
      fixedTask: task,
      task: {
        id: task.id, fixedTaskId: task.id, title: task.title, date: selectedDate,
        time: task.time, priority: task.priority, project: task.project,
        sharedWith: task.sharedWith, done: false,
      },
    });
  }

  function addFriend(value: string) {
    const clean = value.trim();
    const invite = parseInvite(clean);
    const emailMatch = clean.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    const email = invite?.email || emailMatch?.[0].toLowerCase() || '';
    const name = invite?.name || clean.replace(emailMatch?.[0] || '', '').replace(/[<>()]/g, '').trim() || email.split('@')[0] || clean;
    const accountId = invite?.id;

    if (email === user?.email || accountId === user?.id) return notify('Esse convite pertence à sua própria conta.', 'error');
    const exists = data.friends.some((friend) =>
      (accountId && friend.accountId === accountId) ||
      (email && friend.email?.toLowerCase() === email) ||
      friend.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (exists) return notify('Esse contato já está na sua lista.', 'error');

    const newFriend: Friend = {
      id: createId('friend'), accountId, name, email,
      avatar: invite?.avatar || initials(name),
      status: invite ? 'accepted' : 'manual',
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, friends: [newFriend, ...current.friends] }));
    notify(invite ? 'Convite aceito.' : 'Contato adicionado.', 'success');
  }

  function removeFriend(friend: Friend) {
    if (!window.confirm(`Remover ${friend.name} da sua lista?`)) return;
    setData((current) => ({
      ...current,
      friends: current.friends.filter((item) => item.id !== friend.id),
      tasks: current.tasks.map((task) => ({ ...task, sharedWith: (task.sharedWith || []).filter((id) => id !== friend.id) })),
      fixedTasks: current.fixedTasks.map((task) => ({ ...task, sharedWith: (task.sharedWith || []).filter((id) => id !== friend.id) })),
    }));
    notify('Contato removido.', 'info');
  }

  function startTaskWithFriend(friend: Friend) {
    setPresetFriendId(friend.id);
    setEditing(null);
    setView('tasks');
    notify(`${friend.name} já está selecionado na nova tarefa.`, 'info');
  }

  if (booting) {
    return (
      <main className="neo-auth premium-boot">
        <section className="terminal-frame auth-frame">
          <LoaderCircle className="premium-spin" size={26} />
          <span className="kicker">SINCRONIZANDO CONTA</span>
          <h1>Preparando seu espaço.</h1>
        </section>
      </main>
    );
  }

  if (!token || !user) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  const currentNav = NAV_ITEMS.find((item) => item.id === view) || NAV_ITEMS[0];
  const greeting = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const pageTitle = view === 'today' ? `${greeting}, ${user.name.split(' ')[0]}` : currentNav.label;

  return (
    <div className="premium-shell">
      <aside className="premium-sidebar terminal-frame">
        <div className="premium-sidebar-brand">
          <span className="premium-brand-mark">R</span>
          <div><strong>Ritmo</strong><small>@{user.username}</small></div>
        </div>
        <nav className="premium-nav" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={view === item.id ? 'is-active' : undefined} onClick={() => setView(item.id)}>
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="premium-sidebar-account">
          <Avatar value={user.avatar} name={user.name} size="small" />
          <div><strong>{user.name}</strong><span>{user.email}</span></div>
        </div>
        <button className="premium-logout" type="button" onClick={logout}><LogOut size={17} /> Sair</button>
      </aside>

      <main className="premium-main">
        <header className="premium-topbar">
          <div className="premium-page-title">
            <span className="kicker">{formatDate(selectedDate, { weekday: 'long', day: '2-digit', month: 'long' })}</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="premium-topbar-actions">
            <SaveIndicator status={saveStatus} />
            <div className="premium-date-control">
              <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, -1))} aria-label="Dia anterior"><ChevronLeft size={18} /></button>
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Data selecionada" />
              <button type="button" onClick={() => setSelectedDate(addDays(selectedDate, 1))} aria-label="Próximo dia"><ChevronRight size={18} /></button>
            </div>
          </div>
        </header>

        {view === 'today' && (
          <TodayView
            selectedDate={selectedDate}
            selectedSummary={selectedSummary}
            monthDays={monthDays}
            items={taskItems}
            data={data}
            token={token}
            notify={notify}
            onSelectDate={setSelectedDate}
            onCreate={(draft) => createOrUpdateTask(draft)}
            onToggle={toggleTask}
            onEdit={(item) => { setEditing(item); setView('tasks'); }}
            onRemove={removeTask}
            onNavigate={setView}
          />
        )}
        {view === 'tasks' && (
          <TasksView
            selectedDate={selectedDate}
            items={taskItems}
            friends={data.friends}
            editing={editing}
            presetFriendId={presetFriendId}
            onCreateOrUpdate={createOrUpdateTask}
            onCancelEdit={() => setEditing(null)}
            onToggle={toggleTask}
            onEdit={setEditing}
            onRemove={removeTask}
          />
        )}
        {view === 'progress' && (
          <ProgressView
            selectedDate={selectedDate}
            selectedSummary={selectedSummary}
            monthDays={monthDays}
            data={data}
            onSelectDate={setSelectedDate}
            onRemoveRoutine={removeRoutine}
          />
        )}
        {view === 'people' && (
          <PeopleView
            user={user}
            friends={data.friends}
            onAddFriend={addFriend}
            onRemoveFriend={removeFriend}
            onStartTask={startTaskWithFriend}
            notify={notify}
          />
        )}
        {view === 'profile' && (
          <ProfileView
            user={user}
            data={data}
            token={token}
            notify={notify}
            onUserChange={setUser}
            onDataChange={setData}
          />
        )}
      </main>

      <nav className="premium-mobile-nav" aria-label="Navegação mobile">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" className={view === item.id ? 'is-active' : undefined} onClick={() => setView(item.id)}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
