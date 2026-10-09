import { z } from 'zod';
import { MAX_PASSWORD_BYTES } from '../services/passwords.js';
import { badRequest } from '../utils/errors.js';

/**
 * Every request body and query string is parsed with a strict schema before it reaches a controller.
 * Unknown keys are rejected and every field has a type and length limit, so nothing unexpected
 * (an operator object, a 5 MB string, a role flag) can slip through to the database.
 */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    fields[key] ??= issue.message;
  }
  throw badRequest('Some fields need a look.', fields);
}

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Not a valid id.');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #2F4E7A.');
const label = z.string().trim().min(1, 'Give it a name.').max(24, 'Keep it to 24 characters.');

/* ---------- auth ---------- */
const email = z.string().trim().toLowerCase().pipe(z.email('That does not look like an email address.').max(254));
export const signupSchema = z.strictObject({
  name: z.string().trim().min(1, 'Tell us what to call you.').max(60, 'Keep it to 60 characters.'),
  email,
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .refine((p) => Buffer.byteLength(p, 'utf8') <= MAX_PASSWORD_BYTES, `Keep it under ${MAX_PASSWORD_BYTES} bytes.`),
});
export const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1, 'Enter your password.').max(200),
});

/* ---------- tasks ---------- */
const deadline = z.union([z.iso.datetime({ offset: true }), z.iso.date()]).nullable();
export const taskCreateSchema = z.strictObject({
  title: z.string().trim().min(1, 'Give the task a title.').max(200, 'Keep the title under 200 characters.'),
  description: z.string().trim().max(2000).default(''),
  categoryIds: z.array(objectId).max(10).default([]),
  priorityId: objectId.optional(),
  deadline: deadline.default(null),
  hasTime: z.boolean().default(false),
});
export const taskUpdateSchema = z
  .strictObject({
    title: z.string().trim().min(1, 'Give the task a title.').max(200),
    description: z.string().trim().max(2000),
    categoryIds: z.array(objectId).max(10),
    priorityId: objectId,
    deadline,
    hasTime: z.boolean(),
    done: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');
export const taskQuerySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  category: objectId.optional(),
  priority: objectId.optional(),
  status: z.enum(['all', 'open', 'done']).default('all'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export const subtaskCreateSchema = z.strictObject({ title: z.string().trim().min(1, 'Give it a title.').max(120) });
export const subtaskUpdateSchema = z
  .strictObject({ title: z.string().trim().min(1).max(120), done: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

/* ---------- categories & priority levels ---------- */
export const categoryCreateSchema = z.strictObject({ name: label, color: hexColor });
export const categoryUpdateSchema = z.strictObject({ name: label, color: hexColor }).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update.');
export const reorderSchema = z.strictObject({ ids: z.array(objectId).min(1).max(100) });
export const priorityCreateSchema = z.strictObject({ name: label, color: hexColor, position: z.number().int().min(0).optional() });
export const priorityUpdateSchema = z
  .strictObject({ name: label, color: hexColor, isDefault: z.literal(true) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');
