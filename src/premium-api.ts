import type { AppData, User } from './premium-types';

interface ApiOptions extends RequestInit {
  token?: string;
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  const response = await fetch(path, { ...options, headers });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || `Erro ${response.status}`);
  return payload;
}

export interface AuthPayload {
  token: string;
  user: User;
  state: AppData;
}

export interface StatePayload {
  state: AppData;
}

export interface UserPayload {
  user: User;
}
