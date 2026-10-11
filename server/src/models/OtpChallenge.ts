import { Schema, model, Types, type InferSchemaType } from 'mongoose';

/**
 * One pending one-time code: the second step of a sign-in, or a password reset.
 *
 * The browser holds a random challenge token in an HttpOnly cookie; only its SHA-256 hash is stored here,
 * next to an HMAC of the 6-digit code. A stolen database therefore yields neither a usable challenge nor
 * the code. Each challenge allows a few wrong guesses, a few resends, and expires after OTP_TTL_MIN minutes.
 */
const otpChallengeSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ['login', 'reset'], required: true },
    /** Null for a reset requested for an email that has no account: it behaves the same but can never succeed. */
    userId: { type: Types.ObjectId, ref: 'User', default: null, index: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    sends: { type: Number, default: 1 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// MongoDB deletes expired challenges on its own.
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpChallenge = InferSchemaType<typeof otpChallengeSchema>;
export const OtpChallengeModel = model('OtpChallenge', otpChallengeSchema);
