import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
