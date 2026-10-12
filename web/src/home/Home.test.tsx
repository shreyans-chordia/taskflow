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
  tasksApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), addSubtask: vi.fn(), updateSubtask: vi.fn(), removeSubtask: vi.fn() },
  categoriesApi: { list: vi.fn(), create: vi.fn() },
  prioritiesApi: { list: vi.fn(), create: vi.fn() },
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
        <button type="button" onClick={() => open('search', 'Search')}>blue key</button>
        <button type="button" onClick={() => open('calendar', 'Wall calendar')}>wall calendar</button>
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

  it('a note opens its own task (TASK-3)', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'gym note' }));
    expect(await screen.findByRole('dialog', { name: 'Gym session' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark as complete' })).toBeInTheDocument();
    // Back from a task opened straight from the desk returns to the desk.
    await userEvent.click(screen.getByRole('button', { name: /Back to the desk/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('the green key opens the full form with the cursor in Title (TASK-1)', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'green key' }));
    expect(await screen.findByRole('dialog', { name: 'New task' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
  });

  it('the search key opens search with the cursor in the search box (SF-1)', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'blue key' }));
    expect(await screen.findByRole('dialog', { name: 'Search & filter' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveFocus());
  });

  it('the wall calendar opens this month (CAL-1)', async () => {
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'wall calendar' }));
    const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    expect(await screen.findByRole('dialog', { name: month })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: month })).toHaveFocus();
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
