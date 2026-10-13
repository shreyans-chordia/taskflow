import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { Category, Priority, Task } from '../api/types';
import { TaskViews } from './TaskViews';

/** The weekly review the desk's notebook opens (TASK-4 done, DL-3 overdue, PR-4 priority colours, CAT-2 by category). */

vi.mock('../api/endpoints', () => ({
  tasksApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), addSubtask: vi.fn(), updateSubtask: vi.fn(), removeSubtask: vi.fn() },
  categoriesApi: { list: vi.fn(), create: vi.fn() },
  prioritiesApi: { list: vi.fn(), create: vi.fn() },
}));
const api = { tasks: vi.mocked(tasksApi), cats: vi.mocked(categoriesApi), prios: vi.mocked(prioritiesApi) };

const cats: Category[] = [
  { id: 'c1', name: 'Study', color: '#4F86D9', order: 0, locked: false },
  { id: 'c2', name: 'Health', color: '#6DB352', order: 1, locked: false },
];
const prios: Priority[] = [
  { id: 'hi', name: 'High', color: '#E04A2F', order: 0, isDefault: false },
  { id: 'md', name: 'Medium', color: '#F0A81C', order: 1, isDefault: true },
  { id: 'lo', name: 'Low', color: '#4E9E78', order: 2, isDefault: false },
];
const mk = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', categoryIds: ['c1'], priorityId: 'md', deadline: null, hasTime: false, done: false, doneAt: null, subtasks: [], createdAt: '', updatedAt: '', ...extra,
});
// "Today" is Wednesday 16 October 2030; the week runs Monday 14 to Sunday 20.
const tasks: Task[] = [
  mk('t1', 'RDBMS mini project', { deadline: '2030-10-20T00:00:00.000Z', priorityId: 'hi' }),
  mk('t2', 'Lab 8 record', { deadline: '2030-10-20T00:00:00.000Z', done: true, doneAt: '2030-10-15T09:00:00' }),
  mk('t3', 'Gym session', { deadline: '2030-10-15T00:00:00.000Z', categoryIds: ['c2'], priorityId: 'lo' }),
  mk('t4', 'Old essay', { deadline: '2030-10-01T00:00:00.000Z' }),
  mk('t5', 'Next week thing', { deadline: '2030-10-24T00:00:00.000Z' }),
];

function renderReview() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TaskViews titleId="tv-title" initial={{ type: 'review' }} onExit={() => undefined} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2030, 9, 16, 12));
  vi.clearAllMocks();
  api.tasks.list.mockResolvedValue(tasks);
  api.cats.list.mockResolvedValue(cats);
  api.prios.list.mockResolvedValue(prios);
  api.tasks.update.mockImplementation(async (id, body) => ({ ...tasks.find((t) => t.id === id)!, ...body }) as Task);
});
afterEach(() => vi.useRealTimers());

const summary = () => screen.getByRole('region', { name: 'Week summary' });

describe('weekly review', () => {
  it('sums up the week: done of due, still open, overdue (TASK-4, DL-3)', async () => {
    renderReview();
    expect(await screen.findByRole('heading', { name: '14 – 20 October' })).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Week summary' });
    expect(within(summary()).getByRole('img', { name: '1 of 3 done' })).toBeInTheDocument();
    expect(within(summary()).getByText('2 still open')).toBeInTheDocument();
    // Gym session (late this week) and Old essay (late from before)
    expect(within(summary()).getByText('2 overdue')).toBeInTheDocument();
  });

  it('lays the week out day by day, with today marked (DL-1)', async () => {
    renderReview();
    const tue = await screen.findByRole('group', { name: 'Tue 15: 0 of 1 done' });
    expect(within(tue).getByRole('button', { name: 'Gym session, Low, overdue' })).toHaveTextContent('Overdue');
    expect(screen.getByRole('group', { name: 'Wed 16, today: no tasks' })).toHaveTextContent('TODAY');
    const sun = screen.getByRole('group', { name: 'Sun 20: 1 of 2 done' });
    const blocks = within(sun).getAllByRole('button');
    expect(blocks.map((b) => b.getAttribute('aria-label'))).toEqual(['Lab 8 record, done', 'RDBMS mini project, High']);
  });

  it('lists what is still open, including overdue work from earlier weeks, and ticks it off there (TASK-4)', async () => {
    renderReview();
    const open = await screen.findByRole('list', { name: 'Still open' });
    expect(within(open).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Old essay'),
      expect.stringContaining('Gym session'),
      expect.stringContaining('RDBMS mini project'),
    ]);
    await userEvent.click(within(open).getAllByRole('checkbox')[0]!);
    expect(api.tasks.update).toHaveBeenCalledWith('t4', { done: true });
  });

  it('breaks the week down by priority and by category (PR-4, CAT-2)', async () => {
    renderReview();
    const brk = await screen.findByRole('region', { name: 'Breakdown' });
    await within(brk).findByText('High');
    expect(within(brk).getByText('Medium').closest('.rv-brow')).toHaveTextContent('1 of 1'); // Old essay is from an earlier week
    expect(within(brk).getByText('High').closest('.rv-brow')).toHaveTextContent('0 of 1');
    expect(within(brk).getByText('Study').closest('.rv-brow')).toHaveTextContent('1 of 2');
    expect(within(brk).getByText('Health').closest('.rv-brow')).toHaveTextContent('0 of 1');
  });

  it('steps through weeks and comes back to this one', async () => {
    renderReview();
    await screen.findByRole('heading', { name: '14 – 20 October' });
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByRole('heading', { name: '21 – 27 October' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Thu 24: 0 of 1 done' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByRole('heading', { name: '7 – 13 October' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(screen.getByRole('heading', { name: '14 – 20 October' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This week' })).toBeDisabled();
  });

  it('opens a task from a day, and Back returns to the same week', async () => {
    renderReview();
    await screen.findByRole('heading', { name: '14 – 20 October' });
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await userEvent.click(await screen.findByRole('button', { name: 'RDBMS mini project, High' }));
    expect(await screen.findByRole('heading', { name: 'RDBMS mini project' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByRole('heading', { name: '14 – 20 October' })).toBeInTheDocument();
  });
});
