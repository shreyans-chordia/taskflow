import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { Task } from '../api/types';
import { AuthProvider } from '../auth/AuthProvider';
import type { DeskProps } from '../desk/Desk';
import { Home } from './Home';

vi.mock('../api/endpoints', () => ({
  authApi: { me: vi.fn(), signup: vi.fn(), login: vi.fn(), verifyLogin: vi.fn(), resendCode: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), logout: vi.fn() },
  tasksApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  categoriesApi: { list: vi.fn() },
  prioritiesApi: { list: vi.fn() },
}));

// jsdom cannot draw WebGL, so the 3D desk is replaced by buttons that "click" its objects.
const deskProps: { current: DeskProps | null } = { current: null };
vi.mock('../desk/Desk', () => ({
  default: (props: DeskProps) => {
    deskProps.current = props;
    const open = (key: string, label: string) => props.onOpen({ key, label, lift: 'z' });
    return (
      <div data-testid="desk" data-night={String(props.night)} data-panel={String(props.panelOpen)}>
        <button type="button" onClick={() => open('board', 'Corkboard')}>corkboard</button>
        <button type="button" onClick={() => open('tray:c2', 'Health')}>health tray</button>
        <button type="button" onClick={() => open('note:t1', 'Gym session')}>gym note</button>
        <button type="button" onClick={() => open('add', 'Add Task')}>green key</button>
        <button type="button" onClick={props.onToggleLamp}>lamp</button>
      </div>
    );
  },
}));

const base = { description: '', deadline: null, hasTime: false, done: false, doneAt: null, subtasks: [], createdAt: '', updatedAt: '', priorityId: 'p1' };
const tasks: Task[] = [
  { ...base, id: 't1', title: 'Gym session', categoryIds: ['c2'] },
  { ...base, id: 't2', title: 'Lab record', categoryIds: ['c1'] },
];

function renderHome(onToggleTheme = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Home night={false} onToggleTheme={onToggleTheme} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  deskProps.current = null;
  vi.mocked(authApi.me).mockResolvedValue({ user: { id: 'u', name: 'Shreyans', email: 's@example.com', createdAt: '' }, csrfToken: 't' });
  vi.mocked(tasksApi.list).mockResolvedValue(tasks);
  vi.mocked(categoriesApi.list).mockResolvedValue([
    { id: 'c1', name: 'Study', color: '#4F86D9', order: 0, locked: false },
    { id: 'c2', name: 'Health', color: '#6DB352', order: 1, locked: false },
  ]);
  vi.mocked(prioritiesApi.list).mockResolvedValue([{ id: 'p1', name: 'Medium', color: '#F0A81C', order: 0, isDefault: true }]);
});

describe('<Home> on a browser that can draw 3D', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext);
  });

  it('shows the desk with the real tasks turned into desk data', async () => {
    renderHome();
    expect(await screen.findByTestId('desk')).toBeInTheDocument();
    await waitFor(() => expect(deskProps.current?.data.tasks.map((t) => t.title)).toEqual(['Gym session', 'Lab record']));
    expect(screen.getByText('Signed in as')).toBeInTheDocument();
  });

  it('opens the task list when the corkboard is clicked, and Escape closes it (TASK-2)', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'corkboard' }));
    expect(await screen.findByRole('dialog', { name: 'Your tasks' })).toBeInTheDocument();
    expect(screen.getByTestId('desk')).toHaveAttribute('data-panel', 'true');
    await screen.findByText('Lab record');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('desk')).toHaveAttribute('data-panel', 'false');
  });

  it('a tray shows only its category (CAT-2, SF-2)', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'health tray' }));
    expect(await screen.findByRole('dialog', { name: 'Health' })).toBeInTheDocument();
    expect(await screen.findByText('Gym session')).toBeInTheDocument();
    expect(screen.queryByText('Lab record')).not.toBeInTheDocument();
  });

  it('a note marks its own task in the list (TASK-3)', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'gym note' }));
    const row = (await screen.findByText('Gym session')).closest('li');
    expect(row).toHaveAttribute('aria-current', 'true');
  });

  it('the green key puts the cursor in "New task" (TASK-1)', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'green key' }));
    await waitFor(() => expect(screen.getByLabelText('New task')).toHaveFocus());
  });

  it('the lamp switches the theme', async () => {
    const toggle = vi.fn();
    renderHome(toggle);
    await userEvent.click(await screen.findByRole('button', { name: 'lamp' }));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('the close button takes you back to the desk', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'corkboard' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Close and go back to the desk' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('<Home> on a browser without WebGL', () => {
  it('falls back to the plain task list instead of a broken screen', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    renderHome();
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
    expect(screen.queryByTestId('desk')).not.toBeInTheDocument();
    expect(await screen.findByText('Gym session')).toBeInTheDocument();
  });
});
