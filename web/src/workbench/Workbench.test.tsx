import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { authApi, categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { Task } from '../api/types';
import { AuthProvider } from '../auth/AuthProvider';
import { Workbench } from './Workbench';

vi.mock('../api/endpoints', () => ({
  authApi: { me: vi.fn(), signup: vi.fn(), login: vi.fn(), verifyLogin: vi.fn(), resendCode: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), logout: vi.fn() },
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

describe('<Workbench> marking a task done (TASK-4)', () => {
  beforeEach(() => {
    vi.mocked(authApi.me).mockResolvedValue({ user: { id: 'u', name: 'S', email: 's@example.com', createdAt: '' }, csrfToken: 't' });
    vi.mocked(tasksApi.list).mockResolvedValue([task]);
    vi.mocked(categoriesApi.list).mockResolvedValue([]);
    vi.mocked(prioritiesApi.list).mockResolvedValue([{ id: 'p1', name: 'Medium', color: '#F0A81C', order: 1, isDefault: true }]);
  });

  it('opens a note and shows the tick straight away, before the server answers', async () => {
    let finish: (t: Task) => void = () => {};
    vi.mocked(tasksApi.update).mockReturnValue(new Promise<Task>((r) => (finish = r)));
    renderBench();
    await userEvent.click(await screen.findByRole('button', { name: 'Submit Lab 7 record' }));
    const box = await screen.findByRole('checkbox', { name: 'Mark as complete' });
    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(tasksApi.update).toHaveBeenCalledWith('t1', { done: true });
    vi.mocked(tasksApi.list).mockResolvedValue([{ ...task, done: true }]);
    finish({ ...task, done: true });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Completed' })).toBeChecked());
  });

  it('puts the tick back and says so when the server refuses', async () => {
    vi.mocked(tasksApi.update).mockRejectedValue(new ApiError(500, 'INTERNAL', 'boom'));
    renderBench();
    await userEvent.click(await screen.findByRole('button', { name: 'Submit Lab 7 record' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mark as complete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom'); // the server's own reason
    expect(screen.getByRole('checkbox', { name: 'Mark as complete' })).not.toBeChecked();
  });
});

describe('<Workbench> sections (CAL-1, SF-1, CAT-1)', () => {
  beforeEach(() => {
    vi.mocked(authApi.me).mockResolvedValue({ user: { id: 'u', name: 'S', email: 's@example.com', createdAt: '' }, csrfToken: 't' });
    vi.mocked(tasksApi.list).mockResolvedValue([task]);
    vi.mocked(categoriesApi.list).mockResolvedValue([]);
    vi.mocked(prioritiesApi.list).mockResolvedValue([{ id: 'p1', name: 'Medium', color: '#F0A81C', order: 1, isDefault: true }]);
  });

  it('reaches the calendar, search and the organizer through tabs, and Tasks brings the list back', async () => {
    renderBench();
    const tabs = await screen.findByRole('navigation', { name: 'Sections' });
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(tabs).getByRole('button', { name: 'Calendar' }));
    expect(await screen.findByRole('heading', { name: new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) })).toBeInTheDocument();
    await userEvent.click(within(tabs).getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
    await userEvent.click(within(tabs).getByRole('button', { name: 'Categories' }));
    expect(await screen.findByRole('heading', { name: 'All tasks' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Manage categories & priorities' }));
    expect(await screen.findByRole('heading', { name: 'Categories & priorities' })).toBeInTheDocument();
    await userEvent.click(within(tabs).getByRole('button', { name: 'Tasks' }));
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
  });
});
