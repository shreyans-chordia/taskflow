import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}.` } });
};

/** Turns every error into the same JSON shape. Internal details never reach the client in production. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
    return;
  }
  if (err?.code === 11000) {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'That name is already taken.' } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request body is too large.' } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } });
    return;
  }
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: env.isProd ? 'Something went wrong on our side.' : String(err?.message ?? err) } });
};
