import type { CreateSaveInput, Locale, Me, SaveDto, SessionDto, UpdateSaveInput } from '@simloom/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? 'unknown_error');
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  me: () => request<Me>('/auth/me'),
  requestCode: (email: string, locale: Locale) =>
    request<void>('/auth/request-code', { method: 'POST', body: json({ email, locale }) }),
  verifyCode: (email: string, code: string) =>
    request<Me>('/auth/verify-code', { method: 'POST', body: json({ email, code }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  sessions: () => request<SessionDto[]>('/auth/sessions'),
  revokeSession: (id: string) => request<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),

  saves: () => request<SaveDto[]>('/saves'),
  createSave: (input: CreateSaveInput) => request<SaveDto>('/saves', { method: 'POST', body: json(input) }),
  updateSave: (id: string, input: UpdateSaveInput) =>
    request<SaveDto>(`/saves/${id}`, { method: 'PATCH', body: json(input) }),
  deleteSave: (id: string) => request<void>(`/saves/${id}`, { method: 'DELETE' }),
};
