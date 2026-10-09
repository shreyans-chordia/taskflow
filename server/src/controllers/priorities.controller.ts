import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { uid } from '../middleware/auth.js';
import { PriorityModel } from '../models/Priority.js';
import { TaskModel } from '../models/Task.js';
import { objectId, parse, priorityCreateSchema, priorityUpdateSchema, reorderSchema } from '../schemas/index.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

const { trusted } = mongoose;
const MAX_LEVELS = 10;

const ordered = (userId: string) => PriorityModel.find({ userId }).sort({ order: 1, createdAt: 1 });

export async function list(req: Request, res: Response) {
  res.json({ priorities: (await ordered(uid(req))).map((p) => p.toJSON()) });
}

/** Adds a level at `position` (0 = most important); the levels below it move down one. */
export async function create(req: Request, res: Response) {
  const userId = uid(req);
  const body = parse(priorityCreateSchema, req.body);
  const levels = await ordered(userId);
  if (levels.length >= MAX_LEVELS) throw badRequest(`You can have up to ${MAX_LEVELS} priority levels.`);
  if (levels.some((l) => l.nameKey === body.name.toLowerCase())) throw conflict(`"${body.name}" already exists.`, { name: `"${body.name}" already exists.` });
  const pos = Math.min(body.position ?? levels.length, levels.length);
  await PriorityModel.updateMany({ userId, order: trusted({ $gte: pos }) }, { $inc: { order: 1 } });
  const level = await PriorityModel.create({ userId, name: body.name, nameKey: body.name.toLowerCase(), color: body.color, order: pos });
  res.status(201).json({ priority: level.toJSON() });
}

export async function update(req: Request, res: Response) {
  const userId = uid(req);
  const body = parse(priorityUpdateSchema, req.body);
  const level = await PriorityModel.findOne({ _id: parse(objectId, req.params.id), userId });
  if (!level) throw notFound('Priority level');
  if (body.name !== undefined) {
    if (await PriorityModel.exists({ userId, nameKey: body.name.toLowerCase(), _id: trusted({ $ne: level._id }) })) {
      throw conflict(`"${body.name}" already exists.`, { name: `"${body.name}" already exists.` });
    }
    level.name = body.name;
  }
  if (body.color !== undefined) level.color = body.color;
  if (body.isDefault) {
    await PriorityModel.updateMany({ userId, _id: trusted({ $ne: level._id }) }, { $set: { isDefault: false } });
    level.isDefault = true;
  }
  await level.save();
  res.json({ priority: level.toJSON() });
}

/** Deleting a level moves its tasks to the next level down (or up, if it was the last one). The last level cannot go. */
export async function remove(req: Request, res: Response) {
  const userId = uid(req);
  const levelId = parse(objectId, req.params.id);
  const levels = await ordered(userId);
  const i = levels.findIndex((l) => String(l._id) === levelId);
  if (i < 0) throw notFound('Priority level');
  if (levels.length === 1) throw badRequest('Keep at least one priority level.');
  const level = levels[i]!;
  const target = (levels[i + 1] ?? levels[i - 1])!;
  const { modifiedCount } = await TaskModel.updateMany({ userId, priorityId: level._id }, { $set: { priorityId: target._id } });
  if (level.isDefault) await PriorityModel.updateOne({ _id: target._id }, { $set: { isDefault: true } });
  await level.deleteOne();
  await PriorityModel.updateMany({ userId, order: trusted({ $gt: level.order }) }, { $inc: { order: -1 } });
  res.json({ movedTasks: modifiedCount, movedTo: target.toJSON() });
}

export async function reorder(req: Request, res: Response) {
  const userId = uid(req);
  const { ids } = parse(reorderSchema, req.body);
  const owned = new Set((await ordered(userId)).map((p) => String(p._id)));
  if (ids.length !== owned.size || new Set(ids).size !== ids.length || !ids.every((x) => owned.has(x))) {
    throw badRequest('Send every one of your priority level ids exactly once.');
  }
  await PriorityModel.bulkWrite(ids.map((pid, order) => ({ updateOne: { filter: { _id: pid, userId }, update: { $set: { order } } } })));
  return list(req, res);
}
