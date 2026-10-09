import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/** Subtasks are a simple checklist embedded in the task (SUB-4: no deadline, priority or category of their own). */
const subtaskSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  done: { type: Boolean, default: false },
});

const taskSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    /** CAT-2: a task can carry several categories; CAT-3 allows none. */
    categoryIds: { type: [Types.ObjectId], ref: 'Category', default: [] },
    priorityId: { type: Types.ObjectId, ref: 'Priority', required: true },
    /** DL-1: optional deadline. When `hasTime` is false only the date part is meaningful. */
    deadline: { type: Date, default: null },
    hasTime: { type: Boolean, default: false },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    subtasks: { type: [subtaskSchema], default: [] },
  },
  { timestamps: true },
);
taskSchema.index({ userId: 1, done: 1, deadline: 1 });
taskSchema.index({ userId: 1, categoryIds: 1 });

taskSchema.set('toJSON', {
  transform: (_d, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.userId;
    if (Array.isArray(ret.subtasks)) {
      ret.subtasks = (ret.subtasks as Array<Record<string, unknown>>).map(({ _id, ...s }) => ({ id: String(_id), ...s }));
    }
    return ret;
  },
});

export type Task = InferSchemaType<typeof taskSchema>;
export const TaskModel = model('Task', taskSchema);
