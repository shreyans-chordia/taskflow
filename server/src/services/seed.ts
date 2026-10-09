import type { Types } from 'mongoose';
import { CategoryModel } from '../models/Category.js';
import { PriorityModel } from '../models/Priority.js';

export const DEFAULT_CATEGORIES = [
  { name: 'Study', color: '#4F86D9' },
  { name: 'Development', color: '#F2AE2E' },
  { name: 'Personal', color: '#9A68D6' },
  { name: 'Health', color: '#6DB352' },
  { name: 'Career', color: '#E25F5F' },
  { name: 'Others', color: '#8E959E', locked: true },
];

export const DEFAULT_PRIORITIES = [
  { name: 'High', color: '#E04A2F' },
  { name: 'Medium', color: '#F0A81C', isDefault: true },
  { name: 'Low', color: '#4E9E78' },
];

/** Every new account starts with the same categories and three priority levels, which the user can then change. */
export async function seedDefaults(userId: Types.ObjectId): Promise<void> {
  await CategoryModel.insertMany(DEFAULT_CATEGORIES.map((c, order) => ({ ...c, userId, order, nameKey: c.name.toLowerCase() })));
  await PriorityModel.insertMany(DEFAULT_PRIORITIES.map((p, order) => ({ ...p, userId, order, nameKey: p.name.toLowerCase() })));
}
