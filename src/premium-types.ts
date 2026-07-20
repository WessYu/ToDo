export type ViewId = 'today' | 'tasks' | 'progress' | 'people' | 'profile';
export type Priority = 'baixa' | 'media' | 'alta';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  bio?: string;
  avatar?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Friend {
  id: string;
  accountId?: string;
  name: string;
  email?: string;
  avatar?: string;
  status?: 'manual' | 'accepted';
  createdAt?: string;
}

export interface Task {
  id: string;
  title: string;
  date: string;
  time?: string;
  priority: Priority;
  project?: string;
  done: boolean;
  fixedTaskId?: string;
  sharedWith?: string[];
  createdAt?: string;
  completedAt?: string;
}

export interface FixedTask {
  id: string;
  title: string;
  time?: string;
  priority: Priority;
  project?: string;
  weekdays: number[];
  active: boolean;
  sharedWith?: string[];
  createdAt?: string;
}

export interface GithubState {
  username: string;
  events: Record<string, number>;
  syncedAt: string;
}

export interface AppData {
  tasks: Task[];
  fixedTasks: FixedTask[];
  journal: Record<string, string>;
  github: GithubState;
  friends: Friend[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DaySummary {
  iso: string;
  planned: number;
  completed: number;
  github: number;
  total: number;
  level: number;
  today: boolean;
}

export interface TaskDraft {
  title: string;
  date: string;
  time: string;
  priority: Priority;
  project: string;
  recurring: boolean;
  weekdays: number[];
  sharedWith: string[];
}
