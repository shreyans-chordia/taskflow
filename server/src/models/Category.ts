import { Schema, model, Types, type InferSchemaType } from 'mongoose';

const categorySchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 24 },
    /** Lower-cased name, used to keep names unique per user regardless of case (CAT-5). */
    nameKey: { type: String, required: true },
    color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
    order: { type: Number, required: true, default: 0 },
    /** The fallback category ("Others") cannot be renamed or deleted. */
    locked: { type: Boolean, default: false },
  },
  { timestamps: true },
);
categorySchema.index({ userId: 1, nameKey: 1 }, { unique: true });
categorySchema.pre('validate', function setKey(next) {
  if (this.name) this.nameKey = this.name.trim().toLowerCase();
  next();
});
categorySchema.set('toJSON', {
  transform: (_d, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.nameKey;
    delete ret.userId;
    return ret;
  },
});

export type Category = InferSchemaType<typeof categorySchema>;
export const CategoryModel = model('Category', categorySchema);
