import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { Category, Priority, Task, TaskQuery } from '../api/types';
import { TaskViews, type TaskView } from './TaskViews';

/** The calendar (CAL-1..CAL-4) and search & filter (SF-1..SF-6) screens, as the desk panel and the 2D page show them. */

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
const tasks: Task[] = [
  mk('t1', 'RDBMS mini project', { deadline: '2030-10-20T00:00:00.000Z', priorityId: 'hi', description: 'Normalise to 3NF.' }),
  mk('t2', 'Lab 8 record', { deadline: '2030-10-20T00:00:00.000Z', done: true }),
  mk('t3', 'Gym session', { deadline: '2030-11-02T00:00:00.000Z', categoryIds: ['c2'], priorityId: 'lo' }),
  mk('t4', 'Read a book', { categoryIds: ['c2'] }), // no deadline
];

/** What the server does with a search (see server/src/controllers/tasks.controller.ts): every filter, ANDed. */
function serverSearch(q: TaskQuery = {}): Task[] {
  const kw = (q.q ?? '').toLowerCase();
  return tasks.filter(
    (t) =>
      (!kw || `${t.title} ${t.description}`.toLowerCase().includes(kw)) &&
      (!q.category || t.categoryIds.includes(q.category)) &&
      (!q.priority || t.priorityId === q.priority) &&
      (!q.status || q.status === 'all' || t.done === (q.status === 'done')),
  );
}

function renderViews(initial: TaskView, onExit?: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TaskViews titleId="tv-title" initial={initial} onExit={onExit} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.tasks.list.mockImplementation(async (q?: TaskQuery) => serverSearch(q));
  api.cats.list.mockResolvedValue(cats);
  api.prios.list.mockResolvedValue(prios);
});

describe('calendar', () => {
  const october: TaskView = { type: 'calendar', month: '2030-10', day: '2030-10-20' };
  const grid = () => screen.getByRole('table', { name: /2030/ });

  it('shows the month with each task on its deadline day (CAL-1, DL-4)', async () => {
    renderViews(october);
    expect(await screen.findByRole('heading', { name: 'October 2030' })).toBeInTheDocument();
    const day = await screen.findByRole('button', { name: 'Sun 20 Oct: 2 tasks' });
    const cell = day.closest('td')!;
    expect(within(cell).getByRole('button', { name: 'RDBMS mini project' })).toBeInTheDocument();
    expect(within(cell).getByRole('button', { name: 'Lab 8 record, done' })).toBeInTheDocument();
    expect(within(grid()).getByRole('button', { name: 'Mon 21 Oct: no tasks' })).toBeInTheDocument();
  });

  it('leaves tasks without a deadline off the grid and says so (CAL-4)', async () => {
    renderViews(october);
    await screen.findByRole('button', { name: 'Sun 20 Oct: 2 tasks' });
    expect(within(grid()).queryByText('Read a book')).not.toBeInTheDocument();
    expect(screen.getByText(/1 task without a deadline is only in the list/)).toBeInTheDocument();
  });

  it('moves between months (CAL-2)', async () => {
    renderViews(october);
    await screen.findByRole('button', { name: 'Sun 20 Oct: 2 tasks' });
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'November 2030' })).toBeInTheDocument();
    expect(within(grid()).getByRole('button', { name: 'Gym session' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'September 2030' })).toBeInTheDocument();
    // Changing the month is not a new screen: focus stays on the button that was pressed.
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveFocus();
  });

  it('lists the selected day beside the grid', async () => {
    renderViews(october);
    const side = await screen.findByRole('complementary', { name: 'Sunday 20 October' });
    expect(within(side).getByText('RDBMS mini project')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mon 21 Oct: no tasks' }));
    expect(screen.getByRole('complementary', { name: 'Monday 21 October' })).toHaveTextContent('Nothing due this day.');
  });

  it('opens a task from the grid, and Back returns to the same month (CAL-3)', async () => {
    renderViews({ type: 'calendar', month: '2030-11', day: '2030-11-02' });
    await userEvent.click(await within(await screen.findByRole('table', { name: 'November 2030' })).findByRole('button', { name: 'Gym session' }));
    expect(screen.getByRole('heading', { name: 'Gym session' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByRole('heading', { name: 'November 2030' })).toHaveFocus();
  });

  it('adds a task for the selected day with the date filled in (DL-1)', async () => {
    renderViews(october);
    await userEvent.click(await screen.findByRole('button', { name: '+ Add task for this day' }));
    expect(await screen.findByRole('heading', { name: 'New task' })).toBeInTheDocument();
    expect(screen.getByLabelText('Deadline · optional')).toHaveValue('2030-10-20');
  });
});

describe('search & filter', () => {
  const search: TaskView = { type: 'search' };
  const results = () => screen.getByRole('list', { name: 'Matching tasks' });
  const lastQuery = () => api.tasks.list.mock.calls.at(-1)?.[0];

  it('starts with the open tasks, most urgent first', async () => {
    renderViews(search);
    expect(await screen.findByText('3 matches')).toBeInTheDocument();
    expect(lastQuery()).toEqual({ status: 'open' });
    expect(within(results()).getAllByRole('button', { name: /^(RDBMS|Gym|Read)/ }).map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^RDBMS mini project/),
      expect.stringMatching(/^Gym session/),
      expect.stringMatching(/^Read a book/),
    ]);
  });

  it('finds a keyword in the title or the description, on the server (SF-1)', async () => {
    renderViews(search);
    await screen.findByText('3 matches');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), '3nf');
    expect(await screen.findByText('1 match')).toBeInTheDocument();
    expect(lastQuery()).toEqual({ status: 'open', q: '3nf' });
    expect(within(results()).getByText('RDBMS mini project')).toBeInTheDocument();
  });

  it('filters by category, priority and status (SF-2, SF-3, SF-4)', async () => {
    renderViews(search);
    await screen.findByText('3 matches');
    await userEvent.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: 'Health' }));
    expect(await screen.findByText('2 matches')).toBeInTheDocument();
    expect(lastQuery()).toEqual({ status: 'open', category: 'c2' });

    await userEvent.click(within(screen.getByRole('group', { name: 'Priority' })).getByRole('button', { name: 'Low' }));
    expect(await screen.findByText('1 match')).toBeInTheDocument();
    expect(lastQuery()).toEqual({ status: 'open', category: 'c2', priority: 'lo' });

    await userEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Complete' }));
    expect(lastQuery()).toEqual({ status: 'done', category: 'c2', priority: 'lo' });
  });

  it('combines a keyword and filters with AND, and says when nothing matches (SF-5, SF-6)', async () => {
    renderViews(search);
    await screen.findByText('3 matches');
    await userEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Complete' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'lab');
    await waitFor(() => expect(lastQuery()).toEqual({ status: 'done', q: 'lab' }));
    expect(within(results()).getByText('Lab 8 record')).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: 'Health' }));
    expect(await screen.findByText('No matching tasks. Try another keyword or loosen a filter.')).toBeInTheDocument();
    expect(screen.getByText('0 matches')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('4 matches')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
  });

  it('keeps the search when you open a result and come back', async () => {
    renderViews(search);
    await screen.findByText('3 matches');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'gym');
    await screen.findByText('1 match');
    await userEvent.click(within(results()).getByRole('button', { name: /^Gym session/ }));
    expect(screen.getByRole('heading', { name: 'Gym session' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByRole('searchbox', { name: 'Search' })).toHaveValue('gym');
    expect(await screen.findByText('1 match')).toBeInTheDocument();
  });

  it('typing a word asks the server once, not once per letter', async () => {
    renderViews(search);
    await screen.findByText('3 matches');
    const before = api.tasks.list.mock.calls.filter((c) => c[0]?.q).length;
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'record');
    await screen.findByText('0 matches'); // "record" is only on a done task
    expect(api.tasks.list.mock.calls.filter((c) => c[0]?.q).length - before).toBe(1);
  });
});
