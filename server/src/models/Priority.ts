import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/** A user-defined priority level. `order` 0 is the most important level. */
const prioritySchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 24 },
    nameKey: { type: String, required: true },
    color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
    order: { type: Number, required: true, default: 0 },
    /** The level new tasks get when none is chosen (PR-2: Medium by default). */
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);
prioritySchema.index({ userId: 1, nameKey: 1 }, { unique: true });
prioritySchema.pre('validate', function setKey(next) {
  if (this.name) this.nameKey = this.name.trim().toLowerCase();
  next();
});
prioritySchema.set('toJSON', {
  transform: (_d, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.nameKey;
    delete ret.userId;
    return ret;
  },
});

export type Priority = InferSchemaType<typeof prioritySchema>;
export const PriorityModel = model('Priority', prioritySchema);
