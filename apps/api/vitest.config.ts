// apps/api/vitest.config.ts
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';
import { toTestDatabaseUrl } from './tests/helpers/test-database-url.js';

config();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: toTestDatabaseUrl(process.env['DATABASE_URL']),
      JWT_SECRET: 'test-only-jwt-secret-0123456789abcdef',
    },
  },
});
