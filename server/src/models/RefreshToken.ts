import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/**
 * One row per issued refresh token. Only a SHA-256 hash of the token is stored, so a database leak
 * does not hand out working sessions. Tokens issued from one sign-in share a `family`: when a token
 * that was already rotated is presented again (a sign of theft), the whole family is revoked.
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    /** Set when this token has been exchanged for a new one or signed out. */
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    userAgent: { type: String, maxlength: 300, default: '' },
  },
  { timestamps: true },
);

// MongoDB deletes expired tokens on its own.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
