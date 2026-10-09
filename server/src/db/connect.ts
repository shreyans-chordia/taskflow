import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

// Treat query objects built from user input as literal values, so `{ $gt: '' }` can never become an operator.
mongoose.set('sanitizeFilter', true);
// Ignore unknown fields in filters instead of matching on them.
mongoose.set('strictQuery', true);

export async function connectDb(uri: string): Promise<typeof mongoose> {
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, autoIndex: true });
  logger.info({ db: conn.connection.name }, 'MongoDB connected');
  return conn;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
