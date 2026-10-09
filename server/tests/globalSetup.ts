import type { TestProject } from 'vitest/node';

/**
 * Starts a throwaway in-memory MongoDB for the test run. Set TEST_MONGODB_URI to use an existing
 * server instead (for example a local `docker compose up mongo`).
 */
export default async function setup(project: TestProject) {
  if (process.env.TEST_MONGODB_URI) {
    project.provide('mongoUri', process.env.TEST_MONGODB_URI);
    return;
  }
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  project.provide('mongoUri', mongod.getUri('taskflow-test'));
  return async () => {
    await mongod.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
