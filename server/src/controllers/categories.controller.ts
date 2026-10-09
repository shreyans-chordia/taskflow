import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { uid } from '../middleware/auth.js';
import { CategoryModel } from '../models/Category.js';
import { TaskModel } from '../models/Task.js';
import { categoryCreateSchema, categoryUpdateSchema, objectId, parse, reorderSchema } from '../schemas/index.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';

const { trusted } = mongoose;
const MAX_CATEGORIES = 50;

export async function list(req: Request, res: Response) {
  const cats = await CategoryModel.find({ userId: uid(req) }).sort({ order: 1, createdAt: 1 });
  res.json({ categories: cats.map((c) => c.toJSON()) });
}

/** CAT-1 / CAT-5: unique name per user, compared without case. */
export async function create(req: Request, res: Response) {
  const userId = uid(req);
  const body = parse(categoryCreateSchema, req.body);
  const count = await CategoryModel.countDocuments({ userId });
  if (count >= MAX_CATEGORIES) throw badRequest(`You can have up to ${MAX_CATEGORIES} categories.`);
  if (await CategoryModel.exists({ userId, nameKey: body.name.toLowerCase() })) throw conflict(`"${body.name}" already exists.`, { name: `"${body.name}" already exists.` });
  const cat = await CategoryModel.create({ ...body, userId, order: count, nameKey: body.name.toLowerCase() });
  res.status(201).json({ category: cat.toJSON() });
}

export async function update(req: Request, res: Response) {
  const userId = uid(req);
  const body = parse(categoryUpdateSchema, req.body);
  const cat = await CategoryModel.findOne({ _id: parse(objectId, req.params.id), userId });
  if (!cat) throw notFound('Category');
  if (body.name !== undefined) {
    if (cat.locked && body.name !== cat.name) throw forbidden(`"${cat.name}" is where tasks go when a category is deleted, so it keeps its name.`);
    const clash = await CategoryModel.exists({ userId, nameKey: body.name.toLowerCase(), _id: trusted({ $ne: cat._id }) });
    if (clash) throw conflict(`"${body.name}" already exists.`, { name: `"${body.name}" already exists.` });
    cat.name = body.name;
  }
  if (body.color !== undefined) cat.color = body.color;
  await cat.save();
  res.json({ category: cat.toJSON() });
}

/** CAT-4: deleting a category removes it from every task; the tasks themselves stay. */
export async function remove(req: Request, res: Response) {
  const userId = uid(req);
  const cat = await CategoryModel.findOne({ _id: parse(objectId, req.params.id), userId });
  if (!cat) throw notFound('Category');
  if (cat.locked) throw forbidden(`"${cat.name}" cannot be deleted.`);
  const { modifiedCount } = await TaskModel.updateMany({ userId, categoryIds: cat._id }, { $pull: { categoryIds: cat._id } });
  await cat.deleteOne();
  res.json({ removedFromTasks: modifiedCount });
}

/** PUT /api/categories/order — the first six are the trays on the desk shelf. */
export async function reorder(req: Request, res: Response) {
  const userId = uid(req);
  const { ids } = parse(reorderSchema, req.body);
  const owned = await CategoryModel.find({ userId }).select('_id');
  const ownedIds = new Set(owned.map((c) => String(c._id)));
  if (ids.length !== ownedIds.size || new Set(ids).size !== ids.length || !ids.every((i) => ownedIds.has(i))) {
    throw badRequest('Send every one of your category ids exactly once.');
  }
  await CategoryModel.bulkWrite(ids.map((cid, order) => ({ updateOne: { filter: { _id: cid, userId }, update: { $set: { order } } } })));
  return list(req, res);
}
