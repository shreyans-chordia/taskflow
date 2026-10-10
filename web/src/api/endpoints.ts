import { api, clearCsrfToken } from './client';
import type { Category, NewTask, Priority, Task, TaskPatch, TaskQuery, User } from './types';

type UserRes = { user: User; csrfToken: string };

export const authApi = {
  me: () => api<UserRes>('GET', '/auth/me'),
  signup: (b: { name: string; email: string; password: string }) => api<UserRes>('POST', '/auth/signup', b),
  login: (b: { email: string; password: string }) => api<UserRes>('POST', '/auth/login', b),
  logout: async () => {
    await api<void>('POST', '/auth/logout');
    clearCsrfToken();
  },
};

const qs = (q: TaskQuery) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const tasksApi = {
  list: (q: TaskQuery = {}) => api<{ tasks: Task[] }>('GET', `/tasks${qs(q)}`).then((r) => r.tasks),
  create: (t: NewTask) => api<{ task: Task }>('POST', '/tasks', t).then((r) => r.task),
  update: (id: string, patch: TaskPatch) => api<{ task: Task }>('PATCH', `/tasks/${id}`, patch).then((r) => r.task),
  remove: (id: string) => api<void>('DELETE', `/tasks/${id}`),
  addSubtask: (id: string, title: string) => api<{ task: Task }>('POST', `/tasks/${id}/subtasks`, { title }).then((r) => r.task),
  updateSubtask: (id: string, subId: string, patch: { title?: string; done?: boolean }) =>
    api<{ task: Task }>('PATCH', `/tasks/${id}/subtasks/${subId}`, patch).then((r) => r.task),
  removeSubtask: (id: string, subId: string) => api<{ task: Task }>('DELETE', `/tasks/${id}/subtasks/${subId}`).then((r) => r.task),
};

export const categoriesApi = {
  list: () => api<{ categories: Category[] }>('GET', '/categories').then((r) => r.categories),
};

export const prioritiesApi = {
  list: () => api<{ priorities: Priority[] }>('GET', '/priorities').then((r) => r.priorities),
};
