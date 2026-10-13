import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { Category, Priority, Task } from '../api/types';
import { TaskViews, type TaskView } from './TaskViews';

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
const base: Task = {
  id: 't1', title: 'RDBMS mini project', description: 'Normalise to 3NF.', categoryIds: ['c1'], priorityId: 'hi',
  deadline: '2026-10-20T00:00:00.000Z', hasTime: false, done: false, doneAt: null, createdAt: '', updatedAt: '',
  subtasks: [{ id: 's1', title: 'ER diagram', done: true }, { id: 's2', title: 'Normalise tables', done: false }],
};

function renderViews(initial: TaskView = { type: 'list' }, onExit?: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TaskViews titleId="tv-title" initial={initial} onExit={onExit} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.tasks.list.mockResolvedValue([base]);
  api.cats.list.mockResolvedValue(cats);
  api.prios.list.mockResolvedValue(prios);
});

describe('from the list to a task and back (TASK-3)', () => {
  it('opens a task from its title, shows everything about it, and Back returns to the list', async () => {
    renderViews();
    await userEvent.click(await screen.findByRole('button', { name: /^RDBMS mini project/ }));
    expect(screen.getByRole('heading', { name: 'RDBMS mini project' })).toHaveFocus();
    expect(screen.getByText('High priority')).toBeInTheDocument();
    expect(screen.getByText('Normalise to 3NF.')).toBeInTheDocument();
    expect(screen.getByText('Checklist · 1 of 2 done')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
  });
});

describe('a task (TASK-4, TASK-5, SUB-1 to SUB-3)', () => {
  it('ticks the task done at once', async () => {
    api.tasks.update.mockResolvedValue({ ...base, done: true });
    renderViews({ type: 'detail', id: 't1' });
    await screen.findByRole('checkbox', { name: 'Mark as complete' });
    api.tasks.list.mockResolvedValue([{ ...base, done: true }]); // what the server returns from now on
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Mark as complete' }));
    expect(screen.getByRole('checkbox', { name: 'Completed' })).toBeChecked();
    expect(api.tasks.update).toHaveBeenCalledWith('t1', { done: true });
  });

  it('adds, ticks and removes checklist items', async () => {
    api.tasks.addSubtask.mockResolvedValue({ ...base, subtasks: [...base.subtasks, { id: 's3', title: 'Write report', done: false }] });
    api.tasks.updateSubtask.mockResolvedValue({ ...base, subtasks: base.subtasks.map((s) => ({ ...s, done: true })) });
    api.tasks.removeSubtask.mockResolvedValue({ ...base, subtasks: [base.subtasks[1]!] });
    renderViews({ type: 'detail', id: 't1' });

    await userEvent.type(await screen.findByLabelText('New checklist item'), 'Write report{Enter}');
    expect(api.tasks.addSubtask).toHaveBeenCalledWith('t1', 'Write report');
    expect(await screen.findByText('Write report')).toBeInTheDocument();
    expect(screen.getByLabelText('New checklist item')).toHaveValue('');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Normalise tables' }));
    expect(api.tasks.updateSubtask).toHaveBeenCalledWith('t1', 's2', { done: true });

    await userEvent.click(screen.getByRole('button', { name: 'Remove ER diagram' }));
    expect(api.tasks.removeSubtask).toHaveBeenCalledWith('t1', 's1');
    await waitFor(() => expect(screen.queryByText('ER diagram')).not.toBeInTheDocument());
  });

  it('shows a checklist tick straight away, before the server answers', async () => {
    let finish: (t: Task) => void = () => {};
    api.tasks.updateSubtask.mockReturnValue(new Promise<Task>((r) => (finish = r)));
    renderViews({ type: 'detail', id: 't1' });
    const box = await screen.findByRole('checkbox', { name: 'Normalise tables' });
    // A synchronous click, checked at once: what a person sees in the same frame (and what Playwright's check() asserts).
    fireEvent.click(box);
    expect(box).toBeChecked(); // no flicker back while the save is in flight
    const saved = { ...base, subtasks: base.subtasks.map((s) => ({ ...s, done: true })) };
    api.tasks.list.mockResolvedValue([saved]);
    finish(saved);
    await waitFor(() => expect(screen.getByText('Checklist · 2 of 2 done')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Normalise tables' })).toBeChecked();
  });

  it('asks before deleting, and goes back to the list afterwards', async () => {
    api.tasks.remove.mockResolvedValue(undefined);
    renderViews({ type: 'detail', id: 't1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('alert');
    expect(confirm).toHaveTextContent('Delete “RDBMS mini project” and its 2 checklist items?');
    expect(within(confirm).getByRole('button', { name: 'Keep it' })).toHaveFocus();
    expect(api.tasks.remove).not.toHaveBeenCalled();

    api.tasks.list.mockResolvedValue([]);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete task' }));
    expect(api.tasks.remove).toHaveBeenCalledWith('t1');
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted “RDBMS mini project”.');
    expect(screen.getByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
  });

});

describe('the corkboard (TASK-2, TASK-4, TASK-5, CAT-2)', () => {
  it('pins every task as a note, with a chip per category', async () => {
    renderViews();
    expect(await screen.findByRole('button', { name: 'RDBMS mini project' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
    const chips = within(screen.getByRole('group', { name: 'Categories' }));
    expect(chips.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(chips.getByRole('button', { name: /^Health/ }));
    expect(screen.getByRole('heading', { name: 'Health tasks' })).toBeInTheDocument();
    expect(screen.getByText('No tasks in Health yet.')).toBeInTheDocument();
  });

  it('Edit mode opens the note’s form, and saving comes back to the board, still in Edit mode', async () => {
    api.tasks.update.mockResolvedValue({ ...base, title: 'RDBMS project' });
    renderViews();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Edit mode: pick a note to change it.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'RDBMS mini project: edit' }));
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    api.tasks.list.mockResolvedValue([{ ...base, title: 'RDBMS project' }]);
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'RDBMS project');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { name: 'Your tasks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Delete mode asks first, Keep leaves it, Delete removes it', async () => {
    api.tasks.remove.mockResolvedValue(undefined as never);
    renderViews();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'RDBMS mini project: delete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Delete “RDBMS mini project” and its 2 checklist items?');
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(api.tasks.remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'RDBMS mini project: delete' }));
    api.tasks.list.mockResolvedValue([]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(api.tasks.remove).toHaveBeenCalledWith('t1');
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted “RDBMS mini project”.');
  });

  it('+ Add task opens the full form, in the chosen category', async () => {
    renderViews({ type: 'list', categoryId: 'c2' });
    await userEvent.click(await screen.findByRole('button', { name: '+ Add task' }));
    expect(await screen.findByRole('heading', { name: 'New task' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Health' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the form (TASK-1, TASK-6, DL-1, CAT-2, PR-1)', () => {
  it('needs a title and does not call the API without one', async () => {
    renderViews({ type: 'form' });
    await userEvent.click(await screen.findByRole('button', { name: 'Pin to corkboard' }));
    expect(screen.getByText('Give the task a title.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveFocus();
    expect(api.tasks.create).not.toHaveBeenCalled();
  });

  it('creates a task with several categories, a level and a deadline with a time, then stays for the next one', async () => {
    api.tasks.create.mockImplementation(async (t) => ({ ...base, id: 't9', subtasks: [], ...t, deadline: t.deadline ?? null, hasTime: !!t.hasTime }) as Task);
    renderViews({ type: 'form' });
    await userEvent.type(await screen.findByLabelText('Title'), 'Revise SQL joins');
    await userEvent.type(screen.getByLabelText('Description · optional'), 'Inner, outer, self.');
    await userEvent.click(screen.getByRole('button', { name: 'Study' }));
    await userEvent.click(screen.getByRole('button', { name: 'Health' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Low' }));
    expect(screen.getByLabelText('Time · optional')).toBeDisabled(); // no time without a day
    await userEvent.type(screen.getByLabelText('Deadline · optional'), '2026-10-22');
    await userEvent.type(screen.getByLabelText('Time · optional'), '18:30');
    await userEvent.click(screen.getByRole('button', { name: 'Pin to corkboard' }));

    const body = api.tasks.create.mock.calls[0]![0];
    expect(body).toMatchObject({ title: 'Revise SQL joins', description: 'Inner, outer, self.', categoryIds: ['c1', 'c2'], priorityId: 'lo', hasTime: true });
    expect(body.deadline).toMatch(/^2026-10-22T18:30:00[+-]\d{2}:\d{2}$/);
    expect(await screen.findByRole('status')).toHaveTextContent('Pinned “Revise SQL joins” to your corkboard.');
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('uses the account default level when none is picked', async () => {
    api.tasks.create.mockResolvedValue({ ...base, id: 't9' });
    renderViews({ type: 'form' });
    expect(await screen.findByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.type(screen.getByLabelText('Title'), 'Anything');
    await userEvent.click(screen.getByRole('button', { name: 'Pin to corkboard' }));
    expect(api.tasks.create.mock.calls[0]![0]).toMatchObject({ priorityId: 'md', deadline: null, hasTime: false, categoryIds: [] });
  });

  it('edits a task with its values filled in, then goes back to it', async () => {
    api.tasks.update.mockImplementation(async (_id, patch) => ({ ...base, ...patch }) as Task);
    renderViews({ type: 'detail', id: 't1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit task' }));
    const title = screen.getByLabelText('Title');
    expect(title).toHaveValue('RDBMS mini project');
    expect(screen.getByLabelText('Deadline · optional')).toHaveValue('2026-10-20');
    expect(screen.getByRole('button', { name: 'Study' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.clear(title);
    await userEvent.type(title, 'RDBMS project report');
    await userEvent.click(screen.getByRole('button', { name: 'Remove the deadline' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(api.tasks.update).toHaveBeenCalledWith('t1', expect.objectContaining({ title: 'RDBMS project report', deadline: null, hasTime: false }));
    expect(await screen.findByRole('checkbox', { name: 'Mark as complete' })).toBeInTheDocument(); // back on the task
  });

  it('shows the server’s field message under the right field', async () => {
    api.tasks.create.mockRejectedValue(new ApiError(400, 'BAD_REQUEST', 'Some fields need a look.', { title: 'Keep the title under 200 characters.' }));
    renderViews({ type: 'form' });
    await userEvent.type(await screen.findByLabelText('Title'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Pin to corkboard' }));
    expect(await screen.findByText('Keep the title under 200 characters.')).toBeInTheDocument();
  });

  it('makes a new category on the spot and selects it (CAT-1)', async () => {
    api.cats.create.mockResolvedValue({ id: 'c3', name: 'Finance', color: '#9A68D6', order: 2, locked: false });
    renderViews({ type: 'form' });
    await userEvent.click(await screen.findByRole('button', { name: '+ New category' }));
    const name = screen.getByLabelText('Category name');
    await userEvent.type(name, 'study{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('“study” already exists.');
    expect(api.cats.create).not.toHaveBeenCalled();

    api.cats.list.mockResolvedValue([...cats, { id: 'c3', name: 'Finance', color: '#9A68D6', order: 2, locked: false }]);
    await userEvent.clear(name);
    await userEvent.type(name, 'Finance{Enter}'); // Enter adds the category, it does not submit the task
    // Study and Health already use the first and fourth swatches, so the suggested colour is the second one.
    expect(api.cats.create).toHaveBeenCalledWith({ name: 'Finance', color: '#F2AE2E' });
    expect(api.tasks.create).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Finance' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a new task from a tray starts in that category', async () => {
    renderViews({ type: 'form', categoryId: 'c2' });
    expect(await screen.findByRole('button', { name: 'Health' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Cancel on a form opened straight from the desk leaves the panel', async () => {
    const exit = vi.fn();
    renderViews({ type: 'form' }, exit);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(exit).toHaveBeenCalled();
  });
});
