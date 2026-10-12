import { describe, expect, it } from 'vitest';
import { Client, useDb } from './helpers.js';

useDb();

async function setup() {
  const c = await Client.signedUp();
  const cats = (await c.get('/api/categories')).body.categories as Array<{ id: string; name: string; color: string; locked: boolean }>;
  const prios = (await c.get('/api/priorities')).body.priorities as Array<{ id: string; name: string; isDefault: boolean }>;
  const cat = (n: string) => cats.find((x) => x.name === n)!;
  const pr = (n: string) => prios.find((x) => x.name === n)!;
  return { c, cats, prios, cat, pr };
}

describe('tasks', () => {
  it('creates a task with the default Medium priority and no categories (TASK-1, PR-2, CAT-3)', async () => {
    const { c, pr } = await setup();
    const res = await c.post('/api/tasks', { title: '  Submit Lab 7 record  ' });
    expect(res.status).toBe(201);
    expect(res.body.task).toMatchObject({ title: 'Submit Lab 7 record', priorityId: pr('Medium').id, categoryIds: [], done: false });
  });

  it('requires a title (TASK-6)', async () => {
    const { c } = await setup();
    const res = await c.post('/api/tasks', { title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.title).toBeTruthy();
  });

  it('supports several categories, a deadline and editing every field (CAT-2, DL-1, TASK-4)', async () => {
    const { c, cat, pr } = await setup();
    const created = (await c.post('/api/tasks', { title: 'RDBMS project', categoryIds: [cat('Study').id, cat('Career').id], deadline: '2026-10-20' })).body.task;
    expect(created.categoryIds).toHaveLength(2);
    const upd = await c.patch(`/api/tasks/${created.id}`, { priorityId: pr('High').id, deadline: null, done: true });
    expect(upd.status).toBe(200);
    expect(upd.body.task).toMatchObject({ priorityId: pr('High').id, deadline: null, done: true });
    expect(upd.body.task.doneAt).toBeTruthy();
  });

  it('manages a subtask checklist (SUB-1..3)', async () => {
    const { c } = await setup();
    const t = (await c.post('/api/tasks', { title: 'DSA revision' })).body.task;
    let res = await c.post(`/api/tasks/${t.id}/subtasks`, { title: 'Trees & graphs' });
    expect(res.status).toBe(201);
    const sub = res.body.task.subtasks[0];
    res = await c.patch(`/api/tasks/${t.id}/subtasks/${sub.id}`, { done: true });
    expect(res.body.task.subtasks[0].done).toBe(true);
    res = await c.del(`/api/tasks/${t.id}/subtasks/${sub.id}`);
    expect(res.status).toBe(200);
    expect(res.body.task.subtasks).toHaveLength(0);
  });

  it('searches by keyword and combines filters with AND (SF-1..SF-5)', async () => {
    const { c, cat, pr } = await setup();
    await c.post('/api/tasks', { title: 'Read (a) book', categoryIds: [cat('Personal').id], priorityId: pr('Low').id });
    await c.post('/api/tasks', { title: 'Read papers', categoryIds: [cat('Study').id], priorityId: pr('High').id });
    const done = (await c.post('/api/tasks', { title: 'Gym session', categoryIds: [cat('Health').id] })).body.task;
    await c.patch(`/api/tasks/${done.id}`, { done: true });

    expect((await c.get('/api/tasks?q=read')).body.tasks).toHaveLength(2);
    // Regex characters in the search box are treated as plain text.
    expect((await c.get(`/api/tasks?q=${encodeURIComponent('(a)')}`)).body.tasks).toHaveLength(1);
    expect((await c.get(`/api/tasks?q=read&priority=${pr('High').id}`)).body.tasks).toHaveLength(1);
    expect((await c.get('/api/tasks?status=done')).body.tasks).toHaveLength(1);
    expect((await c.get(`/api/tasks?category=${cat('Study').id}&status=open`)).body.tasks).toHaveLength(1);
    expect((await c.get('/api/tasks?q=nothing-matches')).body.tasks).toHaveLength(0);
  });

  it('deletes a task (TASK-5)', async () => {
    const { c } = await setup();
    const t = (await c.post('/api/tasks', { title: 'Temp' })).body.task;
    expect((await c.del(`/api/tasks/${t.id}`)).status).toBe(204);
    expect((await c.get(`/api/tasks/${t.id}`)).status).toBe(404);
  });
});

describe('per-account isolation', () => {
  it("never lets one account read, change or delete another account's tasks", async () => {
    const a = await setup();
    const b = await setup();
    const t = (await a.c.post('/api/tasks', { title: 'Private' })).body.task;
    expect((await b.c.get(`/api/tasks/${t.id}`)).status).toBe(404);
    expect((await b.c.patch(`/api/tasks/${t.id}`, { title: 'Hacked' })).status).toBe(404);
    expect((await b.c.del(`/api/tasks/${t.id}`)).status).toBe(404);
    expect((await b.c.get('/api/tasks')).body.tasks).toHaveLength(0);
    expect((await a.c.get(`/api/tasks/${t.id}`)).body.task.title).toBe('Private');
  });

  it("refuses to attach another account's category or priority level", async () => {
    const a = await setup();
    const b = await setup();
    const res = await b.c.post('/api/tasks', { title: 'Sneaky', categoryIds: [a.cat('Study').id] });
    expect(res.status).toBe(400);
    const res2 = await b.c.post('/api/tasks', { title: 'Sneaky', priorityId: a.pr('High').id });
    expect(res2.status).toBe(400);
  });
});

describe('categories', () => {
  it('keeps names unique per account regardless of case (CAT-5)', async () => {
    const { c } = await setup();
    expect((await c.post('/api/categories', { name: 'Finance', color: '#2FA6A0' })).status).toBe(201);
    expect((await c.post('/api/categories', { name: 'finance', color: '#2FA6A0' })).status).toBe(409);
  });

  it('removes a deleted category from its tasks but keeps the tasks (CAT-4)', async () => {
    const { c, cat } = await setup();
    const t = (await c.post('/api/tasks', { title: 'Run', categoryIds: [cat('Health').id, cat('Personal').id] })).body.task;
    const res = await c.del(`/api/categories/${cat('Health').id}`);
    expect(res.body.removedFromTasks).toBe(1);
    expect((await c.get(`/api/tasks/${t.id}`)).body.task.categoryIds).toEqual([cat('Personal').id]);
  });

  it('protects the fallback category', async () => {
    const { c, cat } = await setup();
    expect((await c.del(`/api/categories/${cat('Others').id}`)).status).toBe(403);
    expect((await c.patch(`/api/categories/${cat('Others').id}`, { name: 'Misc' })).status).toBe(403);
    expect((await c.patch(`/api/categories/${cat('Others').id}`, { color: '#123456' })).status).toBe(200);
  });

  it('reorders categories only when given every id exactly once', async () => {
    const { c, cats } = await setup();
    const ids = cats.map((x) => x.id).reverse();
    const res = await c.put('/api/categories/order', { ids });
    expect(res.status).toBe(200);
    expect(res.body.categories[0].id).toBe(ids[0]);
    expect((await c.put('/api/categories/order', { ids: ids.slice(1) })).status).toBe(400);
  });
});

describe('priority levels', () => {
  it('adds a level at the top and moves tasks to the next level when one is deleted', async () => {
    const { c, pr } = await setup();
    const urgent = (await c.post('/api/priorities', { name: 'Urgent', color: '#8E44AD', position: 0 })).body.priority;
    let list = (await c.get('/api/priorities')).body.priorities;
    expect(list.map((p: { name: string }) => p.name)).toEqual(['Urgent', 'High', 'Medium', 'Low']);

    const t = (await c.post('/api/tasks', { title: 'Hot', priorityId: pr('High').id })).body.task;
    const res = await c.del(`/api/priorities/${pr('High').id}`);
    expect(res.body.movedTasks).toBe(1);
    expect((await c.get(`/api/tasks/${t.id}`)).body.task.priorityId).toBe(pr('Medium').id);
    list = (await c.get('/api/priorities')).body.priorities;
    expect(list.map((p: { order: number }) => p.order)).toEqual([0, 1, 2]);
    expect(urgent.order).toBe(0);
  });

  it('sets the default level for new tasks, and hands it on when that level is deleted (PR-2)', async () => {
    const { c, pr } = await setup();
    expect(pr('Medium').isDefault).toBe(true);
    const res = await c.patch(`/api/priorities/${pr('Low').id}`, { isDefault: true });
    expect(res.body.priority.isDefault).toBe(true);
    let list = (await c.get('/api/priorities')).body.priorities as Array<{ name: string; isDefault: boolean }>;
    expect(list.filter((p) => p.isDefault).map((p) => p.name)).toEqual(['Low']); // only ever one default
    expect((await c.post('/api/tasks', { title: 'Quiet' })).body.task.priorityId).toBe(pr('Low').id);

    // Low is the last level, so its tasks (and the default) move up to Medium.
    await c.del(`/api/priorities/${pr('Low').id}`);
    list = (await c.get('/api/priorities')).body.priorities;
    expect(list.filter((p) => p.isDefault).map((p) => p.name)).toEqual(['Medium']);
  });

  it('renames and recolours a level, keeping names unique (PR-1)', async () => {
    const { c, pr } = await setup();
    const res = await c.patch(`/api/priorities/${pr('High').id}`, { name: 'Urgent', color: '#C2185B' });
    expect(res.body.priority).toMatchObject({ name: 'Urgent', color: '#C2185B' });
    expect((await c.patch(`/api/priorities/${pr('Low').id}`, { name: 'urgent' })).status).toBe(409);
  });

  it('reorders levels only when given every id exactly once', async () => {
    const { c, prios } = await setup();
    const ids = prios.map((x) => x.id).reverse();
    const res = await c.put('/api/priorities/order', { ids });
    expect(res.body.priorities.map((p: { id: string }) => p.id)).toEqual(ids);
    expect((await c.put('/api/priorities/order', { ids: [ids[0], ids[0], ids[1]] })).status).toBe(400);
  });

  it('keeps at least one level', async () => {
    const { c, prios } = await setup();
    await c.del(`/api/priorities/${prios[0]!.id}`);
    await c.del(`/api/priorities/${prios[1]!.id}`);
    expect((await c.del(`/api/priorities/${prios[2]!.id}`)).status).toBe(400);
  });
});

describe('categories and priority levels belong to one account', () => {
  it("never lets another account rename, recolour, reorder or delete them", async () => {
    const a = await setup();
    const b = await setup();
    const study = a.cat('Study');
    const high = a.pr('High');

    expect((await b.c.patch(`/api/categories/${study.id}`, { name: 'Mine' })).status).toBe(404);
    expect((await b.c.patch(`/api/categories/${study.id}`, { color: '#000000' })).status).toBe(404);
    expect((await b.c.del(`/api/categories/${study.id}`)).status).toBe(404);
    expect((await b.c.patch(`/api/priorities/${high.id}`, { name: 'Mine' })).status).toBe(404);
    expect((await b.c.patch(`/api/priorities/${high.id}`, { isDefault: true })).status).toBe(404);
    expect((await b.c.del(`/api/priorities/${high.id}`)).status).toBe(404);
    // Someone else's ids are not "every one of your ids".
    expect((await b.c.put('/api/categories/order', { ids: a.cats.map((x) => x.id) })).status).toBe(400);
    expect((await b.c.put('/api/priorities/order', { ids: a.prios.map((x) => x.id) })).status).toBe(400);

    // A's are untouched.
    const cats = (await a.c.get('/api/categories')).body.categories as Array<{ id: string; name: string; color: string }>;
    expect(cats.find((x) => x.id === study.id)).toMatchObject({ name: 'Study', color: study.color });
    const prios = (await a.c.get('/api/priorities')).body.priorities as Array<{ id: string; name: string; isDefault: boolean }>;
    expect(prios.map((p) => p.id)).toEqual(a.prios.map((p) => p.id));
    expect(prios.find((p) => p.id === high.id)).toMatchObject({ name: 'High', isDefault: false });
  });
});
