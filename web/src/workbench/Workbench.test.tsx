import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { authApi, categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { Task } from '../api/types';
import { AuthProvider } from '../auth/AuthProvider';
import { Workbench } from './Workbench';

vi.mock('../api/endpoints', () => ({
  authApi: { me: vi.fn(), signup: vi.fn(), login: vi.fn(), logout: vi.fn() },
  tasksApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  categoriesApi: { list: vi.fn() },
  prioritiesApi: { list: vi.fn() },
}));

const task: Task = {
  id: 't1', title: 'Submit Lab 7 record', description: '', categoryIds: [], priorityId: 'p1',
  deadline: null, hasTime: false, done: false, doneAt: null, subtasks: [], createdAt: '', updatedAt: '',
};

function renderBench() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Workbench onToggleTheme={() => {}} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('<Workbench> ticking a task (TASK-4)', () => {
  beforeEach(() => {
    vi.mocked(authApi.me).mockResolvedValue({ user: { id: 'u', name: 'S', email: 's@example.com', createdAt: '' }, csrfToken: 't' });
    vi.mocked(tasksApi.list).mockResolvedValue([task]);
    vi.mocked(categoriesApi.list).mockResolvedValue([]);
    vi.mocked(prioritiesApi.list).mockResolvedValue([{ id: 'p1', name: 'Medium', color: '#F0A81C', order: 1, isDefault: true }]);
  });

  it('shows the tick straight away, before the server answers', async () => {
    let finish: (t: Task) => void = () => {};
    vi.mocked(tasksApi.update).mockReturnValue(new Promise<Task>((r) => (finish = r)));
    renderBench();
    const box = await screen.findByRole('checkbox', { name: /Mark Submit Lab 7 record/ });
    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(tasksApi.update).toHaveBeenCalledWith('t1', { done: true });
    vi.mocked(tasksApi.list).mockResolvedValue([{ ...task, done: true }]);
    finish({ ...task, done: true });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Mark Submit Lab 7 record/ })).toBeChecked());
  });

  it('puts the tick back and says so when the server refuses', async () => {
    vi.mocked(tasksApi.update).mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));
    renderBench();
    const box = await screen.findByRole('checkbox', { name: /Mark Submit Lab 7 record/ });
    await userEvent.click(box);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update the task');
    expect(screen.getByRole('checkbox', { name: /Mark Submit Lab 7 record/ })).not.toBeChecked();
  });
});
