/** Shapes returned by the TaskFlow API (see docs/API.md). */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** Sent when a code was emailed: the password step of sign-in, or "Forgot password?". */
export interface CodeChallenge {
  otpRequired: true;
  /** Masked, e.g. "s••••••s@example.com". */
  email: string;
  expiresInSec: number;
  resendInSec: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  order: number;
  locked: boolean;
}

export interface Priority {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault: boolean;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  categoryIds: string[];
  priorityId: string;
  deadline: string | null;
  hasTime: boolean;
  done: boolean;
  doneAt: string | null;
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
}

export interface NewTask {
  title: string;
  description?: string;
  categoryIds?: string[];
  priorityId?: string;
  deadline?: string | null;
  hasTime?: boolean;
}

export type TaskPatch = Partial<Omit<NewTask, 'title'> & { title: string; done: boolean }>;

export interface TaskQuery {
  q?: string;
  category?: string;
  priority?: string;
  status?: 'all' | 'open' | 'done';
  from?: string;
  to?: string;
}
