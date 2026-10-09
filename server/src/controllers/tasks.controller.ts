import type { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { uid } from '../middleware/auth.js';
import { CategoryModel } from '../models/Category.js';
import { PriorityModel } from '../models/Priority.js';
import { TaskModel } from '../models/Task.js';
import { objectId, parse, subtaskCreateSchema, subtaskUpdateSchema, taskCreateSchema, taskQuerySchema, taskUpdateSchema } from '../schemas/index.js';
import { badRequest, notFound } from '../utils/errors.js';

const { trusted } = mongoose;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const id = (req: Request, key = 'id') => parse(objectId, req.params[key]);

/** Every category and priority a task points at must belong to the same user (no borrowing ids from other accounts). */
async function assertOwned(userId: string, categoryIds: string[] | undefined, priorityId: string | undefined) {
  if (categoryIds?.length) {
    const unique = [...new Set(categoryIds)];
    const count = await CategoryModel.countDocuments({ userId, _id: trusted({ $in: unique }) });
    if (count !== unique.length) throw badRequest('Some fields need a look.', { categoryIds: 'One of those categories does not exist.' });
  }
  if (priorityId && !(await PriorityModel.exists({ userId, _id: priorityId }))) {
    throw badRequest('Some fields need a look.', { priorityId: 'That priority level does not exist.' });
  }
}

const toDate = (d: string | null | undefined) => (d == null ? d : new Date(d));

/** GET /api/tasks — SF-1..SF-5: keyword search plus category, priority, status and date filters, combined with AND. */
export async function list(req: Request, res: Response) {
  const userId = uid(req);
  const q = parse(taskQuerySchema, req.query);
  const filter: Record<string, unknown> = { userId };
  if (q.status !== 'all') filter.done = q.status === 'done';
  if (q.category) filter.categoryIds = q.category;
  if (q.priority) filter.priorityId = q.priority;
  if (q.from || q.to) {
    filter.deadline = trusted({ ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) });
  }
  if (q.q) {
    const re = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ title: trusted({ $regex: re }) }, { description: trusted({ $regex: re }) }];
  }
  const tasks = await TaskModel.find(filter).sort({ done: 1, deadline: 1, createdAt: -1 }).limit(1000);
  res.json({ tasks: tasks.map((t) => t.toJSON()) });
}

/** POST /api/tasks */
export async function create(req: Request, res: Response) {
  const userId = uid(req);
  const body = parse(taskCreateSchema, req.body);
  await assertOwned(userId, body.categoryIds, body.priorityId);
  let priorityId = body.priorityId;
  if (!priorityId) {
    // PR-2: fall back to the user's default level (Medium unless they changed it).
    const def = (await PriorityModel.findOne({ userId, isDefault: true })) ?? (await PriorityModel.findOne({ userId }).sort({ order: 1 }));
    if (!def) throw badRequest('Create a priority level first.');
    priorityId = String(def._id);
  }
  const task = await TaskModel.create({ ...body, priorityId, deadline: toDate(body.deadline), userId });
  res.status(201).json({ task: task.toJSON() });
}

/** GET /api/tasks/:id */
export async function get(req: Request, res: Response) {
  const task = await TaskModel.findOne({ _id: id(req), userId: uid(req) });
  if (!task) throw notFound('Task');
  res.json({ task: task.toJSON() });
}

/** PATCH /api/tasks/:id */
export async function update(req: Request, res: Response) {
  const userId = uid(req);
  const body = parse(taskUpdateSchema, req.body);
  await assertOwned(userId, body.categoryIds, body.priorityId);
  const set: Record<string, unknown> = { ...body };
  if ('deadline' in body) set.deadline = toDate(body.deadline);
  if (body.done !== undefined) set.doneAt = body.done ? new Date() : null;
  const task = await TaskModel.findOneAndUpdate({ _id: id(req), userId }, { $set: set }, { new: true, runValidators: true });
  if (!task) throw notFound('Task');
  res.json({ task: task.toJSON() });
}

/** DELETE /api/tasks/:id — TASK-7: the task's subtasks go with it (they live inside the task document). */
export async function remove(req: Request, res: Response) {
  const result = await TaskModel.deleteOne({ _id: id(req), userId: uid(req) });
  if (!result.deletedCount) throw notFound('Task');
  res.status(204).end();
}

/* ---------- subtasks ---------- */
export async function addSubtask(req: Request, res: Response) {
  const body = parse(subtaskCreateSchema, req.body);
  const task = await TaskModel.findOneAndUpdate(
    { _id: id(req), userId: uid(req), 'subtasks.49': trusted({ $exists: false }) }, // at most 50 per task
    { $push: { subtasks: { title: body.title, done: false } } },
    { new: true, runValidators: true },
  );
  if (!task) throw notFound('Task');
  res.status(201).json({ task: task.toJSON() });
}

export async function updateSubtask(req: Request, res: Response) {
  const body = parse(subtaskUpdateSchema, req.body);
  const subId = new Types.ObjectId(id(req, 'subId'));
  const set: Record<string, unknown> = {};
  if (body.title !== undefined) set['subtasks.$.title'] = body.title;
  if (body.done !== undefined) set['subtasks.$.done'] = body.done;
  const task = await TaskModel.findOneAndUpdate({ _id: id(req), userId: uid(req), 'subtasks._id': subId }, { $set: set }, { new: true, runValidators: true });
  if (!task) throw notFound('Subtask');
  res.json({ task: task.toJSON() });
}

/** SUB-3: removing a subtask leaves the parent task alone. */
export async function removeSubtask(req: Request, res: Response) {
  const subId = new Types.ObjectId(id(req, 'subId'));
  const task = await TaskModel.findOneAndUpdate({ _id: id(req), userId: uid(req), 'subtasks._id': subId }, { $pull: { subtasks: { _id: subId } } }, { new: true });
  if (!task) throw notFound('Subtask');
  res.json({ task: task.toJSON() });
}
