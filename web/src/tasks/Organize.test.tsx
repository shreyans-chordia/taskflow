import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { Category, Priority, Task } from '../api/types';
import { TaskViews } from './TaskViews';
import { inOrder, moved } from './useOrganizeActions';

/** The organizer: categories (CAT-1, CAT-4, CAT-5) and priority levels (PR-1, PR-2, PR-3). */

vi.mock('../api/endpoints', () => ({
  tasksApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), addSubtask: vi.fn(), updateSubtask: vi.fn(), removeSubtask: vi.fn() },
  categoriesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn() },
  prioritiesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), reorder: vi.fn() },
}));
const api = { tasks: vi.mocked(tasksApi), cats: vi.mocked(categoriesApi), prios: vi.mocked(prioritiesApi) };

const names = ['Study', 'Development', 'Personal', 'Health', 'Career', 'Others', 'Finance'];
let cats: Category[];
let prios: Priority[];
const mk = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', categoryIds: [], priorityId: 'md', deadline: null, hasTime: false, done: false, doneAt: null, subtasks: [], createdAt: '', updatedAt: '', ...extra,
});
const tasks = [mk('t1', 'Gym', { categoryIds: ['c3'], priorityId: 'hi' }), mk('t2', 'Run', { categoryIds: ['c3'] })];

/** Renders the organizer and waits until both lists are in (the screen says "Loading…" first). */
async function renderOrganizer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TaskViews titleId="tv-title" initial={{ type: 'organize' }} />
    </QueryClientProvider>,
  );
  await screen.findByRole('list', { name: 'Priority levels' });
}
const catRows = () => within(screen.getByRole('list', { name: 'Categories' }));
const levelRows = () => within(screen.getByRole('list', { name: 'Priority levels' }));
const nameBox = (noun: string, name: string) => screen.getByRole('textbox', { name: `Name of the ${noun} ${name}` });

beforeEach(() => {
  vi.clearAllMocks();
  cats = names.map((name, i) => ({ id: `c${i}`, name, color: '#4F86D9', order: i, locked: name === 'Others' }));
  prios = [
    { id: 'hi', name: 'High', color: '#E04A2F', order: 0, isDefault: false },
    { id: 'md', name: 'Medium', color: '#F0A81C', order: 1, isDefault: true },
    { id: 'lo', name: 'Low', color: '#4E9E78', order: 2, isDefault: false },
  ];
  api.tasks.list.mockImplementation(async () => tasks);
  api.cats.list.mockImplementation(async () => cats);
  api.prios.list.mockImplementation(async () => prios);
});

describe('reordering helpers', () => {
  it('moves one step and keeps every id once', () => {
    expect(moved(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moved(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']); // already at the top
    const list = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }];
    expect(inOrder(list, ['b', 'a'])).toEqual([{ id: 'b', order: 0 }, { id: 'a', order: 1 }]);
  });
});

describe('categories', () => {
  it('lists them in order, marks the six on the shelf, and counts their tasks', async () => {
    await renderOrganizer();
    await screen.findByRole('heading', { name: 'Categories & priorities' });
    await waitFor(() => expect(catRows().getAllByText('On shelf')).toHaveLength(6));
    expect(catRows().getAllByText('Hidden')).toHaveLength(1);
    expect(catRows().getByText(/Not on the shelf/)).toBeInTheDocument();
    expect(await catRows().findByRole('button', { name: 'Open the 2 tasks in Health' })).toBeInTheDocument();
  });

  it('renames in place: Enter saves, and a name already taken is refused with the reason (CAT-5)', async () => {
    api.cats.update.mockImplementation(async (id, b) => ({ ...cats.find((c) => c.id === id)!, ...b }));
    await renderOrganizer();
    const box = await screen.findByRole('textbox', { name: 'Name of the category Study' });
    await userEvent.clear(box);
    await userEvent.type(box, 'Studies{Enter}');
    expect(api.cats.update).toHaveBeenCalledWith('c0', { name: 'Studies' });
    expect(await screen.findByRole('textbox', { name: 'Name of the category Studies' })).toHaveValue('Studies');

    api.cats.update.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', '"Health" already exists.', { name: '"Health" already exists.' }));
    const career = nameBox('category', 'Career');
    await userEvent.clear(career);
    await userEvent.type(career, 'Health{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('"Health" already exists.');
    expect(career).toHaveValue('Career'); // put back
  });

  it('Escape puts an edited name back without saving', async () => {
    await renderOrganizer();
    const box = await screen.findByRole('textbox', { name: 'Name of the category Study' });
    await userEvent.type(box, 'xyz');
    await userEvent.keyboard('{Escape}');
    expect(box).toHaveValue('Study');
    box.blur();
    expect(api.cats.update).not.toHaveBeenCalled();
  });

  it('keeps the fallback category: no renaming, no deleting', async () => {
    await renderOrganizer();
    expect(await screen.findByRole('textbox', { name: 'Name of the category Others' })).toHaveAttribute('readonly');
    expect(catRows().getByRole('button', { name: 'Delete Others' })).toBeDisabled();
  });

  it('moves a category up at once, sends the whole new order, and keeps focus on the arrow', async () => {
    api.cats.reorder.mockImplementation(async (ids) => ids.map((id, order) => ({ ...cats.find((c) => c.id === id)!, order })));
    await renderOrganizer();
    await userEvent.click(await catRows().findByRole('button', { name: 'Move Finance up' }));
    expect(api.cats.reorder).toHaveBeenCalledWith(['c0', 'c1', 'c2', 'c3', 'c4', 'c6', 'c5']);
    // Finance is now the sixth: on the shelf; Others drops below the line.
    await waitFor(() => expect(catRows().getAllByRole('textbox')[5]).toHaveValue('Finance'));
    expect(catRows().getByRole('button', { name: 'Move Finance up' })).toHaveFocus();
  });

  it('puts the order back if the server refuses it', async () => {
    api.cats.reorder.mockRejectedValue(new ApiError(400, 'BAD_REQUEST', 'Send every one of your category ids exactly once.', {}));
    await renderOrganizer();
    await userEvent.click(await catRows().findByRole('button', { name: 'Move Study down' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Send every one of your category ids exactly once.');
    expect(catRows().getAllByRole('textbox')[0]).toHaveValue('Study');
  });

  it('asks before deleting, says the tasks stay, and then removes it (CAT-4)', async () => {
    api.cats.remove.mockResolvedValue({ removedFromTasks: 2 });
    await renderOrganizer();
    await userEvent.click(await catRows().findByRole('button', { name: 'Delete Health' }));
    const ask = screen.getByRole('alert');
    expect(ask).toHaveTextContent('Delete “Health”? It comes off its 2 tasks; the tasks themselves stay.');
    expect(within(ask).getByRole('button', { name: 'Keep' })).toHaveFocus();
    cats = cats.filter((c) => c.id !== 'c3');
    await userEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
    expect(api.cats.remove).toHaveBeenCalledWith('c3');
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted “Health”. Its 2 tasks keep going without it.');
    expect(screen.queryByRole('textbox', { name: 'Name of the category Health' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Categories' })).toHaveFocus();
  });

  it('recolours from the colour picker', async () => {
    api.cats.update.mockImplementation(async (id, b) => ({ ...cats.find((c) => c.id === id)!, ...b }));
    await renderOrganizer();
    await userEvent.click(await catRows().findByRole('button', { name: 'Colour of Study: #4F86D9' }));
    const picker = screen.getByRole('dialog', { name: 'Choose a colour' });
    expect(within(picker).getByRole('button', { name: '#4F86D9' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(picker).getByRole('button', { name: '#6DB352' }));
    expect(api.cats.update).toHaveBeenCalledWith('c0', { color: '#6DB352' });
    expect(screen.queryByRole('dialog', { name: 'Choose a colour' })).not.toBeInTheDocument();
  });

  it('adds a category at the end (CAT-1)', async () => {
    api.cats.create.mockImplementation(async (b) => {
      const c = { id: 'new', ...b, order: cats.length, locked: false };
      cats = [...cats, c];
      return c;
    });
    await renderOrganizer();
    await userEvent.click(await screen.findByRole('button', { name: '+ Add category' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Category name' }), 'Travel{Enter}');
    expect(api.cats.create).toHaveBeenCalledWith({ name: 'Travel', color: expect.stringMatching(/^#/) });
    expect(await screen.findByRole('textbox', { name: 'Name of the category Travel' })).toBeInTheDocument();
  });

  it('opens a category’s tasks from its count, and Back returns to the organizer', async () => {
    await renderOrganizer();
    await userEvent.click(await catRows().findByRole('button', { name: 'Open the 2 tasks in Health' }));
    expect(await screen.findByRole('heading', { name: 'Health tasks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gym' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByRole('heading', { name: 'Categories & priorities' })).toBeInTheDocument();
  });
});

describe('priority levels', () => {
  it('shows the Ring, the default, and the task counts (PR-1, PR-2)', async () => {
    await renderOrganizer();
    await levelRows().findByText('Default');
    expect(levelRows().getAllByRole('textbox').map((b) => (b as HTMLInputElement).value)).toEqual(['High', 'Medium', 'Low']);
    expect(levelRows().getByRole('button', { name: 'Make High the default' })).toBeInTheDocument();
    expect(levelRows().getAllByText('1 task')).toHaveLength(2);
  });

  it('makes another level the default for new tasks (PR-2)', async () => {
    api.prios.update.mockImplementation(async (id) => {
      prios = prios.map((p) => ({ ...p, isDefault: p.id === id }));
      return prios.find((p) => p.id === id)!;
    });
    await renderOrganizer();
    await userEvent.click(await levelRows().findByRole('button', { name: 'Make Low the default' }));
    expect(api.prios.update).toHaveBeenCalledWith('lo', { isDefault: true });
    expect(await screen.findByRole('status')).toHaveTextContent('New tasks now start as Low.');
    await waitFor(() => expect(levelRows().getByRole('button', { name: 'Make Medium the default' })).toBeInTheDocument());
  });

  it('says where a deleted level’s tasks go and that the default moves too (PR-3)', async () => {
    api.prios.remove.mockResolvedValue({ movedTasks: 1, movedTo: prios[2]! });
    await renderOrganizer();
    await userEvent.click(await levelRows().findByRole('button', { name: 'Delete Medium' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Delete “Medium”? Its 1 task move to Low. Low becomes the default.');
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Delete' }));
    expect(api.prios.remove).toHaveBeenCalledWith('md');
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted “Medium”. 1 task moved to Low.');
  });

  it('keeps at least one level', async () => {
    prios = [prios[1]!];
    await renderOrganizer();
    expect(await levelRows().findByRole('button', { name: 'Delete Medium' })).toBeDisabled();
  });
});
