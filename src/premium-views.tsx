import {
  CalendarCheck2, CalendarDays, Camera, CircleUserRound, CheckCircle2, ChevronRight, Copy, Flame, Github,
  ListFilter, LoaderCircle, Pencil, Plus, RotateCcw, Save, Search, Share2, Target, Trash2, Users,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { apiRequest, type StatePayload, type UserPayload } from './premium-api';
import type { AppData, DaySummary, FixedTask, Friend, TaskDraft, User, ViewId } from './premium-types';
import { calculateStreak, encodeInvite, formatDate, monthKey, normalizeData } from './premium-utils';
import {
  AiPlanner, Avatar, CalendarHeatmap, EmptyState, ProgressRing, TaskCollection, TaskComposer, imageFileToAvatar,
  type TaskListItem, type ToastTone,
} from './premium-ui';

type TaskFilter = 'pending' | 'done' | 'all';

export function TodayView({
  selectedDate,
  selectedSummary,
  monthDays,
  items,
  data,
  token,
  notify,
  onSelectDate,
  onCreate,
  onToggle,
  onEdit,
  onRemove,
  onNavigate,
}: {
  selectedDate: string;
  selectedSummary: DaySummary;
  monthDays: DaySummary[];
  items: TaskListItem[];
  data: AppData;
  token: string;
  notify: (message: string, tone?: ToastTone) => void;
  onSelectDate: (date: string) => void;
  onCreate: (draft: TaskDraft) => void;
  onToggle: (item: TaskListItem) => void;
  onEdit: (item: TaskListItem) => void;
  onRemove: (item: TaskListItem) => void;
  onNavigate: (view: ViewId) => void;
}) {
  const completed = items.filter((item) => item.task.done).length;
  const pending = items.filter((item) => !item.task.done);
  const nextTask = pending[0];

  return (
    <div className="premium-dashboard-grid">
      <section className="terminal-frame premium-card premium-focus-card">
        <div className="premium-focus-header">
          <div>
            <span className="kicker">FOCO DO DIA</span>
            <h2>{pending.length ? `${pending.length} tarefa${pending.length > 1 ? 's' : ''} em aberto` : 'Dia concluído'}</h2>
            <p>{nextTask ? `Próximo passo: ${nextTask.task.title}` : 'Você terminou tudo que planejou para esta data.'}</p>
          </div>
          <ProgressRing completed={completed} total={items.length} />
        </div>
        <div className="premium-focus-stats">
          <div><strong>{completed}</strong><span>Concluídas</span></div>
          <div><strong>{pending.length}</strong><span>Pendentes</span></div>
          <div><strong>{selectedSummary.github}</strong><span>GitHub</span></div>
        </div>
        <TaskCollection
          items={items}
          friends={data.friends}
          emptyTitle="Nada planejado ainda"
          emptyDescription="Capture uma tarefa no painel ao lado e transforme a data em um dia intencional."
          onToggle={onToggle}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      </section>

      <aside className="premium-dashboard-rail">
        <section className="terminal-frame premium-card">
          <div className="premium-section-heading">
            <div><span className="kicker">CAPTURA RÁPIDA</span><h3>Adicionar ao dia</h3></div>
            <Plus size={19} />
          </div>
          <TaskComposer selectedDate={selectedDate} friends={data.friends} compact onSubmit={onCreate} />
          <button className="premium-text-action" type="button" onClick={() => onNavigate('tasks')}>
            Abrir planejamento completo <ChevronRight size={15} />
          </button>
        </section>

        <section className="terminal-frame premium-card">
          <div className="premium-section-heading">
            <div><span className="kicker">PRESENÇA</span><h3>{formatDate(`${monthKey(selectedDate)}-01`, { month: 'long', year: 'numeric' })}</h3></div>
            <CalendarDays size={19} />
          </div>
          <CalendarHeatmap days={monthDays} selectedDate={selectedDate} onSelect={onSelectDate} />
          <button className="premium-text-action" type="button" onClick={() => onNavigate('progress')}>
            Ver análise mensal <ChevronRight size={15} />
          </button>
        </section>

        <AiPlanner selectedDate={selectedDate} tasks={items.map((item) => item.task)} token={token} notify={notify} />
      </aside>
    </div>
  );
}

export function TasksView({
  selectedDate,
  items,
  friends,
  editing,
  presetFriendId,
  onCreateOrUpdate,
  onCancelEdit,
  onToggle,
  onEdit,
  onRemove,
}: {
  selectedDate: string;
  items: TaskListItem[];
  friends: Friend[];
  editing: TaskListItem | null;
  presetFriendId?: string;
  onCreateOrUpdate: (draft: TaskDraft, editing?: TaskListItem | null) => void;
  onCancelEdit: () => void;
  onToggle: (item: TaskListItem) => void;
  onEdit: (item: TaskListItem) => void;
  onRemove: (item: TaskListItem) => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>('pending');
  const [query, setQuery] = useState('');
  const counts = {
    pending: items.filter((item) => !item.task.done).length,
    done: items.filter((item) => item.task.done).length,
    all: items.length,
  };
  const visibleItems = items.filter((item) => {
    const matchesFilter = filter === 'all' || (filter === 'done' ? item.task.done : !item.task.done);
    const haystack = `${item.task.title} ${item.task.project || ''}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="premium-workspace-grid">
      <section className="terminal-frame premium-card premium-workspace-list">
        <div className="premium-workspace-header">
          <div><span className="kicker">WORKSPACE</span><h2>{formatDate(selectedDate, { day: '2-digit', month: 'long' })}</h2></div>
          <div className="premium-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tarefa ou projeto" aria-label="Buscar tarefas" />
          </div>
        </div>
        <div className="premium-filter-tabs" role="tablist" aria-label="Filtrar tarefas">
          {([
            ['pending', 'Pendentes'],
            ['done', 'Concluídas'],
            ['all', 'Todas'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'is-active' : undefined} onClick={() => setFilter(value)}>
              {label}<span>{counts[value]}</span>
            </button>
          ))}
        </div>
        <TaskCollection
          items={visibleItems}
          friends={friends}
          emptyTitle={query ? 'Nenhum resultado' : filter === 'pending' ? 'Tudo concluído' : 'Nenhuma tarefa aqui'}
          emptyDescription={query ? 'Tente outro termo de busca.' : 'Mude o filtro ou planeje uma nova tarefa.'}
          onToggle={onToggle}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      </section>

      <aside className="terminal-frame premium-card premium-sticky-composer">
        <div className="premium-section-heading">
          <div><span className="kicker">{editing ? 'EDIÇÃO' : 'PLANEJAMENTO'}</span><h3>{editing ? editing.task.title : 'Nova tarefa'}</h3></div>
          {editing ? <Pencil size={19} /> : <ListFilter size={19} />}
        </div>
        <TaskComposer selectedDate={selectedDate} friends={friends} editing={editing} presetFriendId={presetFriendId} onSubmit={onCreateOrUpdate} onCancelEdit={onCancelEdit} />
      </aside>
    </div>
  );
}

export function ProgressView({
  selectedDate,
  selectedSummary,
  monthDays,
  data,
  onSelectDate,
  onRemoveRoutine,
}: {
  selectedDate: string;
  selectedSummary: DaySummary;
  monthDays: DaySummary[];
  data: AppData;
  onSelectDate: (date: string) => void;
  onRemoveRoutine: (task: FixedTask) => void;
}) {
  const completed = monthDays.reduce((sum, day) => sum + day.completed, 0);
  const planned = monthDays.reduce((sum, day) => sum + day.planned, 0);
  const github = monthDays.reduce((sum, day) => sum + day.github, 0);
  const activeDays = monthDays.filter((day) => day.total > 0).length;
  const completionRate = planned ? Math.round((completed / planned) * 100) : 0;
  const streak = calculateStreak(monthDays);

  return (
    <div className="premium-progress-layout">
      <section className="terminal-frame premium-card premium-progress-main">
        <div className="premium-section-heading premium-section-heading--large">
          <div>
            <span className="kicker">ANÁLISE MENSAL</span>
            <h2>{formatDate(`${monthKey(selectedDate)}-01`, { month: 'long', year: 'numeric' })}</h2>
            <p>Consistência sem culpa: presença, execução e atividade de desenvolvimento.</p>
          </div>
          <CalendarCheck2 size={24} />
        </div>
        <CalendarHeatmap days={monthDays} selectedDate={selectedDate} onSelect={onSelectDate} />
        <div className="premium-selected-day">
          <div><span className="kicker">DATA SELECIONADA</span><strong>{formatDate(selectedDate, { weekday: 'long', day: '2-digit', month: 'long' })}</strong></div>
          <div className="premium-selected-day-metrics">
            <span><CheckCircle2 size={15} /> {selectedSummary.completed} concluídas</span>
            <span><Target size={15} /> {selectedSummary.planned} planejadas</span>
            <span><Github size={15} /> {selectedSummary.github} GitHub</span>
          </div>
        </div>
      </section>

      <aside className="premium-progress-rail">
        <section className="terminal-frame premium-card">
          <span className="kicker">PERFORMANCE</span>
          <div className="premium-stat-grid">
            <div><CheckCircle2 size={18} /><strong>{completed}</strong><span>Concluídas</span></div>
            <div><Target size={18} /><strong>{completionRate}%</strong><span>Taxa de entrega</span></div>
            <div><Flame size={18} /><strong>{streak}</strong><span>Sequência atual</span></div>
            <div><CalendarDays size={18} /><strong>{activeDays}</strong><span>Dias ativos</span></div>
            <div><Github size={18} /><strong>{github}</strong><span>Atividades GitHub</span></div>
            <div><RotateCcw size={18} /><strong>{data.fixedTasks.length}</strong><span>Rotinas</span></div>
          </div>
        </section>

        <section className="terminal-frame premium-card">
          <div className="premium-section-heading"><div><span className="kicker">ROTINAS</span><h3>Recorrentes</h3></div><RotateCcw size={18} /></div>
          <div className="premium-routine-list">
            {data.fixedTasks.map((task) => (
              <article key={task.id}>
                <div><strong>{task.title}</strong><span>{task.weekdays.length} dia(s) por semana · {task.time || 'Sem horário'}</span></div>
                <button type="button" onClick={() => onRemoveRoutine(task)} aria-label={`Excluir rotina ${task.title}`}><Trash2 size={15} /></button>
              </article>
            ))}
            {!data.fixedTasks.length && <EmptyState icon={<RotateCcw size={22} />} title="Sem rotinas" description="Crie uma tarefa recorrente no planejamento." />}
          </div>
        </section>
      </aside>
    </div>
  );
}

export function PeopleView({
  user,
  friends,
  onAddFriend,
  onRemoveFriend,
  onStartTask,
  notify,
}: {
  user: User;
  friends: Friend[];
  onAddFriend: (value: string) => void;
  onRemoveFriend: (friend: Friend) => void;
  onStartTask: (friend: Friend) => void;
  notify: (message: string, tone?: ToastTone) => void;
}) {
  const [value, setValue] = useState('');
  const invite = encodeInvite({ id: user.id, name: user.name, email: user.email, username: user.username, avatar: user.avatar });

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invite);
      notify('Convite copiado.', 'success');
    } catch {
      notify('Não foi possível copiar o convite.', 'error');
    }
  }

  async function shareInvite() {
    try {
      if (navigator.share) await navigator.share({ title: 'Convite Ritmo', text: `Me adiciona no Ritmo:\n\n${invite}` });
      else await copyInvite();
    } catch {
      // Fechar o compartilhamento não é um erro do produto.
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) return;
    onAddFriend(value);
    setValue('');
  }

  return (
    <div className="premium-people-layout">
      <aside className="terminal-frame premium-card premium-invite-card">
        <span className="kicker">SEU CONVITE</span>
        <h2>Trabalhe acompanhado.</h2>
        <p>Compartilhe seu código para conectar pessoas e marcar tarefas em conjunto.</p>
        <code>{invite.slice(0, 42)}…</code>
        <div className="premium-two-actions">
          <button className="outline-button" type="button" onClick={copyInvite}><Copy size={16} /> COPIAR</button>
          <button className="neo-primary" type="button" onClick={shareInvite}><Share2 size={16} /> ENVIAR</button>
        </div>
      </aside>

      <section className="terminal-frame premium-card premium-people-main">
        <div className="premium-section-heading premium-section-heading--large">
          <div><span className="kicker">REDE</span><h2>{friends.length} contato{friends.length === 1 ? '' : 's'}</h2></div>
          <Users size={24} />
        </div>
        <form className="premium-add-friend" onSubmit={submit}>
          <label className="premium-field"><span>Convite, email ou nome</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Cole ritmo://... ou digite um contato" /></label>
          <button className="neo-primary" type="submit"><Plus size={16} /> ADICIONAR</button>
        </form>
        <div className="premium-people-list">
          {friends.map((friend) => (
            <article key={friend.id}>
              <Avatar value={friend.avatar} name={friend.name} />
              <div><strong>{friend.name}</strong><span>{friend.email || (friend.status === 'accepted' ? 'Conta Ritmo conectada' : 'Contato local')}</span></div>
              <button className="outline-button" type="button" onClick={() => onStartTask(friend)}>CRIAR TAREFA</button>
              <button className="premium-icon-button is-danger" type="button" onClick={() => onRemoveFriend(friend)} aria-label={`Remover ${friend.name}`}><Trash2 size={16} /></button>
            </article>
          ))}
          {!friends.length && <EmptyState icon={<Users size={24} />} title="Sua rede está vazia" description="Adicione alguém por convite, email ou nome." />}
        </div>
      </section>
    </div>
  );
}

export function ProfileView({
  user,
  data,
  token,
  notify,
  onUserChange,
  onDataChange,
}: {
  user: User;
  data: AppData;
  token: string;
  notify: (message: string, tone?: ToastTone) => void;
  onUserChange: (user: User) => void;
  onDataChange: (updater: (current: AppData) => AppData) => void;
}) {
  const [draft, setDraft] = useState({
    name: user.name || '',
    username: user.username || '',
    bio: user.bio || '',
    avatar: user.avatar || '',
    githubUsername: data.github.username || '',
  });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setDraft({ name: user.name || '', username: user.username || '', bio: user.bio || '', avatar: user.avatar || '', githubUsername: data.github.username || '' });
  }, [user, data.github.username]);

  async function uploadPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const avatar = await imageFileToAvatar(file);
      setDraft((current) => ({ ...current, avatar }));
      notify('Foto pronta para salvar.', 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível carregar a foto.', 'error');
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = await apiRequest<UserPayload>('/api/profile', { method: 'PUT', token, body: JSON.stringify(draft) });
      onUserChange(payload.user);
      onDataChange((current) => ({ ...current, github: { ...current.github, username: draft.githubUsername.trim() } }));
      notify('Perfil atualizado.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function syncGithub() {
    if (!draft.githubUsername.trim()) return notify('Informe seu usuário do GitHub.', 'error');
    setSyncing(true);
    try {
      const payload = await apiRequest<StatePayload & { github?: { total?: number; days?: number } }>('/api/github', {
        method: 'POST', token, body: JSON.stringify({ username: draft.githubUsername.trim() }),
      });
      onDataChange(() => normalizeData(payload.state));
      notify(`GitHub sincronizado${payload.github?.total !== undefined ? `: ${payload.github.total} atividade(s)` : ''}.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível sincronizar o GitHub.', 'error');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="premium-profile-layout">
      <aside className="terminal-frame premium-card premium-profile-summary">
        <Avatar value={draft.avatar} name={draft.name} size="large" />
        <span className="kicker">CONTA RITMO</span>
        <h2>{user.name}</h2>
        <p>@{user.username}</p>
        <p className="premium-profile-bio">{user.bio || 'Sem bio ainda.'}</p>
        <div className="premium-profile-stats">
          <div><strong>{data.tasks.length}</strong><span>Tarefas</span></div>
          <div><strong>{data.fixedTasks.length}</strong><span>Rotinas</span></div>
          <div><strong>{data.friends.length}</strong><span>Amigos</span></div>
        </div>
      </aside>

      <form className="terminal-frame premium-card premium-profile-form" onSubmit={saveProfile}>
        <div className="premium-section-heading premium-section-heading--large">
          <div><span className="kicker">CONFIGURAÇÕES</span><h2>Editar perfil</h2></div>
          <CircleUserRound size={24} />
        </div>
        <div className="premium-photo-control">
          <Avatar value={draft.avatar} name={draft.name} size="large" />
          <label className="outline-button premium-upload-button"><Camera size={16} /> TROCAR FOTO<input type="file" accept="image/*" onChange={uploadPhoto} /></label>
        </div>
        <div className="premium-form-grid">
          <label className="premium-field"><span>Nome</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="premium-field"><span>Usuário</span><input value={draft.username} onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))} /></label>
        </div>
        <label className="premium-field"><span>Bio</span><textarea value={draft.bio} maxLength={180} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} /></label>
        <label className="premium-field"><span>GitHub</span><input value={draft.githubUsername} onChange={(event) => setDraft((current) => ({ ...current, githubUsername: event.target.value }))} placeholder="WessYu" /></label>
        <div className="premium-two-actions">
          <button className="neo-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="premium-spin" size={16} /> : <Save size={16} />}{saving ? 'SALVANDO' : 'SALVAR PERFIL'}</button>
          <button className="outline-button" type="button" onClick={syncGithub} disabled={syncing}>{syncing ? <LoaderCircle className="premium-spin" size={16} /> : <Github size={16} />}{syncing ? 'SINCRONIZANDO' : 'SINCRONIZAR GITHUB'}</button>
        </div>
      </form>
    </div>
  );
}
