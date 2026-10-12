import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { Task } from '../api/types';
import { TaskViews, type TaskView } from './TaskViews';

/** The category board (CAT-2): a chip per category, that category's tasks as notes on cork. */

vi.mock('../api/endpoints', () => ({
  tasksApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), addSubtask: vi.fn(), updateSubtask: vi.fn(), removeSubtask: vi.fn() },
  categoriesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn() },
  prioritiesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn() },
}));

const mk = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', categoryIds: [], priorityId: 'md', deadline: null, hasTime: false, done: false, doneAt: null, subtasks: [], createdAt: '', updatedAt: '', ...extra,
});

function renderBoard(initial: TaskView = { type: 'categories' }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TaskViews titleId="tv-title" initial={initial} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(tasksApi.list).mockResolvedValue([
    mk('t1', 'Gym', { categoryIds: ['c2'], done: true }),
    mk('t2', 'Run', { categoryIds: ['c2'], deadline: '2030-01-02T00:00:00.000Z' }),
    mk('t3', 'Lab record', { categoryIds: ['c1'], priorityId: 'hi' }),
  ]);
  vi.mocked(categoriesApi.list).mockResolvedValue([
    { id: 'c1', name: 'Study', color: '#4F86D9', order: 0, locked: false },
    { id: 'c2', name: 'Health', color: '#6DB352', order: 1, locked: false },
    { id: 'c3', name: 'Others', color: '#8E959E', order: 2, locked: true },
  ]);
  vi.mocked(prioritiesApi.list).mockResolvedValue([
    { id: 'hi', name: 'High', color: '#E04A2F', order: 0, isDefault: false },
    { id: 'md', name: 'Medium', color: '#F0A81C', order: 1, isDefault: true },
  ]);
});

describe('category board', () => {
  it('starts on All with a counted chip per category and every task as a note', async () => {
    renderBoard();
    expect(await screen.findByRole('heading', { name: 'All tasks' })).toBeInTheDocument();
    await screen.findByRole('button', { name: /^Study/ });
    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
    const chips = within(screen.getByRole('group', { name: 'Categories' }));
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual(['All3', 'Study1', 'Health2', 'Others0']);
    expect(chips.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findAllByRole('listitem')).toHaveLength(3);
  });

  it('a chip shows that category, open tasks first, done ones marked', async () => {
    renderBoard();
    await userEvent.click(await screen.findByRole('button', { name: /^Health/ }));
    expect(screen.getByRole('heading', { name: 'Health tasks' })).toBeInTheDocument();
    const notes = screen.getAllByRole('listitem').map((li) => within(li).getByRole('button').getAttribute('aria-label'));
    expect(notes).toEqual(['Run', 'Gym, done']);
    expect(screen.getByText('Health · due Wed 2 Jan')).toBeInTheDocument();
  });

  it('opens on a given category (a tray) and says when it is empty', async () => {
    renderBoard({ type: 'categories', categoryId: 'c3' });
    expect(await screen.findByRole('heading', { name: 'Others tasks' })).toBeInTheDocument();
    expect(screen.getByText('No tasks in Others yet.')).toBeInTheDocument();
  });

  it('a note opens its task, and Back returns to the same category', async () => {
    renderBoard({ type: 'categories', categoryId: 'c1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Lab record' }));
    expect(screen.getByRole('heading', { name: 'Lab record' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByRole('heading', { name: 'Study tasks' })).toBeInTheDocument();
  });

  it('leads to the categories & priorities manager', async () => {
    renderBoard();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage categories & priorities' }));
    expect(await screen.findByRole('heading', { name: 'Categories & priorities' })).toBeInTheDocument();
  });
});
