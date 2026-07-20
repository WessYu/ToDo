import {
  Check, CheckCircle2, Circle, Clock3, LoaderCircle, Pencil, Plus, RotateCcw, Save, Sparkles, Target, Trash2, Users, X,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { apiRequest, type AuthPayload } from './premium-api';
import type { DaySummary, FixedTask, Friend, Priority, SaveStatus, Task, TaskDraft } from './premium-types';
import { WEEKDAYS, formatDate, initials, priorityLabel } from './premium-utils';

export type ToastTone = 'success' | 'error' | 'info';
export interface ToastState { message: string; tone: ToastTone; }
export interface TaskListItem {
  key: string;
  task: Task;
  recurring: boolean;
  fixedTask?: FixedTask;
  synthetic?: boolean;
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function isImageAvatar(value?: string): boolean {
  return Boolean(value?.startsWith('data:image/'));
}

export async function imageFileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 8 * 1024 * 1024) throw new Error('A imagem precisa ter menos de 8 MB.');

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Imagem inválida.'));
    image.onload = () => {
      const size = 320;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Seu navegador não conseguiu processar a imagem.'));

      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.fillStyle = '#050403';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.src = source;
  });
}

export function Avatar({ value, name, size = 'medium' }: { value?: string; name: string; size?: 'small' | 'medium' | 'large' }) {
  return (
    <span className={classNames('premium-avatar', `premium-avatar--${size}`)} aria-hidden="true">
      {isImageAvatar(value) ? <img src={value} alt="" /> : <span>{value?.trim().slice(0, 2).toUpperCase() || initials(name)}</span>}
    </span>
  );
}

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (payload: AuthPayload) => void }) {
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
      const payload = await apiRequest<AuthPayload>('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ mode, name, email, password }),
      });
      onAuthenticated(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="neo-auth premium-auth">
      <section className="terminal-frame auth-frame premium-auth-card">
        <div className="premium-auth-brand">
          <span className="premium-brand-mark">R</span>
          <div>
            <span className="kicker">RITMO OS</span>
            <strong>Seu sistema de foco.</strong>
          </div>
        </div>
        <div className="premium-auth-copy">
          <span className="kicker">{mode === 'login' ? 'ACESSAR CONTA' : 'CRIAR CONTA'}</span>
          <h1>{mode === 'login' ? 'Volte ao ritmo.' : 'Comece com clareza.'}</h1>
          <p>Tarefas, rotinas, presença e GitHub em um espaço pessoal feito para executar.</p>
        </div>
        <form className="neo-form" onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Nome
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="neo-primary premium-full-button" type="submit" disabled={loading}>
            {loading && <LoaderCircle className="premium-spin" size={17} />}
            {loading ? 'PROCESSANDO' : mode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}
          </button>
        </form>
        <button
          className="link-button"
          type="button"
          onClick={() => {
            setMode((current) => (current === 'login' ? 'register' : 'login'));
            setError('');
          }}
        >
          {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho uma conta'}
        </button>
      </section>
    </main>
  );
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const content = {
    idle: { icon: Save, label: 'Sincronizado' },
    saving: { icon: LoaderCircle, label: 'Salvando' },
    saved: { icon: Check, label: 'Salvo' },
    error: { icon: RotateCcw, label: 'Falha ao salvar' },
  }[status];
  const Icon = content.icon;
  return (
    <span className={classNames('premium-save-status', `is-${status}`)} aria-live="polite">
      <Icon size={14} className={status === 'saving' ? 'premium-spin' : undefined} />
      {content.label}
    </span>
  );
}

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  return (
    <div className={classNames('premium-toast', `is-${toast.tone}`)} role={toast.tone === 'error' ? 'alert' : 'status'}>
      <span>{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="Fechar aviso"><X size={16} /></button>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="premium-empty">
      <span className="premium-empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="premium-progress-ring" style={{ '--progress': `${percentage * 3.6}deg` } as React.CSSProperties}>
      <div>
        <strong>{percentage}%</strong>
        <span>concluído</span>
      </div>
    </div>
  );
}

export function CalendarHeatmap({ days, selectedDate, onSelect }: { days: DaySummary[]; selectedDate: string; onSelect: (date: string) => void }) {
  const blanks = days.length ? new Date(`${days[0].iso}T12:00:00`).getDay() : 0;
  return (
    <div className="premium-calendar" aria-label="Calendário de presença mensal">
      <div className="premium-calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((day) => <span key={day.value}>{day.short}</span>)}
      </div>
      <div className="premium-calendar-grid">
        {Array.from({ length: blanks }, (_, index) => <span className="premium-calendar-cell is-empty" key={`blank-${index}`} />)}
        {days.map((day) => (
          <button
            key={day.iso}
            type="button"
            className={classNames(
              'premium-calendar-cell',
              `level-${day.level}`,
              day.iso === selectedDate && 'is-selected',
              day.today && 'is-today',
            )}
            onClick={() => onSelect(day.iso)}
            aria-label={`${formatDate(day.iso, { day: '2-digit', month: 'long' })}: ${day.completed} concluídas, ${day.planned} planejadas e ${day.github} atividades no GitHub`}
            title={`${day.completed}/${day.planned} tarefas · ${day.github} GitHub`}
          />
        ))}
      </div>
    </div>
  );
}

export function TaskComposer({
  selectedDate,
  friends,
  editing,
  presetFriendId,
  compact = false,
  onSubmit,
  onCancelEdit,
}: {
  selectedDate: string;
  friends: Friend[];
  editing?: TaskListItem | null;
  presetFriendId?: string;
  compact?: boolean;
  onSubmit: (draft: TaskDraft, editing?: TaskListItem | null) => void;
  onCancelEdit?: () => void;
}) {
  const defaultDraft = (): TaskDraft => ({
    title: '',
    date: selectedDate,
    time: '',
    priority: 'media',
    project: '',
    recurring: false,
    weekdays: [1, 2, 3, 4, 5],
    sharedWith: presetFriendId ? [presetFriendId] : [],
  });
  const [draft, setDraft] = useState<TaskDraft>(defaultDraft);

  useEffect(() => {
    if (editing) {
      setDraft({
        title: editing.task.title,
        date: editing.task.date || selectedDate,
        time: editing.task.time || '',
        priority: editing.task.priority,
        project: editing.task.project || '',
        recurring: editing.recurring,
        weekdays: editing.fixedTask?.weekdays || [1, 2, 3, 4, 5],
        sharedWith: editing.task.sharedWith || editing.fixedTask?.sharedWith || [],
      });
      return;
    }
    setDraft((current) => ({ ...defaultDraft(), sharedWith: presetFriendId ? [presetFriendId] : current.sharedWith }));
  }, [editing?.key, presetFriendId, selectedDate]);

  function update<Key extends keyof TaskDraft>(key: Key, value: TaskDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    onSubmit({ ...draft, title: draft.title.trim(), project: draft.project.trim(), date: selectedDate }, editing);
    setDraft(defaultDraft());
  }

  return (
    <form className={classNames('premium-composer', compact && 'is-compact')} onSubmit={submit}>
      <label className="premium-field premium-field--title">
        <span>{editing ? 'Editar tarefa' : compact ? 'Captura rápida' : 'Nova tarefa'}</span>
        <input
          value={draft.title}
          onChange={(event) => update('title', event.target.value)}
          placeholder="O que precisa ser feito?"
          autoFocus={Boolean(editing)}
        />
      </label>
      {!compact && (
        <>
          <div className="premium-form-grid">
            <label className="premium-field">
              <span>Horário</span>
              <input type="time" value={draft.time} onChange={(event) => update('time', event.target.value)} />
            </label>
            <label className="premium-field">
              <span>Prioridade</span>
              <select value={draft.priority} onChange={(event) => update('priority', event.target.value as Priority)}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </label>
          </div>
          <label className="premium-field">
            <span>Projeto</span>
            <input value={draft.project} onChange={(event) => update('project', event.target.value)} placeholder="Ex.: Portfólio" />
          </label>
          {friends.length > 0 && (
            <fieldset className="premium-fieldset">
              <legend>Compartilhar com</legend>
              <div className="premium-friend-chips">
                {friends.map((friend) => {
                  const active = draft.sharedWith.includes(friend.id);
                  return (
                    <button
                      key={friend.id}
                      type="button"
                      className={active ? 'is-active' : undefined}
                      onClick={() => update('sharedWith', active ? draft.sharedWith.filter((id) => id !== friend.id) : [...draft.sharedWith, friend.id])}
                      aria-pressed={active}
                    >
                      <Avatar value={friend.avatar} name={friend.name} size="small" />
                      {friend.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <label className="premium-switch">
            <input type="checkbox" checked={draft.recurring} onChange={(event) => update('recurring', event.target.checked)} />
            <span aria-hidden="true" />
            Repetir semanalmente
          </label>
          {draft.recurring && (
            <fieldset className="premium-fieldset">
              <legend>Dias da semana</legend>
              <div className="premium-weekdays">
                {WEEKDAYS.map((day) => {
                  const active = draft.weekdays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      className={active ? 'is-active' : undefined}
                      onClick={() => update('weekdays', active ? draft.weekdays.filter((value) => value !== day.value) : [...draft.weekdays, day.value].sort())}
                      aria-pressed={active}
                      title={day.label}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </>
      )}
      <div className="premium-composer-actions">
        {editing && onCancelEdit && (
          <button className="outline-button" type="button" onClick={onCancelEdit}>CANCELAR</button>
        )}
        <button className="neo-primary" type="submit">
          {editing ? <Save size={16} /> : <Plus size={16} />}
          {editing ? 'SALVAR ALTERAÇÕES' : compact ? 'ADICIONAR' : 'CRIAR TAREFA'}
        </button>
      </div>
    </form>
  );
}

function TaskItem({
  item,
  friends,
  onToggle,
  onEdit,
  onRemove,
}: {
  item: TaskListItem;
  friends: Friend[];
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const sharedNames = (item.task.sharedWith || item.fixedTask?.sharedWith || [])
    .map((friendId) => friends.find((friend) => friend.id === friendId)?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <article className={classNames('premium-task', item.task.done && 'is-done')}>
      <button
        className="premium-task-check"
        type="button"
        onClick={onToggle}
        aria-label={item.task.done ? `Marcar ${item.task.title} como pendente` : `Concluir ${item.task.title}`}
      >
        {item.task.done ? <Check size={17} /> : <Circle size={17} />}
      </button>
      <button className="premium-task-content" type="button" onClick={onToggle}>
        <span className="premium-task-title-row">
          <strong>{item.task.title}</strong>
          {item.recurring && <span className="premium-badge">ROTINA</span>}
          <span className={classNames('premium-priority', `is-${item.task.priority}`)}>{priorityLabel(item.task.priority)}</span>
        </span>
        <span className="premium-task-meta">
          <span><Clock3 size={13} /> {item.task.time || 'Sem horário'}</span>
          {item.task.project && <span><Target size={13} /> {item.task.project}</span>}
          {sharedNames && <span><Users size={13} /> {sharedNames}</span>}
        </span>
      </button>
      <div className="premium-task-actions">
        <button type="button" onClick={onEdit} aria-label={`Editar ${item.task.title}`}><Pencil size={15} /></button>
        <button type="button" onClick={onRemove} aria-label={`Excluir ${item.task.title}`}><Trash2 size={15} /></button>
      </div>
    </article>
  );
}

export function TaskCollection({
  items,
  friends,
  emptyTitle,
  emptyDescription,
  onToggle,
  onEdit,
  onRemove,
}: {
  items: TaskListItem[];
  friends: Friend[];
  emptyTitle: string;
  emptyDescription: string;
  onToggle: (item: TaskListItem) => void;
  onEdit: (item: TaskListItem) => void;
  onRemove: (item: TaskListItem) => void;
}) {
  if (!items.length) {
    return <EmptyState icon={<CheckCircle2 size={24} />} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="premium-task-list">
      {items.map((item) => (
        <TaskItem
          key={item.key}
          item={item}
          friends={friends}
          onToggle={() => onToggle(item)}
          onEdit={() => onEdit(item)}
          onRemove={() => onRemove(item)}
        />
      ))}
    </div>
  );
}

export function AiPlanner({
  selectedDate,
  tasks,
  token,
  notify,
}: {
  selectedDate: string;
  tasks: Task[];
  token: string;
  notify: (message: string, tone?: ToastTone) => void;
}) {
  const [prompt, setPrompt] = useState('Monte um plano realista para eu concluir o que importa hoje.');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  async function ask() {
    setLoading(true);
    try {
      const payload = await apiRequest<{ answer: string }>('/api/ai', {
        method: 'POST',
        token,
        body: JSON.stringify({ prompt, date: selectedDate, tasks }),
      });
      setAnswer(payload.answer);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'A IA não respondeu agora.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="terminal-frame premium-card premium-ai-card">
      <div className="premium-section-heading">
        <div>
          <span className="kicker">COPILOTO</span>
          <h3>Planejamento inteligente</h3>
        </div>
        <Sparkles size={19} />
      </div>
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Pedido para a inteligência artificial" />
      <button className="outline-button premium-full-button" type="button" onClick={ask} disabled={loading || !prompt.trim()}>
        {loading ? <LoaderCircle className="premium-spin" size={16} /> : <Sparkles size={16} />}
        {loading ? 'PLANEJANDO' : 'GERAR PLANO'}
      </button>
      {answer && <div className="premium-ai-answer">{answer}</div>}
    </section>
  );
}
