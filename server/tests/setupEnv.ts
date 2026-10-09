import { inject } from 'vitest';

// Must run before src/config/env.ts is imported anywhere, which is why this is a setup file.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = inject('mongoUri');
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';
process.env.CORS_ORIGINS = 'http://localhost:5173';
