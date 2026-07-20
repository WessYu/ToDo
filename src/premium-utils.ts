import type { AppData, DaySummary, FixedTask, Priority, Task } from './premium-types';

export const TOKEN_KEY = 'ritmo-presence-token-v1';

export const EMPTY_DATA: AppData = {
  tasks: [],
  fixedTasks: [],
  journal: {},
  github: { username: '', events: {}, syncedAt: '' },
  friends: [],
};

export const WEEKDAYS = [
  { value: 0, short: 'D', label: 'Domingo' },
  { value: 1, short: 'S', label: 'Segunda-feira' },
  { value: 2, short: 'T', label: 'Terça-feira' },
  { value: 3, short: 'Q', label: 'Quarta-feira' },
  { value: 4, short: 'Q', label: 'Quinta-feira' },
  { value: 5, short: 'S', label: 'Sexta-feira' },
  { value: 6, short: 'S', label: 'Sábado' },
] as const;

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(value: string, amount: number): string {
  const next = parseIso(value);
  next.setDate(next.getDate() + amount);
  return isoDate(next);
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-BR', options).format(parseIso(value));
}

export function monthKey(value: string): string {
  return value.slice(0, 7);
}

export function monthDays(anchorDate: string): string[] {
  const anchor = parseIso(anchorDate);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const total = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return Array.from({ length: total }, (_, index) => isoDate(new Date(first.getFullYear(), first.getMonth(), index + 1)));
}

export function fixedIsPlanned(task: FixedTask, date: string): boolean {
  return task.active && task.weekdays.includes(parseIso(date).getDay());
}

export function priorityLabel(priority: Priority): string {
  return { baixa: 'Baixa', media: 'Média', alta: 'Alta' }[priority];
}

export function priorityRank(priority: Priority): number {
  return { alta: 0, media: 1, baixa: 2 }[priority];
}

export function normalizeData(raw: Partial<AppData> | null | undefined): AppData {
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

export function buildMonthPresence(data: AppData, selectedDate: string): DaySummary[] {
  const today = isoDate();
  return monthDays(selectedDate).map((date) => {
    const oneOffPlanned = data.tasks.filter((task) => task.date === date && !task.fixedTaskId).length;
    const fixedPlanned = data.fixedTasks.filter((task) => fixedIsPlanned(task, date)).length;
    const completed = data.tasks.filter((task) => task.date === date && task.done).length;
    const github = data.github.events[date] || 0;
    const total = completed + github;
    const level = total === 0 ? 0 : total >= 8 ? 4 : total >= 5 ? 3 : total >= 2 ? 2 : 1;
    return { iso: date, planned: oneOffPlanned + fixedPlanned, completed, github, total, level, today: date === today };
  });
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityDiff) return priorityDiff;
    return `${a.time || '99:99'}${a.title}`.localeCompare(`${b.time || '99:99'}${b.title}`, 'pt-BR');
  });
}

export function calculateStreak(days: DaySummary[]): number {
  const todayIndex = days.findIndex((day) => day.today);
  let index = todayIndex >= 0 ? todayIndex : days.length - 1;
  let streak = 0;
  for (; index >= 0; index -= 1) {
    if (days[index].total <= 0) break;
    streak += 1;
  }
  return streak;
}

export function encodeInvite(user: { id: string; name: string; email: string; username: string; avatar?: string }): string {
  const payload = JSON.stringify({ ...user, createdAt: new Date().toISOString() });
  return `ritmo://${btoa(unescape(encodeURIComponent(payload)))}`;
}

export function parseInvite(value: string): { id?: string; name: string; email?: string; username?: string; avatar?: string } | null {
  const clean = value.trim();
  if (!clean.startsWith('ritmo://')) return null;
  try {
    const encoded = clean.replace(/^ritmo:\/\//, '');
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

export function initials(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || 'R';
}
