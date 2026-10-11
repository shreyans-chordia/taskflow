import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    /** bcrypt hash; never selected unless a query asks for it explicitly. */
    passwordHash: { type: String, required: true, select: false },
    /** Consecutive failed sign-ins and the time the account unlocks after too many. */
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    /** How many code emails this account was sent in the current hour, so nobody can flood an inbox. */
    codeEmailsSent: { type: Number, default: 0, select: false },
    codeEmailsWindowStart: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.failedLogins;
    delete ret.lockedUntil;
    delete ret.codeEmailsSent;
    delete ret.codeEmailsWindowStart;
    return ret;
  },
});

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;
export const UserModel = model('User', userSchema);
